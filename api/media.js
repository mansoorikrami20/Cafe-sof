import {get,put} from '@vercel/blob';
import {randomUUID} from 'node:crypto';
import {readStore,connected} from '../server/storage.js';
import {verifySession,fail} from '../server/core.js';
export function createMediaHandler({get,put,readStore,connected,sessionSecret=()=>process.env.SOF_SESSION_SECRET,requireVerifiedEmail=()=>process.env.SOF_REQUIRE_VERIFIED_EMAIL==='1',now=Date.now}){return async function handler(req,res){
  res.setHeader('X-Content-Type-Options','nosniff');
  try{
    if(!connected())fail(503,'Хранилище не подключено.');
    if(req.method==='GET'){
      const id=req.query?.id;
      if(typeof id!=='string'||!/^[a-f0-9-]{36}\.(png|webp|jpg)$/.test(id))fail(404,'Фото не найдено.');
      const result=await get('menu-images/'+id,{access:'private'});
      if(!result||result.statusCode!==200)fail(404,'Фото не найдено.');
      res.setHeader('Content-Type',result.blob.contentType||'application/octet-stream');res.setHeader('Cache-Control','public, max-age=86400, immutable');
      const reader=result.stream.getReader();while(true){const {done,value}=await reader.read();if(done)break;res.write(Buffer.from(value));}return res.end();
    }
    if(req.method!=='POST')fail(405,'Метод не поддерживается.');
    if(req.headers.origin!==`https://${req.headers.host}`||req.headers['x-sof-admin']!=='1'||!(req.headers['content-type']||'').startsWith('application/json'))fail(403,'Запрос отклонён.');
    const {doc}=await readStore();const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sof_admin='));
    if(!verifySession(cookie?.slice(10)||'',doc.admin,sessionSecret(),now(),requireVerifiedEmail()))fail(401,'Войдите в кабинет.');
    const data=req.body?.data;if(typeof data!=='string'||data.length>2800000||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))fail(400,'Фото должно быть в формате JPEG, PNG или WebP, до 2 МБ.');
    const bytes=Buffer.from(data,'base64');if(bytes.length>2097152||bytes.length<12)fail(400,'Фото должно быть до 2 МБ.');
    const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
    if(!png&&!jpg&&!webp)fail(400,'Разрешены только JPEG, PNG и WebP.');
    const ext=png?'png':jpg?'jpg':'webp',id=randomUUID()+'.'+ext;
    await put('menu-images/'+id,bytes,{access:'private',addRandomSuffix:false,contentType:'image/'+(jpg?'jpeg':ext)});
    res.setHeader('Cache-Control','no-store');return res.status(200).json({imageUrl:'/api/media?id='+id});
  }catch(e){res.setHeader('Cache-Control','no-store');return res.status(e.status||503).json({error:e.status?e.message:'Не удалось загрузить фото. Попробуйте ещё раз.'});}
};}
export default createMediaHandler({get,put,readStore,connected});
