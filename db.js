/**
 * db.js — v4 하이브리드 저장소
 * Firebase Realtime DB (멀티기기 동기화) + localStorage (폴백/캐시)
 *
 * 전략:
 *  - Firebase 연결 성공 → Firebase가 Single Source of Truth
 *  - Firebase 미연결 → localStorage로 동작 (오프라인 모드)
 *  - 진도 입력: 디바운스 자동저장 (800ms)
 *  - 반/계정/테마: 즉시 저장
 */

const DB = (() => {
  const LS = {
    classes:  'hk4_classes',
    progress: 'hk4_progress',
    accounts: 'hk4_accounts',
    theme:    'hk4_theme',
    session:  'hk4_session',
  };

  const lsLoad = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const lsSave = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const uid    = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  /* ─────────────────────────────────────────
     캐시 (Firebase 데이터를 메모리+LS에 보관)
  ───────────────────────────────────────── */
  const cache = {
    classes:  null,
    progress: null,
    accounts: null,
    theme:    null,
  };

  /* ─────────────────────────────────────────
     초기화 & Firebase 리스너
  ───────────────────────────────────────── */
  async function init() {
    FireDB.init();

    if (FireDB.ready()) {
      // 실시간 리스너 — Firebase 변경 시 즉시 캐시 갱신 + UI 콜백
      FireDB.listen(FireDB.PATHS.classes(),  val => { cache.classes  = val ? Object.values(val) : []; lsSave(LS.classes,  cache.classes);  _onChange('classes'); });
      FireDB.listen(FireDB.PATHS.progress(), val => { cache.progress = val || {};                     lsSave(LS.progress, cache.progress); _onChange('progress'); });
      FireDB.listen(FireDB.PATHS.accounts(), val => { cache.accounts = val ? Object.values(val) : []; lsSave(LS.accounts, cache.accounts); _onChange('accounts'); });
      FireDB.listen(FireDB.PATHS.theme(),    val => { if(val){ cache.theme = val; lsSave(LS.theme, val); _onChange('theme'); } });
    } else {
      // localStorage 로드
      cache.classes  = lsLoad(LS.classes)  || [];
      cache.progress = lsLoad(LS.progress) || {};
      cache.accounts = lsLoad(LS.accounts) || [];
      cache.theme    = lsLoad(LS.theme)    || null;
    }

    await seedIfEmpty();
  }

  /* ─────────────────────────────────────────
     변경 콜백 (App이 등록)
  ───────────────────────────────────────── */
  const _listeners = {};
  function _onChange(type) {
    (_listeners[type] || []).forEach(fn => fn());
    (_listeners['*']  || []).forEach(fn => fn(type));
  }
  function onChange(type, fn) {
    if (!_listeners[type]) _listeners[type] = [];
    _listeners[type].push(fn);
  }

  /* ─────────────────────────────────────────
     Seed
  ───────────────────────────────────────── */
  async function seedIfEmpty() {
    const classes  = getClasses();
    const accounts = getAccounts();

    if (!accounts.length) {
      await addAccount('admin', '1234', 'admin');
    }
    if (!cache.theme) {
      const def = { accentColor:'#6366f1', fontFamily:'Noto Sans KR', fontSize:14, viewMode:'grid' };
      await saveTheme(def);
    }
    if (!classes.length) {
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

  /* ─────────────────────────────────────────
     날짜 유틸
  ───────────────────────────────────────── */
  function monthKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function toWeekKey(date) {
    const d = new Date(date); d.setHours(0,0,0,0);
    const thu = new Date(d);
    thu.setDate(d.getDate() - ((d.getDay()+6)%7) + 3);
    const y   = thu.getFullYear();
    const jan4= new Date(y,0,4);
    const w   = Math.ceil(((thu-jan4)/86400000 + jan4.getDay()+1)/7);
    return `${y}-W${String(w).padStart(2,'0')}`;
  }
  function prevMonthKey(mk) {
    const [y,m] = mk.split('-').map(Number);
    return monthKey(new Date(y, m-2, 1));
  }
  function nextMonthKey(mk) {
    const [y,m] = mk.split('-').map(Number);
    return monthKey(new Date(y, m, 1));
  }
  function fbKey(s) { return s.replace(/[.|#$/\[\]]/g,'_'); }

  /* ─────────────────────────────────────────
     세션
  ───────────────────────────────────────── */
  const getSession   = ()    => lsLoad(LS.session);
  const setSession   = acc   => lsSave(LS.session, acc);
  const clearSession = ()    => localStorage.removeItem(LS.session);
  const isLoggedIn   = ()    => !!lsLoad(LS.session);

  /* ─────────────────────────────────────────
     계정
  ───────────────────────────────────────── */
  function getAccounts() { return cache.accounts || []; }

  async function addAccount(username, password, role='admin') {
    if (getAccounts().find(a=>a.username===username)) return null;
    const acc = { id: uid(), username, password, role };
    const list = [...getAccounts(), acc];
    cache.accounts = list;
    lsSave(LS.accounts, list);
    if (FireDB.ready()) {
      await FireDB.set(`${FireDB.PATHS.accounts()}/${acc.id}`, acc);
    }
    return acc;
  }

  async function updateAccount(id, data) {
    const list = getAccounts();
    const idx  = list.findIndex(a=>a.id===id);
    if (idx===-1) return null;
    list[idx] = {...list[idx],...data};
    cache.accounts = list;
    lsSave(LS.accounts, list);
    if (FireDB.ready()) await FireDB.set(`${FireDB.PATHS.accounts()}/${id}`, list[idx]);
    return list[idx];
  }

  async function deleteAccount(id) {
    cache.accounts = getAccounts().filter(a=>a.id!==id);
    lsSave(LS.accounts, cache.accounts);
    if (FireDB.ready()) await FireDB.remove(`${FireDB.PATHS.accounts()}/${id}`);
  }

  function login(username, pw) {
    const acc = getAccounts().find(a=>a.username===username&&a.password===pw);
    if (acc) { setSession(acc); return acc; }
    return null;
  }

  /* ─────────────────────────────────────────
     반 (Classes)
  ───────────────────────────────────────── */
  function getClasses()       { return cache.classes || []; }
  function getClassById(id)   { return getClasses().find(c=>c.id===id)||null; }

  async function addClass(data) {
    const cls = { id: uid(), monthBooks:{}, ...data };
    const list = [...getClasses(), cls];
    cache.classes = list;
    lsSave(LS.classes, list);
    if (FireDB.ready()) await FireDB.set(`${FireDB.PATHS.classes()}/${cls.id}`, cls);
    return cls;
  }

  async function updateClass(id, data) {
    const list = getClasses();
    const idx  = list.findIndex(c=>c.id===id);
    if (idx===-1) return null;
    list[idx] = {...list[idx],...data};
    cache.classes = list;
    lsSave(LS.classes, list);
    if (FireDB.ready()) await FireDB.update(`${FireDB.PATHS.classes()}/${id}`, data);
    return list[idx];
  }

  async function deleteClass(id) {
    cache.classes = getClasses().filter(c=>c.id!==id);
    lsSave(LS.classes, cache.classes);
    if (FireDB.ready()) await FireDB.remove(`${FireDB.PATHS.classes()}/${id}`);
    // 관련 진도 정리
    const prog = cache.progress || {};
    Object.keys(prog).forEach(k=>{ if(k.startsWith(id+'__')) delete prog[k]; });
    cache.progress = prog;
    lsSave(LS.progress, prog);
    if (FireDB.ready()) {
      const snap = await FireDB.get(FireDB.PATHS.progress());
      if (snap) {
        const upd = {};
        Object.keys(snap).forEach(k=>{ if(k.startsWith(id+'__')) upd[k]=null; });
        if (Object.keys(upd).length) await FireDB.update(FireDB.PATHS.progress(), upd);
      }
    }
  }

  /* ─────────────────────────────────────────
     월별 교재
  ───────────────────────────────────────── */
  function getMonthBooks(classId, mk) {
    const cls = getClassById(classId);
    if (!cls) return { main:[], sub:[] };
    if (!cls.monthBooks) cls.monthBooks = {};
    if (cls.monthBooks[mk]) return cls.monthBooks[mk];
    // 이전 달 복사
    const prev = prevMonthKey(mk);
    if (cls.monthBooks[prev]) {
      cls.monthBooks[mk] = {
        main: cls.monthBooks[prev].main.map(b=>({...b,id:uid()})),
        sub:  cls.monthBooks[prev].sub.map(b=>({...b,id:uid()})),
      };
    } else {
      cls.monthBooks[mk] = { main:[], sub:[] };
    }
    _syncClass(cls);
    return cls.monthBooks[mk];
  }

  async function _syncClass(cls) {
    const list = getClasses();
    const idx  = list.findIndex(c=>c.id===cls.id);
    if (idx!==-1) { list[idx]=cls; cache.classes=list; lsSave(LS.classes,list); }
    if (FireDB.ready()) await FireDB.set(`${FireDB.PATHS.classes()}/${cls.id}`, cls);
  }

  async function addBook(classId, mk, type, name) {
    const b   = { id:uid(), name, active:true };
    const bks = getMonthBooks(classId, mk);
    bks[type].push(b);
    const cls = getClassById(classId); cls.monthBooks[mk]=bks;
    await _syncClass(cls); return b;
  }

  async function updateBook(classId, mk, type, bookId, data) {
    const bks = getMonthBooks(classId, mk);
    const idx = bks[type].findIndex(b=>b.id===bookId);
    if (idx===-1) return;
    bks[type][idx]={...bks[type][idx],...data};
    const cls = getClassById(classId); cls.monthBooks[mk]=bks;
    await _syncClass(cls);
  }

  async function deleteBook(classId, mk, type, bookId) {
    const bks = getMonthBooks(classId, mk);
    bks[type] = bks[type].filter(b=>b.id!==bookId);
    const cls = getClassById(classId); cls.monthBooks[mk]=bks;
    await _syncClass(cls);
    // 진도 정리
    const prog = cache.progress||{};
    Object.keys(prog).forEach(k=>{ if(k.includes(`__${bookId}`)) delete prog[k]; });
    cache.progress = prog; lsSave(LS.progress, prog);
    if (FireDB.ready()) {
      const updates = {};
      Object.keys(prog).forEach(k=>{ if(k.includes(`__${bookId}`)) updates[k]=null; });
      if(Object.keys(updates).length) await FireDB.update(FireDB.PATHS.progress(),updates);
    }
  }

  /* ─────────────────────────────────────────
     진도 (자동저장 — debounce)
  ───────────────────────────────────────── */
  // FB key: "classId__weekKey__dayName__bookId"  (| → __)
  function _progKey(classId, weekKey, dayName, bookId) {
    return `${classId}__${weekKey}__${dayName}__${bookId}`;
  }

  function getWeekProgress(classId, weekKey) {
    const prog = cache.progress || {};
    const pfx  = `${classId}__${weekKey}__`;
    const res  = {};
    Object.keys(prog).forEach(k=>{
      if (k.startsWith(pfx)) res[k.slice(pfx.length)] = prog[k];
    });
    return res; // key: "dayName__bookId" → value
  }

  /** 단일 진도 자동저장 (debounce) */
  function autoSaveProgress(classId, weekKey, dayName, bookId, value) {
    const key  = _progKey(classId, weekKey, dayName, bookId);
    const prog = cache.progress || {};
    if (value === '') delete prog[key]; else prog[key] = value;
    cache.progress = prog;
    lsSave(LS.progress, prog);
    if (FireDB.ready()) {
      FireDB.saveProgressDebounced(key, value);
    }
  }

  /** 배치 저장 (엑셀 불러오기 등) */
  async function saveProgressBatch(entries) {
    const prog = cache.progress || {};
    const fbUp = {};
    entries.forEach(({classId,weekKey,dayName,bookId,value})=>{
      const k = _progKey(classId,weekKey,dayName,bookId);
      if (!value) { delete prog[k]; fbUp[k]=null; }
      else        { prog[k]=value;  fbUp[k]=value; }
    });
    cache.progress = prog;
    lsSave(LS.progress, prog);
    if (FireDB.ready()) await FireDB.update(FireDB.PATHS.progress(), fbUp);
  }

  /* ─────────────────────────────────────────
     테마
  ───────────────────────────────────────── */
  function getTheme() {
    return cache.theme || { accentColor:'#6366f1', fontFamily:'Noto Sans KR', fontSize:14, viewMode:'grid' };
  }
  async function saveTheme(t) {
    cache.theme = t; lsSave(LS.theme, t);
    if (FireDB.ready()) await FireDB.set(FireDB.PATHS.theme(), t);
  }

  /* ─────────────────────────────────────────
     전체 데이터 Export / Import (엑셀용)
  ───────────────────────────────────────── */
  function exportAll() {
    return {
      classes:  getClasses(),
      progress: cache.progress || {},
      accounts: getAccounts().map(a=>({...a, password:'***'})), // 비밀번호 마스킹
      theme:    getTheme(),
      exportedAt: new Date().toISOString(),
    };
  }

  /** 불러오기: 반환값 { added, updated, skipped } */
  async function importData(data) {
    const result = { added:[], updated:[], skipped:[] };

    // classes
    if (data.classes) {
      const existing = getClasses();
      for (const nc of data.classes) {
        const ex = existing.find(c=>c.id===nc.id);
        if (!ex) {
          cache.classes.push(nc);
          if (FireDB.ready()) await FireDB.set(`${FireDB.PATHS.classes()}/${nc.id}`, nc);
          result.added.push(nc.name);
        } else {
          Object.assign(ex, nc);
          if (FireDB.ready()) await FireDB.set(`${FireDB.PATHS.classes()}/${nc.id}`, nc);
          result.updated.push(nc.name);
        }
      }
      lsSave(LS.classes, cache.classes);
    }
    // progress
    if (data.progress) {
      Object.assign(cache.progress, data.progress);
      lsSave(LS.progress, cache.progress);
      if (FireDB.ready()) await FireDB.update(FireDB.PATHS.progress(), data.progress);
    }
    // theme
    if (data.theme) await saveTheme(data.theme);

    _onChange('classes'); _onChange('progress'); _onChange('theme');
    return result;
  }

  return {
    init, onChange,
    monthKey, toWeekKey, prevMonthKey, nextMonthKey, uid, fbKey,
    getSession, setSession, clearSession, isLoggedIn,
    getAccounts, login, addAccount, updateAccount, deleteAccount,
    getClasses, getClassById, addClass, updateClass, deleteClass,
    getMonthBooks, addBook, updateBook, deleteBook,
    getWeekProgress, autoSaveProgress, saveProgressBatch,
    getTheme, saveTheme,
    exportAll, importData,
  };
})();
