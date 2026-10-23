import {readStore,connected} from '../server/storage.js';
import {publicMenu} from '../server/core.js';
import {initialMenu} from '../server/seed.js';
export function createCatalogHandler({readStore,connected,now=Date.now}){return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Требуется GET.'});}
  const branchId=req.query?.branch;
  if(branchId!==undefined&&(typeof branchId!=='string'||!/^branch-[1-4]$/.test(branchId)))return res.status(400).json({error:'Некорректный филиал.'});
  let doc=initialMenu,isConnected=false,notice='Демонстрационное меню. Заказы и оплата не подключены.';
  if(connected()){
    try{doc=(await readStore()).doc;isConnected=!!doc.admin;}
    catch{notice='Хранилище недоступно. Показана демонстрационная версия меню.';}
  }
  try{return res.status(200).json({...publicMenu(doc,{branchId,now:now()}),connected:isConnected,orderingConnected:false,...(!isConnected?{notice}:{})});}
  catch(error){return res.status(error.status||503).json({error:error.status?error.message:'Каталог недоступен.'});}
};}
export default createCatalogHandler({readStore,connected});
