// Tokens stay only in memory. The bootstrap removes fragments before any network request.
let accountSession={},accountLink=null;
function enhanceAccountLogin(){
  const form=document.querySelector('#authForm');
  if(!form||form.dataset.setup==='true')return;
  const links=document.createElement('div');links.className='login-hint';
  links.innerHTML='<button class="text-button" type="button" id="showLoginPassword" aria-pressed="false">Показать пароль</button><br><button class="text-button" type="button" data-account="reset">Забыли пароль?</button><br><button class="text-button" type="button" data-account="verify">Подтвердить почту</button>';
  form.after(links);
}
function accountScreen(mode,{email='',message=''}={}){
  authScreen();
  const inner=document.querySelector('.login-inner');
  const reset=mode==='reset-link',verify=mode==='verify-link',link=reset||verify;
  const title=reset?'Новый пароль':verify?'Подтвердить почту':mode==='reset'?'Восстановить доступ':'Подтвердить почту';
  const form=link?`${reset?'<label class="field">Новый пароль<input type="password" name="password" autocomplete="new-password" minlength="12" maxlength="128" required><small>От 12 до 128 символов.</small></label><label class="field">Повторите пароль<input type="password" name="confirm" autocomplete="new-password" minlength="12" maxlength="128" required></label>':'<p>Нажмите кнопку, чтобы подтвердить адрес почты. Затем войдите в кабинет.</p>'}`:`<label class="field">Email владельца<input type="email" name="email" autocomplete="username" maxlength="254" value="${escape(email)}" required></label>`;
  inner.innerHTML=`<a class="brand" href="/">СОФ<small>КАБИНЕТ РЕСТОРАНА</small></a><h2>${title}</h2><p>${link?'Одноразовая ссылка действует 15 минут.':accountSession.emailDeliveryConfigured?'Укажите почту, с которой зарегистрирован кабинет. Мы отправим одноразовую ссылку. Повторное письмо можно запросить через минуту.':'Отправка писем пока не подключена. Автоматическое восстановление и подтверждение станут доступны после настройки почтового сервиса.'}</p><form id="accountForm" data-mode="${mode}">${form}<p class="error-text" role="alert"></p><p id="accountMessage" role="status">${escape(message)}</p><button class="button" type="submit" ${!link&&!accountSession.emailDeliveryConfigured?'disabled':''}>${reset?'Сохранить пароль':verify?'Подтвердить почту':'Отправить ссылку'}</button></form><p class="login-hint"><button class="text-button" type="button" data-account="login">Вернуться ко входу</button></p>`;
}
document.addEventListener('click',event=>{
  const toggle=event.target.closest('#showLoginPassword');
  if(toggle){const input=document.querySelector('#authForm [name=password]');if(input){const visible=input.type==='password';input.type=visible?'text':'password';toggle.textContent=visible?'Скрыть пароль':'Показать пароль';toggle.setAttribute('aria-pressed',String(visible));}return;}
  const b=event.target.closest('[data-account]');if(!b)return;
  event.preventDefault();const mode=b.dataset.account;
  if(mode==='login'){accountLink=null;authScreen();return;}
  accountScreen(mode,{email:document.querySelector('#authForm [name=email]')?.value||''});
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(form.id!=='accountForm')return;
  event.preventDefault();event.stopImmediatePropagation();
  const button=form.querySelector('[type=submit]'),error=form.querySelector('[role=alert]'),message=form.querySelector('[role=status]');
  button.disabled=true;error.textContent='';message.textContent='';
  try{
    const mode=form.dataset.mode;let result;
    if(mode==='reset-link'){
      if(form.elements.password.value!==form.elements.confirm.value)throw new Error('Пароли не совпадают.');
      result=await request('reset-password',{token:accountLink?.token,password:form.elements.password.value});
    }else if(mode==='verify-link')result=await request('verify-email',{token:accountLink?.token});
    else result=await request(mode==='reset'?'request-reset':'request-verification',{email:form.elements.email.value});
    if(mode.endsWith('-link')){accountLink=null;authScreen();document.querySelector('#authError').textContent=result.message;}
    else message.textContent=result.message;
  }catch(e){error.textContent=e.message;}finally{if(button.isConnected)button.disabled=false;}
});
