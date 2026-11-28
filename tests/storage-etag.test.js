import test from 'node:test';
import assert from 'node:assert/strict';
import {createStorage} from '../server/storage.js';
import {createVaultStorage} from '../server/integration-vault.js';
import {initialMenu} from '../server/seed.js';
import {createHandler} from '../server/manage.js';
import {hash,passwordRecord} from '../server/core.js';

function blob(initial){
  let doc=structuredClone(initial),version=1;const calls=[];
  class BlobPreconditionFailedError extends Error{}
  const get=async(key,options)=>{
    calls.push({key,options});
    return {statusCode:200,blob:{etag:options.headers?.['Accept-Encoding']==='identity'?`"v${version}"`:`W/"v${version}"`},stream:new Blob([JSON.stringify(doc)]).stream()};
  };
  const put=async(key,body,options)=>{
    assert.equal(options.access,'private');assert.equal(options.allowOverwrite,true);
    if(options.ifMatch!==`"v${version}"`)throw new BlobPreconditionFailedError();
    doc=JSON.parse(body);version++;
  };
  return {get,put,calls,read:()=>doc};
}
test('catalog and vault request an uncompressed validator; genuine concurrent edits still conflict',async()=>{
  for(const vault of [false,true]){
    const doc=vault?{version:1,revision:0,branches:{}}:structuredClone(initialMenu),b=blob(doc);
    const adapter=vault?createVaultStorage(b):createStorage(b);
    const read=()=>vault?adapter.readVault():adapter.readStore();
    const write=(value,etag)=>vault?adapter.writeVault(value,etag):adapter.writeStore(value,etag);
    const a=await read(),c=await read();assert.equal(a.etag,'"v1"');assert.equal(b.calls[0].options.headers['Accept-Encoding'],'identity');
    const next=structuredClone(doc);next.revision=1;await write(next,a.etag);
    await assert.rejects(write(doc,c.etag),{status:409});assert.equal(b.read().revision,1);
    assert.equal((await read()).etag,'"v2"');
  }
});
test('weak or missing validators fail closed and never fall back to unconditional writes or a later HEAD',async()=>{
  for(const etag of ['',undefined,'W/"abc"']){
    let cancelled=false,writes=0;
    const get=async()=>({statusCode:200,blob:{etag},stream:{async cancel(){cancelled=true;}}});
    const put=async()=>{writes++;};
    await assert.rejects(createStorage({get,put}).readStore(),/Strong storage version/);assert(cancelled);
    await assert.rejects(createVaultStorage({get,put}).readVault(),/Strong storage version/);assert.equal(writes,0);
  }
});
test('recovery persists its hash before sending when Blob would otherwise return a compressed weak ETag',async()=>{
  const doc={...structuredClone(initialMenu),admin:await passwordRecord('owner@example.test','test-password-long-enough')},b=blob(doc),storage=createStorage(b);let sent;
  const env={SOF_SETUP_HASH:hash('test-setup-key'),SOF_SESSION_SECRET:'test-session',RESEND_API_KEY:'test-mail',SOF_EMAIL_FROM:'sender@example.test',SOF_PUBLIC_ORIGIN:'https://example.test'};
  const handler=createHandler({...storage,env,connected:()=>true,sendMail:async data=>{sent=data;assert(b.read().admin.emailSecurity.links.reset);assert(!JSON.stringify(b.read()).includes(data.token));}});
  const out={};await handler({method:'POST',query:{action:'request-reset'},headers:{host:'example.test',origin:'https://example.test','content-type':'application/json','x-sof-admin':'1'},body:{email:'owner@example.test'}},{setHeader(){},status(v){out.status=v;return this;},json(v){out.body=v;}});
  assert.equal(out.status,200);assert.equal(sent.to,'owner@example.test');assert(!JSON.stringify(out.body).includes(sent.token));assert.deepEqual(b.read().dishes,doc.dishes);
});
