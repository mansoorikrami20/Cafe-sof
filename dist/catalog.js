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
function applyCafeSettings(){
  if(!cafeSettings)return;
  const s=cafeSettings;
  document.title=s.name+' — любимая еда рядом';
  const headline=document.querySelector('.intro span');if(headline)headline.textContent=s.tagline||'Закажите в «'+s.name+'».';
  const branch=catalogBranches.find(b=>b.id===state.branch);
  const label=document.querySelector('#branchLabel');
  if(label){label.textContent=branch?.name||(state.branch?'Филиал недоступен':'Выберите филиал');label.title=branch?.address||'';}
  if(state.page==='menu'){
    const info=document.createElement('p');info.id='cafeContact';info.className='cafe-contact';
    info.textContent=[s.name,s.address,s.hours,s.phone,s.deliveryNote].filter(Boolean).join(' · ');
    document.querySelector('#view').append(info);
    const note=document.querySelector('#view .subtle');if(note&&catalogNotice)note.textContent=catalogNotice+' Заказы и оплата не подключены.';
  }
}
function openBranchSelector(){
  const box=document.querySelector('#branchOptions');
  box.innerHTML=`<p class="muted">${catalogBranches.length?'Выберите филиал, чтобы увидеть его ассортимент и цены.':'Филиалы ещё не настроены. Реальные заказы пока недоступны.'}</p>${catalogBranches.map(b=>`<button class="branch-option" data-select-branch="${safe(b.id)}"><span><strong>${safe(b.name)}</strong><small>${safe(b.address)} · ${safe(b.opensAt)}–${safe(b.closesAt)}</small></span><span>→</span></button>`).join('')}<button class="branch-option" data-select-branch=""><span><strong>Общее меню</strong><small>Без выбора филиала · заказы не отправляются</small></span><span>→</span></button>`;
  document.querySelector('#branchDialog').showModal();
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
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-select-branch]');if(!button)return;
  state.branch=button.dataset.selectBranch;state.cart={};state.category='Все';state.query='';state.mode='Кафе';
  dishes=[];products=[];cafeSettings=null;catalogNotice='';const label=document.querySelector('#branchLabel');if(label){label.textContent='Загружаем меню…';label.title='';}persist();updateCatalogCategories();render();
  const params=new URLSearchParams(location.search);if(state.branch)params.set('branch',state.branch);else params.delete('branch');
  history.replaceState(null,'',location.pathname+(params.size?'?'+params.toString():'')+location.hash);
  document.querySelector('#branchDialog').close();const loaded=await refreshCatalog(true);
  if(loaded)toast('Филиал изменён. Корзина очищена; приём заказов пока недоступен.');
});
if(state.branch){dishes=[];render();}
refreshCatalog();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCatalog();});
window.addEventListener('focus',()=>refreshCatalog());
setInterval(()=>refreshCatalog(),60000);
