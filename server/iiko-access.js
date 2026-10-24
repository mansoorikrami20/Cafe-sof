const baseUrl='https://api-ru.iiko.services';
export class IikoFailure extends Error{constructor(code,message){super(message);this.code=code;}}
async function request(fetchImpl,path,body,token){
  let response;
  try{response=await fetchImpl(baseUrl+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',Timeout:'10',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});}
  catch{throw new IikoFailure('unavailable','iiko не ответила. Проверьте доступность сервиса и повторите позже.');}
  if(!response.ok){if(response.status===401||response.status===400)throw new IikoFailure('credentials','iiko отклонила реквизиты. Проверьте App ID, Client Secret и API-ключ.');if(response.status===403)throw new IikoFailure('access','iiko запретила доступ. Проверьте разрешения приложения и разрешённые IP-адреса.');if(response.status===429)throw new IikoFailure('rate','Лимит iiko исчерпан. Повторите проверку позже.');throw new IikoFailure('unavailable','Сервис iiko временно недоступен.');}
  try{const text=await response.text();if(text.length>1048576)throw new Error('Response too large');return JSON.parse(text);}catch{throw new IikoFailure('response','iiko вернула неожиданный ответ. Повторите позже.');}
}
export async function checkIikoAccess(credentials,organizationId,{fetchImpl=fetch}={}){
  const auth=await request(fetchImpl,'/api/v2/access_token',credentials);
  if(typeof auth.token!=='string'||!auth.token||auth.token.length>20000)throw new IikoFailure('response','iiko не вернула токен доступа.');
  const result=await request(fetchImpl,'/api/1/organizations',{},auth.token);
  if(!Array.isArray(result.organizations)||result.organizations.length>500)throw new IikoFailure('response','Не удалось получить список организаций iiko.');
  const organizations=result.organizations.filter(o=>o&&typeof o.id==='string'&&/^[a-f0-9-]{36}$/i.test(o.id)&&typeof o.name==='string').map(o=>({id:o.id,name:o.name.slice(0,180)}));
  if(!organizations.length)throw new IikoFailure('organizations','API-ключ не даёт доступа ни к одной организации.');
  if(organizationId&&!organizations.some(o=>o.id.toLowerCase()===organizationId.toLowerCase()))throw new IikoFailure('organization','У ключа нет доступа к организации, указанной в настройках филиала.');
  return {organizations,organizationMatched:!!organizationId};
}
