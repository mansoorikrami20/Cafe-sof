import {createHmac,randomUUID} from 'node:crypto';
import {cleanMenu,equal,fail,hash,passwordRecord,signSession,verifyPassword,verifySession} from './core.js';
import {initialMenu} from './seed.js';
import {createAccountEmail,mailConfig,requiresEmail} from './account-email.js';
export function createHandler({readStore,writeStore,connected,env=process.env,now=Date.now,sendMail}){
  const accountAction=createAccountEmail({readStore,writeStore,env,now,sendMail});
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,data)=>res.status(status).json(data);
    try{
      if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return send(405,{error:'Метод не поддерживается.'});}
      const action=req.query?.action||'session';
      if(req.method==='POST'){
        if(!req.headers.host||req.headers.origin!==`https://${req.headers.host}`||req.headers['x-sof-admin']!=='1')fail(403,'Запрос отклонён. Обновите страницу.');
        if(!(req.headers['content-type']||'').startsWith('application/json'))fail(415,'Требуется JSON.');
      }
      if(!connected()||!env.SOF_SESSION_SECRET||!env.SOF_SETUP_HASH)return send(503,{error:'Хранилище пока не подключено к проекту. Нужна настройка в Vercel.',configured:false});
      let {doc,etag}=await readStore();
      const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sof_admin='));
      const token=cookie?cookie.slice(10):'';
      const authenticated=verifySession(token,doc.admin,env.SOF_SESSION_SECRET,now(),requiresEmail(env));
      if(action==='session'&&req.method==='GET')return send(200,{configured:true,needsSetup:!doc.admin,authenticated,emailDeliveryConfigured:!!mailConfig(env),emailVerificationRequired:requiresEmail(env),...(authenticated?{email:doc.admin.email,emailVerified:!!doc.admin.emailVerifiedAt}:{})});
      if(action==='menu'&&req.method==='GET'){
        if(!authenticated)fail(401,'Войдите в кабинет.');
        const menu=cleanMenu(doc);return send(200,{...menu,revision:doc.revision,updatedAt:doc.updatedAt,history:(doc.history||[]).map(h=>({...cleanMenu(h),revision:h.revision,updatedAt:h.updatedAt}))});
      }
      if(action==='price-list'&&req.method==='GET'){
        if(!authenticated)fail(401,'Войдите в кабинет.');
        return send(200,{categories:initialMenu.categories,dishes:initialMenu.dishes});
      }
      if(req.method!=='POST')fail(405,'Требуется POST-запрос.');
      const body=req.body;
      if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>3000000)fail(400,'Некорректный запрос.');
      if(['request-reset','request-verification','reset-password','verify-email'].includes(action)){
        if(JSON.stringify(body).length>4096)fail(400,'Слишком большой запрос.');
        const result=await accountAction(action,body,req);
        if(['reset-password','verify-email'].includes(action))res.setHeader('Set-Cookie','sof_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
        return send(200,result);
      }
      if(action==='setup'){
        if(doc.admin)fail(409,'Владелец уже зарегистрирован. Войдите по email и паролю.');
        if(typeof body.setupKey!=='string'||body.setupKey.length>128||!equal(hash(body.setupKey),env.SOF_SETUP_HASH))fail(403,'Нужна личная ссылка настройки владельца.');
        if(requiresEmail(env)&&!mailConfig(env))fail(503,'Сначала подключите отправку писем для подтверждения почты.');
        const admin=await passwordRecord(body.email,body.password);
        doc={...doc,admin,updatedAt:new Date(now()).toISOString()};await writeStore(doc,etag);
        if(requiresEmail(env))return send(200,{ok:true,verificationRequired:true});
        res.setHeader('Set-Cookie',`sof_admin=${signSession(admin,env.SOF_SESSION_SECRET,now())}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
        return send(200,{ok:true});
      }
      if(action==='login'){
        if(!doc.admin)fail(409,'Сначала настройте вход владельца.');
        // Persist a bounded, per-IP attempt window before doing the expensive password check.
        const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').split(',')[0].trim();
        const ipKey=createHmac('sha256',env.SOF_SESSION_SECRET).update(ip).digest('hex');
        const cutoff=now()-15*60000;
        let recorded=false;
        for(let retry=0;retry<4;retry++){
          const attempts=Object.fromEntries(Object.entries(doc.attempts||{}).filter(([,x])=>x.start>cutoff));
          const previous=attempts[ipKey]||{start:now(),count:0};
          if(previous.count>=8||Object.values(attempts).reduce((n,x)=>n+x.count,0)>=120)fail(429,'Слишком много попыток. Попробуйте через 15 минут.');
          attempts[ipKey]={...previous,count:previous.count+1};
          try{await writeStore({...doc,attempts},etag);recorded=true;break;}catch(e){if(e.status!==409)throw e;({doc,etag}=await readStore());}
        }
        if(!recorded)fail(429,'Попробуйте ещё раз через минуту.');
        if(!await verifyPassword(doc.admin,body.email,body.password))fail(401,'Неверный email или пароль.');
        if(requiresEmail(env)&&!doc.admin.emailVerifiedAt)return send(403,{error:'Подтвердите почту перед входом в кабинет.',verificationRequired:true});
        res.setHeader('Set-Cookie',`sof_admin=${signSession(doc.admin,env.SOF_SESSION_SECRET,now())}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`);
        return send(200,{ok:true});
      }
      if(!authenticated)fail(401,'Войдите в кабинет.');
      if(action==='logout'){
        await writeStore({...doc,admin:{...doc.admin,sessionVersion:doc.admin.sessionVersion+1}},etag);
        res.setHeader('Set-Cookie','sof_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');return send(200,{ok:true});
      }
      if(action==='save'){
        if(!Number.isInteger(body.revision)||body.revision!==doc.revision)fail(409,'Меню уже изменено. Скачайте свой черновик и обновите страницу.');
        if(doc.schemaVersion===2&&body.schemaVersion!==2)fail(409,'Каталог обновлён. Скачайте черновик и обновите страницу перед сохранением.');
        const menu=cleanMenu(body);
        const next={...doc,...menu,revision:doc.revision+1,updatedAt:new Date(now()).toISOString()};
        // Keep the previous five menu revisions, never including credentials in the backup.
        const {admin,attempts,history,...previous}=doc;
        next.history=[...(doc.history||[]),previous].slice(-5);
        await writeStore(next,etag);return send(200,{ok:true,revision:next.revision,updatedAt:next.updatedAt});
      }
      if(action==='restore'){
        if(body.revision!==doc.revision)fail(409,'Меню уже изменено. Обновите страницу.');
        const previous=doc.history?.find(x=>x.revision===body.restoreRevision);
        if(!previous)fail(404,'Резервная копия не найдена.');
        const menu=cleanMenu(previous);const {admin,attempts,history,...current}=doc;
        const next={...doc,...menu,revision:doc.revision+1,updatedAt:new Date(now()).toISOString(),history:[...(doc.history||[]),current].slice(-5)};
        await writeStore(next,etag);return send(200,{ok:true});
      }
      fail(404,'Действие не найдено.');
    }catch(e){if(!e.status)console.error('sof-admin',e.constructor.name);return send(e.status||503,{error:e.status?e.message:'Не удалось связаться с хранилищем. Проверьте подключение в Vercel и повторите попытку.'});}
  };
}
