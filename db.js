/**
 * db.js — 학원 진도 관리 로컬 저장소
 *
 * 구조:
 *   hakwon_classes  : [ { id, name, days[], mainBooks[], subBooks[] }, ... ]
 *   hakwon_progress : { "classId|YYYY-WW|dayName|bookName": "진도범위 텍스트" }
 *
 * 날짜 키: ISO week — "2026-W15"
 */

const DB = (() => {

  const CLASSES_KEY  = 'hakwon_classes';
  const PROGRESS_KEY = 'hakwon_progress';

  /* ── 반 (Class) CRUD ─────────────────────── */

  function getClasses() {
    try {
      return JSON.parse(localStorage.getItem(CLASSES_KEY) || '[]');
    } catch { return []; }
  }

  function saveClasses(list) {
    localStorage.setItem(CLASSES_KEY, JSON.stringify(list));
  }

  function addClass(cls) {
    const list = getClasses();
    cls.id = cls.id || Date.now().toString(36);
    list.push(cls);
    saveClasses(list);
    return cls;
  }

  function updateClass(id, data) {
    const list = getClasses();
    const idx  = list.findIndex(c => c.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...data };
    saveClasses(list);
    return list[idx];
  }

  function deleteClass(id) {
    const list = getClasses().filter(c => c.id !== id);
    saveClasses(list);
    // also remove progress entries for this class
    const prog = getProgressAll();
    Object.keys(prog).forEach(k => {
      if (k.startsWith(id + '|')) delete prog[k];
    });
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(prog));
  }

  function getClassById(id) {
    return getClasses().find(c => c.id === id) || null;
  }

  /* ── 진도 (Progress) CRUD ────────────────── */

  function getProgressAll() {
    try {
      return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
    } catch { return {}; }
  }

  /**
   * 특정 반 + 주차의 진도 전체 가져오기
   * @returns { "dayName|bookName": "범위 텍스트" }
   */
  function getWeekProgress(classId, weekKey) {
    const all    = getProgressAll();
    const prefix = classId + '|' + weekKey + '|';
    const result = {};
    Object.keys(all).forEach(k => {
      if (k.startsWith(prefix)) {
        result[k.slice(prefix.length)] = all[k];
      }
    });
    return result;
  }

  /**
   * 여러 진도 한 번에 저장
   * @param entries [{ classId, weekKey, dayName, bookName, value }]
   */
  function saveProgressBatch(entries) {
    const all = getProgressAll();
    entries.forEach(({ classId, weekKey, dayName, bookName, value }) => {
      const key = `${classId}|${weekKey}|${dayName}|${bookName}`;
      if (value === '' || value == null) {
        delete all[key];
      } else {
        all[key] = value;
      }
    });
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  }

  /* ── ISO Week Key 유틸 ───────────────────── */

  /**
   * Date → "YYYY-WNN" (ISO week, Monday-based)
   */
  function toWeekKey(date) {
    const d    = new Date(date);
    d.setHours(0, 0, 0, 0);
    // 목요일이 속한 연도를 기준으로 ISO week 계산
    const thu  = new Date(d);
    thu.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3); // 해당 주 목요일
    const year = thu.getFullYear();
    const jan4 = new Date(year, 0, 4);
    const week = Math.ceil(((thu - jan4) / 86400000 + jan4.getDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  /**
   * "YYYY-WNN" → 해당 주 월요일 Date
   */
  function weekKeyToMonday(weekKey) {
    const [yearStr, wStr] = weekKey.split('-W');
    const year = parseInt(yearStr);
    const week = parseInt(wStr);
    const jan4 = new Date(year, 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
    return monday;
  }

  return {
    getClasses,
    addClass,
    updateClass,
    deleteClass,
    getClassById,
    getWeekProgress,
    saveProgressBatch,
    toWeekKey,
    weekKeyToMonday,
  };
})();
