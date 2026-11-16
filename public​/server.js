'use strict';
// Valley RPG - servidor. Uso: npm install && npm start  (index.html em public/index.html)
// Env: PORT, DATA_FILE, MAX_HISTORY (mensagens por mesa), VALLEY_ADMINS (usuarios separados por virgula),
//      MAX_ROOMS (total de salas publicas), ROOMS_PER_USER (salas por jogador)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { WebSocketServer } = require('ws');
const PORT = +process.env.PORT || 3000;
const DATA = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');
const MAXH = +process.env.MAX_HISTORY || 5000;
const ADMINS = (process.env.VALLEY_ADMINS || '').split(',').map(s => s.trim()).filter(Boolean);
const MAXR = +process.env.MAX_ROOMS || 60, PERU = +process.env.ROOMS_PER_USER || 3;

let db = { users: {}, pass: {}, tokens: {}, chats: {}, inv: [], rooms: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DATA, 'utf8'))); } catch (e) {}
if (!db.rooms || typeof db.rooms !== 'object') db.rooms = {};
if (!Object.keys(db.rooms).length) { // salas iniciais (qualquer jogador pode entrar; so admin apaga)
  db.rooms['#taverna'] = { id: '#taverna', n: 'Taverna', e: '🍺', by: 'sys', at: Date.now() };
  db.rooms['#praca'] = { id: '#praca', n: 'Praça', e: '⛲', by: 'sys', at: Date.now() };
}
let wt;
const flush = () => { clearTimeout(wt); fs.mkdirSync(path.dirname(DATA), { recursive: true }); fs.writeFileSync(DATA + '.tmp', JSON.stringify(db)); fs.renameSync(DATA + '.tmp', DATA); };
const persist = () => { clearTimeout(wt); wt = setTimeout(flush, 500); };
['SIGINT', 'SIGTERM'].forEach(s => process.on(s, () => { try { flush(); } catch (e) {} process.exit(0); }));

