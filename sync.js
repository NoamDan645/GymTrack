'use strict';
/* סנכרון אוטומטי לגיליון Google דרך סקריפט Apps Script (ראו sheets-backup.gs).
   פרטי החיבור נשמרים רק במכשיר הזה, ולא נכללים בקובץ הגיבוי. */

const SYNC_KEY = 'gymlog.sync';
const SYNC_DEFAULTS = { url: '', secret: '', auto: true, last: null, pending: false, status: 'idle', err: '' };

function loadSyncCfg() {
  try {
    const c = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null');
    if (c && typeof c === 'object') return Object.assign({}, SYNC_DEFAULTS, c);
  } catch (e) { /* מתעלמים */ }
  return Object.assign({}, SYNC_DEFAULTS);
}
let gsync = loadSyncCfg();
let syncTimer = null;
let syncBusy = false;
let syncSuppress = false;
let syncChanges = 0;

function saveSyncCfg() {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(gsync)); } catch (e) { /* מתעלמים */ }
}
const syncReady = () => !!(gsync.url && gsync.secret);
const validSheetUrl = (u) => /^https:\/\/script\.google(usercontent)?\.com\//.test(u) || /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u);

/* ---------- תקשורת ---------- */
async function callSheet(payload, url, secret) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(url || gsync.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ secret: secret || gsync.secret }, payload)),
      redirect: 'follow',
      signal: ctl.signal,
    });
    const txt = await r.text();
    try { return JSON.parse(txt); } catch (e) { throw new Error('bad-response'); }
  } finally {
    clearTimeout(t);
  }
}

function syncErrText(e) {
  if (e && e.message === 'bad-response') return 'התקבלה תשובה לא צפויה. בדוק שהכתובת היא כתובת ה-Web app ושההרשאה היא Anyone.';
  return 'אין חיבור לגיליון כרגע. ננסה שוב כשיהיה אינטרנט.';
}

/* ---------- דחיפה אוטומטית ---------- */
function scheduleSync() {
  if (syncSuppress || !syncReady() || !gsync.auto) return;
  syncChanges++;
  gsync.pending = true;
  saveSyncCfg();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushSync(false), 2500);
  refreshSyncUi();
}

async function pushSync(force) {
  if (syncBusy || !syncReady()) return;
  if (!navigator.onLine) { gsync.pending = true; saveSyncCfg(); refreshSyncUi(); return; }
  syncBusy = true;
  const mark = syncChanges;
  refreshSyncUi();
  try {
    const res = await callSheet({ action: 'push', force: !!force, db });
    if (res.ok) {
      gsync.last = new Date().toISOString();
      gsync.status = 'ok';
      gsync.err = '';
      gsync.pending = syncChanges !== mark;
    } else if (res.conflict) {
      gsync.status = 'conflict';
      gsync.err = '';
    } else {
      gsync.status = 'error';
      gsync.err = res.error || 'שגיאה בגיליון';
    }
  } catch (e) {
    gsync.status = 'error';
    gsync.err = syncErrText(e);
    gsync.pending = true;
  } finally {
    syncBusy = false;
    saveSyncCfg();
    refreshSyncUi();
    if (gsync.pending && gsync.status === 'ok') scheduleSync();
  }
}

/* ---------- משיכה מהגיליון ---------- */
async function pullSync() {
  if (!syncReady()) return;
  if (!navigator.onLine) { toast('אין חיבור לאינטרנט'); return; }
  toast('מושך מהגיליון');
  try {
    const res = await callSheet({ action: 'pull' });
    if (!res.ok) { toast(res.error || 'המשיכה נכשלה'); return; }
    const d = res.db;
    confirmSheet({
      title: 'למשוך מהגיליון?',
      text: `בגיליון יש ${d.sessions.length} אימונים ו-${d.weights.length} שקילות. הנתונים שבמכשיר יוחלפו בהם.`,
      ok: 'משוך',
      onOk: () => {
        db = normalize(d);
        syncSuppress = true;
        save();
        syncSuppress = false;
        applyTheme();
        gsync.status = 'ok';
        gsync.err = '';
        gsync.pending = false;
        gsync.last = new Date().toISOString();
        saveSyncCfg();
        render();
        toast('הנתונים נמשכו מהגיליון');
      },
    });
  } catch (e) {
    toast(syncErrText(e));
  }
}

