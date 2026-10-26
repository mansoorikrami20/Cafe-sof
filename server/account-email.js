import {createHmac,randomBytes} from 'node:crypto';
import {equal,fail,hash,passwordRecord} from './core.js';
import {checkPasswordSafety} from './password-safety.js';

export const requiresEmail=env=>env.SOF_REQUIRE_VERIFIED_EMAIL==='1'||env.SOF_REQUIRE_LOGIN_CODE!=='0';
export function mailConfig(env){
  try{
    const origin=new URL(env.SOF_PUBLIC_ORIGIN);
    if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)return null;
    if(!env.RESEND_API_KEY||!env.SOF_EMAIL_FROM||/[\r\n]/.test(env.SOF_EMAIL_FROM))return null;
    return {origin:origin.origin,from:env.SOF_EMAIL_FROM,key:env.RESEND_API_KEY};
  }catch{return null;}
}
export async function sendAccountEmail({to,purpose,token,code,id,config},fetcher=fetch){
  const url=purpose==='login'?'':`${config.origin}/admin#${purpose}=${encodeURIComponent(token)}`;
  const title=purpose==='login'?'Код входа в кабинет «Соф»':purpose==='reset'?'Смена пароля кабинета «Соф»':'Подтверждение почты кабинета «Соф»';
  // Text-only transactional mail: no tracking pixel, user HTML or provider response in logs.
  try{
    const response=await fetcher('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${config.key}`,'Content-Type':'application/json','Idempotency-Key':`sof-account/${id}`},body:JSON.stringify({from:config.from,to:[to],subject:title,text:purpose==='login'?`${title}\n\nВаш код: ${code}\n\nКод действует 5 минут и используется один раз. Никому его не сообщайте. Если вы не входили в кабинет, смените пароль.`:`${title}\n\nОткройте ссылку и подтвердите действие:\n${url}\n\nСсылка действует 15 минут и используется один раз. Если вы не запрашивали это письмо, ничего делать не нужно.`})});
    if(!response.ok)fail(503,'Не удалось отправить письмо. Повторите запрос позже.');
    await response.body?.cancel();
  }catch{fail(503,'Не удалось отправить письмо. Повторите запрос позже.');}
}

const message='Если email совпадает с почтой владельца, на него отправлена ссылка. Проверьте также папку «Спам». Ссылка действует 15 минут.';
const invalid=()=>fail(400,'Ссылка недействительна или устарела. Запросите новое письмо.');
export function createAccountEmail({readStore,writeStore,env,now=Date.now,sendMail=sendAccountEmail,passwordCheck=checkPasswordSafety}){
  async function update(change){
    for(let i=0;i<4;i++){
      const {doc,etag}=await readStore();
      const result=await change(doc);
      try{await writeStore(result.doc,etag);return result.value;}catch(e){if(e.status!==409)throw e;}
    }
    fail(409,'Данные изменились. Повторите действие.');
  }
  function validLink(admin,purpose,token){
    const link=admin?.emailSecurity?.links?.[purpose];
    if(typeof token!=='string'||!/^[-_A-Za-z0-9]{43}$/.test(token)||!link||link.expires<=now()||link.version!==admin.sessionVersion||!equal(link.email,admin.email)||!equal(link.digest,hash(token)))invalid();
    return link;
  }
  return async function accountAction(action,body,req){
    if(['request-reset','request-verification'].includes(action)){
      const config=mailConfig(env);
      if(!config)fail(503,'Отправка писем ещё не подключена. Восстановление доступа будет доступно после настройки почтового сервиса.');
      if(typeof body.email!=='string'||body.email.length>254||!/^\S+@\S+\.\S+$/.test(body.email.trim()))fail(400,'Проверьте email.');
      const email=body.email.trim().toLowerCase(),purpose=action==='request-reset'?'reset':'verify';
      const token=randomBytes(32).toString('base64url'),digest=hash(token);
      const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').split(',')[0].trim();
      const ipKey=createHmac('sha256',env.SOF_SESSION_SECRET).update(ip).digest('hex');
      const recipient=await update(doc=>{
        if(!doc.admin)fail(409,'Сначала настройте вход владельца.');
        const old=doc.admin.emailSecurity||{};
        const requests=Object.fromEntries(Object.entries(old.requests||{}).filter(([,x])=>x.start>now()-15*60000));
        const attempt=requests[ipKey]||{start:now(),count:0};
        const hour=old.hour?.start>now()-3600000?old.hour:{start:now(),count:0};
        if(attempt.count>=5||hour.count>=40)fail(429,'Слишком много запросов писем. Попробуйте через 15 минут.');
        requests[ipKey]={...attempt,count:attempt.count+1};
        const security={...old,requests,hour:{...hour,count:hour.count+1}};
        let to=null;
        // Unknown addresses receive exactly the same response and consume the same request quota.
        if(equal(email,doc.admin.email)&&!(purpose==='verify'&&doc.admin.emailVerifiedAt)){
          const delivery=old.delivery?.start>now()-3600000?old.delivery:{start:now(),count:0,last:0};
          if(delivery.count<6&&(!delivery.last||delivery.last<=now()-60000)){
            security.delivery={...delivery,count:delivery.count+1,last:now()};
            security.links={...old.links,[purpose]:{digest,email:doc.admin.email,version:doc.admin.sessionVersion,expires:now()+15*60000}};
            to=doc.admin.email;
          }
        }
        return {doc:{...doc,admin:{...doc.admin,emailSecurity:security}},value:to};
      });
      if(recipient)await sendMail({to:recipient,purpose,token,id:digest,config});
      return {ok:true,message};
    }
    if(['reset-password','verify-email'].includes(action)){
      const purpose=action==='reset-password'?'reset':'verify';
      // Check before the costly password hash, then recheck against the latest ETag before writing.
      const {doc}=await readStore();validLink(doc.admin,purpose,body.token);
      if(purpose==='reset')await passwordCheck(body.password);
      const replacement=purpose==='reset'?await passwordRecord(doc.admin.email,body.password):null;
      await update(latest=>{
        validLink(latest.admin,purpose,body.token);
        const admin={...latest.admin,...replacement,sessionVersion:latest.admin.sessionVersion+1,emailVerifiedAt:new Date(now()).toISOString(),emailSecurity:{...latest.admin.emailSecurity,links:{}}};
        return {doc:{...latest,admin,...(purpose==='reset'?{attempts:{}}:{})}};
      });
      return {ok:true,message:purpose==='reset'?'Пароль изменён, почта подтверждена. Войдите с новым паролем.':'Почта подтверждена. Теперь войдите в кабинет.'};
    }
    return null;
  };
}
