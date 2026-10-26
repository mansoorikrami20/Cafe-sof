import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {parseHTML} from 'linkedom';

function harness(){
  const {window,document}=parseHTML(fs.readFileSync('dist/index.html','utf8'));const data=new Map();
  window.HTMLElement.prototype.showModal=function(){this.open=true;};window.HTMLElement.prototype.close=function(){this.open=false;};window.scrollTo=()=>{};
  const context={window,document,Intl,FormData,URL,URLSearchParams,localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},matchMedia:()=>({matches:true}),console};
  vm.createContext(context);vm.runInContext(fs.readFileSync('dist/app.js','utf8'),context);
  return {window,document,data,run:s=>vm.runInContext(s,context)};
}
test('demo checkout and disconnected phone login do not ask for unnecessary personal data',()=>{
  const h=harness();h.run("change('plov',1);navigate('checkout')");
  for(const name of ['phone','name','address','comment'])assert(!h.document.querySelector(`#checkoutForm [name=${name}]`));
  assert.match(h.document.querySelector('#checkoutForm').textContent,/не запрашиваются/);
  h.run("openAccountSheet('phone')");assert(!h.document.querySelector('#accountDialog input'));assert.match(h.document.querySelector('#accountDialog').textContent,/не подключён/);
});
test('profile persistence is an unchecked separate choice; opting out removes an old persisted profile',()=>{
  const h=harness();h.data.set('sof-local-profile','old profile');h.run("openAccountSheet('details')");
  let form=h.document.querySelector('#localProfileForm');assert(!form.querySelector('[name=remember]').hasAttribute('checked'));
  form.querySelector('[name=name]').value='Test';form.querySelector('[name=email]').value='';
  form.dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));assert(!h.data.has('sof-local-profile'));
  h.run("openAccountSheet('details')");form=h.document.querySelector('#localProfileForm');form.querySelector('[name=remember]').checked=true;
  form.dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(JSON.parse(h.data.get('sof-local-profile')).name,'Test');
});
test('local data erasure removes guest data and resets visible profile/cart without touching other origin data',()=>{
  const h=harness();h.run("change('plov',1);localProfile.name='Test';localProfile.email='test@example.test';localProfile.address='test address'");
  for(const k of ['sof-feedback','sof-local-profile'])h.data.set(k,'test');h.data.set('unrelated','keep');
  h.document.querySelector('#clearLocalData').dispatchEvent(new h.window.Event('click',{bubbles:true}));
  assert.equal(h.run('count()'),0);assert.equal(h.run('localProfile.name'), '');assert.equal(h.data.get('unrelated'),'keep');
  for(const k of ['sof-prototype','sof-feedback','sof-local-profile'])assert(!h.data.has(k));
});
test('keyboard Space opens a labelled product dialog; information is reachable from the storefront',()=>{
  const h=harness();const product=h.document.querySelector('[role=button][data-product]');
  const event=new h.window.Event('keydown',{bubbles:true,cancelable:true});event.key=' ';product.dispatchEvent(event);
  const dialog=h.document.querySelector('#productDialog');assert(dialog.open);assert(h.document.getElementById(dialog.getAttribute('aria-labelledby')));
  assert(h.document.querySelector('a[href="/information.html"]'));assert(h.document.querySelector('a[href="#view"]'));
  const {document}=parseHTML(fs.readFileSync('dist/information.html','utf8'));
  for(const id of ['privacy','terms','cookies','refunds'])assert(document.getElementById(id));
});
