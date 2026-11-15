'use strict';
/* איור גוף (SVG) שמסמן אילו שרירים התרגיל עובד עליהם.
   שרירים עיקריים בצבע מלא, משניים בצבע בהיר. האיורים צוירו עבור האפליקציה. */

const MUSCLE_NAMES = {
  chest: 'חזה',
  shoulders: 'כתפיים',
  biceps: 'דו-ראשי בזרוע',
  triceps: 'תלת-ראשי בזרוע',
  forearms: 'אמות',
  abdominals: 'בטן',
  quadriceps: 'קדמי הירך',
  adductors: 'פנימי הירך',
  traps: 'טרפז',
  lats: 'רחב גבי',
  'middle back': 'אמצע הגב',
  'lower back': 'גב תחתון',
  glutes: 'ישבן',
  hamstrings: 'אחורי הירך',
  abductors: 'חיצוני הירך',
  calves: 'תאומים',
};
const MUSCLE_KEYS = Object.keys(MUSCLE_NAMES);

/* כל נתיב מצויר לצד אחד של הגוף ומשוכפל בהיפוך לצד השני */
const BODY_HALF = 'M45 24 L31 30 Q20 34 17 46 L14 72 L13 88 L20 90 L24 74 L30 56 Q34 76 36 94 L34 104 Q32 122 35 146 L36 184 L34 193 L46 193 L47 150 Q48 128 49 108 L50 104 L50 24 Z';
const FRONT_PATHS = {
  chest: 'M50 34 L33 34 Q30 42 34 50 Q42 55 50 53 Z',
  shoulders: 'M31 30 Q22 32 20 42 Q24 49 30 47 Q34 41 34 33 Z',
  biceps: 'M21 47 Q16 56 18 65 L25 65 Q28 57 28 49 Z',
  forearms: 'M17 68 L14 86 L20 88 L24 69 Z',
  abdominals: 'M50 56 L40 56 Q38 72 40 90 L50 93 Z',
  quadriceps: 'M48 106 Q41 105 36 108 Q33 124 36 143 L46 143 Q49 125 48 106 Z',
  adductors: 'M49 108 L47 110 Q47 126 46 140 L49 140 Z',
};
const BACK_PATHS = {
  traps: 'M50 25 L41 29 Q39 33 41 37 Q47 40 50 38 Z',
  shoulders: 'M31 30 Q22 32 20 42 Q24 49 30 47 Q34 41 34 33 Z',
  triceps: 'M21 47 Q16 56 18 65 L25 65 Q28 57 28 49 Z',
  forearms: 'M17 68 L14 86 L20 88 L24 69 Z',
  lats: 'M36 50 Q32 60 36 76 Q43 80 49 78 Q44 66 41 52 Z',
  'middle back': 'M50 40 L40 40 Q37 46 41 52 Q46 56 50 56 Z',
  'lower back': 'M50 80 L40 80 Q38 88 40 95 L50 97 Z',
  glutes: 'M50 99 Q40 97 36 103 Q35 113 41 117 Q47 117 50 113 Z',
  hamstrings: 'M48 121 Q42 119 37 121 Q35 135 37 147 L46 147 Q49 135 48 121 Z',
  abductors: 'M35 102 Q31 112 34 124 L37 122 Q36 112 38 104 Z',
  calves: 'M37 151 Q34 161 37 176 L45 176 Q48 161 45 151 Z',
};

function bodySvg(view, m) {
  const paths = view === 'front' ? FRONT_PATHS : BACK_PATHS;
  const cls = (k) => 'm' + ((m.p || []).includes(k) ? ' p' : (m.s || []).includes(k) ? ' s' : '');
  const half = (flip) => {
    let g = '';
    for (const [k, d] of Object.entries(paths)) g += `<path class="${cls(k)}" d="${d}"/>`;
    return `<g ${flip ? 'transform="translate(100 0) scale(-1 1)"' : ''}><path class="base" d="${BODY_HALF}"/>${g}</g>`;
  };
  const label = view === 'front' ? 'מבט מלפנים' : 'מבט מאחור';
  return `<svg viewBox="0 0 100 198" role="img" aria-label="${label}"><circle class="base" cx="50" cy="13" r="9"/>${half(false)}${half(true)}</svg>`;
}

function muscleNames(list) {
  return (list || []).map((k) => MUSCLE_NAMES[k]).filter(Boolean).join(', ');
}

/* כרטיס "שרירים": שני מבטים ומקרא */
function muscleCard(m) {
  if (!m || (!(m.p || []).length && !(m.s || []).length)) return '';
  const p = muscleNames(m.p);
  const s = muscleNames(m.s);
  return `<section class="card mus"><h3>על מה התרגיל עובד</h3>
    <div class="mfig">
      <figure>${bodySvg('front', m)}<figcaption>מלפנים</figcaption></figure>
      <figure>${bodySvg('back', m)}<figcaption>מאחור</figcaption></figure>
    </div>
    <ul class="mleg">
      ${p ? `<li><i class="dot p"></i><span><b>עיקרי:</b> ${p}</span></li>` : ''}
      ${s ? `<li><i class="dot s"></i><span><b>משני:</b> ${s}</span></li>` : ''}
    </ul></section>`;
}
