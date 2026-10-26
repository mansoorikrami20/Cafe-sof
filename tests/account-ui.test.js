import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function harness({hash='',mail=true,code=false}={}){
  const {document,window}=parseHTML(fs.readFileSync('dist/admin/index.html','utf8'));
  Object.defineProperty(window.HTMLElement.prototype,'elements',{configurable:true,get(){return new Proxy({},{get:(_,name)=>this.querySelector('[name="'+String(name)+'"]')});}});
  const requests=[],historyCalls=[],storage=[];
  const context={document,window,URLSearchParams,URL,Intl,location:{hash,pathname:'/admin',search:''},history:{replaceState(...args){historyCalls.push(args);}},setTimeout:()=>1,clearTimeout(){},localStorage:{setItem(...args){storage.push(args);}},fetch:async(url,options)=>{
    const action=new URL(url,'https://example.test').searchParams.get('action');requests.push({action,body:options?.body?JSON.parse(options.body):null});
    const body=action==='session'?{authenticated:false,needsSetup:false,emailDeliveryConfigured:mail,emailVerificationRequired:true}:action==='login'?(code?{loginCodeRequired:true,challenge:'TEST-ONLY-CHALLENGE'}:{verificationRequired:true,error:'Подтвердите почту.'}):{ok:true,message:'Тестовый результат.'};
    return {ok:action!=='login'||code,status:action==='login'&&!code?403:200,json:async()=>body};
  }};
  vm.createContext(context);for(const name of ['account-ui.js','admin.js'])vm.runInContext(fs.readFileSync('dist/admin/'+name,'utf8'),context);await tick();
  return {document,window,requests,historyCalls,storage,run:s=>vm.runInContext(s,context)};
}
test('login reveals typed password on demand; recovery and verification retain email and show missing provider honestly',async()=>{
  const h=await harness({mail:false}),input=h.document.querySelector('[name=password]');input.value='TEST-ONLY';
  h.document.querySelector('#showLoginPassword').dispatchEvent(new h.window.Event('click',{bubbles:true}));assert.equal(input.type,'text');
  h.document.querySelector('#showLoginPassword').dispatchEvent(new h.window.Event('click',{bubbles:true}));assert.equal(input.type,'password');
  h.document.querySelector('[name=email]').value='owner@example.test';h.document.querySelector('[data-account=reset]').dispatchEvent(new h.window.Event('click',{bubbles:true}));
  assert.equal(h.document.querySelector('#accountForm [name=email]').value,'owner@example.test');assert(h.document.querySelector('#accountForm button').disabled);assert.match(h.document.body.textContent,/Отправка писем пока не подключена/);assert.equal(h.requests.length,1);
});
test('token fragment is removed, GET never consumes it and reset requires matching password then POST',async()=>{
  const h=await harness({hash:'#reset=TEST-ONLY-LINK'});assert.equal(h.historyCalls.length,1);assert.equal(h.historyCalls[0][2],'/admin');assert.equal(h.requests.length,1);assert.equal(h.requests[0].action,'session');assert(!h.document.body.textContent.includes('TEST-ONLY-LINK'));
  const form=h.document.querySelector('#accountForm');form.elements.password.value='test-long-password';form.elements.confirm.value='different';form.dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(h.requests.length,1);assert.match(form.textContent,/не совпадают/);
  form.elements.confirm.value='test-long-password';form.dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(h.requests[1].action,'reset-password');assert.equal(h.requests[1].body.token,'TEST-ONLY-LINK');assert(h.document.querySelector('#authForm'));assert.equal(h.run('accountLink'),null);assert.deepEqual(h.storage,[]);
});
test('unverified login routes to email proof and verification link never acts on page load',async()=>{
  const h=await harness(),form=h.document.querySelector('#authForm');form.elements.email.value='owner@example.test';form.elements.password.value='test-long-password';form.dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(h.document.querySelector('#accountForm').dataset.mode,'verify');assert.equal(h.document.querySelector('#accountForm [name=email]').value,'owner@example.test');
  const v=await harness({hash:'#verify=TEST-ONLY-LINK'});assert.equal(v.requests.length,1);v.document.querySelector('#accountForm').dispatchEvent(new v.window.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(v.requests[1].action,'verify-email');assert(v.document.querySelector('#authForm'));
});

test('login code is a separate form and stays in memory instead of browser storage',async()=>{
  const h=await harness({code:true}),login=h.document.querySelector('#authForm');
  login.elements.email.value='owner@example.test';login.elements.password.value='test-long-password';
  login.dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));await tick();
  const code=h.document.querySelector('#loginCodeForm');assert(code);assert.equal(code.elements.code.getAttribute('autocomplete'),'one-time-code');
  assert.equal(h.run('loginChallenge'),'TEST-ONLY-CHALLENGE');assert.deepEqual(h.storage,[]);
  code.elements.code.value='123456';code.dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));await tick();
  const verification=h.requests.find(x=>x.action==='verify-login');assert.equal(verification.body.challenge,'TEST-ONLY-CHALLENGE');assert.equal(verification.body.code,'123456');assert.equal(h.run('loginChallenge'),null);assert.deepEqual(h.storage,[]);
});
