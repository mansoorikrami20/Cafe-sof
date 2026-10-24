import {fail,verifySession} from './core.js';
import {vaultKey,sealCredentials,openCredentials} from './integration-vault.js';
import {checkIikoAccess,IikoFailure} from './iiko-access.js';
const fields=['appId','clientSecret','apiKey'];
function credentials(body,previous){return Object.fromEntries(fields.map(name=>{
  const value=body[name];if(value!==undefined&&(typeof value!=='string'||value.length>(name==='appId'?256:4096)||/[\x00-\x1f\x7f]/.test(value)))fail(400,'Проверьте реквизиты iiko.');
  const next=value?.trim()||previous?.[name];if(typeof next!=='string'||!next)fail(400,'Для первого сохранения заполните все три поля iiko.');return [name,next];
}));}
function snapshot(vault,branches){return {revision:vault.revision,branches:branches.map((b,index)=>{
  const record=vault.branches[b.id],organizationId=b.iiko?.organizationId||'';
  const status=record?.status==='verified'&&(record.verifiedOrganizationId||'')!==organizationId?'saved':record?.status||'empty';
  return {id:b.id,name:b.name||`Филиал ${index+1}`,organizationId,configured:!!record?.sealed,status,checkedAt:record?.checkedAt||null,errorCode:record?.errorCode||null,organizationMatched:status==='verified'&&!!record?.organizationMatched,organizations:status==='verified'?record.organizations||[]:[],message:status==='saved'?'Реквизиты сохранены. Доступ ещё не проверен.':status==='verified'?'Авторизация iiko проверена.':status==='checking'?'Проверка начата. Обновите состояние.':status==='error'?'Проверка не прошла. Повторите проверку для подробностей.':'Реквизиты не добавлены.'};
})};}
export function createIntegrationsHandler({readStore,connected,readVault,writeVault,env=process.env,now=Date.now,checkAccess=checkIikoAccess}){return async function(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status,body)=>res.status(status).json(body);
  try{
    if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');fail(405,'Метод не поддерживается.');}
    if(req.method==='POST'&&(req.headers.origin!==`https://${req.headers.host}`||!req.headers.host||req.headers['x-sof-admin']!=='1'||!(req.headers['content-type']||'').startsWith('application/json')))fail(403,'Запрос отклонён. Обновите страницу.');
    if(!connected())fail(503,'Хранилище не подключено.');
    const {doc}=await readStore();
    const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sof_admin='));
    if(!verifySession(cookie?.slice(10)||'',doc.admin,env.SOF_SESSION_SECRET,now()))fail(401,'Войдите в кабинет владельца.');
    let key;try{key=vaultKey(env.SOF_INTEGRATION_SECRET);}catch{fail(503,'Хранилище ключей ещё не настроено на сервере.');}
    const branches=Array.isArray(doc.branches)?doc.branches:[];
    const {vault,etag}=await readVault();
    if(req.method==='GET')return send(200,snapshot(vault,branches));
    const body=req.body;if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>16000)fail(400,'Некорректный запрос.');
    const branch=branches.find(b=>b.id===body.branchId);if(!branch)fail(400,'Сначала сохраните филиал в каталоге.');
    if(!Number.isSafeInteger(body.revision)||body.revision!==vault.revision)fail(409,'Подключения изменены. Обновите состояние перед сохранением.');
    const action=req.query?.action,record=vault.branches[branch.id];
    const commit=async(next,version=etag)=>{await writeVault(next,version);return next;};
    if(action==='save'){
      const previous=record?.sealed?openCredentials(record.sealed,branch.id,key):null;
      const next={...vault,revision:vault.revision+1,branches:{...vault.branches,[branch.id]:{sealed:sealCredentials(credentials(body,previous),branch.id,key),status:'saved',savedAt:new Date(now()).toISOString()}}};
      await commit(next);return send(200,{ok:true,...snapshot(next,branches)});
    }
    if(action==='disconnect'){
      const next={...vault,revision:vault.revision+1,branches:{...vault.branches}};delete next.branches[branch.id];await commit(next);return send(200,{ok:true,...snapshot(next,branches)});
    }
    if(action!=='check')fail(404,'Действие не найдено.');
    if(!record?.sealed)fail(400,'Сначала сохраните реквизиты iiko.');
    const lastAttempt=vault.attempts?.[branch.id]??record.lastAttemptAt;
    if(lastAttempt!=null&&now()-lastAttempt<10000)fail(429,'Подождите 10 секунд перед повторной проверкой.');
    const started={...vault,revision:vault.revision+1,attempts:{...vault.attempts,[branch.id]:now()},branches:{...vault.branches,[branch.id]:{...record,status:'checking',lastAttemptAt:now()}}};
    await commit(started);
    const current=await readVault();if(current.vault.revision!==started.revision)fail(409,'Подключения изменены во время проверки. Обновите состояние.');
    let result,error;
    try{result=await checkAccess(openCredentials(record.sealed,branch.id,key),branch.iiko?.organizationId||'');}
    catch(e){error=e instanceof IikoFailure?e:new IikoFailure('unavailable','Проверка iiko не завершена. Повторите позже.');}
    const checkedAt=new Date(now()).toISOString();
    const next={...started,revision:started.revision+1,branches:{...started.branches,[branch.id]:{...started.branches[branch.id],status:error?'error':'verified',checkedAt,errorCode:error?.code||null,verifiedOrganizationId:branch.iiko?.organizationId||'',organizationMatched:result?.organizationMatched||false,organizations:result?.organizations||[]}}};
    await commit(next,current.etag);
    return send(error?502:200,{ok:!error,...(error?{error:error.message}:{}),...snapshot(next,branches)});
  }catch(e){return send(e.status||503,{error:e.status?e.message:'Не удалось открыть хранилище ключей. Повторите позже.'});}
};}
