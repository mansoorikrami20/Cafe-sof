import {get,put} from '@vercel/blob';
import {initialMenu} from './seed.js';
const key='sof-private/catalog-v1.json';
export const connected=()=>!!(process.env.BLOB_READ_WRITE_TOKEN||process.env.BLOB_STORE_ID);
export function createStorage({get,put}){return {async readStore(){
  const result=await get(key,{access:'private',useCache:false});
  if(!result)return {doc:structuredClone(initialMenu),etag:null};
  if(result.statusCode!==200)throw new Error('Storage unavailable');
  return {doc:JSON.parse(await new Response(result.stream).text()),etag:result.blob.etag};
},async writeStore(doc,etag){
  try{await put(key,JSON.stringify(doc),{access:'private',addRandomSuffix:false,contentType:'application/json',allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{})});}
  catch(e){if(/PreconditionFailed|AlreadyExists/.test(e.constructor.name)){const error=new Error('Меню уже изменено в другом окне. Обновите данные перед сохранением.');error.status=409;throw error;}throw e;}
}};}
export const {readStore,writeStore}=createStorage({get,put});