/* ---------- senhas / tokens ---------- */
const hashPw = (p, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(p, salt, 32).toString('hex');
const checkPw = (p, s) => { const [salt, h] = String(s || ':').split(':'); const a = Buffer.from(hashPw(p, salt).split(':')[1], 'hex'), b = Buffer.from(h || '', 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const newToken = u => { const t = crypto.randomBytes(24).toString('hex'); db.tokens[sha(t)] = u; persist(); return t; };
const userOf = t => (t && db.tokens[sha(String(t))]) || null;
const fails = new Map();
const blocked = ip => (fails.get(ip) || []).filter(t => Date.now() - t < 9e5).length >= 10;
const fail = ip => fails.set(ip, [...(fails.get(ip) || []), Date.now()]);

/* ---------- sanitizacao do perfil (valores vao para innerHTML no cliente) ---------- */
const HEX = /^#[0-9a-f]{3,8}$/i, PNG = /^data:image\/png;base64,[A-Za-z0-9+\/=]+$/, IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/, ID = /^[\w-]{1,8}$/;
function clean(u, d, old = {}) {
  if (!d || typeof d !== 'object' || Array.isArray(d) || JSON.stringify(d).length > 900000) return null;
  const o = { ...d }; o.u = u;
  o.cn = String(o.cn || old.cn || u).replace(/[<>]/g, '').slice(0, 20);
  o.bio = String(o.bio || '').slice(0, 200);
  const b = o.b && typeof o.b === 'object' ? o.b : {};
  o.b = { c: HEX.test(b.c) ? b.c : '#2f7fc1', a: String(b.a || '').replace(/[<>&"']/g, '').slice(0, 8), e: Math.min(5, Math.max(0, b.e | 0)), m: Math.min(5, Math.max(0, b.m | 0)) };
  if (o.photo && !(typeof o.photo === 'string' && o.photo.length < 150000 && IMG.test(o.photo))) delete o.photo;
  for (const k of ['fm', 'bd']) if (o[k] && !(typeof o[k] === 'string' && o[k].length < 60000 && PNG.test(o[k]))) delete o[k];
  if (o.shape !== 'q') o.shape = 'r';
  if (o.fr) { const f = o.fr; o.fr = {}; if (ID.test(f.s)) o.fr.s = f.s; if (HEX.test(f.c)) o.fr.c = f.c; }
  if (o.bb) { const f = o.bb; o.bb = {}; if (HEX.test(f.c)) o.bb.c = f.c; if (ID.test(f.f)) o.bb.f = f.f; if (ID.test(f.b)) o.bb.b = f.b; }
  return o;
}

/* ---------- HTTP ---------- */
const send = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); };
const body = req => new Promise((ok, no) => { let n = 0; const c = []; req.on('data', d => { n += d.length; if (n > 8e6) { no(new Error('big')); req.destroy(); } else c.push(d); }); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(c).toString() || '{}')); } catch (e) { no(e); } }); });
const bearer = req => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isRoom = e => typeof e === 'string' && has(db.rooms, e);
const okEsp = e => e === '' || (typeof e === 'string' && (has(db.users, e) || isRoom(e)));
const hist = esp => (db.chats[esp] || []).slice(-60);
const idKey = m => parseFloat(String(m.i || '').replace(/^\D+/, '')) || 0;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), ip = req.socket.remoteAddress;
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const f = [path.join(__dirname, 'public', 'index.html'), path.join(__dirname, 'index.html')].find(p => fs.existsSync(p));
      if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('index.html nao encontrado (coloque em public/index.html)'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return fs.createReadStream(f).pipe(res);
    }
    if (req.method === 'POST' && (url.pathname === '/api/register' || url.pathname === '/api/login')) {
      if (blocked(ip)) return send(res, 429, { err: 'Muitas tentativas. Aguarde alguns minutos.' });
      const { u, p, cn, b } = await body(req);
      if (url.pathname === '/api/login') {
        if (!db.users[u] || !checkPw(String(p || ''), db.pass[u])) { fail(ip); return send(res, 401, { err: 'Usuário ou senha incorretos.' }); }
        return send(res, 200, { token: newToken(u), users: db.users, u });
      }
      if (!/^[a-z0-9_]{3,20}$/.test(u || '')) return send(res, 400, { err: 'Usuário: 3 a 20 letras minúsculas, números ou _.' });
      if (typeof p !== 'string' || p.length < 4 || p.length > 40) return send(res, 400, { err: 'Senha com pelo menos 4 caracteres.' });
      if (!String(cn || '').trim()) return send(res, 400, { err: 'Dê um nome ao seu boneco.' });
      if (db.users[u]) return send(res, 409, { err: 'Esse usuário já existe.' });
      db.pass[u] = hashPw(p); db.users[u] = clean(u, { cn, b, reg: 'campo' }); persist();
      return send(res, 200, { token: newToken(u), users: db.users, u });
    }
    const u = userOf(bearer(req));
    if (req.method === 'GET' && url.pathname === '/api/session') return u ? send(res, 200, { u, users: db.users }) : send(res, 401, { err: 'Sessão inválida.' });
    if (url.pathname === '/api/chat' && req.method === 'GET') {
      if (!u) return send(res, 401, { err: 'Sessão inválida.' });
      const esp = url.searchParams.get('esp') || '';
      return okEsp(esp) ? send(res, 200, { esp, msgs: db.chats[esp] || [] }) : send(res, 404, { err: 'Mesa não encontrada.' });
    }
    if (url.pathname === '/api/chat/import' && req.method === 'POST') {
      if (!u) return send(res, 401, { err: 'Sessão inválida.' });
      const { esp = '', msgs } = await body(req);
      if (!okEsp(esp) || !Array.isArray(msgs)) return send(res, 400, { err: 'Dados inválidos.' });
      const admin = ADMINS.includes(u), mine = esp === u;
      const have = new Set((db.chats[esp] || []).map(m => m.i)), add = [];
      for (const m of msgs.slice(0, MAXH)) {
        if (!m || typeof m !== 'object' || typeof m.k !== 'string' || !m.i || have.has(m.i) || JSON.stringify(m).length > 20000) continue;
        if (!admin && !mine && m.u !== u && m.u !== 'sys') continue; // evita forjar falas de outras pessoas
        have.add(m.i); add.push(m);
      }
      db.chats[esp] = [...(db.chats[esp] || []), ...add].sort((a, b) => idKey(a) - idKey(b)).slice(-MAXH); persist();
      for (const c of conns.keys()) if (c.esp === esp) wsSend(c.ws, { t: 'hist', esp, msgs: hist(esp) });
      return send(res, 200, { ok: true, added: add.length, skipped: msgs.length - add.length });
    }
    send(res, 404, { err: 'Não encontrado.' });
  } catch (e) { send(res, 400, { err: 'Requisição inválida.' }); }
});

/* ---------- WebSocket ---------- */
const wss = new WebSocketServer({ noServer: true, maxPayload: 2e6 });
const conns = new Map(); // ctx -> true
const wsSend = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const online = () => [...new Set([...conns.keys()].map(c => c.u))];
const cast = (o, f) => { for (const c of conns.keys()) if (!f || f(c)) wsSend(c.ws, o); };
const roomList = () => Object.values(db.rooms).map(r => ({ id: r.id, n: r.n, e: r.e, by: r.by, c: new Set([...conns.keys()].filter(c => c.esp === r.id).map(c => c.u)).size }));
let rt; const castRooms = () => { clearTimeout(rt); rt = setTimeout(() => cast({ t: 'rooms', l: roomList() }), 150); };

