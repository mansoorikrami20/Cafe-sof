import {createHash,createHmac,randomBytes,scrypt as rawScrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(rawScrypt);
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function fail(status,message){const e=new Error(message);e.status=status;throw e;}
export function equal(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function text(value,label,max=160,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(400,`Проверьте поле «${label}».`);return value.trim();}
export function cleanMenu(input){
  if(!input||!Array.isArray(input.dishes)||!Array.isArray(input.categories)||!input.settings)fail(400,'Некорректные данные меню.');
  if(input.dishes.length>500||input.categories.length>40||!input.categories.length)fail(400,'Допускается до 500 блюд и от 1 до 40 категорий.');
  const id=v=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(v))fail(400,'Некорректный идентификатор.');return v;};
  const categoryIds=new Set();
  const categories=input.categories.map(c=>{const k=id(c.id);if(categoryIds.has(k))fail(400,'Категории не должны повторяться.');categoryIds.add(k);return {id:k,name:text(c.name,'Название категории',60,true)};});
  if(new Set(categories.map(c=>c.name.toLowerCase())).size!==categories.length)fail(400,'Названия категорий не должны повторяться.');
  const ids=new Set();
  const dishes=input.dishes.map(d=>{
    const k=id(d.id);if(ids.has(k))fail(400,'Блюда не должны повторяться.');ids.add(k);
    if(!categoryIds.has(d.categoryId))fail(400,'Выберите существующую категорию блюда.');
    if(!Number.isFinite(d.price)||d.price<0||d.price>100000||Math.abs(Math.round(d.price*100)-d.price*100)>0.000001)fail(400,'Цена должна быть от 0 до 100 000 ₽, не более двух знаков после запятой.');
    if(typeof d.available!=='boolean'||typeof d.published!=='boolean')fail(400,'Проверьте доступность блюда.');
    const imageUrl=text(d.imageUrl||'','Фото',200);
    if(imageUrl&&!/^\/assets\/[a-z0-9_-]+\.(webp|png)$/.test(imageUrl)&&!/^\/api\/media\?id=[a-f0-9-]{36}\.(png|webp|jpg)$/.test(imageUrl))fail(400,'Используйте загруженную фотографию.');
    return {id:k,name:text(d.name,'Название блюда',120,true),price:d.price,weight:text(d.weight||'','Вес',40),categoryId:d.categoryId,desc:text(d.desc||'','Описание',1500),imageUrl,available:d.available,published:d.published};
  });
  const settings=Object.fromEntries(['name','tagline','phone','address','hours','deliveryNote'].map(k=>[k,text(input.settings[k]||'',k,k==='deliveryNote'?600:180,k==='name')]));
  return {categories,dishes,settings};
}
export function publicMenu(doc){return {revision:doc.revision,updatedAt:doc.updatedAt,settings:doc.settings,categories:doc.categories,dishes:doc.dishes.filter(d=>d.published)};}
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
export function verifySession(token,admin,secret,now=Date.now()){
  if(!admin||!secret||typeof token!=='string'||token.length>2000)return false;
  const parts=token.split('.');if(parts.length!==2)return false;
  if(!equal(parts[1],createHmac('sha256',secret).update(parts[0]).digest('base64url')))return false;
  try{const p=JSON.parse(Buffer.from(parts[0],'base64url').toString());return Number.isFinite(p.exp)&&p.exp>now&&p.exp<=now+8*3600000&&p.v===admin.sessionVersion&&equal(p.email,admin.email);}catch{return false;}
}
