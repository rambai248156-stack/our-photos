const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const S = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const IC = {
  home: S('<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5H5.5A1.5 1.5 0 0 1 4 19z"/>'),
  search: S('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  insta: S('<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.2"/><circle cx="12" cy="12" r="4.1"/><circle cx="17.3" cy="6.7" r=".9" fill="currentColor" stroke="none"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  all: S('<rect x="3.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2.2"/>'),
  photo: S('<rect x="3.5" y="4" width="17" height="16" rx="4.5"/><circle cx="9" cy="9.7" r="1.7"/><path d="m4.5 17.2 4.4-4.1a1.6 1.6 0 0 1 2.2 0l2.6 2.5 1.8-1.6a1.6 1.6 0 0 1 2.1 0l2 1.8"/>'),
  video: S('<rect x="3.5" y="4.5" width="17" height="15" rx="4.5"/><path d="M10.4 9.3v5.4a.5.5 0 0 0 .8.4l4.3-2.7a.5.5 0 0 0 0-.8l-4.3-2.7a.5.5 0 0 0-.8.4z" fill="currentColor" stroke="none"/>'),
  play: S('<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>'),
  folder: S('<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h3.2c.6 0 1.2.3 1.6.8l.8 1H18a2.5 2.5 0 0 1 2.5 2.5v7.2A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5z"/>'),
  heart: S('<path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 2.7 4.5 6.4 4.5c2.1 0 3.9 1.1 5.6 3.3 1.7-2.2 3.5-3.3 5.6-3.3 3.7 0 5.5 3.8 4 7.2C19.5 16.4 12 21 12 21z"/>'),
  chat: S('<path d="M12 3.5a8.5 8.5 0 1 1-4.1 15.9L3.5 20.5l1.3-4.2A8.5 8.5 0 0 1 12 3.5z"/>'),
  send: S('<path d="M21 3 3.5 10.1l6.9 3.2 3.2 6.9z"/><path d="M21 3 10.4 13.3"/>'),
  arrow: S('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  close: S('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: S('<path d="m15 5-7 7 7 7"/>'),
  download: S('<path d="M12 4v11M7.5 11 12 15.5 16.5 11M5 20h14"/>'),
  trash: S('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/>'),
};
$$('[data-i]').forEach((e) => (e.innerHTML = IC[e.dataset.i]));

let me = '', MAX = 0, cur = null, filter = 'all', next, loading = false, gen = 0;
const posts = [], P = new Map(), grid = $('#grid');

async function api(url, o = {}) {
  const r = await fetch(url, { credentials: 'same-origin', method: o.method, headers: o.body ? { 'Content-Type': 'application/json' } : {}, body: o.body && JSON.stringify(o.body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}
const toast = (m) => { const t = el('div', 't', m); $('#toast').append(t); setTimeout(() => t.remove(), 2600); };
const mb = (n) => (n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + ' MB');
const clock = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
const eta = (s) => (!isFinite(s) ? '…' : s < 60 ? Math.ceil(s) + 's' : Math.ceil(s / 60) + ' min');

/* ---------- layers: every overlay owns one history entry, so Back closes it instead of leaving the site ---------- */
const stack = [];
const show = (n) => { n.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => n.classList.add('on'))); };
const hide = (n) => { n.classList.remove('on'); setTimeout(() => { if (!n.classList.contains('on')) n.hidden = true; }, 330); };
function push(node, onClose) { stack.push({ node, onClose }); history.pushState({ d: stack.length }, ''); show(node); }
const pop = () => history.back();
addEventListener('popstate', () => {
  const d = history.state?.d || 0;
  while (stack.length > d) { const l = stack.pop(); hide(l.node); l.onClose?.(); }
});
history.replaceState({ d: 0 }, '');
$$('.bd').forEach((b) => (b.onclick = pop));

/* ---------- feed ---------- */
function card(p) {
  const c = el('button', 'card'); c.dataset.id = p.id; c.type = 'button';
  const t = el('div', 'th');
  const src = p.thumb || (p.kind === 'photo' ? p.media : '');
  if (src) { const i = new Image(); i.src = src; i.alt = ''; i.loading = 'lazy'; i.decoding = 'async'; i.draggable = false; t.append(i); }
  if (p.kind === 'video') { const b = el('span', 'vb'); b.innerHTML = IC.play; b.append(p.dur ? clock(p.dur) : 'Video'); t.append(b); }
  const h = el('span', 'hb'); h.innerHTML = IC.heart; h.hidden = !p.liked; t.append(h);
  const ti = el('div', 'ti', p.title || 'Untitled'); if (!p.title) ti.classList.add('mu');
  c.append(t, ti);
  return c;
}
const skel = () => Array.from({ length: 9 }, () => el('div', 'sk'));
function bind(g) { g.onclick = (e) => { const c = e.target.closest('.card'); if (c && P.get(c.dataset.id)) view(P.get(c.dataset.id)); }; }
bind(grid); bind($('#sg'));

async function load(reset) {
  if (reset) { gen++; posts.length = 0; next = undefined; loading = false; grid.replaceChildren(...skel()); $('#empty').hidden = true; }
  if (loading || next === null) return;
  loading = true; const g = gen;
  try {
    const r = await api(`/api/posts?type=${filter === 'all' ? '' : filter}${next ? `&before=${next}` : ''}`);
    if (g !== gen) return;
    if (!posts.length) grid.replaceChildren();
    for (const p of r.posts) if (!posts.some((x) => x.id === p.id)) { P.set(p.id, p); posts.push(p); grid.append(card(p)); }
    next = r.next;
  } catch (e) { if (g === gen) { toast(e.message); grid.replaceChildren(); } }
  finally { if (g === gen) { loading = false; $('#empty').hidden = posts.length > 0; } }
}
new IntersectionObserver((e) => { if (e[0].isIntersecting) load(); }, { rootMargin: '800px' }).observe($('#more'));

function addPost(p) {
  if (posts.some((x) => x.id === p.id) || (filter !== 'all' && filter !== p.kind)) return;
  P.set(p.id, p); posts.unshift(p); grid.prepend(card(p)); $('#empty').hidden = true;
}
function delPost(id) {
  const i = posts.findIndex((x) => x.id === id); if (i >= 0) posts.splice(i, 1);
  P.delete(id); $$(`.card[data-id="${id}"]`).forEach((c) => c.remove());
  $('#empty').hidden = posts.length > 0;
  if (cur?.id === id) { toast('This post was removed'); history.go(-stack.length); }
}
function sync(p) {
  $$(`.card[data-id="${p.id}"] .hb`).forEach((h) => (h.hidden = !p.liked));
  if (cur?.id === p.id) $('#vl').classList.toggle('liked', p.liked);
}
function live() {
  const es = new EventSource('/api/events'); let first = true;
  es.onopen = async () => {
    if (!first) { try { (await api(`/api/posts?type=${filter === 'all' ? '' : filter}`)).posts.reverse().forEach(addPost); } catch {} }
    first = false;
  };
  es.addEventListener('post', (e) => addPost(JSON.parse(e.data)));
  es.addEventListener('del', (e) => delPost(JSON.parse(e.data).id));
  es.addEventListener('like', (e) => { const d = JSON.parse(e.data), p = P.get(d.id); if (p) { p.liked = d.liked; sync(p); } });
  es.addEventListener('comment', (e) => { const d = JSON.parse(e.data); if (cur?.id === d.pid && $('#cmts').classList.contains('on')) addC(d.comment); });
}

/* ---------- viewer (full screen) ---------- */
function view(p) {
  cur = p;
  const st = $('#stage'); st.replaceChildren();
  let m;
  if (p.kind === 'video') {
    m = el('video'); m.controls = true; m.playsInline = true; m.autoplay = true;
    if (p.thumb) m.poster = p.thumb;
    m.src = p.media;
    m.onerror = () => st.replaceChildren(el('p', '', "This video can't be played in this browser."));
  } else {
    m = el('img'); m.alt = p.title; m.src = p.thumb || p.media;
    if (p.thumb) { const f = new Image(); f.onload = () => { if (cur === p) m.src = p.media; }; f.src = p.media; } // sharp preview first, original HD right after
  }
  st.append(m);
  $('#vt').textContent = p.title; $('#vt').hidden = !p.title;
  $('#vd').textContent = p.desc; $('#vd').hidden = !p.desc;
  $('#vl').classList.toggle('liked', p.liked);
  $('#vdel').hidden = p.uid !== me;
  push($('#viewer'), () => { $('#stage').replaceChildren(); cur = null; });
}
$('#vx').onclick = pop;
$('#vl').onclick = async () => {
  const p = cur; if (!p) return;
  p.liked = !p.liked; sync(p);
  try { await api(`/api/posts/${p.id}/like`, { method: 'PUT', body: { liked: p.liked } }); }
  catch (e) { p.liked = !p.liked; sync(p); toast(e.message); }
};
$('#vs').onclick = async () => {
  const u = `${location.origin}/?p=${cur.id}`;
  try {
    if (navigator.share) await navigator.share({ title: cur.title || 'Frames', url: u });
    else { await navigator.clipboard.writeText(u); toast('Link copied'); }
  } catch {}
};
$('#vdel').onclick = async () => {
  if (!confirm('Delete this post for everyone?')) return;
  try { await api(`/api/posts/${cur.id}`, { method: 'DELETE' }); } catch (e) { toast(e.message); }
};

let dlWait = false;
$('#vdn').onclick = () => { // one tap = one download of the original HD file
  if (!cur || dlWait) return;
  dlWait = true; setTimeout(() => (dlWait = false), 1500);
  const a = document.createElement('a');
  a.href = `${cur.media}?dl=1&name=${encodeURIComponent(cur.title || 'frames')}&t=${Date.now()}`;
  a.download = ''; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
  toast('Download started');
};

/* comments */
function addC(c) {
  const l = $('#cl'); if (l.querySelector(`[data-id="${c.id}"]`)) return;
  const d = el('div', 'cm'); d.dataset.id = c.id; d.append(el('b', '', c.name + (c.uid === me ? ' (you)' : '')), el('span', '', c.text));
  l.append(d); l.scrollTop = l.scrollHeight;
}
$('#vc').onclick = async () => {
  const p = cur; $('#cl').replaceChildren(); push($('#cmts'));
  try { (await api(`/api/posts/${p.id}/comments`)).comments.forEach(addC); } catch (e) { toast(e.message); }
};
$('#cf').onsubmit = async (e) => {
  e.preventDefault();
  const v = $('#ci').value.trim(); if (!v || !cur) return;
  $('#ci').value = '';
  try { addC((await api(`/api/posts/${cur.id}/comments`, { method: 'POST', body: { text: v } })).comment); } catch (x) { toast(x.message); }
};

/* ---------- nav, filter, search ---------- */
function setFilter(f) {
  filter = f;
  $('#nfi').innerHTML = IC[f]; $('#nfl').textContent = { all: 'All', photo: 'Photos', video: 'Videos' }[f];
  $$('#flt [data-f]').forEach((b) => b.classList.toggle('on', b.dataset.f === f));
  $('#nf').classList.toggle('on', f !== 'all'); $('#nh').classList.toggle('on', f === 'all');
  load(true);
}
$('#nf').onclick = () => push($('#flt'));
$$('#flt [data-f]').forEach((b) => (b.onclick = () => { pop(); setFilter(b.dataset.f); }));
$('#nh').onclick = () => { if (stack.length) history.go(-stack.length); if (filter !== 'all') setFilter('all'); scrollTo({ top: 0, behavior: 'smooth' }); };

let st;
function openSearch() { $('#si').value = ''; $('#sg').replaceChildren(); push($('#search')); $('#si').focus(); }
$('#s1').onclick = $('#ns').onclick = openSearch;
$('#sx').onclick = pop;
$('#sf').onsubmit = (e) => { e.preventDefault(); $('#si').blur(); };
$('#si').oninput = () => {
  clearTimeout(st);
  st = setTimeout(async () => {
    const v = $('#si').value.trim(), g = $('#sg'); g.replaceChildren();
    if (!v) return;
    try {
      const r = await api('/api/posts?q=' + encodeURIComponent(v));
      if (v !== $('#si').value.trim()) return;
      g.replaceChildren(); r.posts.forEach((p) => { P.set(p.id, p); g.append(card(p)); });
    } catch {}
  }, 200);
};

/* ---------- Instagram: launches the app itself, so it resumes on whatever screen you left it ---------- */
$('#ig').onclick = () => {
  const web = 'https://www.instagram.com/', ua = navigator.userAgent;
  const t = setTimeout(() => { if (!document.hidden) window.open(web, '_blank', 'noopener'); }, 1500);
  addEventListener('pagehide', () => clearTimeout(t), { once: true });
  document.addEventListener('visibilitychange', () => clearTimeout(t), { once: true });
  if (/Android/i.test(ua)) location.href = `intent://instagram.com/#Intent;package=com.instagram.android;scheme=https;S.browser_fallback_url=${encodeURIComponent(web)};end`;
  else if (/iPhone|iPad|iPod/i.test(ua)) location.href = 'instagram://app';
  else { clearTimeout(t); window.open(web, '_blank', 'noopener'); }
};

/* ---------- upload ---------- */
let pending = null;
$('#fab').onclick = () => push($('#add'));
$$('[data-pick]').forEach((b) => (b.onclick = () => { const i = $('#' + b.dataset.pick); i.value = ''; i.click(); pop(); }));
const kindOf = (f) => (/^video\//.test(f.type) || /\.(mp4|m4v|mov|webm|mkv|3gp)$/i.test(f.name) ? 'video' : /^image\//.test(f.type) || /\.(jpe?g|png|gif|webp|avif)$/i.test(f.name) ? 'photo' : null);
for (const [id, want] of [['fp', 'photo'], ['fv', 'video'], ['ff', null]]) {
  $('#' + id).onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const k = kindOf(f);
    if (!k || (want && k !== want)) return toast(want ? `Please choose a ${want}` : 'Only photos and videos');
    if (f.size > MAX) return toast(`Max size is ${mb(MAX)}`);
    pending = { f, k };
    $('#ttl').value = ''; $('#dsc').value = '';
    const u = URL.createObjectURL(f), m = k === 'video' ? el('video') : el('img');
    if (k === 'video') { m.muted = true; m.loop = true; m.autoplay = true; m.playsInline = true; }
    m.src = u; $('#prev').replaceChildren(m);
    push($('#compose'), () => { URL.revokeObjectURL(u); $('#prev').replaceChildren(); });
  };
}
$$('#compose input,#compose textarea').forEach((i) => (i.onfocus = () => setTimeout(() => i.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)));
$('#go').onclick = () => {
  const { f, k } = pending, title = $('#ttl').value.trim(), desc = $('#dsc').value.trim();
  if (window.Notification && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  pop(); send(f, k, title, desc);
};

function thumbOf(src, w, h) {
  const k = Math.min(1, 640 / Math.max(w, h)), c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0, c.width, c.height);
  const d = c.toDataURL('image/jpeg', 0.8); return d.length < 500000 ? d : undefined;
}
async function probe(f, k) { // size + small preview only; the file itself is uploaded untouched
  const o = {};
  try {
    if (k === 'photo') { const b = await createImageBitmap(f); o.w = b.width; o.h = b.height; o.thumb = thumbOf(b, b.width, b.height); b.close?.(); }
    else {
      const v = document.createElement('video'), u = URL.createObjectURL(f);
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = u;
      await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = no; setTimeout(no, 8000); });
      o.w = v.videoWidth; o.h = v.videoHeight; o.dur = isFinite(v.duration) ? v.duration : 0;
      v.currentTime = Math.min(1, (v.duration || 1) / 10);
      await new Promise((ok) => { v.onseeked = ok; setTimeout(ok, 3000); });
      o.thumb = thumbOf(v, v.videoWidth, v.videoHeight); URL.revokeObjectURL(u);
    }
  } catch {}
  return o;
}
let busyUp = 0, lock;
addEventListener('beforeunload', (e) => { if (busyUp) { e.preventDefault(); e.returnValue = ''; } });

async function send(f, k, title, desc) {
  const n = el('div', 'up');
  n.innerHTML = '<div class="r"><div class="nm"></div><b class="pc">0%</b></div><div class="bar"><i></i></div><div class="r s"><span class="a">Preparing…</span><span class="b"></span></div>';
  $('.nm', n).textContent = title || f.name; $('#ups').prepend(n);
  const set = (a, b) => { $('.a', n).textContent = a; $('.b', n).textContent = b || ''; };
  const done = (ms) => setTimeout(() => n.remove(), ms);
  busyUp++;
  try { lock = await navigator.wakeLock?.request('screen'); } catch {}
  try {
    const meta = await probe(f, k);
    const { id } = await api('/api/uploads', { method: 'POST', body: { name: f.name, size: f.size, kind: k, title, desc, ...meta } });
    const t0 = performance.now();
    const post = await new Promise((ok, no) => {
      const x = new XMLHttpRequest();
      x.open('PUT', '/api/uploads/' + id);
      x.setRequestHeader('Content-Type', 'application/octet-stream');
      x.upload.onprogress = (e) => {
        const l = e.loaded, t = e.total || f.size, sp = l / ((performance.now() - t0) / 1000 || 1);
        $('.pc', n).textContent = Math.floor((l / t) * 100) + '%'; $('.bar i', n).style.width = (l / t) * 100 + '%';
        set(`${mb(l)} of ${mb(t)}`, `${mb(sp)}/s · ${eta((t - l) / sp)} left`);
      };
      x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch {} x.status < 300 ? ok(j) : no(new Error(j.error || 'Upload failed')); };
      x.onerror = x.ontimeout = () => no(new Error('Connection lost. Please try again.'));
      x.send(f);
    });
    $('.pc', n).textContent = '100%'; $('.bar i', n).style.width = '100%'; set('Uploaded — HD original', 'Done');
    addPost(post); done(3500);
    if (document.hidden && window.Notification && Notification.permission === 'granted') { try { new Notification('Upload complete', { body: title || f.name }); } catch {} }
  } catch (e) { n.classList.add('err'); $('.pc', n).textContent = '!'; set(e.message, ''); done(7000); }
  finally { if (!--busyUp) { lock?.release?.().catch(() => {}); lock = null; } }
}

/* ---------- boot ---------- */
if (window.visualViewport) {
  const u = () => document.documentElement.style.setProperty('--kb', Math.max(0, innerHeight - visualViewport.height - visualViewport.offsetTop) + 'px');
  visualViewport.addEventListener('resize', u); visualViewport.addEventListener('scroll', u);
}
if (matchMedia('(pointer:coarse)').matches && !matchMedia('(display-mode:fullscreen),(display-mode:standalone)').matches && document.documentElement.requestFullscreen) {
  const go = () => document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  addEventListener('pointerup', go, { once: true, capture: true });
}
(async () => {
  try {
    const s = await api('/api/session', { method: 'POST' });
    me = s.uid; MAX = s.max;
    await load(true); live();
    const p = new URLSearchParams(location.search).get('p');
    if (p) { history.replaceState({ d: 0 }, '', '/'); try { const r = await api('/api/posts/' + p); P.set(r.id, r); view(r); } catch {} }
  } catch (e) { toast('Cannot reach the server'); grid.replaceChildren(); $('#empty').hidden = false; }
})();
