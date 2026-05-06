/**
 * staff-db.js — v2.0
 * 직원 관리 + 근무시간 + 급여 계산 데이터 모듈
 *
 * v2 변경사항
 * ─────────────────
 * · 주간 템플릿 추가 (hakwon10/stafftempl/{staffId})
 *   { 월:[{type,start,end,hours,note}], 화:[], ... }
 * · applyTemplate(staffId, year, month, overwrite) — 템플릿을 해당 월에 적용
 * · copyEntries(staffId, fromDate, toDates) — 날짜 복사
 * · 소수점 시간(hours) 지원 — toFixed(2) 기준
 *
 * Firebase 경로: hakwon10/staff / hakwon10/staffwork / hakwon10/stafftempl
 * LocalStorage : hk10b_staff / hk10b_staffwork / hk10b_stafftempl / hk10b_acad
 *
 * 최저시급: 2024=9860 / 2025=10030 / 2026=10320
 */
const StaffDB = (() => {
  const LS_STAFF  = 'hk10b_staff';
  const LS_WORK   = 'hk10b_staffwork';
  const LS_TEMPL  = 'hk10b_stafftempl';
  const LS_ACAD   = 'hk10b_acad';
  const FB_STAFF  = 'hakwon10/staff';
  const FB_WORK   = 'hakwon10/staffwork';
  const FB_TEMPL  = 'hakwon10/stafftempl';

  const MIN_WAGES = { 2024:9860, 2025:10030, 2026:10320 };
  const DOW_KO    = ['일','월','화','수','목','금','토'];

  function getMinWage(year) {
    const y = year || new Date().getFullYear();
    return MIN_WAGES[y] || MIN_WAGES[Math.max(...Object.keys(MIN_WAGES).map(Number))];
  }

  const _lg  = k     => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const _ls  = (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const _nid = ()    => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const _now = ()    => new Date().toISOString();
  const _today = ()  => new Date().toISOString().slice(0,10);
  const _fb  = ()    => typeof FireDB !== 'undefined' && FireDB.ready();

  const _ev = {};
  function _fire(t) { (_ev[t]||[]).forEach(f=>{try{f();}catch(e){console.warn(e);}}); }
  function on(t,f)   { if(!_ev[t]) _ev[t]=[]; _ev[t].push(f); }

  let _staff  = [];
  let _work   = {};    // { staffId: { "YYYY-MM-DD": [entry,...] } }
  let _templ  = {};    // { staffId: { 월:[entry,...], 화:[], ... } }
  let _acad   = { name:'해피트리 영어학원' };

  /* ══ 학원 정보 ══ */
  const getAcad = () => _acad;
  function setAcad(data) { _acad = {..._acad, ...data}; _ls(LS_ACAD, _acad); }

  /* ══ INIT ══ */
  async function init() {
    _staff = _lg(LS_STAFF)  || [];
    _work  = _lg(LS_WORK)   || {};
    _templ = _lg(LS_TEMPL)  || {};
    _acad  = { name:'해피트리 영어학원', ...(_lg(LS_ACAD)||{}) };
    if (!_fb()) { console.log('[StaffDB] offline'); return; }
    try {
      const [sS,wS,tS] = await Promise.all([
        FireDB.get(FB_STAFF).catch(()=>null),
        FireDB.get(FB_WORK).catch(()=>null),
        FireDB.get(FB_TEMPL).catch(()=>null),
      ]);
      if (sS) { _staff = Object.values(sS); _ls(LS_STAFF,_staff); }
      if (wS) { _work  = wS; _ls(LS_WORK,_work); }
      if (tS) { _templ = tS; _ls(LS_TEMPL,_templ); }
    } catch(e) { console.warn('[StaffDB] init',e); }
    FireDB.listen(FB_STAFF, v => {
      const nd = v ? Object.values(v) : [];
      if (JSON.stringify(nd) !== JSON.stringify(_staff)) {
        _staff = nd; _ls(LS_STAFF,_staff); _fire('staff');
      }
    });
    console.log('[StaffDB] ✅ v2, staff:', _staff.length);
  }

  /* ══ STAFF CRUD ══ */
  const getAll    = () => _staff.slice();
  const getActive = () => _staff.filter(s => s.status !== '퇴직');
  const getById   = id => _staff.find(s => s.id === id) || null;

  async function addStaff(data) {
    const mw = getMinWage();
    const s = {
      id:          _nid(),
      name:        (data.name||'').trim(),
      phone:       (data.phone||'').trim(),
      email:       (data.email||'').trim(),
      address:     (data.address||'').trim(),
      birthDate:   data.birthDate  || '',
      hireDate:    data.hireDate   || '',
      leaveDate:   data.leaveDate  || '',
      status:      data.leaveDate ? '퇴직' : '재직',
      contractType: data.contractType || 'regular', // 'regular'|'contract'
      classRate:   Number(data.classRate)   || mw,
      generalRate: Number(data.generalRate) || mw,
      payDay:      Number(data.payDay)      || 0,
      memo:        (data.memo||'').trim(),
      createdAt:   _now(),
    };
    _staff.push(s); _ls(LS_STAFF,_staff);
    if (_fb()) await FireDB.set(`${FB_STAFF}/${s.id}`, s).catch(console.warn);
    _fire('staff'); return s;
  }

  async function updateStaff(id, data) {
    const i = _staff.findIndex(s=>s.id===id); if(i<0) return null;
    _staff[i] = { ..._staff[i], ...data, updatedAt:_now() };
    _staff[i].status = _staff[i].leaveDate ? '퇴직' : '재직';
    _ls(LS_STAFF,_staff);
    if (_fb()) await FireDB.set(`${FB_STAFF}/${id}`, _staff[i]).catch(console.warn);
    _fire('staff'); return _staff[i];
  }

  async function deleteStaff(id) {
    _staff = _staff.filter(s=>s.id!==id); _ls(LS_STAFF,_staff);
    if (_fb()) await FireDB.remove(`${FB_STAFF}/${id}`).catch(console.warn);
    delete _work[id]; delete _templ[id];
    _ls(LS_WORK,_work); _ls(LS_TEMPL,_templ);
    if (_fb()) {
      await FireDB.remove(`${FB_WORK}/${id}`).catch(console.warn);
      await FireDB.remove(`${FB_TEMPL}/${id}`).catch(console.warn);
    }
    _fire('staff');
  }

  /* ══ WORK ENTRIES ══ */
  const getWorkDay   = (sid, date) => (_work[sid]?.[date] || []);
  const getWorkMonth = (sid, ym)   => {
    const byDay = _work[sid] || {}, result = {};
    Object.keys(byDay).filter(d=>d.startsWith(ym)).forEach(d=>{ result[d]=byDay[d]; });
    return result;
  };
  const getWorkRange = (sid, from, to) => {
    const byDay = _work[sid] || {}, result = {};
    Object.keys(byDay).filter(d=>d>=from&&d<=to).forEach(d=>{ result[d]=byDay[d]; });
    return result;
  };

  async function setWorkDay(sid, date, entries) {
    if (!_work[sid]) _work[sid] = {};
    if (entries.length) _work[sid][date] = entries;
    else                delete _work[sid][date];
    _ls(LS_WORK,_work);
    const path = `${FB_WORK}/${sid}/${date.replace(/-/g,'_')}`;
    if (_fb()) {
      if (entries.length) await FireDB.set(path, entries).catch(console.warn);
      else                await FireDB.remove(path).catch(console.warn);
    }
  }

  async function addWorkEntry(sid, date, entry) {
    const entries = getWorkDay(sid, date).slice();
    const e = { id:_nid(), ...entry };
    entries.push(e);
    await setWorkDay(sid, date, entries);
    return e;
  }

  async function deleteWorkEntry(sid, date, entryId) {
    const entries = getWorkDay(sid, date).filter(e=>e.id!==entryId);
    await setWorkDay(sid, date, entries);
  }

  /**
   * 특정 날짜의 근무를 여러 날짜에 복사
   * @param {string} sid
   * @param {string} fromDate "YYYY-MM-DD"
   * @param {string[]} toDates
   * @param {'replace'|'append'} mode
   */
  async function copyEntries(sid, fromDate, toDates, mode='replace') {
    const src = getWorkDay(sid, fromDate);
    if (!src.length) return 0;
    let copied = 0;
    for (const date of toDates) {
      if (date === fromDate) continue;
      const newEntries = src.map(e => ({...e, id:_nid()}));
      const existing   = mode==='append' ? getWorkDay(sid, date).slice() : [];
      await setWorkDay(sid, date, [...existing, ...newEntries]);
      copied++;
    }
    return copied;
  }

  /* ══ 주간 템플릿 ══ */

  /** 템플릿 조회 */
  const getTemplate = sid => _templ[sid] || {};

  /**
   * 템플릿 저장
   * @param {string} sid
   * @param {object} tpl { 월:[entries], 화:[], 수:[], 목:[], 금:[], 토:[], 일:[] }
   */
  async function saveTemplate(sid, tpl) {
    _templ[sid] = tpl;
    _ls(LS_TEMPL, _templ);
    if (_fb()) await FireDB.set(`${FB_TEMPL}/${sid}`, tpl).catch(console.warn);
  }

  /**
   * 템플릿을 특정 연월에 적용
   * @param {string} sid
   * @param {number} year
   * @param {number} month
   * @param {'replace'|'append'} mode  기존 데이터 처리 방식
   * @returns {number} 적용된 날짜 수
   */
  async function applyTemplate(sid, year, month, mode='replace') {
    const tpl = getTemplate(sid);
    if (!Object.keys(tpl).some(k => (tpl[k]||[]).length > 0)) return 0;
    const lastDay = new Date(year, month, 0).getDate();
    let applied = 0;
    for (let day = 1; day <= lastDay; day++) {
      const date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const dow  = DOW_KO[new Date(year, month-1, day).getDay()];
      const tmplEntries = tpl[dow] || [];
      if (!tmplEntries.length) continue;
      const newEntries = tmplEntries.map(e => ({...e, id:_nid()}));
      if (mode === 'append') {
        const existing = getWorkDay(sid, date).slice();
        await setWorkDay(sid, date, [...existing, ...newEntries]);
      } else {
        // replace: 템플릿 있는 요일만 덮어쓰기, 없는 요일 기존 유지
        await setWorkDay(sid, date, newEntries);
      }
      applied++;
    }
    return applied;
  }

  /* ══ 급여 계산 ══ */
  function getMonthRange(year, month) {
    const y = String(year), m = String(month).padStart(2,'0');
    const last = new Date(year, month, 0).getDate();
    return { from:`${y}-${m}-01`, to:`${y}-${m}-${String(last).padStart(2,'0')}` };
  }

  function calcPay(sid, year, month) {
    const s = getById(sid); if (!s) return null;
    const { from, to } = getMonthRange(year, month);
    const work = getWorkRange(sid, from, to);

    let classHrs = 0, generalHrs = 0;
    const byDay = {};
    Object.keys(work).sort().forEach(date => {
      const entries = work[date];
      let dc=0, dg=0;
      entries.forEach(e => {
        const h = Math.round(Number(e.hours||0) * 100) / 100;
        if (e.type==='class') dc+=h; else dg+=h;
      });
      classHrs+=dc; generalHrs+=dg;
      byDay[date] = { classHrs:dc, generalHrs:dg, entries };
    });

    /* 소수점 2자리 반올림 */
    classHrs   = Math.round(classHrs   * 100) / 100;
    generalHrs = Math.round(generalHrs * 100) / 100;

    const classPay   = Math.round(classHrs   * s.classRate);
    const generalPay = Math.round(generalHrs * s.generalRate);
    const totalPay   = classPay + generalPay;

    return { classPay, generalPay, totalPay, classHrs, generalHrs,
             byDay, staff:s, from, to, year, month };
  }

  return {
    init, on, getMinWage, getAcad, setAcad, DOW_KO,
    getAll, getActive, getById,
    addStaff, updateStaff, deleteStaff,
    getWorkDay, getWorkMonth, getWorkRange,
    setWorkDay, addWorkEntry, deleteWorkEntry, copyEntries,
    getTemplate, saveTemplate, applyTemplate,
    calcPay, getMonthRange,
  };
})();
