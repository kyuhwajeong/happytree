/**
 * staff-db.js — v3.0  (알바·정직원 통합 고도화)
 * ════════════════════════════════════════════════════════════════
 *  v3 변경사항
 *  ─────────────────────────────────────────────────────────────
 *  [1] 고용 형태 분기
 *      · employType: 'fulltime'(정직원-월급) | 'parttime'(알바-시급)
 *      · 정직원: monthlySalary 고정 월급, 주휴수당 없음
 *      · 알바: baseHourlyRate (0=최저시급 자동), 주차 자동 계산
 *
 *  [2] 근무 항목 필드 확장
 *      · batch_id   — 일괄 등록 그룹 ID
 *      · breakMin   — 무급 휴게시간(분)
 *      · baseHours  — 기본 시간대 근무(22시 이전)
 *      · nightHours — 야간 시간대 근무(22시 이후)
 *      · appliedRate      — 실제 적용 시급
 *      · appliedNightRate — 야간 시급
 *
 *  [3] 일괄 등록(Batch Insert)
 *      · checkOverlap(sid, dates)  — 중첩 날짜 반환
 *      · batchInsert(sid, opts)    — 범위 일괄 등록, batch_id 부여
 *      · batchDelete(sid, batchId) — batch_id 단위 전체 삭제(Undo)
 *
 *  [4] 주휴수당 자동 계산 (알바 전용)
 *      · 주간 실 근무 ≥ 15h → 주휴수당 = (주간총시간 / 5) × 시급
 *      · getWeeklyStats(sid, year, month) — 주차별 집계
 *
 *  [5] 다중 선택 삭제
 *      · deleteWorkEntries(sid, list:[{date,entryId}]) — 비동기 일괄 삭제
 *
 *  [6] 엑셀 출력 데이터 생성
 *      · buildExcelData(year, month) — SheetJS용 배열 반환
 *
 *  Firebase: hakwon10/staff / hakwon10/staffwork / hakwon10/stafftempl
 *  LocalStorage: hk10b_staff / hk10b_staffwork / hk10b_stafftempl / hk10b_acad
 *
 *  최저시급: 2024=9860 / 2025=10030 / 2026=10320
 * ════════════════════════════════════════════════════════════════
 */
