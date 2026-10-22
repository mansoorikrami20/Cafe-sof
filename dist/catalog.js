// One shared catalog for the storefront and the authenticated owner cabinet.
let catalogRevision=-1;
let cafeSettings=null;
function applyCafeSettings(){
  if(!cafeSettings)return;
  const s=cafeSettings;
  document.title=s.name+' — любимая еда рядом';
  const headline=document.querySelector('.intro span');if(headline)headline.textContent=s.tagline||'Закажите в «'+s.name+'».';
  if(s.address){const label=document.querySelector('#branchLabel');label.textContent=s.address;label.title=s.address;}
  if(state.page==='menu'){
    const info=document.createElement('p');info.id='cafeContact';info.className='cafe-contact';
    info.textContent=[s.name,s.address,s.hours,s.phone,s.deliveryNote].filter(Boolean).join(' · ');
    document.querySelector('#view').append(info);
  }
}
const renderBeforeCatalog=render;
render=function(){renderBeforeCatalog();applyCafeSettings();};
async function refreshCatalog(){
  if(document.hidden||document.activeElement?.matches('input,textarea')||document.querySelector('dialog[open]'))return;
  try{
    const response=await fetch('/api/catalog',{cache:'no-store'});if(!response.ok)return;
    const data=await response.json();if(!data.connected||data.revision===catalogRevision)return;
    if(!Array.isArray(data.dishes)||!Array.isArray(data.categories))return;
    const categoryMap=new Map(data.categories.map(c=>[c.id,c.name]));
    dishes=data.dishes.map(d=>({...d,category:categoryMap.get(d.categoryId)||'Меню'}));
    const categoryItems=data.categories.map(c=>{const first=dishes.find(d=>d.categoryId===c.id);return {name:c.name,imageUrl:first?.imageUrl||'',image:first?'':undefined};});
    const all={name:'Все',imageUrl:dishes[0]?.imageUrl||''};
    if(categoryItems.length===2){arcCategories=[categoryItems[0],{name:'Говядина',image:'roast'},all,categoryItems[1],{name:'Баранина',image:'kazan'}];}
    else arcCategories=[all,...categoryItems];
    if(!arcCategories.some(c=>c.name===state.category))state.category='Все';
    for(const id of Object.keys(state.cart)){if(!dishes.some(d=>d.id===id&&d.available))delete state.cart[id];}
    state.favorites=state.favorites.filter(id=>dishes.some(d=>d.id===id));persist();
    cafeSettings=data.settings;catalogRevision=data.revision;render();
  }catch{/* Keep the last rendered menu when the network is unavailable. */}
}
refreshCatalog();
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCatalog();});
window.addEventListener('focus',refreshCatalog);
setInterval(refreshCatalog,60000);
