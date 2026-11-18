#!/usr/bin/env node
/* ============================================================
   VALLEY — SERVIDOR (server.js)
   Sem dependências: só Node 18+.  Rodar:  node server.js
   Abra  http://localhost:3000  (o index.html é servido daqui).
   Tudo fica em ./data  (db.json = contas e conversas · media/ = arquivos do chat)
   Inclui: contas, mesa/salas, chat em tempo real, MÍDIA (até 50 MB) e LIVE DE VOZ.
   O index.html é só o jogo; este arquivo é só o servidor. Ficam separados, na mesma pasta.
   ============================================================ */
const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto");
const PORT=+process.env.PORT||3000,DIR=process.env.VALLEY_DATA||path.join(__dirname,"data"),MEDIA=path.join(DIR,"media"),DBF=path.join(DIR,"db.json");
const MAXM=50*1024*1024,MAXH=5000,MAXR=60,PERU=3,has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
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
let hl=[15,11,16,12];try{if(typeof HL!=="undefined"&&HL&&HL.length>=4)hl=hl.map((m,i)=>Math.max(m,HL[i].length-1))}catch(e){}
const PL=[[0,0,0,0],[0,0,1,0],[0,0,2,0],[2,0,1,0],[0,0,3,0],[4,0,1,0],[0,0,4,0],[6,0,1,0]],
LH=b.hb===undefined&&b.h?(PL[b.h|0]||PL[0]):[b.hb,b.hs,b.ht,b.hf].map((v,i)=>Math.min(hl[i],Math.max(0,v|0)));
const o={c:C(b.c,fb.c||"#2f7fc1"),a:String(b.a||"").replace(/[<>&"']/g,"").slice(0,8),e:0,m:Math.min(5,Math.max(0,b.m|0)),hb:LH[0],hs:LH[1],ht:LH[2],hf:LH[3],hc:C(b.hc,"#2b1b12"),br:b.br===undefined?1:Math.min(13,Math.max(0,b.br|0)),rp:Math.min(10,Math.max(0,b.rp|0)),rc:C(b.rc,"#ffffff"),ee:Math.min(6,Math.max(0,b.ee|0)),ec:C(b.ec,"#0f2a40"),mt:Math.min(5,Math.max(0,b.mt|0)),me:Math.min(6,Math.max(0,b.me|0))};
/* campos novos do Lab: só entram se o personagem os tiver (personagens antigos continuam idênticos) */
const has=k=>b[k]!==undefined&&b[k]!==null,
ints={et:7,bw:4,bl:3,hv:7,ha:5,hl:4,hvo:4,hw:3,he:7,sl:5,gl:3,ab:40,pe:23},
flts={ex:[-8,8,0],ey:[-8,8,0],es:[.5,1.8,1],mx:[-8,8,0],my:[-8,8,0],ms:[.5,1.8,1],lx:[-8,8,0],ly:[-8,8,0],rx:[-8,8,0],ry:[-8,8,0]},
cols={ac:"#e8506a",sc:"#ffffff",gc:"#ffffff"};
for(const k in ints)if(has(k))o[k]=I(b[k],ints[k],0);
for(const k in flts)if(has(k)){const[lo,hi,d]=flts[k];o[k]=F(b[k],lo,hi,d)}
for(const k in cols)if(has(k))o[k]=C(b[k],cols[k]);
if(has("fl"))o.fl=b.fl?1:0;
if(b.w&&typeof b.w==="object"){const w={};["cape","skirt","scarf","wing","tail","orn","gear"].forEach(k=>{const s=b.w[k];if(!s||typeof s!=="object")return;const q={i:I(s.i,9,0),c:C(s.c,"#d45a5a"),sx:F(s.sx,.5,1.8,1),sy:F(s.sy,.5,1.8,1)};["rig","damp","amp","wind"].forEach(f=>{if(s[f]!==undefined)q[f]=F(s[f],0,2.5,1)});w[k]=q});if(Object.keys(w).length)o.w=w}
if(typeof cuClean==="function"){const cu=cuClean(b.cu);if(cu){o.cu=cu;o.hb=o.hs=o.ht=o.hf=0}}
return o}
const HEX=/^#[0-9a-f]{3,8}$/i,PNG=/^data:image\/png;base64,[A-Za-z0-9+\/=]+$/,IMG=/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/,ID=/^[\w-]{1,8}$/;
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
if(Array.isArray(o.fichas)){o.fichas=o.fichas.slice(0,8).map(x=>{if(!x||typeof x!=="object"||Array.isArray(x))return null;const y=clean(u,{...x,fichas:undefined,ac:undefined},{cn:u});if(!y)return null;delete y.u;delete y.fichas;delete y.ac;return y}).filter(Boolean);if(o.fichas.length)o.ac=Math.min(o.fichas.length-1,Math.max(0,o.ac|0));else{delete o.fichas;delete o.ac}}else{delete o.fichas;delete o.ac}
return o}
const pubU=me=>{const r={};for(const k in db.users){const x={...db.users[k]};if(k!==me){delete x.fichas;delete x.ac}r[k]=x}return r},pubOne=p=>{const x={...p};delete x.fichas;delete x.ac;return x};
const isRoom=e=>typeof e==="string"&&has(db.rooms,e);
const okEsp=e=>e===""||(typeof e==="string"&&(has(db.users,e)||isRoom(e)));
const hist=esp=>(db.chats[esp]||[]).slice(-60);
const idKey=m=>parseFloat(String(m.i||"").replace(/^\D+/,""))||0;

/* ---------- tempo real: conexões, salas, chat, LIVE de voz ---------- */
const conns=new Set();
function wsSend(c,o){if(c.readyState===1)c.send(JSON.stringify(o))}
const online=()=>[...new Set([...conns].map(c=>c.u))];
const cast=(o,f)=>{for(const c of conns)if(!f||f(c))wsSend(c,o)};
const liveList=e=>[...new Set([...conns].filter(o=>o.live&&o.esp===e).map(o=>o.u))],liveCast=e=>cast({t:"live",esp:e,l:liveList(e)},o=>o.esp===e);
const roomList=()=>Object.values(db.rooms).map(r=>({id:r.id,n:r.n,e:r.e,by:r.by,c:new Set([...conns].filter(c=>c.esp===r.id).map(c=>c.u)).size}));
let rt;const castRooms=()=>{clearTimeout(rt);rt=setTimeout(()=>cast({t:"rooms",l:roomList()}),150)};
function handle(c,raw){
let m;try{m=JSON.parse(raw)}catch(e){return}
if(!m||typeof m!=="object")return;
if(m.t==="join"){
if(c.live){c.live=false;liveCast(c.esp)}
c.esp=okEsp(m.esp||"")?(m.esp||""):"";
wsSend(c,{t:"hist",esp:c.esp,msgs:hist(c.esp)});wsSend(c,{t:"live",esp:c.esp,l:liveList(c.esp)});
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
delete db.rooms[r.id];delete db.chats[r.id];persist();
for(const o of conns)if(o.esp===r.id){o.esp="";wsSend(o,{t:"kick",esp:r.id})}
cast({t:"rooms",l:roomList()})}}
else if(m.t==="prof"){
const p=clean(c.u,m.d,db.users[c.u]);if(!p)return;
db.users[c.u]=p;persist();cast({t:"prof",u:c.u,d:pubOne(p)},o=>o!==c)}
else if(m.t==="pos"){
const x=+m.x,y=+m.y;if(!isFinite(x)||!isFinite(y))return;
c.pos={u:c.u,x,y,reg:String(m.reg||"").slice(0,20),scn:String(m.scn||"").slice(0,30),esp:String(m.esp||"").slice(0,24)};
cast({t:"pos",d:c.pos},o=>o!==c)}
else if(m.t==="chat"){
const g=m.m;if(!g||typeof g!=="object"||typeof g.k!=="string"||JSON.stringify(g).length>20000)return;
if(g.u!=="sys"&&g.u!=="npc")g.u=c.u;
g.i=String(g.i||Date.now()+"."+(Math.random()*1e4|0));
const L=db.chats[c.esp]=db.chats[c.esp]||[];
if(L.some(o=>o.i===g.i))return;
L.push(g);if(L.length>MAXH)L.splice(0,L.length-MAXH);persist();
cast({t:"chat",esp:c.esp,m:g},o=>o!==c&&o.esp===c.esp)}
else if(m.t==="live"){
if(m.op==="on"){c.live=true;liveCast(c.esp)}
else if(m.op==="off"){if(c.live){c.live=false;liveCast(c.esp)}}
else if(m.op==="sig"){const d=m.d;if(!c.live||!d||typeof d!=="object"||JSON.stringify(d).length>20000)return;const to=String(m.to||"");for(const o of conns)if(o!==c&&o.u===to&&o.live&&o.esp===c.esp)wsSend(o,{t:"sig",from:c.u,d})}}
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
function gone(c){if(c.readyState===3)return;c.readyState=3;if(!conns.delete(c))return;if(c.live){c.live=false;liveCast(c.esp)}cast({t:"online",l:online()});castRooms()}
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
if(!MIMEOK.test(ty))return J(res,{err:"Só imagem, áudio ou vídeo."},415);if(len>MAXM)return J(res,{err:"Arquivo acima de 50 MB."},413);if(fs.existsSync(f))return J(res,{err:"Já existe."},409);
const tmp=f+".part";let n=0,dead=false;const ws=fs.createWriteStream(tmp);
req.on("data",d=>{n+=d.length;if(n>MAXM&&!dead){dead=true;ws.destroy();fs.unlink(tmp,()=>{});J(res,{err:"Arquivo acima de 50 MB."},413);req.destroy()}});
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
if(p==="/api/chat"&&m==="GET"){if(!u)return J(res,{err:"Sessão inválida."},401);const esp=url.searchParams.get("esp")||"";return okEsp(esp)?J(res,{esp,msgs:copy(db.chats[esp]||[])}):J(res,{err:"Mesa não encontrada."},404)}
if(p==="/api/chat/import"&&m==="POST"){if(!u)return J(res,{err:"Sessão inválida."},401);const esp=b.esp||"",msgs=b.msgs;if(!okEsp(esp)||!Array.isArray(msgs))return J(res,{err:"Dados inválidos."},400);
const have=new Set((db.chats[esp]||[]).map(x=>x.i)),add=[];for(const g of msgs.slice(0,MAXH)){if(!g||typeof g!=="object"||typeof g.k!=="string"||!g.i||have.has(g.i)||JSON.stringify(g).length>20000)continue;have.add(g.i);add.push(g)}
db.chats[esp]=[...(db.chats[esp]||[]),...add].sort((a,c)=>idKey(a)-idKey(c)).slice(-MAXH);persist();for(const c of conns)if(c.esp===esp)wsSend(c,{t:"hist",esp,msgs:hist(esp)});return J(res,{ok:true,added:add.length,skipped:msgs.length-add.length})}
return J(res,{err:"Não encontrado."},404)}
const server=http.createServer(async(req,res)=>{
try{const url=new URL(req.url,"http://x");
if(url.pathname.startsWith("/api/"))return await api(req,res,url);
if((url.pathname==="/"||url.pathname==="/index.html")&&(req.method==="GET"||req.method==="HEAD")){const h=fs.readFileSync(path.join(__dirname,"index.html"));res.writeHead(200,{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache"});return res.end(req.method==="HEAD"?undefined:h)}
res.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"});res.end("Não encontrado.")}
catch(e){console.error(e);if(!res.headersSent)J(res,{err:"Erro no servidor."},500);else res.end()}});
server.on("upgrade",upgrade);
const bye=()=>{flush();process.exit(0)};process.on("SIGINT",bye);process.on("SIGTERM",bye);
server.listen(PORT,()=>console.log("Valley no ar: http://localhost:"+PORT+"  (dados em "+DIR+")"));
