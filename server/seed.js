import {defaultBranches} from './catalog.js';
export const initialMenu = {
  schemaVersion: 2,
  branches: defaultBranches(),
  productCategories: [{id:'groceries',name:'Продукты'}],
  products: [],
  revision: 0,
  updatedAt: null,
  settings: {name:'Соф',tagline:'Закажите в «Соф».',phone:'',address:'',hours:'',deliveryNote:'',logoUrl:'',enabledPaymentMethods:['card','sbp','cash','terminal'],showCourierTips:false},
  categories: [{id:'hot',name:'Горячее'},{id:'soups',name:'Супы'},{id:'breakfast',name:'Завтраки'},{id:'salads',name:'Салаты'},{id:'sides',name:'Гарниры'},{id:'fast-food',name:'Фастфуд'}],
  dishes: [
    {id:'plov',name:'Плов',price:450,weight:'450 г',categoryId:'hot',desc:'Состав блюда уточняется перед запуском.',imageUrl:'/assets/plov-cutout.webp',available:true,published:true},
    {id:'kazan',name:'Казан-кебаб из говядины',price:550,weight:'400 г',categoryId:'hot',desc:'Говядина с картофелем. Полный состав уточняется перед запуском.',imageUrl:'/assets/kazan-cutout.webp',available:true,published:true},
    {id:'shurpa',name:'Шурпа из говядины',price:400,weight:'450 г',categoryId:'soups',desc:'Порция 450 г, мясо 120 г. Полный состав уточняется.',imageUrl:'/assets/shurpa-cutout.webp',available:true,published:true},
    {id:'roast',name:'Жаркое из говядины',price:500,weight:'450 г',categoryId:'hot',desc:'Полный состав уточняется перед запуском.',imageUrl:'/assets/roast-cutout.webp',available:true,published:true},
    {id:'fatir',name:'Фатир-шурпа',price:500,weight:'600 г',categoryId:'soups',desc:'Полный состав уточняется перед запуском.',imageUrl:'/assets/fatir-cutout.webp',available:true,published:true},
    {id:'lamb',name:'Казан-кебаб из баранины',price:600,weight:'400 г',categoryId:'hot',desc:'Полный состав уточняется.',imageUrl:'',available:true,published:true}
  ]
};

// Only unambiguous positions from docs/sources/menu-prices.txt.
// No ingredient lists or substitute photographs are inferred from dish names.
const priceList = [
  ['eggs-sausages','Яйцо с сосисками',350,'2 яйца / 2 сосиски','breakfast'],
  ['rice-porridge','Каша рисовая',300,'300 г','breakfast'],
  ['breakfast-potato-egg','Картошка с яйцом',350,'400 г','breakfast'],
  ['pancakes','Блинчики',250,'4 шт.','breakfast'],
  ['sour-cream','Сметана',150,'120 г','breakfast'],
  ['jam','Варенье',150,'60 г','breakfast'],
  ['english-breakfast','Английский завтрак',450,'','breakfast'],
  ['mastava','Мастава',350,'400 г','soups'],
  ['borscht','Борщ',350,'400 г','soups'],
  ['bean-soup','Суп фасолевый',400,'400 г','soups'],
  ['manty','Манты',450,'400 г / 5 шт.','hot'],
  ['tabaka-whole','Табака целый',900,'700 г','hot'],
  ['tabaka-half','Табака половина',450,'350 г','hot'],
  ['lamb-roast','Жаркое из баранины',500,'450 г','hot'],
  ['homestyle-meat','Мясо по-домашнему',500,'400 г','hot'],
  ['jiz-biz','Жиз-биз',500,'400 г','hot'],
  ['potato-egg','Картошка с яйцом',350,'400 г','hot'],
  ['potato-mushrooms','Картошка с грибами',400,'400 г','hot'],
  ['vegetable-salad','Салат овощной',250,'200 г','salads'],
  ['vegetable-chaka','Салат овощной с чакой',300,'300 г','salads'],
  ['achichuk','Салат ачичук',250,'200 г','salads'],
  ['chaka','Чака',200,'200 г','salads'],
  ['caesar','Салат Цезарь',300,'250 г','salads'],
  ['olivier','Салат оливье',250,'200 г','salads'],
  ['pickles','Салат солёный ассорти',200,'250 г','salads'],
  ['korean-carrot','Салат морковный по-корейски',200,'200 г','salads'],
  ['salted-cabbage','Салат солёная капуста',200,'200 г','salads'],
  ['greek-salad','Салат греческий',350,'250 г','salads'],
  ['rice','Рис',150,'150 г','sides'],
  ['buckwheat','Гречка',150,'150 г','sides'],
  ['pasta','Макароны',150,'150 г','sides'],
  ['mashed-potatoes','Пюре',150,'150 г','sides'],
  ['fries-100','Картошка фри',100,'100 г','fast-food'],
  ['fries-200','Картошка фри',200,'200 г','fast-food'],
  ['rustic-potato-100','Картошка по-деревенски',150,'100 г','fast-food'],
  ['rustic-potato-200','Картошка по-деревенски',300,'200 г','fast-food'],
  ['wings','Крылышки',300,'5 шт.','fast-food'],
  ['strips','Стрипсы',300,'5 шт.','fast-food'],
  ['nuggets','Наггетсы',250,'5 шт.','fast-food']
];
initialMenu.dishes.push(...priceList.map(([id,name,price,weight,categoryId])=>({id,name,price,weight,categoryId,desc:'Состав уточняется перед запуском.',imageUrl:'',available:true,published:true,breakfast:categoryId==='breakfast'})));
