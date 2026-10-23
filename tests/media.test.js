import test from 'node:test';
import assert from 'node:assert/strict';
import {createMediaHandler} from '../api/media.js';
import {signSession} from '../server/core.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const secret='isolated-test-only-session-secret',admin={email:'test@example.test',sessionVersion:1};
const cookie='sof_admin='+signSession(admin,secret);
function fixture(){
  const files=new Map();let writes=0;
  const handler=createMediaHandler({connected:()=>true,sessionSecret:()=>secret,readStore:async()=>({doc:{admin}}),put:async(key,data,options)=>{writes++;assert.equal(options.access,'private');assert.equal(options.contentType,'image/png');files.set(key,Buffer.from(data));},get:async(key)=>files.has(key)?{statusCode:200,blob:{contentType:'image/png'},stream:new Blob([files.get(key)]).stream()}:null});
  async function call({method='POST',body={data:png.toString('base64')},query={},headers={}}={}){
    const out={status:200,headers:{},chunks:[]};
    await handler({method,body,query,headers:{host:'example.test',origin:'https://example.test','content-type':'application/json','x-sof-admin':'1',cookie,...headers}},{setHeader(k,v){out.headers[k]=v;},status(code){out.status=code;return this;},json(data){out.body=data;},write(bytes){out.chunks.push(bytes);},end(){}});return out;
  }
  return {call,writes:()=>writes};
}
test('authenticated photos upload privately and can be retrieved by the returned media reference',async()=>{
  const h=fixture();const upload=await h.call();assert.equal(upload.status,200);assert.match(upload.body.imageUrl,/^\/api\/media\?id=[a-f0-9-]{36}\.png$/);assert.equal(h.writes(),1);
  const id=new URL(upload.body.imageUrl,'https://example.test').searchParams.get('id');const image=await h.call({method:'GET',query:{id}});assert.equal(image.status,200);assert.equal(image.headers['Content-Type'],'image/png');assert.deepEqual(Buffer.concat(image.chunks),png);
});
test('photo uploads reject unauthorized, cross-origin, invalid and oversized inputs without writing',async()=>{
  const h=fixture();
  for(const [input,status] of [[{headers:{cookie:''}},401],[{headers:{origin:'https://other.test'}},403],[{headers:{'x-sof-admin':''}},403],[{body:{data:Buffer.from('not-an-image-content').toString('base64')}},400],[{body:{data:Buffer.alloc(2097153).toString('base64')}},400],[{method:'GET',query:{id:'../sof-private/catalog-v1.json'}},404]])assert.equal((await h.call(input)).status,status);
  assert.equal(h.writes(),0);
});
