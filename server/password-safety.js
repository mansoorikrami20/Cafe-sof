import {createHash} from 'node:crypto';
import {fail} from './core.js';

export async function checkPasswordSafety(password,{fetcher=fetch}={}){
  if(typeof password!=='string'||[...password].length<15||password.length>128)
    fail(400,'Используйте уникальную парольную фразу от 15 до 128 символов.');
  // Only five SHA-1 characters leave the server, never the password or full hash.
  const digest=createHash('sha1').update(password).digest('hex').toUpperCase();
  let body;
  try{
    const response=await fetcher(`https://api.pwnedpasswords.com/range/${digest.slice(0,5)}`,{
      headers:{'Add-Padding':'true'},redirect:'error',signal:AbortSignal.timeout(5000)
    });
    if(!response.ok)throw new Error('unavailable');
    body=await response.text();
    if(body.length>200000||!body.trim()||body.trim().split(/\r?\n/).some(line=>!(/^[A-F0-9]{35}:\d+$/.test(line))))throw new Error('invalid response');
  }catch{fail(503,'Проверка безопасности пароля временно недоступна. Попробуйте позже.');}
  if(body.split(/\r?\n/).some(line=>{const [suffix,count]=line.split(':');return suffix===digest.slice(5)&&Number(count)>0;}))
    fail(400,'Этот пароль встречается в известных утечках. Придумайте другую уникальную парольную фразу.');
}
