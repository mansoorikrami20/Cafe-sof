import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../server/manage.js';
import {initialMenu} from '../server/seed.js';
import {hash,passwordRecord,publicMenu,signSession,verifySession} from '../server/core.js';
import {mailConfig,sendAccountEmail} from '../server/account-email.js';
import {createMediaHandler} from '../api/media.js';
import {createIntegrationsHandler} from '../server/integrations.js';
const password='test-only-password-before-reset';
const env={SOF_REQUIRE_LOGIN_CODE:'0',SOF_REQUIRE_VERIFIED_EMAIL:'0',SOF_SESSION_SECRET:'TEST-ONLY-SESSION',SOF_SETUP_HASH:hash('TEST-ONLY-SETUP'),RESEND_API_KEY:'TEST-ONLY-MAIL',SOF_EMAIL_FROM:'test@example.test',SOF_PUBLIC_ORIGIN:'https://example.test',SOF_REQUIRE_VERIFIED_EMAIL:'1'};
async function harness({mail=true,owner=true}={}){
  let doc={...structuredClone(initialMenu),...(owner?{admin:await passwordRecord('owner@example.test',password)}:{})},version=1,time=1792800000000;
  const mails=[],settings={...env,...(!mail?{RESEND_API_KEY:''}:{})};
  const readStore=async()=>({doc:structuredClone(doc),etag:String(version)});
  const writeStore=async(next,etag)=>{if(etag!==String(version)){const e=new Error();e.status=409;throw e;}doc=structuredClone(next);version++;};
  const handle=createHandler({passwordCheck:async()=>{},env:settings,connected:()=>true,readStore,writeStore,now:()=>time,sendMail:async data=>mails.push(data)});
  async function call(action,body,{cookie='',origin='https://example.test',ip='192.0.2.1',method=body?'POST':'GET'}={}){
    const out={status:200,headers:{}};await handle({method,query:{action},body,headers:{host:'example.test',origin,cookie,'x-sof-admin':'1','content-type':'application/json','x-vercel-forwarded-for':ip}},{setHeader(k,v){out.headers[k]=v;},status(v){out.status=v;return this;},json(v){out.body=v;}});return out;
  }
  return {call,mails,readStore,writeStore,env:settings,read:()=>doc,advance:n=>{time+=n;},now:()=>time,oldCookie:()=>`sof_admin=${signSession(doc.admin,env.SOF_SESSION_SECRET,time)}`};
}
test('unverified owner and old cookie cannot access menu, iiko or upload with enforcement',async()=>{
  const h=await harness(),cookie=h.oldCookie();assert.equal((await h.call('menu',undefined,{cookie})).status,401);
  const login=await h.call('login',{email:'owner@example.test',password});assert.equal(login.status,403);assert.equal(login.body.verificationRequired,true);assert(!login.headers['Set-Cookie']);
  assert(!verifySession(cookie.slice(10),h.read().admin,env.SOF_SESSION_SECRET,h.now(),true));
  const out={},res={setHeader(){},status(v){out.status=v;return this;},json(v){out.body=v;}};
  const req={method:'POST',headers:{host:'example.test',origin:'https://example.test',cookie,'x-sof-admin':'1','content-type':'application/json'},body:{},query:{}};
  await createMediaHandler({connected:()=>true,readStore:h.readStore,sessionSecret:()=>env.SOF_SESSION_SECRET,requireVerifiedEmail:()=>true,now:h.now})(req,res);assert.equal(out.status,401);
  await createIntegrationsHandler({readStore:h.readStore,env,now:h.now,connected:()=>true})(req,res);assert.equal(out.status,401);
});
test('verification requires explicit action, cannot reset password and invalidates all old sessions',async()=>{
  const h=await harness(),old=h.oldCookie();const sent=await h.call('request-verification',{email:'OWNER@example.test'});assert.equal(sent.status,200);assert.equal(h.mails.length,1);const token=h.mails[0].token;
  assert(!JSON.stringify(h.read()).includes(token));assert(!JSON.stringify(sent.body).includes(token));
  assert.equal((await h.call('reset-password',{token,password:'replacement-test-password'})).status,400);
  assert.equal((await h.call('verify-email',{token},{origin:'https://evil.test'})).status,403);
  assert.equal((await h.call('verify-email',{token})).status,200);assert(h.read().admin.emailVerifiedAt);assert(!verifySession(old.slice(10),h.read().admin,env.SOF_SESSION_SECRET,h.now(),true));
  assert.equal((await h.call('verify-email',{token})).status,400);
  const login=await h.call('login',{email:'owner@example.test',password});assert.equal(login.status,200);assert.match(login.headers['Set-Cookie'],/HttpOnly; Secure/);
  assert.equal((await h.call('menu',undefined,{cookie:login.headers['Set-Cookie'].split(';')[0]})).status,200);
});
test('reset works during login rate limit, verifies email, revokes sessions and preserves menu',async()=>{
  const h=await harness(),old=h.oldCookie(),menu=structuredClone(h.read().dishes);
  for(let i=0;i<8;i++)await h.call('login',{email:'owner@example.test',password:'wrong'});
  assert.equal((await h.call('login',{email:'owner@example.test',password})).status,429);
  await h.call('request-reset',{email:'owner@example.test'});const token=h.mails[0].token;
  assert.equal((await h.call('reset-password',{token,password:'short'})).status,400);
  const result=await h.call('reset-password',{token,password:'replacement-test-password'});assert.equal(result.status,200);assert.match(result.headers['Set-Cookie'],/Max-Age=0/);
  assert.deepEqual(h.read().dishes,menu);assert(h.read().admin.emailVerifiedAt);assert(!verifySession(old.slice(10),h.read().admin,env.SOF_SESSION_SECRET,h.now()));
  assert.equal((await h.call('reset-password',{token,password:'another-test-password'})).status,400);
  assert.equal((await h.call('login',{email:'owner@example.test',password})).status,401);
  assert.equal((await h.call('login',{email:'owner@example.test',password:'replacement-test-password'})).status,200);
  assert(!JSON.stringify(publicMenu(h.read())).includes('emailSecurity'));
});
test('expired and replaced tokens fail; simultaneous use consumes a token only once',async()=>{
  const h=await harness();await h.call('request-reset',{email:'owner@example.test'});const first=h.mails[0].token;
  h.advance(61000);await h.call('request-reset',{email:'owner@example.test'});const second=h.mails[1].token;
  assert.equal((await h.call('reset-password',{token:first,password:'replacement-test-password'})).status,400);
  const responses=await Promise.all([h.call('reset-password',{token:second,password:'replacement-test-password-A'}),h.call('reset-password',{token:second,password:'replacement-test-password-B'})]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,400]);
  h.advance(61000);await h.call('request-reset',{email:'owner@example.test'});h.advance(15*60000);assert.equal((await h.call('reset-password',{token:h.mails.at(-1).token,password:'replacement-test-password'})).status,400);
});
test('unknown addresses receive same response; quotas persist and cooldown caps actual sends',async()=>{
  const h=await harness();const unknown=await h.call('request-reset',{email:'unknown@example.test'});assert.equal(h.mails.length,0);
  const known=await h.call('request-reset',{email:'owner@example.test'});assert.deepEqual(known.body,unknown.body);assert.equal(h.mails.length,1);
  await h.call('request-verification',{email:'owner@example.test'});assert.equal(h.mails.length,1);
  for(let i=0;i<2;i++)await h.call('request-reset',{email:'unknown@example.test'});
  assert.equal((await h.call('request-reset',{email:'owner@example.test'})).status,429);
  for(let i=0;i<10;i++){h.advance(61000);await h.call('request-reset',{email:'owner@example.test'},{ip:'192.0.2.'+(i+2)});}assert.equal(h.mails.length,6);
});
test('setup gives no session before email proof; missing mail configuration is explicit',async()=>{
  const h=await harness({owner:false});const setup=await h.call('setup',{setupKey:'TEST-ONLY-SETUP',email:'owner@example.test',password});assert.equal(setup.status,200);assert.equal(setup.body.verificationRequired,true);assert(!setup.headers['Set-Cookie']);
  const missing=await harness({mail:false,owner:false});assert.equal((await missing.call('setup',{setupKey:'TEST-ONLY-SETUP',email:'owner@example.test',password})).status,503);assert(!missing.read().admin);
  assert.equal((await missing.call('request-reset',{email:'owner@example.test'})).status,503);
  for(const origin of ['http://example.test','https://example.test/evil','https://user@example.test','https://example.test/#evil'])assert.equal(mailConfig({...env,SOF_PUBLIC_ORIGIN:origin}),null);
});
test('email adapter fixes host and canonical fragment URL; disables redirects and sanitizes errors',async()=>{
  const config=mailConfig(env);let captured;
  await sendAccountEmail({to:'owner@example.test',purpose:'reset',token:'TEST-TOKEN',id:'TEST-ID',config},async(url,options)=>{captured={url,options};return new Response('{}');});
  assert.equal(captured.url,'https://api.resend.com/emails');assert.equal(captured.options.redirect,'error');assert(captured.options.signal);
  const body=JSON.parse(captured.options.body);assert.match(body.text,/https:\/\/example.test\/admin#reset=TEST-TOKEN/);assert(!body.html);assert.deepEqual(body.to,['owner@example.test']);
  await assert.rejects(sendAccountEmail({to:'owner@example.test',purpose:'verify',token:'TEST-TOKEN',id:'TEST-ID',config},async()=>new Response('secret provider error',{status:403})),e=>e.status===503&&!e.message.includes('secret'));
});
