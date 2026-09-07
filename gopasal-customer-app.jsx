import React, { useState, useEffect, useMemo } from "react";
import {
  Home, Compass, ShoppingCart, ReceiptText, User, Search, MapPin, Bell,
  ChevronRight, ChevronLeft, Star, Clock, Plus, Minus, Check, ShieldCheck,
  Wallet, Banknote, Phone, MessageCircle, Package, Bike, CircleDot, X,
  Globe, Crown, RotateCcw, Heart, SlidersHorizontal, Store, BadgeCheck,
  ChevronDown, Truck, LifeBuoy, Tag, ArrowRight, Mic, Sparkles
} from "lucide-react";

/*  GoPasal — Customer Mobile App (interactive design prototype)
    Brand: Sindoor crimson + Himalayan accents. Bilingual EN / नेपाली.
    Single-file React. Design system lives in the <style> block below. */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=Hind:wght@400;500;600;700&display=swap');

.gp, .gp * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
.gp {
  --crimson: #E11945;      /* sindoor */
  --crimson-700: #B60E33;
  --crimson-050: #FFECF0;
  --ink: #1B1220;          /* warm plum-black */
  --ink-60: #6B5E6C;
  --ink-40: #9B8F9C;
  --line: #F0E7EC;
  --paper: #FFF8F5;        /* warm paper, not cream */
  --surface: #FFFFFF;
  --blue: #2540E8;         /* himalayan */
  --blue-050:#EAEEFF;
  --green: #0E9F6E;        /* open / verified */
  --green-050:#E5F6EF;
  --marigold: #F6A609;     /* festive accent */
  --marigold-050:#FFF3DA;
  --r-sm: 12px; --r-md: 18px; --r-lg: 26px; --r-xl: 34px;
  --sh-1: 0 2px 10px rgba(27,18,32,.06);
  --sh-2: 0 12px 30px rgba(27,18,32,.12);
  --sh-crimson: 0 10px 26px rgba(225,25,69,.36);
  font-family: 'Inter','Hind',system-ui,sans-serif;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}
.gp .np { font-family: 'Hind','Inter',sans-serif; }
.gp .display { font-family: 'Baloo 2','Hind',cursive; letter-spacing:-.01em; }

