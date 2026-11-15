'use strict';
/* האימון שלי: אפליקציית מעקב אימונים. אתר סטטי, בלי שרת, הנתונים נשמרים ב-localStorage. */

const KEY = 'gymlog.v1';
const DKEY = 'gymlog.draft';
const KG = 'ק"ג';
const FEELS = ['קל', 'טוב', 'מצוין', 'קשה', 'מתיש'];
const EX_FEELS = ['קל', 'בדיוק טוב', 'קשה'];
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const pad = (x) => String(x).padStart(2, '0');
const L = (s) => `<span class="ltr">${s}</span>`; // ביטוי מספרי שחייב להישאר משמאל לימין

const IC = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14.5 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9.5 6 6 6-6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5v5M6.5 6.5v11M17.5 6.5v11M21 9.5v5M6.5 12h11"/></svg>',
};

/* ---------- אחסון ---------- */
function freshDb() {
  return {
    v: 1,
    exercises: clone(DEFAULT_EXERCISES),
    plans: clone(DEFAULT_PLANS),
    sessions: clone(SEED_SESSIONS),
    weights: [],
    settings: { rest: 60, theme: 'auto', sound: true },
    lastBackup: null,
  };
}
function normalize(d) {
  d.v = 1;
  d.exercises = d.exercises || {};
  d.plans = d.plans || clone(DEFAULT_PLANS);
  d.sessions = Array.isArray(d.sessions) ? d.sessions : [];
  d.weights = (Array.isArray(d.weights) ? d.weights : []).filter((w) => w && /^\d{4}-\d{2}-\d{2}$/.test(w.date) && Number.isFinite(w.kg) && w.kg > 0);
  for (const w of d.weights) w.id = w.id || 'w' + Math.random().toString(36).slice(2);
  d.settings = Object.assign({ rest: 60, theme: 'auto', sound: true }, d.settings || {});
  for (const [id, def] of Object.entries(DEFAULT_EXERCISES)) {
    const ex = d.exercises[id];
    if (ex && !ex.muscles && def.muscles) ex.muscles = clone(def.muscles);
  }
  for (const p of Object.values(d.plans)) p.list = (p.list || []).filter((id) => d.exercises[id]);
  for (const s of d.sessions) { s.ex = s.ex || {}; s.id = s.id || 's' + Math.random().toString(36).slice(2); }
  return d;
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.plans && d.sessions) return normalize(d);
    }
  } catch (e) { /* נתונים פגומים: מתחילים מחדש */ }
  return freshDb();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('השמירה במכשיר נכשלה'); return; }
  if (typeof scheduleSync === 'function') scheduleSync();
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DKEY) || 'null');
    if (d && d.plan && d.ex && Array.isArray(d.list)) return d;
  } catch (e) { /* מתעלמים */ }
  return null;
}
function saveDraft() {
  try {
    if (draft) localStorage.setItem(DKEY, JSON.stringify(draft));
    else localStorage.removeItem(DKEY);
  } catch (e) { /* מתעלמים */ }
}

let db = load();
let draft = loadDraft();
const ui = { openPairs: new Set(), chartKey: 'run:sec', form: null, sheetEx: null };

/* ---------- עזרי תאריך ומספרים ---------- */
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => iso(new Date());
const parseISO = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const fmtDate = (s) => { const d = parseISO(s); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`; };
const fmtShort = (s) => { const d = parseISO(s); return `${d.getDate()}.${d.getMonth() + 1}`; };
const dayName = (s) => 'יום ' + DAY_NAMES[parseISO(s).getDay()];
const daysAgo = (s) => Math.round((parseISO(todayISO()) - parseISO(s)) / 86400000);
function rel(s) {
  const n = daysAgo(s);
  if (n === 0) return 'היום';
  if (n === 1) return 'אתמול';
  if (n === 2) return 'שלשום';
  if (n > 2) return `לפני ${n} ימים`;
  return fmtDate(s);
}
const n = (v) => String(Math.round(v * 100) / 100);
function num(v) {
  const s = String(v ?? '').replace(',', '.').trim();
  if (s === '') return null;
  const x = parseFloat(s);
  return Number.isFinite(x) && x >= 0 ? x : null;
}
const fmtTime = (sec) => `${Math.floor(sec / 60)}:${pad(Math.round(sec % 60))}`;

/* ---------- נתונים ---------- */
const sorted = () => db.sessions.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : String(b.id).localeCompare(String(a.id))));
const exDef = (id, entry) => db.exercises[id] || { id, name: (entry && entry.name) || 'תרגיל שנמחק', kind: 'weight', sets: 3, reps: '', tips: [] };
function lastPerf(exId, skipId) {
  for (const s of sorted()) {
    if (s.id === skipId) continue;
    const e = s.ex && s.ex[exId];
    if (e && ((e.sets && e.sets.length) || e.note)) return { date: s.date, sets: e.sets || [], note: e.note || '' };
  }
  return null;
}
function nextPlan() {
  const keys = Object.keys(db.plans);
  const last = sorted()[0];
  if (!last) return keys[0];
  const i = keys.indexOf(last.plan);
  return keys[(i + 1) % keys.length];
}
const weightsSorted = () => db.weights.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
const round1 = (x) => Math.round(x * 10) / 10;
function weightDelta(a, b) {
  const d = round1(b - a);
  if (d === 0) return 'ללא שינוי';
  return `${d > 0 ? 'עלייה' : 'ירידה'} של ${n(Math.abs(d))} ${KG}`;
}
const lpOf = (id) => lastPerf(id, draft && draft.editId ? draft.editId : undefined);
const pairsOf = (list) => { const out = []; for (let i = 0; i < list.length; i += 2) out.push(list.slice(i, i + 2)); return out; };

const LOCAL = new Set(LOCAL_IMAGES.map((x) => x[0]));
const imgSrc = (key, i) => (LOCAL.has(key) ? `img/${key}_${i}.jpg` : `${REMOTE_IMG_BASE}${encodeURIComponent(key)}/${i}.jpg`);
function thumb(ex, cls = '') {
  if (ex && ex.img) return `<img class="thumb ${cls}" src="${esc(imgSrc(ex.img, 0))}" alt="" loading="lazy" onerror="imgFail(this)">`;
  return `<span class="thumb ${cls}">${IC.bell}</span>`;
}
window.imgFail = (el) => { const s = document.createElement('span'); s.className = el.className; s.innerHTML = IC.bell; el.replaceWith(s); };

/* ---------- ניסוח סטים ---------- */
const unitW = (ex) => (ex.perSide ? `${KG} תוספת בכל צד` : KG);
const unitR = (ex) => (ex.kind === 'time' ? 'שניות' : 'חזרות');
const fmtW = (ex, w) => (ex.perSide ? (w === 0 ? 'מוט ריק' : `מוט + ${n(w)} לצד`) : `${n(w)} ${KG}`);
function fmtSet(ex, s) {
  if (ex.kind === 'time') return s.r != null ? `${n(s.r)} שנ'` : 'בוצע';
  if (ex.kind === 'body' || s.w == null) return s.r != null ? `${n(s.r)} חזרות` : 'בוצע';
  return s.r != null ? `${fmtW(ex, s.w)} × ${n(s.r)}` : fmtW(ex, s.w);
}
function sumSets(ex, sets) {
  if (!sets || !sets.length) return '';
  const a = sets[0];
  const same = sets.every((s) => s.w === a.w && s.r === a.r);
  if (!same) return sets.map((s) => fmtSet(ex, s)).join(', ');
  const c = sets.length;
  if (ex.kind === 'time') return a.r != null ? `${L(c + '×' + n(a.r))} שנ'` : 'בוצע';
  if (ex.kind === 'body' || a.w == null) return a.r != null ? L(c + '×' + n(a.r)) : 'בוצע';
  if (a.r == null) return fmtW(ex, a.w) + (c > 1 ? ` · ${c} סטים` : '');
  return `${fmtW(ex, a.w)} · ${L(c + '×' + n(a.r))}`;
}
const specTxt = (ex) => `${L(esc(ex.sets) + '×' + esc(ex.reps))}${ex.kind === 'time' ? " שנ'" : ''}`;
function metric(ex, sets) {
  const f = ex.kind === 'weight' ? 'w' : 'r';
  const vals = (sets || []).map((s) => s[f]).filter((x) => x != null);
  return vals.length ? Math.max(...vals) : null;
}
const metricTxt = (ex, v) => (ex.kind === 'weight' ? (ex.perSide ? `${n(v)} לצד` : `${n(v)} ${KG}`) : ex.kind === 'time' ? `${n(v)} שנ'` : `${n(v)} חזרות`);

/* ---------- הודעה קופצת, רטט וצליל ---------- */
let toastT;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2400);
}
const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* אין רטט */ } };
let actx = null;
document.addEventListener('pointerdown', () => {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = actx || new AC();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { /* אין שמע */ }
}, { passive: true });
function tone(freq, dur, when = 0, vol = 0.25) {
  if (!actx || !db.settings.sound) return;
  try {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.frequency.value = freq;
    o.connect(g); g.connect(actx.destination);
    const t = actx.currentTime + when;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) { /* מתעלמים */ }
}

