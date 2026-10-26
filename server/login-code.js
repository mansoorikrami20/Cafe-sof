import {createHmac,randomBytes,randomInt} from 'node:crypto';
import {equal,fail,hash} from './core.js';
import {mailConfig,sendAccountEmail} from './account-email.js';

export const requiresLoginCode=env=>env.SOF_REQUIRE_LOGIN_CODE!=='0';
export function createLoginCode({readStore,writeStore,env,now=Date.now,sendMail=sendAccountEmail}){
  const digest=(challenge,code)=>createHmac('sha256',env.SOF_SESSION_SECRET).update(`${challenge}:${code}`).digest('hex');
  async function update(change){
    for(let i=0;i<4;i++){
      const {doc,etag}=await readStore();const result=change(doc);
      try{await writeStore(result.doc,etag);return result.value;}catch(e){if(e.status!==409)throw e;}
    }
    fail(409,'Данные изменились. Повторите вход.');
  }
  return {
    async begin(expected){
      const config=mailConfig(env);
      if(!config)fail(503,'Подтверждение входа по почте пока недоступно. Обратитесь к владельцу сервиса.');
      const challenge=randomBytes(32).toString('base64url'),key=hash(challenge),code=String(randomInt(0,1000000)).padStart(6,'0');
      await update(doc=>{
        const admin=doc.admin;
        if(!admin||!equal(admin.passwordHash,expected.passwordHash)||admin.sessionVersion!==expected.sessionVersion)fail(401,'Повторите вход.');
        const security=admin.emailSecurity||{},old=security.loginDelivery;
        const delivery=old?.start>now()-3600000?old:{start:now(),count:0,last:0};
        if(delivery.count>=6||(delivery.last&&delivery.last>now()-60000))fail(429,'Код уже отправлен. Подождите минуту перед новым запросом.');
        const challenges=Object.fromEntries(Object.entries(security.loginChallenges||{}).filter(([,v])=>v.expires>now()));
        challenges[key]={digest:digest(challenge,code),expires:now()+5*60000,version:admin.sessionVersion,attempts:0};
        return {doc:{...doc,admin:{...admin,emailSecurity:{...security,loginChallenges:challenges,loginDelivery:{...delivery,count:delivery.count+1,last:now()}}}}};
      });
      await sendMail({to:expected.email,purpose:'login',code,id:key,config});
      return {ok:true,loginCodeRequired:true,challenge,expiresIn:300};
    },
    async verify(challenge,code){
      if(typeof challenge!=='string'||!/^[-_A-Za-z0-9]{43}$/.test(challenge)||typeof code!=='string'||!/^\d{6}$/.test(code))fail(400,'Введите шестизначный код из письма.');
      const result=await update(doc=>{
        const admin=doc.admin,security=admin?.emailSecurity||{},key=hash(challenge),entry=security.loginChallenges?.[key];
        if(!entry||entry.expires<=now()||entry.version!==admin.sessionVersion||entry.attempts>=5)fail(400,'Код недействителен или устарел. Повторите вход.');
        const challenges={...security.loginChallenges};
        const valid=equal(entry.digest,digest(challenge,code));
        if(valid||entry.attempts+1>=5)delete challenges[key];else challenges[key]={...entry,attempts:entry.attempts+1};
        return {doc:{...doc,admin:{...admin,emailSecurity:{...security,loginChallenges:challenges}}},value:valid?admin:null};
      });
      if(!result)fail(400,'Неверный код. Проверьте письмо или повторите вход.');
      return result;
    }
  };
}
