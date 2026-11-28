// One public projection for dishes, products and branch-specific availability.
let cafeSettings=null,catalogBranches=[],catalogCategories=[],productCategories=[],catalogRequest=0,catalogNotice='';
state.branch=new URLSearchParams(location.search).get('branch')||'';
function updateCatalogCategories(){
  const list=visibleItems(),categories=state.mode==='Продукты'?productCategories:catalogCategories;
  const items=categories.map(c=>({name:c.name,imageUrl:list.find(d=>d.categoryId===c.id)?.imageUrl||''}));
  const all={name:'Все',imageUrl:list[0]?.imageUrl||''};
  if(state.mode!=='Продукты'&&items.length===2)arcCategories=[items[0],{name:'Говядина',image:'roast'},all,items[1],{name:'Баранина'}];
  else arcCategories=[all,...items];
  if(!arcCategories.some(c=>c.name===state.category))state.category='Все';
}
let deliveryAddress=localStorage.getItem('sof-delivery-address')||'';
// Preview-only branch state. In production the backend/Yandex Maps supplies this result.
const branchPreviewScenario=new URLSearchParams(location.search).get('branchScenario')||'address';
const prototypeBranches=[
  {id:'center',name:'Соф · Центр',address:'ул. Ленина, 12',distance:'1.2 км',nearest:true,x:49,y:43},
  {id:'park',name:'Соф · Парковый',address:'Парковый проспект, 8',distance:'3.8 км',x:73,y:27},
  {id:'south',name:'Соф · Южный',address:'Южная улица, 41',distance:'6.4 км',x:31,y:72}
];
function shortDeliveryAddress(value){
  const cleaned=String(value||'').trim().replace(/^г\.?\s*[^,]+,\s*/i,'');
  return cleaned.length>34?cleaned.slice(0,33).trim()+'…':cleaned;
}
function updateAddressHeader(){
  const label=document.querySelector('#branchLabel');if(!label)return;
  label.innerHTML=safe(deliveryAddress?shortDeliveryAddress(deliveryAddress):'Укажите адрес доставки')+' <span>⌄</span>';
  label.title=deliveryAddress||'';
}
function applyCafeSettings(){
  updateAddressHeader();
  if(!cafeSettings)return;
  const s=cafeSettings;
  document.title=s.name+' — любимая еда рядом';
  const headline=document.querySelector('.intro span');if(headline)headline.textContent=s.tagline||'Закажите в «'+s.name+'».';
  if(state.page==='menu'){
    const info=document.createElement('p');info.id='cafeContact';info.className='cafe-contact';
    info.textContent=[s.name,s.address,s.hours,s.phone,s.deliveryNote].filter(Boolean).join(' · ');
    document.querySelector('#view').append(info);
    const note=document.querySelector('#view .subtle');if(note&&catalogNotice)note.textContent=catalogNotice+' Заказы и оплата не подключены.';
  }
}
function prototypeBranchMap(selectedId='center',single=false){
  const branches=single?prototypeBranches.filter(branch=>branch.id===selectedId):prototypeBranches;
  return `<div class="branch-map" role="group" aria-label="Карта филиалов">
    <span class="map-park"></span><span class="map-water"></span>
    <i class="map-road road-one"></i><i class="map-road road-two"></i><i class="map-road road-three"></i><i class="map-road road-four"></i>
    <span class="map-building building-one"></span><span class="map-building building-two"></span><span class="map-building building-three"></span><span class="map-building building-four"></span>
    <span class="map-label label-one">ул. Ленина</span><span class="map-label label-two">Садовая ул.</span><span class="map-label label-three">Центральный парк</span>
    ${branches.map(branch=>`<button type="button" class="branch-pin ${branch.id===selectedId?'active':''}" style="left:${branch.x}%;top:${branch.y}%" data-prototype-branch="${branch.id}" aria-label="${safe(branch.name)}"><span>${svg('pin')}</span><em>${safe(branch.name)}</em></button>`).join('')}
  </div>`;
}
function renderManualBranchSelector(){
  const box=document.querySelector('#branchOptions');
  box.innerHTML=`<p class="branch-lead">Выберите ресторан, из которого хотите оформить заказ</p>
  <div class="prototype-branch-list">${prototypeBranches.map(branch=>`<button type="button" class="prototype-branch-card ${branch.nearest?'nearest active':''}" data-prototype-branch="${branch.id}"><span class="prototype-branch-icon">${svg('pin')}</span><span><strong>${safe(branch.name)}</strong><small>${safe(branch.address)}</small></span><span class="branch-distance">${branch.nearest?'<b>Ближайший</b>':''}<em>${branch.distance}</em></span></button>`).join('')}</div>
  ${prototypeBranchMap('center')}
  <button type="button" class="primary branch-confirm" data-confirm-prototype-branch="center">Выбрать Соф · Центр</button>
  <p class="address-prototype-note">Демонстрационные расстояния · реальные данные приходят с бэкенда</p>`;
}
function renderAutoBranchSelector(){
  const box=document.querySelector('#branchOptions');
  const branch=prototypeBranches[0];
  box.innerHTML=`<section class="auto-branch-result"><span class="auto-branch-check">${svg('check')}</span><small>ФИЛИАЛ ОПРЕДЕЛЁН</small><h3>Ваш филиал:<br>${safe(branch.name)}</h3><p>Подобран автоматически<br>по вашему адресу</p></section>
  <article class="auto-branch-card"><span>${svg('pin')}</span><div><strong>${safe(branch.address)}</strong><small>До филиала · ${branch.distance}</small></div><b>Ближайший</b></article>
  ${prototypeBranchMap(branch.id,true)}
  <button type="button" class="primary branch-confirm" data-close-prototype-branch>Продолжить с этим филиалом</button>
  <p class="address-prototype-note">Зона доставки и филиал рассчитаны через Яндекс Карты</p>`;
}
function openBranchSelector(){
  const dialog=document.querySelector('#branchDialog');
  const title=dialog.querySelector('.sheet-head h2');
  const kicker=dialog.querySelector('.address-kicker');
  if(branchPreviewScenario==='manual'){
    kicker.textContent='НЕСКОЛЬКО ФИЛИАЛОВ';title.textContent='Выбор филиала';renderManualBranchSelector();dialog.showModal();return;
  }
  if(branchPreviewScenario==='auto'){
    kicker.textContent='ДОСТАВКА';title.textContent='Филиал для заказа';renderAutoBranchSelector();dialog.showModal();return;
  }
  kicker.textContent='ДОСТАВКА';title.textContent='Укажите адрес';
  const box=document.querySelector('#branchOptions');
  const value=safe(deliveryAddress);
  box.innerHTML=`<label class="address-search">${svg('search')}<input id="addressSearch" type="search" autocomplete="street-address" placeholder="Введите улицу и дом" value="${value}" aria-label="Адрес доставки"></label>
  <button type="button" class="address-map" id="addressMap" aria-label="Поставить точку на карте">
    <span class="map-park"></span><span class="map-water"></span>
    <i class="map-road road-one"></i><i class="map-road road-two"></i><i class="map-road road-three"></i><i class="map-road road-four"></i>
    <span class="map-building building-one"></span><span class="map-building building-two"></span><span class="map-building building-three"></span><span class="map-building building-four"></span>
    <span class="map-label label-one">ул. Ленина</span><span class="map-label label-two">Садовая ул.</span><span class="map-label label-three">Центральный парк</span>
    <span class="map-pin" id="addressPin" style="left:62%;top:46%"><b>${svg('pin')}</b><em></em></span>
  </button>
  <div class="address-map-note"><span class="address-pulse"></span><p id="addressMapStatus">${deliveryAddress?'Адрес сохранён. Можно выбрать другую точку.':'Нажмите на карту, чтобы поставить точку вручную'}</p></div>
  <button type="button" class="primary address-confirm" data-confirm-address>Подтвердить адрес</button>
  <p class="address-prototype-note">Демонстрационная карта · геокодирование не подключено</p>`;
  dialog.showModal();
  requestAnimationFrame(()=>document.querySelector('#addressSearch')?.focus({preventScroll:true}));
}
const renderBeforeCatalog=render;
render=function(){renderBeforeCatalog();applyCafeSettings();};
function clearUnavailableCart(){
  for(const id of Object.keys(state.cart)){
    const item=allItems().find(d=>d.id===id&&d.available);
    if(!item)delete state.cart[id];
    else if(item.stock!=null&&qty(id)>item.stock)delete state.cart[id];
  }
  state.favorites=state.favorites.filter(id=>allItems().some(d=>d.id===id));persist();
}
async function refreshCatalog(force=false){
  if(!force&&(document.hidden||document.activeElement?.matches('input,textarea')||document.querySelector('dialog[open]')))return;
  const branch=state.branch,request=++catalogRequest;
  try{
    const response=await fetch('/api/catalog'+(branch?'?branch='+encodeURIComponent(branch):''),{cache:'no-store'});
    const data=await response.json();
    if(request!==catalogRequest||branch!==state.branch)return;
    if(!response.ok)throw new Error(data.error||'Каталог недоступен.');
    if(!Array.isArray(data.dishes)||!Array.isArray(data.categories))throw new Error('Каталог недоступен.');
    catalogCategories=data.categories;productCategories=data.productCategories||[];catalogBranches=data.branches||[];
    const enrich=(items,categories)=>items.map(d=>({...d,category:categories.find(c=>c.id===d.categoryId)?.name||'Каталог',weight:d.unit?(d.weight||'за 1 '+d.unit):d.weight}));
    dishes=enrich(data.dishes,catalogCategories);products=enrich(data.products||[],productCategories);
    updateCatalogCategories();clearUnavailableCart();cafeSettings=data.settings;if(!paymentPreviewOverride&&Array.isArray(cafeSettings?.enabledPaymentMethods))enabledPaymentMethods=[...cafeSettings.enabledPaymentMethods];if(!courierTipsPreviewOverride)showCourierTips=cafeSettings?.showCourierTips===true;catalogNotice=data.notice||'';render();
    return true;
  }catch(error){
    if(request!==catalogRequest||branch!==state.branch)return;
    if(branch){dishes=[];products=[];cafeSettings=null;clearUnavailableCart();updateCatalogCategories();render();const label=document.querySelector('#branchLabel');if(label){label.textContent='Филиал недоступен';label.title='';}}
    toast(error.message||'Не удалось обновить каталог.');return false;
  }
}
document.addEventListener('click',event=>{
  const branchChoice=event.target.closest('[data-prototype-branch]');
  if(branchChoice){
    const id=branchChoice.dataset.prototypeBranch;
    const branch=prototypeBranches.find(item=>item.id===id);if(!branch)return;
    document.querySelectorAll('[data-prototype-branch]').forEach(item=>item.classList.toggle('active',item.dataset.prototypeBranch===id));
    const confirm=document.querySelector('[data-confirm-prototype-branch]');
    if(confirm){confirm.dataset.confirmPrototypeBranch=id;confirm.textContent='Выбрать '+branch.name;}
    return;
  }
  const confirmBranch=event.target.closest('[data-confirm-prototype-branch]');
  if(confirmBranch){
    const branch=prototypeBranches.find(item=>item.id===confirmBranch.dataset.confirmPrototypeBranch)||prototypeBranches[0];
    document.querySelector('#branchDialog').close();toast('Выбран филиал: '+branch.name);return;
  }
  if(event.target.closest('[data-close-prototype-branch]')){
    document.querySelector('#branchDialog').close();toast('Филиал подтверждён');return;
  }
  const map=event.target.closest('#addressMap');
  if(map){
    const rect=map.getBoundingClientRect();
    const keyboard=event.detail===0;
    const x=keyboard?62:Math.max(8,Math.min(92,(event.clientX-rect.left)/rect.width*100));
    const y=keyboard?46:Math.max(12,Math.min(84,(event.clientY-rect.top)/rect.height*100));
    const pin=document.querySelector('#addressPin');if(pin){pin.style.left=x+'%';pin.style.top=y+'%';pin.classList.remove('placed');requestAnimationFrame(()=>pin.classList.add('placed'));}
    const field=document.querySelector('#addressSearch');if(field&&!field.value.trim())field.value='ул. Ленина, 12';
    const status=document.querySelector('#addressMapStatus');if(status)status.textContent='Точка выбрана · уточните адрес в поле выше';
    return;
  }
  const confirm=event.target.closest('[data-confirm-address]');if(!confirm)return;
  const field=document.querySelector('#addressSearch');
  const value=field?.value.trim()||'ул. Ленина, 12';
  deliveryAddress=value;localStorage.setItem('sof-delivery-address',deliveryAddress);
  updateAddressHeader();document.querySelector('#branchDialog').close();toast('Адрес доставки сохранён');
});
document.addEventListener('input',event=>{
  if(event.target.id!=='addressSearch')return;
  const status=document.querySelector('#addressMapStatus');if(status)status.textContent=event.target.value.trim()?'Адрес введён · подтвердите его кнопкой ниже':'Нажмите на карту, чтобы поставить точку вручную';
});
if(state.branch){dishes=[];render();}
refreshCatalog();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCatalog();});
window.addEventListener('focus',()=>refreshCatalog());
setInterval(()=>refreshCatalog(),60000);