/* ---------- טיימר ---------- */
let T = null;
let tInt = null;
let tEndT = null;
function startTimer(sec, label, onDone) {
  clearTimeout(tEndT);
  T = { end: Date.now() + sec * 1000, total: sec, label, onDone, lastSec: null };
  const el = $('#timer');
  el.classList.remove('end');
  el.hidden = false;
  $('#t-label').textContent = label;
  document.body.classList.add('has-timer');
  clearInterval(tInt);
  tInt = setInterval(tick, 200);
  tick();
}
function tick() {
  if (!T) return;
  const left = (T.end - Date.now()) / 1000;
  if (left <= 0) return timerFinish();
  const s = Math.ceil(left);
  if (s !== T.lastSec) {
    T.lastSec = s;
    $('#t-time').textContent = fmtTime(s);
    if (s <= 3) tone(660, 0.07, 0, 0.15);
  }
  $('#t-fill').style.width = Math.max(0, Math.min(100, (left / T.total) * 100)) + '%';
}
function timerFinish() {
  const cb = T && T.onDone;
  T = null;
  clearInterval(tInt);
  tone(880, 0.18, 0); tone(880, 0.18, 0.25); tone(1320, 0.45, 0.5);
  buzz([220, 120, 220, 120, 400]);
  if (cb) { hideTimer(); cb(); return; }
  const el = $('#timer');
  el.classList.add('end');
  $('#t-label').textContent = 'המנוחה נגמרה';
  $('#t-time').textContent = 'קדימה';
  $('#t-fill').style.width = '0%';
  tEndT = setTimeout(hideTimer, 2600);
}
function hideTimer() {
  clearTimeout(tEndT);
  $('#timer').hidden = true;
  $('#timer').classList.remove('end');
  document.body.classList.remove('has-timer');
}
function stopTimer() { T = null; clearInterval(tInt); hideTimer(); }

/* ---------- חלון תחתון ---------- */
let sheetOpen = false;
let afterClose = null;
function openSheet(html, cls = '') {
  const el = $('#sheet');
  el.innerHTML = `<div class="sheet-bg" data-act="closeSheet"></div><div class="sheet-panel ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  el.hidden = false;
  document.body.classList.add('noscroll');
  if (!sheetOpen) { sheetOpen = true; history.pushState({ sheet: true }, ''); }
}
function teardownSheet() {
  sheetOpen = false;
  ui.sheetEx = null;
  ui.form = null;
  const el = $('#sheet');
  el.hidden = true;
  el.innerHTML = '';
  document.body.classList.remove('noscroll');
}
function closeSheet(then) {
  if (!sheetOpen) { if (then) then(); return; }
  afterClose = then || null;
  history.back(); // popstate יסגור בפועל
}
window.addEventListener('popstate', () => {
  if (sheetOpen) {
    teardownSheet();
    const f = afterClose; afterClose = null;
    if (f) f();
  }
});
let confirmCb = null;
function confirmSheet({ title, text, ok, danger, onOk }) {
  confirmCb = onOk;
  openSheet(`<div class="grab"></div><div class="confirm"><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}
    <button type="button" class="btn big ${danger ? 'danger' : 'primary'}" data-act="confirmOk">${esc(ok)}</button>
    <button type="button" class="btn ghost" data-act="closeSheet">ביטול</button></div>`);
}

/* ---------- ניווט ---------- */
function go(h) { if (location.hash === h) render(); else location.hash = h; }
function route() { const p = (location.hash || '#/').slice(2).split('/'); return { name: p[0] || 'home', a: p[1], b: p[2] }; }
window.addEventListener('hashchange', () => { if (sheetOpen) teardownSheet(); render(); });

function render() {
  const r = route();
  if (r.name === 'w' && !draft) { location.replace('#/'); return; }
  let html;
  let tab = 'home';
  if (r.name === 'w') html = viewWorkout();
  else if (r.name === 'done') html = viewDone(r.a);
  else if (r.name === 'log') { html = viewLog(); tab = 'log'; }
  else if (r.name === 'set') { html = r.a === 'plan' && db.plans[r.b] ? viewPlan(r.b) : viewSettings(); tab = 'set'; }
  else html = viewHome();
  const app = $('#app');
  app.innerHTML = html;
  app.style.animation = 'none'; void app.offsetWidth; app.style.animation = '';
  $$('#nav a').forEach((a) => {
    a.classList.toggle('on', a.dataset.tab === tab);
    a.classList.toggle('live', a.dataset.tab === 'home' && !!draft && r.name !== 'w');
  });
  window.scrollTo(0, 0);
  if (r.name === 'w') updateProgress();
  if (r.name === 'log') drawChart();
  wake(r.name === 'w');
}

/* ---------- בית ---------- */
function viewHome() {
  const ss = sorted();
  const last = ss[0];
  const next = nextPlan();
  const today = todayISO();
  const d = new Date();
  let h = `<header class="top"><div><p class="eyebrow">${dayName(today)}, ${d.getDate()}.${d.getMonth() + 1}</p><h1>${draft ? 'ממשיכים?' : 'מה מתאמנים היום?'}</h1></div></header>`;
  if (draft) {
    const p = db.plans[draft.plan];
    const pr = progress();
    h += `<button type="button" class="resume p${esc(draft.plan)}" data-act="resume"><span class="pulse"></span><span><b>${draft.editId ? 'עריכת ' : ''}${esc(p ? p.name : 'אימון')} באמצע</b>${draft.editId ? fmtDate(draft.date) : `${pr.done} מתוך ${pr.total} סטים`}</span><span class="go">המשך</span></button>`;
  }
  h += '<div class="plans">';
  for (const [pid, p] of Object.entries(db.plans)) {
    const isNext = pid === next;
    h += `<button type="button" class="plan-btn p${esc(pid)} ${isNext ? 'next' : ''}" data-act="start" data-plan="${esc(pid)}">
      ${isNext ? '<span class="badge">הבא בתור</span>' : ''}
      <span class="letter">${esc(pid)}</span>
      <span class="pname">${esc(p.sub || p.name)}</span>
      <span class="pmeta">${p.list.length} תרגילים${p.runMin ? ` · ריצה ${n(p.runMin)} דק'` : ''}</span>
    </button>`;
  }
  h += '</div>';

  // השבוע
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  h += '<section class="card"><h3>השבוע</h3><div class="week">';
  for (let i = 0; i < 7; i++) {
    const day = iso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    const s = ss.find((x) => x.date === day);
    h += `<div class="day ${s ? 'did p' + esc(s.plan) : ''} ${day === today ? 'today' : ''}"><i>${s ? esc(s.plan) : ''}</i>${DAY_LETTERS[i]}</div>`;
  }
  h += '</div></section>';

  if (last) {
    const p = db.plans[last.plan];
    h += `<a class="card last p${esc(last.plan)}" href="#/log">
      <p class="eyebrow">האימון האחרון · ${rel(last.date)}</p>
      <h3>${esc(p ? p.name : 'אימון ' + last.plan)}<span class="muted small">${fmtDate(last.date)}</span></h3>
      ${p && p.sub ? `<p class="muted small">${esc(p.sub)}</p>` : ''}
      <div class="kv">${last.feel ? `<span class="tag ok">הרגיש ${esc(last.feel)}</span>` : ''}${runTags(last.run)}</div>
      ${sessLines(last, 4)}
    </a>`;
  } else {
    h += '<section class="card"><h3>עוד אין אימונים</h3><p class="muted">בוחרים אימון למעלה ומתחילים.</p></section>';
  }

  h += weightCard();
  const month = today.slice(0, 7);
  const weekStart = iso(start);
  h += `<div class="stats">
    <div class="stat"><b>${ss.filter((s) => s.date >= weekStart && s.date <= today).length}</b><span>אימונים השבוע</span></div>
    <div class="stat"><b>${ss.filter((s) => s.date.slice(0, 7) === month).length}</b><span>אימונים החודש</span></div>
    <div class="stat"><b>${ss.length}</b><span>סך הכול</span></div>
  </div>`;
  h += syncNotice();
  if (needsBackup()) h += '<a class="card small muted" href="#/set">עבר זמן מאז הגיבוי האחרון. כדאי לייצא גיבוי במסך ההגדרות.</a>';
  return h;
}
function weightCard() {
  const ws = weightsSorted();
  if (!ws.length) {
    return `<section class="card"><h3>משקל גוף</h3><p class="muted small">עוד אין שקילות. כדאי להתחיל לתעד, ואחרי כמה שבועות יופיע גרף.</p>
      <button type="button" class="btn line" style="margin-top:12px" data-act="weighSheet">${IC.plus} שקילה ראשונה</button></section>`;
  }
  const l = ws[ws.length - 1];
  const p = ws[ws.length - 2];
  return `<section class="card"><h3>משקל גוף<span class="muted small">${rel(l.date)}</span></h3>
    <div class="row" style="align-items:baseline;gap:8px;flex-wrap:wrap"><b style="font-size:32px;line-height:1">${n(l.kg)}</b><span class="muted">${KG}</span>${p ? `<span class="tag plain">${weightDelta(p.kg, l.kg)} מהשקילה הקודמת</span>` : ''}</div>
    <div class="row" style="margin-top:12px"><button type="button" class="btn sm line" style="flex:1" data-act="weighSheet">${IC.plus} שקילה חדשה</button><button type="button" class="btn sm ghost" style="flex:1" data-act="weightChart">לגרף</button></div></section>`;
}
function weighList() {
  const rows = weightsSorted().slice(-8).reverse();
  if (!rows.length) return '<div class="item"><span class="muted">עוד אין שקילות.</span></div>';
  return rows.map((w) => `<div class="item"><span class="t"><b>${n(w.kg)} ${KG}</b><span>${dayName(w.date)}, ${fmtDate(w.date)}</span></span><button type="button" class="icon-btn" data-act="delWeight" data-id="${esc(w.id)}" aria-label="מחק שקילה">${IC.trash}</button></div>`).join('');
}
function weighSheet() {
  const ws = weightsSorted();
  const last = ws[ws.length - 1];
  openSheet(`<div class="grab"></div>
    <div class="sheet-h"><h2>שקילה</h2><button type="button" class="icon-btn" data-act="closeSheet" aria-label="סגור">${IC.x}</button></div>
    <form id="weigh-form" autocomplete="off">
      <div class="stp"><div class="ctl">
        <button type="button" data-act="wstep" data-d="-0.1" aria-label="פחות">−</button>
        <input id="weigh-kg" name="kg" inputmode="decimal" value="${last ? n(last.kg) : ''}" placeholder="—" aria-label="משקל בקילוגרמים">
        <button type="button" data-act="wstep" data-d="0.1" aria-label="יותר">+</button>
      </div><span class="u">${KG}</span></div>
      <label class="date-row">תאריך<input type="date" name="date" value="${todayISO()}" max="${todayISO()}"></label>
      <div class="stack"><button type="submit" class="btn primary big">שמור שקילה</button></div>
    </form>
    <p class="sect">שקילות אחרונות</p>
    <div class="list" id="wlist">${weighList()}</div>`);
}
function saveWeigh(form) {
  const kg = num(form.elements.kg.value);
  const date = form.elements.date.value || todayISO();
  if (kg == null || kg < 20 || kg > 400) { toast('כדאי להזין משקל תקין בקילוגרמים'); return; }
  const kk = round1(kg);
  const ex = db.weights.find((w) => w.date === date);
  if (ex) ex.kg = kk; else db.weights.push({ id: 'w' + Date.now().toString(36), date, kg: kk });
  save();
  closeSheet(() => { render(); toast('השקילה נשמרה'); });
}
function needsBackup() {
  if (typeof syncReady === 'function' && syncReady()) return false;
  if (db.sessions.length < 4) return false;
  if (!db.lastBackup) return true;
  return daysAgo(db.lastBackup) > 21;
}
function runTags(run) {
  if (!run) return '';
  let h = '';
  if (run.sec) h += `<span class="tag plain">ריצה ${fmtTime(run.sec)}</span>`;
  if (run.km) h += `<span class="tag plain">${n(run.km)} ק"מ</span>`;
  if (run.kcal) h += `<span class="tag plain">${n(run.kcal)} קק"ל</span>`;
  return h;
}
function sessLines(s, max) {
  const plan = db.plans[s.plan];
  const order = plan ? plan.list.filter((id) => s.ex[id]) : [];
  const ids = [...order, ...Object.keys(s.ex).filter((id) => !order.includes(id))];
  if (!ids.length) return '';
  const shown = max ? ids.slice(0, max) : ids;
  let h = '<ul class="lines">';
  for (const id of shown) {
    const e = s.ex[id];
    const ex = exDef(id, e);
    const txt = [sumSets(ex, e.sets), esc(e.note)].filter(Boolean).join(' · ');
    h += `<li><span>${esc(ex.name)}</span><span>${txt}</span></li>`;
  }
  if (max && ids.length > max) h += `<li><span class="muted">ועוד ${ids.length - max} תרגילים</span><span></span></li>`;
  return h + '</ul>';
}