/* device frame */
.gp-stage { min-height: 100%; width:100%; display:flex; flex-direction:column; align-items:center;
  gap:14px; padding:26px 12px 40px; background:
  radial-gradient(1200px 500px at 50% -10%, #FFE7EC 0%, rgba(255,231,236,0) 55%), #F4EEF1; }
.gp-topbar{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:center; }
.gp-chip{ display:inline-flex; align-items:center; gap:7px; background:#fff; border:1px solid var(--line);
  padding:8px 13px; border-radius:999px; font-size:13px; font-weight:600; color:var(--ink-60); cursor:pointer;
  box-shadow:var(--sh-1); transition:.18s; }
.gp-chip:hover{ transform:translateY(-1px); }
.gp-chip.active{ background:var(--ink); color:#fff; border-color:var(--ink); }
.gp-phone{ width:390px; max-width:96vw; height:min(844px,88vh); background:#000; border-radius:52px; padding:10px;
  box-shadow:0 30px 70px rgba(27,18,32,.34), inset 0 0 0 2px #2a2a2a; position:relative; }
.gp-screen{ position:relative; width:100%; height:100%; background:var(--paper); border-radius:43px; overflow:hidden;
  display:flex; flex-direction:column; }
.gp-notch{ position:absolute; top:12px; left:50%; transform:translateX(-50%); width:128px; height:30px;
  background:#000; border-radius:0 0 18px 18px; z-index:60; }
.gp-status{ height:46px; flex:0 0 auto; display:flex; align-items:flex-end; justify-content:space-between;
  padding:0 26px 6px; font-size:13px; font-weight:700; color:var(--ink); z-index:40; }
.gp-status .r{ display:flex; gap:6px; align-items:center; }
.gp-body{ flex:1 1 auto; overflow-y:auto; overflow-x:hidden; scroll-behavior:smooth; }
.gp-body::-webkit-scrollbar{ width:0; }
/* buttons */
.gp-btn{ border:none; cursor:pointer; font-family:inherit; font-weight:700; border-radius:var(--r-md);
  display:inline-flex; align-items:center; justify-content:center; gap:8px; transition:transform .12s, box-shadow .2s, background .2s; }
.gp-btn:active{ transform:scale(.97); }
.gp-btn.primary{ background:var(--crimson); color:#fff; box-shadow:var(--sh-crimson); }
.gp-btn.primary:hover{ background:var(--crimson-700); }
.gp-btn.block{ width:100%; padding:16px; font-size:16px; }
.gp-btn.ghost{ background:#fff; color:var(--ink); border:1px solid var(--line); box-shadow:var(--sh-1); }
.gp-btn.mini{ padding:9px 14px; font-size:13px; border-radius:12px; }
.gp-card{ background:var(--surface); border:1px solid var(--line); border-radius:var(--r-md); box-shadow:var(--sh-1); }
.gp-sec-h{ display:flex; align-items:center; justify-content:space-between; padding:0 20px; margin:22px 0 12px; }
.gp-sec-h h3{ font-size:18px; font-weight:800; } .gp-sec-h .link{ color:var(--crimson); font-size:13px; font-weight:700; cursor:pointer; }
.gp-pill{ display:inline-flex; align-items:center; gap:5px; padding:4px 9px; border-radius:999px; font-size:11px; font-weight:800; }
.gp-pill.open{ background:var(--green-050); color:var(--green); }
.gp-pill.closed{ background:#F1ECEF; color:var(--ink-40); }
.gp-pill.rate{ background:var(--marigold-050); color:#9A6A00; }
.gp-pill.spon{ background:var(--blue-050); color:var(--blue); }

/* app header (crimson) */
.gp-appbar{ background:linear-gradient(160deg,var(--crimson) 0%, #C7113A 100%); padding:6px 18px 18px; color:#fff;
  border-radius:0 0 26px 26px; box-shadow:0 10px 24px rgba(225,25,69,.28); }
.gp-loc{ display:flex; align-items:center; justify-content:space-between; padding:8px 2px; }
.gp-loc .lab{ font-size:11px; opacity:.85; font-weight:600; letter-spacing:.02em; }
.gp-loc .val{ display:flex; align-items:center; gap:4px; font-weight:800; font-size:16px; }
.gp-iconbtn{ width:40px; height:40px; border-radius:14px; background:rgba(255,255,255,.18); display:flex;
  align-items:center; justify-content:center; color:#fff; cursor:pointer; border:none; position:relative; }
.gp-searchbar{ display:flex; align-items:center; gap:10px; background:#fff; border-radius:16px; padding:13px 15px;
  color:var(--ink-40); font-weight:600; font-size:14px; box-shadow:0 8px 20px rgba(120,0,30,.18); cursor:text; }
.gp-searchbar input{ border:none; outline:none; flex:1; font-family:inherit; font-size:14px; color:var(--ink); background:transparent; }

/* categories */
.gp-catgrid{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px 8px; padding:18px 16px 4px; }
.gp-cat{ display:flex; flex-direction:column; align-items:center; gap:7px; cursor:pointer; }
.gp-cat .ic{ width:60px; height:60px; border-radius:20px; display:flex; align-items:center; justify-content:center;
  transition:transform .15s; } .gp-cat:active .ic{ transform:scale(.92); }
.gp-cat span{ font-size:11.5px; font-weight:600; color:var(--ink-60); text-align:center; }

/* promo */
.gp-promos{ display:flex; gap:12px; overflow-x:auto; padding:6px 16px 4px; scroll-snap-type:x mandatory; }
.gp-promos::-webkit-scrollbar{ display:none; }
.gp-promo{ flex:0 0 86%; scroll-snap-align:center; border-radius:22px; padding:20px; color:#fff; position:relative; overflow:hidden; min-height:126px; }
.gp-promo h4{ font-size:22px; font-weight:800; line-height:1.1; }
.gp-promo p{ font-size:12.5px; opacity:.92; margin-top:5px; }
.gp-promo .code{ display:inline-block; margin-top:12px; background:rgba(255,255,255,.22); padding:6px 12px;
  border-radius:10px; font-size:12px; font-weight:800; letter-spacing:.04em; }
/* store card */
.gp-store{ display:flex; gap:13px; padding:13px; margin:0 16px 12px; align-items:center; cursor:pointer; }
.gp-store .logo{ width:60px; height:60px; border-radius:16px; flex:0 0 auto; display:flex; align-items:center;
  justify-content:center; font-size:28px; }
.gp-store .nm{ font-weight:800; font-size:15px; display:flex; align-items:center; gap:5px; }
.gp-store .meta{ font-size:12px; color:var(--ink-60); margin-top:2px; }
.gp-store .row{ display:flex; gap:12px; margin-top:7px; font-size:11.5px; color:var(--ink-60); font-weight:600; }
.gp-store .row b{ color:var(--ink); }

/* product */
.gp-prow{ display:flex; gap:12px; padding:14px 16px; border-bottom:1px solid var(--line); align-items:center; }
.gp-prow .img{ width:74px; height:74px; border-radius:16px; flex:0 0 auto; display:flex; align-items:center;
  justify-content:center; font-size:34px; background:var(--paper); border:1px solid var(--line); }
.gp-prow .nm{ font-weight:700; font-size:14.5px; } .gp-prow .u{ font-size:12px; color:var(--ink-40); margin-top:2px; }
.gp-prow .pr{ font-weight:800; font-size:15px; margin-top:6px; } .gp-prow .pr s{ color:var(--ink-40); font-weight:500; font-size:12px; margin-left:6px; }
.gp-add{ border:1.5px solid var(--crimson); color:var(--crimson); background:#fff; font-weight:800; font-size:13px;
  padding:8px 16px; border-radius:12px; cursor:pointer; }
.gp-stepper{ display:inline-flex; align-items:center; background:var(--crimson); border-radius:12px; color:#fff; font-weight:800; overflow:hidden; }
.gp-stepper button{ width:34px; height:36px; border:none; background:transparent; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.gp-stepper span{ min-width:22px; text-align:center; font-size:14px; }

/* bottom nav */
.gp-nav{ flex:0 0 auto; display:flex; align-items:flex-end; justify-content:space-around; background:#fff;
  border-top:1px solid var(--line); padding:9px 8px 20px; position:relative; }
.gp-nav .it{ display:flex; flex-direction:column; align-items:center; gap:3px; font-size:10.5px; font-weight:700;
  color:var(--ink-40); cursor:pointer; flex:1; }
.gp-nav .it.active{ color:var(--crimson); }
.gp-nav .fab{ width:56px; height:56px; margin-top:-30px; border-radius:20px; background:var(--crimson); color:#fff;
  display:flex; align-items:center; justify-content:center; box-shadow:var(--sh-crimson); position:relative; }
.gp-badge{ position:absolute; top:-6px; right:-6px; background:var(--ink); color:#fff; font-size:10px; font-weight:800;
  min-width:20px; height:20px; border-radius:10px; display:flex; align-items:center; justify-content:center; padding:0 5px; border:2px solid #fff; }

/* sheets / generic */
.gp-hd{ display:flex; align-items:center; gap:12px; padding:16px 16px 12px; background:var(--surface); border-bottom:1px solid var(--line); }
.gp-hd h2{ font-size:18px; font-weight:800; } .gp-hd .back{ cursor:pointer; width:38px; height:38px; border-radius:12px;
  display:flex; align-items:center; justify-content:center; background:var(--paper); border:1px solid var(--line); }
.gp-input{ width:100%; padding:15px; border:1.5px solid var(--line); border-radius:14px; font-family:inherit;
  font-size:15px; outline:none; background:#fff; } .gp-input:focus{ border-color:var(--crimson); }
.gp-label{ font-size:12.5px; font-weight:700; color:var(--ink-60); margin:0 2px 7px; }
.gp-note{ font-size:12px; color:var(--ink-60); line-height:1.5; }
.gp-list-item{ display:flex; align-items:center; gap:13px; padding:15px 16px; border-bottom:1px solid var(--line); cursor:pointer; }
.gp-list-item .ic{ width:42px; height:42px; border-radius:12px; background:var(--paper); border:1px solid var(--line);
  display:flex; align-items:center; justify-content:center; color:var(--crimson); flex:0 0 auto; }
.gp-skel{ background:linear-gradient(90deg,#F1E9ED 25%,#F8F3F5 50%,#F1E9ED 75%); background-size:200% 100%;
  animation:gpsh 1.2s infinite; border-radius:12px; }
@keyframes gpsh{ 0%{background-position:200% 0} 100%{background-position:-200% 0} }
@keyframes gppulse{ 0%,100%{ box-shadow:0 0 0 0 rgba(14,159,110,.5);} 50%{ box-shadow:0 0 0 6px rgba(14,159,110,0);} }
@keyframes gpslide{ from{ transform:translateY(12px); opacity:0 } to{ transform:none; opacity:1 } }
.gp-fade{ animation:gpslide .28s ease both; }
.gp-toast{ position:absolute; left:16px; right:16px; bottom:96px; background:var(--ink); color:#fff; padding:13px 16px;
  border-radius:14px; font-size:13.5px; font-weight:600; display:flex; align-items:center; gap:9px; z-index:70; box-shadow:var(--sh-2); animation:gpslide .25s ease both; }
/* order tracking */
.gp-track{ padding:20px 20px 0; }
.gp-step{ display:flex; gap:14px; } .gp-step .rail{ display:flex; flex-direction:column; align-items:center; }
.gp-step .dot{ width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  background:#fff; border:2px solid var(--line); color:var(--ink-40); flex:0 0 auto; }
.gp-step.done .dot{ background:var(--green); border-color:var(--green); color:#fff; }
.gp-step.now .dot{ background:var(--crimson); border-color:var(--crimson); color:#fff; animation:gppulse 1.6s infinite; }
.gp-step .bar{ width:2px; flex:1; background:var(--line); margin:2px 0; } .gp-step.done .bar{ background:var(--green); }
.gp-step .txt{ padding-bottom:22px; } .gp-step .txt b{ font-size:14.5px; } .gp-step .txt p{ font-size:12px; color:var(--ink-60); margin-top:2px; }
.gp-summary{ padding:14px 16px; } .gp-summary .ln{ display:flex; justify-content:space-between; padding:7px 0; font-size:14px; color:var(--ink-60); }
.gp-summary .ln b{ color:var(--ink); } .gp-summary .tot{ border-top:1px dashed var(--line); margin-top:6px; padding-top:12px; font-size:17px; font-weight:800; color:var(--ink); }
.gp-pay{ display:flex; align-items:center; gap:12px; padding:14px; border:1.5px solid var(--line); border-radius:16px; margin:0 16px 10px; cursor:pointer; }
.gp-pay.sel{ border-color:var(--crimson); background:var(--crimson-050); }
.gp-radio{ width:22px; height:22px; border-radius:50%; border:2px solid var(--ink-40); flex:0 0 auto; display:flex; align-items:center; justify-content:center; }
.gp-pay.sel .gp-radio{ border-color:var(--crimson); } .gp-pay.sel .gp-radio i{ width:11px; height:11px; border-radius:50%; background:var(--crimson); display:block; }
.gp-gold{ margin:16px; border-radius:22px; padding:20px; color:#3a2a05; position:relative; overflow:hidden;
  background:linear-gradient(135deg,#FFE9A8,#F6C445); box-shadow:0 12px 26px rgba(246,166,9,.3); }
.gp-cta-bar{ flex:0 0 auto; padding:14px 16px 22px; background:#fff; border-top:1px solid var(--line); box-shadow:0 -8px 24px rgba(27,18,32,.06); }
.gp-otp{ display:flex; gap:10px; justify-content:center; } .gp-otp .box{ width:48px; height:56px; border:1.5px solid var(--line);
  border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:800; }
.gp-otp .box.on{ border-color:var(--crimson); color:var(--crimson); background:var(--crimson-050); }
.gp-filters{ display:flex; gap:8px; padding:12px 16px; overflow-x:auto; } .gp-filters::-webkit-scrollbar{display:none;}
.gp-fchip{ flex:0 0 auto; padding:8px 13px; border-radius:999px; border:1px solid var(--line); background:#fff; font-size:12.5px; font-weight:700; color:var(--ink-60); cursor:pointer; }
.gp-fchip.on{ background:var(--ink); color:#fff; border-color:var(--ink); }
`;

/* ---------- data ---------- */
const CATS = [
  { key:"kirana", en:"Kirana", np:"किराना", emoji:"🛒", bg:"#FFF3DA" },
  { key:"veg", en:"Vegetables", np:"तरकारी", emoji:"🥬", bg:"#E5F6EF" },
  { key:"pharma", en:"Pharmacy", np:"औषधि", emoji:"💊", bg:"#EAEEFF" },
  { key:"food", en:"Food", np:"खाना", emoji:"🍛", bg:"#FFECEC" },
  { key:"meat", en:"Meat & Fish", np:"मासु", emoji:"🍗", bg:"#FDEBEF" },
  { key:"bakery", en:"Bakery", np:"बेकरी", emoji:"🍞", bg:"#FFF3DA" },
  { key:"home", en:"Household", np:"घरायसी", emoji:"🧴", bg:"#E5F6EF" },
  { key:"elec", en:"Electronics", np:"इलेक्ट्रोनिक्स", emoji:"📱", bg:"#EAEEFF" },
];
const SHOPS = [
  { id:1, name:"Namaste Kirana Pasal", emoji:"🏪", bg:"#FFF3DA", cat:"Groceries · Daily needs", rating:4.7, km:0.6, min:12, open:true, badge:"Top Rated", free:true },
  { id:2, name:"Everest Fresh Veggies", emoji:"🥬", bg:"#E5F6EF", cat:"Vegetables · Fruits", rating:4.8, km:0.9, min:15, open:true, badge:"Fastest", free:false },
  { id:3, name:"Sagarmatha Pharmacy", emoji:"💊", bg:"#EAEEFF", cat:"Medicine · Wellness", rating:4.9, km:1.2, min:18, open:true, badge:null, free:false },
  { id:4, name:"Newari Bakery House", emoji:"🍞", bg:"#FFF3DA", cat:"Bakery · Sweets", rating:4.6, km:1.5, min:22, open:false, badge:null, free:false },
];
const PRODUCTS = [
  { id:11, name:"Basmati Rice", np:"बासमती चामल", unit:"5 kg bag", emoji:"🍚", price:920, mrp:1050, cat:"kirana" },
  { id:12, name:"Fresh Tomatoes", np:"गोलभेडा", unit:"1 kg", emoji:"🍅", price:70, mrp:90, cat:"veg" },
  { id:13, name:"Wai Wai Noodles", np:"वाइ वाइ", unit:"Pack of 5", emoji:"🍜", price:120, mrp:null, cat:"kirana" },
  { id:14, name:"Farm Eggs", np:"अण्डा", unit:"Tray of 30", emoji:"🥚", price:540, mrp:600, cat:"kirana" },
  { id:15, name:"Dettol Handwash", np:"ह्यान्डवास", unit:"200 ml", emoji:"🧴", price:210, mrp:250, cat:"home" },
  { id:16, name:"Amul Butter", np:"नौनी", unit:"100 g", emoji:"🧈", price:95, mrp:null, cat:"kirana" },
];
/* ---------- i18n ---------- */
const T = {
  en:{ deliverTo:"Deliver to", search:"Search kirana, veggies, medicine…", need:"What do you need?",
    seeAll:"See all", near:"Shops near you", map:"View map", home:"Home", explore:"Explore", cart:"Cart",
    orders:"Orders", account:"Account", addCart:"Add", checkout:"Checkout", placeOrder:"Place order",
    cod:"Cash on Delivery", online:"Pay online", free:"FREE", off:"OFF" },
  np:{ deliverTo:"डेलिभरी", search:"किराना, तरकारी, औषधि खोज्नुहोस्…", need:"के चाहियो?",
    seeAll:"सबै हेर्नुहोस्", near:"नजिकका पसलहरू", map:"नक्सा", home:"गृह", explore:"खोज", cart:"कार्ट",
    orders:"अर्डर", account:"खाता", addCart:"थप्नुहोस्", checkout:"चेकआउट", placeOrder:"अर्डर गर्नुहोस्",
    cod:"डेलिभरीमा नगद", online:"अनलाइन तिर्नुहोस्", free:"नि:शुल्क", off:"छुट" },
};
const rs = (n)=> "रु "+n.toLocaleString("en-IN");

/* ---------- shared bits ---------- */
function StatusBar(){
  return (<div className="gp-status"><span>9:41</span>
    <span className="r"><Sparkles size={13}/><Bell size={13}/><span style={{fontWeight:800}}>25%</span></span></div>);
}
function Money({v}){ return <span>{rs(v)}</span>; }

function Stepper({q,onAdd,onSub}){
  return (<div className="gp-stepper"><button onClick={onSub}><Minus size={15}/></button>
    <span>{q}</span><button onClick={onAdd}><Plus size={15}/></button></div>);
}

function ProductRow({p,qty,onAdd,onSub}){
  return (<div className="gp-prow gp-fade">
    <div className="img">{p.emoji}</div>
    <div style={{flex:1,minWidth:0}}>
      <div className="nm">{p.name}</div>
      <div className="u np">{p.np} · {p.unit}</div>
      <div className="pr"><Money v={p.price}/>{p.mrp && <s><Money v={p.mrp}/></s>}</div>
    </div>
    {qty>0 ? <Stepper q={qty} onAdd={onAdd} onSub={onSub}/>
      : <button className="gp-add" onClick={onAdd}>+ Add</button>}
  </div>);
}
/* ---------- screens ---------- */
function Login({t,go,setLang,lang}){
  const [step,setStep]=useState(0); const [otp,setOtp]=useState("");
  return (<div className="gp-body" style={{background:"linear-gradient(180deg,#E11945,#B60E33)"}}>
    <div style={{padding:"70px 26px 26px",color:"#fff",minHeight:"100%",display:"flex",flexDirection:"column"}}>
      <div style={{fontSize:40,fontWeight:800}} className="display">GoPasal</div>
      <div className="np" style={{opacity:.9,marginTop:4}}>तपाईंको छिमेकको पसल, अब मोबाइलमा</div>
      <div style={{opacity:.85,fontSize:13,marginTop:2}}>Your neighbourhood shops, delivered.</div>
      <div style={{flex:1}}/>
      <div style={{background:"#fff",borderRadius:24,padding:22,color:"var(--ink)"}} className="gp-fade">
        {step===0 ? <>
          <div style={{fontWeight:800,fontSize:19,marginBottom:4}}>Log in or sign up</div>
          <div className="gp-note" style={{marginBottom:16}}>We'll send a one-time code by SMS.</div>
          <div className="gp-label">Mobile number</div>
          <div style={{display:"flex",gap:8}}>
            <div className="gp-input" style={{width:74,textAlign:"center",fontWeight:800}}>+977</div>
            <input className="gp-input" placeholder="98XXXXXXXX" inputMode="numeric" defaultValue="9812345678"/>
          </div>
          <button className="gp-btn primary block" style={{marginTop:18}} onClick={()=>setStep(1)}>Send code</button>
        </> : <>
          <div style={{fontWeight:800,fontSize:19,marginBottom:4}}>Enter the code</div>
          <div className="gp-note" style={{marginBottom:18}}>Sent to +977 98XXXXXX78 · <span style={{color:"var(--crimson)",fontWeight:700}}>Resend in 0:24</span></div>
          <div className="gp-otp">{[0,1,2,3].map(i=><div key={i} className={"box"+(otp.length===i?" on":"")}>{otp[i]||""}</div>)}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:18,justifyContent:"center"}}>
            {[1,2,3,4,5,6,7,8,9,0].map(n=><button key={n} className="gp-btn ghost" style={{width:56,height:44}}
              onClick={()=> otp.length<4 && setOtp(otp+n)}>{n}</button>)}
          </div>
          <button className="gp-btn primary block" style={{marginTop:16}} onClick={()=>go("home")}>Verify & continue</button>
        </>}
        <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:16}}>
          <span onClick={()=>setLang("en")} className="gp-chip" style={{fontSize:12,opacity:lang==="en"?1:.6}}>English</span>
          <span onClick={()=>setLang("np")} className="gp-chip np" style={{fontSize:12,opacity:lang==="np"?1:.6}}>नेपाली</span>
        </div>
      </div>
    </div>
  </div>);
}
function Home({t,lang,go,openStore,cartCount}){
  return (<div className="gp-body">
    <div className="gp-appbar">
      <div className="gp-loc">
        <div><div className="lab">{t.deliverTo}</div>
          <div className="val"><MapPin size={16}/> New Baneshwor, KTM <ChevronDown size={16}/></div></div>
        <button className="gp-iconbtn"><Bell size={18}/><span className="gp-badge" style={{top:2,right:2,minWidth:8,height:8,padding:0,border:"none"}}/></button>
      </div>
      <div className="gp-searchbar" onClick={()=>go("explore")}>
        <Search size={18} color="#E11945"/><span className={lang==="np"?"np":""}>{t.search}</span><Mic size={17} style={{marginLeft:"auto"}} color="#9B8F9C"/>
      </div>
    </div>

    <div className="gp-sec-h" style={{marginTop:18}}><h3 className={lang==="np"?"np":""}>{t.need}</h3><span className="link" onClick={()=>go("explore")}>{t.seeAll}</span></div>
    <div className="gp-catgrid">
      {CATS.map(c=>(<div className="gp-cat" key={c.key} onClick={()=>go("explore")}>
        <div className="ic" style={{background:c.bg,fontSize:26}}>{c.emoji}</div>
        <span className={lang==="np"?"np":""}>{lang==="np"?c.np:c.en}</span></div>))}
    </div>

    <div className="gp-promos" style={{marginTop:16}}>
      <div className="gp-promo" style={{background:"linear-gradient(135deg,#2540E8,#4C63F0)"}}>
        <span style={{background:"rgba(255,255,255,.22)",padding:"4px 9px",borderRadius:8,fontSize:10,fontWeight:800}}>🎉 NEW USER OFFER</span>
        <h4 style={{marginTop:10}}>Free delivery<br/>on your 1st order</h4>
        <p>Within 3 km · No minimum</p><span className="code">Code NAYAGRAHAK</span>
      </div>
      <div className="gp-promo" style={{background:"linear-gradient(135deg,#E11945,#F6A609)"}}>
        <span style={{background:"rgba(255,255,255,.22)",padding:"4px 9px",borderRadius:8,fontSize:10,fontWeight:800}}>⚡ DASHAIN DHAMAKA</span>
        <h4 style={{marginTop:10}}>Up to 40% off<br/>on daily kirana</h4>
        <p>Selected neighbourhood shops</p><span className="code">SHOP NOW</span>
      </div>
    </div>

    <div className="gp-sec-h"><h3 className={lang==="np"?"np":""}>{t.near}</h3><span className="link">{t.map}</span></div>
    {SHOPS.map(s=>(<div className="gp-card gp-store" key={s.id} onClick={()=> s.open && openStore(s)}>
      <div className="logo" style={{background:s.bg}}>{s.emoji}</div>
      <div style={{flex:1,minWidth:0}}>
        <div className="nm">{s.name} {s.badge && <span className="gp-pill rate"><BadgeCheck size={12}/>{s.badge}</span>}</div>
        <div className="meta">{s.cat}</div>
        <div className="row"><span><Star size={12} fill="#F6A609" color="#F6A609"/> <b>{s.rating}</b></span>
          <span><MapPin size={12}/> {s.km} km</span><span><Clock size={12}/> <b>{s.min} min</b></span>
          {s.free && <span style={{color:"var(--green)"}}><Bike size={12}/> Free</span>}</div>
      </div>
      {s.open ? <span className="gp-pill open"><CircleDot size={11}/> OPEN</span> : <span className="gp-pill closed">CLOSED</span>}
    </div>))}
    <div style={{height:20}}/>
  </div>);
}
function Explore({go,openStore,qty,addItem,subItem}){
  const [q,setQ]=useState(""); const [f,setF]=useState("all");
  const filters=["all","In stock","Under 30 min","Free delivery","Top rated"];
  const results = PRODUCTS.filter(p=> !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.np.includes(q));
  return (<div className="gp-body" style={{background:"#fff"}}>
    <div className="gp-hd" style={{position:"sticky",top:0,zIndex:20}}>
      <div className="back" onClick={()=>go("home")}><ChevronLeft size={20}/></div>
      <div className="gp-searchbar" style={{flex:1,boxShadow:"none",border:"1.5px solid var(--line)"}}>
        <Search size={18} color="#E11945"/>
        <input autoFocus placeholder="Try 'chamal' or गोलभेडा" value={q} onChange={e=>setQ(e.target.value)}/>
      </div>
    </div>
    <div className="gp-filters">{filters.map(x=><span key={x} className={"gp-fchip"+(f===x?" on":"")} onClick={()=>setF(x)}>{x==="all"?"All":x}</span>)}</div>
    {!q && <div style={{padding:"6px 16px"}}>
      <div className="gp-label" style={{marginBottom:10}}>POPULAR IN YOUR AREA</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{["Wai Wai","चामल","Eggs","Momo","Milk","औषधि","Cooking oil"].map(x=>
        <span key={x} className="gp-chip" onClick={()=>setQ(x)}><Search size={13}/>{x}</span>)}</div>
    </div>}
    {q && <>
      <div className="gp-sec-h" style={{margin:"12px 0 4px"}}><h3 style={{fontSize:15}}>Products · {results.length}</h3>
        <span className="link"><SlidersHorizontal size={13} style={{verticalAlign:-2}}/> Sort</span></div>
      {results.map(p=><ProductRow key={p.id} p={p} qty={qty[p.id]||0} onAdd={()=>addItem(p)} onSub={()=>subItem(p)}/>)}
      {results.length===0 && <div style={{padding:40,textAlign:"center"}}><div style={{fontSize:40}}>🔍</div>
        <div style={{fontWeight:700,marginTop:8}}>No matches yet</div><div className="gp-note">Try a simpler word — we understand Romanized Nepali too.</div></div>}
    </>}
  </div>);
}

function Store({store,go,openStore,qty,addItem,subItem,cartCount}){
  const [tab,setTab]=useState("kirana");
  return (<div className="gp-body" style={{background:"#fff"}}>
    <div style={{background:store.bg,padding:"14px 16px 18px",position:"relative"}}>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <div className="back" onClick={()=>go("home")} style={{cursor:"pointer",width:38,height:38,borderRadius:12,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center"}}><ChevronLeft size={20}/></div>
        <div style={{display:"flex",gap:8}}><div className="gp-iconbtn" style={{background:"#fff",color:"var(--ink)"}}><Heart size={18}/></div>
          <div className="gp-iconbtn" style={{background:"#fff",color:"var(--ink)"}}><Search size={18}/></div></div>
      </div>
      <div style={{display:"flex",gap:14,marginTop:14,alignItems:"center"}}>
        <div style={{width:66,height:66,borderRadius:18,background:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32}}>{store.emoji}</div>
        <div><div style={{fontWeight:800,fontSize:20}}>{store.name}</div>
          <div style={{fontSize:12.5,color:"var(--ink-60)",marginTop:2}}>{store.cat}</div></div>
      </div>
      <div className="gp-card" style={{display:"flex",justifyContent:"space-around",padding:"12px 6px",marginTop:14,textAlign:"center"}}>
        <div><div style={{fontWeight:800}}><Star size={12} fill="#F6A609" color="#F6A609"/> {store.rating}</div><div style={{fontSize:10.5,color:"var(--ink-40)"}}>2.4k ratings</div></div>
        <div><div style={{fontWeight:800}}>{store.min} min</div><div style={{fontSize:10.5,color:"var(--ink-40)"}}>delivery</div></div>
        <div><div style={{fontWeight:800,color:"var(--green)"}}>Self-delivery</div><div style={{fontSize:10.5,color:"var(--ink-40)"}}>by this shop</div></div>
      </div>
    </div>
    <div style={{display:"flex",gap:6,padding:"10px 16px",borderBottom:"1px solid var(--line)",overflowX:"auto"}} className="gp-filters">
      {["kirana","veg","home"].map(c=>{const cc=CATS.find(x=>x.key===c);return <span key={c} className={"gp-fchip"+(tab===c?" on":"")} onClick={()=>setTab(c)}>{cc.emoji} {cc.en}</span>;})}
    </div>
    {PRODUCTS.filter(p=>p.cat===tab||tab==="kirana").map(p=><ProductRow key={p.id} p={p} qty={qty[p.id]||0} onAdd={()=>addItem(p)} onSub={()=>subItem(p)}/>)}
    <div style={{height:90}}/>
    {cartCount>0 && <div className="gp-toast" style={{background:"var(--crimson)",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>go("cart")}>
      <span><ShoppingCart size={16} style={{verticalAlign:-3}}/> {cartCount} item{cartCount>1?"s":""} in cart</span>
      <span style={{fontWeight:800}}>View cart <ArrowRight size={15} style={{verticalAlign:-2}}/></span></div>}
  </div>);
}
function Cart({go,items,addItem,subItem,subtotal,store}){
  const delivery = subtotal>0 ? (subtotal>800?0:40) : 0; const fee=subtotal>0?9:0;
  if(subtotal===0) return (<div className="gp-body" style={{background:"#fff"}}>
    <div className="gp-hd"><h2>Your cart</h2></div>
    <div style={{padding:"70px 30px",textAlign:"center"}}><div style={{fontSize:54}}>🛒</div>
      <div style={{fontWeight:800,fontSize:18,marginTop:12}}>Your cart is empty</div>
      <div className="gp-note" style={{marginTop:6}}>Add items from a shop near you to get started.</div>
      <button className="gp-btn primary block" style={{marginTop:22}} onClick={()=>go("home")}>Browse shops</button></div>
  </div>);
  return (<div className="gp-body" style={{background:"var(--paper)"}}>
    <div className="gp-hd" style={{background:"#fff"}}><div className="back" onClick={()=>go("home")}><ChevronLeft size={20}/></div><h2>Your cart</h2></div>
    <div className="gp-card" style={{margin:"14px 16px",padding:12,display:"flex",gap:10,alignItems:"center"}}>
      <div style={{width:44,height:44,borderRadius:12,background:store?.bg||"#FFF3DA",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{store?.emoji||"🏪"}</div>
      <div style={{flex:1}}><div style={{fontWeight:800,fontSize:14}}>{store?.name||"Namaste Kirana Pasal"}</div>
        <div style={{fontSize:11.5,color:"var(--green)",fontWeight:700}}><Bike size={12} style={{verticalAlign:-2}}/> Self-delivered · ~{store?.min||12} min</div></div>
    </div>
    <div className="gp-card" style={{margin:"0 16px",overflow:"hidden"}}>
      {items.map(it=>(<div className="gp-prow" key={it.id} style={{borderBottom:"1px solid var(--line)"}}>
        <div className="img" style={{width:54,height:54,fontSize:24}}>{it.emoji}</div>
        <div style={{flex:1}}><div className="nm" style={{fontSize:14}}>{it.name}</div><div className="u">{it.unit}</div>
          <div className="pr" style={{fontSize:14}}><Money v={it.price*it.q}/></div></div>
        <Stepper q={it.q} onAdd={()=>addItem(it)} onSub={()=>subItem(it)}/>
      </div>))}
    </div>
    <div className="gp-card gp-list-item" style={{margin:"12px 16px",border:"1px dashed var(--crimson)"}}>
      <div className="ic" style={{color:"var(--crimson)"}}><Tag size={18}/></div>
      <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>Apply coupon</div><div className="gp-note">NAYAGRAHAK · free delivery</div></div>
      <ChevronRight size={18} color="#9B8F9C"/>
    </div>
    <div className="gp-card gp-summary" style={{margin:"0 16px 16px"}}>
      <div className="ln">Item total <b><Money v={subtotal}/></b></div>
      <div className="ln">Delivery fee {delivery===0?<b style={{color:"var(--green)"}}>FREE</b>:<b><Money v={delivery}/></b>}</div>
      <div className="ln">Platform fee <b><Money v={fee}/></b></div>
      <div className="ln tot" style={{display:"flex",justifyContent:"space-between"}}><span>To pay</span><span><Money v={subtotal+delivery+fee}/></span></div>
    </div>
    <div style={{height:90}}/>
    <div className="gp-toast" style={{background:"var(--crimson)",justifyContent:"space-between",cursor:"pointer"}} onClick={()=>go("checkout")}>
      <span><b><Money v={subtotal+delivery+fee}/></b></span><span style={{fontWeight:800}}>Checkout <ArrowRight size={15} style={{verticalAlign:-2}}/></span></div>
  </div>);
}
function Checkout({go,subtotal,placeOrder}){
  const [pay,setPay]=useState("cod"); const delivery=subtotal>800?0:40; const fee=9; const total=subtotal+delivery+fee;
  return (<div className="gp-body" style={{background:"var(--paper)"}}>
    <div className="gp-hd" style={{background:"#fff"}}><div className="back" onClick={()=>go("cart")}><ChevronLeft size={20}/></div><h2>Checkout</h2></div>
    <div className="gp-label" style={{margin:"16px 16px 8px"}}>DELIVERY ADDRESS</div>
    <div className="gp-card gp-list-item" style={{margin:"0 16px"}}>
      <div className="ic"><Home size={18}/></div>
      <div style={{flex:1}}><div style={{fontWeight:800,fontSize:14}}>Home · New Baneshwor</div>
        <div className="gp-note">Ward 10, near Shankhamul Bridge, Kathmandu</div></div>
      <span className="link" style={{color:"var(--crimson)",fontWeight:700,fontSize:13}}>Change</span>
    </div>
    <div className="gp-label" style={{margin:"18px 16px 8px"}}>PAYMENT METHOD</div>
    <div className={"gp-pay"+(pay==="cod"?" sel":"")} onClick={()=>setPay("cod")}>
      <div className="gp-radio"><i/></div><Banknote size={20} color="#0E9F6E"/>
      <div style={{flex:1}}><div style={{fontWeight:800,fontSize:14}}>Cash on Delivery</div><div className="gp-note">Pay the shop when it arrives · recommended</div></div>
    </div>
    <div className={"gp-pay"+(pay==="online"?" sel":"")} onClick={()=>setPay("online")}>
      <div className="gp-radio"><i/></div><Wallet size={20} color="#2540E8"/>
      <div style={{flex:1}}><div style={{fontWeight:800,fontSize:14}}>Pay online</div><div className="gp-note">eSewa · Khalti · IME Pay · cards</div></div>
    </div>
    <div className="gp-card" style={{margin:"14px 16px",padding:"12px 14px",display:"flex",gap:10,background:"var(--green-050)",border:"none"}}>
      <ShieldCheck size={20} color="#0E9F6E"/><div className="gp-note" style={{color:"#0A7350"}}>Delivered by the shop itself. You'll get an OTP to confirm delivery — no payment leaves your hands until then.</div>
    </div>
    <div className="gp-card gp-summary" style={{margin:"0 16px 16px"}}>
      <div className="ln">Item total <b><Money v={subtotal}/></b></div>
      <div className="ln">Delivery {delivery===0?<b style={{color:"var(--green)"}}>FREE</b>:<b><Money v={delivery}/></b>}</div>
      <div className="ln">Platform fee <b><Money v={fee}/></b></div>
      <div className="ln tot" style={{display:"flex",justifyContent:"space-between"}}><span>{pay==="cod"?"Pay on delivery":"Pay now"}</span><span><Money v={total}/></span></div>
    </div>
    <div style={{height:96}}/>
    <div className="gp-cta-bar" style={{position:"absolute",left:0,right:0,bottom:0}}>
      <button className="gp-btn primary block" onClick={placeOrder}>Place order · <Money v={total}/></button></div>
  </div>);
}

const TRACK=[
  {k:"Placed",d:"Order placed · 6:42 PM",done:true},
  {k:"Accepted",d:"Shop accepted your order",done:true},
  {k:"Packed",d:"Being packed by Namaste Kirana",now:true},
  {k:"Out for delivery",d:"Shopkeeper on the way",done:false},
  {k:"Delivered",d:"Confirm with OTP 4821",done:false},
];
function Track({go}){
  return (<div className="gp-body" style={{background:"#fff"}}>
    <div className="gp-hd"><div className="back" onClick={()=>go("orders")}><ChevronLeft size={20}/></div><h2>Order #GP-48213</h2></div>
    <div style={{margin:"14px 16px",padding:16,borderRadius:20,background:"linear-gradient(135deg,#E11945,#B60E33)",color:"#fff"}}>
      <div style={{fontSize:12,opacity:.9}}>Estimated arrival</div>
      <div style={{fontSize:30,fontWeight:800}} className="display">6:58 PM</div>
      <div style={{fontSize:12.5,opacity:.92}}>Namaste Kirana Pasal is delivering your order</div>
    </div>
    <div className="gp-track">{TRACK.map((s,i)=>(<div key={i} className={"gp-step"+(s.done?" done":s.now?" now":"")}>
      <div className="rail"><div className="dot">{s.done?<Check size={15}/>:s.now?<CircleDot size={14}/>:<Clock size={13}/>}</div>{i<TRACK.length-1&&<div className="bar"/>}</div>
      <div className="txt"><b>{s.k}</b><p>{s.d}</p></div></div>))}</div>
    <div className="gp-card" style={{margin:"6px 16px 16px",padding:14,display:"flex",gap:12,alignItems:"center"}}>
      <div style={{width:46,height:46,borderRadius:14,background:"#FFF3DA",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🏪</div>
      <div style={{flex:1}}><div style={{fontWeight:800,fontSize:14}}>Ram Bahadur · Shopkeeper</div><div className="gp-note">Delivering it himself</div></div>
      <button className="gp-btn ghost mini"><Phone size={16}/></button>
      <button className="gp-btn primary mini"><MessageCircle size={16}/></button>
    </div>
    <div className="gp-list-item" onClick={()=>go("support")}><div className="ic"><LifeBuoy size={18}/></div>
      <div style={{flex:1,fontWeight:700,fontSize:14}}>Need help with this order?</div><ChevronRight size={18} color="#9B8F9C"/></div>
  </div>);
}
function Orders({go}){
  const active=[{id:"GP-48213",shop:"Namaste Kirana Pasal",emoji:"🏪",items:"3 items · रु 1,010",status:"Being packed",eta:"6:58 PM"}];
  const past=[{id:"GP-48090",shop:"Everest Fresh Veggies",emoji:"🥬",items:"5 items · रु 640",status:"Delivered · Aug 18"},
    {id:"GP-47781",shop:"Sagarmatha Pharmacy",emoji:"💊",items:"2 items · रु 430",status:"Delivered · Aug 14"}];
  return (<div className="gp-body" style={{background:"var(--paper)"}}>
    <div className="gp-hd" style={{background:"#fff"}}><h2>Your orders</h2></div>
    <div className="gp-label" style={{margin:"16px 16px 8px"}}>ACTIVE</div>
    {active.map(o=>(<div key={o.id} className="gp-card" style={{margin:"0 16px 12px",padding:14,cursor:"pointer"}} onClick={()=>go("track")}>
      <div style={{display:"flex",gap:12,alignItems:"center"}}>
        <div style={{width:46,height:46,borderRadius:14,background:"#FFF3DA",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{o.emoji}</div>
        <div style={{flex:1}}><div style={{fontWeight:800,fontSize:14.5}}>{o.shop}</div><div className="gp-note">#{o.id} · {o.items}</div></div>
        <span className="gp-pill open"><CircleDot size={11}/> LIVE</span></div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,paddingTop:12,borderTop:"1px solid var(--line)"}}>
        <span style={{fontSize:13,fontWeight:700}}><Bike size={14} style={{verticalAlign:-2}} color="#E11945"/> {o.status} · ETA {o.eta}</span>
        <span className="link" style={{color:"var(--crimson)",fontWeight:800,fontSize:13}}>Track <ArrowRight size={13} style={{verticalAlign:-2}}/></span></div>
    </div>))}
    <div className="gp-label" style={{margin:"16px 16px 8px"}}>PAST ORDERS</div>
    {past.map(o=>(<div key={o.id} className="gp-card" style={{margin:"0 16px 12px",padding:14}}>
      <div style={{display:"flex",gap:12,alignItems:"center"}}>
        <div style={{width:44,height:44,borderRadius:12,background:"var(--paper)",border:"1px solid var(--line)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{o.emoji}</div>
        <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{o.shop}</div><div className="gp-note">{o.items} · {o.status}</div></div>
        <button className="gp-btn ghost mini"><RotateCcw size={14}/> Reorder</button></div>
    </div>))}
    <div style={{height:20}}/>
  </div>);
}

function Account({go,lang,setLang}){
  return (<div className="gp-body" style={{background:"var(--paper)"}}>
    <div className="gp-appbar" style={{paddingBottom:26}}>
      <div style={{display:"flex",gap:14,alignItems:"center",paddingTop:8}}>
        <div style={{width:58,height:58,borderRadius:18,background:"rgba(255,255,255,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>🙏</div>
        <div><div style={{fontWeight:800,fontSize:19}}>Namaste, Sita!</div><div style={{opacity:.9,fontSize:13}}>+977 98XXXXXX78</div></div>
      </div>
    </div>
    <div className="gp-gold">
      <div style={{display:"flex",alignItems:"center",gap:8}}><Crown size={20}/><span style={{fontWeight:800,fontSize:16}}>GoPasal Gold</span></div>
      <div style={{fontSize:12.5,marginTop:6,opacity:.85}}>Free delivery on every order + member prices. रु 149/month.</div>
      <button className="gp-btn mini" style={{background:"#1B1220",color:"#fff",marginTop:12}}>Try 30 days free</button>
    </div>
    <div className="gp-card" style={{margin:"4px 16px 12px",overflow:"hidden"}}>
      <div className="gp-list-item"><div className="ic"><MapPin size={18}/></div><div style={{flex:1,fontWeight:700,fontSize:14}}>Saved addresses</div><ChevronRight size={18} color="#9B8F9C"/></div>
      <div className="gp-list-item"><div className="ic"><Heart size={18}/></div><div style={{flex:1,fontWeight:700,fontSize:14}}>Favourite shops</div><ChevronRight size={18} color="#9B8F9C"/></div>
      <div className="gp-list-item"><div className="ic"><Wallet size={18}/></div><div style={{flex:1,fontWeight:700,fontSize:14}}>Loyalty points</div><span style={{fontWeight:800,color:"var(--crimson)"}}>1,240</span></div>
      <div className="gp-list-item" onClick={()=>go("support")}><div className="ic"><LifeBuoy size={18}/></div><div style={{flex:1,fontWeight:700,fontSize:14}}>Help & support</div><ChevronRight size={18} color="#9B8F9C"/></div>
    </div>
    <div className="gp-card" style={{margin:"0 16px 12px",padding:"14px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><Globe size={18} color="#E11945"/><span style={{fontWeight:800,fontSize:14}}>Language / भाषा</span></div>
      <div style={{display:"flex",gap:8}}>
        <button className={"gp-btn "+(lang==="en"?"primary":"ghost")} style={{flex:1,padding:12}} onClick={()=>setLang("en")}>English</button>
        <button className={"gp-btn np "+(lang==="np"?"primary":"ghost")} style={{flex:1,padding:12}} onClick={()=>setLang("np")}>नेपाली</button>
      </div>
    </div>
    <div style={{height:20}}/>
  </div>);
}

function Support({go}){
  return (<div className="gp-body" style={{background:"var(--paper)"}}>
    <div className="gp-hd" style={{background:"#fff"}}><div className="back" onClick={()=>go("orders")}><ChevronLeft size={20}/></div><h2>Help & support</h2></div>
    <div className="gp-label" style={{margin:"16px 16px 8px"}}>WHAT WENT WRONG?</div>
    {[["Order is late","Delayed delivery"],["Wrong or missing items","Report items"],["Cancel my order","Before dispatch only"],["Payment / COD issue","Amount mismatch"]].map(([a,b],i)=>(
      <div key={i} className="gp-card gp-list-item" style={{margin:"0 16px 10px"}}>
        <div className="ic"><ReceiptText size={18}/></div><div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{a}</div><div className="gp-note">{b}</div></div><ChevronRight size={18} color="#9B8F9C"/></div>))}
    <div className="gp-card" style={{margin:"14px 16px",padding:16,textAlign:"center"}}>
      <MessageCircle size={26} color="#E11945"/><div style={{fontWeight:800,marginTop:8}}>Chat with GoPasal Sathi</div>
      <div className="gp-note">Our AI assistant answers instantly, 24/7 — in Nepali or English.</div>
      <button className="gp-btn primary block" style={{marginTop:14}}>Start chat</button></div>
  </div>);
}
/* ---------- root ---------- */
export default function GoPasalCustomerApp(){
  const [lang,setLang]=useState("en"); const t=T[lang];
  const [screen,setScreen]=useState("login");
  const [store,setStore]=useState(SHOPS[0]);
  const [cart,setCart]=useState({});     // id -> qty
  const [toast,setToast]=useState(null);
  const go=(s)=>setScreen(s);
  const openStore=(s)=>{ setStore(s); setScreen("store"); };
  const flash=(m)=>{ setToast(m); setTimeout(()=>setToast(null),1800); };
  const addItem=(p)=>{ setCart(c=>({...c,[p.id]:(c[p.id]||0)+1})); flash(`${p.name} added to cart`); };
  const subItem=(p)=>{ setCart(c=>{ const n={...c}; if(!n[p.id])return n; n[p.id]-=1; if(n[p.id]<=0)delete n[p.id]; return n; }); };
  const items=useMemo(()=>Object.entries(cart).map(([id,q])=>{ const p=PRODUCTS.find(x=>x.id===+id); return p&&{...p,q}; }).filter(Boolean),[cart]);
  const subtotal=items.reduce((s,i)=>s+i.price*i.q,0);
  const cartCount=items.reduce((s,i)=>s+i.q,0);
  const placeOrder=()=>{ setScreen("track"); setCart({}); flash("Order placed! 🎉"); };

  const showChrome = !["login"].includes(screen);
  const navItems=[["home",Home,t.home],["explore",Compass,t.explore],["cart",ShoppingCart,t.cart],["orders",ReceiptText,t.orders],["account",User,t.account]];

  return (<div className="gp"><style>{CSS}</style>
    <div className="gp-stage">
      <div className="gp-topbar">
        <span className="gp-chip active"><Store size={14}/> Customer App</span>
        <span className="gp-chip">gopasal.com · web</span>
        <span className="gp-chip" onClick={()=>setLang(lang==="en"?"np":"en")}><Globe size={14}/> {lang==="en"?"EN":"नेपाली"}</span>
      </div>
      <div className="gp-phone"><div className="gp-notch"/><div className="gp-screen">
        {showChrome && <StatusBar/>}
        {screen==="login" && <Login t={t} go={go} lang={lang} setLang={setLang}/>}
        {screen==="home" && <Home t={t} lang={lang} go={go} openStore={openStore} cartCount={cartCount}/>}
        {screen==="explore" && <Explore go={go} openStore={openStore} qty={cart} addItem={addItem} subItem={subItem}/>}
        {screen==="store" && <Store store={store} go={go} qty={cart} addItem={addItem} subItem={subItem} cartCount={cartCount}/>}
        {screen==="cart" && <Cart go={go} items={items} addItem={addItem} subItem={subItem} subtotal={subtotal} store={store}/>}
        {screen==="checkout" && <Checkout go={go} subtotal={subtotal} placeOrder={placeOrder}/>}
        {screen==="track" && <Track go={go}/>}
        {screen==="orders" && <Orders go={go}/>}
        {screen==="account" && <Account go={go} lang={lang} setLang={setLang}/>}
        {screen==="support" && <Support go={go}/>}
        {toast && <div className="gp-toast"><Check size={16} color="#4ADE80"/> {toast}</div>}
        {showChrome && <div className="gp-nav">
          {navItems.map(([k,Ic,lab],i)=> k==="cart" ?
            <div key={k} className="it" onClick={()=>go("cart")}><div className="fab"><ShoppingCart size={22}/>{cartCount>0&&<span className="gp-badge">{cartCount}</span>}</div></div>
            : <div key={k} className={"it"+(screen===k?" active":"")} onClick={()=>go(k)}><Ic size={21}/><span>{lab}</span></div>)}
        </div>}
      </div></div>
      <div style={{fontSize:12,color:"#8b7f8c",fontWeight:600,textAlign:"center",maxWidth:390}}>
        GoPasal · <span className="np" style={{color:"#E11945"}}>तपाईंको छिमेकको पसल</span> · Tap the tabs and cart to explore the full customer flow.
      </div>
    </div>
  </div>);
}

