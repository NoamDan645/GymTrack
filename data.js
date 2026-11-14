'use strict';
/* נתוני ברירת מחדל: תרגילים, תוכניות אימון והיסטוריה התחלתית.
   התמונות מתוך free-exercise-db (yuhonas/free-exercise-db, נחלת הכלל). */

// תמונות שנמצאות בתיקיית img (לכל אחת שתי תמונות: _0 התחלה, _1 סיום)
const LOCAL_IMAGES = [
  ['Machine_Bench_Press', 'לחיצת חזה במכונה'],
  ['Seated_Cable_Rows', 'חתירה בכבל'],
  ['Seated_Dumbbell_Press', 'לחיצת כתפיים, משקולות'],
  ['Machine_Shoulder_Military_Press', 'לחיצת כתפיים, מכונה'],
  ['Wide-Grip_Lat_Pulldown', 'פולי עליון'],
  ['Side_Lateral_Raise', 'הרחקה לצדדים'],
  ['Triceps_Pushdown', 'פשיטת מרפקים בכבל'],
  ['Dumbbell_Bicep_Curl', 'כפיפת מרפקים, משקולות'],
  ['Standing_Biceps_Cable_Curl', 'כפיפת מרפקים, כבל'],
  ['Crunches', 'כפיפות בטן'],
  ['Barbell_Squat', 'סקוואט'],
  ['Flat_Bench_Lying_Leg_Raise', 'הרמות רגליים'],
  ['Leg_Extensions', 'פשיטת ברכיים'],
  ['Hyperextensions_Back_Extensions', 'פשיטת גב'],
  ['Seated_Leg_Curl', 'כפיפת ברכיים'],
  ['Plank', 'פלאנק'],
  ['Barbell_Hip_Thrust', 'היפ ת\'ראסט'],
  ['Seated_Calf_Raise', 'תאומים בישיבה'],
];

const REMOTE_IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const REMOTE_INDEX_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';

/* kind: weight = משקל וחזרות, body = חזרות בלבד, time = שניות */
const DEFAULT_EXERCISES = {
  chest_press: {
    id: 'chest_press', name: 'לחיצת חזה', sets: 3, reps: '8–10', repsDef: 10, kind: 'weight', step: 5,
    img: 'Machine_Bench_Press',
    tips: ['שכמות אחורה ולמטה, חזה פתוח', 'מרפקים מעט מתחת לגובה הכתפיים', 'דוחפים בנשיפה, חוזרים לאט ובשליטה'],
  },
  cable_row: {
    id: 'cable_row', name: 'חתירה בכבל בישיבה', sets: 3, reps: '10', repsDef: 10, kind: 'weight', step: 5,
    img: 'Seated_Cable_Rows',
    tips: ['גב ישר, בלי להתנדנד קדימה ואחורה', 'מושכים את המרפקים אחורה, צמוד לגוף', 'מכווצים שכמות בסוף התנועה'],
  },
  shoulder_press: {
    id: 'shoulder_press', name: 'לחיצת כתפיים בישיבה', sets: 3, reps: '10', repsDef: 10, kind: 'weight', step: 1,
    img: 'Seated_Dumbbell_Press',
    tips: ['גב צמוד למשענת, בטן אסופה', 'מרפקים מעט לפני קו הגוף', 'לא נועלים מרפקים למעלה'],
  },
  lat_pulldown: {
    id: 'lat_pulldown', name: 'פולי עליון', sets: 3, reps: '10', repsDef: 10, kind: 'weight', step: 5,
    img: 'Wide-Grip_Lat_Pulldown',
    tips: ['מושכים את המוט לחזה העליון', 'מרפקים יורדים למטה, לכיוון הכיסים', 'בלי להישען אחורה ובלי תנופה'],
  },
  lateral_raise: {
    id: 'lateral_raise', name: 'הרחקת כתפיים לצד', sets: 3, reps: '12', repsDef: 12, kind: 'weight', step: 1,
    img: 'Side_Lateral_Raise',
    tips: ['מרפקים מעט כפופים', 'מרימים עד גובה הכתפיים, לא יותר', 'מורידים לאט, בלי תנופה'],
  },
  triceps_pushdown: {
    id: 'triceps_pushdown', name: 'פשיטת מרפקים בכבל', sets: 3, reps: '12', repsDef: 12, kind: 'weight', step: 2.5,
    img: 'Triceps_Pushdown',
    tips: ['מרפקים צמודים לגוף ולא זזים', 'יישור מלא למטה', 'חוזרים לאט עד 90 מעלות'],
  },
  biceps_curl: {
    id: 'biceps_curl', name: 'כפיפת מרפקים', sets: 3, reps: '12', repsDef: 12, kind: 'weight', step: 1,
    img: 'Dumbbell_Bicep_Curl',
    tips: ['מרפקים צמודים לצד הגוף', 'בלי להתנדנד עם הגב', 'מורידים לאט עד יישור כמעט מלא'],
  },
  crunch: {
    id: 'crunch', name: 'כפיפות בטן', sets: 3, reps: '15', repsDef: 15, kind: 'body',
    img: 'Crunches',
    tips: ['גב תחתון צמוד לרצפה', 'מבט לתקרה, סנטר רחוק מהחזה', 'נשיפה בעלייה, לא מושכים בצוואר'],
  },
  squat: {
    id: 'squat', name: 'סקוואט עם מוט', sets: 3, reps: '12', repsDef: 12, kind: 'weight', step: 2.5,
    perSide: true, goalW: 5, target: 'מוט ועוד 5 ק"ג בכל צד',
    img: 'Barbell_Squat',
    tips: ['גב ישר וחזה פתוח', 'ברכיים בכיוון כפות הרגליים', 'יורדים עד שהירך מקבילה לרצפה, עקבים על הקרקע'],
  },
  leg_raise: {
    id: 'leg_raise', name: 'הרמות רגליים בשכיבה', sets: 3, reps: '15', repsDef: 15, kind: 'body',
    img: 'Flat_Bench_Lying_Leg_Raise',
    tips: ['גב תחתון נשאר צמוד למזרן', 'מורידים לאט, בלי לגעת ברצפה', 'רגליים כמעט ישרות'],
  },
  leg_ext: {
    id: 'leg_ext', name: 'פשיטת ברכיים במכונה', sets: 3, reps: '12', repsDef: 12, kind: 'weight', step: 5,
    goalW: 35, target: '35 ק"ג',
    img: 'Leg_Extensions',
    tips: ['גב צמוד למשענת, ציר הברך מול ציר המכונה', 'יישור מלא ועצירה קצרה למעלה', 'יורדים לאט'],
  },
  back_ext: {
    id: 'back_ext', name: 'פשיטת גב (היפר-אקסטנשן)', sets: 3, reps: '10', repsDef: 10, kind: 'body',
    target: 'בלי משקל',
    img: 'Hyperextensions_Back_Extensions',
    tips: ['הכרית מתחת לאגן, לא על הבטן', 'עולים עד קו ישר עם הגוף, לא יותר', 'תנועה איטית, גב ישר'],
  },
  leg_curl: {
    id: 'leg_curl', name: 'כפיפת ברכיים בישיבה במכונה', sets: 3, reps: '12', repsDef: 12, kind: 'weight', step: 7,
    goalW: 42, target: '42 ק"ג',
    img: 'Seated_Leg_Curl',
    tips: ['גב צמוד למשענת, הכרית מעל העקב', 'כפיפה מלאה ועצירה קצרה', 'חוזרים לאט, בלי לשחרר את המשקל'],
  },
  plank: {
    id: 'plank', name: 'פלאנק', sets: 3, reps: '35', repsDef: 35, kind: 'time',
    target: '35 שניות',
    img: 'Plank',
    tips: ['קו ישר מהראש עד העקבים', 'בטן וישבן מכווצים', 'מרפקים מתחת לכתפיים, נושמים רגיל'],
  },
  hip_thrust: {
    id: 'hip_thrust', name: 'היפ ת\'ראסט', sets: 3, reps: '10', repsDef: 10, kind: 'weight', step: 5,
    img: 'Barbell_Hip_Thrust',
    tips: ['שכמות על הספסל, סנטר לכיוון החזה', 'דוחפים דרך העקבים', 'נעילה למעלה עם כיווץ ישבן, בלי להקשית את הגב'],
  },
  calf_raise: {
    id: 'calf_raise', name: 'תאומים בישיבה', sets: 3, reps: '15', repsDef: 15, kind: 'weight', step: 5,
    goalW: 20, target: '20 ק"ג',
    img: 'Seated_Calf_Raise',
    tips: ['עולים הכי גבוה שאפשר ועוצרים שנייה', 'יורדים למתיחה מלאה', 'תנועה איטית, בלי קפיצות'],
  },
};