/* ---------- אימון ---------- */
function makeSets(id) {
  const ex = db.exercises[id];
  const lp = lastPerf(id);
  const ls = (lp && lp.sets) || [];
  const out = [];
  for (let i = 0; i < (ex.sets || 1); i++) {
    const l = ls[i] || ls[ls.length - 1];
    let w = null;
    if (ex.kind === 'weight') w = l && l.w != null ? l.w : (ex.goalW != null ? ex.goalW : null);
    out.push({ w, r: ex.repsDef != null ? ex.repsDef : null, done: false });
  }
  return out;
}
function startWorkout(pid) {
  const plan = db.plans[pid];
  if (!plan) return;
  draft = { plan: pid, startedAt: Date.now(), date: todayISO(), list: plan.list.slice(), ex: {}, run: { min: '', sec: '', km: '', kcal: '' }, feel: '', note: '' };
  for (const id of draft.list) draft.ex[id] = { sets: makeSets(id), note: '' };
  ui.openPairs = new Set();
  stopTimer();
  saveDraft();
  go('#/w');
}
function editSession(sid) {
  const s = db.sessions.find((x) => x.id === sid);
  if (!s) return;
  const plan = db.plans[s.plan];
  const list = plan ? plan.list.slice() : [];
  for (const id of Object.keys(s.ex)) if (!list.includes(id) && db.exercises[id]) list.push(id);
  const run = s.run || {};
  draft = {
    plan: s.plan, editId: s.id, startedAt: Date.now(), date: s.date, list, ex: {},
    run: {
      min: run.sec ? String(Math.floor(run.sec / 60)) : '', sec: run.sec ? String(Math.round(run.sec % 60)) : '',
      km: run.km != null ? n(run.km) : '', kcal: run.kcal != null ? n(run.kcal) : '',
    },
    feel: s.feel || '', note: s.note || '',
  };
  for (const id of list) {
    const e = s.ex[id];
    const sets = ((e && e.sets) || []).map((x) => ({ w: x.w != null ? x.w : null, r: x.r != null ? x.r : null, done: true }));
    const fill = makeSets(id);
    for (let i = sets.length; i < fill.length; i++) sets.push(fill[i]);
    draft.ex[id] = { sets, note: (e && e.note) || '' };
  }
  ui.openPairs = new Set(pairsOf(list).map((_, i) => i));
  stopTimer();
  saveDraft();
  go('#/w');
}
function progress() {
  let total = 0, done = 0;
  if (draft) for (const id of draft.list) for (const s of draft.ex[id].sets) { total++; if (s.done) done++; }
  return { total, done };
}
const exFinished = (id) => draft.ex[id].sets.every((s) => s.done);
function currentPair() {
  const ps = pairsOf(draft.list);
  return ps.findIndex((ids) => !ids.every(exFinished));
}
function updateProgress() {
  const pr = progress();
  const f = $('#w-fill');
  if (f) f.style.width = (pr.total ? (pr.done / pr.total) * 100 : 0) + '%';
  const t = $('#w-txt');
  if (t) t.textContent = `${pr.done}/${pr.total} סטים`;
}

function viewWorkout() {
  const plan = db.plans[draft.plan] || { name: 'אימון', sub: '' };
  return `<div class="p${esc(draft.plan)}">
    <header class="w-head">
      <div class="row">
        <a class="icon-btn" href="#/" aria-label="חזרה לבית">${IC.back}</a>
        <h1 style="flex:1">${draft.editId ? 'עריכת ' : ''}${esc(plan.name)}<small>${draft.editId ? fmtDate(draft.date) : esc(plan.sub || '')}</small></h1>
        <span class="prog-txt" id="w-txt"></span>
      </div>
      <div class="prog"><i id="w-fill"></i></div>
    </header>
    <div id="pairs">${pairsHtml()}</div>
    <div id="finish">
      <section class="card">
        <h3>ריצה${plan.runMin ? `<span class="muted small">יעד: ${n(plan.runMin)} דקות</span>` : ''}</h3>
        <div class="run-grid">
          <label>זמן
            <span class="time-in">
              <input inputmode="numeric" placeholder="דק'" aria-label="דקות" data-in="run" data-f="min" value="${esc(draft.run.min)}">
              <b>:</b>
              <input inputmode="numeric" placeholder="שנ'" aria-label="שניות" data-in="run" data-f="sec" value="${esc(draft.run.sec)}">
            </span>
          </label>
          <label>ק"מ<input inputmode="decimal" placeholder="0.00" data-in="run" data-f="km" value="${esc(draft.run.km)}"></label>
          <label>קק"ל<input inputmode="numeric" placeholder="0" data-in="run" data-f="kcal" value="${esc(draft.run.kcal)}"></label>
        </div>
      </section>
      <section class="card">
        <h3>איך הרגיש?</h3>
        <div class="chips" id="feels">${feelChips()}</div>
        <label class="field">הערות<textarea data-in="note" placeholder="משהו שכדאי לזכור לפעם הבאה">${esc(draft.note)}</textarea></label>
        <label class="date-row">תאריך האימון<input type="date" data-in="date" value="${esc(draft.date)}" max="${todayISO()}"></label>
      </section>
      <div class="stack">
        <button type="button" class="btn primary big" data-act="saveWorkout">${IC.check} ${draft.editId ? 'שמור שינויים' : 'שמור אימון'}</button>
        <button type="button" class="btn ghost" data-act="cancelWorkout">${draft.editId ? 'בטל עריכה' : 'בטל את האימון'}</button>
      </div>
    </div>
  </div>`;
}
const feelChips = () => FEELS.map((f) => `<button type="button" class="chip ${draft.feel === f ? 'on' : ''}" data-act="feel" data-v="${f}">${f}</button>`).join('');

