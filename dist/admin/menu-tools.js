// QR generation stays in the browser. Only the published public catalog is read.
const menuPublicOrigin='https://sof-cafe-preview.vercel.app';
let publishedMenu=null,publishedMenuError='',publishedMenuLoading=false,publishedMenuRequest=0;
function menuLink(branchId=''){
  if(branchId&&!/^branch-[1-4]$/.test(branchId))throw new Error('Неизвестный филиал.');
  return menuPublicOrigin+'/'+(branchId?'?branch='+branchId:'');
}
function qrSvg(url){
  const qr=qrcode(0,'M');qr.addData(url);qr.make();
  const count=qr.getModuleCount(),size=count+8;let path='';
  for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.isDark(row,col))path+=`M${col+4} ${row+4}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR-код меню" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="white"/><path d="${path}" fill="black"/></svg>`;
}
async function refreshPublishedMenu(){
  const requestId=++publishedMenuRequest;publishedMenuLoading=true;publishedMenuError='';publishedMenu=null;
  if(['qr','connections'].includes(state.page))render();
  try{
    const response=await fetch('/api/catalog',{cache:'no-store',credentials:'same-origin'});
    if(!response.ok)throw new Error('Не удалось проверить опубликованное меню.');
    const menu=await response.json();
    if(menu.schemaVersion!==2||!Array.isArray(menu.branches)||!Array.isArray(menu.dishes)||!Array.isArray(menu.products))throw new Error('Ответ каталога не распознан.');
    if(menu.branches.some(b=>!/^branch-[1-4]$/.test(b.id)||typeof b.name!=='string'))throw new Error('Не удалось проверить филиалы.');
    if(requestId===publishedMenuRequest)publishedMenu=menu;
  }catch(e){if(requestId===publishedMenuRequest)publishedMenuError='Проверка недоступна. Обновите данные и попробуйте ещё раз.';}
  finally{if(requestId===publishedMenuRequest){publishedMenuLoading=false;if(['qr','connections'].includes(state.page))render();}}
}
function publishedMenuNotice(){
  if(publishedMenuLoading)return '<p class="catalog-note" role="status">Проверяем опубликованное меню…</p>';
  if(publishedMenuError)return `<p class="error-text" role="alert">${escape(publishedMenuError)}</p>`;
  if(!publishedMenu)return '<p class="catalog-note">Нажмите «Обновить статус», чтобы получить данные сервера.</p>';
  if(!publishedMenu.connected)return '<div class="banner">Сервер показывает демонстрационное меню. Проверьте подключение хранилища перед печатью QR.</div>';
  return state.dirty?'<div class="banner">Есть неопубликованные изменения. QR ведёт на сохранённое меню; гости увидят правки после сохранения.</div>':'';
}
function qrPage(){
  const cards=publishedMenu?.connected?[{id:'',name:'Общее меню'},...publishedMenu.branches]:[];
  return heading('ССЫЛКИ ДЛЯ ГОСТЕЙ','QR-меню','Скачайте QR в SVG для печати или скопируйте ссылку.',`<button class="button secondary" id="refreshPublishedMenu" ${publishedMenuLoading?'disabled':''}>Обновить статус</button>`)+publishedMenuNotice()+`<div class="qr-grid">${cards.map(b=>`<section class="panel qr-card"><h2>${escape(b.name)}</h2><div class="qr-code">${qrSvg(menuLink(b.id))}</div><a class="qr-url" href="${menuLink(b.id)}" target="_blank" rel="noopener">${menuLink(b.id)}</a><div class="qr-actions"><button class="button" data-qr-download="${b.id}">Скачать SVG</button><button class="button secondary" data-qr-copy="${b.id}">Копировать ссылку</button></div></section>`).join('')}</div>`+(publishedMenu?.connected&&!publishedMenu.branches.length?'<section class="panel"><h2>Меню действующего филиала</h2><p>Пока можно использовать общее меню. После заполнения и сохранения действующего филиала здесь появится его отдельный QR. Филиалы на этапе строительства оставьте выключенными.</p></section>':'')+'<p class="catalog-note">QR содержит только публичную ссылку. Генерация выполняется на вашем устройстве. Перед печатью откройте ссылку и проверьте меню. Публичный адрес: '+menuPublicOrigin+'. При смене домена ранее напечатанные QR нужно сохранить через перенаправление или заменить.</p>';
}
function checkedQrTarget(id){
  if(!publishedMenu?.connected||publishedMenuLoading||publishedMenuError)throw new Error('Сначала обновите статус меню.');
  if(id&&!publishedMenu.branches.some(b=>b.id===id))throw new Error('Филиал не опубликован. Обновите статус.');
  return menuLink(id);
}
function downloadMenuQr(id){
  const url=checkedQrTarget(id),blob=new Blob([qrSvg(url)],{type:'image/svg+xml'});
  const objectUrl=URL.createObjectURL(blob),a=document.createElement('a');a.href=objectUrl;a.download='sof-menu'+(id?'-'+id:'')+'.svg';
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
}
async function copyMenuLink(id){
  const url=checkedQrTarget(id);
  if(!navigator.clipboard?.writeText)throw new Error('Откройте ссылку и скопируйте адрес из браузера.');
  await navigator.clipboard.writeText(url);notify('Ссылка скопирована.');
}
function connectionsPage(){
  const ready=!!publishedMenu?.connected;
  const rows=[['Каталог и кабинет',publishedMenu?(ready?'Подключены':'Требуют настройки'):'Не проверены',ready?'Блюда и товары загружаются с сервера. Сохранение доступно после входа владельца.':'Для проверки нажмите «Обновить статус».'],['Филиалы',ready?`${publishedMenu.branches.length} опубликовано`:'Не проверены','Включайте только работающие точки. Будущие филиалы можно заполнить и оставить скрытыми.'],['Заказы','Не подключены','Корзина пока демонстрационная. Нужны база заказов и серверная обработка.'],['Онлайн-оплата','Не подключена','Платёжный провайдер ещё не настроен.'],['iiko','Не подключена','Синхронизация меню, стоп-листов и отправка заказов ещё не работают.'],['Вход гостей','Не подключён','Яндекс ID, телефон и MAX требуют отдельного подключения.']];
  return heading('СОСТОЯНИЕ СЕРВИСА','Подключения','Здесь показано, какие функции уже доступны.',`<button class="button secondary" id="refreshPublishedMenu" ${publishedMenuLoading?'disabled':''}>Обновить статус</button>`)+publishedMenuNotice()+`<section class="panel">${rows.map(([name,status,detail])=>`<div class="connection-row"><div><h2>${name}</h2><p>${detail}</p></div><span class="badge ${status==='Подключены'?'':'hidden'}">${status}</span></div>`).join('')}</section><p class="catalog-note">Доступы сервисов настраиваются отдельно на сервере. Поля для ключей появятся вместе с работающими интеграциями.</p>`;
}
