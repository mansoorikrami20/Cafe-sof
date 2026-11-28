// Versioned catalog shared by management, backups and the public projection.
export function defaultBranches(){return Array.from({length:4},(_,index)=>({id:`branch-${index+1}`,name:'',address:'',phone:'',opensAt:'09:00',closesAt:'00:00',breakfastUntil:'11:00',enabled:false,deliveryNote:'',iiko:{organizationId:'',terminalGroupId:''}}));}
const invalid=message=>{const error=new Error(message);error.status=400;throw error;};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function string(value,label,max=180,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))invalid(`Проверьте поле «${label}».`);return value.trim();}
function id(value){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(value))invalid('Некорректный идентификатор.');return value;}
function bool(value,label){if(typeof value!=='boolean')invalid(`Проверьте поле «${label}».`);return value;}
function number(value,label,max=100000,decimals=2){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max||Math.abs(Math.round(value*10**decimals)-value*10**decimals)>0.000001)invalid(`Проверьте поле «${label}»: число от 0 до ${max}, до ${decimals} знаков после запятой.`);return value;}
function unique(list,label){if(new Set(list.map(x=>x.id)).size!==list.length)invalid(`${label}: идентификаторы не должны повторяться.`);return list;}
function categories(input){if(!Array.isArray(input)||input.length<1||input.length>40)invalid('Нужно от 1 до 40 категорий в каждом каталоге.');const result=unique(input.map(c=>{if(!object(c))invalid('Некорректная категория.');return {id:id(c.id),name:string(c.name,'Категория',60,true)};}),'Категории');if(new Set(result.map(c=>c.name.toLowerCase())).size!==result.length)invalid('Названия категорий не должны повторяться.');return result;}
function time(value){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))invalid('Укажите время в формате ЧЧ:ММ.');return value;}
export function cleanMenu(input){
  if(!object(input)||!object(input.settings))invalid('Некорректные данные меню.');
  if(input.schemaVersion!==undefined&&input.schemaVersion!==2)invalid('Неизвестная версия каталога. Обновите страницу.');
  if(input.schemaVersion===2&&(!Array.isArray(input.branches)||!Array.isArray(input.products)||!Array.isArray(input.productCategories)))invalid('Передайте полный каталог с товарами и четырьмя филиалами.');
  const dishCategories=categories(input.categories),productCategories=categories(input.productCategories??[{id:'groceries',name:'Продукты'}]);
  const rawBranches=input.branches??defaultBranches();
  if(!Array.isArray(rawBranches)||rawBranches.length!==4)invalid('Настройте ровно четыре филиала.');
  const branchIds=new Set(defaultBranches().map(b=>b.id));
  const branches=unique(rawBranches.map(b=>{
    if(!object(b)||!branchIds.has(b.id))invalid('Неизвестный филиал.');
    const enabled=bool(b.enabled,'Филиал активен');
    if(!object(b.iiko??{}))invalid('Некорректные настройки iiko.');
    return {id:b.id,name:string(b.name,'Название филиала',120,enabled),address:string(b.address,'Адрес',180,enabled),phone:string(b.phone,'Телефон',80),opensAt:time(b.opensAt),closesAt:time(b.closesAt),breakfastUntil:time(b.breakfastUntil),enabled,deliveryNote:string(b.deliveryNote,'Доставка',600),iiko:{organizationId:string(b.iiko?.organizationId??'','Организация iiko',120),terminalGroupId:string(b.iiko?.terminalGroupId??'','Терминальная группа iiko',120)}};
  }),'Филиалы');
  const allIds=new Set();
  function items(list,cats,product=false){
    if(!Array.isArray(list)||list.length>500)invalid('Допускается до 500 позиций в каждом каталоге.');
    const catIds=new Set(cats.map(c=>c.id));
    return list.map(d=>{
      if(!object(d))invalid('Некорректная позиция каталога.');
      const key=id(d.id);if(allIds.has(key))invalid('Идентификаторы блюд и товаров не должны повторяться.');allIds.add(key);
      if(!catIds.has(d.categoryId))invalid('Выберите существующую категорию.');
      const imageUrl=string(d.imageUrl??'','Фото',200);
      if(imageUrl&&!/^\/assets\/[a-z0-9_-]+\.(webp|png)$/.test(imageUrl)&&!/^\/api\/media\?id=[a-f0-9-]{36}\.(png|webp|jpg)$/.test(imageUrl))invalid('Используйте загруженную фотографию.');
      const source=d.branchOverrides??{};if(!object(source)||Object.keys(source).some(k=>!branchIds.has(k)))invalid('Неизвестный филиал в доступности позиции.');
      const branchOverrides=Object.fromEntries(Object.entries(source).map(([key,value])=>{
        if(!object(value))invalid('Некорректная доступность филиала.');
        return [key,{assigned:bool(value.assigned,'Ассортимент филиала'),published:bool(value.published,'Видимость филиала'),available:bool(value.available,'Наличие филиала'),price:value.price==null?null:number(value.price,'Цена филиала'),...(product?{stock:value.stock==null?null:number(value.stock,'Остаток филиала',1000000,3)}:{})}];
      }));
      const item={id:key,name:string(d.name,'Название',120,true),price:number(d.price,'Цена'),weight:string(d.weight??'','Вес / количество',40),categoryId:d.categoryId,desc:string(d.desc??'','Описание',1500),imageUrl,available:bool(d.available,'Наличие'),published:bool(d.published,'Публикация'),branchOverrides};
      if(product){if(!['шт','кг','л'].includes(d.unit))invalid('Единица товара: шт, кг или л.');item.unit=d.unit;item.stock=d.stock==null?null:number(d.stock,'Остаток',1000000,3);}
      else item.breakfast=bool(d.breakfast??false,'Завтрак');
      return item;
    });
  }
  const dishes=items(input.dishes,dishCategories),products=items(input.products??[],productCategories,true);
  const settings=Object.fromEntries(['name','tagline','phone','address','hours','deliveryNote'].map(k=>[k,string(input.settings[k]??'',k,k==='deliveryNote'?600:180,k==='name')]));
  settings.logoUrl=string(input.settings.logoUrl??'','Логотип',200);
  if(settings.logoUrl&&!/^\/api\/media\?id=[a-f0-9-]{36}\.(png|webp|jpg)$/.test(settings.logoUrl))invalid('Используйте логотип, загруженный в кабинете.');
  const paymentMethods=input.settings.enabledPaymentMethods??['card','sbp','cash','terminal'];
  const allowedPaymentMethods=new Set(['card','sbp','cash','terminal']);
  if(!Array.isArray(paymentMethods)||paymentMethods.length>allowedPaymentMethods.size||paymentMethods.some(method=>!allowedPaymentMethods.has(method))||new Set(paymentMethods).size!==paymentMethods.length)invalid('Проверьте подключённые способы оплаты.');
  settings.enabledPaymentMethods=[...paymentMethods];
  return {schemaVersion:2,categories:dishCategories,productCategories,dishes,products,branches,settings};
}
export function publicMenu(doc,{branchId,now=Date.now()}={}){
  const menu=cleanMenu(doc);
  const branch=branchId?menu.branches.find(b=>b.id===branchId&&b.enabled):null;
  if(branchId&&!branch){const e=new Error('Филиал недоступен. Выберите другой филиал.');e.status=404;throw e;}
  const localTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
  const project=list=>list.filter(d=>d.published&&(!branch||(d.branchOverrides[branch.id]?.assigned&&d.branchOverrides[branch.id]?.published))).map(d=>{
    const override=branch?d.branchOverrides[branch.id]:null;
    const stock=override?.stock??d.stock;
    const available=d.available&&(!override||override.available)&&(stock===undefined||stock===null||stock>0)&&(!d.breakfast||localTime<(branch?.breakfastUntil??'11:00'));
    const {branchOverrides,...item}=d;
    return {...item,price:override?.price??d.price,available,...(d.unit?{stock:stock??null}:{})};
  });
  const publicBranch=b=>({id:b.id,name:b.name,address:b.address,phone:b.phone,opensAt:b.opensAt,closesAt:b.closesAt,breakfastUntil:b.breakfastUntil,deliveryNote:b.deliveryNote});
  return {schemaVersion:2,revision:doc.revision,updatedAt:doc.updatedAt,settings:branch?{...menu.settings,address:branch.address,phone:branch.phone,hours:`${branch.opensAt}–${branch.closesAt}`,deliveryNote:branch.deliveryNote}:menu.settings,categories:menu.categories,productCategories:menu.productCategories,dishes:project(menu.dishes),products:project(menu.products),branches:menu.branches.filter(b=>b.enabled).map(publicBranch),branch:branch?publicBranch(branch):null};
}