function pairsHtml() {
  const ps = pairsOf(draft.list);
  const cur = currentPair();
  return ps.map((ids, pi) => {
    const fin = ids.every(exFinished);
    const open = pi === cur || ui.openPairs.has(pi);
    const rounds = Math.max(...ids.map((id) => draft.ex[id].sets.length));
    let dots = '';
    let doneRounds = 0;
    for (let r = 0; r < rounds; r++) {
      const ok = ids.every((id) => { const s = draft.ex[id].sets; return r >= s.length || s[r].done; });
      if (ok) doneRounds++;
      dots += `<i class="${ok ? 'on' : ''}"></i>`;
    }
    const state = fin ? 'הושלם' : open ? `סבב ${Math.min(doneRounds + 1, rounds)} מתוך ${rounds}` : 'פתח';
    return `<section class="pair ${fin ? 'done' : ''} ${pi === cur ? 'cur' : ''}" id="pair-${pi}">
      <button type="button" class="pair-h" data-act="togglePair" data-pi="${pi}">
        <span>${ids.length > 1 ? 'זוג' : 'תרגיל'} ${pi + 1}</span>
        <span class="state">${state}<span class="dots">${dots}</span></span>
      </button>
      ${ids.map((id) => exRow(id, open)).join('<div class="plus"></div>')}
    </section>`;
  }).join('');
}
function lastTxt(id) {
  const lp = lpOf(id);
  if (!lp) return '';
  const ex = exDef(id);
  const t = [sumSets(ex, lp.sets), esc(lp.note)].filter(Boolean).join(' · ');
  return t ? `פעם קודמת: ${t}` : '';
}
function exRow(id, open) {
  const ex = exDef(id);
  const d = draft.ex[id];
  const ci = d.sets.findIndex((s) => !s.done);
  const fin = ci < 0;
  const last = lastTxt(id);
  let h = `<div class="ex ${fin ? 'fin' : ''}" data-exrow="${esc(id)}">
    <button type="button" class="ex-h" data-act="openEx" data-ex="${esc(id)}">
      ${thumb(ex)}
      <span class="t"><b>${esc(ex.name)}</b><span>${specTxt(ex)}${ex.target ? ` · יעד: ${esc(ex.target)}` : ''}</span>${last ? `<span>${last}</span>` : ''}</span>
      <span class="chev">${IC.chev}</span>
    </button>`;
  if (fin) h += `<div class="ex-sum"><span class="tag ok">בוצע</span>${sumSets(ex, d.sets)}</div>`;
  else if (open) h += easyHint(id) + setLine(id, ci);
  return h + '</div>';
}
function easyHint(id) {
  if (draft && draft.editId) return '';
  const lp = lpOf(id);
  if (!lp || !/קל/.test(lp.note) || /לא קל/.test(lp.note)) return '';
  const ex = exDef(id);
  return `<p class="hint"><span class="tag warn">בפעם הקודמת היה קל, אפשר להעלות ${ex.kind === 'weight' ? 'משקל' : ex.kind === 'time' ? 'זמן' : 'חזרות'}</span></p>`;
}
function stepper(id, i, f) {
  const ex = exDef(id);
  const s = draft.ex[id].sets[i];
  const v = s[f];
  const unit = f === 'w' ? unitW(ex) : unitR(ex);
  const a = `data-ex="${esc(id)}" data-i="${i}" data-f="${f}"`;
  return `<div class="stp"><div class="ctl">
    <button type="button" data-act="step" ${a} data-d="-1" aria-label="פחות ${unit}">−</button>
    <input inputmode="${f === 'w' ? 'decimal' : 'numeric'}" data-in="set" ${a} value="${v == null ? '' : n(v)}" placeholder="—" aria-label="${esc(unit)}" autocomplete="off">
    <button type="button" data-act="step" ${a} data-d="1" aria-label="יותר ${unit}">+</button>
  </div><span class="u">${unit}</span></div>`;
}
function setLine(id, i) {
  const ex = exDef(id);
  const total = draft.ex[id].sets.length;
  const a = `data-ex="${esc(id)}" data-i="${i}"`;
  const steppers = `<div class="steppers">${ex.kind === 'weight' ? stepper(id, i, 'w') : ''}${stepper(id, i, 'r')}</div>`;
  const btn = ex.kind === 'time'
    ? `<div class="do-row"><button type="button" class="do" data-act="playSet" ${a}>${IC.play} התחל ספירה, סט ${i + 1} מתוך ${total}</button><button type="button" class="do alt" data-act="doneSet" ${a} aria-label="סמן כבוצע בלי ספירה">${IC.check}</button></div>`
    : `<button type="button" class="do" data-act="doneSet" ${a}>${IC.check} סיימתי סט ${i + 1} מתוך ${total}</button>`;
  return `<div class="setline">${steppers}${btn}</div>`;
}

