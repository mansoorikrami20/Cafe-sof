import {readStore,connected} from '../server/storage.js';
import {publicMenu} from '../server/core.js';
import {initialMenu} from '../server/seed.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Требуется GET.'});}
  if(!connected())return res.status(200).json({...publicMenu(initialMenu),connected:false});
  try{const {doc}=await readStore();return res.status(200).json({...publicMenu(doc),connected:!!doc.admin});}
  catch{return res.status(200).json({...publicMenu(initialMenu),connected:false,notice:'Хранилище недоступно. Показана демонстрационная версия меню.'});}
}
