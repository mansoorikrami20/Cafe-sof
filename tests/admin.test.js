import test from 'node:test';
import assert from 'node:assert/strict';
import {initialMenu} from '../server/seed.js';
import {cleanMenu,publicMenu,hash,passwordRecord,signSession,verifySession} from '../server/core.js';
import {createHandler} from '../server/manage.js';
const env={SOF_REQUIRE_LOGIN_CODE:'0',SOF_REQUIRE_VERIFIED_EMAIL:'0',SOF_SETUP_HASH:hash('test-setup-key-with-32-characters'),SOF_SESSION_SECRET:'test-only-session-secret-not-for-deployment'};
function harness(){
  let stored=null,version=0;
  const readStore=async()=>({doc:structuredClone(stored||initialMenu),etag:stored?'"'+version+'"':null});
  const writeStore=async(doc,etag)=>{if(etag!==(stored?'"'+version+'"':null)){const e=new Error('Conflict');e.status=409;throw e;}stored=structuredClone(doc);version++;};
  const handle=createHandler({passwordCheck:async()=>{},env,connected:()=>true,readStore,writeStore});
  async function call(action,{method='GET',body,cookie='',origin='https://example.test'}={}){const headers={host:'example.test',origin,'content-type':'application/json','x-sof-admin':'1',cookie,'x-forwarded-for':'203.0.113.1'};const output={headers:{},statusCode:200};const res={setHeader(k,v){output.headers[k]=v;},status(v){output.statusCode=v;return this;},json(v){output.body=v;return output;}};await handle({method,query:{action},body,headers},res);return output;}
  return {call,read:()=>stored,corrupt:()=>{version++;}};
}
test('menu rejects invalid prices, duplicate IDs, unknown categories and unsafe image URLs',()=>{
  for(const patch of [{price:-1},{price:NaN},{price:1.001},{categoryId:'missing'},{imageUrl:'javascript:alert(1)'},{imageUrl:'https://tracking.test/x.png'},{published:'true'}]){
    const menu=structuredClone(initialMenu);Object.assign(menu.dishes[0],patch);assert.throws(()=>cleanMenu(menu));
  }
  const menu=structuredClone(initialMenu);menu.dishes[0].price=1.1;assert.equal(cleanMenu(menu).dishes[0].price,1.1);menu.dishes[1].id=menu.dishes[0].id;assert.throws(()=>cleanMenu(menu));
});
test('public catalog excludes hidden dishes, credentials, rate limits and history',()=>{
  const doc=structuredClone(initialMenu);doc.dishes[0].published=false;doc.admin={passwordHash:'secret'};doc.history=[{admin:'secret'}];doc.attempts={};const out=publicMenu(doc);assert(!out.dishes.some(d=>d.id==='plov'));assert(!('admin' in out));assert(!('history' in out));assert(!('attempts' in out));
});
test('session signatures reject forged, expired and revoked sessions',async()=>{
  const admin=await passwordRecord('owner@example.com','long password for tests');const token=signSession(admin,env.SOF_SESSION_SECRET,1000000);assert(verifySession(token,admin,env.SOF_SESSION_SECRET,1000001));assert(!verifySession(token+'x',admin,env.SOF_SESSION_SECRET,1000001));assert(!verifySession(token,admin,'wrong secret',1000001));assert(!verifySession(token,{...admin,sessionVersion:2},env.SOF_SESSION_SECRET,1000001));assert(!verifySession(token,admin,env.SOF_SESSION_SECRET,1000000+8*3600000));
});
test('setup is secret protected, one-time and returns HttpOnly session; unauthenticated writes fail',async()=>{
  const h=harness();assert.equal((await h.call('save',{method:'POST',body:initialMenu})).statusCode,401);assert.equal((await h.call('setup',{method:'POST',body:{setupKey:'wrong'}})).statusCode,403);
  const response=await h.call('setup',{method:'POST',body:{setupKey:'test-setup-key-with-32-characters',email:'owner@example.com',password:'long password for tests'}});assert.equal(response.statusCode,200);assert.match(response.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);assert.equal((await h.call('setup',{method:'POST',body:{setupKey:'test-setup-key-with-32-characters'}})).statusCode,409);
});
test('authenticated edits persist, stale revisions and cross-origin writes fail, logout revokes session',async()=>{
  const h=harness();const setup=await h.call('setup',{method:'POST',body:{setupKey:'test-setup-key-with-32-characters',email:'owner@example.com',password:'long password for tests'}});const cookie=setup.headers['Set-Cookie'].split(';')[0];
  const menu=(await h.call('menu',{cookie})).body;menu.dishes[0].name='<img src=x onerror=alert(1)>';menu.dishes[0].price=525;
  assert.equal((await h.call('save',{method:'POST',body:menu,cookie,origin:'https://attacker.test'})).statusCode,403);
  assert.equal((await h.call('save',{method:'POST',body:menu,cookie})).statusCode,200);assert.equal(h.read().dishes[0].price,525);assert.equal(h.read().history.length,1);assert(!('admin' in h.read().history[0]));assert.equal((await h.call('save',{method:'POST',body:menu,cookie})).statusCode,409);
  assert.equal((await h.call('restore',{method:'POST',cookie,body:{revision:1,restoreRevision:0}})).statusCode,200);assert.equal(h.read().dishes[0].price,450);
  assert.equal((await h.call('logout',{method:'POST',cookie,body:{}})).statusCode,200);assert.equal((await h.call('menu',{cookie})).statusCode,401);
});
test('login has persistent attempt limit and never returns stored password data',async()=>{
  const h=harness();await h.call('setup',{method:'POST',body:{setupKey:'test-setup-key-with-32-characters',email:'owner@example.com',password:'long password for tests'}});
  for(let i=0;i<8;i++)assert.equal((await h.call('login',{method:'POST',body:{email:'owner@example.com',password:'incorrect'}})).statusCode,401);
  assert.equal((await h.call('login',{method:'POST',body:{email:'owner@example.com',password:'long password for tests'}})).statusCode,429);
  const session=await h.call('session');assert.equal(session.body.authenticated,false);assert(!JSON.stringify(session.body).includes('passwordHash'));
});