function setValue(id, i, f, v) {
  const d = draft.ex[id];
  if (!d || !d.sets[i]) return;
  d.sets[i][f] = v;
  if (f === 'w') for (let j = i + 1; j < d.sets.length; j++) if (!d.sets[j].done) d.sets[j].w = v; // משקל חדש ממשיך לסטים הבאים
  saveDraft();
}
function syncInputs(id, except) {
  const d = draft.ex[id];
  $$(`input[data-in="set"][data-ex="${CSS.escape(id)}"]`).forEach((el) => {
    if (el === except) return;
    const s = d.sets[+el.dataset.i];
    if (!s) return;
    const v = s[el.dataset.f];
    el.value = v == null ? '' : n(v);
  });
}
function refreshWorkout(popId) {
  const box = $('#pairs');
  if (box) {
    box.innerHTML = pairsHtml();
    if (popId) { const el = $(`[data-exrow="${CSS.escape(popId)}"]`, box); if (el) el.classList.add('pop'); }
  }
  updateProgress();
  if (ui.sheetEx) { const s = $('#sx-sets'); if (s) s.innerHTML = sheetSets(ui.sheetEx); }
}
function markDone(id, i) {
  const d = draft.ex[id];
  const s = d && d.sets[i];
  if (!s || s.done) return;
  const ex = exDef(id);
  if (s.r == null && ex.repsDef != null) s.r = ex.repsDef;
  const before = currentPair();
  s.done = true;
  saveDraft();
  buzz(15);
  refreshWorkout(id);

  const ps = pairsOf(draft.list);
  const pi = ps.findIndex((ids) => ids.includes(id));
  const roundDone = ps[pi].every((x) => { const ss = draft.ex[x].sets; return i >= ss.length || ss[i].done; });
  if (draft.editId) return;
  const pr = progress();
  if (pr.done === pr.total) {
    stopTimer();
    toast('כל התרגילים הושלמו. נשארה הריצה');
    if (!sheetOpen) { const f = $('#finish'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    return;
  }
  if (roundDone) startTimer(db.settings.rest || 60, 'מנוחה');
  const after = currentPair();
  if (after !== before && after >= 0 && !sheetOpen) {
    const el = $('#pair-' + after);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }
}

/* מסך תרגיל: תמונה גדולה, דגשים, ואז הסטים */
function exSheet(id, withSets) {
  const ex = exDef(id);
  const lp = lpOf(id);
  ui.sheetEx = withSets ? id : null;
  const imgs = ex.img
    ? `<img src="${esc(imgSrc(ex.img, 0))}" alt="${esc(ex.name)}, תנוחת התחלה" onerror="this.remove()"><img class="f2" src="${esc(imgSrc(ex.img, 1))}" alt="${esc(ex.name)}, תנוחת סיום" onerror="this.remove()"><span class="cap">התחלה וסיום · נגיעה עוצרת</span>`
    : '';
  let h = `<div class="grab"></div>
    <div class="sheet-h"><div><h2>${esc(ex.name)}</h2><p class="muted small">${specTxt(ex)}${ex.muscles && ex.muscles.p && ex.muscles.p.length ? ` · ${esc(muscleNames(ex.muscles.p))}` : ''}${ex.target ? ` · יעד: ${esc(ex.target)}` : ''}</p></div>
      <button type="button" class="icon-btn" data-act="closeSheet" aria-label="סגור">${IC.x}</button></div>
    <div class="anim" data-act="toggleAnim"><span class="ph">${IC.bell}</span>${imgs}</div>`;
  if (ex.tips && ex.tips.length) h += `<section class="card"><h3>דגשים</h3><ul class="tips">${ex.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>`;
  h += muscleCard(ex.muscles);
  if (lp) {
    h += `<section class="card"><h3>פעם קודמת<span class="muted small">${rel(lp.date)}</span></h3>
      <p>${sumSets(ex, lp.sets) || 'בוצע'}${lp.note ? ` · ${esc(lp.note)}` : ''}</p>${withSets ? easyHint(id) : ''}</section>`;
  }
  if (withSets) {
    const d = draft.ex[id];
    h += `<section class="card"><h3>הסטים של היום</h3><div id="sx-sets">${sheetSets(id)}</div></section>
      <section class="card"><h3>איך היה התרגיל?</h3>
        <div class="chips" id="sx-feels">${exFeelChips(id)}</div>
        <label class="field">הערה<input type="text" data-in="exnote" data-ex="${esc(id)}" value="${esc(d.note)}" placeholder="לדוגמה: מאתגר בסוף" autocomplete="off"></label>
      </section>`;
  }
  h += `<div class="stack"><button type="button" class="btn primary big" data-act="closeSheet">${withSets ? 'חזרה לאימון' : 'סגור'}</button></div>`;
  return h;
}
const exFeelChips = (id) => EX_FEELS.map((f) => `<button type="button" class="chip ${draft.ex[id].note === f ? 'on' : ''}" data-act="exFeel" data-ex="${esc(id)}" data-v="${f}">${f}</button>`).join('');
function miniInput(id, i, f) {
  const ex = exDef(id);
  const v = draft.ex[id].sets[i][f];
  const unit = f === 'w' ? (ex.perSide ? KG + ' לצד' : KG) : (ex.kind === 'time' ? "שנ'" : 'חזרות');
  return `<label class="mini"><input inputmode="${f === 'w' ? 'decimal' : 'numeric'}" data-in="set" data-ex="${esc(id)}" data-i="${i}" data-f="${f}" value="${v == null ? '' : n(v)}" placeholder="—" autocomplete="off"><span>${unit}</span></label>`;
}
function sheetSets(id) {
  const ex = exDef(id);
  const d = draft.ex[id];
  let h = d.sets.map((s, i) => `<div class="srow ${s.done ? 'done' : ''}">
      <span class="n">${i + 1}</span>
      ${ex.kind === 'weight' ? miniInput(id, i, 'w') : ''}${miniInput(id, i, 'r')}
      <button type="button" class="tick" data-act="toggleSet" data-ex="${esc(id)}" data-i="${i}" aria-label="${s.done ? 'בטל סימון סט' : 'סמן סט כבוצע'}" aria-pressed="${s.done}">${IC.check}</button>
    </div>`).join('');
  const ni = d.sets.findIndex((s) => !s.done);
  if (ni >= 0) {
    const a = `data-ex="${esc(id)}" data-i="${ni}"`;
    h += ex.kind === 'time'
      ? `<div class="do-row" style="margin-top:12px"><button type="button" class="do" data-act="playSet" ${a}>${IC.play} התחל ספירה, סט ${ni + 1}</button><button type="button" class="do alt" data-act="doneSet" ${a} aria-label="סמן כבוצע בלי ספירה">${IC.check}</button></div>`
      : `<button type="button" class="do" style="margin-top:12px" data-act="doneSet" ${a}>${IC.check} סיימתי סט ${ni + 1} מתוך ${d.sets.length}</button>`;
  } else {
    h += '<p class="ex-sum" style="margin-top:12px"><span class="tag ok">כל הסטים בוצעו</span></p>';
  }
  h += '<div class="row" style="margin-top:10px">';
  h += `<button type="button" class="btn sm line" data-act="addSet" data-ex="${esc(id)}">${IC.plus} הוסף סט</button>`;
  if (d.sets.length > 1) h += `<button type="button" class="btn sm ghost" data-act="rmSet" data-ex="${esc(id)}">הסר סט אחרון</button>`;
  return h + '</div>';
}

function saveWorkout(force) {
  const s = { id: 's' + Date.now(), date: draft.date || todayISO(), plan: draft.plan, ex: {}, run: null, feel: draft.feel, note: (draft.note || '').trim() };
  let undone = 0;
  for (const id of draft.list) {
    const d = draft.ex[id];
    const sets = d.sets.filter((x) => x.done).map((x) => (x.w != null ? { w: x.w, r: x.r } : { r: x.r }));
    undone += d.sets.length - sets.length;
    if (sets.length || d.note) s.ex[id] = { name: exDef(id).name, sets, note: d.note || '' };
  }
  const sec = (num(draft.run.min) || 0) * 60 + (num(draft.run.sec) || 0);
  const km = num(draft.run.km);
  const kcal = num(draft.run.kcal);
  if (sec || km || kcal) s.run = { sec: sec || null, km, kcal };
  if (!Object.keys(s.ex).length && !s.run) { toast('עוד לא סומן אף סט ולא הוזנה ריצה'); return; }
  if (undone && !force && !draft.editId) {
    confirmSheet({ title: 'לשמור בלי כל הסטים?', text: `נשארו ${undone} סטים שלא סומנו. הם לא יירשמו ביומן.`, ok: 'שמור בכל זאת', onOk: () => saveWorkout(true) });
    return;
  }
  if (draft.editId) {
    const i = db.sessions.findIndex((x) => x.id === draft.editId);
    s.id = draft.editId;
    if (i >= 0) { if (db.sessions[i].dur) s.dur = db.sessions[i].dur; db.sessions[i] = s; } else db.sessions.push(s);
    save();
    draft = null;
    saveDraft();
    stopTimer();
    go('#/log');
    toast('האימון עודכן');
    return;
  }
  if (s.date === todayISO()) { const m = Math.round((Date.now() - draft.startedAt) / 60000); if (m > 0 && m < 300) s.dur = m; }
  db.sessions.push(s);
  save();
  draft = null;
  saveDraft();
  stopTimer();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* לא נתמך */ }
  go('#/done/' + s.id);
}

/* ---------- סיום ---------- */
function prevSessionWith(test, cur) {
  let seen = false;
  for (const s of sorted()) {
    if (s.id === cur.id) { seen = true; continue; }
    if (seen && test(s)) return s;
  }
  return null;
}
function viewDone(id) {
  const s = db.sessions.find((x) => x.id === id);
  if (!s) return viewHome();
  const plan = db.plans[s.plan];
  let sets = 0, vol = 0;
  const wins = [];
  for (const [eid, e] of Object.entries(s.ex)) {
    const ex = exDef(eid, e);
    sets += e.sets.length;
    for (const st of e.sets) if (st.w != null && st.r != null) vol += st.w * st.r * (ex.perSide ? 2 : 1);
    const m = metric(ex, e.sets);
    const prev = prevSessionWith((x) => x.ex[eid] && x.ex[eid].sets.length, s);
    if (m != null && prev) {
      const pm = metric(ex, prev.ex[eid].sets);
      if (pm != null && m > pm) wins.push(`<li><span>${esc(ex.name)}</span><span>${L(n(m) + ' ← ' + n(pm))} ${ex.kind === 'weight' ? (ex.perSide ? KG + ' לצד' : KG) : ex.kind === 'time' ? "שנ'" : 'חזרות'}</span></li>`);
    }
  }
  if (s.run) {
    const prev = prevSessionWith((x) => x.run, s);
    if (prev && s.run.sec && prev.run.sec && s.run.sec > prev.run.sec) wins.push(`<li><span>זמן ריצה</span><span>${L(fmtTime(s.run.sec) + ' ← ' + fmtTime(prev.run.sec))}</span></li>`);
    if (prev && s.run.km && prev.run.km && s.run.km > prev.run.km) wins.push(`<li><span>מרחק ריצה</span><span>${L(n(s.run.km) + ' ← ' + n(prev.run.km))} ק"מ</span></li>`);
  }
  const np = db.plans[nextPlan()];
  return `<div class="p${esc(s.plan)}">
    <div class="hero"><div class="ring">${IC.check}</div><h1>כל הכבוד</h1><p class="muted">${esc(plan ? plan.name : 'האימון')} נשמר ביומן</p></div>
    <div class="stats">
      <div class="stat"><b>${sets}</b><span>סטים</span></div>
      <div class="stat"><b>${vol ? n(Math.round(vol)) : '–'}</b><span>${KG} שהורמו</span></div>
      <div class="stat"><b>${s.dur ? s.dur : '–'}</b><span>דקות</span></div>
    </div>
    ${wins.length ? `<section class="card"><h3>שיפורים מהפעם הקודמת</h3><ul class="lines wins">${wins.join('')}</ul></section>` : ''}
    ${s.run ? `<section class="card"><h3>ריצה</h3><div class="kv">${runTags(s.run)}</div></section>` : ''}
    ${np ? `<section class="card"><p class="eyebrow">הבא בתור</p><h3>${esc(np.name)}<span class="muted small">${esc(np.sub || '')}</span></h3></section>` : ''}
    <div class="stack"><a class="btn primary big" href="#/">לדף הבית</a><a class="btn ghost" href="#/log">ליומן</a></div>
  </div>`;
}

/* ---------- יומן וגרפים ---------- */
function chartOptions() {
  const used = new Set();
  const groups = [];
  for (const [pid, p] of Object.entries(db.plans)) {
    const items = p.list.map((id) => { used.add(id); return [id, exDef(id).name]; });
    if (items.length) groups.push([p.name, items]);
  }
  const other = [];
  for (const s of db.sessions) for (const [id, e] of Object.entries(s.ex)) if (!used.has(id)) { used.add(id); other.push([id, exDef(id, e).name]); }
  if (other.length) groups.push(['תרגילים נוספים', other]);
  return groups;
}
function chartSeries(key) {
  if (key === 'body') return weightsSorted().map((w) => ({ d: w.date, v: w.kg }));
  const ss = sorted().reverse();
  const pts = [];
  for (const s of ss) {
    let v = null;
    if (key.startsWith('run:')) {
      if (!s.run) continue;
      const f = key.slice(4);
      if (f === 'sec') v = s.run.sec || null;
      else if (f === 'km') v = s.run.km || null;
      else if (f === 'pace') v = s.run.sec && s.run.km ? s.run.sec / s.run.km : null;
      else if (f === 'kcal') v = s.run.kcal || null;
    } else {
      const e = s.ex[key];
      if (!e || !e.sets.length) continue;
      v = metric(exDef(key, e), e.sets);
    }
    if (v != null) pts.push({ d: s.date, v });
  }
  return pts;
}
function chartMeta(key) {
  if (key === 'body') return { fmt: (v) => n(v), cap: 'משקל גוף (ק"ג)', color: 'var(--A)' };
  if (key === 'run:sec') return { fmt: fmtTime, cap: 'זמן ריצה (דקות)', color: 'var(--ok)' };
  if (key === 'run:km') return { fmt: (v) => n(v), cap: 'מרחק ריצה (ק"מ)', color: 'var(--ok)' };
  if (key === 'run:pace') return { fmt: fmtTime, cap: 'קצב ריצה (דקות לק"מ, נמוך יותר = מהיר יותר)', color: 'var(--ok)' };
  if (key === 'run:kcal') return { fmt: (v) => n(v), cap: 'קלוריות בריצה', color: 'var(--ok)' };
  const ex = exDef(key);
  const pid = Object.keys(db.plans).find((p) => db.plans[p].list.includes(key));
  const cap = ex.kind === 'weight' ? `המשקל הגבוה באימון (${ex.perSide ? KG + ' לכל צד' : KG})` : ex.kind === 'time' ? 'הזמן הארוך באימון (שניות)' : 'מספר החזרות הגבוה באימון';
  return { fmt: (v) => n(v), cap, color: pid === 'B' ? 'var(--B)' : 'var(--A)' };
}
function chartSvg(pts, meta) {
  const W = 340, H = 170, pl = 22, pr = 22, pt = 30, pb = 28;
  const vals = pts.map((p) => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo;
  lo -= span * 0.15; hi += span * 0.15;
  const x = (i) => (pts.length === 1 ? W / 2 : pl + (i * (W - pl - pr)) / (pts.length - 1));
  const y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const maxI = vals.indexOf(Math.max(...vals));
  const labelAll = pts.length <= 7;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(meta.cap)}" style="color:${meta.color}">`;
  s += `<line x1="${pl - 8}" y1="${H - pb + 6}" x2="${W - pr + 8}" y2="${H - pb + 6}" stroke="var(--line)" stroke-width="1"/>`;
  if (pts.length > 1) {
    s += `<polygon points="${x(0).toFixed(1)},${H - pb + 6} ${line} ${x(pts.length - 1).toFixed(1)},${H - pb + 6}" fill="currentColor" opacity=".1"/>`;
    s += `<polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  pts.forEach((p, i) => {
    const cx = x(i).toFixed(1), cy = y(p.v);
    s += `<circle cx="${cx}" cy="${cy.toFixed(1)}" r="4.5" fill="var(--card)" stroke="currentColor" stroke-width="2.5"/>`;
    const edge = i === 0 || i === pts.length - 1;
    if (labelAll || edge || i === maxI) s += `<text class="val" x="${cx}" y="${(cy - 10).toFixed(1)}" text-anchor="middle">${esc(meta.fmt(p.v))}</text>`;
    if (labelAll || edge) s += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${fmtShort(p.d)}</text>`;
  });
  return s + '</svg>';
}
function drawChart() {
  const box = $('#chart');
  if (!box) return;
  const key = ui.chartKey;
  const pts = chartSeries(key);
  const meta = chartMeta(key);
  if (!pts.length) { box.innerHTML = '<p class="chart-note">עוד אין נתונים למדד הזה. הוא יתמלא אחרי האימון הבא.</p>'; return; }
  let note = meta.cap;
  if (pts.length === 1) note += key === 'body' ? '. יש כרגע שקילה אחת, והקו יופיע מהשקילה הבאה.' : '. יש כרגע מדידה אחת, והקו יופיע מהאימון הבא.';
  else if (key === 'body') note += `. מאז ${fmtDate(pts[0].d)}: ${weightDelta(pts[0].v, pts[pts.length - 1].v)}`;
  box.innerHTML = `<div class="chart-wrap">${chartSvg(pts, meta)}</div><p class="chart-note">${esc(note)}</p>`;
}
function viewLog() {
  const ss = sorted();
  const runOpts = [['run:sec', 'זמן'], ['run:km', 'מרחק'], ['run:pace', 'קצב'], ['run:kcal', 'קלוריות']];
  const isRun = ui.chartKey.startsWith('run:');
  const isBody = ui.chartKey === 'body';
  let h = `<header class="top"><div><p class="eyebrow">${ss.length} אימונים</p><h1>יומן</h1></div></header>
    <section class="card" style="margin-top:0">
      <h3>התקדמות</h3>
      <div class="seg" style="margin-bottom:10px">
        <button type="button" class="${isRun ? 'on' : ''}" data-act="chartMode" data-v="run">ריצה</button>
        <button type="button" class="${!isRun && !isBody ? 'on' : ''}" data-act="chartMode" data-v="ex">תרגילים</button>
        <button type="button" class="${isBody ? 'on' : ''}" data-act="chartMode" data-v="body">משקל גוף</button>
      </div>`;
  if (isRun) {
    h += `<div class="chips">${runOpts.map(([k, l]) => `<button type="button" class="chip ${ui.chartKey === k ? 'on' : ''}" data-act="chartKey" data-v="${k}">${l}</button>`).join('')}</div>`;
  } else if (isBody) {
    h += `<button type="button" class="btn sm line" data-act="weighSheet">${IC.plus} שקילה חדשה</button>`;
  } else {
    h += `<select data-in="chartKey" aria-label="בחירת תרגיל">${chartOptions().map(([g, items]) => `<optgroup label="${esc(g)}">${items.map(([id, name]) => `<option value="${esc(id)}" ${ui.chartKey === id ? 'selected' : ''}>${esc(name)}</option>`).join('')}</optgroup>`).join('')}</select>`;
  }
  h += '<div id="chart"></div></section>';
  h += '<p class="sect">כל האימונים</p>';
  if (!ss.length) h += '<section class="card"><p class="muted">עוד אין אימונים ביומן.</p></section>';
  for (const s of ss) {
    const p = db.plans[s.plan];
    const bits = [];
    const cnt = Object.keys(s.ex).length;
    if (cnt) bits.push(`${cnt} תרגילים`);
    if (s.run && s.run.sec) bits.push(`ריצה ${fmtTime(s.run.sec)}`);
    if (s.feel) bits.push(esc(s.feel));
    h += `<details class="sess p${esc(s.plan)}">
      <summary><span class="let">${esc(s.plan)}</span><span class="t"><b>${dayName(s.date)}, ${fmtDate(s.date)}</b><span>${bits.join(' · ')}</span></span><span class="muted small">${rel(s.date)}</span></summary>
      <div class="body">
        ${p && p.sub ? `<p class="muted small" style="margin-top:12px">${esc(p.name)} · ${esc(p.sub)}</p>` : ''}
        ${sessLines(s)}
        ${s.run ? `<div class="kv">${runTags(s.run)}${s.run.sec && s.run.km ? `<span class="tag plain">קצב ${fmtTime(s.run.sec / s.run.km)} לק"מ</span>` : ''}</div>` : ''}
        ${s.dur ? `<p class="muted small" style="margin-top:10px">משך האימון: ${s.dur} דקות</p>` : ''}
        ${s.note ? `<p style="margin-top:10px">${esc(s.note)}</p>` : ''}
        <div class="row" style="margin-top:14px"><button type="button" class="btn sm line" data-act="editSession" data-id="${esc(s.id)}">${IC.edit} ערוך</button><button type="button" class="btn sm danger" data-act="delSession" data-id="${esc(s.id)}">${IC.trash} מחק</button></div>
      </div>
    </details>`;
  }
  return h;
}

