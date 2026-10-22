import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {initialMenu} from '../server/seed.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function contextFor(html,fetch){
  const {window,document}=parseHTML(html);
  Object.defineProperty(window.HTMLElement.prototype,'clientWidth',{configurable:true,get(){return 380;}});
  Object.defineProperty(window.HTMLFormElement.prototype,'elements',{configurable:true,get(){const form=this;return new Proxy({},{get:(_,name)=>form.querySelector(`[name="${String(name)}"]`)});}});
  Object.defineProperty(window.HTMLInputElement.prototype,'files',{configurable:true,get(){return [];}});
  window.HTMLElement.prototype.showModal=function(){this.open=true;this.setAttribute('open','');};
  window.HTMLElement.prototype.close=function(){this.open=false;this.removeAttribute('open');};
  window.scrollTo=()=>{};
  const context={window,document,fetch,location:{hash:'',pathname:'/admin',search:''},history:{replaceState(){}},localStorage:{getItem(){return null;},setItem(){}},URL,URLSearchParams,Blob,crypto:webcrypto,Intl,FormData,confirm:()=>true,setInterval:()=>1,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},matchMedia:()=>({matches:true}),console};
  vm.createContext(context);return {context,window,document,run:source=>vm.runInContext(source,context)};
}
test('storefront reads shared catalog, renders edited names as text and disables stop-list items',async()=>{
  const menu=structuredClone(initialMenu);menu.dishes[0].name='<img src=x onerror=alert(1)>';menu.dishes[0].available=false;menu.dishes[0].price=525;
  const h=contextFor(fs.readFileSync('dist/index.html','utf8'),async()=>({ok:true,json:async()=>({...menu,connected:true})}));
  h.run(fs.readFileSync('dist/app.js','utf8'));assert.equal(h.document.querySelectorAll('.food').length,6);
  h.run(fs.readFileSync('dist/catalog.js','utf8'));await tick();
  assert.equal(h.document.querySelector('.food h3').textContent,'<img src=x onerror=alert(1)>');assert.equal(h.document.querySelectorAll('.food h3 img').length,0);assert(h.document.querySelector('.food .sold-out'));assert(!h.document.querySelector('.food').querySelector('[data-delta]'));
  h.run("change('plov',1)");assert.equal(h.run("qty('plov')"),0);
  h.run("change('kazan',1)");assert.equal(h.run('total()'),550);assert(h.document.querySelector('.cart-floating'));
});
test('admin loads catalog, filters dishes, opens a prefilled editor and escapes names',async()=>{
  const menu=structuredClone(initialMenu);menu.dishes[0].name='<script>unsafe</script>';
  const calls=[];const fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.endsWith('session')?{authenticated:true,email:'owner@example.com'}:structuredClone(menu)};};
  const h=contextFor(fs.readFileSync('dist/admin/index.html','utf8'),fetch);h.run(fs.readFileSync('dist/admin/admin.js','utf8'));await tick();
  assert.equal(h.document.querySelectorAll('#dishRows tr').length,6);assert.equal(h.document.querySelectorAll('#dishRows script').length,0);assert(h.document.querySelector('#dishRows').textContent.includes('<script>unsafe</script>'));
  const search=h.document.querySelector('#dishSearch');search.value='Шурпа';search.dispatchEvent(new h.window.Event('input',{bubbles:true}));assert.equal(h.document.querySelectorAll('#dishRows tr').length,2);
  h.run("editDish('kazan')");assert(h.document.querySelector('#editor').open);assert.equal(h.document.querySelector('#dishForm [name=price]').value,'550');
  h.run("state.menu.dishes[0].price=600;setDirty()");assert(!h.document.querySelector('#saveMenu').disabled);
  h.run("state.page='settings';render()");assert.equal(h.document.querySelectorAll('[data-setting]').length,6);
});
test('unconfigured admin never enables publishing in preview mode',async()=>{
  const fetch=async url=>url.includes('manage')?{ok:false,status:503,json:async()=>({error:'Хранилище не подключено.'})}:{ok:true,json:async()=>({...structuredClone(initialMenu),connected:false})};
  const h=contextFor(fs.readFileSync('dist/admin/index.html','utf8'),fetch);h.run(fs.readFileSync('dist/admin/admin.js','utf8'));await tick();assert(h.document.querySelector('#previewAdmin'));
  h.document.querySelector('#previewAdmin').dispatchEvent(new h.window.Event('click',{bubbles:true}));await tick();h.run('setDirty()');assert(h.document.querySelector('#saveMenu').disabled);assert.match(h.document.querySelector('.banner').textContent,/не попадут в меню/);
});
