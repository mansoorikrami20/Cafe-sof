import {createHash,createHmac,randomBytes,scrypt as rawScrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(rawScrypt);
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function fail(status,message){const e=new Error(message);e.status=status;throw e;}
export function equal(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function text(value,label,max=160,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(400,`Проверьте поле «${label}».`);return value.trim();}
export {cleanMenu,publicMenu} from './catalog.js';
export async function passwordRecord(email,password){
  email=text(email,'Email',254,true).toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Проверьте email.');
  if(typeof password!=='string'||password.length<12||password.length>128)fail(400,'Пароль должен содержать от 12 до 128 символов.');
  const salt=randomBytes(24).toString('hex');
  return {email,salt,passwordHash:(await scrypt(password,salt,64)).toString('hex'),sessionVersion:1};
}
export async function verifyPassword(admin,email,password){
  if(typeof password!=='string'||password.length>128||typeof email!=='string')return false;
  const candidate=(await scrypt(password,admin.salt,64)).toString('hex');
  return equal(candidate,admin.passwordHash)&&equal(admin.email,email.trim().toLowerCase());
}
export function signSession(admin,secret,now=Date.now()){
  const payload=Buffer.from(JSON.stringify({exp:now+8*3600000,v:admin.sessionVersion,email:admin.email})).toString('base64url');
  return payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
}
export function verifySession(token,admin,secret,now=Date.now(),requireVerifiedEmail=false){
  if(!admin||!secret||typeof token!=='string'||token.length>2000)return false;
  if(requireVerifiedEmail&&!admin.emailVerifiedAt)return false;
  const parts=token.split('.');if(parts.length!==2)return false;
  if(!equal(parts[1],createHmac('sha256',secret).update(parts[0]).digest('base64url')))return false;
  try{const p=JSON.parse(Buffer.from(parts[0],'base64url').toString());return Number.isFinite(p.exp)&&p.exp>now&&p.exp<=now+8*3600000&&p.v===admin.sessionVersion&&equal(p.email,admin.email);}catch{return false;}
}