/* ---------- הגדרות ---------- */
function viewSettings() {
  const st = db.settings;
  const themes = [['auto', 'אוטומטי'], ['light', 'בהיר'], ['dark', 'כהה']];
  return `<header class="top"><div><h1>הגדרות</h1></div></header>
    <p class="sect" style="margin-top:0">האימונים שלי</p>
    <div class="list">${Object.entries(db.plans).map(([pid, p]) => `<a class="item p${esc(pid)}" href="#/set/plan/${esc(pid)}"><span class="thumb sm" style="font-weight:800;font-size:20px">${esc(pid)}</span><span class="t"><b>עריכת ${esc(p.name)}</b><span>${esc(p.sub || '')} · ${p.list.length} תרגילים</span></span><span class="muted">${IC_SM.chev}</span></a>`).join('')}</div>

    <p class="sect">טיימר מנוחה</p>
    <section class="card" style="margin-top:8px">
      <div class="row" style="justify-content:space-between">
        <span>זמן מנוחה בין סבבים</span>
        <div class="stp" style="flex:none;width:170px"><div class="ctl">
          <button type="button" data-act="rest" data-d="-15" aria-label="פחות">−</button>
          <input readonly id="rest-v" value="${st.rest}" aria-label="שניות מנוחה">
          <button type="button" data-act="rest" data-d="15" aria-label="יותר">+</button>
        </div><span class="u">שניות</span></div>
      </div>
      <div class="row" style="justify-content:space-between;margin-top:12px">
        <span>צליל בסיום</span>
        <div class="seg" style="width:170px"><button type="button" class="${st.sound ? 'on' : ''}" data-act="sound" data-v="1">פועל</button><button type="button" class="${st.sound ? '' : 'on'}" data-act="sound" data-v="0">כבוי</button></div>
      </div>
    </section>

    <p class="sect">מראה</p>
    <section class="card" style="margin-top:8px"><div class="seg">${themes.map(([k, l]) => `<button type="button" class="${st.theme === k ? 'on' : ''}" data-act="theme" data-v="${k}">${l}</button>`).join('')}</div></section>

    ${syncSection()}

    <p class="sect">גיבוי לקובץ</p>
    <section class="card" style="margin-top:8px">
      <p class="muted small">הנתונים שמורים רק במכשיר הזה. ייצוא שומר קובץ גיבוי, וייבוא משחזר ממנו.</p>
      <div class="row" style="margin-top:12px">
        <button type="button" class="btn line" data-act="export">ייצוא גיבוי</button>
        <button type="button" class="btn line" data-act="import">ייבוא גיבוי</button>
      </div>
      <p class="muted small" style="margin-top:10px">${db.lastBackup ? `גיבוי אחרון: ${fmtDate(db.lastBackup)} (${rel(db.lastBackup)})` : 'עוד לא בוצע גיבוי'}</p>
    </section>

    <p class="sect">התקנה בטלפון</p>
    <section class="card" style="margin-top:8px"><p class="muted small">כדי לפתוח כמו אפליקציה: בתפריט הדפדפן בוחרים "הוספה למסך הבית". אחרי הפתיחה הראשונה האפליקציה עובדת גם בלי קליטה.</p></section>

    <p class="sect">איפוס</p>
    <section class="card" style="margin-top:8px">
      <button type="button" class="btn danger" data-act="reset">מחיקת כל הנתונים וחזרה להתחלה</button>
    </section>
    <p class="muted small" style="text-align:center;margin-top:22px">תמונות התרגילים: free-exercise-db, נחלת הכלל</p>`;
}
const IC_SM = { chev: `<span class="ex-h" style="min-height:0;width:auto"><span class="chev">${IC.chev}</span></span>` };

function viewPlan(pid) {
  const p = db.plans[pid];
  const ps = pairsOf(p.list);
  let h = `<div class="p${esc(pid)}">
    <header class="top"><div class="row"><a class="icon-btn" href="#/set" aria-label="חזרה להגדרות">${IC.back}</a><div><p class="eyebrow">עריכה</p><h1>${esc(p.name)}</h1></div></div></header>
    <section class="card" style="margin-top:0">
      <div class="form-2">
        <label class="field" style="margin-top:0">תיאור<input type="text" data-in="plan" data-plan="${esc(pid)}" data-f="sub" value="${esc(p.sub || '')}" autocomplete="off"></label>
        <label class="field" style="margin-top:0">יעד ריצה (דקות)<input inputmode="numeric" data-in="plan" data-plan="${esc(pid)}" data-f="runMin" value="${p.runMin != null ? n(p.runMin) : ''}" autocomplete="off"></label>
      </div>
    </section>
    <p class="sect">תרגילים לפי הסדר · כל שניים רצופים הם זוג</p>
    <div class="list" style="margin-top:8px">`;
  if (!p.list.length) h += '<div class="item"><span class="muted">אין תרגילים. מוסיפים עם הכפתור למטה.</span></div>';
  let idx = 0;
  ps.forEach((ids, pi) => {
    h += `<div class="pe-pair">${ids.length > 1 ? 'זוג' : 'תרגיל בודד'} ${pi + 1}</div>`;
    for (const id of ids) {
      const ex = exDef(id);
      const i = idx++;
      const a = `data-plan="${esc(pid)}" data-i="${i}"`;
      h += `<div class="pe-item">
        <button type="button" class="row" style="flex:1;min-width:0;text-align:start" data-act="editEx" ${a}>${thumb(ex, 'sm')}<span class="t"><b>${esc(ex.name)}</b><span>${specTxt(ex)}${ex.target ? ` · ${esc(ex.target)}` : ''}</span></span></button>
        <span class="pe-acts">
          <button type="button" class="icon-btn" data-act="moveEx" ${a} data-d="-1" aria-label="הזז למעלה" ${i === 0 ? 'disabled' : ''}>${IC.up}</button>
          <button type="button" class="icon-btn" data-act="moveEx" ${a} data-d="1" aria-label="הזז למטה" ${i === p.list.length - 1 ? 'disabled' : ''}>${IC.down}</button>
          <button type="button" class="icon-btn" data-act="delEx" ${a} aria-label="מחק תרגיל">${IC.trash}</button>
        </span>
      </div>`;
    }
  });
  h += `</div>
    <div class="stack"><button type="button" class="btn primary big" data-act="addEx" data-plan="${esc(pid)}">${IC.plus} הוסף תרגיל</button></div>
  </div>`;
  return h;
}

