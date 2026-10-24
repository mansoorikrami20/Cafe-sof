import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const objectKey='sof-private/integrations-v1.json';
export function vaultKey(value){
  if(typeof value!=='string'||!(/^[A-Za-z0-9+/]{43}=$/).test(value))throw new Error('Vault key unavailable');
  const key=Buffer.from(value,'base64');if(key.length!==32)throw new Error('Vault key unavailable');return key;
}
export function sealCredentials(credentials,branchId,key){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('sof-iiko-v1:'+branchId));
  const data=Buffer.concat([cipher.update(JSON.stringify(credentials),'utf8'),cipher.final()]);
  return {version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
export function openCredentials(sealed,branchId,key){
  if(!sealed||sealed.version!==1)throw new Error('Invalid encrypted credentials');
  const iv=Buffer.from(sealed.iv,'base64'),tag=Buffer.from(sealed.tag,'base64');if(iv.length!==12||tag.length!==16)throw new Error('Invalid encrypted credentials');
  const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(Buffer.from('sof-iiko-v1:'+branchId));decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.data,'base64')),decipher.final()]).toString('utf8'));
}
export function createVaultStorage({get,put}){return {
  async readVault(){
    const result=await get(objectKey,{access:'private',useCache:false});if(!result)return {vault:{version:1,revision:0,branches:{}},etag:null};
    if(result.statusCode!==200)throw new Error('Vault unavailable');
    const vault=JSON.parse(await new Response(result.stream).text());if(vault.version!==1||!Number.isSafeInteger(vault.revision)||!vault.branches||typeof vault.branches!=='object'||Array.isArray(vault.branches))throw new Error('Invalid vault');
    return {vault,etag:result.blob.etag};
  },
  async writeVault(vault,etag){
    try{await put(objectKey,JSON.stringify(vault),{access:'private',addRandomSuffix:false,contentType:'application/json',allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{})});}
    catch(e){if(/PreconditionFailed|AlreadyExists/.test(e.constructor.name)){const error=new Error('Подключения изменены в другом окне. Обновите состояние.');error.status=409;throw error;}throw e;}
  }
};}
