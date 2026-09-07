import React, { useState, useMemo } from "react";
import {
  Search, MapPin, ShoppingCart, ChevronDown, Star, Clock, Bike, ShieldCheck,
  Plus, Minus, Check, Heart, User, ChevronRight, ChevronLeft, X, Menu, Tag,
  Banknote, Wallet, CircleDot, BadgeCheck, Truck, Crown, ArrowRight, Store, Globe
} from "lucide-react";

/*  GoPasal — gopasal.com customer WEBSITE (responsive design prototype)
    Shares the crimson design language with the mobile app. Single-file React. */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Inter:wght@400;500;600;700;800&family=Hind:wght@400;500;600;700&display=swap');
.gw,.gw *{box-sizing:border-box;margin:0;padding:0}
.gw{--crimson:#E11945;--crimson-700:#B60E33;--crimson-050:#FFECF0;--ink:#1B1220;--ink-60:#6B5E6C;--ink-40:#9B8F9C;
  --line:#ECE3E8;--paper:#FFF8F5;--blue:#2540E8;--green:#0E9F6E;--green-050:#E5F6EF;--marigold:#F6A609;--marigold-050:#FFF3DA;
  font-family:'Inter','Hind',system-ui,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased;}
.gw .np{font-family:'Hind','Inter',sans-serif}.gw .display{font-family:'Baloo 2',cursive;letter-spacing:-.01em}
.gw-browser{width:100%;max-width:1180px;margin:0 auto;border-radius:16px;overflow:hidden;box-shadow:0 30px 70px rgba(27,18,32,.22);border:1px solid #e3dbe0;background:#fff}
.gw-chrome{display:flex;align-items:center;gap:8px;padding:11px 14px;background:#F1EBEE;border-bottom:1px solid #e3dbe0}
.gw-dot{width:11px;height:11px;border-radius:50%} .gw-url{flex:1;background:#fff;border-radius:8px;padding:7px 13px;font-size:12.5px;color:var(--ink-60);border:1px solid #e3dbe0}
.gw-page{height:min(760px,82vh);overflow-y:auto;background:var(--paper)} .gw-page::-webkit-scrollbar{width:8px}.gw-page::-webkit-scrollbar-thumb{background:#e3dbe0;border-radius:8px}
/* header */
.gw-nav{position:sticky;top:0;z-index:30;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:20px;padding:13px 28px}
.gw-logo{font-family:'Baloo 2',cursive;font-weight:800;font-size:24px;color:var(--crimson)}
.gw-loc{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ink-60);cursor:pointer;white-space:nowrap}
.gw-loc b{color:var(--ink)}
.gw-searchbar{flex:1;display:flex;align-items:center;gap:10px;background:var(--paper);border:1.5px solid var(--line);border-radius:12px;padding:11px 15px}
.gw-searchbar input{border:none;outline:none;background:transparent;flex:1;font-family:inherit;font-size:14px;color:var(--ink)}
.gw-navbtn{display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:700;color:var(--ink);cursor:pointer;padding:9px 12px;border-radius:10px}
.gw-navbtn:hover{background:var(--paper)}
.gw-cartbtn{background:var(--crimson);color:#fff;border:none;border-radius:12px;padding:11px 16px;font-weight:800;font-size:13.5px;display:flex;gap:8px;align-items:center;cursor:pointer;position:relative;box-shadow:0 8px 20px rgba(225,25,69,.3)}
.gw-badge{background:#1B1220;color:#fff;border-radius:10px;min-width:20px;height:20px;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;padding:0 5px}
/* buttons + cards */
.gw-btn{border:none;cursor:pointer;font-family:inherit;font-weight:700;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:.15s}
.gw-btn.primary{background:var(--crimson);color:#fff;box-shadow:0 8px 20px rgba(225,25,69,.3)}.gw-btn.primary:hover{background:var(--crimson-700)}
.gw-btn.ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line)}.gw-btn.block{width:100%;padding:15px;font-size:15px}
.gw-card{background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 2px 10px rgba(27,18,32,.05)}
.gw-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800}
.gw-pill.open{background:var(--green-050);color:var(--green)}.gw-pill.rate{background:var(--marigold-050);color:#9A6A00}.gw-pill.closed{background:#F1ECEF;color:var(--ink-40)}
.gw-add{border:1.5px solid var(--crimson);color:var(--crimson);background:#fff;font-weight:800;font-size:13px;padding:8px 18px;border-radius:11px;cursor:pointer}
.gw-stepper{display:inline-flex;align-items:center;background:var(--crimson);border-radius:11px;color:#fff;font-weight:800;overflow:hidden}
.gw-stepper button{width:32px;height:34px;border:none;background:transparent;color:#fff;cursor:pointer}
.gw-section{padding:0 28px} .gw-h{display:flex;align-items:center;justify-content:space-between;margin:30px 28px 16px} .gw-h h2{font-size:22px;font-weight:800}
.gw-h .link{color:var(--crimson);font-weight:700;font-size:14px;cursor:pointer}
`;
/* extra web CSS */
const CSS2 = `
.gw-hero{margin:22px 28px 6px;border-radius:24px;padding:38px 40px;color:#fff;position:relative;overflow:hidden;
  background:linear-gradient(120deg,#E11945 0%,#B60E33 55%,#7d0a24 100%)}
.gw-hero h1{font-size:40px;font-weight:800;line-height:1.05;max-width:560px}
.gw-hero p{font-size:15px;opacity:.92;margin-top:12px;max-width:520px}
.gw-hero .big{display:flex;align-items:center;gap:10px;background:#fff;border-radius:14px;padding:6px 6px 6px 16px;max-width:520px;margin-top:22px}
.gw-hero .big input{border:none;outline:none;flex:1;font-family:inherit;font-size:15px;color:var(--ink);background:transparent}
.gw-trust{display:flex;gap:22px;margin-top:20px;flex-wrap:wrap} .gw-trust div{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;opacity:.95}
.gw-catrow{display:grid;grid-template-columns:repeat(8,1fr);gap:14px;padding:0 28px}
.gw-cat{display:flex;flex-direction:column;align-items:center;gap:9px;cursor:pointer;padding:16px 6px;border-radius:16px;border:1px solid var(--line);background:#fff;transition:.15s}
.gw-cat:hover{transform:translateY(-3px);box-shadow:0 12px 24px rgba(27,18,32,.1)} .gw-cat .ic{width:52px;height:52px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:26px}
.gw-cat span{font-size:12.5px;font-weight:700;color:var(--ink-60)}
.gw-shopgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:0 28px 10px}
.gw-shop{overflow:hidden;cursor:pointer;transition:.15s}.gw-shop:hover{transform:translateY(-4px);box-shadow:0 16px 32px rgba(27,18,32,.12)}
.gw-shop .cover{height:104px;display:flex;align-items:center;justify-content:center;font-size:46px;position:relative}
.gw-shop .bd{padding:15px 16px} .gw-shop .nm{font-weight:800;font-size:16px;display:flex;align-items:center;gap:6px}
.gw-shop .meta{font-size:12.5px;color:var(--ink-60);margin-top:3px} .gw-shop .row{display:flex;gap:14px;margin-top:11px;font-size:12px;font-weight:600;color:var(--ink-60)}
.gw-shop .row b{color:var(--ink)}
.gw-prodgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;padding:0 28px 20px}
.gw-prod{padding:14px;text-align:left}.gw-prod .img{height:120px;border-radius:14px;background:var(--paper);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:52px;margin-bottom:12px}
.gw-prod .nm{font-weight:700;font-size:14.5px}.gw-prod .u{font-size:12px;color:var(--ink-40);margin-top:2px}
.gw-prod .pr{font-weight:800;font-size:16px;margin-top:8px}.gw-prod .pr s{color:var(--ink-40);font-weight:500;font-size:12px;margin-left:6px}
.gw-prod .foot{display:flex;align-items:center;justify-content:space-between;margin-top:10px}
/* cart drawer */
.gw-overlay{position:absolute;inset:0;background:rgba(27,18,32,.45);z-index:40;display:flex;justify-content:flex-end}
.gw-drawer{width:400px;max-width:92%;background:#fff;height:100%;display:flex;flex-direction:column;animation:gwd .25s ease}
@keyframes gwd{from{transform:translateX(30px);opacity:.6}to{transform:none;opacity:1}}
.gw-drawer .dh{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--line)}
.gw-drawer .dh h3{font-size:18px;font-weight:800} .gw-drawer .bd{flex:1;overflow-y:auto;padding:8px 0}
.gw-line{display:flex;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line);align-items:center}
.gw-line .img{width:52px;height:52px;border-radius:12px;background:var(--paper);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:24px}
.gw-sum{padding:16px 20px;border-top:1px solid var(--line)} .gw-sum .ln{display:flex;justify-content:space-between;padding:6px 0;font-size:14px;color:var(--ink-60)}.gw-sum .ln b{color:var(--ink)}
.gw-sum .tot{font-size:18px;font-weight:800;color:var(--ink);border-top:1px dashed var(--line);margin-top:6px;padding-top:12px}
.gw-track-wrap{display:grid;grid-template-columns:1.1fr .9fr;gap:20px;padding:0 28px}
.gw-step{display:flex;gap:14px}.gw-step .dot{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#fff;border:2px solid var(--line);color:var(--ink-40)}
.gw-step.done .dot{background:var(--green);border-color:var(--green);color:#fff}.gw-step.now .dot{background:var(--crimson);border-color:var(--crimson);color:#fff}
.gw-step .rail{display:flex;flex-direction:column;align-items:center}.gw-step .bar{width:2px;flex:1;background:var(--line);margin:2px 0}.gw-step.done .bar{background:var(--green)}
.gw-step .txt{padding-bottom:20px}.gw-step .txt b{font-size:15px}.gw-step .txt p{font-size:12.5px;color:var(--ink-60);margin-top:2px}
.gw-foot{background:#1B1220;color:#fff;padding:34px 28px;margin-top:36px;display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:24px}
.gw-foot h4{font-size:13px;opacity:.6;margin-bottom:12px;font-weight:700;letter-spacing:.04em}.gw-foot a{display:block;font-size:13.5px;opacity:.85;margin-bottom:9px;cursor:pointer}
`;

const CATS=[["Kirana","किराना","🛒","#FFF3DA"],["Vegetables","तरकारी","🥬","#E5F6EF"],["Pharmacy","औषधि","💊","#EAEEFF"],["Food","खाना","🍛","#FFECEC"],["Meat","मासु","🍗","#FDEBEF"],["Bakery","बेकरी","🍞","#FFF3DA"],["Household","घरायसी","🧴","#E5F6EF"],["Electronics","इलेक्ट्रोनिक्स","📱","#EAEEFF"]];
const SHOPS=[{id:1,name:"Namaste Kirana Pasal",emoji:"🏪",bg:"#FFF3DA",cat:"Groceries · Daily needs",rating:4.7,km:0.6,min:12,open:true,badge:"Top Rated",free:true},
{id:2,name:"Everest Fresh Veggies",emoji:"🥬",bg:"#E5F6EF",cat:"Vegetables · Fruits",rating:4.8,km:0.9,min:15,open:true,badge:"Fastest",free:false},
{id:3,name:"Sagarmatha Pharmacy",emoji:"💊",bg:"#EAEEFF",cat:"Medicine · Wellness",rating:4.9,km:1.2,min:18,open:true,badge:null,free:false},
{id:4,name:"Newari Bakery House",emoji:"🍞",bg:"#FFF3DA",cat:"Bakery · Sweets",rating:4.6,km:1.5,min:22,open:false,badge:null,free:false},
{id:5,name:"Thamel Mart",emoji:"🛍️",bg:"#EAEEFF",cat:"Household · Essentials",rating:4.5,km:2.1,min:26,open:true,badge:null,free:true},
{id:6,name:"Fresh Meat Center",emoji:"🍗",bg:"#FDEBEF",cat:"Meat · Fish",rating:4.7,km:1.8,min:24,open:true,badge:null,free:false}];
const PRODUCTS=[{id:11,name:"Basmati Rice",np:"बासमती चामल",unit:"5 kg bag",emoji:"🍚",price:920,mrp:1050},
{id:12,name:"Fresh Tomatoes",np:"गोलभेडा",unit:"1 kg",emoji:"🍅",price:70,mrp:90},
{id:13,name:"Wai Wai Noodles",np:"वाइ वाइ",unit:"Pack of 5",emoji:"🍜",price:120,mrp:null},
{id:14,name:"Farm Eggs",np:"अण्डा",unit:"Tray of 30",emoji:"🥚",price:540,mrp:600},
{id:15,name:"Dettol Handwash",np:"ह्यान्डवास",unit:"200 ml",emoji:"🧴",price:210,mrp:250},
{id:16,name:"Amul Butter",np:"नौनी",unit:"100 g",emoji:"🧈",price:95,mrp:null},
{id:17,name:"Sunflower Oil",np:"तेल",unit:"1 L",emoji:"🫗",price:280,mrp:320},
{id:18,name:"Fresh Milk",np:"दूध",unit:"1 L",emoji:"🥛",price:110,mrp:null}];
const rs=(n)=>"रु "+n.toLocaleString("en-IN");
const TRACK=[["Placed","Order placed · 6:42 PM","done"],["Accepted","Shop accepted your order","done"],["Packed","Being packed by Namaste Kirana","now"],["Out for delivery","Shopkeeper on the way",""],["Delivered","Confirm with OTP 4821",""]];
function Stepper({q,add,sub}){return(<div className="gw-stepper"><button onClick={sub}><Minus size={14}/></button><span style={{minWidth:22,textAlign:"center"}}>{q}</span><button onClick={add}><Plus size={14}/></button></div>);}
function Money({v}){return <span>{rs(v)}</span>;}

function Header({go,cartCount,openCart,lang,setLang}){
  return(<div className="gw-nav">
    <div className="gw-logo" onClick={()=>go("home")} style={{cursor:"pointer"}}>GoPasal</div>
    <div className="gw-loc"><MapPin size={16} color="#E11945"/> Deliver to <b>New Baneshwor, KTM</b> <ChevronDown size={14}/></div>
    <div className="gw-searchbar"><Search size={18} color="#E11945"/><input placeholder="Search kirana, veggies, medicine… (try 'chamal')"/></div>
    <div className="gw-navbtn" onClick={()=>setLang(lang==="en"?"np":"en")}><Globe size={16}/>{lang==="en"?"EN":"नेप"}</div>
    <div className="gw-navbtn"><User size={18}/> Account</div>
    <button className="gw-cartbtn" onClick={openCart}><ShoppingCart size={17}/> Cart {cartCount>0&&<span className="gw-badge">{cartCount}</span>}</button>
  </div>);
}

function HomePage({go,openStore,cart,add,sub}){
  return(<div>
    <div className="gw-hero">
      <div style={{position:"absolute",right:-30,top:-20,fontSize:230,opacity:.12}}>🛵</div>
      <h1 className="display">Your neighbourhood shops,<br/>delivered in minutes.</h1>
      <p className="np" style={{fontFamily:"'Hind'"}}>छिमेकका पसलहरूबाट किनमेल गर्नुहोस् — छिटो, भरपर्दो, नगदमा।</p>
      <div className="big"><Search size={20} color="#E11945"/><input placeholder="Search for products or shops"/>
        <button className="gw-btn primary" style={{padding:"11px 22px"}}>Search</button></div>
      <div className="gw-trust"><div><ShieldCheck size={17}/> Cash on Delivery</div><div><Bike size={17}/> Delivered by local shops</div><div><Clock size={17}/> Avg. 15 min nearby</div></div>
    </div>
    <div className="gw-h" style={{marginTop:22}}><h2>Shop by category</h2></div>
    <div className="gw-catrow">{CATS.map(([en,np,e,bg])=>(<div className="gw-cat" key={en} onClick={()=>openStore(SHOPS[0])}>
      <div className="ic" style={{background:bg}}>{e}</div><span>{en}</span></div>))}</div>
    <div className="gw-h"><h2>Shops near you</h2><span className="link">View all →</span></div>
    <div className="gw-shopgrid">{SHOPS.map(s=>(<div key={s.id} className="gw-card gw-shop" onClick={()=>s.open&&openStore(s)}>
      <div className="cover" style={{background:s.bg}}>{s.emoji}
        <div style={{position:"absolute",top:12,left:12}}>{s.open?<span className="gw-pill open"><CircleDot size={11}/>OPEN</span>:<span className="gw-pill closed">CLOSED</span>}</div>
        {s.badge&&<div style={{position:"absolute",top:12,right:12}}><span className="gw-pill rate"><BadgeCheck size={12}/>{s.badge}</span></div>}</div>
      <div className="bd"><div className="nm">{s.name}</div><div className="meta">{s.cat}</div>
        <div className="row"><span><Star size={13} fill="#F6A609" color="#F6A609"/> <b>{s.rating}</b></span><span><MapPin size={13}/> {s.km} km</span><span><Clock size={13}/> <b>{s.min} min</b></span>{s.free&&<span style={{color:"var(--green)"}}><Bike size={13}/> Free</span>}</div></div>
    </div>))}</div>
    <div className="gw-h"><h2>Popular daily needs</h2><span className="link">See all →</span></div>
    <div className="gw-prodgrid">{PRODUCTS.slice(0,8).map(p=>(<div key={p.id} className="gw-card gw-prod">
      <div className="img">{p.emoji}</div><div className="nm">{p.name}</div><div className="u np">{p.np} · {p.unit}</div>
      <div className="foot"><div className="pr"><Money v={p.price}/>{p.mrp&&<s><Money v={p.mrp}/></s>}</div>
        {cart[p.id]?<Stepper q={cart[p.id]} add={()=>add(p)} sub={()=>sub(p)}/>:<button className="gw-add" onClick={()=>add(p)}>+ Add</button>}</div></div>))}</div>
  </div>);
}
function StorePage({store,go,cart,add,sub}){
  return(<div>
    <div style={{background:store.bg,padding:"22px 28px"}}>
      <div className="gw-navbtn" onClick={()=>go("home")} style={{background:"#fff",display:"inline-flex",marginBottom:14}}><ChevronLeft size={16}/> Back to shops</div>
      <div style={{display:"flex",gap:18,alignItems:"center"}}>
        <div style={{width:80,height:80,borderRadius:22,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:40}}>{store.emoji}</div>
        <div><div style={{fontWeight:800,fontSize:26}}>{store.name} {store.badge&&<span className="gw-pill rate"><BadgeCheck size={12}/>{store.badge}</span>}</div>
          <div style={{color:"var(--ink-60)",marginTop:4}}>{store.cat}</div>
          <div style={{display:"flex",gap:18,marginTop:10,fontSize:13,fontWeight:600}}><span><Star size={14} fill="#F6A609" color="#F6A609"/> {store.rating} · 2.4k ratings</span><span><Clock size={14}/> {store.min} min</span><span style={{color:"var(--green)"}}><Bike size={14}/> Delivered by the shop</span></div></div>
      </div>
    </div>
    <div className="gw-card" style={{margin:"16px 28px",padding:"12px 16px",display:"flex",gap:10,alignItems:"center",background:"var(--green-050)",border:"none"}}>
      <ShieldCheck size={18} color="#0E9F6E"/><span style={{fontSize:13,color:"#0A7350",fontWeight:600}}>This shop delivers its own orders. Pay cash on delivery and confirm with an OTP when it arrives.</span></div>
    <div className="gw-h" style={{margin:"18px 28px 14px"}}><h2 style={{fontSize:19}}>Products</h2></div>
    <div className="gw-prodgrid">{PRODUCTS.map(p=>(<div key={p.id} className="gw-card gw-prod">
      <div className="img">{p.emoji}</div><div className="nm">{p.name}</div><div className="u np">{p.np} · {p.unit}</div>
      <div className="foot"><div className="pr"><Money v={p.price}/>{p.mrp&&<s><Money v={p.mrp}/></s>}</div>
        {cart[p.id]?<Stepper q={cart[p.id]} add={()=>add(p)} sub={()=>sub(p)}/>:<button className="gw-add" onClick={()=>add(p)}>+ Add</button>}</div></div>))}</div>
  </div>);
}

function CartDrawer({items,subtotal,add,sub,close,go}){
  const delivery=subtotal>800?0:40,fee=9;
  return(<div className="gw-overlay" onClick={close}><div className="gw-drawer" onClick={e=>e.stopPropagation()}>
    <div className="dh"><h3>Your cart</h3><div style={{cursor:"pointer"}} onClick={close}><X size={22}/></div></div>
    {items.length===0?<div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10}}>
      <div style={{fontSize:50}}>🛒</div><div style={{fontWeight:700}}>Your cart is empty</div><button className="gw-btn ghost" onClick={close}>Browse shops</button></div>
    :<>
    <div className="bd">
      <div style={{padding:"10px 20px",fontSize:12.5,color:"var(--green)",fontWeight:700}}><Bike size={13}/> Namaste Kirana Pasal · self-delivered</div>
      {items.map(it=>(<div className="gw-line" key={it.id}><div className="img">{it.emoji}</div>
        <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{it.name}</div><div style={{fontSize:12,color:"var(--ink-40)"}}>{it.unit}</div><div style={{fontWeight:800,marginTop:4}}><Money v={it.price*it.q}/></div></div>
        <Stepper q={it.q} add={()=>add(it)} sub={()=>sub(it)}/></div>))}
    </div>
    <div className="gw-sum">
      <div className="ln">Item total <b><Money v={subtotal}/></b></div>
      <div className="ln">Delivery {delivery===0?<b style={{color:"var(--green)"}}>FREE</b>:<b><Money v={delivery}/></b>}</div>
      <div className="ln">Platform fee <b><Money v={fee}/></b></div>
      <div className="ln tot" style={{display:"flex",justifyContent:"space-between"}}><span>To pay</span><span><Money v={subtotal+delivery+fee}/></span></div>
      <button className="gw-btn primary block" style={{marginTop:14}} onClick={()=>{close();go("checkout");}}>Checkout <ArrowRight size={16}/></button>
    </div></>}
  </div></div>);
}
function CheckoutPage({go,subtotal,place}){
  const [pay,setPay]=useState("cod");const delivery=subtotal>800?0:40,fee=9,total=subtotal+delivery+fee;
  return(<div style={{padding:"24px 28px"}}>
    <div className="gw-navbtn" onClick={()=>go("home")} style={{background:"#fff",display:"inline-flex",marginBottom:16}}><ChevronLeft size={16}/> Continue shopping</div>
    <h2 style={{fontSize:26,fontWeight:800,marginBottom:18}}>Checkout</h2>
    <div style={{display:"grid",gridTemplateColumns:"1.3fr .9fr",gap:24}}>
      <div>
        <div className="gw-card" style={{padding:18,marginBottom:16}}>
          <div style={{fontWeight:800,marginBottom:12}}>Delivery address</div>
          <div style={{display:"flex",gap:12,alignItems:"flex-start",padding:14,border:"1.5px solid var(--crimson)",borderRadius:12,background:"var(--crimson-050)"}}>
            <MapPin size={20} color="#E11945"/><div style={{flex:1}}><div style={{fontWeight:800}}>Home · New Baneshwor</div><div style={{fontSize:13,color:"var(--ink-60)"}}>Ward 10, near Shankhamul Bridge, Kathmandu</div></div><span className="link" style={{color:"var(--crimson)",fontWeight:700,fontSize:13,cursor:"pointer"}}>Change</span></div>
        </div>
        <div className="gw-card" style={{padding:18}}>
          <div style={{fontWeight:800,marginBottom:12}}>Payment method</div>
          <div onClick={()=>setPay("cod")} style={{display:"flex",gap:12,alignItems:"center",padding:14,borderRadius:12,marginBottom:10,cursor:"pointer",border:pay==="cod"?"1.5px solid var(--crimson)":"1.5px solid var(--line)",background:pay==="cod"?"var(--crimson-050)":"#fff"}}>
            <Banknote size={20} color="#0E9F6E"/><div style={{flex:1}}><div style={{fontWeight:800}}>Cash on Delivery</div><div style={{fontSize:12.5,color:"var(--ink-60)"}}>Pay the shop when it arrives · recommended</div></div>{pay==="cod"&&<Check color="#E11945"/>}</div>
          <div onClick={()=>setPay("online")} style={{display:"flex",gap:12,alignItems:"center",padding:14,borderRadius:12,cursor:"pointer",border:pay==="online"?"1.5px solid var(--crimson)":"1.5px solid var(--line)",background:pay==="online"?"var(--crimson-050)":"#fff"}}>
            <Wallet size={20} color="#2540E8"/><div style={{flex:1}}><div style={{fontWeight:800}}>Pay online</div><div style={{fontSize:12.5,color:"var(--ink-60)"}}>eSewa · Khalti · IME Pay · cards</div></div>{pay==="online"&&<Check color="#E11945"/>}</div>
        </div>
      </div>
      <div className="gw-card" style={{padding:18,height:"fit-content"}}>
        <div style={{fontWeight:800,marginBottom:12}}>Order summary</div>
        <div className="gw-sum" style={{padding:0,border:"none"}}>
          <div className="ln">Item total <b><Money v={subtotal}/></b></div>
          <div className="ln">Delivery {delivery===0?<b style={{color:"var(--green)"}}>FREE</b>:<b><Money v={delivery}/></b>}</div>
          <div className="ln">Platform fee <b><Money v={fee}/></b></div>
          <div className="ln tot" style={{display:"flex",justifyContent:"space-between"}}><span>{pay==="cod"?"Pay on delivery":"Pay now"}</span><span><Money v={total}/></span></div>
        </div>
        <button className="gw-btn primary block" style={{marginTop:14}} onClick={place}>Place order</button>
        <div style={{fontSize:12,color:"var(--ink-60)",textAlign:"center",marginTop:10}}><ShieldCheck size={13} style={{verticalAlign:-2}}/> Confirm delivery with OTP · no risk</div>
      </div>
    </div>
  </div>);
}

function TrackPage({go}){
  return(<div style={{padding:"24px 28px"}}>
    <div className="gw-navbtn" onClick={()=>go("home")} style={{background:"#fff",display:"inline-flex",marginBottom:16}}><ChevronLeft size={16}/> Home</div>
    <h2 style={{fontSize:24,fontWeight:800,marginBottom:6}}>Order #GP-48213</h2>
    <div style={{color:"var(--ink-60)",marginBottom:18}}>Namaste Kirana Pasal is preparing your order.</div>
    <div className="gw-track-wrap">
      <div className="gw-card" style={{padding:24}}>{TRACK.map((s,i)=>(<div key={i} className={"gw-step"+(s[2]==="done"?" done":s[2]==="now"?" now":"")}>
        <div className="rail"><div className="dot">{s[2]==="done"?<Check size={15}/>:s[2]==="now"?<CircleDot size={14}/>:<Clock size={13}/>}</div>{i<TRACK.length-1&&<div className="bar"/>}</div>
        <div className="txt"><b>{s[0]}</b><p>{s[1]}</p></div></div>))}</div>
      <div>
        <div style={{borderRadius:18,padding:22,background:"linear-gradient(135deg,#E11945,#B60E33)",color:"#fff",marginBottom:16}}>
          <div style={{fontSize:12,opacity:.9}}>Estimated arrival</div><div className="display" style={{fontSize:32,fontWeight:800}}>6:58 PM</div><div style={{fontSize:13,opacity:.92}}>Self-delivered by the shopkeeper</div></div>
        <div className="gw-card" style={{padding:16,display:"flex",gap:12,alignItems:"center"}}>
          <div style={{width:46,height:46,borderRadius:14,background:"#FFF3DA",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🏪</div>
          <div style={{flex:1}}><div style={{fontWeight:800}}>Ram Bahadur</div><div style={{fontSize:12.5,color:"var(--ink-60)"}}>Shopkeeper · delivering it himself</div></div>
          <button className="gw-btn primary" style={{padding:"9px 14px"}}>Chat</button></div>
      </div>
    </div>
  </div>);
}

function Footer(){return(<div className="gw-foot">
  <div><div className="gw-logo" style={{color:"#fff",marginBottom:10}}>GoPasal</div><div style={{fontSize:13,opacity:.7,maxWidth:240,lineHeight:1.6}} className="np">तपाईंको छिमेकको पसल, अब अनलाइन। Nepal's hyperlocal marketplace.</div></div>
  <div><h4>COMPANY</h4><a>About us</a><a>Careers</a><a>Blog</a></div>
  <div><h4>FOR SHOPS</h4><a>Sell on GoPasal</a><a>seller.gopasal.com</a><a>Partner support</a></div>
  <div><h4>HELP</h4><a>Track order</a><a>Contact</a><a>Terms · Privacy</a></div>
</div>);}
export default function GoPasalWeb(){
  const [page,setPage]=useState("home");const [store,setStore]=useState(SHOPS[0]);
  const [cart,setCart]=useState({});const [drawer,setDrawer]=useState(false);const [lang,setLang]=useState("en");
  const go=(p)=>{setPage(p);};
  const openStore=(s)=>{setStore(s);setPage("store");};
  const add=(p)=>setCart(c=>({...c,[p.id]:(c[p.id]||0)+1}));
  const sub=(p)=>setCart(c=>{const n={...c};if(!n[p.id])return n;n[p.id]-=1;if(n[p.id]<=0)delete n[p.id];return n;});
  const items=useMemo(()=>Object.entries(cart).map(([id,q])=>{const p=PRODUCTS.find(x=>x.id===+id);return p&&{...p,q};}).filter(Boolean),[cart]);
  const subtotal=items.reduce((s,i)=>s+i.price*i.q,0);const cartCount=items.reduce((s,i)=>s+i.q,0);
  const place=()=>{setCart({});setPage("track");};
  return(<div className="gw" style={{padding:"26px 12px 50px",background:"radial-gradient(1000px 400px at 50% -5%,#FFE7EC,rgba(255,231,236,0)),#F4EEF1",minHeight:"100%"}}>
    <style>{CSS}{CSS2}</style>
    <div style={{maxWidth:1180,margin:"0 auto 12px",display:"flex",gap:8,alignItems:"center"}}>
      <span style={{fontWeight:800,color:"#8b7f8c",fontSize:13}}>GoPasal Customer Website · gopasal.com</span>
    </div>
    <div className="gw-browser">
      <div className="gw-chrome"><span className="gw-dot" style={{background:"#ff5f57"}}/><span className="gw-dot" style={{background:"#febc2e"}}/><span className="gw-dot" style={{background:"#28c840"}}/>
        <div className="gw-url">🔒 gopasal.com{page==="store"?"/shop/"+store.id:page==="checkout"?"/checkout":page==="track"?"/orders/GP-48213":""}</div></div>
      <div className="gw-page" style={{position:"relative"}}>
        <Header go={go} cartCount={cartCount} openCart={()=>setDrawer(true)} lang={lang} setLang={setLang}/>
        {page==="home"&&<HomePage go={go} openStore={openStore} cart={cart} add={add} sub={sub}/>}
        {page==="store"&&<StorePage store={store} go={go} cart={cart} add={add} sub={sub}/>}
        {page==="checkout"&&<CheckoutPage go={go} subtotal={subtotal||1010} place={place}/>}
        {page==="track"&&<TrackPage go={go}/>}
        {(page==="home"||page==="store")&&<Footer/>}
        {drawer&&<CartDrawer items={items} subtotal={subtotal} add={add} sub={sub} close={()=>setDrawer(false)} go={go}/>}
      </div>
    </div>
  </div>);
}
