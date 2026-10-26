import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createHandler} from '../server/manage.js';
import {initialMenu} from '../server/seed.js';
import {hash,passwordRecord} from '../server/core.js';
import {sendAccountEmail} from '../server/account-email.js';
import {checkPasswordSafety} from '../server/password-safety.js';

const password='test-only-unique-long-passphrase';
async function harness(){
  let time=1800000000000,revision=1;
  let doc={...structuredClone(initialMenu),admin:{...await passwordRecord('owner@example.test',password),emailVerifiedAt:'test'}};
  const env={SOF_SESSION_SECRET:'test-only-not-a-secret-key',SOF_SETUP_HASH:hash('test-setup'),SOF_PUBLIC_ORIGIN:'https://example.test',SOF_EMAIL_FROM:'test@example.test',RESEND_API_KEY:'test-only-mail',SOF_REQUIRE_VERIFIED_EMAIL:'1'};
  const mails=[];
  const readStore=async()=>({doc:structuredClone(doc),etag:String(revision)});
  const writeStore=async(value,etag)=>{if(etag!==String(revision))throw Object.assign(new Error('Conflict'),{status:409});doc=structuredClone(value);revision++;};
  const deps={env,readStore,writeStore,connected:()=>true,now:()=>time,passwordCheck:async()=>{},sendMail:async message=>mails.push(message)};
  let handler=createHandler(deps);
  async function call(action,body,cookie=''){
    const result={headers:{}};
    await handler({method:body?'POST':'GET',query:{action},body,headers:{host:'example.test',origin:'https://example.test','content-type':'application/json','x-sof-admin':'1','x-vercel-forwarded-for':'192.0.2.4',cookie}},
      {setHeader(k,v){result.headers[k]=v;},status(v){result.status=v;return this;},json(v){result.body=v;}});
    return result;
  }
  return {call,mails,env,read:()=>doc,advance:n=>time+=n,restart:()=>{handler=createHandler(deps);},revoke:()=>{doc.admin.sessionVersion++;}};
}

test('password alone cannot access admin; one-time code grants cookie only after verification and survives a handler restart',async()=>{
  const h=await harness();const start=await h.call('login',{email:'owner@example.test',password});
  assert.equal(start.status,200);assert.equal(start.body.loginCodeRequired,true);assert(!start.headers['Set-Cookie']);
  assert.equal((await h.call('menu')).status,401);
  assert.equal(h.mails.length,1);assert.match(h.mails[0].code,/^\d{6}$/);
  const stored=JSON.stringify(h.read());assert(!stored.includes(start.body.challenge));assert(!stored.includes(`"code":"${h.mails[0].code}"`));
  h.restart();const grant=await h.call('verify-login',{challenge:start.body.challenge,code:h.mails[0].code});
  assert.equal(grant.status,200);assert.match(grant.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await h.call('menu',undefined,grant.headers['Set-Cookie'].split(';')[0])).status,200);
  assert.equal((await h.call('verify-login',{challenge:start.body.challenge,code:h.mails[0].code})).status,400);
});
test('five incorrect codes exhaust the challenge; code delivery is persistently throttled',async()=>{
  const h=await harness();const start=await h.call('login',{email:'owner@example.test',password});
  const wrong=h.mails[0].code==='000000'?'111111':'000000';
  for(let i=0;i<5;i++){h.restart();assert.equal((await h.call('verify-login',{challenge:start.body.challenge,code:wrong})).status,400);}
  assert.equal((await h.call('verify-login',{challenge:start.body.challenge,code:h.mails[0].code})).status,400);
  assert.equal((await h.call('login',{email:'owner@example.test',password})).status,429);assert.equal(h.mails.length,1);
});
test('expired and revoked challenges fail; concurrent replay gives at most one session',async()=>{
  for(const revoke of [false,true]){
    const h=await harness();const start=await h.call('login',{email:'owner@example.test',password});
    if(revoke)h.revoke();else h.advance(300000);
    assert.equal((await h.call('verify-login',{challenge:start.body.challenge,code:h.mails[0].code})).status,400);
  }
  const h=await harness(),start=await h.call('login',{email:'owner@example.test',password});
  const results=await Promise.all([1,2].map(()=>h.call('verify-login',{challenge:start.body.challenge,code:h.mails[0].code})));
  assert.deepEqual(results.map(x=>x.status).sort(),[200,400]);
});
test('missing mail provider never falls back to password-only login',async()=>{
  const h=await harness();h.env.RESEND_API_KEY='';
  const result=await h.call('login',{email:'owner@example.test',password});assert.equal(result.status,503);assert(!result.headers['Set-Cookie']);
});
test('breach check sends only a padded five-character hash-prefix query and rejects a known breached password',async()=>{
  const digest=createHash('sha1').update(password).digest('hex').toUpperCase();let request;
  await assert.rejects(checkPasswordSafety(password,{fetcher:async(url,options)=>{request={url,options};return {ok:true,text:async()=>`${digest.slice(5)}:12\r\n${'0'.repeat(35)}:0`};}}),e=>e.status===400);
  assert.equal(request.url,`https://api.pwnedpasswords.com/range/${digest.slice(0,5)}`);assert.equal(request.options.headers['Add-Padding'],'true');assert(!JSON.stringify(request).includes(password));
});
test('short passwords never leave server; padding zero counts are not breaches; outages fail closed',async()=>{
  let calls=0;await assert.rejects(checkPasswordSafety('short',{fetcher:async()=>{calls++;}}),e=>e.status===400);assert.equal(calls,0);
  const digest=createHash('sha1').update(password).digest('hex').toUpperCase();
  await checkPasswordSafety(password,{fetcher:async()=>({ok:true,text:async()=>`${digest.slice(5)}:0`})});
  for(const fetcher of [async()=>{throw new Error('network');},async()=>({ok:false}),async()=>({ok:true,text:async()=>'<html>unavailable</html>'})])await assert.rejects(checkPasswordSafety(password,{fetcher}),e=>e.status===503);
});

test('transactional login mail contains the code and never constructs a reset/verification URL',async()=>{
  let payload;await sendAccountEmail({to:'owner@example.test',purpose:'login',code:'123456',id:'test-only',config:{origin:'https://example.test',from:'sender@example.test',key:'test-only'}},async(url,options)=>{payload=JSON.parse(options.body);return {ok:true};});
  assert.match(payload.text,/123456/);assert.match(payload.text,/5 минут/);assert(!payload.text.includes('undefined'));assert(!payload.text.includes('#login='));
});