async function connectSync(url, secret) {
  url = (url || '').trim();
  secret = (secret || '').trim();
  if (!validSheetUrl(url)) { toast('זו לא כתובת Web app של Google. היא מתחילה ב-https://script.google.com'); return; }
  if (!secret) { toast('חסרה הסיסמה'); return; }
  toast('בודק חיבור');
  try {
    const res = await callSheet({ action: 'ping' }, url, secret);
    if (!res.ok) { toast(res.error || 'החיבור נכשל'); return; }
    gsync = Object.assign({}, SYNC_DEFAULTS, { url, secret, auto: true });
    saveSyncCfg();
    await pushSync(false);
    render();
    toast(gsync.status === 'conflict' ? 'הגיליון כבר מכיל נתונים. צריך להכריע' : gsync.status === 'ok' ? 'מחובר, והנתונים נשמרו בגיליון' : 'מחובר');
  } catch (e) {
    toast(syncErrText(e));
  }
}

/* ---------- ממשק ---------- */
function syncStatusHtml() {
  if (gsync.status === 'conflict') {
    return `<p><span class="tag warn">הגיליון נערך ידנית</span></p>
      <p class="muted small" style="margin-top:8px">יש בגיליון שינויים שלא נמשכו. אפשר למשוך אותם לאפליקציה, או לדרוס את הגיליון בנתוני האפליקציה.</p>
      <div class="stack" style="margin-top:10px"><button type="button" class="btn" data-act="syncPull">משוך מהגיליון</button><button type="button" class="btn danger" data-act="syncForce">דרוס את הגיליון</button></div>`;
  }
  if (gsync.status === 'error') return `<p><span class="tag warn">הסנכרון נכשל</span></p><p class="muted small" style="margin-top:8px">${esc(gsync.err)}</p>`;
  if (syncBusy) return '<p><span class="tag plain">מסנכרן</span></p>';
  if (gsync.pending) return '<p><span class="tag plain">ממתין לסנכרון</span></p>';
  if (gsync.last) {
    const d = new Date(gsync.last);
    return `<p><span class="tag ok">מסונכרן</span> <span class="muted small">${rel(iso(d))}, ${pad(d.getHours())}:${pad(d.getMinutes())}</span></p>`;
  }
  return '<p class="muted small">עוד לא בוצע סנכרון.</p>';
}