const StaffDB = (() => {
  /* ── Storage Keys ── */
  const LS_STAFF = 'hk10b_staff';
  const LS_WORK  = 'hk10b_staffwork';
  const LS_TEMPL = 'hk10b_stafftempl';
  const LS_ACAD  = 'hk10b_acad';
  const FB_STAFF = 'hakwon10/staff';
  const FB_WORK  = 'hakwon10/staffwork';
  const FB_TEMPL  = 'hakwon10/stafftempl';
  const FB_PAY    = 'hakwon10/staffpay';    // 개인 급여 저장
  const FB_PAYALL = 'hakwon10/staffpayall'; // 전원 일괄 급여

  /* ── 상수 ── */
  const MIN_WAGES    = { 2024: 9860, 2025: 10030, 2026: 10320 };
  const NIGHT_START  = 22 * 60;   // 22:00 (분 단위)
  const DOW_KO       = ['일','월','화','수','목','금','토'];
  const WEEK_DAYS_KO = ['월','화','수','목','금','토','일'];

  /* ── 유틸 ── */
  const _lg  = k     => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const _ls  = (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const _nid = ()    => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const _now = ()    => new Date().toISOString();
  const _fb  = ()    => typeof FireDB !== 'undefined' && FireDB.ready();

  function getMinWage(year) {
    const y = year || new Date().getFullYear();
    return MIN_WAGES[y] || MIN_WAGES[Math.max(...Object.keys(MIN_WAGES).map(Number))];
  }

  /* ── 이벤트 ── */
  const _ev = {};
  function _fire(t) { (_ev[t] || []).forEach(f => { try { f(); } catch(e) { console.warn(e); } }); }
  function on(t, f) { if (!_ev[t]) _ev[t] = []; _ev[t].push(f); }

  /* ── 상태 ── */
  let _staff = [];
  let _work  = {};   // { staffId: { "YYYY-MM-DD": [entry,...] } }
  let _templ = {};   // { staffId: { 월:[entry,...], ... } }
  let _acad   = { name: '해피트리 영어학원' };
  let _pay    = {};  // { "YYYY_MM": { staffId: snapshot } }
  let _payAll = {};  // { "YYYY_MM": summary }

  /* ════════════════════════════════════════
   * 학원 정보
   * ════════════════════════════════════════ */
  const getAcad = () => _acad;
  function setAcad(data) { _acad = { ..._acad, ...data }; _ls(LS_ACAD, _acad); }

  /* ════════════════════════════════════════
   * INIT
   * ════════════════════════════════════════ */
  async function init() {
    _staff = _lg(LS_STAFF) || [];
    /* localStorage 로드 시 날짜 키 변환 (2026_05_15 → 2026-05-15) */
    const _rawWork = _lg(LS_WORK) || {};
    _work = {};
    Object.entries(_rawWork).forEach(([sid, days]) => {
      _work[sid] = {};
      Object.entries(days || {}).forEach(([k, v]) => {
        _work[sid][k.replace(/_/g, '-')] = v;
      });
    });
    _templ = _lg(LS_TEMPL) || {};
    _acad  = { name: '해피트리 영어학원', ...(_lg(LS_ACAD) || {}) };

    /* 기존 데이터 마이그레이션 — employType 없으면 'fulltime' 기본값 */
    _staff = _staff.map(s => ({
      employType:    'fulltime',
      monthlySalary: 0,
      baseHourlyRate: 0,
      overtimeEnabled: false,
      overtimeRate: 1.5,
      overtimeStart: '22:00',
      ...s,
    }));

    if (!_fb()) { console.log('[StaffDB v3] offline'); return; }
    try {
      const [sS, wS, tS] = await Promise.all([
        FireDB.get(FB_STAFF).catch(() => null),
        FireDB.get(FB_WORK).catch(() => null),
        FireDB.get(FB_TEMPL).catch(() => null),
      ]);
      if (sS) {
        _staff = Object.values(sS).map(s => ({
          employType: 'fulltime', monthlySalary: 0, baseHourlyRate: 0,
          overtimeEnabled: false, overtimeRate: 1.5, overtimeStart: '22:00',
          ...s,
        }));
        _ls(LS_STAFF, _staff);
      }
      if (wS) {
        /* Firebase 키: 2026_05_15 → 메모리 키: 2026-05-15 로 변환 */
        _work = {};
        Object.entries(wS).forEach(([sid, days]) => {
          _work[sid] = {};
          Object.entries(days || {}).forEach(([dayKey, entries]) => {
            const dateKey = dayKey.replace(/_/g, '-');
            _work[sid][dateKey] = entries;
          });
        });
        _ls(LS_WORK, _work);
      }
      if (tS) { _templ = tS; _ls(LS_TEMPL, _templ); }
    } catch(e) { console.warn('[StaffDB v3] init', e); }

    FireDB.listen(FB_STAFF, v => {
      const nd = v ? Object.values(v).map(s => ({
        employType: 'fulltime', monthlySalary: 0, baseHourlyRate: 0, ...s,
      })) : [];
      if (JSON.stringify(nd) !== JSON.stringify(_staff)) {
        _staff = nd; _ls(LS_STAFF, _staff); _fire('staff');
      }
    });
    console.log('[StaffDB v3] ✅ staff:', _staff.length);
  }

  /* ════════════════════════════════════════
   * STAFF CRUD
   * ════════════════════════════════════════ */
  const getAll    = () => _staff.slice();
  const getActive = () => _staff.filter(s => s.status !== '퇴직');
  const getById   = id => _staff.find(s => s.id === id) || null;

  async function addStaff(data) {
    const mw = getMinWage();
    const s = {
      id:             _nid(),
      name:           (data.name || '').trim(),
      phone:          (data.phone || '').trim(),
      email:          (data.email || '').trim(),
      address:        (data.address || '').trim(),
      birthDate:      data.birthDate   || '',
      hireDate:       data.hireDate    || '',
      leaveDate:      data.leaveDate   || '',
      status:         data.leaveDate   ? '퇴직' : '재직',
      contractType:   data.contractType || 'regular',  // 정규직|계약직
      employType:     data.employType   || 'fulltime',  // fulltime|parttime
      monthlySalary:  Number(data.monthlySalary)  || 0,
      overtimeEnabled: data.overtimeEnabled === true ? true : false,  // 야근수당 적용 여부 (기본 false)
      overtimeRate:   Number(data.overtimeRate)    || 1.5,   // 야근 배율 (기본 1.5배)
      overtimeStart:  data.overtimeStart || '22:00',         // 야근 시작 시각
      baseHourlyRate: Number(data.baseHourlyRate) || 0,
      classRate:      Number(data.classRate)       || mw,
      generalRate:    Number(data.generalRate)     || mw,
      payDay:         Number(data.payDay)          || 0,
      memo:           (data.memo || '').trim(),
      createdAt:      _now(),
    };
    _staff.push(s); _ls(LS_STAFF, _staff);
    if (_fb()) await FireDB.set(`${FB_STAFF}/${s.id}`, s).catch(console.warn);
    _fire('staff'); return s;
  }

  async function updateStaff(id, data) {
    const i = _staff.findIndex(s => s.id === id); if (i < 0) return null;
    _staff[i] = { ..._staff[i], ...data, updatedAt: _now() };
    _staff[i].status = _staff[i].leaveDate ? '퇴직' : '재직';
    _ls(LS_STAFF, _staff);
    if (_fb()) await FireDB.set(`${FB_STAFF}/${id}`, _staff[i]).catch(console.warn);
    _fire('staff'); return _staff[i];
  }

  async function deleteStaff(id) {
    _staff = _staff.filter(s => s.id !== id); _ls(LS_STAFF, _staff);
    if (_fb()) await FireDB.remove(`${FB_STAFF}/${id}`).catch(console.warn);
    delete _work[id]; delete _templ[id];
    _ls(LS_WORK, _work); _ls(LS_TEMPL, _templ);
    if (_fb()) {
      await FireDB.remove(`${FB_WORK}/${id}`).catch(console.warn);
      await FireDB.remove(`${FB_TEMPL}/${id}`).catch(console.warn);
    }
    _fire('staff');
  }

  /* ════════════════════════════════════════
   * WORK ENTRIES — 기본 CRUD
   * ════════════════════════════════════════ */
  const getWorkDay   = (sid, date) => (_work[sid]?.[date] || []);
  const getWorkMonth = (sid, ym) => {
    const byDay = _work[sid] || {}, result = {};
    Object.keys(byDay).filter(d => d.startsWith(ym)).forEach(d => { result[d] = byDay[d]; });
    return result;
  };
  const getWorkRange = (sid, from, to) => {
    const byDay = _work[sid] || {}, result = {};
    Object.keys(byDay).filter(d => d >= from && d <= to).forEach(d => { result[d] = byDay[d]; });
    return result;
  };

  async function setWorkDay(sid, date, entries) {
    if (!_work[sid]) _work[sid] = {};
    if (entries.length) _work[sid][date] = entries;
    else                delete _work[sid][date];
    _ls(LS_WORK, _work);
    const path = `${FB_WORK}/${sid}/${date.replace(/-/g, '_')}`;
    if (_fb()) {
      if (entries.length) await FireDB.set(path, entries).catch(console.warn);
      else                await FireDB.remove(path).catch(console.warn);
    }
  }

  async function addWorkEntry(sid, date, entry) {
    const entries = getWorkDay(sid, date).slice();
    const e = { id: _nid(), ...entry };
    entries.push(e);
    await setWorkDay(sid, date, entries);
    return e;
  }

  async function deleteWorkEntry(sid, date, entryId) {
    const entries = getWorkDay(sid, date).filter(e => e.id !== entryId);
    await setWorkDay(sid, date, entries);
  }

  /**
   * 근무 항목 수정 (기존 항목을 patch로 덮어씀)
   */
  async function updateWorkEntry(sid, date, entryId, patch) {
    const entries = getWorkDay(sid, date).map(e =>
      e.id === entryId ? { ...e, ...patch, id: e.id } : e
    );
    await setWorkDay(sid, date, entries);
  }

  /**
   * 다중 선택 삭제 (체크박스 삭제)
   * @param {string} sid
   * @param {Array<{date:string, entryId:string}>} list
   */
  async function deleteWorkEntries(sid, list) {
    const byDate = {};
    list.forEach(({ date, entryId }) => {
      if (!byDate[date]) byDate[date] = new Set();
      byDate[date].add(entryId);
    });
    for (const date of Object.keys(byDate)) {
      const filtered = getWorkDay(sid, date).filter(e => !byDate[date].has(e.id));
      await setWorkDay(sid, date, filtered);
    }
    return list.length;
  }

  /* ════════════════════════════════════════
   * 날짜 복사
   * ════════════════════════════════════════ */
  async function copyEntries(sid, fromDate, toDates, mode = 'replace') {
    const src = getWorkDay(sid, fromDate);
    if (!src.length) return 0;
    let copied = 0;
    for (const date of toDates) {
      if (date === fromDate) continue;
      const newEntries = src.map(e => ({ ...e, id: _nid() }));
      const existing   = mode === 'append' ? getWorkDay(sid, date).slice() : [];
      await setWorkDay(sid, date, [...existing, ...newEntries]);
      copied++;
    }
    return copied;
  }

  /* ════════════════════════════════════════
   * 주간 템플릿
   * ════════════════════════════════════════ */
  const getTemplate = sid => _templ[sid] || {};

  async function saveTemplate(sid, tpl) {
    _templ[sid] = tpl;
    _ls(LS_TEMPL, _templ);
    if (_fb()) await FireDB.set(`${FB_TEMPL}/${sid}`, tpl).catch(console.warn);
  }

  async function applyTemplate(sid, year, month, mode = 'replace') {
    const tpl = getTemplate(sid);
    if (!Object.keys(tpl).some(k => (tpl[k] || []).length > 0)) return 0;
    const lastDay = new Date(year, month, 0).getDate();
    let applied = 0;
    for (let day = 1; day <= lastDay; day++) {
      const date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const dow  = DOW_KO[new Date(year, month - 1, day).getDay()];
      const tmplEntries = tpl[dow] || [];
      if (!tmplEntries.length) continue;
      const newEntries = tmplEntries.map(e => ({ ...e, id: _nid() }));
      if (mode === 'append') {
        const existing = getWorkDay(sid, date).slice();
        await setWorkDay(sid, date, [...existing, ...newEntries]);
      } else {
        await setWorkDay(sid, date, newEntries);
      }
      applied++;
    }
    return applied;
  }

  /* ════════════════════════════════════════
   * 야간 시간 분할 유틸
   * ════════════════════════════════════════
   * startTime, endTime: "HH:MM"
   * breakMin: 휴게시간(분)
   * returns { baseHours, nightHours } — 소수점 2자리
   */
  function splitNightHours(startTime, endTime, breakMin = 0) {
    if (!startTime || !endTime) return { baseHours: 0, nightHours: 0 };
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let startMin = sh * 60 + sm;
    let endMin   = eh * 60 + em;
    if (endMin <= startMin) endMin += 1440; // 익일 새벽

    const rawMin = endMin - startMin; // 총 근무(휴게 미차감)
    const grossMin = Math.max(0, rawMin - breakMin);
    if (grossMin <= 0) return { baseHours: 0, nightHours: 0 };

    // 야간 구간: NIGHT_START(22:00=1320분) ~ 익일 06:00(1800분)
    const nightEnd = 6 * 60 + 1440; // 1800

    // raw 기준 야간 분 계산
    let rawNightMin = 0;
    if (endMin > NIGHT_START && startMin < NIGHT_START) {
      rawNightMin = Math.min(endMin, nightEnd) - NIGHT_START;
    } else if (startMin >= NIGHT_START) {
      rawNightMin = Math.min(endMin, nightEnd) - startMin;
    } else if (endMin > nightEnd) {
      rawNightMin = rawMin; // 0~06 전체 야간
    }
    rawNightMin = Math.max(0, rawNightMin);
    const rawBaseMin = rawMin - rawNightMin;

    // 휴게시간을 비율로 배분
    const nightBreakMin = rawMin > 0 ? Math.round(breakMin * rawNightMin / rawMin) : 0;
    const baseBreakMin  = breakMin - nightBreakMin;

    const finalBaseMin  = Math.max(0, rawBaseMin  - baseBreakMin);
    const finalNightMin = Math.max(0, rawNightMin - nightBreakMin);

    return {
      baseHours:  Math.round(finalBaseMin  / 60 * 100) / 100,
      nightHours: Math.round(finalNightMin / 60 * 100) / 100,
    };
  }

  /* 시급 결정 */
  function resolveRate(sid, manualRate, year) {
    if (manualRate && manualRate > 0) return manualRate;
    const s = getById(sid);
    if (s?.baseHourlyRate > 0) return s.baseHourlyRate;
    return getMinWage(year || new Date().getFullYear());
  }

  /* ════════════════════════════════════════
   * 중첩 감지
   * ════════════════════════════════════════ */
  /**
   * @param {string} sid
   * @param {string[]} dates — "YYYY-MM-DD" 배열
   * @returns {string[]} 기존 데이터가 있는 날짜들
   */
  function checkOverlap(sid, dates) {
    return dates.filter(d => (getWorkDay(sid, d)).length > 0);
  }

  /* ════════════════════════════════════════
   * 일괄 등록 (Batch Insert)
   * ════════════════════════════════════════
   * opts: {
   *   startDate:  "YYYY-MM-DD",
   *   endDate:    "YYYY-MM-DD",
   *   daysOfWeek: [0..6] (0=일)  — undefined=모든 요일
   *   startTime:  "HH:MM",
   *   endTime:    "HH:MM",
   *   breakMin:   number (기본 0),
   *   type:       'class'|'general',
   *   hourlyRate: number (0=자동),
     *   note:       string,
   *   overwrite:  boolean (중첩 덮어쓰기 여부)
   * }
   * @returns { batchId, count, dates, skipped }
   */
  async function batchInsert(sid, opts) {
    const {
      startDate, endDate, daysOfWeek, startTime, endTime,
      breakMin = 0, type = 'general', hourlyRate = 0,
      note = '', overwrite = true,
    } = opts;

    if (!startDate || !endDate || !startTime || !endTime) {
      throw new Error('필수 입력값이 없습니다');
    }

    const year = new Date(startDate).getFullYear();
    const appliedRate      = resolveRate(sid, hourlyRate, year);
    const { baseHours, nightHours } = splitNightHours(startTime, endTime, breakMin);
    const hours = baseHours + nightHours;

    // 날짜 범위 생성
    const dates = [];
    let cur = new Date(startDate);
    const end = new Date(endDate);
    while (cur <= end) {
      const dow = cur.getDay(); // 0=일
      if (!daysOfWeek || daysOfWeek.includes(dow)) {
        dates.push(cur.toISOString().slice(0, 10));
      }
      cur.setDate(cur.getDate() + 1);
    }

    const batchId = _nid();
    let count = 0, skipped = 0;

    for (const date of dates) {
      const existing = getWorkDay(sid, date);
      if (existing.length > 0 && !overwrite) { skipped++; continue; }

      const entry = {
        id:               _nid(),
        batch_id:         batchId,
        type,
        start:            startTime,
        end:              endTime,
        breakMin,
        hours,
        baseHours,
        nightHours,
        appliedRate,
        note,
      };

      const newEntries = overwrite ? [entry] : [...existing, entry];
      await setWorkDay(sid, date, newEntries);
      count++;
    }

    return { batchId, count, dates, skipped };
  }

  /* ════════════════════════════════════════
   * 일괄 삭제 (Undo Batch)
   * ════════════════════════════════════════ */
  async function batchDelete(sid, batchId) {
    const byDay = _work[sid] || {};
    let deleted = 0;
    for (const date of Object.keys(byDay)) {
      const before = byDay[date];
      const after  = before.filter(e => e.batch_id !== batchId);
      if (after.length !== before.length) {
        await setWorkDay(sid, date, after);
        deleted += (before.length - after.length);
      }
    }
    return deleted;
  }

  /* ════════════════════════════════════════
   * 주차별 집계 (알바 주휴수당용)
   * ════════════════════════════════════════
   * @returns {Array<{weekLabel, weekStart, weekEnd, hours, holidayPay, holidayHours, qualified}>}
   */
  function getWeeklyStats(sid, year, month) {
    const s = getById(sid);
    if (!s || s.employType !== 'parttime') return [];

    // 해당 월 전후 포함해 월요일 기준 주차 범위 계산
    const monthStr = `${year}-${String(month).padStart(2,'0')}`;
    const { from, to } = getMonthRange(year, month);
    const work = getWorkRange(sid, from, to);

    // 해당 월의 모든 날짜를 월요일 기준 주차로 그룹화
    const weeks = {};
    const allDates = Object.keys(work).sort();

    allDates.forEach(date => {
      const d   = new Date(date);
      const dow = d.getDay(); // 0=일
      // 이번 주 월요일 계산
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(d);
      monday.setDate(d.getDate() + mondayOffset);
      const weekKey = monday.toISOString().slice(0, 10);

      if (!weeks[weekKey]) {
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        weeks[weekKey] = {
          weekStart: monday.toISOString().slice(0, 10),
          weekEnd:   sunday.toISOString().slice(0, 10),
          hours: 0,
          entries: 0,
        };
      }

      const entries = work[date] || [];
      entries.forEach(e => {
        weeks[weekKey].hours += Number(e.hours || (e.baseHours || 0) + (e.nightHours || 0));
        weeks[weekKey].entries++;
      });
    });

    const hourlyRate = s.baseHourlyRate > 0 ? s.baseHourlyRate : getMinWage(year);
    const result = [];
    const weekKeys = Object.keys(weeks).sort();

    weekKeys.forEach((key, i) => {
      const w = weeks[key];
      const h = Math.round(w.hours * 100) / 100;
      const qualified = h >= 15;
      const holidayHours = qualified ? Math.round((h / 5) * 100) / 100 : 0;
      const holidayPay   = qualified ? Math.round(holidayHours * hourlyRate) : 0;
      result.push({
        weekLabel:    `${i + 1}주차 (${w.weekStart.slice(5)} ~ ${w.weekEnd.slice(5)})`,
        weekStart:    w.weekStart,
        weekEnd:      w.weekEnd,
        hours:        h,
        qualified,
        holidayHours,
        holidayPay,
      });
    });

    return result;
  }

  /* ════════════════════════════════════════
   * 이번 주 근무시간 (실시간 프로그레스용)
   * ════════════════════════════════════════ */
  function getCurrentWeekHours(sid) {
    const today = new Date();
    const dow   = today.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const from = monday.toISOString().slice(0, 10);
    const to   = sunday.toISOString().slice(0, 10);
    const work = getWorkRange(sid, from, to);

    let hours = 0;
    Object.values(work).forEach(entries =>
      entries.forEach(e => {
        hours += Number(e.hours || (e.baseHours || 0) + (e.nightHours || 0));
      })
    );
    return Math.round(hours * 100) / 100;
  }

  /* ════════════════════════════════════════
   * 급여 계산 — v3
   * ════════════════════════════════════════ */
  function getMonthRange(year, month) {
    const y = String(year), m = String(month).padStart(2, '0');
    const last = new Date(year, month, 0).getDate();
    return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2,'0')}` };
  }

  function calcPay(sid, year, month) {
    const s = getById(sid); if (!s) return null;
    const { from, to } = getMonthRange(year, month);
    const work = getWorkRange(sid, from, to);

    /* ─ 공통: 일별 집계 ─ */
    let classHrs = 0, generalHrs = 0;
    const byDay = {};
    Object.keys(work).sort().forEach(date => {
      const entries = work[date];
      let dc = 0, dg = 0, dBase = 0, dNight = 0;
      entries.forEach(e => {
        const bh = Number(e.baseHours  || (e.type !== 'night' ? (e.hours || 0) : 0));
        const nh = Number(e.nightHours || 0);
        const h  = Math.round((bh + nh) * 100) / 100;
        if (e.type === 'class') dc += h; else dg += h;
        dBase += bh; dNight += nh;
      });
      classHrs   += dc;
      generalHrs += dg;
      byDay[date] = { classHrs: dc, generalHrs: dg, entries };
    });
    classHrs   = Math.round(classHrs   * 100) / 100;
    generalHrs = Math.round(generalHrs * 100) / 100;

    /* ─ 정직원: 고정 월급 (+ 야근수당 옵션) ─ */
    if (s.employType === 'fulltime') {
      const classPay   = Math.round(classHrs * s.classRate);
      const generalPay = Math.round(generalHrs * s.generalRate);
      const workPay    = classPay + generalPay;

      // 야근수당 계산 (overtimeEnabled === true 일 때만)
      let overtimePay = 0;
      const otEnabled = s.overtimeEnabled === true;
      if (otEnabled) {
        const otRate  = Number(s.overtimeRate)  || 1.5;
        const otStart = s.overtimeStart || '22:00';
        const [otH, otM] = otStart.split(':').map(Number);
        const otStartMin = otH * 60 + otM;

        Object.values(work).forEach(entries => {
          entries.forEach(e => {
            if (!e.start || !e.end) return;
            const { nightHours } = splitNightHours(e.start, e.end, 0);
            if (nightHours <= 0) return;
            // 야근 시간 × (배율-1) × 해당 시급  → 추가 가산분만
            const baseR = e.type === 'class' ? s.classRate : s.generalRate;
            overtimePay += Math.round(nightHours * baseR * (otRate - 1));
          });
        });
      }

      const totalPay = s.monthlySalary > 0
        ? s.monthlySalary + overtimePay
        : workPay + overtimePay;

      return {
        type: 'fulltime',
        classPay, generalPay, workPay, overtimePay, totalPay,
        classHrs, generalHrs,
        monthlyFixed: s.monthlySalary > 0,
        otEnabled,
        weeklyStats: [],
        totalHolidayPay: 0,
        byDay, staff: s, from, to, year, month,
      };
    }

    /* ─ 알바: 시급 계산 + 주휴수당 ─
     * 시급 우선순위: appliedRate(등록 시 지정) > type별 시급(수업/일반) > 기본시급 > 최저시급
     */
    const mw          = getMinWage(year);
    const defaultRate = s.baseHourlyRate > 0 ? s.baseHourlyRate : mw;
    const classRate_  = s.classRate   > 0 ? s.classRate   : defaultRate;
    const generalRate_= s.generalRate > 0 ? s.generalRate : defaultRate;

    let basePay = 0, classPayPt = 0, generalPayPt = 0;
    Object.values(work).forEach(entries => {
      entries.forEach(e => {
        const h = Number(e.hours || (e.baseHours || 0) + (e.nightHours || 0));
        // appliedRate 우선, 없으면 type에 맞는 시급
        const typeRate = e.type === 'class' ? classRate_ : generalRate_;
        const rate     = Number(e.appliedRate) > 0 ? Number(e.appliedRate) : typeRate;
        const pay      = h * rate;
        basePay += pay;
        if (e.type === 'class') classPayPt += pay; else generalPayPt += pay;
      });
    });
    basePay      = Math.round(basePay);
    classPayPt   = Math.round(classPayPt);
    generalPayPt = Math.round(generalPayPt);

    // 주휴수당
    const weeklyStats     = getWeeklyStats(sid, year, month);
    const totalHolidayPay = weeklyStats.reduce((sum, w) => sum + w.holidayPay, 0);
    const totalPay        = basePay + totalHolidayPay;

    return {
      type: 'parttime',
      basePay, classPayPt, generalPayPt, totalHolidayPay, totalPay,
      classHrs, generalHrs,
      classRate: classRate_, generalRate: generalRate_,
      defaultRate,
      weeklyStats,
      byDay, staff: s, from, to, year, month,
    };
  }


  /* ════════════════════════════════════════
   * 급여 저장 / 조회 (Firebase + 메모리)
   * ════════════════════════════════════════ */

  async function savePayResult(sid, year, month, result) {
    const key = `${year}_${String(month).padStart(2,'0')}`;
    const s   = getById(sid);
    const snapshot = {
      sid, year, month, key, savedAt: _now(),
      staffName:    s?.name        || '',
      employType:   s?.employType  || 'fulltime',
      type:         result.type,
      totalPay:     result.totalPay,
      classHrs:     result.classHrs,
      generalHrs:   result.generalHrs,
      classPayPt:   result.classPayPt   || 0,
      generalPayPt: result.generalPayPt || 0,
      basePay:      result.basePay      || 0,
      classPay:     result.classPay     || 0,
      generalPay:   result.generalPay   || 0,
      workPay:      result.workPay      || 0,
      overtimePay:  result.overtimePay  || 0,
      totalHolidayPay: result.totalHolidayPay || 0,
      monthlyFixed: result.monthlyFixed || false,
      from: result.from, to: result.to,
      weeklyStats: (result.weeklyStats || []).map(w => ({
        weekLabel: w.weekLabel, hours: w.hours,
        qualified: w.qualified, holidayPay: w.holidayPay,
      })),
      byDaySummary: Object.fromEntries(
        Object.entries(result.byDay || {}).map(([date, d]) => [
          date, { classHrs: d.classHrs||0, generalHrs: d.generalHrs||0, count: (d.entries||[]).length }
        ])
      ),
    };
    if (!_pay[key]) _pay[key] = {};
    _pay[key][sid] = snapshot;
    if (_fb()) await FireDB.set(`${FB_PAY}/${key}/${sid}`, snapshot).catch(console.warn);
    return snapshot;
  }

  async function savePayAllResult(year, month, results) {
    const key = `${year}_${String(month).padStart(2,'0')}`;
    const summary = {
      year, month, key, savedAt: _now(),
      totalStaff: results.length,
      grandTotal: results.reduce((sum, { r }) => sum + (r?.totalPay || 0), 0),
      items: results.map(({ sid, r }) => {
        const s = getById(sid);
        return {
          sid, staffName: s?.name||'', employType: s?.employType||'fulltime',
          totalPay: r?.totalPay||0, classHrs: r?.classHrs||0,
          generalHrs: r?.generalHrs||0, totalHolidayPay: r?.totalHolidayPay||0,
        };
      }),
    };
    _payAll[key] = summary;
    if (_fb()) await FireDB.set(`${FB_PAYALL}/${key}`, summary).catch(console.warn);
    return summary;
  }

  function getSavedPay(sid, year, month) {
    const key = `${year}_${String(month).padStart(2,'0')}`;
    return _pay[key]?.[sid] || null;
  }

  function getPayHistory(sid) {
    return Object.values(_pay)
      .map(m => m[sid]).filter(Boolean)
      .sort((a,b) => b.key > a.key ? 1 : -1);
  }

  function getPayAllHistory(year) {
    return Object.entries(_payAll)
      .filter(([k]) => k.startsWith(String(year)))
      .map(([,v]) => v).sort((a,b) => b.month - a.month);
  }

  async function syncPayHistory() {
    if (!_fb()) return;
    try {
      const [pD, paD] = await Promise.all([
        FireDB.get(FB_PAY).catch(() => null),
        FireDB.get(FB_PAYALL).catch(() => null),
      ]);
      if (pD)  _pay    = pD;
      if (paD) _payAll = paD;
      console.log('[StaffDB] 급여 이력 동기화 완료');
    } catch(e) { console.warn('[StaffDB] syncPayHistory', e); }
  }

  async function deletePayResult(sid, year, month) {
    const key = `${year}_${String(month).padStart(2,'0')}`;
    if (_pay[key]?.[sid]) {
      delete _pay[key][sid];
      if (!Object.keys(_pay[key]).length) delete _pay[key];
      if (_fb()) await FireDB.remove(`${FB_PAY}/${key}/${sid}`).catch(console.warn);
    }
  }


  /**
   * 특정 직원의 근무 데이터를 Firebase에서 강제 재로드
   * 멀티기기 사용 시 최신 데이터 보장용
   */
  async function syncWorkData(sid) {
    if (!_fb()) return;
    const data = await FireDB.get(`${FB_WORK}/${sid}`).catch(() => null);
    if (!data) { _work[sid] = {}; return; }
    // Firebase 키 변환: 2026_06_24 → 2026-06-24
    _work[sid] = {};
    Object.entries(data).forEach(([dayKey, entries]) => {
      _work[sid][dayKey.replace(/_/g, '-')] = entries;
    });
    console.log(`[StaffDB] syncWorkData(${sid}): ${Object.keys(_work[sid]).length}일`);
  }

  /* ════════════════════════════════════════
   * 엑셀 출력 데이터 생성 (SheetJS 용)
   * ════════════════════════════════════════ */
  function buildExcelData(year, month) {
    const staff = getActive();
    const rows  = [];

    rows.push([
      '직원명', '고용형태', '계약유형',
      '총근무일', '수업(h)', '일반(h)',
      '기본급(원)', '주휴수당(원)', '최종지급액(원)',
      '주휴수당해당주차', '비고',
    ]);

    staff.forEach(s => {
      const r = calcPay(s.id, year, month);
      if (!r) return;

      const totalDays  = Object.keys(r.byDay).length;

      const holidayWks = r.weeklyStats?.filter(w => w.qualified).map(w => w.weekLabel).join(' / ') || '';

      if (r.type === 'fulltime') {
        rows.push([
          s.name,
          '정직원',
          s.contractType === 'contract' ? '계약직' : '정규직',
          totalDays,
          r.classHrs,
          r.generalHrs,
          r.monthlyFixed ? s.monthlySalary : r.workPay,
          0,
          r.totalPay,
          '-',
          s.monthlySalary > 0 ? '고정월급' : '시급합산',
        ]);
      } else {
        rows.push([
          s.name,
          '알바',
          s.contractType === 'contract' ? '계약직' : '정규직',
          totalDays,
          r.classHrs,
          r.generalHrs,
          r.basePay,
          r.totalHolidayPay,
          r.totalPay,
          holidayWks || '없음',
          `기본시급 ${r.hourlyRate.toLocaleString()}원`,
        ]);
      }
    });

    return rows;
  }

  /* ════════════════════════════════════════
   * 퍼블릭 API
   * ════════════════════════════════════════ */
  return {
    /* 초기화 */
    init, on,
    /* 유틸 */
    getMinWage, getAcad, setAcad,
    DOW_KO, WEEK_DAYS_KO,
    /* 직원 */
    getAll, getActive, getById,
    addStaff, updateStaff, deleteStaff,
    /* 근무 */
    getWorkDay, getWorkMonth, getWorkRange,
    setWorkDay, addWorkEntry, deleteWorkEntry, updateWorkEntry,
    syncWorkData,
    deleteWorkEntries, copyEntries,
    /* 일괄 등록 */
    checkOverlap, batchInsert, batchDelete,
    /* 야간 분할 */
    splitNightHours, resolveRate,
    /* 템플릿 */
    getTemplate, saveTemplate, applyTemplate,
    /* 집계/계산 */
    getWeeklyStats, getCurrentWeekHours,
    calcPay, getMonthRange,
    /* 엑셀 */
    buildExcelData,
    /* 급여 저장/조회 */
    savePayResult, savePayAllResult,
    getSavedPay, getPayHistory,
    getPayAllHistory, syncPayHistory,
    deletePayResult,
  };
})();
