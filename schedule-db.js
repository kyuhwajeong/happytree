/**
 * schedule-db.js — v1
 * ─────────────────────────────────────────────────────────────
 * 학원 "일정표" 데이터 관리 모듈 (여름/겨울방학, 공휴일, 일반 일정 등)
 *
 * - 완전히 독립된 모듈: 기존 DB와 별도 Firebase 경로 사용
 * - Firebase 경로: hakwon10/schedules/{id}
 * - 로컬 캐시: localStorage 'hk10b_schedules'
 *
 * 일정(Schedule) 데이터 구조:
 * {
 *   id, title, memo,
 *   category('general'|'vacation-summer'|'vacation-winter'|'holiday'),
 *   startDate('YYYY-MM-DD'), endDate('YYYY-MM-DD'),   // 하루짜리는 start=end
 *   notifyEnabled(true/false), notifyTime('HH:mm'),   // 알림 필요 없는 일정도 등록 가능
 *   notifiedAt(ISO string|null),                      // 알림을 확인 처리한 시각(1회성)
 *   audience('admin'|'all'),
 *   createdAt, createdBy, seedKey(공휴일 자동시딩 항목만)
 * }
 *
 * ★ 공휴일 자동 시딩
 *   최초 1회(버전 플래그 기준)만 대한민국 공휴일을 자동으로 채워 넣는다.
 *   이후에는 완전히 일반 일정과 동일하게 취급되어, 관리자가 자유롭게
 *   수정/삭제할 수 있고 삭제한 항목이 다시 채워지는 일은 없다.
 *   (아래 날짜는 2026-07-26 기준 웹 검색으로 확인한 값이며, 설날·추석·
 *    부처님오신날처럼 음력 기준인 날짜는 정부 고시가 최종 기준이니
 *    혹시 다르면 일정표에서 직접 수정하면 된다 — 코드 수정 불필요)
 */