function syncCardInner() {
  if (!syncReady()) {
    return `<p class="muted small">כל אימון ושקילה יישמרו אוטומטית בגיליון Google בדרייב שלך. אפשר לקרוא ולערוך אותו שם.</p>
      <ol class="muted small" style="margin:10px 0 0;padding-inline-start:20px;display:grid;gap:4px">
        <li>פותחים גיליון חדש ב-<bdi>Google Sheets</bdi>.</li>
        <li>בתפריט: <bdi>Extensions</bdi> (תוספים), ואז <bdi>Apps Script</bdi>.</li>
        <li>מוחקים את הקוד שיש שם, מדביקים את הסקריפט (הכפתור למטה), ומחליפים את <bdi>CHANGE_ME</bdi> בסיסמה שאתה בוחר.</li>
        <li>לוחצים <bdi>Deploy</bdi>, אז <bdi>New deployment</bdi>, וסוג <bdi>Web app</bdi>. בשדה <bdi>Execute as</bdi> בוחרים <bdi>Me</bdi>, ובשדה <bdi>Who has access</bdi> בוחרים <bdi>Anyone</bdi>. מאשרים את ההרשאות.</li>
        <li>מעתיקים את כתובת ה-<bdi>Web app</bdi> ומדביקים כאן, עם אותה סיסמה.</li>
      </ol>
      <button type="button" class="btn line" style="margin-top:12px" data-act="syncCopy">העתק את הסקריפט</button>
      <label class="field">כתובת Web app<input type="text" id="sync-url" dir="ltr" placeholder="https://script.google.com/macros/s/.../exec" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <label class="field">סיסמה (אותה סיסמה כמו בסקריפט)<input type="text" id="sync-secret" dir="ltr" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <div class="stack"><button type="button" class="btn primary" data-act="syncConnect">חבר וגבה</button></div>`;
  }
  return `${syncStatusHtml()}
    ${gsync.status === 'conflict' ? '' : `<div class="row" style="margin-top:12px"><button type="button" class="btn sm line" data-act="syncNow">סנכרן עכשיו</button><button type="button" class="btn sm line" data-act="syncPull">משוך מהגיליון</button></div>`}
    <div class="row" style="justify-content:space-between;margin-top:12px"><span>סנכרון אוטומטי</span>
      <div class="seg" style="width:170px"><button type="button" class="${gsync.auto ? 'on' : ''}" data-act="syncAuto" data-v="1">פועל</button><button type="button" class="${gsync.auto ? '' : 'on'}" data-act="syncAuto" data-v="0">כבוי</button></div></div>
    <button type="button" class="btn ghost" style="margin-top:8px" data-act="syncOff">נתק את הגיליון</button>`;
}
const syncSection = () => `<p class="sect">גיבוי אוטומטי לגיליון Google</p><section class="card" id="sync-card" style="margin-top:8px">${syncCardInner()}</section>`;

function refreshSyncUi() {
  const el = document.getElementById('sync-card');
  if (el && syncReady()) el.innerHTML = syncCardInner();
}

function syncNotice() {
  if (!syncReady()) return '';
  if (gsync.status === 'conflict') return '<a class="card small" href="#/set"><span class="tag warn">הגיליון נערך ידנית</span> צריך להכריע בהגדרות: למשוך את השינויים או לדרוס אותם.</a>';
  if (gsync.status === 'error') return `<a class="card small muted" href="#/set">הסנכרון לגיליון נכשל: ${esc(gsync.err)}</a>`;
  return '';
}

async function copyScript() {
  try {
    const r = await fetch('sheets-backup.gs');
    if (!r.ok) throw new Error('missing');
    const txt = await r.text();
    try { await navigator.clipboard.writeText(txt); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('הסקריפט הועתק');
  } catch (e) {
    toast('לא הצלחתי להעתיק. צריך חיבור לאינטרנט');
  }
}

const syncActions = {
  syncCopy: () => copyScript(),
  syncConnect: () => connectSync(($('#sync-url') || {}).value, ($('#sync-secret') || {}).value),
  syncNow: () => { clearTimeout(syncTimer); pushSync(false); },
  syncPull: () => pullSync(),
  syncForce: () => confirmSheet({
    title: 'לדרוס את הגיליון?', text: 'השינויים שנעשו ידנית בגיליון יימחקו, והוא יתעדכן לפי הנתונים שבאפליקציה.', ok: 'דרוס', danger: true,
    onOk: () => pushSync(true),
  }),
  syncAuto: (el) => { gsync.auto = el.dataset.v === '1'; saveSyncCfg(); refreshSyncUi(); if (gsync.auto) scheduleSync(); },
  syncOff: () => confirmSheet({
    title: 'לנתק את הגיליון?', text: 'הנתונים שכבר בגיליון נשארים שם. האפליקציה פשוט תפסיק לעדכן אותו.', ok: 'נתק',
    onOk: () => { gsync = Object.assign({}, SYNC_DEFAULTS); saveSyncCfg(); render(); toast('הגיליון נותק'); },
  }),
};

/* ---------- חידוש אוטומטי ---------- */
function resumeSync() { if (syncReady() && gsync.auto && gsync.pending && navigator.onLine) pushSync(false); }
window.addEventListener('online', resumeSync);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resumeSync(); });
window.addEventListener('load', () => setTimeout(resumeSync, 3000));
