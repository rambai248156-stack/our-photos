// Frames server — zero npm dependencies. Needs Node.js 22.13+ (built-in SQLite).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(ROOT, 'public');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PORT = Number(process.env.PORT ?? 3000);
const MAX = (Number(process.env.MAX_UPLOAD_MB) || 4096) * 1048576;
for (const d of ['media', 'thumbs', 'tmp']) fs.mkdirSync(path.join(DATA, d), { recursive: true });
for (const f of fs.readdirSync(path.join(DATA, 'tmp'))) fs.rmSync(path.join(DATA, 'tmp', f), { force: true });

const db = new DatabaseSync(path.join(DATA, 'frames.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, created INTEGER);
CREATE TABLE IF NOT EXISTS sessions(h TEXT PRIMARY KEY, uid TEXT REFERENCES users(id));
CREATE TABLE IF NOT EXISTS posts(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, uid TEXT, kind TEXT, title TEXT, descr TEXT,
  mime TEXT, ext TEXT, size INTEGER, w INTEGER, h INTEGER, dur REAL, thumb INTEGER, created INTEGER);
CREATE TABLE IF NOT EXISTS likes(pid TEXT REFERENCES posts(id) ON DELETE CASCADE, uid TEXT, PRIMARY KEY(pid, uid));
CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY AUTOINCREMENT, pid TEXT REFERENCES posts(id) ON DELETE CASCADE, uid TEXT, text TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY, uid TEXT, meta TEXT, size INTEGER, created INTEGER);
DELETE FROM uploads;`);
const Q = {};
const q = (s) => (Q[s] ||= db.prepare(s));
const rid = (n = 9) => crypto.randomBytes(n).toString('base64url');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const txt = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const int = (v) => Math.max(0, Math.min(100000, Math.round(Number(v)) || 0));

// tiny in-memory rate limiter
const hits = new Map();
const limited = (k, max, ms) => {
  const n = Date.now();
  let h = hits.get(k);
  if (!h || h.t < n) hits.set(k, (h = { t: n + ms, c: 0 }));
  return ++h.c > max;
};
setInterval(() => { const n = Date.now(); for (const [k, h] of hits) if (h.t < n) hits.delete(k); }, 60000).unref();

class E extends Error { constructor(c, m) { super(m); this.c = c; } }
const send = (res, c, o = {}) => {
  const b = JSON.stringify(o);
  res.writeHead(c, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(b) });
  res.end(b);
};
const readJson = (req, max = 65536) => new Promise((ok, no) => {
  let n = 0; const a = [];
  req.on('data', (c) => { n += c.length; if (n > max) { a.length = 0; req.removeAllListeners('data'); req.resume(); no(new E(413, 'Too large')); } else a.push(c); });
  req.on('end', () => { try { ok(JSON.parse(Buffer.concat(a).toString() || '{}')); } catch { no(new E(400, 'Bad JSON')); } });
  req.on('error', no);
});
const cookie = (req, k) => (req.headers.cookie || '').split(/;\s*/).map((s) => s.split('=')).find((a) => a[0] === k)?.[1];
const authed = (req) => { const t = cookie(req, 'sid'); return t ? q('SELECT uid FROM sessions WHERE h=?').get(sha(t))?.uid : undefined; };
function session(req, res) {
  let uid = authed(req);
  if (!uid) {
    uid = rid(); const t = rid(24);
    q('INSERT INTO users VALUES(?,?)').run(uid, Date.now());
    q('INSERT INTO sessions VALUES(?,?)').run(sha(t), uid);
    const sec = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie', `sid=${t}; Path=/; Max-Age=34560000; HttpOnly; SameSite=Lax${sec ? '; Secure' : ''}`);
  }
  return uid;
}

// Real file-type check (magic bytes) — never trust the name the browser sends
function sniff(b) {
  const s = (a, z) => b.toString('latin1', a, z);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ['photo', 'image/jpeg', 'jpg'];
  if (s(1, 4) === 'PNG') return ['photo', 'image/png', 'png'];
  if (s(0, 3) === 'GIF') return ['photo', 'image/gif', 'gif'];
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return ['photo', 'image/webp', 'webp'];
  if (s(4, 8) === 'ftyp') {
    const k = s(8, 12);
    if (k === 'avif' || k === 'avis') return ['photo', 'image/avif', 'avif'];
    if (/^(heic|heix|hevc|mif1|msf1|M4A |M4B )/.test(k)) return null;
    return k === 'qt  ' ? ['video', 'video/quicktime', 'mov'] : ['video', 'video/mp4', 'mp4'];
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return s(0, 64).includes('webm') ? ['video', 'video/webm', 'webm'] : ['video', 'video/x-matroska', 'mkv'];
  return null;
}

const pub = (r) => ({ id: r.id, seq: r.seq, uid: r.uid, kind: r.kind, title: r.title, desc: r.descr, w: r.w, h: r.h, dur: r.dur, at: r.created,
  liked: !!r.liked, media: `/media/${r.id}`, thumb: r.thumb ? `/thumb/${r.id}` : null });
const cm = (r) => ({ id: r.id, uid: r.uid, name: 'Guest ' + r.uid.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase(), text: r.text, at: r.created });
const SEL = 'SELECT p.*, (SELECT 1 FROM likes l WHERE l.pid=p.id AND l.uid=@me) liked FROM posts p';

// real-time (Server-Sent Events)
const clients = new Set();
const emit = (ev, d, only) => {
  const m = `event: ${ev}\ndata: ${JSON.stringify(d)}\n\n`;
  for (const c of clients) if (!only || c.uid === only) c.res.write(m);
};
setInterval(() => emit('ping', 1), 20000).unref();

const busy = new Set();
async function api(req, res, u, m, p) {
  if (p === '/api/session' && m === 'POST') return send(res, 200, { uid: session(req, res), max: MAX });
  const me = authed(req);
  if (!me) throw new E(401, 'No session');
  let r;
  if (p === '/api/events') {
    if (limited('e' + me, 30, 60000)) throw new E(429, 'Slow down');
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 2000\n\n');
    const c = { res, uid: me };
    clients.add(c);
    req.on('close', () => clients.delete(c));
    return;
  }
  if (p === '/api/posts' && m === 'GET') {
    const type = u.searchParams.get('type');
    const term = txt(u.searchParams.get('q'), 80);
    const prm = { me, before: Number(u.searchParams.get('before')) || 1e15 };
    let sql = SEL + ' WHERE p.seq < @before';
    if (type === 'photo' || type === 'video') { sql += ' AND p.kind=@type'; prm.type = type; }
    if (term) { sql += " AND p.title LIKE @like ESCAPE '\\'"; prm.like = '%' + term.replace(/[\\%_]/g, '\\$&') + '%'; }
    const rows = db.prepare(sql + ' ORDER BY p.seq DESC LIMIT 30').all(prm);
    return send(res, 200, { posts: rows.map(pub), next: rows.length === 30 ? rows[29].seq : null });
  }
  if (p === '/api/uploads' && m === 'POST') {
    if (limited('u' + me, 30, 3600000)) throw new E(429, 'Too many uploads, try later');
    const b = await readJson(req, 800000);
    const size = Number(b.size);
    if (!Number.isInteger(size) || size < 12 || size > MAX) throw new E(413, `File must be under ${Math.floor(MAX / 1048576)} MB`);
    if (b.kind !== 'photo' && b.kind !== 'video') throw new E(400, 'Bad type');
    const meta = { kind: b.kind, title: txt(b.title, 100), desc: txt(b.desc, 500), w: int(b.w), h: int(b.h), dur: Math.min(Number(b.dur) || 0, 864000) };
    const id = rid(12);
    const th = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(b.thumb || '');
    if (th) {
      const buf = Buffer.from(th[1], 'base64');
      if (buf.length < 400000 && buf[0] === 0xff && buf[1] === 0xd8) { fs.writeFileSync(path.join(DATA, 'tmp', id + '.jpg'), buf); meta.thumb = 1; }
    }
    q('INSERT INTO uploads VALUES(?,?,?,?,?)').run(id, me, JSON.stringify(meta), size, Date.now());
    return send(res, 201, { id });
  }
  if ((r = /^\/api\/uploads\/([\w-]+)$/.exec(p)) && m === 'PUT') {
    const up = q('SELECT * FROM uploads WHERE id=?').get(r[1]);
    if (!up || up.uid !== me) throw new E(404, 'Unknown upload');
    if (Number(req.headers['content-length']) !== up.size) throw new E(400, 'Size mismatch');
    if (busy.has(up.id)) throw new E(409, 'Already uploading');
    busy.add(up.id);
    const part = path.join(DATA, 'tmp', up.id + '.part');
    try {
      try { await pipeline(req, fs.createWriteStream(part)); } catch { throw new E(400, 'Upload interrupted'); }
      const fd = fs.openSync(part, 'r'); const head = Buffer.alloc(64);
      const n = fs.readSync(fd, head, 0, 64, 0); fs.closeSync(fd);
      const meta = JSON.parse(up.meta);
      const t = sniff(head.subarray(0, n));
      if (fs.statSync(part).size !== up.size || !t || t[0] !== meta.kind) throw new E(415, 'Only real photos and videos are allowed');
      fs.renameSync(part, path.join(DATA, 'media', `${up.id}.${t[2]}`));
      if (meta.thumb) fs.renameSync(path.join(DATA, 'tmp', up.id + '.jpg'), path.join(DATA, 'thumbs', up.id + '.jpg'));
      q('INSERT INTO posts(id,uid,kind,title,descr,mime,ext,size,w,h,dur,thumb,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(up.id, me, meta.kind, meta.title, meta.desc, t[1], t[2], up.size, meta.w, meta.h, meta.dur, meta.thumb ? 1 : 0, Date.now());
      const post = pub(db.prepare(SEL + ' WHERE p.id=@id').get({ me, id: up.id }));
      emit('post', { ...post, liked: false });
      return send(res, 201, post);
    } catch (e) {
      fs.rmSync(part, { force: true }); fs.rmSync(path.join(DATA, 'tmp', up.id + '.jpg'), { force: true });
      throw e;
    } finally { busy.delete(up.id); q('DELETE FROM uploads WHERE id=?').run(up.id); }
  }
  if ((r = /^\/api\/posts\/([\w-]+)$/.exec(p))) {
    const row = db.prepare(SEL + ' WHERE p.id=@id').get({ me, id: r[1] });
    if (!row) throw new E(404, 'Not found');
    if (m === 'GET') return send(res, 200, pub(row));
    if (m === 'DELETE') {
      if (row.uid !== me) throw new E(403, 'Not yours');
      q('DELETE FROM posts WHERE id=?').run(row.id);
      fs.rmSync(path.join(DATA, 'media', `${row.id}.${row.ext}`), { force: true });
      fs.rmSync(path.join(DATA, 'thumbs', `${row.id}.jpg`), { force: true });
      emit('del', { id: row.id });
      return send(res, 200, { ok: true });
    }
  }
  if ((r = /^\/api\/posts\/([\w-]+)\/like$/.exec(p)) && m === 'PUT') {
    if (limited('l' + me, 120, 60000)) throw new E(429, 'Slow down');
    if (!q('SELECT 1 FROM posts WHERE id=?').get(r[1])) throw new E(404, 'Not found');
    const on = !!(await readJson(req)).liked;
    if (on) q('INSERT OR IGNORE INTO likes VALUES(?,?)').run(r[1], me); else q('DELETE FROM likes WHERE pid=? AND uid=?').run(r[1], me);
    emit('like', { id: r[1], liked: on }, me); // only your own devices hear this; nobody sees counts
    return send(res, 200, { liked: on });
  }
  if ((r = /^\/api\/posts\/([\w-]+)\/comments$/.exec(p))) {
    if (!q('SELECT 1 FROM posts WHERE id=?').get(r[1])) throw new E(404, 'Not found');
    if (m === 'GET') return send(res, 200, { comments: q('SELECT * FROM comments WHERE pid=? ORDER BY id DESC LIMIT 100').all(r[1]).reverse().map(cm) });
    if (m === 'POST') {
      if (limited('c' + me, 15, 60000)) throw new E(429, 'Slow down');
      const text = txt((await readJson(req)).text, 400);
      if (!text) throw new E(400, 'Empty comment');
      const i = q('INSERT INTO comments(pid,uid,text,created) VALUES(?,?,?,?)').run(r[1], me, text, Date.now());
      const c = cm({ id: Number(i.lastInsertRowid), uid: me, text, created: Date.now() });
      emit('comment', { pid: r[1], comment: c });
      return send(res, 201, { comment: c });
    }
  }
  throw new E(404, 'Not found');
}

function file(req, res, f, type, cache, extra = {}) {
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) return send(res, 404, { error: 'Not found' });
    const h = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cache, ...extra };
    let a = 0, z = st.size - 1, code = 200;
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      if (m[1] === '') a = Math.max(0, st.size - Number(m[2])); else { a = Number(m[1]); if (m[2]) z = Math.min(z, Number(m[2])); }
      if (a > z || a >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
      code = 206; h['Content-Range'] = `bytes ${a}-${z}/${st.size}`;
    }
    h['Content-Length'] = z - a + 1;
    res.writeHead(code, h);
    if (req.method === 'HEAD') return res.end();
    pipeline(fs.createReadStream(f, { start: a, end: z }), res).catch(() => {});
  });
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

async function route(req, res) {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname, m = req.method;
  if (m !== 'GET' && m !== 'HEAD' && req.headers.origin) {
    let ok = false;
    try { ok = new URL(req.headers.origin).host === req.headers.host; } catch {}
    if (!ok) throw new E(403, 'Forbidden');
  }
  if (p.startsWith('/api/')) {
    if (limited('a' + req.socket.remoteAddress, 900, 60000)) throw new E(429, 'Slow down');
    return api(req, res, u, m, p);
  }
  if (m !== 'GET' && m !== 'HEAD') throw new E(405, 'Method not allowed');
  let r;
  if ((r = /^\/(media|thumb)\/([\w-]{6,40})$/.exec(p))) {
    const row = q('SELECT id,mime,ext,thumb FROM posts WHERE id=?').get(r[2]);
    if (!row || (r[1] === 'thumb' && !row.thumb)) throw new E(404, 'Not found');
    const safe = { 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin' };
    if (r[1] === 'media' && u.searchParams.has('dl')) { // save to device: every download gets a brand-new file name
      const base = txt(u.searchParams.get('name'), 60).replace(/[\\/:*?"<>|]/g, '').replace(/\.+$/, '').trim() || 'frames';
      const nm = `${base}-${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}.${row.ext}`;
      const ascii = nm.replace(/[^\x20-\x7e]/g, '_');
      const enc = encodeURIComponent(nm).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
      return file(req, res, path.join(DATA, 'media', `${row.id}.${row.ext}`), row.mime, 'no-store', { ...safe, 'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${enc}` });
    }
    return r[1] === 'thumb'
      ? file(req, res, path.join(DATA, 'thumbs', `${row.id}.jpg`), 'image/jpeg', 'public, max-age=31536000, immutable', safe)
      : file(req, res, path.join(DATA, 'media', `${row.id}.${row.ext}`), row.mime, 'public, max-age=31536000, immutable', safe);
  }
  let f;
  try { f = decodeURIComponent(p === '/' ? '/index.html' : p); } catch { throw new E(400, 'Bad path'); }
  const full = path.join(PUB, path.normalize(f));
  if (f.includes('\0') || !full.startsWith(PUB + path.sep) || path.basename(full).startsWith('.') || !TYPES[path.extname(full)]) throw new E(404, 'Not found');
  return file(req, res, full, TYPES[path.extname(full)], 'no-cache');
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  try { await route(req, res); } catch (e) {
    if (!e.c) console.error(e);
    if (!res.headersSent) send(res, e.c || 500, { error: e.c ? e.message : 'Server error' }); else res.end();
  }
});
server.requestTimeout = 0; // big HD uploads can take a long time
server.headersTimeout = 60000;
server.listen(PORT, () => {
  const port = server.address().port;
  console.log(`\n  Frames is running\n  Local:   http://localhost:${port}`);
  for (const l of Object.values(os.networkInterfaces()).flat()) if (l && l.family === 'IPv4' && !l.internal) console.log(`  Network: http://${l.address}:${port}   (open this on your phone, same Wi-Fi)`);
  console.log(`  Data:    ${DATA}\n`);
});
const stop = () => { for (const c of clients) c.res.end(); server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 2000).unref(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
