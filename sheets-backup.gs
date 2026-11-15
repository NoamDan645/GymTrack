/**
 * גיבוי "האימון שלי" לגיליון Google.
 *
 * התקנה (פעם אחת):
 * 1. פותחים גיליון חדש ב-Google Sheets.
 * 2. בתפריט: Extensions (תוספים) > Apps Script.
 * 3. מוחקים את הקוד שיש שם ומדביקים את כל הקובץ הזה.
 * 4. מחליפים את CHANGE_ME למטה בסיסמה משלך (אותיות ומספרים), ושומרים.
 * 5. Deploy > New deployment > סוג: Web app.
 *    Execute as: Me. Who has access: Anyone. לוחצים Deploy ומאשרים הרשאות.
 * 6. מעתיקים את ה-Web app URL, ומדביקים אותו באפליקציה (הגדרות), יחד עם אותה סיסמה.
 *
 * אחרי החיבור כל אימון ושקילה נשמרים בגיליון אוטומטית.
 * אפשר לערוך את הלשוניות "אימונים", "סטים" ו"משקל גוף" ישירות בגיליון,
 * ואז באפליקציה ללחוץ "משוך מהגיליון". את הלשונית "הגדרות" לא עורכים.
 */
const SECRET = 'CHANGE_ME';

const TAB = { sessions: 'אימונים', sets: 'סטים', weights: 'משקל גוף', config: 'הגדרות' };
const H_SESSIONS = ['תאריך', 'אימון', 'איך הרגיש', 'הערה', 'זמן ריצה (דק:שנ)', 'מרחק (ק"מ)', 'קלוריות', 'משך האימון (דקות)', 'מזהה'];
const H_SETS = ['תאריך', 'אימון', 'תרגיל', 'סט', 'משקל (ק"ג)', 'חזרות או שניות', 'הערה לתרגיל', 'מזהה אימון', 'מזהה תרגיל'];
const H_WEIGHTS = ['תאריך', 'משקל (ק"ג)'];
const CHUNK = 40000;

/* ---------- כניסות ---------- */

