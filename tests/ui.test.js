import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {initialMenu} from '../server/seed.js';
import {cleanMenu,publicMenu} from '../server/catalog.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function contextFor(html,fetch){
  const {window,document}=parseHTML(html);
  Object.defineProperty(window.HTMLElement.prototype,'clientWidth',{configurable:true,get(){return 380;}});
  Object.defineProperty(window.HTMLElement.prototype,'elements',{configurable:true,get(){const form=this;return new Proxy({},{get:(_,name)=>form.querySelector(`[name="${String(name)}"]`)});}});
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
  const h=contextFor(fs.readFileSync('dist/admin/index.html','utf8'),fetch);h.run(fs.readFileSync('dist/admin/catalog-editor.js','utf8'));h.run(fs.readFileSync('dist/admin/account-ui.js','utf8'));h.run(fs.readFileSync('dist/admin/admin.js','utf8'));await tick();
  assert.equal(h.document.querySelectorAll('#dishRows tr').length,45);assert.equal(h.document.querySelectorAll('#dishRows script').length,0);assert(h.document.querySelector('#dishRows').textContent.includes('<script>unsafe</script>'));
  const search=h.document.querySelector('#dishSearch');search.value='Шурпа';search.dispatchEvent(new h.window.Event('input',{bubbles:true}));assert.equal(h.document.querySelectorAll('#dishRows tr').length,2);
  h.run("editDish('kazan')");assert(h.document.querySelector('#editor').open);assert.equal(h.document.querySelector('#dishForm [name=price]').value,'550');
  h.run("state.menu.dishes[0].price=600;setDirty()");assert(!h.document.querySelector('#saveMenu').disabled);
  h.run("state.page='settings';render()");assert.equal(h.document.querySelectorAll('[data-setting]').length,6);
});
test('unconfigured admin never enables publishing in preview mode',async()=>{
  const fetch=async url=>url.includes('manage')?{ok:false,status:503,json:async()=>({error:'Хранилище не подключено.'})}:{ok:true,json:async()=>({...structuredClone(initialMenu),connected:false})};
  const h=contextFor(fs.readFileSync('dist/admin/index.html','utf8'),fetch);h.run(fs.readFileSync('dist/admin/catalog-editor.js','utf8'));h.run(fs.readFileSync('dist/admin/account-ui.js','utf8'));h.run(fs.readFileSync('dist/admin/admin.js','utf8'));await tick();assert(h.document.querySelector('#previewAdmin'));
  h.document.querySelector('#previewAdmin').dispatchEvent(new h.window.Event('click',{bubbles:true}));await tick();h.run('setDirty()');assert(h.document.querySelector('#saveMenu').disabled);assert.match(h.document.querySelector('.banner').textContent,/не попадут в меню/);
});