server.on('upgrade', (req, sock, head) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws') return sock.destroy();
  wss.handleUpgrade(req, sock, head, ws => {
    const u = userOf(url.searchParams.get('token'));
    if (!u || !db.users[u]) return ws.close(4001, 'sessao');
    const c = { ws, u, esp: '', pos: null }; conns.set(c, true);
    cast({ t: 'online', l: online() });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'join') {
        c.esp = okEsp(m.esp || '') ? (m.esp || '') : '';
        wsSend(ws, { t: 'hist', esp: c.esp, msgs: hist(c.esp) });
        const d = {}; for (const o of conns.keys()) if (o !== c && o.pos) d[o.u] = o.pos;
        wsSend(ws, { t: 'peers', inv: db.inv, l: online(), d, adm: ADMINS.includes(c.u) });
        wsSend(ws, { t: 'rooms', l: roomList() }); castRooms();
      } else if (m.t === 'room') {
        if (m.op === 'new') {
          const n = String(m.n || '').replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
          const e = [...String(m.e || '').replace(/[<>&"'`\s]/g, '')].slice(0, 2).join('') || '💬';
          const mine = Object.values(db.rooms).filter(r => r.by === c.u).length;
          if (n.length < 3) return wsSend(ws, { t: 'roomerr', err: 'Nome da sala com pelo menos 3 letras.' });
          if (Object.keys(db.rooms).length >= MAXR) return wsSend(ws, { t: 'roomerr', err: 'Limite de salas do servidor atingido.' });
          if (!ADMINS.includes(c.u) && mine >= PERU) return wsSend(ws, { t: 'roomerr', err: 'Você já criou ' + PERU + ' salas. Apague uma para criar outra.' });
          if (Object.values(db.rooms).some(r => r.n.toLowerCase() === n.toLowerCase())) return wsSend(ws, { t: 'roomerr', err: 'Já existe uma sala com esse nome.' });
          const id = '#' + crypto.randomBytes(3).toString('hex');
          db.rooms[id] = { id, n, e, by: c.u, at: Date.now() }; persist();
          cast({ t: 'rooms', l: roomList() }); wsSend(ws, { t: 'roomnew', id });
        } else if (m.op === 'del') {
          const r = isRoom(m.id) && db.rooms[m.id];
          if (!r || (r.by !== c.u && !ADMINS.includes(c.u))) return wsSend(ws, { t: 'roomerr', err: 'Só quem criou a sala pode apagá-la.' });
          delete db.rooms[r.id]; delete db.chats[r.id]; persist();
          for (const o of conns.keys()) if (o.esp === r.id) { o.esp = ''; wsSend(o.ws, { t: 'kick', esp: r.id }); }
          cast({ t: 'rooms', l: roomList() });
        }
      } else if (m.t === 'prof') {
        const p = clean(c.u, m.d, db.users[c.u]); if (!p) return;
        db.users[c.u] = p; persist(); cast({ t: 'prof', u: c.u, d: p }, o => o !== c);
      } else if (m.t === 'pos') {
        const x = +m.x, y = +m.y; if (!isFinite(x) || !isFinite(y)) return;
        c.pos = { u: c.u, x, y, reg: String(m.reg || '').slice(0, 20), scn: String(m.scn || '').slice(0, 30), esp: String(m.esp || '').slice(0, 24) };
        cast({ t: 'pos', d: c.pos }, o => o !== c);
      } else if (m.t === 'chat') {
        const g = m.m; if (!g || typeof g !== 'object' || typeof g.k !== 'string' || JSON.stringify(g).length > 20000) return;
        if (g.u !== 'sys' && g.u !== 'npc') g.u = c.u;
        g.i = String(g.i || Date.now() + '.' + (Math.random() * 1e4 | 0));
        const L = db.chats[c.esp] = db.chats[c.esp] || [];
        if (L.some(o => o.i === g.i)) return;
        L.push(g); if (L.length > MAXH) L.splice(0, L.length - MAXH); persist();
        cast({ t: 'chat', esp: c.esp, m: g }, o => o !== c && o.esp === c.esp);
      } else if (m.t === 'inv') {
        if (!Array.isArray(m.d) || m.d.length > 200) return;
        db.inv = m.d.filter(v => v && typeof v.f === 'string' && typeof v.t === 'string' && v.f.length < 25 && v.t.length < 25).map(v => ({ f: v.f, t: v.t })); persist();
        cast({ t: 'inv', d: db.inv });
      }
    });
    ws.on('close', () => { conns.delete(c); cast({ t: 'online', l: online() }); castRooms(); });
    ws.on('error', () => {});
  });
});

server.listen(PORT, () => console.log('Valley RPG em http://localhost:' + PORT + '  (dados: ' + DATA + ')'));