/* הרשימה שטוחה: כל שני תרגילים רצופים הם זוג (סופרסט) */
const DEFAULT_PLANS = {
  A: {
    id: 'A', name: 'אימון A', sub: 'פלג גוף עליון', runMin: 12,
    list: ['chest_press', 'cable_row', 'shoulder_press', 'lat_pulldown', 'lateral_raise', 'triceps_pushdown', 'biceps_curl', 'crunch'],
  },
  B: {
    id: 'B', name: 'אימון B', sub: 'רגליים ובטן', runMin: 12,
    list: ['squat', 'leg_raise', 'leg_ext', 'back_ext', 'leg_curl', 'plank', 'hip_thrust', 'calf_raise'],
  },
};

const rep3 = (w, r) => [1, 2, 3].map(() => (w === undefined ? { r } : { w, r }));

const SEED_SESSIONS = [
  {
    id: 's-2026-11-10', date: '2026-11-10', plan: 'A', ex: {},
    run: { sec: 630, km: 1.4, kcal: 91 }, feel: 'מצוין', note: '',
  },
  {
    id: 's-2026-11-14', date: '2026-11-14', plan: 'B',
    ex: {
      squat: { name: 'סקוואט עם מוט', sets: rep3(0, 12), note: '' },
      leg_raise: { name: 'הרמות רגליים בשכיבה', sets: rep3(undefined, 12), note: 'קל' },
      leg_ext: { name: 'פשיטת ברכיים במכונה', sets: rep3(35, 12), note: 'מאתגר בסוף' },
      back_ext: { name: 'פשיטת גב (היפר-אקסטנשן)', sets: [], note: 'בוצע' },
      leg_curl: { name: 'כפיפת ברכיים בישיבה במכונה', sets: rep3(42, 12), note: '' },
      plank: { name: 'פלאנק', sets: rep3(undefined, 30), note: '' },
      calf_raise: { name: 'תאומים בישיבה', sets: [{ w: 10, r: null }], note: 'קל' },
    },
    run: { sec: 600, km: 1.32, kcal: 96 }, feel: '', note: '',
  },
];
