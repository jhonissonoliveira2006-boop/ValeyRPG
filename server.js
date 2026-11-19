#!/usr/bin/env node
/* ============================================================
   VALLEY — SERVIDOR (server.js)
   Sem dependências: só Node 18+.  Rodar:  node server.js
   Abra  http://localhost:3000  (o index.html é servido daqui).
   Tudo fica em ./data  (db.json = contas e conversas · media/ = arquivos do chat)
   Inclui: contas, mesa/salas, chat em tempo real, MÍDIA (até 50 MB), LIVE DE VOZ
   e MÚSICA DA SALA (toca-discos: quem põe um disco toca para todos da sala).
   O index.html é só o jogo; este arquivo é só o servidor. Ficam separados, na mesma pasta.
   ============================================================ */
const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto"),zlib=require("zlib");
const PORT=+process.env.PORT||3000,DIR=process.env.VALLEY_DATA||path.join(__dirname,"data"),MEDIA=path.join(DIR,"media"),DBF=path.join(DIR,"db.json");
const MAXM=50*1024*1024,MAXA=150*1024*1024,MAXH=5000,MAXR=60,PERU=3,has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
fs.mkdirSync(MEDIA,{recursive:true});
/* ---------- banco (arquivo JSON, gravação atômica) ---------- */
const fresh=()=>({users:{},pass:{},tokens:{},chats:{},inv:[],rooms:{}});
let db;try{db=Object.assign(fresh(),JSON.parse(fs.readFileSync(DBF,"utf8")))}catch(e){db=fresh()}
const seed=()=>{if(!db.rooms||typeof db.rooms!=="object")db.rooms={};if(!Object.keys(db.rooms).length){db.rooms["#taverna"]={id:"#taverna",n:"Taverna",e:"🍺",by:"sys",at:Date.now()};db.rooms["#praca"]={id:"#praca",n:"Praça",e:"⛲",by:"sys",at:Date.now()}}};seed();
let pt;const flush=()=>{clearTimeout(pt);try{fs.writeFileSync(DBF+".tmp",JSON.stringify(db));fs.renameSync(DBF+".tmp",DBF)}catch(e){console.error("Falha ao gravar db:",e.message)}};
const persist=()=>{clearTimeout(pt);pt=setTimeout(flush,400)};
const copy=o=>JSON.parse(JSON.stringify(o));
/* ---------- contas ---------- */
const hashPw=(p,salt)=>{salt=salt||crypto.randomBytes(16).toString("hex");return"s:"+salt+":"+crypto.scryptSync(p,salt,32).toString("hex")};
const okPw=(p,st)=>{const a=String(st||"").split(":");if(a[0]!=="s"||a.length!==3)return false;const h=Buffer.from(crypto.scryptSync(p,a[1],32).toString("hex")),g=Buffer.from(a[2]);return h.length===g.length&&crypto.timingSafeEqual(h,g)};
const newToken=u=>{const t=crypto.randomBytes(24).toString("hex");db.tokens[t]=u;persist();return t};
const userOf=t=>(t&&has(db.tokens,t)&&db.tokens[t])||null;
/* ---------- validação (igual à do jogo) ---------- */
function cleanB(b,fb){b=b&&typeof b==="object"?b:{};fb=fb||{};
const N=(v,lo,hi,d)=>{v=+v;return isFinite(v)?Math.min(hi,Math.max(lo,v)):d},
I=(v,hi,d)=>Math.round(N(v,0,hi,d)),
C=(v,d)=>/^#[0-9a-f]{3,8}$/i.test(v)?v:d,
F=(v,lo,hi,d)=>+N(v,lo,hi,d).toFixed(2);
let hl=[80,50,80,50];try{if(typeof HL!=="undefined"&&HL&&HL.length>=4)hl=hl.map((m,i)=>Math.max(m,HL[i].length-1))}catch(e){}
const PL=[[0,0,0,0],[0,0,1,0],[0,0,2,0],[2,0,1,0],[0,0,3,0],[4,0,1,0],[0,0,4,0],[6,0,1,0]],
LH=b.hb===undefined&&b.h?(PL[b.h|0]||PL[0]):[b.hb,b.hs,b.ht,b.hf].map((v,i)=>Math.min(hl[i],Math.max(0,v|0)));
const o={c:C(b.c,fb.c||"#2f7fc1"),a:String(b.a||"").replace(/[<>&"']/g,"").slice(0,8),e:0,m:Math.min(5,Math.max(0,b.m|0)),hb:LH[0],hs:LH[1],ht:LH[2],hf:LH[3],hc:C(b.hc,"#2b1b12"),br:b.br===undefined?1:Math.min(13,Math.max(0,b.br|0)),rp:Math.min(32,Math.max(0,b.rp|0)),rc:C(b.rc,"#ffffff"),ee:Math.min(6,Math.max(0,b.ee|0)),ec:C(b.ec,"#0f2a40"),mt:Math.min(5,Math.max(0,b.mt|0)),me:Math.min(6,Math.max(0,b.me|0))};
/* campos novos do Lab: só entram se o personagem os tiver (personagens antigos continuam idênticos) */
const has=k=>b[k]!==undefined&&b[k]!==null,
ints={fh:7,et:7,bw:4,bl:3,hv:7,ha:5,hl:4,hvo:4,hw:3,he:7,sl:5,gl:3,ab:40,pe:23},
flts={cw:[.5,1.8,1],ch:[.5,1.8,1],ex:[-8,8,0],ey:[-8,8,0],es:[.5,1.8,1],mx:[-8,8,0],my:[-8,8,0],ms:[.5,1.8,1],lx:[-8,8,0],ly:[-8,8,0],rx:[-8,8,0],ry:[-8,8,0]},
cols={ac:"#e8506a",sc:"#ffffff",gc:"#ffffff"};
for(const k in ints)if(has(k))o[k]=I(b[k],ints[k],0);
for(const k in flts)if(has(k)){const[lo,hi,d]=flts[k];o[k]=F(b[k],lo,hi,d)}
for(const k in cols)if(has(k))o[k]=C(b[k],cols[k]);
if(has("fl"))o.fl=b.fl?1:0;
if(b.w&&typeof b.w==="object"){const w={};["cape","skirt","scarf","wing","tail","orn","gear"].forEach(k=>{const s=b.w[k];if(!s||typeof s!=="object")return;const q={i:I(s.i,9,0),c:C(s.c,"#d45a5a"),sx:F(s.sx,.5,1.8,1),sy:F(s.sy,.5,1.8,1)};["rig","damp","amp","wind"].forEach(f=>{if(s[f]!==undefined)q[f]=F(s[f],0,2.5,1)});w[k]=q});if(Object.keys(w).length)o.w=w}
if(typeof cuClean==="function"){const cu=cuClean(b.cu);if(cu){o.cu=cu;o.hb=o.hs=o.ht=o.hf=0}}
{const ei=typeof cleanIt==="function"?cleanIt(b.ei):null;if(ei&&ei.length)o.ei=ei.slice(0,4)}
return o}
const HEX=/^#[0-9a-f]{3,8}$/i,PNG=/^data:image\/png;base64,[A-Za-z0-9+\/=]+$/,IMG=/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/,ID=/^[\w-]{1,8}$/;
const SLOTS=["mao","mao2","costas","cabeca"],KINDS=["espada","adaga","arco","cajado","escudo","capa","chapeu","outro","agua","comida","remedio"],SHP=["r","c","t","l","p"],IID=/^[a-z0-9]{3,8}$/;
function cleanIt(a){if(!Array.isArray(a))return null;const N=(v,lo,hi,d)=>{v=+v;return isFinite(v)?Math.min(hi,Math.max(lo,v)):d},F=(v,lo,hi,d)=>+N(v,lo,hi,d).toFixed(1),seen=new Set();
return a.slice(0,12).map(x=>{if(!x||typeof x!=="object"||typeof x.id!=="string"||!IID.test(x.id)||seen.has(x.id))return null;seen.add(x.id);
const g=(Array.isArray(x.g)?x.g:[]).slice(0,40).map(s=>{if(!s||typeof s!=="object"||!SHP.includes(s.t))return null;
const q={t:s.t,x:F(s.x,-40,40,0),y:F(s.y,-40,40,0),w:F(s.w,1,80,8),h:F(s.h,1,80,8),r:F(s.r,-360,360,0),c:HEX.test(s.c)?s.c:"#cccccc",l:F(s.l,1,8,2)};if(s.n)q.n=1;
if(s.t==="p"){q.p=(Array.isArray(s.p)?s.p:[]).slice(0,12).map(p=>Array.isArray(p)?[F(p[0],-40,40,0),F(p[1],-40,40,0)]:null).filter(Boolean);if(q.p.length<3)return null}
return q}).filter(Boolean);
return{id:x.id,n:String(x.n||"").replace(/[<>&"'`]/g,"").slice(0,20)||"Item",i:[...String(x.i||"").replace(/[<>&"'`\s]/g,"")].slice(0,2).join("")||"✨",k:KINDS.includes(x.k)?x.k:"outro",s:SLOTS.includes(x.s)?x.s:"mao",m:x.m?1:0,q:Math.round(N(x.q,1,99,1)),g}}).filter(Boolean)}
function clean(u,d,old){old=old||{};
if(!d||typeof d!=="object"||Array.isArray(d)||JSON.stringify(d).length>2600000)return null;
const o={...d};o.u=u;
o.cn=String(o.cn||old.cn||u).replace(/[<>]/g,"").slice(0,20);
o.bio=String(o.bio||"").slice(0,200);
const b=o.b&&typeof o.b==="object"?o.b:{};
o.b=cleanB(b);
if(o.photo&&!(typeof o.photo==="string"&&o.photo.length<150000&&IMG.test(o.photo)))delete o.photo;
for(const k of["fm","bd"])if(o[k]&&!(typeof o[k]==="string"&&o[k].length<60000&&PNG.test(o[k])))delete o[k];
if(o.shape!=="q")o.shape="r";
if(o.fr){const f=o.fr;o.fr={};if(ID.test(f.s))o.fr.s=f.s;if(HEX.test(f.c))o.fr.c=f.c}
if(o.bb){const f=o.bb;o.bb={};if(HEX.test(f.c))o.bb.c=f.c;if(ID.test(f.f))o.bb.f=f.f;if(ID.test(f.b))o.bb.b=f.b}
if(Array.isArray(o.sk)){const V=/^[a-z]{1,12}$/;o.sk=o.sk.slice(0,6).map(k=>k&&typeof k==="object"?{n:String(k.n||"").replace(/[<>&"'`]/g,"").slice(0,20),i:[...String(k.i||"").replace(/[<>&"'`\s]/g,"")].slice(0,2).join(""),p:V.test(k.p)?k.p:"",bg:V.test(k.bg)?k.bg:"",fx:V.test(k.fx)?k.fx:"",c:Math.min(7,Math.max(0,k.c|0)),v:k.v==null?1:Math.min(2,Math.max(0,k.v|0)),d:k.d==null?1:Math.min(2,Math.max(0,k.d|0)),s:V.test(k.s)?k.s:"",it:IID.test(String(k.it||""))?String(k.it):""}:null).filter(k=>k&&k.n)}else delete o.sk;
{const it=cleanIt(o.it);if(it&&it.length){o.it=it;const E={},q=o.eq&&typeof o.eq==="object"&&!Array.isArray(o.eq)?o.eq:{};for(const k of SLOTS)if(typeof q[k]==="string"&&it.some(v=>v.id===q[k]&&v.s===k))E[k]=q[k];o.eq=E}else{delete o.it;delete o.eq}
if(o.bx&&typeof o.bx==="object"&&!Array.isArray(o.bx)){const B={};Object.keys(o.bx).slice(-30).forEach(k=>{if(/^[a-z0-9]{4,10}$/.test(k)&&Array.isArray(o.bx[k]))B[k]=o.bx[k].filter(v=>typeof v==="string"&&IID.test(v)).slice(0,8)});if(Object.keys(B).length)o.bx=B;else delete o.bx}else delete o.bx}
{o.co=Math.min(999999999,Math.max(0,Math.floor(+o.co||0)));if(!o.co)delete o.co;o.vts=Math.max(0,Math.floor(+o.vts||0));if(!o.vts)delete o.vts;if(Array.isArray(o.sp)){o.sp=[...new Set(o.sp.filter(v=>typeof v==="string"&&/^[a-z0-9]{2,10}$/.test(v)))].slice(0,60);if(!o.sp.length)delete o.sp}else delete o.sp;if(o.cx&&typeof o.cx==="object"&&!Array.isArray(o.cx)){const X={};Object.keys(o.cx).slice(-40).forEach(k=>{if(/^[a-z0-9]{4,10}$/.test(k)&&o.cx[k])X[k]=1});if(Object.keys(X).length)o.cx=X;else delete o.cx}else delete o.cx}
if(Array.isArray(o.npcs)){const sn=new Set();o.npcs=o.npcs.slice(0,30).map(x=>{if(!x||typeof x!=="object"||typeof x.id!=="string"||!/^[a-z0-9]{3,10}$/.test(x.id)||sn.has(x.id))return null;sn.add(x.id);return{id:x.id,n:String(x.n||"").replace(/[<>&"'`]/g,"").slice(0,20)||"NPC",t:String(x.t||"").replace(/[<>]/g,"").slice(0,200),a:String(x.a||"").replace(/[<>&"'`]/g,"").slice(0,20),b:cleanB(x.b)}}).filter(Boolean);if(!o.npcs.length)delete o.npcs}else delete o.npcs
if(Array.isArray(o.fichas)){o.fichas=o.fichas.slice(0,8).map(x=>{if(!x||typeof x!=="object"||Array.isArray(x))return null;const y=clean(u,{...x,fichas:undefined,ac:undefined},{cn:u});if(!y)return null;delete y.u;delete y.fichas;delete y.ac;return y}).filter(Boolean);if(o.fichas.length)o.ac=Math.min(o.fichas.length-1,Math.max(0,o.ac|0));else{delete o.fichas;delete o.ac}}else{delete o.fichas;delete o.ac}
return o}
const pubU=me=>{const r={};for(const k in db.users){const x={...db.users[k]};if(k!==me){delete x.fichas;delete x.ac;delete x.npcs}r[k]=x}return r},pubOne=p=>{const x={...p};delete x.fichas;delete x.ac;delete x.npcs;return x};
const isRoom=e=>typeof e==="string"&&has(db.rooms,e);
const okEsp=e=>e===""||(typeof e==="string"&&(has(db.users,e)||isRoom(e)));
const hist=(esp,u)=>(db.chats[esp]||[]).filter(g=>!g.sc||g.u===u||g.sc===u).slice(-60);
const idKey=m=>parseFloat(String(m.i||"").replace(/^\D+/,""))||0;

/* ---------- tempo real: conexões, salas, chat, LIVE de voz ---------- */
const conns=new Set();
function wsSend(c,o){if(c.readyState===1)c.send(JSON.stringify(o))}
const online=()=>[...new Set([...conns].map(c=>c.u))];
const cast=(o,f)=>{for(const c of conns)if(!f||f(c))wsSend(c,o)};
const liveList=e=>[...new Set([...conns].filter(o=>o.live&&o.esp===e).map(o=>o.u))],liveCast=e=>cast({t:"live",esp:e,l:liveList(e)},o=>o.esp===e);
const roomList=()=>Object.values(db.rooms).map(r=>({id:r.id,n:r.n,e:r.e,by:r.by,c:new Set([...conns].filter(c=>c.esp===r.id).map(c=>c.u)).size}));
let rt;const castRooms=()=>{clearTimeout(rt);rt=setTimeout(()=>cast({t:"rooms",l:roomList()}),150)};
/* ---------- música da sala (toca-discos) ----------
   Uma música por sala (a última colocada vale). O servidor guarda o estado em memória
   para que quem entrar depois ouça no ponto certo. Se o DJ sai da sala ou desconecta, a música para.
   O arquivo do disco vai por PUT /api/media/<id> (mesma rota da mídia do chat). */
const MUS={};
const musOut=e=>{const s=MUS[e];if(!s)return null;return{t:"mus",op:"play",esp:e,u:s.u,id:s.id,url:s.url,n:s.n,lp:s.lp,pz:s.pz,pos:s.pz?s.pos:s.pos+(Date.now()-s.ts)/1000}};
const musDrop=(c,e)=>{const s=MUS[e];if(!s||s.u!==c.u)return;if([...conns].some(o=>o!==c&&o.u===c.u&&o.esp===e))return;delete MUS[e];cast({t:"mus",op:"stop",esp:e,u:c.u},o=>o!==c&&o.esp===e)};
function musHandle(c,m){const e=c.esp,s=MUS[e],P=v=>{v=+v;return isFinite(v)&&v>=0?Math.min(v,1e6):0};
if(m.op==="play"){const id=/^[a-z0-9]{6,40}$/.test(String(m.id||""))?String(m.id):"",url=/^https?:\/\/\S{4,500}$/i.test(String(m.url||""))?String(m.url):"";if(!id&&!url)return;
if(m.rj&&s&&s.u!==c.u)return;
const n=String(m.n||"Música").replace(/[<>]/g,"").slice(0,60);
MUS[e]={u:c.u,id,url,n,lp:m.lp?1:0,pz:m.pz?1:0,pos:P(m.pos),ts:Date.now()};
cast({t:"mus",op:"play",esp:e,u:c.u,id,url,n,lp:MUS[e].lp,pz:MUS[e].pz,pos:MUS[e].pos},o=>o!==c&&o.esp===e)}
else if(!s||s.u!==c.u)return;
else if(m.op==="pause"){s.pz=1;s.pos=P(m.pos);s.ts=Date.now();cast({t:"mus",op:"pause",esp:e,u:c.u,pos:s.pos},o=>o!==c&&o.esp===e)}
else if(m.op==="resume"){s.pz=0;s.pos=P(m.pos);s.ts=Date.now();cast({t:"mus",op:"resume",esp:e,u:c.u,pos:s.pos},o=>o!==c&&o.esp===e)}
else if(m.op==="loop"){s.lp=m.lp?1:0;cast({t:"mus",op:"loop",esp:e,u:c.u,lp:s.lp},o=>o!==c&&o.esp===e)}
else if(m.op==="stop"){delete MUS[e];cast({t:"mus",op:"stop",esp:e,u:c.u},o=>o!==c&&o.esp===e)}}
const INI={},iniCast=e=>cast({t:"ini",esp:e,s:INI[e]||null},x=>x.esp===e),iniEnd=e=>{const o=INI[e]?INI[e].o:[];delete INI[e];cast({t:"ini",esp:e,s:null,fin:o},x=>x.esp===e)};
/* fila de turnos: vez atual = 1º da ordem que ainda não passou; GM passa a vez de quem está nela; tempo limite (S.l seg) passa sozinho se a pessoa não mandar ação */
const iniCu=S=>S.o.find(u=>!S.d.includes(u)),
iniAfter=e=>{const S=INI[e],ro=db.rooms[e],P=[...new Set([...conns].filter(x=>x.esp===e&&x.u!==e&&!(ro&&ro.by===x.u)).map(x=>x.u))];S.t=Date.now();if(P.length&&P.every(u=>S.d.includes(u)))iniEnd(e);else iniCast(e)},
iniPass=e=>{const S=INI[e],u=S&&iniCu(S);if(!u)return;S.d.push(u);iniAfter(e)};
setInterval(()=>{for(const e in INI){const S=INI[e],u=S&&!S.pa&&S.l&&iniCu(S);if(!u)continue;const w=Date.now()-S.t;if(w>=S.l*1000)iniPass(e);else if(w>=42e4&&S.rm!==S.t){S.rm=S.t;for(const x of conns)if(x.u===u&&x.esp===e)wsSend(x,{t:"vez",esp:e})}}},1000);
const CDP=["ferido","assustado","cansado","confuso"],CDG=["congelado","queimando","envenenado","doente","lesionado","sangrando","atordoado","paralisado"];
function handle(c,raw){
let m;try{m=JSON.parse(raw)}catch(e){return}
if(!m||typeof m!=="object")return;
if(m.t==="join"){
if(c.live){c.live=false;liveCast(c.esp)}
musDrop(c,c.esp);
c.esp=okEsp(m.esp||"")?(m.esp||""):"";
wsSend(c,{t:"hist",esp:c.esp,msgs:hist(c.esp,c.u)});wsSend(c,{t:"live",esp:c.esp,l:liveList(c.esp)});wsSend(c,{t:"ini",esp:c.esp,s:INI[c.esp]||null});wsSend(c,{t:"sum",esp:c.esp,s:(db.sum||{})[c.esp]||null});wsSend(c,{t:"bg",esp:c.esp,s:(db.bg||{})[c.esp]||null});wsSend(c,{t:"sit",esp:c.esp,all:(db.sit||{})[c.esp]||{}});wsSend(c,{t:"conds",esp:c.esp,m:(db.cd||{})[c.esp]||{}});{const q=musOut(c.esp);if(q)wsSend(c,q)}
const d={};for(const o of conns)if(o!==c&&o.pos)d[o.u]=o.pos;
wsSend(c,{t:"peers",inv:db.inv,l:online(),d,adm:true});
wsSend(c,{t:"rooms",l:roomList()});castRooms()}
else if(m.t==="room"){
if(m.op==="new"){
const n=String(m.n||"").replace(/[<>&"'`]/g,"").replace(/\s+/g," ").trim().slice(0,24);
const e=[...String(m.e||"").replace(/[<>&"'`\s]/g,"")].slice(0,2).join("")||"💬";
if(n.length<3)return wsSend(c,{t:"roomerr",err:"Nome da sala com pelo menos 3 letras."});
if(Object.keys(db.rooms).length>=MAXR)return wsSend(c,{t:"roomerr",err:"Limite de salas atingido."});
if(Object.values(db.rooms).some(r=>r.n.toLowerCase()===n.toLowerCase()))return wsSend(c,{t:"roomerr",err:"Já existe uma sala com esse nome."});
const id="#"+Math.random().toString(16).slice(2,8);
db.rooms[id]={id,n,e,by:c.u,at:Date.now()};persist();
cast({t:"rooms",l:roomList()});wsSend(c,{t:"roomnew",id})}
else if(m.op==="del"){
const r=isRoom(m.id)&&db.rooms[m.id];
if(!r)return wsSend(c,{t:"roomerr",err:"Sala não encontrada."});
delete db.rooms[r.id];delete db.chats[r.id];delete MUS[r.id];if(db.sum)delete db.sum[r.id];if(db.cd)delete db.cd[r.id];if(db.bg)delete db.bg[r.id];if(db.sit)delete db.sit[r.id];persist();
for(const o of conns)if(o.esp===r.id){o.esp="";wsSend(o,{t:"kick",esp:r.id})}
cast({t:"rooms",l:roomList()})}}
else if(m.t==="prof"){
const p=clean(c.u,m.d,db.users[c.u]);if(!p)return;
db.users[c.u]=p;persist();cast({t:"prof",u:c.u,d:pubOne(p)},o=>o!==c)}
else if(m.t==="pos"){
const x=+m.x,y=+m.y;if(!isFinite(x)||!isFinite(y))return;
c.pos={u:c.u,x,y,reg:String(m.reg||"").slice(0,20),scn:String(m.scn||"").slice(0,30),esp:String(m.esp||"").slice(0,24)};
cast({t:"pos",d:c.pos},o=>o!==c)}
else if(m.t==="ini"){const e=c.esp,ro=db.rooms[e],ow=u=>u===e||!!(ro&&ro.by===u),gm=ow(c.u),S=INI[e];
if(m.op==="start"){if(!gm)return;INI[e]={sid:Date.now().toString(36),o:[],d:[],l:900,t:Date.now()};iniCast(e)}
else if(!S)return;
else if(m.op==="end"){if(gm)iniEnd(e)}
else if(m.op==="lim"){if(gm){S.l=Math.min(3600,Math.max(0,m.v|0));S.t=Date.now();iniCast(e)}}
else if(m.op==="pass"){if(gm)iniPass(e)}
else if(m.op==="pause"){if(gm){S.pa=S.pa?0:1;S.t=Date.now();iniCast(e)}}
else if(gm||S.pa)return;
else if(m.op==="join"){if(S.o.includes(c.u))return;S.o.push(c.u);if(iniCu(S)===c.u)S.t=Date.now();iniCast(e)}
else if(m.op==="done"){if(!S.o.includes(c.u)||S.d.includes(c.u))return;S.d.push(c.u);iniAfter(e)}}
else if(m.t==="chat"){
const g=m.m;if(!g||typeof g!=="object"||typeof g.k!=="string"||JSON.stringify(g).length>20000)return;
if(g.u!=="sys"&&g.u!=="npc")g.u=c.u;
if(g.np){const ro0=db.rooms[c.esp];if(c.esp&&(c.u===c.esp||(ro0&&ro0.by===c.u))){g.np=1;g.w=String(g.w||"NPC").replace(/[<>&"'`]/g,"").slice(0,20);g.b=cleanB(g.b)}else delete g.np}
{const S=INI[c.esp];if(S&&g.k!=="ooc"&&g.u===c.u&&iniCu(S)===c.u)S.t=Date.now()}
if(g.sc!==undefined){g.sc=String(g.sc);if(!has(db.users,g.sc)||g.k==="moeda"||g.k==="bau")return}
if(g.k==="moeda"){const ro=db.rooms[c.esp];if(!(c.u===c.esp||(ro&&ro.by===c.u)))return;g.cid=/^[a-z0-9]{4,10}$/.test(String(g.cid))?String(g.cid):Math.random().toString(36).slice(2,8);g.v=Math.min(1000000,Math.max(1,Math.floor(+g.v||0)));g.n=String(g.n||"Moedas").replace(/[<>&"'`]/g,"").slice(0,30)||"Moedas";g.w=String(g.w||c.u).replace(/[<>&"'`]/g,"").slice(0,20);const tq=Array.isArray(g.to)?g.to:[];g.to=tq.filter(v=>typeof v==="string"&&has(db.users,v)).slice(0,8);if(tq.length&&!g.to.length)return;delete g.x;delete g.at}
if(g.k==="bau"){const ro=db.rooms[c.esp];if(!(c.u===c.esp||(ro&&ro.by===c.u)))return;const it=cleanIt(g.its);if(!it||!it.length)return;g.its=it.slice(0,8);g.bid=/^[a-z0-9]{4,10}$/.test(String(g.bid))?String(g.bid):Math.random().toString(36).slice(2,8);g.n=String(g.n||"Baú").replace(/[<>&"'`]/g,"").slice(0,20)||"Baú";g.w=String(g.w||c.u).replace(/[<>&"'`]/g,"").slice(0,20);g.max=Math.min(g.its.length,Math.max(1,g.max|0));const to0=Array.isArray(g.to)?g.to:[];g.to=to0.filter(v=>typeof v==="string"&&has(db.users,v)).slice(0,8);if(to0.length&&!g.to.length)return;delete g.x;delete g.at}
if(g.vr){const v=g.vr,N=(x,l,h)=>{x=+x;return isFinite(x)?Math.min(h,Math.max(l,x)):0},A=a=>Array.isArray(a)?[Math.round(N(a[0],-15,170)),Math.round(N(a[1],-150,150))]:[8,10],I=x=>Math.round(N(x,0,6)),R=x=>+N(x,-2,2).toFixed(2),bd=Array.isArray(v.bd)?v.bd:[];g.vr=v&&typeof v==="object"?{a:[A((v.a||[])[0]),A((v.a||[])[1])],ey:I(v.ey),br:I(v.br),mo:I(v.mo),gx:+N(v.gx,-1,1).toFixed(2),gy:+N(v.gy,-1,1).toFixed(2),bd:[R(bd[0]),R(bd[1]),R(bd[2])]}:undefined;if(!g.vr)delete g.vr}
g.i=String(g.i||Date.now()+"."+(Math.random()*1e4|0));
const L=db.chats[c.esp]=db.chats[c.esp]||[];
if(L.some(o=>o.i===g.i))return;
L.push(g);if(L.length>MAXH)L.splice(0,L.length-MAXH);persist();
cast({t:"chat",esp:c.esp,m:g},o=>o!==c&&o.esp===c.esp&&(!g.sc||o.u===g.sc))}
else if(m.t==="live"){
if(m.op==="on"){c.live=true;liveCast(c.esp)}
else if(m.op==="off"){if(c.live){c.live=false;liveCast(c.esp)}}
else if(m.op==="sig"){const d=m.d;if(!c.live||!d||typeof d!=="object"||JSON.stringify(d).length>20000)return;const to=String(m.to||"");for(const o of conns)if(o!==c&&o.u===to&&o.live&&o.esp===c.esp)wsSend(o,{t:"sig",from:c.u,d})}}
else if(m.t==="mus")musHandle(c,m)
else if(m.t==="sum"){const e=c.esp;if(!c.u)return;db.sum=db.sum||{};const x=String(m.v||"").slice(0,2000);if(x.trim())db.sum[e]={x,u:c.u,at:Date.now()};else delete db.sum[e];persist();cast({t:"sum",esp:e,s:db.sum[e]||null},o=>o.esp===e)}
else if(m.t==="cond"){const e=c.esp,ro=db.rooms[e],gm=c.u===e||!!(ro&&ro.by===c.u),u=String(m.u||""),id=String(m.id||""),P=CDP.includes(id),G=CDG.includes(id);
if(!P&&!G)return;if(G&&!gm)return;if(P&&!gm&&u!==c.u)return;if(!has(db.users,u)||!(u===c.u||[...conns].some(x=>x.u===u&&x.esp===e)))return;
db.cd=db.cd||{};const R=db.cd[e]=db.cd[e]||{},L=(R[u]||[]).filter(v=>v!==id);if(m.on)L.push(id);if(L.length)R[u]=L.slice(0,12);else delete R[u];persist();cast({t:"cond",esp:e,u,l:R[u]||[]},o=>o.esp===e)}
else if(m.t==="xc"){const e=c.esp;if(!e)return;const ro=db.rooms[e],g0=ro?ro.by:e,gu=has(db.users,g0)?g0:"",n=Date.now();if(n-(c.xt||0)<20000)return wsSend(c,{t:"xcr"});c.xt=n;const pub=!!m.pub||!gu||c.u===gu,cn=(db.users[c.u]||{}).cn||c.u,g={k:"narr",u:"sys",i:"x"+n.toString(36)+Math.random().toString(36).slice(2,5),x:(m.pub&&m.pub!==2)?"🛑 "+cn+" pediu para mudar de assunto.":"🛑 Alguém pediu para mudar de assunto.",xc:1};if(!pub)g.sc=gu;const L=db.chats[e]=db.chats[e]||[];L.push(g);if(L.length>MAXH)L.splice(0,L.length-MAXH);persist();cast({t:"chat",esp:e,m:g},o=>o.esp===e&&(!g.sc||o.u===g.sc))}
else if(m.t==="bg"){const e=c.esp,ro=db.rooms[e],gm=!!e&&(c.u===e||!!(ro&&ro.by===c.u));if(!gm)return;db.bg=db.bg||{};const s=typeof m.s==="string"&&m.s.length<700000&&/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(m.s)?m.s:null;if(s)db.bg[e]=s;else delete db.bg[e];persist();cast({t:"bg",esp:e,s},o=>o.esp===e)}
else if(m.t==="mop"){const L=db.chats[c.esp]||[],g=L.find(o=>o.i===String(m.i||""));if(!g||g.dl||(g.sc&&g.u!==c.u&&g.sc!==c.u))return;const ro=db.rooms[c.esp],gm=c.u===c.esp||!!(ro&&ro.by===c.u),mine=g.u===c.u,ev=o=>o.esp===c.esp&&(!g.sc||o.u===g.u||o.u===g.sc);
if(m.op==="del"){if(!mine&&!gm)return;for(const k of["x","md","vr","q","dr","its","at","r","o"])delete g[k];g.dl=1;persist();cast({t:"mop",esp:c.esp,op:"del",i:g.i},ev)}
else if(m.op==="edit"){const x=String(m.x||"").slice(0,4000);if(!mine||!x.trim()||typeof g.x!=="string"||!["fala","acao","ooc"].includes(g.k))return;g.o=g.x.slice(0,4000);g.x=x;g.ed=1;persist();cast({t:"mop",esp:c.esp,op:"edit",i:g.i,x,o:g.o},ev)}
else if(m.op==="react"){const e=String(m.e||"");if(e.length>24||!/^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*|[\u{1F1E6}-\u{1F1FF}]{2})$/u.test(e))return;const r=g.r=g.r||{};if(!r[e]&&Object.keys(r).length>=12)return;const a=r[e]=r[e]||[],k=a.indexOf(c.u);if(k<0)a.push(c.u);else a.splice(k,1);if(!a.length)delete r[e];if(!Object.keys(r).length)delete g.r;persist();cast({t:"mop",esp:c.esp,op:"react",i:g.i,r:g.r||{}},ev)}}
else if(m.t==="sit"){const e=c.esp,ro=db.rooms[e],gm=!!e&&(c.u===e||!!(ro&&ro.by===c.u)),k=String(m.k||"").slice(0,30);if(!e||!k)return;
const R=(db.sit=db.sit||{})[e]||{},L=R[k]||[],out=()=>{if(L.length)R[k]=L;else delete R[k];if(Object.keys(R).length)db.sit[e]=R;else delete db.sit[e];persist();cast({t:"sit",esp:e,k,l:L},o=>o.esp===e)};
if(m.op==="add"){if(!gm||L.length>=40)return;const x=+m.x,y=+m.y,it=cleanIt([m.it]);if(!isFinite(x)||!isFinite(y)||!it||!it.length)return;let id;do{id=Math.random().toString(36).slice(2,8)}while(id.length<4||L.some(v=>v.id===id));L.push({id,x:+x.toFixed(2),y:+y.toFixed(2),it:it[0]});out()}
else if(m.op==="del"){if(!gm)return;const i=L.findIndex(v=>v.id===m.id);if(i<0)return;L.splice(i,1);out()}
else if(m.op==="take"){const i=L.findIndex(v=>v.id===m.id);if(i<0)return wsSend(c,{t:"sitgone",esp:e});const v=L[i],q=c.pos,RS=(handle.rs=handle.rs||{}),rk=e+"|"+k+"|"+v.id,rs=RS[rk];if(q&&(q.scn||q.reg)===k&&Math.hypot(q.x-v.x,q.y-v.y)>3)return;if(rs&&Date.now()-rs.at<15000){if(rs.u!==c.u)wsSend(c,{t:"sitgone",esp:e});return}RS[rk]={u:c.u,at:Date.now()};wsSend(c,{t:"sitgot",esp:e,k,id:v.id,it:v.it})}else if(m.op==="ack"){const RS=(handle.rs=handle.rs||{}),id=String(m.id||""),rk=e+"|"+k+"|"+id,rs=RS[rk];if(!rs||rs.u!==c.u)return;delete RS[rk];const i=L.findIndex(v=>v.id===id);if(i>=0){L.splice(i,1);out()}}else if(m.op==="rel"){const RS=(handle.rs=handle.rs||{}),rk=e+"|"+k+"|"+String(m.id||"");if(RS[rk]&&RS[rk].u===c.u)delete RS[rk]}}
else if(m.t==="typ"){
cast({t:"typ",esp:c.esp,u:c.u,off:m.off?1:0},o=>o!==c&&o.esp===c.esp)}
else if(m.t==="inv"){
if(!Array.isArray(m.d)||m.d.length>200)return;
db.inv=m.d.filter(v=>v&&typeof v.f==="string"&&typeof v.t==="string"&&v.f.length<25&&v.t.length<25).map(v=>({f:v.f,t:v.t}));persist();
cast({t:"inv",d:db.inv})}}

/* ---------- WebSocket mínimo (RFC 6455), sem biblioteca ---------- */
const GUID="258EAFA5-E914-47DA-95CA-C5AB0DC85B11",MAXF=4*1024*1024;
const frame=(op,buf)=>{const n=buf.length;let h;if(n<126)h=Buffer.from([0x80|op,n]);else if(n<65536){h=Buffer.alloc(4);h[0]=0x80|op;h[1]=126;h.writeUInt16BE(n,2)}else{h=Buffer.alloc(10);h[0]=0x80|op;h[1]=127;h.writeUInt32BE(0,2);h.writeUInt32BE(n,6)}return Buffer.concat([h,buf])};
function closeWs(c,code){if(c.readyState>=2)return;c.readyState=2;try{const b=Buffer.alloc(2);b.writeUInt16BE(code||1000,0);c.sock.write(frame(8,b))}catch(e){}setTimeout(()=>{try{c.sock.destroy()}catch(e){}},300)}
function gone(c){if(c.readyState===3)return;c.readyState=3;if(!conns.delete(c))return;musDrop(c,c.esp);if(c.live){c.live=false;liveCast(c.esp)}cast({t:"online",l:online()});castRooms()}
function upgrade(req,sock){
const url=new URL(req.url,"http://x");if(url.pathname!=="/ws"||!req.headers["sec-websocket-key"])return sock.destroy();
sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: "+crypto.createHash("sha1").update(req.headers["sec-websocket-key"]+GUID).digest("base64")+"\r\n\r\n");
const c={readyState:1,u:null,esp:"",pos:null,live:false,sock,buf:Buffer.alloc(0),parts:[],alive:true};
c.send=t=>{if(c.readyState===1)try{sock.write(frame(1,Buffer.from(t)))}catch(e){}};
const u=userOf(url.searchParams.get("token"));
if(!u||!has(db.users,u)){closeWs(c,4001);return}
c.u=u;conns.add(c);cast({t:"online",l:online()});
sock.on("data",d=>{c.buf=Buffer.concat([c.buf,d]);
for(;;){const b=c.buf;if(b.length<2)return;const fin=b[0]&128,op=b[0]&15,mk=b[1]&128;let n=b[1]&127,o=2;
if(n===126){if(b.length<4)return;n=b.readUInt16BE(2);o=4}else if(n===127){if(b.length<10)return;if(b.readUInt32BE(2)){closeWs(c,1009);return}n=b.readUInt32BE(6);o=10}
if(n>MAXF){closeWs(c,1009);return}if(!mk){closeWs(c,1002);return}
if(b.length<o+4+n)return;const key=b.subarray(o,o+4),p=Buffer.from(b.subarray(o+4,o+4+n));for(let i=0;i<n;i++)p[i]^=key[i&3];c.buf=b.subarray(o+4+n);
if(op===8){closeWs(c,1000);return}
if(op===9){try{sock.write(frame(10,p))}catch(e){}continue}
if(op===10){c.alive=true;continue}
if(op===1||op===0){c.parts.push(p);if(fin){const s=Buffer.concat(c.parts).toString("utf8");c.parts=[];if(c.readyState===1)try{handle(c,s)}catch(e){console.error("handle:",e.message)}}}}});
sock.on("close",()=>gone(c));sock.on("error",()=>gone(c));
}
setInterval(()=>{for(const c of conns){if(!c.alive){try{c.sock.destroy()}catch(e){}gone(c);continue}c.alive=false;try{c.sock.write(frame(9,Buffer.alloc(0)))}catch(e){}}},30000);
/* ---------- HTTP: API + mídia + index.html ---------- */
const J=(res,o,c)=>{const s=JSON.stringify(o);res.writeHead(c||200,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(s)};
const bearer=req=>String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
const body=(req,lim)=>new Promise((ok,no)=>{let n=0;const a=[];req.on("data",d=>{n+=d.length;if(n>lim){no(new Error("grande"));req.destroy()}else a.push(d)});req.on("end",()=>{try{ok(a.length?JSON.parse(Buffer.concat(a).toString("utf8")):{})}catch(e){no(new Error("json"))}});req.on("error",no)});
const MIMEOK=/^(image|audio|video)\/[\w.+-]{1,40}$|^application\/octet-stream$/i,MID=/^[a-z0-9]{6,40}$/;
async function api(req,res,url){
const m=req.method,p=url.pathname;
/* mídia (até 50 MB): PUT /api/media/<id> e GET /api/media/<id> */
const mm=p.match(/^\/api\/media\/([a-z0-9]{6,40})$/);
if(mm){const u=userOf(bearer(req));if(!u)return J(res,{err:"Sessão inválida."},401);const id=mm[1],f=path.join(MEDIA,id),mf=f+".json";
if(m==="PUT"){const ty=String(req.headers["content-type"]||"application/octet-stream").split(";")[0].trim(),len=+req.headers["content-length"]||0;
if(!MIMEOK.test(ty))return J(res,{err:"Só imagem, áudio ou vídeo."},415);const LIM=/^audio\//i.test(ty)?MAXA:MAXM;if(len>LIM)return J(res,{err:"Arquivo acima de "+(LIM/1048576|0)+" MB."},413);if(fs.existsSync(f))return J(res,{err:"Já existe."},409);
const tmp=f+".part";let n=0,dead=false;const ws=fs.createWriteStream(tmp);
req.on("data",d=>{n+=d.length;if(n>LIM&&!dead){dead=true;ws.destroy();fs.unlink(tmp,()=>{});J(res,{err:"Arquivo acima de "+(LIM/1048576|0)+" MB."},413);req.destroy()}});
req.pipe(ws);ws.on("finish",()=>{if(dead)return;try{fs.renameSync(tmp,f);fs.writeFileSync(mf,JSON.stringify({u,t:ty,z:n,at:Date.now()}));J(res,{ok:true,id,z:n})}catch(e){J(res,{err:"Falha ao gravar."},500)}});
ws.on("error",()=>{if(!dead){dead=true;fs.unlink(tmp,()=>{});J(res,{err:"Falha ao gravar."},500)}});req.on("aborted",()=>{if(!dead){dead=true;ws.destroy();fs.unlink(tmp,()=>{})}});return}
if(m==="GET"||m==="HEAD"){let meta;try{meta=JSON.parse(fs.readFileSync(mf,"utf8"))}catch(e){return J(res,{err:"Não encontrado."},404)}
res.writeHead(200,{"Content-Type":meta.t,"Content-Length":meta.z,"X-Content-Type-Options":"nosniff","Cache-Control":"private, max-age=86400"});if(m==="HEAD")return res.end();return fs.createReadStream(f).pipe(res)}
return J(res,{err:"Método não permitido."},405)}
let b={};if(m==="POST"){try{b=await body(req,p==="/api/chat/import"?20*1024*1024:3*1024*1024)}catch(e){return J(res,{err:"Requisição inválida."},400)}}
if(m==="POST"&&(p==="/api/register"||p==="/api/login")){const u=b.u,pw=b.p,cn=b.cn;
if(p==="/api/login"){if(typeof u!=="string"||!has(db.users,u)||!okPw(String(pw||""),db.pass[u]))return J(res,{err:"Usuário ou senha incorretos."},401);return J(res,{token:newToken(u),users:pubU(u),u})}
if(!/^[a-z0-9_]{3,20}$/.test(u||""))return J(res,{err:"Usuário: 3 a 20 letras minúsculas, números ou _."},400);
if(typeof pw!=="string"||pw.length<4||pw.length>40)return J(res,{err:"Senha com pelo menos 4 caracteres."},400);
if(!String(cn||"").trim())return J(res,{err:"Dê um nome ao seu boneco."},400);
if(has(db.users,u))return J(res,{err:"Esse usuário já existe."},409);
db.pass[u]=hashPw(pw);db.users[u]=clean(u,{cn,b:b.b,photo:b.photo,reg:"campo"});persist();return J(res,{token:newToken(u),users:pubU(u),u})}
const u=userOf(bearer(req));
if(m==="GET"&&p==="/api/session")return u?J(res,{u,users:pubU(u)}):J(res,{err:"Sessão inválida."},401);
if(p==="/api/chat"&&m==="GET"){if(!u)return J(res,{err:"Sessão inválida."},401);const esp=url.searchParams.get("esp")||"";return okEsp(esp)?J(res,{esp,msgs:copy((db.chats[esp]||[]).filter(g=>!g.sc||g.u===u||g.sc===u))}):J(res,{err:"Mesa não encontrada."},404)}
if(p==="/api/chat/import"&&m==="POST"){if(!u)return J(res,{err:"Sessão inválida."},401);const esp=b.esp||"",msgs=b.msgs;if(!okEsp(esp)||!Array.isArray(msgs))return J(res,{err:"Dados inválidos."},400);
const have=new Set((db.chats[esp]||[]).map(x=>x.i)),add=[];for(const g of msgs.slice(0,MAXH)){if(!g||typeof g!=="object"||typeof g.k!=="string"||!g.i||have.has(g.i)||JSON.stringify(g).length>20000)continue;if(g.k==="moeda"){if(!/^[a-z0-9]{4,10}$/.test(String(g.cid)))continue;g.v=Math.min(1000000,Math.max(1,Math.floor(+g.v||0)));g.n=String(g.n||"Moedas").replace(/[<>&"'`]/g,"").slice(0,30)||"Moedas";g.w=String(g.w||"").replace(/[<>&"'`]/g,"").slice(0,20);g.to=(Array.isArray(g.to)?g.to:[]).filter(v=>typeof v==="string").slice(0,8).map(v=>v.slice(0,20));delete g.x;delete g.at}else if(g.k==="bau"){const it=cleanIt(g.its);if(!it||!it.length||!/^[a-z0-9]{4,10}$/.test(String(g.bid)))continue;g.its=it.slice(0,8);g.n=String(g.n||"Baú").replace(/[<>&"'`]/g,"").slice(0,20)||"Baú";g.w=String(g.w||"").replace(/[<>&"'`]/g,"").slice(0,20);g.max=Math.min(g.its.length,Math.max(1,g.max|0));g.to=(Array.isArray(g.to)?g.to:[]).filter(v=>typeof v==="string").slice(0,8).map(v=>v.slice(0,20));delete g.x;delete g.at}have.add(g.i);add.push(g)}
db.chats[esp]=[...(db.chats[esp]||[]),...add].sort((a,c)=>idKey(a)-idKey(c)).slice(-MAXH);persist();for(const c of conns)if(c.esp===esp)wsSend(c,{t:"hist",esp,msgs:hist(esp,c.u)});return J(res,{ok:true,added:add.length,skipped:msgs.length-add.length})}
return J(res,{err:"Não encontrado."},404)}
let PAGE=null;
const server=http.createServer(async(req,res)=>{
try{const url=new URL(req.url,"http://x");
if(url.pathname.startsWith("/api/"))return await api(req,res,url);
if((url.pathname==="/"||url.pathname==="/index.html")&&(req.method==="GET"||req.method==="HEAD")){const hf=path.join(__dirname,"index.html"),mt=fs.statSync(hf).mtimeMs;
/* a página é comprimida uma vez (gzip e brotli) e guardada em memória: o navegador baixa ~1/4 do tamanho, sem mudar nada no jogo */
if(!PAGE||PAGE.m!==mt){const raw=fs.readFileSync(hf);PAGE={m:mt,raw,gz:zlib.gzipSync(raw,{level:9}),br:zlib.brotliCompressSync(raw)}}
const ae=String(req.headers["accept-encoding"]||""),br=/\bbr\b/.test(ae),gz=/\bgzip\b/.test(ae),h=br?PAGE.br:gz?PAGE.gz:PAGE.raw,hd={"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache","Vary":"Accept-Encoding","Content-Length":h.length};if(br)hd["Content-Encoding"]="br";else if(gz)hd["Content-Encoding"]="gzip";
res.writeHead(200,hd);return res.end(req.method==="HEAD"?undefined:h)}
res.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"});res.end("Não encontrado.")}
catch(e){console.error(e);if(!res.headersSent)J(res,{err:"Erro no servidor."},500);else res.end()}});
server.on("upgrade",upgrade);
const bye=()=>{flush();process.exit(0)};process.on("SIGINT",bye);process.on("SIGTERM",bye);
server.listen(PORT,()=>console.log("Valley no ar: http://localhost:"+PORT+"  (dados em "+DIR+")"));
