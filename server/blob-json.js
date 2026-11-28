// A compressed HTTP representation may have a weak ETag. Such a validator cannot
// be used for If-Match writes. Request identity encoding, and fail closed if the
// provider still does not return a usable version; never substitute a later HEAD.
export async function readPrivateJSON(get,key){
  const result=await get(key,{access:'private',useCache:false,headers:{'Accept-Encoding':'identity'}});
  if(!result)return null;
  if(result.statusCode!==200)throw new Error('Storage unavailable');
  const etag=result.blob?.etag;
  if(typeof etag!=='string'||!etag||/^W\//i.test(etag)){
    await result.stream?.cancel();
    throw new Error('Strong storage version unavailable');
  }
  return {value:JSON.parse(await new Response(result.stream).text()),etag};
}