function doGet() {
  return out_({ ok: true, message: 'הסקריפט של האימון שלי פעיל' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'בקשה לא תקינה' }); }
  if (SECRET === 'CHANGE_ME') return out_({ ok: false, error: 'צריך להחליף את CHANGE_ME בסיסמה בתוך הסקריפט' });
  if (!body || body.secret !== SECRET) return out_({ ok: false, error: 'סיסמה שגויה' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return out_(handle_(body));
  } catch (err) {
    return out_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(body) {
  const props = PropertiesService.getScriptProperties();
  const cur = readTables_();
  if (body.action === 'ping') {
    return { ok: true, sessions: Math.max(0, cur.sessions.length - 1), weights: Math.max(0, cur.weights.length - 1) };
  }
  if (body.action === 'pull') {
    if (!cur.sessions.length && !cur.config.length) return { ok: false, error: 'הגיליון ריק' };
    const db = tablesToDb_(cur);
    props.setProperty('hash', tablesHash_(cur));
    return { ok: true, db: db };
  }
  if (body.action === 'push') {
    if (!body.db) return { ok: false, error: 'לא התקבלו נתונים' };
    const stored = props.getProperty('hash');
    const hasData = cur.sessions.length > 1 || cur.weights.length > 1;
    // הגיליון נערך ידנית מאז הסנכרון האחרון, או שהוא מכיל נתונים ועוד לא סונכרן: לא דורסים בלי אישור
    const edited = stored ? stored !== tablesHash_(cur) : hasData;
    if (edited && !body.force) return { ok: false, conflict: true };
    const t = dbToTables_(body.db);
    writeSheet_('sessions', t.sessions, [1, 5, 9]);
    writeSheet_('sets', t.sets, [1, 8, 9]);
    writeSheet_('weights', t.weights, [1]);
    writeSheet_('config', t.config, [1]);
    props.setProperty('hash', tablesHash_(readTables_()));
    return { ok: true, at: new Date().toISOString() };
  }
  return { ok: false, error: 'פעולה לא מוכרת' };
}

/* ---------- קריאה וכתיבה בגיליון ---------- */

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function readTables_() {
  const out = {};
  Object.keys(TAB).forEach(function (k) {
    const sh = sheet_(TAB[k]);
    out[k] = sh.getLastRow() ? sh.getDataRange().getValues() : [];
  });
  return out;
}

function writeSheet_(key, rows, textCols) {
  const sh = sheet_(TAB[key]);
  sh.clearContents();
  if (!rows.length) return;
  const width = rows[0].length;
  textCols.forEach(function (c) { sh.getRange(1, c, Math.max(rows.length, 500), 1).setNumberFormat('@'); });
  sh.getRange(1, 1, rows.length, width).setValues(rows);
  if (key !== 'config') {
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, width).setFontWeight('bold');
    sh.setRightToLeft(true);
  }
}

/* ---------- המרות (פונקציות טהורות) ---------- */

function s_(v) { return v === null || v === undefined ? '' : String(v); }
function p2_(x) { return ('0' + x).slice(-2); }
function isDate_(v) { return !!v && typeof v === 'object' && typeof v.getFullYear === 'function'; }

function numOrNull_(v) {
  const t = s_(v).replace(',', '.').trim();
  if (t === '') return null;
  const x = parseFloat(t);
  return isFinite(x) ? x : null;
}

function date_(v) {
  if (isDate_(v)) return v.getFullYear() + '-' + p2_(v.getMonth() + 1) + '-' + p2_(v.getDate());
  const t = s_(v).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return m[1] + '-' + p2_(+m[2]) + '-' + p2_(+m[3]);
  m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return m[3] + '-' + p2_(+m[2]) + '-' + p2_(+m[1]);
  return '';
}

function mmss_(sec) {
  if (!sec) return '';
  return Math.floor(sec / 60) + ':' + p2_(Math.round(sec % 60));
}

function parseMmss_(v) {
  const t = s_(v).trim();
  if (!t) return null;
  if (t.indexOf(':') >= 0) {
    const p = t.split(':');
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }
  const x = numOrNull_(t);
  return x === null ? null : Math.round(x * 60);
}

function hash_(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return String(h >>> 0) + ':' + str.length;
}

function tablesHash_(t) {
  const norm = ['sessions', 'sets', 'weights'].map(function (k) {
    return (t[k] || []).map(function (r) { return r.map(function (x) { return isDate_(x) ? date_(x) : s_(x); }); });
  });
  return hash_(JSON.stringify(norm));
}

function dbToTables_(db) {
  const exercises = db.exercises || {};
  const plans = db.plans || {};
  const sessions = [H_SESSIONS];
  const sets = [H_SETS];
  const weights = [H_WEIGHTS];
  const ss = (db.sessions || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  ss.forEach(function (s) {
    const run = s.run || {};
    sessions.push([s.date, s.plan, s.feel || '', s.note || '', mmss_(run.sec), run.km == null ? '' : run.km, run.kcal == null ? '' : run.kcal, s.dur == null ? '' : s.dur, s.id]);
    const order = (plans[s.plan] && plans[s.plan].list) || [];
    const ids = Object.keys(s.ex || {}).sort(function (a, b) {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
    ids.forEach(function (id) {
      const e = s.ex[id];
      const name = e.name || (exercises[id] && exercises[id].name) || id;
      const rows = e.sets && e.sets.length ? e.sets : [null];
      rows.forEach(function (st, i) {
        sets.push([s.date, s.plan, name, st ? i + 1 : '', st && st.w != null ? st.w : '', st && st.r != null ? st.r : '', i === 0 ? (e.note || '') : '', s.id, id]);
      });
    });
  });
  (db.weights || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; })
    .forEach(function (w) { weights.push([w.date, w.kg]); });
  const cfg = JSON.stringify({ v: 1, exercises: exercises, plans: plans, settings: db.settings || {}, lastBackup: db.lastBackup || null });
  const config = [];
  for (let i = 0; i < cfg.length; i += CHUNK) config.push([cfg.slice(i, i + CHUNK)]);
  return { sessions: sessions, sets: sets, weights: weights, config: config };
}

function tablesToDb_(t) {
  let cfg = {};
  try { cfg = JSON.parse((t.config || []).map(function (r) { return s_(r[0]); }).join('') || '{}'); } catch (err) { cfg = {}; }
  const exercises = cfg.exercises || {};
  const plans = cfg.plans || {};
  const byName = {};
  Object.keys(exercises).forEach(function (id) { byName[exercises[id].name] = id; });

  const sessions = [];
  const byId = {};
  const byKey = {};
  (t.sessions || []).slice(1).forEach(function (r, i) {
    const date = date_(r[0]);
    if (!date) return;
    const plan = s_(r[1]).trim();
    const sec = parseMmss_(r[4]), km = numOrNull_(r[5]), kcal = numOrNull_(r[6]), dur = numOrNull_(r[7]);
    const id = s_(r[8]).trim() || 's' + date.replace(/-/g, '') + '-' + i;
    const s = { id: id, date: date, plan: plan, ex: {}, run: sec || km !== null || kcal !== null ? { sec: sec, km: km, kcal: kcal } : null, feel: s_(r[2]).trim(), note: s_(r[3]).trim() };
    if (dur !== null) s.dur = dur;
    sessions.push(s);
    byId[id] = s;
    if (!byKey[date + '|' + plan]) byKey[date + '|' + plan] = s;
  });

  (t.sets || []).slice(1).forEach(function (r, i) {
    const date = date_(r[0]);
    const name = s_(r[2]).trim();
    if (!name && !s_(r[3]) && !s_(r[4]) && !s_(r[5])) return;
    const plan = s_(r[1]).trim();
    const sid = s_(r[7]).trim();
    let s = byId[sid] || byKey[date + '|' + plan];
    if (!s) {
      if (!date) return;
      s = { id: 's' + date.replace(/-/g, '') + '-x' + i, date: date, plan: plan, ex: {}, run: null, feel: '', note: '' };
      sessions.push(s);
      byId[s.id] = s;
      byKey[date + '|' + plan] = s;
    }
    let exId = s_(r[8]).trim() || byName[name];
    if (!exId) exId = 'x' + hash_(name).split(':')[0];
    if (!exercises[exId]) {
      exercises[exId] = { id: exId, name: name || exId, sets: 3, reps: '10', repsDef: 10, kind: 'weight', step: 2.5, tips: [] };
      byName[exercises[exId].name] = exId;
    }
    const e = s.ex[exId] || (s.ex[exId] = { name: name || exercises[exId].name, sets: [], note: '' });
    const w = numOrNull_(r[4]), reps = numOrNull_(r[5]);
    if (s_(r[3]).trim() !== '' || w !== null || reps !== null) {
      const o = {};
      if (w !== null) o.w = w;
      o.r = reps;
      e.sets.push(o);
    }
    if (s_(r[6]).trim()) e.note = s_(r[6]).trim();
  });

  const weights = [];
  (t.weights || []).slice(1).forEach(function (r) {
    const date = date_(r[0]);
    const kg = numOrNull_(r[1]);
    if (date && kg !== null && kg > 0) weights.push({ id: 'w' + date.replace(/-/g, ''), date: date, kg: kg });
  });

  return Object.assign({}, cfg, { v: 1, exercises: exercises, plans: plans, sessions: sessions, weights: weights });
}
