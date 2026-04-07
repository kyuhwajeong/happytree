/**
 * db.js — v5 하이브리드 저장소 (완전 재작성)
 *
 * 핵심 수정:
 *  - init()이 Firebase 데이터를 먼저 완전히 로드한 뒤 앱 시작
 *  - Firebase 실패 시 즉시 localStorage 모드로 폴백
 *  - 타임아웃(5초) 초과 시 강제로 앱 시작
 *  - 진도 자동저장: debounce 800ms
 */

const DB = (() => {

  /* ── localStorage 키 ────────────────────── */
  const LS = {
    classes:  'hk5_classes',
    progress: 'hk5_progress',
    accounts: 'hk5_accounts',
    theme:    'hk5_theme',
    session:  'hk5_session',
  };

  const lsGet  = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const lsSet  = (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const newId  = () => Date.now().toString(36) + Math.random().toString(36).slice(2,5);

  /* ── 인메모리 캐시 ──────────────────────── */
  let C = {
    classes:  [],
    progress: {},
    accounts: [],
    theme:    null,
  };

  /* ── 변경 리스너 ────────────────────────── */
  const _evts = {};
  function _fire(type) {
    (_evts[type]||[]).forEach(fn=>{ try{fn();}catch(e){} });
    (_evts['*']  ||[]).forEach(fn=>{ try{fn(type);}catch(e){} });
  }
  function on(type, fn) {
    if (!_evts[type]) _evts[type]=[];
    _evts[type].push(fn);
  }

  /* ══════════════════════════════════════════
     초기화 — 앱이 이것을 await 한 뒤 시작
  ══════════════════════════════════════════ */
  async function init() {
    const fbOk = FireDB.init();   // 동기 — 성공/실패 즉시 반환

    if (fbOk) {
      await _loadFromFirebase();  // Firebase 데이터 먼저 로드
      _attachListeners();         // 그 뒤 실시간 리스너
    } else {
      _loadFromLS();              // localStorage 로드
    }

    await _seedIfEmpty();         // 초기 데이터 없으면 생성
  }

  /* ── Firebase에서 한 번에 전체 데이터 로드 ─ */
  async function _loadFromFirebase() {
    const TIMEOUT = 5000; // 5초 타임아웃
    try {
      const snap = await Promise.race([
        FireDB.get(FireDB.PATHS.root),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT)),
      ]);

      if (snap) {
        C.classes  = snap.classes  ? Object.values(snap.classes)  : [];
        C.progress = snap.progress || {};
        C.accounts = snap.accounts ? Object.values(snap.accounts) : [];
        C.theme    = snap.theme    || null;
        // 캐시를 LS에도 백업
        lsSet(LS.classes,  C.classes);
        lsSet(LS.progress, C.progress);
        lsSet(LS.accounts, C.accounts);
        lsSet(LS.theme,    C.theme);
        console.log('[DB] Firebase 데이터 로드 완료', {classes: C.classes.length});
      } else {
        // Firebase는 연결됐지만 데이터 없음 → LS 확인 후 시작
        _loadFromLS();
        console.log('[DB] Firebase 데이터 없음 → localStorage 사용');
      }
    } catch (e) {
      // 타임아웃 또는 권한 오류 → LS로 폴백
      console.warn('[DB] Firebase 로드 실패 → localStorage 폴백', e.message);
      _loadFromLS();
    }
  }

  /* ── 실시간 리스너 (초기 로드 후 연결) ──── */
  function _attachListeners() {
    FireDB.listen(FireDB.PATHS.classes, val => {
      const newData = val ? Object.values(val) : [];
      // 실제 변경이 있을 때만 업데이트
      if (JSON.stringify(newData) !== JSON.stringify(C.classes)) {
        C.classes = newData;
        lsSet(LS.classes, C.classes);
        _fire('classes');
      }
    });
    FireDB.listen(FireDB.PATHS.progress, val => {
      const newData = val || {};
      C.progress = newData;
      lsSet(LS.progress, C.progress);
      _fire('progress');
    });
    FireDB.listen(FireDB.PATHS.accounts, val => {
      const newData = val ? Object.values(val) : [];
      if (JSON.stringify(newData) !== JSON.stringify(C.accounts)) {
        C.accounts = newData;
        lsSet(LS.accounts, C.accounts);
        _fire('accounts');
      }
    });
    FireDB.listen(FireDB.PATHS.theme, val => {
      if (val && JSON.stringify(val) !== JSON.stringify(C.theme)) {
        C.theme = val;
        lsSet(LS.theme, C.theme);
        _fire('theme');
      }
    });
  }

  function _loadFromLS() {
    C.classes  = lsGet(LS.classes)  || [];
    C.progress = lsGet(LS.progress) || {};
    C.accounts = lsGet(LS.accounts) || [];
    C.theme    = lsGet(LS.theme)    || null;
    console.log('[DB] localStorage 로드:', {classes: C.classes.length});
  }

  /* ── 초기 시드 데이터 ───────────────────── */
  async function _seedIfEmpty() {
    if (!C.accounts.length) {
      await addAccount('admin', '1234', 'admin');
    }
    if (!C.theme) {
      await saveTheme({ accentColor:'#6366f1', fontFamily:'Noto Sans KR', fontSize:14, viewMode:'grid' });
    }
    if (!C.classes.length) {
      const mk = monthKey(new Date());
      const c1 = await addClass({ name:'H1', days:['월','화','목','금'] });
      const c2 = await addClass({ name:'T1', days:['월','수','금'] });
      await addBook(c1.id, mk, 'main', '수학의 정석(상)');
      await addBook(c1.id, mk, 'sub',  '쎈 수학');
      await addBook(c1.id, mk, 'sub',  '수학 올림피아드');
      await addBook(c2.id, mk, 'main', '개념원리');
      await addBook(c2.id, mk, 'sub',  'RPM');
    }
  }

  /* ══════════════════════════════════════════
     세션 (localStorage only)
  ══════════════════════════════════════════ */
  const getSession   = ()    => lsGet(LS.session);
  const setSession   = acc   => lsSet(LS.session, acc);
  const clearSession = ()    => localStorage.removeItem(LS.session);
  const isLoggedIn   = ()    => !!lsGet(LS.session);

  function login(username, pw) {
    const acc = C.accounts.find(a => a.username===username && a.password===pw);
    if (acc) { setSession(acc); return acc; }
    return null;
  }

  /* ══════════════════════════════════════════
     계정
  ══════════════════════════════════════════ */
  const getAccounts = () => C.accounts || [];

  async function addAccount(username, pw, role='admin') {
    if (C.accounts.find(a=>a.username===username)) return null;
    const acc = { id:newId(), username, password:pw, role };
    C.accounts = [...C.accounts, acc];
    lsSet(LS.accounts, C.accounts);
    if (FireDB.ready()) await FireDB.set(`${FireDB.PATHS.accounts}/${acc.id}`, acc);
    return acc;
  }

  async function updateAccount(id, data) {
    const idx = C.accounts.findIndex(a=>a.id===id);
    if (idx===-1) return null;
    C.accounts[idx] = {...C.accounts[idx], ...data};
    lsSet(LS.accounts, C.accounts);
    if (FireDB.ready()) await FireDB.set(`${FireDB.PATHS.accounts}/${id}`, C.accounts[idx]);
    return C.accounts[idx];
  }

  async function deleteAccount(id) {
    C.accounts = C.accounts.filter(a=>a.id!==id);
    lsSet(LS.accounts, C.accounts);
    if (FireDB.ready()) await FireDB.remove(`${FireDB.PATHS.accounts}/${id}`);
  }

  /* ══════════════════════════════════════════
     반 (Classes)
  ══════════════════════════════════════════ */
  const getClasses    = ()   => C.classes || [];
  const getClassById  = id   => C.classes.find(c=>c.id===id) || null;

  async function addClass(data) {
    const cls = { id:newId(), monthBooks:{}, ...data };
    C.classes = [...C.classes, cls];
    lsSet(LS.classes, C.classes);
    if (FireDB.ready()) await FireDB.set(`${FireDB.PATHS.classes}/${cls.id}`, cls);
    return cls;
  }

  async function updateClass(id, data) {
    const idx = C.classes.findIndex(c=>c.id===id);
    if (idx===-1) return null;
    C.classes[idx] = {...C.classes[idx], ...data};
    lsSet(LS.classes, C.classes);
    if (FireDB.ready()) await FireDB.update(`${FireDB.PATHS.classes}/${id}`, data);
    return C.classes[idx];
  }

  async function deleteClass(id) {
    C.classes = C.classes.filter(c=>c.id!==id);
    lsSet(LS.classes, C.classes);
    if (FireDB.ready()) await FireDB.remove(`${FireDB.PATHS.classes}/${id}`);
    // 진도 정리
    const keys = Object.keys(C.progress).filter(k=>k.startsWith(id+'__'));
    keys.forEach(k=>delete C.progress[k]);
    lsSet(LS.progress, C.progress);
    if (FireDB.ready() && keys.length) {
      const upd = {}; keys.forEach(k=>upd[k]=null);
      await FireDB.update(FireDB.PATHS.progress, upd);
    }
  }

  /* ══════════════════════════════════════════
     월별 교재
  ══════════════════════════════════════════ */
  function getMonthBooks(classId, mk) {
    const cls = getClassById(classId);
    if (!cls) return {main:[],sub:[]};
    if (!cls.monthBooks) cls.monthBooks = {};
    if (cls.monthBooks[mk]) return JSON.parse(JSON.stringify(cls.monthBooks[mk]));

    // 이전 달 복사
    const prev = prevMonthKey(mk);
    const base = cls.monthBooks[prev];
    cls.monthBooks[mk] = base
      ? { main: base.main.map(b=>({...b,id:newId()})), sub: base.sub.map(b=>({...b,id:newId()})) }
      : { main:[], sub:[] };

    _syncClass(cls);
    return JSON.parse(JSON.stringify(cls.monthBooks[mk]));
  }

  async function _syncClass(cls) {
    const idx = C.classes.findIndex(c=>c.id===cls.id);
    if (idx!==-1) C.classes[idx] = cls;
    lsSet(LS.classes, C.classes);
    if (FireDB.ready()) await FireDB.set(`${FireDB.PATHS.classes}/${cls.id}`, cls);
  }

  async function addBook(classId, mk, type, name) {
    const cls = getClassById(classId);
    if (!cls) return null;
    if (!cls.monthBooks) cls.monthBooks = {};
    if (!cls.monthBooks[mk]) cls.monthBooks[mk] = {main:[],sub:[]};
    const b = {id:newId(), name, active:true};
    cls.monthBooks[mk][type].push(b);
    await _syncClass(cls);
    _fire('classes');
    return b;
  }

  async function updateBook(classId, mk, type, bookId, data) {
    const cls = getClassById(classId);
    if (!cls || !cls.monthBooks?.[mk]) return;
    const idx = cls.monthBooks[mk][type].findIndex(b=>b.id===bookId);
    if (idx===-1) return;
    cls.monthBooks[mk][type][idx] = {...cls.monthBooks[mk][type][idx], ...data};
    await _syncClass(cls);
    _fire('classes');
  }

  async function deleteBook(classId, mk, type, bookId) {
    const cls = getClassById(classId);
    if (!cls || !cls.monthBooks?.[mk]) return;
    cls.monthBooks[mk][type] = cls.monthBooks[mk][type].filter(b=>b.id!==bookId);
    await _syncClass(cls);
    // 진도 정리
    const keys = Object.keys(C.progress).filter(k=>k.includes(`__${bookId}`));
    keys.forEach(k=>delete C.progress[k]);
    lsSet(LS.progress, C.progress);
    if (FireDB.ready() && keys.length) {
      const upd={}; keys.forEach(k=>upd[k]=null);
      await FireDB.update(FireDB.PATHS.progress, upd);
    }
    _fire('classes');
  }

  /* ══════════════════════════════════════════
     진도 (자동저장)
  ══════════════════════════════════════════ */
  function getWeekProgress(classId, weekKey) {
    const pfx = `${classId}__${weekKey}__`;
    const res  = {};
    Object.keys(C.progress).forEach(k=>{
      if (k.startsWith(pfx)) res[k.slice(pfx.length)] = C.progress[k];
    });
    return res;   // key: "dayName__bookId" → value
  }

  // 단일 진도 자동저장 (디바운스 800ms)
  function autoSave(classId, weekKey, dayName, bookId, value) {
    const key  = `${classId}__${weekKey}__${dayName}__${bookId}`;
    // 즉시 캐시 반영
    if (!value) delete C.progress[key]; else C.progress[key] = value;
    lsSet(LS.progress, C.progress);
    // Firebase 디바운스
    if (FireDB.ready()) {
      FireDB.saveDebounced(`${FireDB.PATHS.progress}/${key}`, value);
    }
  }

  // 배치 저장 (엑셀 불러오기)
  async function saveProgressBatch(entries) {
    const fbUpd = {};
    entries.forEach(({classId,weekKey,dayName,bookId,value})=>{
      const k = `${classId}__${weekKey}__${dayName}__${bookId}`;
      if (!value) { delete C.progress[k]; fbUpd[k]=null; }
      else        { C.progress[k]=value;  fbUpd[k]=value; }
    });
    lsSet(LS.progress, C.progress);
    if (FireDB.ready()) await FireDB.update(FireDB.PATHS.progress, fbUpd);
  }

  /* ══════════════════════════════════════════
     테마
  ══════════════════════════════════════════ */
  const getTheme = () => C.theme || { accentColor:'#6366f1', fontFamily:'Noto Sans KR', fontSize:14, viewMode:'grid' };

  async function saveTheme(t) {
    C.theme = t;
    lsSet(LS.theme, t);
    if (FireDB.ready()) await FireDB.set(FireDB.PATHS.theme, t);
  }

  /* ══════════════════════════════════════════
     Export / Import
  ══════════════════════════════════════════ */
  function exportAll() {
    return {
      classes:    C.classes,
      progress:   C.progress,
      theme:      C.theme,
      exportedAt: new Date().toISOString(),
    };
  }

  async function importData(data) {
    const result = { added:[], updated:[] };
    if (data.classes) {
      for (const nc of data.classes) {
        const ex = C.classes.find(c=>c.id===nc.id);
        if (!ex) { C.classes.push({...nc,_new:true}); result.added.push(nc.name); }
        else      { Object.assign(ex,nc); result.updated.push(nc.name); }
        if (FireDB.ready()) await FireDB.set(`${FireDB.PATHS.classes}/${nc.id}`, nc);
      }
      lsSet(LS.classes, C.classes);
    }
    if (data.progress) {
      Object.assign(C.progress, data.progress);
      lsSet(LS.progress, C.progress);
      if (FireDB.ready()) await FireDB.update(FireDB.PATHS.progress, data.progress);
    }
    if (data.theme) await saveTheme(data.theme);
    _fire('classes'); _fire('progress'); _fire('theme');
    return result;
  }

  /* ── 날짜 유틸 ──────────────────────────── */
  function monthKey(date) {
    const d=new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function toWeekKey(date) {
    const d=new Date(date); d.setHours(0,0,0,0);
    const thu=new Date(d); thu.setDate(d.getDate()-((d.getDay()+6)%7)+3);
    const y=thu.getFullYear(), jan4=new Date(y,0,4);
    const w=Math.ceil(((thu-jan4)/86400000+jan4.getDay()+1)/7);
    return `${y}-W${String(w).padStart(2,'0')}`;
  }
  function prevMonthKey(mk) {
    const [y,m]=mk.split('-').map(Number);
    return monthKey(new Date(y,m-2,1));
  }
  function nextMonthKey(mk) {
    const [y,m]=mk.split('-').map(Number);
    return monthKey(new Date(y,m,1));
  }

  return {
    init, on,
    monthKey, toWeekKey, prevMonthKey, nextMonthKey,
    getSession, setSession, clearSession, isLoggedIn, login,
    getAccounts, addAccount, updateAccount, deleteAccount,
    getClasses, getClassById, addClass, updateClass, deleteClass,
    getMonthBooks, addBook, updateBook, deleteBook,
    getWeekProgress, autoSave, saveProgressBatch,
    getTheme, saveTheme,
    exportAll, importData,
  };
})();