function exForm(pid, index) {
  const isNew = index == null;
  const id = isNew ? null : db.plans[pid].list[index];
  const ex = isNew ? { name: '', sets: 3, reps: '12', kind: 'weight', step: 2.5, target: '', tips: [], img: null } : exDef(id);
  ui.form = { pid, id, img: ex.img || null, muscles: clone(ex.muscles || { p: [], s: [] }) };
  const kinds = [['weight', 'משקל וחזרות'], ['body', 'חזרות בלבד'], ['time', 'זמן (שניות)']];
  return `<div class="grab"></div>
    <div class="sheet-h"><h2>${isNew ? 'תרגיל חדש' : 'עריכת תרגיל'}</h2><button type="button" class="icon-btn" data-act="closeSheet" aria-label="סגור">${IC.x}</button></div>
    <form id="ex-form" autocomplete="off">
      <label class="field" style="margin-top:0">שם התרגיל<input type="text" name="name" value="${esc(ex.name)}" required></label>
      <div class="form-2">
        <label class="field">סטים<input inputmode="numeric" name="sets" value="${esc(ex.sets)}"></label>
        <label class="field">חזרות או שניות<input type="text" name="reps" value="${esc(ex.reps)}" placeholder="12 או 8-10" dir="ltr"></label>
      </div>
      <div class="form-2">
        <label class="field">סוג<select name="kind">${kinds.map(([k, l]) => `<option value="${k}" ${ex.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field">קפיצת משקל (${KG})<input inputmode="decimal" name="step" value="${ex.step != null ? n(ex.step) : ''}" placeholder="2.5"></label>
      </div>
      <label class="field">יעד (לא חובה)<input type="text" name="target" value="${esc(ex.target || '')}" placeholder="לדוגמה: 40 ${esc(KG)}"></label>
      <label class="field">דגשים לטכניקה, כל דגש בשורה<textarea name="tips" rows="4">${esc((ex.tips || []).join('\n'))}</textarea></label>
      <div class="field">שרירים (לחיצה: עיקרי, עוד לחיצה: משני, ועוד אחת: ביטול)
        <div class="chips" id="mchips">${muscleChips()}</div>
      </div>
      <div class="field">תמונה
        <div class="imgpick" id="imgpick">${imgPickHtml()}</div>
      </div>
      <label class="field">חיפוש תמונה אחרת במאגר (באנגלית, דורש אינטרנט)
        <span class="row"><input type="text" id="img-q" placeholder="deadlift" dir="ltr"><button type="button" class="btn sm line" data-act="imgSearch">חפש</button></span>
      </label>
      <div class="imgpick" id="img-results"></div>
      <div class="stack"><button type="submit" class="btn primary big">${isNew ? 'הוסף לאימון' : 'שמור'}</button></div>
    </form>`;
}
function muscleChips() {
  const m = ui.form.muscles;
  return MUSCLE_KEYS.map((k) => `<button type="button" class="chip mchip ${m.p.includes(k) ? 'on' : m.s.includes(k) ? 'sec' : ''}" data-act="toggleMuscle" data-m="${esc(k)}">${MUSCLE_NAMES[k]}</button>`).join('');
}
function imgPickHtml() {
  const cur = ui.form.img;
  let h = `<button type="button" class="${!cur ? 'on' : ''}" data-act="pickImg" data-img="">בלי</button>`;
  if (cur && !LOCAL.has(cur)) h += `<button type="button" class="on" data-act="pickImg" data-img="${esc(cur)}"><img src="${esc(imgSrc(cur, 0))}" alt="${esc(cur)}" loading="lazy"></button>`;
  for (const [key, label] of LOCAL_IMAGES) h += `<button type="button" class="${cur === key ? 'on' : ''}" data-act="pickImg" data-img="${esc(key)}" title="${esc(label)}"><img src="${esc(imgSrc(key, 0))}" alt="${esc(label)}" loading="lazy"></button>`;
  return h;
}
let remoteIndex = null;
async function imgSearch() {
  const q = ($('#img-q').value || '').trim().toLowerCase();
  const box = $('#img-results');
  if (!q) { box.innerHTML = ''; return; }
  box.innerHTML = '<span class="muted small" style="grid-column:1/-1">מחפש</span>';
  try {
    if (!remoteIndex) {
      const r = await fetch(REMOTE_INDEX_URL);
      if (!r.ok) throw new Error('bad status');
      remoteIndex = (await r.json()).map((e) => ({ id: e.id, name: e.name }));
    }
    const terms = q.split(/\s+/).filter(Boolean);
    const res = remoteIndex.filter((e) => terms.every((t) => e.name.toLowerCase().includes(t))).slice(0, 12);
    if (!$('#img-results')) return;
    box.innerHTML = res.length
      ? res.map((e) => `<button type="button" data-act="pickImg" data-img="${esc(e.id)}" title="${esc(e.name)}"><img src="${esc(imgSrc(e.id, 0))}" alt="${esc(e.name)}" loading="lazy"></button>`).join('')
      : '<span class="muted small" style="grid-column:1/-1">לא נמצאו תוצאות. אפשר לנסות מילה אחרת באנגלית.</span>';
  } catch (e) {
    box.innerHTML = '<span class="muted small" style="grid-column:1/-1">החיפוש נכשל. בודקים חיבור לאינטרנט ומנסים שוב.</span>';
  }
}
function saveExForm(form) {
  const f = ui.form;
  if (!f) return;
  const fd = new FormData(form);
  const name = String(fd.get('name') || '').trim();
  if (!name) { toast('חסר שם לתרגיל'); return; }
  const reps = String(fd.get('reps') || '').trim().replace(/-/g, '–');
  const nums = reps.match(/\d+(\.\d+)?/g);
  const kind = fd.get('kind');
  const id = f.id || 'x' + Date.now().toString(36);
  const old = db.exercises[id] || {};
  const ex = Object.assign({}, old, {
    id, name,
    sets: Math.max(1, Math.min(10, Math.round(num(fd.get('sets')) || 3))),
    reps: reps || '10',
    repsDef: nums ? parseFloat(nums[nums.length - 1]) : 10,
    kind,
    step: num(fd.get('step')) || 2.5,
    target: String(fd.get('target') || '').trim(),
    tips: String(fd.get('tips') || '').split('\n').map((t) => t.replace(/^[\s·•\-–]+/, '').trim()).filter(Boolean),
    img: f.img || null,
  });
  if (f.muscles.p.length || f.muscles.s.length) ex.muscles = f.muscles; else delete ex.muscles;
  const goal = kind === 'weight' && ex.target ? ex.target.match(/d+(.d+)?/) : null;
  if (goal) ex.goalW = parseFloat(goal[0]); else delete ex.goalW;
  if (!ex.target) delete ex.target;
  db.exercises[id] = ex;
  const pid = f.pid;
  if (!f.id) db.plans[pid].list.push(id);
  save();
  closeSheet(() => { render(); toast(f.id ? 'התרגיל עודכן' : 'התרגיל נוסף'); });
}

function exportData() {
  db.lastBackup = todayISO();
  save();
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gym-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('קובץ הגיבוי ירד');
  render();
}
function importData(file) {
  const fr = new FileReader();
  fr.onload = () => {
    let d;
    try { d = JSON.parse(fr.result); } catch (e) { d = null; }
    if (!d || typeof d !== 'object' || !d.plans || !Array.isArray(d.sessions) || !d.exercises) { toast('הקובץ אינו גיבוי תקין'); return; }
    confirmSheet({
      title: 'לשחזר מהגיבוי?',
      text: `בקובץ יש ${d.sessions.length} אימונים. הנתונים שבמכשיר (${db.sessions.length} אימונים) יוחלפו.`,
      ok: 'שחזר',
      onOk: () => { db = normalize(d); save(); applyTheme(); render(); toast('הגיבוי שוחזר'); },
    });
  };
  fr.readAsText(file);
}
function applyTheme() {
  const t = db.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

/* ---------- מסך דולק בזמן אימון ---------- */
let wl = null;
async function wake(on) {
  try {
    if (on && !wl && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wl = await navigator.wakeLock.request('screen');
      wl.addEventListener('release', () => { wl = null; });
    } else if (!on && wl) { const w = wl; wl = null; await w.release(); }
  } catch (e) { /* לא נתמך או נדחה */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { tick(); wake(route().name === 'w'); }
});

/* ---------- פעולות ---------- */
const actions = {
  closeSheet: () => closeSheet(),
  confirmOk: () => { const cb = confirmCb; confirmCb = null; closeSheet(cb); },
  resume: () => go('#/w'),
  start: (el) => {
    const pid = el.dataset.plan;
    if (draft && draft.plan === pid && !draft.editId) return go('#/w');
    if (draft && (draft.editId || progress().done > 0)) {
      const p = db.plans[draft.plan];
      return confirmSheet({ title: 'להתחיל אימון חדש?', text: `${p ? p.name : 'אימון'} עדיין פתוח. התחלה חדשה תמחק את מה שסומן בו.`, ok: 'התחל חדש', danger: true, onOk: () => startWorkout(pid) });
    }
    startWorkout(pid);
  },
  togglePair: (el) => {
    const pi = +el.dataset.pi;
    if (pi === currentPair()) return;
    if (ui.openPairs.has(pi)) ui.openPairs.delete(pi); else ui.openPairs.add(pi);
    refreshWorkout();
  },
  openEx: (el) => openSheet(exSheet(el.dataset.ex, true), 'p' + draft.plan),
  toggleAnim: (el) => el.classList.toggle('paused'),
  step: (el) => {
    const { ex: id, f } = el.dataset;
    const i = +el.dataset.i;
    const d = draft.ex[id];
    if (!d || !d.sets[i]) return;
    const def = exDef(id);
    const stepSize = f === 'w' ? (def.step || 2.5) : def.kind === 'time' ? 5 : 1;
    const cur = d.sets[i][f];
    const dir = +el.dataset.d;
    let v = cur == null ? (dir > 0 ? (f === 'w' ? stepSize : (def.repsDef || 1)) : 0) : cur + dir * stepSize;
    v = Math.max(0, Math.round(v * 100) / 100);
    setValue(id, i, f, v);
    syncInputs(id);
    buzz(8);
  },
  doneSet: (el) => markDone(el.dataset.ex, +el.dataset.i),
  toggleSet: (el) => {
    const id = el.dataset.ex, i = +el.dataset.i;
    const s = draft.ex[id].sets[i];
    if (!s.done) return markDone(id, i);
    s.done = false;
    saveDraft();
    refreshWorkout();
  },
  playSet: (el) => {
    const id = el.dataset.ex, i = +el.dataset.i;
    const s = draft.ex[id].sets[i];
    const sec = s.r || exDef(id).repsDef || 30;
    const name = exDef(id).name;
    startTimer(5, `היכון: ${name}`, () => startTimer(sec, `${name} · סט ${i + 1}`, () => markDone(id, i)));
  },
  addSet: (el) => {
    const d = draft.ex[el.dataset.ex];
    const l = d.sets[d.sets.length - 1] || { w: null, r: null };
    d.sets.push({ w: l.w, r: l.r, done: false });
    saveDraft(); refreshWorkout();
  },
  rmSet: (el) => {
    const d = draft.ex[el.dataset.ex];
    if (d.sets.length > 1) d.sets.pop();
    saveDraft(); refreshWorkout();
  },
  exFeel: (el) => {
    const id = el.dataset.ex;
    const d = draft.ex[id];
    d.note = d.note === el.dataset.v ? '' : el.dataset.v;
    saveDraft();
    $('#sx-feels').innerHTML = exFeelChips(id);
    const inp = $('input[data-in="exnote"]');
    if (inp) inp.value = d.note;
  },
  feel: (el) => {
    draft.feel = draft.feel === el.dataset.v ? '' : el.dataset.v;
    saveDraft();
    $('#feels').innerHTML = feelChips();
  },
  saveWorkout: () => saveWorkout(false),
  cancelWorkout: () => {
    const editing = !!draft.editId;
    confirmSheet({
      title: editing ? 'לבטל את העריכה?' : 'לבטל את האימון?',
      text: editing ? 'השינויים לא יישמרו. האימון ביומן יישאר כמו שהיה.' : 'מה שסומן באימון הזה לא יישמר.',
      ok: editing ? 'בטל עריכה' : 'בטל אימון', danger: true,
      onOk: () => { draft = null; saveDraft(); stopTimer(); go(editing ? '#/log' : '#/'); },
    });
  },
  editSession: (el) => {
    const sid = el.dataset.id;
    if (draft && (draft.editId || progress().done > 0)) {
      return confirmSheet({ title: 'יש אימון פתוח', text: 'פתיחת עריכה תמחק את מה שסומן באימון הפתוח.', ok: 'פתח עריכה', danger: true, onOk: () => editSession(sid) });
    }
    editSession(sid);
  },
  timerAdd: () => { if (T) { T.end += 15000; T.total += 15; tick(); } },
  timerSkip: () => stopTimer(),
  chartMode: (el) => {
    if (el.dataset.v === 'run') ui.chartKey = 'run:sec';
    else if (el.dataset.v === 'body') ui.chartKey = 'body';
    else {
      const withData = sorted().flatMap((s) => Object.keys(s.ex).filter((id) => s.ex[id].sets.length));
      const g = chartOptions();
      ui.chartKey = withData[0] || (g[0] && g[0][1][0] && g[0][1][0][0]) || 'run:sec';
    }
    const y = window.scrollY; render(); window.scrollTo(0, y);
  },
  chartKey: (el) => { ui.chartKey = el.dataset.v; const y = window.scrollY; render(); window.scrollTo(0, y); },
  delSession: (el) => {
    const s = db.sessions.find((x) => x.id === el.dataset.id);
    if (!s) return;
    confirmSheet({
      title: 'למחוק את האימון?', text: `${dayName(s.date)}, ${fmtDate(s.date)}. אי אפשר לשחזר אחרי המחיקה.`, ok: 'מחק', danger: true,
      onOk: () => { db.sessions = db.sessions.filter((x) => x.id !== s.id); save(); render(); toast('האימון נמחק'); },
    });
  },
  rest: (el) => {
    db.settings.rest = Math.max(15, Math.min(300, (db.settings.rest || 60) + +el.dataset.d));
    save();
    $('#rest-v').value = db.settings.rest;
  },
  sound: (el) => { db.settings.sound = el.dataset.v === '1'; save(); if (db.settings.sound) tone(880, 0.15); render(); },
  theme: (el) => { db.settings.theme = el.dataset.v; save(); applyTheme(); render(); },
  export: () => exportData(),
  import: () => { const f = $('#import-file'); f.value = ''; f.click(); },
  reset: () => confirmSheet({
    title: 'למחוק את כל הנתונים?', text: 'כל האימונים, התרגילים וההגדרות יחזרו למצב ההתחלתי. כדאי לייצא גיבוי לפני כן.', ok: 'מחק הכול', danger: true,
    onOk: () => { db = freshDb(); draft = null; save(); saveDraft(); stopTimer(); applyTheme(); render(); toast('הנתונים אופסו'); },
  }),
  moveEx: (el) => {
    const list = db.plans[el.dataset.plan].list;
    const i = +el.dataset.i, j = i + +el.dataset.d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    save();
    const y = window.scrollY; render(); window.scrollTo(0, y);
  },
  delEx: (el) => {
    const pid = el.dataset.plan, i = +el.dataset.i;
    const ex = exDef(db.plans[pid].list[i]);
    confirmSheet({
      title: `להסיר את "${ex.name}"?`, text: 'התרגיל יוסר מהאימון. ההיסטוריה שלו ביומן נשארת.', ok: 'הסר', danger: true,
      onOk: () => { db.plans[pid].list.splice(i, 1); save(); render(); },
    });
  },
  editEx: (el) => openSheet(exForm(el.dataset.plan, +el.dataset.i), 'p' + el.dataset.plan),
  addEx: (el) => openSheet(exForm(el.dataset.plan, null), 'p' + el.dataset.plan),
  toggleMuscle: (el) => {
    if (!ui.form) return;
    const m = ui.form.muscles, k = el.dataset.m;
    if (m.p.includes(k)) { m.p = m.p.filter((x) => x !== k); m.s.push(k); }
    else if (m.s.includes(k)) m.s = m.s.filter((x) => x !== k);
    else m.p.push(k);
    $('#mchips').innerHTML = muscleChips();
  },
  pickImg: (el) => {
    if (!ui.form) return;
    ui.form.img = el.dataset.img || null;
    $('#imgpick').innerHTML = imgPickHtml();
    $$('#img-results button').forEach((b) => b.classList.toggle('on', b.dataset.img === ui.form.img));
  },
  imgSearch: () => imgSearch(),
  weighSheet: () => weighSheet(),
  weightChart: () => { ui.chartKey = 'body'; go('#/log'); },
  wstep: (el) => {
    const inp = $('#weigh-kg');
    const ws = weightsSorted();
    const cur = num(inp.value) ?? (ws.length ? ws[ws.length - 1].kg : 70);
    inp.value = n(Math.max(20, round1(cur + +el.dataset.d)));
    buzz(8);
  },
  delWeight: (el) => {
    db.weights = db.weights.filter((w) => w.id !== el.dataset.id);
    save();
    const l = $('#wlist');
    if (l) l.innerHTML = weighList();
    render();
    toast('השקילה נמחקה');
  },
};

Object.assign(actions, syncActions);

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) fn(el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target;
  const kind = el.dataset && el.dataset.in;
  if (!kind) return;
  if (kind === 'set') { setValue(el.dataset.ex, +el.dataset.i, el.dataset.f, num(el.value)); syncInputs(el.dataset.ex, el); }
  else if (kind === 'run') { draft.run[el.dataset.f] = el.value; saveDraft(); }
  else if (kind === 'note') { draft.note = el.value; saveDraft(); }
  else if (kind === 'date') { draft.date = el.value || todayISO(); saveDraft(); }
  else if (kind === 'exnote') { draft.ex[el.dataset.ex].note = el.value; saveDraft(); const c = $('#sx-feels'); if (c) c.innerHTML = exFeelChips(el.dataset.ex); }
  else if (kind === 'plan') {
    const p = db.plans[el.dataset.plan];
    if (el.dataset.f === 'runMin') p.runMin = num(el.value); else p[el.dataset.f] = el.value;
    save();
  }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'import-file' && el.files && el.files[0]) importData(el.files[0]);
  if (el.dataset && el.dataset.in === 'chartKey') { ui.chartKey = el.value; drawChart(); }
});
document.addEventListener('focusin', (e) => {
  if (e.target.matches && e.target.matches('.stp input:not([readonly]), .mini input, .run-grid input')) { try { e.target.select(); } catch (err) { /* מתעלמים */ } }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches && e.target.matches('.stp input, .mini input, .run-grid input')) e.target.blur();
  if (e.key === 'Escape' && sheetOpen) closeSheet();
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'ex-form') { e.preventDefault(); saveExForm(e.target); }
  if (e.target.id === 'weigh-form') { e.preventDefault(); saveWeigh(e.target); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'img-q') { e.preventDefault(); imgSearch(); }
});

/* ---------- הפעלה ---------- */
applyTheme();
if (!location.hash) history.replaceState(null, '', '#/');
render();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
