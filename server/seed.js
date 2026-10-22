export const initialMenu = {
  revision: 0,
  updatedAt: null,
  settings: {name:'Соф',tagline:'Закажите в «Соф».',phone:'',address:'',hours:'',deliveryNote:''},
  categories: [{id:'hot',name:'Горячее'},{id:'soups',name:'Супы'}],
  dishes: [
    {id:'plov',name:'Плов',price:450,weight:'450 г',categoryId:'hot',desc:'Состав блюда уточняется перед запуском.',imageUrl:'/assets/plov-cutout.webp',available:true,published:true},
    {id:'kazan',name:'Казан-кебаб из говядины',price:550,weight:'400 г',categoryId:'hot',desc:'Говядина с картофелем. Полный состав уточняется перед запуском.',imageUrl:'/assets/kazan-cutout.webp',available:true,published:true},
    {id:'shurpa',name:'Шурпа из говядины',price:400,weight:'450 г',categoryId:'soups',desc:'Порция 450 г, мясо 120 г. Полный состав уточняется.',imageUrl:'/assets/shurpa-cutout.webp',available:true,published:true},
    {id:'roast',name:'Жаркое из говядины',price:500,weight:'450 г',categoryId:'hot',desc:'Полный состав уточняется перед запуском.',imageUrl:'/assets/roast-cutout.webp',available:true,published:true},
    {id:'fatir',name:'Фатир-шурпа',price:500,weight:'600 г',categoryId:'soups',desc:'Полный состав уточняется перед запуском.',imageUrl:'/assets/fatir-cutout.webp',available:true,published:true},
    {id:'lamb',name:'Казан-кебаб из баранины',price:600,weight:'400 г',categoryId:'hot',desc:'Баранина с картофелем. Полный состав уточняется.',imageUrl:'/assets/kazan-cutout.webp',available:true,published:true}
  ]
};
