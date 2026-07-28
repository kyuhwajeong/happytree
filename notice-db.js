/**
 * notice-db.js — v1
 * ─────────────────────────────────────────────────────────────
 * "공지 알림 팝업" 데이터 관리 모듈 (교재비/수업료 등 예약 공지)
 *
 * - 완전히 독립된 모듈: 기존 DB(db.js)와 별도 Firebase 경로 사용
 *   → 기존 진도/반/계정 데이터 구조에 전혀 손대지 않음 (안전)
 * - Firebase 경로: hakwon10/notices/{id}
 * - 로컬 캐시: localStorage 'hk10b_notices' (오프라인 대비)
 *
 * 알림(Notice) 데이터 구조:
 * {
 *   id, title, body, category('textbook'|'tuition'|'general'),
 *   scheduleType('once'|'monthly'),
 *   onceDate('YYYY-MM-DD'),      // scheduleType='once'일 때
 *   monthDay(1~31),              // scheduleType='monthly'일 때
 *   time('HH:mm'),
 *   audience('admin'|'all'),     // 팝업을 볼 대상
 *   active(true/false),
 *   completedPeriods:{ '2026-08'|'2026-08-01': {at, by} }, // 회차별 완료 처리 기록
 *   createdAt, createdBy
 * }
 */
const NoticeDB = (() => {
  const LS_KEY  = 'hk10b_notices';
  const FB_PATH = 'hakwon10/notices';
  const nid = () => 'ntc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  let _list = [];
  const _ev = {};
  function _fire(t) { (_ev[t] || []).forEach(f => { try { f(); } catch (e) {} }); }
  function on(t, f) { if (!_ev[t]) _ev[t] = []; _ev[t].push(f); }

  function _loadLS() {
    try { _list = JSON.parse(localStorage.getItem(LS_KEY)) || []; }
    catch { _list = []; }
  }
  function _saveLS() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(_list)); } catch (e) {}
  }

  async function init() {
    _loadLS();
    if (typeof FireDB === 'undefined' || !FireDB.ready()) return;
    try {
      const snap = await Promise.race([
        FireDB.get(FB_PATH),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
      ]);
      _list = snap ? Object.values(snap) : [];
      _saveLS();
    } catch (e) {
      console.warn('[NoticeDB] 초기 로드 실패, 로컬 캐시 사용:', e.message);
    }
    FireDB.listen(FB_PATH, v => {
      const nd = v ? Object.values(v) : [];
      _list = nd;
      _saveLS();
      _fire('notices');
    });
  }

  function getAll() {
    return [..._list].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  }
  function getById(id) { return _list.find(n => n.id === id) || null; }

  async function add(data) {
    const n = {
      id: nid(),
      title: (data.title || '').trim(),
      body: (data.body || '').trim(),
      category: data.category || 'general',
      scheduleType: data.scheduleType || 'once',
      onceDate: data.onceDate || '',
      monthDay: Math.min(31, Math.max(1, +data.monthDay || 1)),
      time: data.time || '09:00',
      audience: data.audience || 'admin',
      active: data.active !== false,
      completedPeriods: {},
      createdAt: new Date().toISOString(),
      createdBy: (typeof DB !== 'undefined' && DB.getSession) ? (DB.getSession()?.username || '') : '',
    };
    _list.push(n);
    _saveLS(); _fire('notices');
    // ★ 연결 여부와 무관하게 항상 시도 — 오프라인이면 FireDB.set이 자체 큐잉해
    //   재연결 시 자동 재전송한다. 기존엔 FireDB.ready()가 false면 아예 시도조차
    //   안 해서, 그 시점 이후로 서버 전송 재시도 없이 로컬에만 영원히 남는 문제가 있었음.
    if (typeof FireDB !== 'undefined') {
      try { await FireDB.set(`${FB_PATH}/${n.id}`, n); } catch (e) { console.warn('[NoticeDB] add 서버 저장 실패', e); }
    }
    return n;
  }

  async function update(id, patch) {
    const idx = _list.findIndex(n => n.id === id);
    if (idx < 0) return null;
    // ★ patch에 undefined 값이 섞이면 Firebase가 저장을 거부해 연결 상태와
    //   무관하게 영원히 재시도만 반복하게 된다 — 합치기 전에 제거.
    const cleanPatch = {};
    for (const k in patch) { if (patch[k] !== undefined) cleanPatch[k] = patch[k]; }
    const n = { ..._list[idx], ...cleanPatch };
    if (cleanPatch.monthDay !== undefined) n.monthDay = Math.min(31, Math.max(1, +cleanPatch.monthDay || 1));
    _list[idx] = n;
    _saveLS(); _fire('notices');
    if (typeof FireDB !== 'undefined') {
      try { await FireDB.set(`${FB_PATH}/${id}`, n); } catch (e) { console.warn('[NoticeDB] update 서버 저장 실패', e); }
    }
    return n;
  }

  async function remove(id) {
    _list = _list.filter(n => n.id !== id);
    _saveLS(); _fire('notices');
    if (typeof FireDB !== 'undefined') {
      try { await FireDB.remove(`${FB_PATH}/${id}`); } catch (e) { console.warn('[NoticeDB] remove 서버 반영 실패', e); }
    }
  }

  // 특정 회차(periodKey)를 완료 처리 → 모든 기기에서 해당 회차 팝업이 중단됨
  async function markPeriodComplete(id, periodKey) {
    const n = getById(id); if (!n) return null;
    const cp = { ...(n.completedPeriods || {}) };
    cp[periodKey] = {
      at: new Date().toISOString(),
      by: (typeof DB !== 'undefined' && DB.getSession) ? (DB.getSession()?.username || '') : '',
    };
    return update(id, { completedPeriods: cp });
  }
  async function undoPeriodComplete(id, periodKey) {
    const n = getById(id); if (!n) return null;
    const cp = { ...(n.completedPeriods || {}) };
    delete cp[periodKey];
    return update(id, { completedPeriods: cp });
  }

  return { init, on, getAll, getById, add, update, remove, markPeriodComplete, undoPeriodComplete };
})();
