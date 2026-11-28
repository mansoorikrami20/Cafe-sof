import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {initialMenu} from '../server/seed.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function harness({offline=false}={}){
  const {document,window}=parseHTML(fs.readFileSync('dist/admin/index.html','utf8'));
  Object.defineProperty(window.HTMLElement.prototype,'elements',{configurable:true,get(){return new Proxy({},{get:(_,name)=>this.querySelector('[name="'+String(name)+'"]')});}});
  let status={revision:0,branches:initialMenu.branches.map((b,index)=>({id:b.id,name:'Тестовый филиал '+index,configured:false,status:'empty',message:'Реквизиты не добавлены.',checkedAt:null,organizations:[]}))};
  const requests=[],storage=[];
  const fetch=async(url,options)=>{
    if(url.startsWith('/api/integrations')){
      if(offline)return {ok:false,status:503,json:async()=>({error:'Тест: хранилище ключей недоступно.'})};
      if(options?.body){const body=JSON.parse(options.body);requests.push({url,body});status.revision++;status.branches[0]={...status.branches[0],configured:!url.includes('disconnect'),status:url.includes('check')?'verified':url.includes('disconnect')?'empty':'saved',message:'Тестовый ответ сервера.'};}
      return {ok:true,json:async()=>structuredClone(status)};
    }
    return {ok:true,json:async()=>url.endsWith('session')?{authenticated:true,email:'test@example.test'}:url==='/api/catalog'?{schemaVersion:2,connected:true,branches:[],dishes:[],products:[]}:structuredClone(initialMenu)};
  };
  const context={document,window,fetch,location:{hash:'',pathname:'/admin',search:''},history:{replaceState(){}},URL,URLSearchParams,Blob,crypto:webcrypto,Intl,FormData,confirm:()=>true,setTimeout:()=>1,clearTimeout(){},localStorage:{setItem(...args){storage.push(args);},getItem(){return null;}}};vm.createContext(context);
  const run=source=>vm.runInContext(source,context);
  for(const file of ['menu-tools.js','iiko-editor.js','catalog-editor.js','account-ui.js','admin.js'])run(fs.readFileSync('dist/admin/'+file,'utf8'));
  await tick();document.querySelector('[data-page=connections]').dispatchEvent(new window.Event('click',{bubbles:true}));await tick();await tick();
  return {document,window,run,requests,storage};
}
test('owner enters credentials, survives a status rerender, saves and checks without secrets in returned UI or local storage',async()=>{
  const h=await harness();assert(h.document.querySelector('#iikoForm'));
  for(const name of ['appId','clientSecret','apiKey']){const input=h.document.querySelector('#iikoForm [name='+name+']');assert.equal(input.type,'password');input.value='ONLY-TEST-'+name;input.dispatchEvent(new h.window.Event('input',{bubbles:true}));}
  h.run('render()');await tick();assert.equal(h.document.querySelector('[name=apiKey]').value,'ONLY-TEST-apiKey');
  h.document.querySelector('#iikoForm').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();assert.equal(h.requests.length,1);assert.equal(h.requests[0].body.apiKey,'ONLY-TEST-apiKey');assert.equal(h.document.querySelector('[name=apiKey]').value,'');assert(!h.document.body.textContent.includes('ONLY-TEST'));assert.deepEqual(h.storage,[]);
  h.document.querySelector('#iikoCheck').dispatchEvent(new h.window.Event('click',{bubbles:true}));await tick();await tick();assert.equal(h.requests[1].body.revision,1);assert.equal(h.requests[1].body.apiKey,undefined);assert(h.requests[1].url.endsWith('action=check'));
});
test('failed vault loading offers a clear retry and no credential form',async()=>{
  const h=await harness({offline:true});assert.match(h.document.body.textContent,/хранилище ключей недоступно/);assert(!h.document.querySelector('#iikoForm'));assert(h.document.querySelector('#iikoReload'));
});