const ScheduleDB = (() => {
  const LS_KEY  = 'hk10b_schedules';
  const FB_PATH = 'hakwon10/schedules';
  const SEED_META_PATH = 'hakwon10/schedulesMeta/holidaySeedVersion';
  const SEED_VERSION = 1;
  const sid = () => 'sch' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const HOLIDAY_SEED = [
    { date:'2026-01-01', title:'신정' },
    { date:'2026-02-16', title:'설날 연휴' },
    { date:'2026-02-17', title:'설날' },
    { date:'2026-02-18', title:'설날 연휴' },
    { date:'2026-03-01', title:'삼일절' },
    { date:'2026-03-02', title:'삼일절 대체공휴일' },
    { date:'2026-05-05', title:'어린이날' },
    { date:'2026-05-24', title:'부처님오신날' },
    { date:'2026-05-25', title:'부처님오신날 대체공휴일' },
    { date:'2026-06-06', title:'현충일' },
    { date:'2026-08-15', title:'광복절' },
    { date:'2026-08-17', title:'광복절 대체공휴일' },
    { date:'2026-09-24', title:'추석 연휴' },
    { date:'2026-09-25', title:'추석' },
    { date:'2026-09-26', title:'추석 연휴' },
    { date:'2026-10-03', title:'개천절' },
    { date:'2026-10-05', title:'개천절 대체공휴일' },
    { date:'2026-10-09', title:'한글날' },
    { date:'2026-12-25', title:'성탄절' },
    { date:'2027-01-01', title:'신정' },
    { date:'2027-02-06', title:'설날 연휴' },
    { date:'2027-02-07', title:'설날' },
    { date:'2027-02-08', title:'설날 연휴' },
    { date:'2027-02-09', title:'설날 대체공휴일' },
    { date:'2027-03-01', title:'삼일절' },
    { date:'2027-05-05', title:'어린이날' },
    { date:'2027-05-13', title:'부처님오신날' },
    { date:'2027-06-06', title:'현충일' },
    { date:'2027-08-15', title:'광복절' },
    { date:'2027-08-16', title:'광복절 대체공휴일' },
    { date:'2027-09-14', title:'추석 연휴' },
    { date:'2027-09-15', title:'추석' },
    { date:'2027-09-16', title:'추석 연휴' },
    { date:'2027-10-03', title:'개천절' },
    { date:'2027-10-04', title:'개천절 대체공휴일' },
    { date:'2027-10-09', title:'한글날' },
    { date:'2027-10-11', title:'한글날 대체공휴일' },
    { date:'2027-12-25', title:'성탄절' },
    { date:'2027-12-27', title:'성탄절 대체공휴일' },
  ];

  let _list = [];
  let _updatesPaused = false; // ★ 편집 중 서버 갱신 보류용
  function pauseUpdates(v) { _updatesPaused = !!v; }
  const _ev = {};
  function _fire(t) { (_ev[t] || []).forEach(f => { try { f(); } catch (e) {} }); }
  function on(t, f) { if (!_ev[t]) _ev[t] = []; _ev[t].push(f); }

  function _loadLS() { try { _list = JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { _list = []; } }
  function _saveLS() { try { localStorage.setItem(LS_KEY, JSON.stringify(_list)); } catch (e) {} }

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
      console.warn('[ScheduleDB] 초기 로드 실패, 로컬 캐시 사용:', e.message);
    }
    FireDB.listen(FB_PATH, v => {
      if (_updatesPaused) return; // ★ 편집 중엔 서버 갱신을 반영하지 않음(입력 내용 보호)
      _list = v ? Object.values(v) : [];
      _saveLS();
      _fire('schedules');
    });
    _seedHolidaysIfNeeded();
  }

  async function _seedHolidaysIfNeeded() {
    if (typeof FireDB === 'undefined' || !FireDB.ready()) return;
    let done = 0;
    try { done = (await FireDB.get(SEED_META_PATH)) || 0; } catch (e) {}
    if (done >= SEED_VERSION) return;
    const patch = {};
    HOLIDAY_SEED.forEach(h => {
      const id = 'hseed_' + h.date;
      if (_list.find(x => x.id === id)) return; // 이미 있으면(사용자가 수정했더라도) 손대지 않음
      patch[id] = {
        id, title: h.title, memo: '', category: 'holiday',
        startDate: h.date, endDate: h.date,
        notifyEnabled: false, notifyTime: '09:00', notifiedAt: null,
        audience: 'all',
        suppressClasses: false, specialNote: '',
        createdAt: new Date().toISOString(), createdBy: 'system', seedKey: id,
      };
    });
    if (Object.keys(patch).length) {
      _list = [..._list, ...Object.values(patch)];
      _saveLS(); _fire('schedules');
      try { await FireDB.update(FB_PATH, patch); } catch (e) { console.warn('[ScheduleDB] 공휴일 시딩 실패', e); }
    }
    try { await FireDB.set(SEED_META_PATH, SEED_VERSION); } catch (e) {}
  }

  function getAll() { return [..._list].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '')); }
  function getById(id) { return _list.find(x => x.id === id) || null; }
  // from/to: 'YYYY-MM-DD' — 일정 구간이 해당 범위와 조금이라도 겹치면 포함
  function getInRange(from, to) {
    return getAll().filter(x => (x.startDate || '') <= to && (x.endDate || x.startDate || '') >= from);
  }

  async function add(data) {
    const s = {
      id: sid(),
      title: (data.title || '').trim(),
      memo: (data.memo || '').trim(),
      category: data.category || 'general',
      startDate: data.startDate || '',
      endDate: data.endDate || data.startDate || '',
      notifyEnabled: !!data.notifyEnabled,
      notifyTime: data.notifyTime || '09:00',
      notifyDaysBefore: data.notifyDaysBefore || 0, // ★ 도래 며칠 전부터 미리 알릴지(0=당일)
      notifiedAt: null,
      seriesId: data.seriesId || null, // ★ 반복 등록으로 생성된 경우, 같은 반복 묶음을 가리키는 공통 id
      audience: data.audience || 'all',
      suppressClasses: !!data.suppressClasses, // ★ true면 이 기간의 "오늘의 수업"에서 정규 반 목록을 숨김 (방학·임시휴강 등)
      specialNote: (data.specialNote || '').trim(), // ★ 정규 수업 대신 안내할 특강/보충 등 메모
      createdAt: new Date().toISOString(),
      createdBy: (typeof DB !== 'undefined' && DB.getSession) ? (DB.getSession()?.username || '') : '',
    };
    _list.push(s);
    _saveLS(); _fire('schedules');
    if (typeof FireDB !== 'undefined') {
      try { await FireDB.set(`${FB_PATH}/${s.id}`, s); } catch (e) { console.warn('[ScheduleDB] add 서버 저장 실패', e); }
    }
    return s;
  }
  async function update(id, patch) {
    const idx = _list.findIndex(x => x.id === id);
    if (idx < 0) return null;
    // ★ patch에 undefined 값이 섞여 있으면 Firebase가 저장 자체를 거부해서
    //   (연결 상태와 무관하게) 영원히 재시도만 반복하는 상태가 된다.
    //   합치기 전에 걸러내 로컬 상태와 서버 데이터 모양을 항상 일치시킨다.
    const cleanPatch = {};
    for (const k in patch) { if (patch[k] !== undefined) cleanPatch[k] = patch[k]; }
    const s = { ..._list[idx], ...cleanPatch };
    _list[idx] = s;
    _saveLS(); _fire('schedules');
    if (typeof FireDB !== 'undefined') {
      try { await FireDB.set(`${FB_PATH}/${id}`, s); } catch (e) { console.warn('[ScheduleDB] update 서버 저장 실패', e); }
    }
    return s;
  }
  async function remove(id) {
    _list = _list.filter(x => x.id !== id);
    _saveLS(); _fire('schedules');
    if (typeof FireDB !== 'undefined') {
      try { await FireDB.remove(`${FB_PATH}/${id}`); } catch (e) { console.warn('[ScheduleDB] remove 서버 반영 실패', e); }
    }
  }

  return { init, on, getAll, getById, getInRange, add, update, remove, pauseUpdates };
})();