async function ownerHarness(menu,fetch){
  const h=contextFor(fs.readFileSync('dist/admin/index.html','utf8'),fetch||(async url=>({ok:true,json:async()=>url.endsWith('session')?{authenticated:true,email:'test@example.test'}:structuredClone(menu)})));
  h.run(fs.readFileSync('dist/admin/catalog-editor.js','utf8'));h.run(fs.readFileSync('dist/admin/account-ui.js','utf8'));h.run(fs.readFileSync('dist/admin/admin.js','utf8'));await tick();return h;
}
test('admin navigation opens QR from the published catalog without discarding an unsaved edit',async()=>{
  const h=await ownerHarness(initialMenu,async url=>({ok:true,json:async()=>url.endsWith('session')?{authenticated:true,email:'test@example.test'}:url==='/api/catalog'?{schemaVersion:2,connected:true,dishes:[],products:[],branches:[]}:structuredClone(initialMenu)}));
  h.run(fs.readFileSync('dist/admin/vendor/qrcode.js','utf8'));h.run(fs.readFileSync('dist/admin/menu-tools.js','utf8'));
  h.run('state.menu.dishes[0].price=477;setDirty()');
  h.document.querySelector('[data-page=qr]').dispatchEvent(new h.window.Event('click',{bubbles:true}));await tick();await tick();
  assert.equal(h.document.querySelectorAll('.qr-card').length,1);assert(h.document.querySelector('.qr-code svg'));assert.equal(h.run('state.menu.dishes[0].price'),477);assert.equal(h.run('state.dirty'),true);
  h.document.querySelector('[data-page=connections]').dispatchEvent(new h.window.Event('click',{bubbles:true}));await tick();await tick();assert.match(h.document.querySelector('.main').textContent,/0 опубликовано/);assert.match(h.document.querySelector('.main').textContent,/Не подключена/);
});
test('cabinet edits four branch slots, rejects incomplete activation and keeps iiko explicitly disconnected',async()=>{
  const h=await ownerHarness(initialMenu);h.run("state.page='branches';render();editBranch('branch-1')");
  assert.equal(h.document.querySelectorAll('[data-branch-edit]').length,4);assert.match(h.document.querySelector('#editor').textContent,/iiko · не подключена/);
  const form=h.document.querySelector('#branchForm');form.querySelector('[name=enabled]').checked=true;
  assert.throws(()=>h.run("applyBranchForm(document.querySelector('#branchForm'))"),/название и адрес/);
  form.querySelector('[name=name]').value='Тестовый филиал';form.querySelector('[name=address]').value='Только тестовый адрес';h.run("applyBranchForm(document.querySelector('#branchForm'));setDirty();render()");
  assert.equal(h.run('state.menu.branches[0].enabled'),true);assert.equal(h.run('state.menu.branches[0].opensAt'),'09:00');assert.match(h.document.querySelector('.branch-grid').textContent,/iiko: не подключена/);
});
test('product editor preserves units, stock, uploaded photo references and four independent assignments',async()=>{
  const menu=structuredClone(initialMenu);menu.products=[{id:'test-product',name:'Только тест',price:12,weight:'',categoryId:'groceries',desc:'',imageUrl:'/api/media?id=12345678-1234-1234-1234-123456789abc.png',unit:'л',stock:0,published:true,available:true,branchOverrides:{'branch-1':{assigned:true,published:true,available:false,price:15,stock:0}}}];
  const h=await ownerHarness(menu);h.run("state.page='products';render();editDish('test-product')");
  assert.match(h.document.querySelector('#dishRows').textContent,/Стоп-лист/);assert.equal(h.document.querySelector('[name=unit]').value,'л');assert.equal(h.document.querySelector('[name=stock]').value,'0');assert.equal(h.document.querySelector('[name="branch-1-price"]').value,'15');assert.equal(h.document.querySelectorAll('.assignment').length,4);assert.match(h.document.querySelector('[name=imageUrl]').value,/123456789abc.png/);
  h.run("state.page='categories';state.categoryKind='products';render();editCategory('groceries')");assert.equal(h.document.querySelector('[name=name]').value,'Продукты');
});
test('failed saves keep the draft and never claim server success',async()=>{
  const h=await ownerHarness(initialMenu,async url=>({ok:!url.endsWith('save'),status:503,json:async()=>url.endsWith('session')?{authenticated:true,email:'test@example.test'}:url.endsWith('save')?{error:'Тест: хранилище недоступно'}:structuredClone(initialMenu)}));
  h.run('state.menu.dishes[0].price=459;setDirty()');await h.run('saveMenu()');
  assert.equal(h.run('state.menu.dishes[0].price'),459);assert.equal(h.run('state.dirty'),true);assert.match(h.document.querySelector('#notice').textContent,/хранилище недоступно/);assert.doesNotMatch(h.document.querySelector('.savebar strong').textContent,/сохранено/);
});
test('editing while a save is in flight keeps the later draft and advances its revision',async()=>{
  let finish;let saved=structuredClone(initialMenu);const h=await ownerHarness(initialMenu,async(url,options)=>{
    if(url.endsWith('session'))return {ok:true,json:async()=>({authenticated:true,email:'test@example.test'})};
    if(url.endsWith('save')){saved={...cleanMenu(JSON.parse(options.body)),revision:1,updatedAt:'2026-10-22T09:00:00Z'};await new Promise(resolve=>{finish=resolve;});return {ok:true,json:async()=>({ok:true,revision:1,updatedAt:saved.updatedAt})};}
    return {ok:true,json:async()=>structuredClone(saved)};
  });
  h.run('state.menu.dishes[0].price=460;setDirty()');const pending=h.run('saveMenu()');await tick();h.run('state.menu.dishes[0].price=470;setDirty()');finish();await pending;
  assert.equal(saved.dishes[0].price,460);assert.equal(h.run('state.menu.dishes[0].price'),470);assert.equal(h.run('state.menu.revision'),1);assert.equal(h.run('state.dirty'),true);
});
test('confirmed save remains confirmed when its follow-up reload fails',async()=>{
  let reads=0;const h=await ownerHarness(initialMenu,async url=>{
    if(url.endsWith('session'))return {ok:true,json:async()=>({authenticated:true,email:'test@example.test'})};
    if(url.endsWith('save'))return {ok:true,json:async()=>({ok:true,revision:1,updatedAt:'2026-10-22T09:00:00Z'})};
    if(++reads>1)throw new Error('test network failure');return {ok:true,json:async()=>structuredClone(initialMenu)};
  });h.run('state.menu.dishes[0].price=461;setDirty()');await h.run('saveMenu()');
  assert.equal(h.run('state.dirty'),false);assert.equal(h.run('state.menu.revision'),1);assert.match(h.document.querySelector('#notice').textContent,/Сохранение подтверждено сервером/);
});
test('storefront refreshes products and availability at the same revision and never falls back to another branch',async()=>{
  const menu=structuredClone(initialMenu);Object.assign(menu.branches[0],{name:'Тестовый филиал',address:'Адрес теста',enabled:true});menu.dishes[0].branchOverrides={'branch-1':{assigned:true,published:true,available:true,price:466}};
  let unavailable=false,fail=false;const h=contextFor(fs.readFileSync('dist/index.html','utf8'),async()=>({ok:!fail,status:404,json:async()=>fail?{error:'Филиал недоступен'}:{...publicMenu(menu,{branchId:'branch-1'}),dishes:[{...menu.dishes[0],available:!unavailable}],connected:true}}));
  h.context.location.search='?branch=branch-1';h.run(fs.readFileSync('dist/app.js','utf8'));h.run(fs.readFileSync('dist/catalog.js','utf8'));await tick();assert.equal(h.document.querySelectorAll('.food').length,1);
  h.run("change('plov',1)");unavailable=true;await h.run('refreshCatalog(true)');assert(h.document.querySelector('.sold-out'));assert.equal(h.run('count()'),0);
  fail=true;await h.run('refreshCatalog(true)');assert.equal(h.document.querySelectorAll('.food').length,0);assert.match(h.document.querySelector('#toast').textContent,/Филиал недоступен/);
});
