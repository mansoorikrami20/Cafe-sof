import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {vaultKey,sealCredentials,openCredentials,createVaultStorage} from '../server/integration-vault.js';
import {createIntegrationsHandler} from '../server/integrations.js';
import {checkIikoAccess,IikoFailure} from '../server/iiko-access.js';
import {signSession} from '../server/core.js';
import {initialMenu} from '../server/seed.js';
const org='12345678-1234-1234-1234-123456789abc';
const sample={appId:'TEST-APP-ID-DO-NOT-DEPLOY',clientSecret:'TEST-SECRET-DO-NOT-DEPLOY',apiKey:'TEST-API-KEY-DO-NOT-DEPLOY'};
function fixture({checkAccess}={}){
  let vault={version:1,revision:0,branches:{}},serial=0,time=Date.parse('2026-10-24T10:00:00Z'),reads=0;
  const env={SOF_SESSION_SECRET:'isolated-session-test-only',SOF_INTEGRATION_SECRET:randomBytes(32).toString('base64')};
  const doc={...structuredClone(initialMenu),admin:{email:'test@example.test',sessionVersion:1}};
  const cookie='sof_admin='+signSession(doc.admin,env.SOF_SESSION_SECRET,time);
  const handler=createIntegrationsHandler({env,now:()=>time,connected:()=>true,readStore:async()=>({doc}),readVault:async()=>{reads++;return {vault:structuredClone(vault),etag:serial?String(serial):null};},writeVault:async(next,etag)=>{if(etag!==(serial?String(serial):null)){const e=new Error('Conflict');e.status=409;throw e;}vault=structuredClone(next);serial++;},checkAccess:checkAccess||(async()=>({organizations:[{id:org,name:'Только тест'}],organizationMatched:false}))});
  const call=async(action,body,{auth=true,headers={},method=body?'POST':'GET'}={})=>{
    const out={status:200,headers:{}};await handler({method,query:{action},body,headers:{cookie:auth?cookie:'',host:'example.test',origin:'https://example.test','content-type':'application/json','x-sof-admin':'1',...headers}},{setHeader(k,v){out.headers[k]=v;},status(v){out.status=v;return this;},json(body){out.body=body;}});return out;
  };
  return {call,env,doc,get:()=>structuredClone(vault),tick:()=>time+=11000,reads:()=>reads};
}
test('vault encryption binds credentials to one branch; tampering and a wrong key fail',()=>{
  const key=vaultKey(randomBytes(32).toString('base64')),sealed=sealCredentials(sample,'branch-1',key);
  assert.deepEqual(openCredentials(sealed,'branch-1',key),sample);for(const value of Object.values(sample))assert(!JSON.stringify(sealed).includes(value));assert.notDeepEqual(sealCredentials(sample,'branch-1',key),sealed);
  assert.throws(()=>openCredentials(sealed,'branch-2',key));assert.throws(()=>openCredentials(sealed,'branch-1',randomBytes(32)));assert.throws(()=>openCredentials({...sealed,tag:randomBytes(16).toString('base64')},'branch-1',key));assert.throws(()=>vaultKey('bad'));
});
test('direct anonymous requests and cross-origin writes are rejected before vault access',async()=>{
  const h=fixture();assert.equal((await h.call(undefined,undefined,{auth:false})).status,401);assert.equal(h.reads(),0);assert.equal((await h.call('save',{revision:0,branchId:'branch-1',...sample},{headers:{origin:'https://other.test'}})).status,403);assert.equal(h.reads(),0);
  assert.equal((await h.call('save',{revision:0,branchId:'branch-missing',...sample})).status,400);assert.equal((await h.call('save',{revision:0,branchId:'branch-1',apiKey:'only-one-field'})).status,400);assert.equal(h.get().revision,0);
});
test('keys save encrypted, GET never reveals them, blanks preserve existing values, and stale revisions conflict',async()=>{
  const h=fixture();const saved=await h.call('save',{revision:0,branchId:'branch-1',...sample});assert.equal(saved.status,200);assert.equal(saved.headers['Cache-Control'],'no-store');assert.equal(saved.body.branches[0].status,'saved');assert.equal(saved.body.branches[0].configured,true);
  for(const value of Object.values(sample)){assert(!JSON.stringify(saved.body).includes(value));assert(!JSON.stringify(h.get()).includes(value));}
  assert.equal((await h.call('save',{revision:0,branchId:'branch-1',...sample})).status,409);
  const replaced=await h.call('save',{revision:1,branchId:'branch-1',appId:'',clientSecret:'',apiKey:'NEW-TEST-KEY'});assert.equal(replaced.status,200);const decoded=openCredentials(h.get().branches['branch-1'].sealed,'branch-1',vaultKey(h.env.SOF_INTEGRATION_SECRET));assert.equal(decoded.apiKey,'NEW-TEST-KEY');assert.equal(decoded.clientSecret,sample.clientSecret);
  const state=await h.call();for(const key of ['sealed','data','iv','tag','token',...Object.values(sample)])assert(!JSON.stringify(state.body).includes('"'+key+'"'));
});
test('authorization checks are rate limited and disconnect revokes stored credentials',async()=>{
  let calls=0;const h=fixture({checkAccess:async()=>{calls++;return {organizations:[{id:org,name:'Тест'}],organizationMatched:false};}});
  await h.call('save',{revision:0,branchId:'branch-1',...sample});let checked=await h.call('check',{revision:1,branchId:'branch-1'});assert.equal(checked.status,200);assert.equal(checked.body.revision,3);assert.equal(checked.body.branches[0].status,'verified');assert.equal(calls,1);
  assert.equal((await h.call('check',{revision:3,branchId:'branch-1'})).status,429);assert.equal(calls,1);h.tick();checked=await h.call('check',{revision:3,branchId:'branch-1'});assert.equal(checked.status,200);assert.equal(calls,2);
  h.doc.branches[0].iiko.organizationId=org;assert.equal((await h.call()).body.branches[0].status,'saved');const removed=await h.call('disconnect',{revision:5,branchId:'branch-1'});assert.equal(removed.status,200);assert.equal(removed.body.branches[0].configured,false);assert(!h.get().branches['branch-1']);assert.equal((await h.call('check',{revision:6,branchId:'branch-1'})).status,400);
});
test('provider errors are sanitized and persist a failed status without exposing keys',async()=>{
  const h=fixture({checkAccess:async()=>{throw new Error(JSON.stringify(sample));}});await h.call('save',{revision:0,branchId:'branch-1',...sample});const result=await h.call('check',{revision:1,branchId:'branch-1'});assert.equal(result.status,502);assert.equal(result.body.branches[0].status,'error');for(const secret of Object.values(sample))assert(!JSON.stringify(result.body).includes(secret));
});
test('replacing and disconnecting credentials do not reset the provider cooldown',async()=>{
  const h=fixture();await h.call('save',{revision:0,branchId:'branch-1',...sample});await h.call('check',{revision:1,branchId:'branch-1'});
  await h.call('save',{revision:3,branchId:'branch-1',...sample});assert.equal((await h.call('check',{revision:4,branchId:'branch-1'})).status,429);
  await h.call('disconnect',{revision:4,branchId:'branch-1'});await h.call('save',{revision:5,branchId:'branch-1',...sample});assert.equal((await h.call('check',{revision:6,branchId:'branch-1'})).status,429);
});
test('disconnect during a provider request wins and the completed check cannot restore credentials',async()=>{
  let release,started;const entered=new Promise(resolve=>{started=resolve;});const h=fixture({checkAccess:async()=>{started();await new Promise(resolve=>{release=resolve;});return {organizations:[{id:org,name:'Тест'}],organizationMatched:false};}});
  await h.call('save',{revision:0,branchId:'branch-1',...sample});const pending=h.call('check',{revision:1,branchId:'branch-1'});await entered;assert.equal((await h.call('disconnect',{revision:2,branchId:'branch-1'})).status,200);release();assert.equal((await pending).status,409);assert(!h.get().branches['branch-1']);
});
test('missing encryption configuration fails closed after owner authentication',async()=>{
  const h=fixture();delete h.env.SOF_INTEGRATION_SECRET;assert.equal((await h.call()).status,503);assert.equal(h.reads(),0);assert.equal((await h.call(undefined,undefined,{auth:false})).status,401);
});
test('iiko adapter uses only fixed HTTPS endpoints, validates organization access, and never returns a token',async()=>{
  const calls=[];const fetchImpl=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.endsWith('access_token')?{token:'TEST-TOKEN-NEVER-RETURN'}:{organizations:[{id:org,name:'Тест'}]}),{status:200});};
  const result=await checkIikoAccess(sample,org,{fetchImpl});assert.equal(result.organizationMatched,true);assert(!JSON.stringify(result).includes('TEST-TOKEN'));assert.deepEqual(calls.map(c=>c.url),['https://api-ru.iiko.services/api/v2/access_token','https://api-ru.iiko.services/api/1/organizations']);assert.equal(calls[0].options.redirect,'error');assert.deepEqual(JSON.parse(calls[0].options.body),sample);assert.equal(calls[1].options.headers.Authorization,'Bearer TEST-TOKEN-NEVER-RETURN');
  await assert.rejects(()=>checkIikoAccess(sample,'ffffffff-ffff-ffff-ffff-ffffffffffff',{fetchImpl}),e=>e instanceof IikoFailure&&e.code==='organization');
  await assert.rejects(()=>checkIikoAccess(sample,'',{fetchImpl:async()=>new Response(JSON.stringify(sample),{status:401})}),e=>e.code==='credentials'&&!e.message.includes(sample.clientSecret));
});
test('vault uses a separate private object and ETag checks',async()=>{
  const calls=[];const adapter=createVaultStorage({get:async(path,options)=>{calls.push({path,options});return null;},put:async(...args)=>calls.push(args)});const empty=await adapter.readVault();assert.equal(empty.vault.revision,0);assert.equal(calls[0].path,'sof-private/integrations-v1.json');assert.deepEqual(calls[0].options,{access:'private',useCache:false,headers:{'Accept-Encoding':'identity'}});
  await adapter.writeVault(empty.vault,'etag');assert.equal(calls[1][2].access,'private');assert.equal(calls[1][2].ifMatch,'etag');assert.equal(calls[1][2].allowOverwrite,true);
});
