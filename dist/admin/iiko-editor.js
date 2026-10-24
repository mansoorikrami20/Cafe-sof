let iikoState=null,iikoError='',iikoLoading=false,iikoBusy=false,iikoBranch='',iikoDraftDirty=false;
let iikoDraft={appId:'',clientSecret:'',apiKey:''};
function clearIikoDraft(){iikoDraft={appId:'',clientSecret:'',apiKey:''};iikoDraftDirty=false;}
const connectionsWithoutIiko=connectionsPage;
async function iikoRequest(action,body){
  const response=await fetch('/api/integrations'+(action?'?action='+action:''),{cache:'no-store',credentials:'same-origin',...(body?{method:'POST',headers:{'Content-Type':'application/json','X-Sof-Admin':'1'},body:JSON.stringify(body)}:{})});
  const data=await response.json();if(!response.ok){if(data.branches){iikoState=data;iikoDraftDirty=false;}throw new Error(data.error||'Запрос не выполнен.');}return data;
}
async function loadIikoStatus(){
  if(iikoLoading||iikoBusy)return;iikoLoading=true;iikoError='';
  try{iikoState=await iikoRequest();if(!iikoState.branches.some(b=>b.id===iikoBranch))iikoBranch=iikoState.branches[0]?.id||'';}
  catch(e){iikoState=null;iikoError=e.message;}
  finally{iikoLoading=false;if(state.page==='connections')render();}
}
connectionsPage=function(){
  if(!iikoState&&!iikoLoading&&!iikoError&&!state.preview)void loadIikoStatus();
  return connectionsWithoutIiko()+iikoPanel();
};
function iikoPanel(){
  Promise.resolve().then(()=>{if(state.page==='connections'&&!iikoBusy)for(const name of Object.keys(iikoDraft)){const input=document.querySelector('#iikoForm [name='+name+']');if(input)input.value=iikoDraft[name];}});
  if(state.preview)return '<section class="panel"><h2>iiko</h2><p>Настройка ключей доступна только после входа владельца.</p></section>';
  const branch=iikoState?.branches.find(b=>b.id===iikoBranch);
  return `<section class="panel"><h2>Реквизиты iiko по филиалам</h2><p>Сохраните App ID, Client Secret и API-ключ, затем проверьте авторизацию. Импорт меню, стоп-листы и заказы ещё не подключены.</p>${iikoLoading?'<p role="status">Загружаем состояние…</p>':''}${iikoError?`<p class="error-text" role="alert">${escape(iikoError)}</p>`:''}<button class="button secondary" id="iikoReload" ${iikoLoading||iikoBusy?'disabled':''}>Обновить подключения iiko</button>${iikoState?`<label class="field">Филиал<select id="iikoBranch" ${iikoBusy?'disabled':''}>${iikoState.branches.map(b=>`<option value="${escape(b.id)}" ${b.id===iikoBranch?'selected':''}>${escape(b.name)}</option>`).join('')}</select></label>`:''}${branch?`<p class="catalog-note">${escape(branch.message)}${branch.checkedAt?' Последняя проверка: '+escape(stamp(branch.checkedAt))+'.':''}</p>${branch.configured?'<p class="catalog-note">App ID: •••••••• · Client Secret: •••••••• · API-ключ: ••••••••<br>Пустые поля сохраняют прежние значения.</p>':''}<form id="iikoForm" autocomplete="off"><fieldset class="iiko-fields" ${iikoBusy?'disabled':''}>${[['appId','App ID',256],['clientSecret','Client Secret',4096],['apiKey','API-ключ из iikoWeb',4096]].map(([name,label,max])=>`<label class="field">${label}<input type="password" name="${name}" maxlength="${max}" autocomplete="new-password" spellcheck="false" ${branch.configured?'':'required'} placeholder="${branch.configured?'Сохранено · введите для замены':'Введите значение'}"></label>`).join('')}<p class="error-text" id="iikoFormError" role="alert"></p><div class="qr-actions"><button class="button" type="submit">Сохранить реквизиты</button><button class="button secondary" type="button" id="iikoCheck" ${!branch.configured?'disabled':''}>Проверить сохранённые</button><button class="button danger" type="button" id="iikoDisconnect" ${!branch.configured?'disabled':''}>Отключить</button></div></fieldset></form>${branch.organizations.length?`<div class="iiko-organizations"><h3>Организации, доступные ключу</h3>${branch.organizations.map(o=>`<p><strong>${escape(o.name)}</strong><br><code>${escape(o.id)}</code></p>`).join('')}<p class="catalog-note">${branch.organizationMatched?'Организация филиала найдена.':'Укажите нужный ID организации в настройках филиала, сохраните каталог и повторите проверку.'} Терминальная группа этой проверкой не проверяется.</p></div>`:''}`:''}<p class="catalog-note">Ключи сохраняются отдельно от меню, в зашифрованном серверном хранилище. В выгрузку меню и QR они не входят. <a href="https://api.iiko.help/docs/concepts/authorization/" target="_blank" rel="noopener noreferrer">Где получить реквизиты iiko ↗</a></p></section>`;
}
async function runIikoAction(action,credentials={}){
  if(iikoBusy||!iikoState)return;
  if(action==='check'&&iikoDraftDirty)throw new Error('Сначала сохраните введённые реквизиты. Проверка использует сохранённые значения.');
  if(action==='disconnect'&&!confirm('Удалить сохранённые реквизиты iiko этого филиала? Другие филиалы сохранят подключения.'))return;
  iikoBusy=true;iikoError='';
  const payload={branchId:iikoBranch,revision:iikoState.revision,...credentials};
  const form=document.querySelector('#iikoForm');if(form)for(const input of form.querySelectorAll('input'))input.value='';
  clearIikoDraft();render();
  try{iikoState=await iikoRequest(action,payload);notify(action==='save'?'Реквизиты сохранены. Теперь проверьте доступ.':action==='disconnect'?'Реквизиты iiko удалены.':'Авторизация проверена. Заказы и синхронизация ещё не подключены.');}
  catch(e){iikoError=e.message;try{iikoState=await iikoRequest();}catch{iikoState=null;}}
  finally{iikoBusy=false;if(state.page==='connections')render();}
}
document.addEventListener('input',event=>{if(event.target.closest('#iikoForm')){for(const name of Object.keys(iikoDraft))iikoDraft[name]=document.querySelector('#iikoForm [name='+name+']')?.value||'';iikoDraftDirty=Object.values(iikoDraft).some(Boolean);}});
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if((button.dataset.page||['logout','refreshPublishedMenu','iikoReload','saveMenu','discard'].includes(button.id))&&iikoDraftDirty){if(!confirm('Введены несохранённые реквизиты iiko. Удалить их из формы?')){event.preventDefault();event.stopImmediatePropagation();return;}clearIikoDraft();}
  if(iikoBusy&&(button.dataset.page||['logout','refreshPublishedMenu','iikoReload','saveMenu','discard'].includes(button.id))){event.preventDefault();event.stopImmediatePropagation();return;}
},true);
document.addEventListener('change',event=>{if(event.target.id!=='iikoBranch')return;if(iikoDraftDirty&&!confirm('Удалить несохранённые реквизиты из формы и выбрать другой филиал?')){event.target.value=iikoBranch;return;}clearIikoDraft();iikoBranch=event.target.value;render();});
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  try{if(button.id==='iikoReload')await loadIikoStatus();else if(button.id==='iikoCheck')await runIikoAction('check');else if(button.id==='iikoDisconnect')await runIikoAction('disconnect');}
  catch(e){const error=document.querySelector('#iikoFormError');if(error)error.textContent=e.message;else notify(e.message);}
});
document.addEventListener('submit',async event=>{
  if(event.target.id!=='iikoForm')return;event.preventDefault();const form=event.target;
  const credentials=Object.fromEntries(['appId','clientSecret','apiKey'].map(name=>[name,form.elements[name].value]));await runIikoAction('save',credentials);
});
window.addEventListener('beforeunload',event=>{if(iikoDraftDirty||iikoBusy){event.preventDefault();event.returnValue='';}});
