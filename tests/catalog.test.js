import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {initialMenu} from '../server/seed.js';
import {cleanMenu,publicMenu} from '../server/catalog.js';
import {createHandler} from '../server/manage.js';
import {hash} from '../server/core.js';
import {createStorage} from '../server/storage.js';
import {createCatalogHandler} from '../api/catalog.js';

const clone=()=>structuredClone(initialMenu);
function configuredMenu(){const menu=clone();for(const branch of menu.branches.slice(0,2)){Object.assign(branch,{name:'Тестовый филиал '+branch.id,address:'Тестовый адрес (только тест)',enabled:true});}return menu;}
const assignment=(patch={})=>({assigned:true,published:true,available:true,price:null,...patch});
const product=()=>({id:'test-product',name:'Тестовый товар (не ассортимент кафе)',price:125.5,weight:'',categoryId:'groceries',desc:'',imageUrl:'',unit:'кг',stock:3.5,available:true,published:true,branchOverrides:{'branch-1':assignment({price:130,stock:2})}});
const morning=Date.parse('2026-10-22T07:59:00Z');

test('legacy catalogs migrate without losing dishes or changing custom prices',()=>{
  const menu=clone();delete menu.schemaVersion;delete menu.products;delete menu.productCategories;delete menu.branches;menu.dishes[0].price=777;
  const migrated=cleanMenu(menu);assert.equal(migrated.schemaVersion,2);assert.equal(migrated.dishes[0].price,777);assert.equal(migrated.branches.length,4);assert(migrated.branches.every(b=>!b.enabled&&!b.address&&!b.name));assert.deepEqual(migrated.products,[]);
  const incomplete=clone();delete incomplete.products;assert.throws(()=>cleanMenu(incomplete),/полный каталог/);
});
test('server rejects invalid products, branch settings, overrides and cross-catalog IDs',()=>{
  for(const mutate of [
    m=>m.branches.pop(),m=>m.branches[1].id='branch-1',m=>m.branches[0].opensAt='25:00',m=>m.branches[0].enabled=true,
    m=>m.products.push({...product(),unit:'коробка'}),m=>m.products.push({...product(),stock:-1}),m=>m.products.push({...product(),stock:0.0001}),
    m=>m.products.push({...product(),id:'plov'}),m=>m.products.push({...product(),price:1.001}),
    m=>m.dishes[0].branchOverrides={'branch-9':assignment()},m=>m.dishes[0].branchOverrides={'branch-1':assignment({assigned:'yes'})},
    m=>m.dishes[0].branchOverrides={'branch-1':assignment({price:-1})},m=>m.products.push({...product(),categoryId:'hot'}),
    m=>m.products.push({...product(),imageUrl:'https://tracking.example/a.png'}),
    m=>m.settings.logoUrl='https://tracking.example/logo.png',
    m=>m.settings.enabledPaymentMethods=['card','crypto'],
    m=>m.settings.showCourierTips='yes'
  ]){const menu=clone();mutate(menu);assert.throws(()=>cleanMenu(menu),{status:400});}
});
test('branch projection applies assignments, independent prices, hiding, stock and global stop-list',()=>{
  const menu=configuredMenu();menu.products=[product()];menu.dishes[0].branchOverrides={'branch-1':assignment({price:460}),'branch-2':assignment({price:470,available:false})};
  const one=publicMenu(menu,{branchId:'branch-1',now:morning}),two=publicMenu(menu,{branchId:'branch-2',now:morning});
  assert.equal(one.dishes.length,1);assert.equal(one.dishes[0].price,460);assert.equal(one.dishes[0].available,true);
  assert.equal(two.dishes[0].price,470);assert.equal(two.dishes[0].available,false);assert.equal(two.products.length,0);
  assert.equal(one.products[0].price,130);assert.equal(one.products[0].stock,2);assert.equal(one.products[0].unit,'кг');
  menu.products[0].branchOverrides['branch-1'].stock=0;assert.equal(publicMenu(menu,{branchId:'branch-1'}).products[0].available,false);
  menu.dishes[0].available=false;assert.equal(publicMenu(menu,{branchId:'branch-1'}).dishes[0].available,false);
  menu.dishes[0].branchOverrides['branch-1'].published=false;assert.equal(publicMenu(menu,{branchId:'branch-1'}).dishes.length,0);
  menu.dishes[0].published=false;assert.equal(publicMenu(menu,{branchId:'branch-2'}).dishes.length,0);
  assert.throws(()=>publicMenu(menu,{branchId:'branch-3'}),{status:404});
});
test('breakfast availability changes exactly at branch cutoff in Moscow even at the same revision',()=>{
  const menu=configuredMenu();const breakfast=menu.dishes.find(d=>d.id==='pancakes');breakfast.branchOverrides={'branch-1':assignment(),'branch-2':assignment()};menu.branches[1].breakfastUntil='12:00';
  assert.equal(publicMenu(menu,{branchId:'branch-1',now:morning}).dishes[0].available,true);
  assert.equal(publicMenu(menu,{branchId:'branch-1',now:Date.parse('2026-10-22T08:00:00Z')}).dishes[0].available,false);
  assert.equal(publicMenu(menu,{branchId:'branch-2',now:Date.parse('2026-10-22T08:00:00Z')}).dishes[0].available,true);
});
test('public projection never exposes private fields, history, assignments or iiko settings',()=>{
  const menu=configuredMenu();menu.admin={passwordHash:'private-password'};menu.attempts={privateIp:'private-ip'};menu.history=[{secret:'private-history'}];menu.branches[0].iiko={organizationId:'private-org',terminalGroupId:'private-terminal',apiKey:'private-key'};menu.products=[product()];
  const data=publicMenu(menu,{branchId:'branch-1'}),serialized=JSON.stringify(data);
  for(const forbidden of ['private-','iiko','branchOverrides','admin','history','attempts'])assert(!serialized.includes(forbidden),forbidden);
  assert.equal(data.branches.length,2);
});
test('TXT price source covers the seeded variants; ambiguous standalone lamb is excluded',async()=>{
  const source=await readFile(new URL('../docs/sources/menu-prices.txt',import.meta.url),'utf8');assert(source.includes('Картошка фри 100гр 100р 200гр 200р'));
  const menu=clone();for(const [key,price,weight] of [['plov',450,'450 г'],['kazan',550,'400 г'],['lamb',600,'400 г'],['shurpa',400,'450 г'],['pancakes',250,'4 шт.'],['fries-100',100,'100 г'],['fries-200',200,'200 г'],['rustic-potato-200',300,'200 г']]){const item=menu.dishes.find(d=>d.id===key);assert.equal(item.price,price);assert.equal(item.weight,weight);}
  assert.equal(menu.dishes.length,45);assert(!menu.dishes.some(d=>d.name.toLowerCase()==='баранина'));assert.equal(menu.products.length,0);assert.equal(menu.dishes.find(d=>d.id==='lamb').imageUrl,'');
});

