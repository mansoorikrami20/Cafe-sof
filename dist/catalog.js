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
function openBranchSelector(){
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
  document.querySelector('#branchDialog').showModal();
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
    updateCatalogCategories();clearUnavailableCart();cafeSettings=data.settings;catalogNotice=data.notice||'';render();
    return true;
  }catch(error){
    if(request!==catalogRequest||branch!==state.branch)return;
    if(branch){dishes=[];products=[];cafeSettings=null;clearUnavailableCart();updateCatalogCategories();render();const label=document.querySelector('#branchLabel');if(label){label.textContent='Филиал недоступен';label.title='';}}
    toast(error.message||'Не удалось обновить каталог.');return false;
  }
}
document.addEventListener('click',event=>{
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
