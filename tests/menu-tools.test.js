import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import jsQR from 'jsqr';
import {parseHTML} from 'linkedom';
function harness(fetch){
  const {window,document}=parseHTML('<html><body></body></html>');
  const state={page:'qr',dirty:false};let copied='';
  const context={document,state,fetch,render(){},escape:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),heading:()=>'',notify(){},navigator:{clipboard:{async writeText(value){copied=value;}}},URL,Blob,setTimeout};
  vm.createContext(context);vm.runInContext(fs.readFileSync('dist/admin/vendor/qrcode.js','utf8'),context);vm.runInContext(fs.readFileSync('dist/admin/menu-tools.js','utf8'),context);
  return {document,state,run:source=>vm.runInContext(source,context),copied:()=>copied};
}
const published={schemaVersion:2,connected:true,dishes:[],products:[],branches:[{id:'branch-1',name:'<img src=x onerror=alert(1)>'}]};
function decode(svg){
  const size=Number(svg.match(/viewBox="0 0 (\d+) /)[1]),scale=8,width=size*scale;
  const data=new Uint8ClampedArray(width*width*4).fill(255);
  for(const match of svg.matchAll(/M(\d+) (\d+)h1v1h-1z/g)){
    const x=Number(match[1]),y=Number(match[2]);
    for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){const i=((y*scale+dy)*width+x*scale+dx)*4;data[i]=data[i+1]=data[i+2]=0;}
  }
  return jsQR(data,width,width)?.data;
}
test('exported SVG decodes to the exact public menu URL with no activation or admin information',()=>{
  const h=harness();
  for(const id of ['', 'branch-1','branch-4']){
    const link=h.run(`menuLink('${id}')`),svg=h.run(`qrSvg(menuLink('${id}'))`);
    assert.equal(decode(svg),link);assert.equal(link,'https://sof-cafe-preview.vercel.app/'+(id?'?branch='+id:''));assert(!link.includes('admin'));assert(!link.includes('setup'));
  }
  assert.throws(()=>h.run("menuLink('branch-5')"));
});
test('QR page uses only saved public branches, escapes names, copies the correct link and refuses unpublished branches',async()=>{
  const h=harness(async()=>({ok:true,json:async()=>structuredClone(published)}));await h.run('refreshPublishedMenu()');
  h.document.body.innerHTML=h.run('qrPage()');assert.equal(h.document.querySelectorAll('.qr-card').length,2);assert.equal(h.document.querySelectorAll('img').length,0);assert(h.document.body.textContent.includes(published.branches[0].name));
  await h.run("copyMenuLink('branch-1')");assert.equal(h.copied(),'https://sof-cafe-preview.vercel.app/?branch=branch-1');assert.throws(()=>h.run("checkedQrTarget('branch-2')"));
  h.state.dirty=true;assert.match(h.run('qrPage()'),/неопубликованные изменения/);
  h.state.page='connections';assert.match(h.run('connectionsPage()'),/1 опубликовано/);assert.match(h.run('connectionsPage()'),/Не подключены/);
});
test('failed refresh clears stale QR targets and never presents disconnected storage as ready',async()=>{
  let fail=false;const h=harness(async()=>{if(fail)throw new Error('offline');return {ok:true,json:async()=>structuredClone(published)};});
  await h.run('refreshPublishedMenu()');fail=true;await h.run('refreshPublishedMenu()');
  assert.throws(()=>h.run("checkedQrTarget('branch-1')"));assert(!h.run('qrPage()').includes('data-qr-download'));assert.match(h.run('qrPage()'),/Проверка недоступна/);
  const offline=harness(async()=>({ok:true,json:async()=>({...published,connected:false})}));await offline.run('refreshPublishedMenu()');assert(!offline.run('qrPage()').includes('data-qr-download'));assert.match(offline.run('connectionsPage()'),/Требуют настройки/);
});