function client(handler){return async(action,{body,cookie='',method=body?'POST':'GET'}={})=>{
  const result={status:200,headers:{}};const res={setHeader(k,v){result.headers[k]=v;},status(code){result.status=code;return this;},json(data){result.body=data;return result;}};
  await handler({method,query:{action},body,headers:{host:'example.test',origin:'https://example.test','content-type':'application/json','x-sof-admin':'1',cookie}},res);return result;
};}
test('full catalog persists across handler restarts; two sessions cannot overwrite stale versions; restore includes products and branches',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'sof-catalog-'));const file=path.join(directory,'catalog.json');
  try{
    let serial=0;
    const readStore=async()=>{try{const data=JSON.parse(await readFile(file,'utf8'));return {doc:data.doc,etag:data.etag};}catch(error){if(error.code!=='ENOENT')throw error;return {doc:clone(),etag:null};}};
    const writeStore=async(doc,etag)=>{const old=await readStore();if(old.etag!==etag){const error=new Error('Conflict');error.status=409;throw error;}await writeFile(file,JSON.stringify({doc,etag:String(++serial)}));};
    const deps={readStore,writeStore,connected:()=>true,env:{SOF_SETUP_HASH:hash('test-one-time-key'),SOF_SESSION_SECRET:'test-only-do-not-deploy'}};
    let call=client(createHandler(deps));
    assert.equal((await call('save',{body:clone()})).status,401);
    assert.equal((await call('price-list')).status,401);
    const setup=await call('setup',{body:{setupKey:'test-one-time-key',email:'owner@example.test',password:'test-only-long-password'}});assert.equal(setup.status,200);const cookie=setup.headers['Set-Cookie'].split(';')[0];
    const a=(await call('menu',{cookie})).body,b=(await call('menu',{cookie})).body;
    Object.assign(a.branches[0],{name:'Тестовый филиал',address:'Адрес теста',enabled:true});a.products=[product()];a.dishes[0].price=480;a.dishes[0].imageUrl='/api/media?id=12345678-1234-1234-1234-123456789abc.webp';
    assert.equal((await call('save',{body:a,cookie})).status,200);
    assert.equal((await call('save',{body:b,cookie})).status,409);
    call=client(createHandler(deps));const reloaded=(await call('menu',{cookie})).body;
    assert.equal(reloaded.revision,1);assert.equal(reloaded.products[0].price,125.5);assert.equal(reloaded.branches[0].address,'Адрес теста');assert.equal(reloaded.dishes[0].price,480);assert.equal(reloaded.dishes[0].imageUrl,a.dishes[0].imageUrl);assert(!JSON.stringify(reloaded).includes('passwordHash'));
    const oldClient={...reloaded};delete oldClient.schemaVersion;assert.equal((await call('save',{body:oldClient,cookie})).status,409);
    assert.equal((await call('restore',{body:{revision:1,restoreRevision:0},cookie})).status,200);
    const restored=(await call('menu',{cookie})).body;assert.equal(restored.revision,2);assert.deepEqual(restored.products,[]);assert.equal(restored.branches[0].enabled,false);assert.equal(restored.history[1].products.length,1);
    const snapshot=await readStore();await writeStore(snapshot.doc,snapshot.etag);await assert.rejects(()=>writeStore(snapshot.doc,snapshot.etag),{status:409});
  }finally{await rm(directory,{recursive:true,force:true});}
});
test('Blob adapter keeps private storage, conditional writes and conflict reporting',async()=>{
  const calls=[];const doc=configuredMenu();const storage=createStorage({get:async(key,options)=>{calls.push({key,options});return {statusCode:200,stream:new Blob([JSON.stringify(doc)]).stream(),blob:{etag:'test-etag'}};},put:async(...args)=>calls.push(args)});
  const read=await storage.readStore();assert.equal(read.etag,'test-etag');assert.deepEqual(read.doc,doc);assert.deepEqual(calls[0].options,{access:'private',useCache:false,headers:{'Accept-Encoding':'identity'}});
  await storage.writeStore(doc,read.etag);const options=calls[1][2];assert.equal(options.ifMatch,'test-etag');assert.equal(options.access,'private');assert.equal(options.allowOverwrite,true);
  await storage.writeStore(doc,null);assert.equal(calls[2][2].allowOverwrite,false);assert(!('ifMatch' in calls[2][2]));
  class BlobPreconditionFailedError extends Error{};
  await assert.rejects(()=>createStorage({get:async()=>null,put:async()=>{throw new BlobPreconditionFailedError();}}).writeStore(doc,'stale'),{status:409});
  await assert.rejects(()=>createStorage({get:async()=>{throw new Error('storage offline');},put:async()=>{}}).readStore(),/storage offline/);
});
test('public API reports disabled branches, missing storage and unsupported methods honestly',async()=>{
  const invoke=async(handler,{branch,method='GET'}={})=>{const out={};await handler({method,query:branch===undefined?{}:{branch}},{setHeader(){},status(status){out.status=status;return this;},json(body){out.body=body;}});return out;};
  const offline=createCatalogHandler({connected:()=>false,readStore:async()=>{throw new Error('must not read');},now:()=>morning});
  const result=await invoke(offline);assert.equal(result.status,200);assert.equal(result.body.connected,false);assert.equal(result.body.orderingConnected,false);
  assert.equal((await invoke(offline,{branch:'branch-1'})).status,404);assert.equal((await invoke(offline,{branch:'invalid'})).status,400);assert.equal((await invoke(offline,{method:'POST'})).status,405);
  const failed=await invoke(createCatalogHandler({connected:()=>true,readStore:async()=>{throw new Error('offline');}}));assert.equal(failed.body.connected,false);assert.match(failed.body.notice,/недоступно/);
});
