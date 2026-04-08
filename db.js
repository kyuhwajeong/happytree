/**
 * db.js — v9
 * 수정:
 * 1. _listenFB: Firebase 리스너가 로컬 monthBooks 덮어쓰지 않도록 merge
 * 2. getMonthBooks: 다음달(+1)만 자동복사, 그 이후는 빈 상태
 * 3. 삭제/clearZone: 반드시 해당 월 데이터에서만 동작
 * 4. monthKey padStart 버그 수정
 */
const DB = (() => {
  const LS = {
    classes:'hk9_cls', progress:'hk9_prog',
    accounts:'hk9_acc', theme:'hk9_theme', session:'hk9_sess',
  };
  const lg = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const ls = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };
  const nid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const now = () => new Date().toISOString();

  let C = { classes:[], progress:{}, accounts:[], theme:null };

  /* ── 이벤트 ─────────────────────────────── */
  const _ev = {};
  function _fire(t) {
    (_ev[t]||[]).forEach(f=>{ try{f();}catch(e){} });
    (_ev['*'] ||[]).forEach(f=>{ try{f(t);}catch(e){} });
  }
  function on(t,f) { if(!_ev[t])_ev[t]=[]; _ev[t].push(f); }

  /* ══════════════════════════════ INIT ══════════════════════════════ */
  async function init() {
    const fbOk = FireDB.init();
    if (fbOk) {
      await _loadFB();
      _listenFB();
    } else {
      _loadLS();
    }
    await _seed();
  }

  async function _loadFB() {
    try {
      const snap = await Promise.race([
        FireDB.get(FireDB.P.root),
        new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),5000)),
      ]);
      if (snap) {
        C.classes  = snap.classes  ? Object.values(snap.classes)  : [];
        C.progress = snap.progress || {};
        C.accounts = snap.accounts ? Object.values(snap.accounts) : [];
        C.theme    = snap.theme    || null;
        ls(LS.classes,C.classes); ls(LS.progress,C.progress);
        ls(LS.accounts,C.accounts); ls(LS.theme,C.theme);
      } else { _loadLS(); }
    } catch(e) { console.warn('FB load →LS', e.message); _loadLS(); }
  }

  /**
   * ★ 핵심 수정: Firebase 리스너가 로컬에서 막 초기화한 monthBooks를
   *   덮어쓰지 않도록 merge 처리
   */
  function _listenFB() {
    FireDB.listen(FireDB.P.classes, v => {
      const nd = v ? Object.values(v) : [];
      // Merge: Firebase 데이터 기반이지만, 로컬에 있고 Firebase에 없는 monthBooks는 보존
      const merged = _mergeClasses(nd, C.classes);
      if (JSON.stringify(merged) !== JSON.stringify(C.classes)) {
        C.classes = merged;
        ls(LS.classes, C.classes);
        _fire('classes');
      }
    });
    FireDB.listen(FireDB.P.progress, v => {
      C.progress = v||{}; ls(LS.progress,C.progress); _fire('progress');
    });
    FireDB.listen(FireDB.P.accounts, v => {
      const nd=v?Object.values(v):[];
      if (JSON.stringify(nd)!==JSON.stringify(C.accounts)) {
        C.accounts=nd; ls(LS.accounts,C.accounts); _fire('accounts');
      }
    });
    FireDB.listen(FireDB.P.theme, v => {
      if (v && JSON.stringify(v)!==JSON.stringify(C.theme)) {
        C.theme=v; ls(LS.theme,v); _fire('theme');
      }
    });
  }

  /** Firebase 클래스와 로컬 클래스 merge: 로컬 monthBooks 우선 보존 */
  function _mergeClasses(fbList, localList) {
    return fbList.map(fbCls => {
      const localCls = localList.find(c => c.id === fbCls.id);
      if (!localCls?.monthBooks) return fbCls;
      const merged = { ...fbCls, monthBooks: { ...(fbCls.monthBooks || {}) } };
      // 로컬에만 있는 월 데이터 보존 (Firebase에 아직 저장 안 된 경우)
      Object.keys(localCls.monthBooks).forEach(mk => {
        if (!merged.monthBooks[mk]) {
          merged.monthBooks[mk] = localCls.monthBooks[mk];
        }
      });
      return merged;
    });
  }

  function _loadLS() {
    C.classes  = lg(LS.classes)  || [];
    C.progress = lg(LS.progress) || {};
    C.accounts = lg(LS.accounts) || [];
    C.theme    = lg(LS.theme)    || null;
  }

  async function _seed() {
    if (!C.accounts.length) await _addAcc('admin','1234','admin');
    if (!C.theme) await saveTheme({
      palette:'light1', fontFamily:'Noto Sans KR', fontSize:14,
      viewMode:'grid', operateView:'grid', inputBoxWidth:140
    });
    if (!C.classes.length) {
      const mk = monthKey(new Date());
      const c1 = await addClass({name:'H1',days:['월','화','목','금']});
      const c2 = await addClass({name:'T1',days:['월','수','금']});
      await addToPool(c1.id,mk,'수학의 정석(상)');
      await addToPool(c1.id,mk,'쎈 수학');
      await addToPool(c2.id,mk,'개념원리');
      const b1=getMonthBooks(c1.id,mk);
      if(b1.pool.length>=2){
        await moveBook(c1.id,mk,b1.pool[0].id,'main');
        await moveBook(c1.id,mk,b1.pool[0].id,'sub');
      }
      const b2=getMonthBooks(c2.id,mk);
      if(b2.pool.length>=1){
        await moveBook(c2.id,mk,b2.pool[0].id,'main');
      }
    }
  }

  /* ══════════════════════════════ SESSION ══════════════════════════════ */
  const getSession   = () => lg(LS.session);
  const setSession   = a  => ls(LS.session,a);
  const clearSession = () => localStorage.removeItem(LS.session);
  const isLoggedIn   = () => !!lg(LS.session);
  const isAdmin      = () => lg(LS.session)?.role === 'admin';
  const canOperate   = () => !!lg(LS.session);

  function login(username, pw) {
    const acc = C.accounts.find(a=>a.username===username && a.password===pw);
    if (acc) { setSession(acc); return acc; }
    return null;
  }

  /* ══════════════════════════════ ACCOUNTS ══════════════════════════════ */
  const getAccounts = () => C.accounts||[];
  async function _addAcc(username,pw,role) {
    const acc = {id:nid(),username,password:pw,role,createdAt:now()};
    C.accounts = [...C.accounts,acc]; ls(LS.accounts,C.accounts);
    if(FireDB.ready()) await FireDB.set(`${FireDB.P.accounts}/${acc.id}`,acc);
    return acc;
  }
  async function addAccount(username,pw,role='operator') {
    if (C.accounts.find(a=>a.username===username)) return null;
    return _addAcc(username,pw,role);
  }
  async function updateAccount(id,data) {
    const idx=C.accounts.findIndex(a=>a.id===id); if(idx===-1)return null;
    C.accounts[idx]={...C.accounts[idx],...data}; ls(LS.accounts,C.accounts);
    if(FireDB.ready()) await FireDB.set(`${FireDB.P.accounts}/${id}`,C.accounts[idx]);
    return C.accounts[idx];
  }
  async function deleteAccount(id) {
    C.accounts=C.accounts.filter(a=>a.id!==id); ls(LS.accounts,C.accounts);
    if(FireDB.ready()) await FireDB.remove(`${FireDB.P.accounts}/${id}`);
  }

  /* ══════════════════════════════ CLASSES ══════════════════════════════ */
  const getClasses   = () => C.classes||[];
  const getClassById = id => C.classes.find(c=>c.id===id)||null;
  const classExists  = name => C.classes.some(c=>c.name.trim()===name.trim());

  async function addClass(data) {
    if (classExists(data.name)) return null;
    const cls = {id:nid(),monthBooks:{},createdAt:now(),...data};
    C.classes = [...C.classes,cls]; ls(LS.classes,C.classes);
    if(FireDB.ready()) await FireDB.set(`${FireDB.P.classes}/${cls.id}`,cls);
    return cls;
  }
  async function updateClass(id,data) {
    const idx=C.classes.findIndex(c=>c.id===id); if(idx===-1)return null;
    C.classes[idx]={...C.classes[idx],...data}; ls(LS.classes,C.classes);
    if(FireDB.ready()) await FireDB.update(`${FireDB.P.classes}/${id}`,data);
    return C.classes[idx];
  }
  async function deleteClass(id) {
    C.classes=C.classes.filter(c=>c.id!==id); ls(LS.classes,C.classes);
    if(FireDB.ready()) await FireDB.remove(`${FireDB.P.classes}/${id}`);
    const keys=Object.keys(C.progress).filter(k=>k.startsWith(id+'__'));
    keys.forEach(k=>delete C.progress[k]);
    ls(LS.progress,C.progress);
    if(FireDB.ready()&&keys.length){
      const u={};keys.forEach(k=>u[k]=null);
      await FireDB.update(FireDB.P.progress,u);
    }
  }

  /* ══════════════════════════════ MONTH BOOKS ══════════════════════════════
     구조: { pool:[{id,name,createdAt}], main:[...], sub:[...] }

     ★ 핵심 정책:
       - 현재 달: 데이터 그대로
       - 다음 달(+1): 현재 달에서 자동 복사 (최초 1회)
       - 그 이후 달: 빈 상태 (복사 안 함)
       - 각 달은 독립적 → 삭제해도 다른 달에 영향 없음
  ════════════════════════════════════════════════════════════════════════ */

  function _emptyBooks() { return {pool:[],main:[],sub:[]}; }
  function _migrateBooks(raw) {
    if (!raw) return _emptyBooks();
    if (!raw.pool) raw.pool = [];
    if (!raw.main) raw.main = [];
    if (!raw.sub)  raw.sub  = [];
    return raw;
  }

  /**
   * ★ 수정된 getMonthBooks:
   *   - 해당 월 데이터가 있으면 그대로 반환 (읽기 전용 복사)
   *   - 없으면: 다음달(+1)인 경우만 이전달에서 복사, 나머지는 빈 상태
   */
  function getMonthBooks(classId, mk) {
    const cls = getClassById(classId);
    if (!cls) return _emptyBooks();
    if (!cls.monthBooks) cls.monthBooks = {};

    // 이미 데이터가 있으면 복사본 반환
    if (cls.monthBooks[mk]) {
      return JSON.parse(JSON.stringify(_migrateBooks(cls.monthBooks[mk])));
    }

    // ★ 새 달 초기화: 현재 시스템 날짜 기준 "다음달(+1)"인 경우만 이전달 복사
    const todayMk  = monthKey(new Date());
    const nextMk   = nextMonthKey(todayMk); // 오늘 기준 다음달
    const prevMk   = prevMonthKey(mk);      // 요청 달의 이전달

    let newBooks;
    if (mk <= nextMk && cls.monthBooks[prevMk]) {
      // 오늘~다음달 범위 + 이전달 데이터 있음 → 이전달에서 복사 (독립 ID)
      const base = _migrateBooks(cls.monthBooks[prevMk]);
      newBooks = {
        pool: base.pool.map(b=>({...b, id:nid(), createdAt:now()})),
        main: base.main.map(b=>({...b, id:nid(), createdAt:now()})),
        sub:  base.sub.map(b=>({...b, id:nid(), createdAt:now()})),
      };
    } else {
      // 그 이후 달이거나 이전달 데이터 없음 → 빈 상태
      newBooks = _emptyBooks();
    }

    cls.monthBooks[mk] = newBooks;
    // ★ _syncClsQuiet: _fire 없이 저장 (렌더링 루프 방지)
    _syncClsQuiet(cls);
    return JSON.parse(JSON.stringify(newBooks));
  }

  /** Firebase 저장, _fire 없음 (렌더링 루프 방지) */
  async function _syncClsQuiet(cls) {
    const idx = C.classes.findIndex(c=>c.id===cls.id);
    if (idx!==-1) C.classes[idx] = cls;
    ls(LS.classes, C.classes);
    if (FireDB.ready()) {
      try { await FireDB.set(`${FireDB.P.classes}/${cls.id}`, cls); }
      catch(e) { console.error('syncClsQuiet', e); }
    }
  }

  /** Firebase 저장 + _fire (교재 추가/이동/삭제 후 UI 갱신) */
  async function _syncCls(cls) {
    await _syncClsQuiet(cls);
    _fire('classes');
  }

  /* ── Pool ───────────────────────────────── */
  async function addToPool(classId, mk, name) {
    const cls = getClassById(classId); if(!cls)return null;
    if (!cls.monthBooks) cls.monthBooks = {};
    if (!cls.monthBooks[mk]) {
      // 해당 달 없으면 먼저 getMonthBooks로 초기화
      getMonthBooks(classId, mk); // 로컬 초기화
    }
    _migrateBooks(cls.monthBooks[mk]);
    const b = {id:nid(), name, createdAt:now()};
    cls.monthBooks[mk].pool.push(b);
    await _syncCls(cls);
    return b;
  }

  /* ── 교재 이동 (zone간) ──────────────────── */
  async function moveBook(classId, mk, bookId, targetZone) {
    const cls = getClassById(classId); if(!cls)return;
    if (!cls.monthBooks?.[mk]) {
      getMonthBooks(classId, mk); // 초기화
    }
    const books = _migrateBooks(cls.monthBooks[mk]);
    let book = null;
    for (const z of ['pool','main','sub']) {
      const idx = books[z].findIndex(b=>b.id===bookId);
      if (idx!==-1) { book=books[z].splice(idx,1)[0]; break; }
    }
    if (!book) return;
    if (!books[targetZone]) books[targetZone]=[];
    books[targetZone].push(book);
    cls.monthBooks[mk] = books;
    await _syncCls(cls);
  }

  /* ── 교재명 변경 ─────────────────────────── */
  async function renameBook(classId, mk, bookId, newName) {
    const cls = getClassById(classId); if(!cls)return;
    if (!cls.monthBooks?.[mk]) return;
    const books = _migrateBooks(cls.monthBooks[mk]);
    for (const z of ['pool','main','sub']) {
      const b = books[z].find(b=>b.id===bookId);
      if (b) { b.name=newName; break; }
    }
    cls.monthBooks[mk] = books;
    await _syncCls(cls);
  }

  /* ── 교재 삭제 ─────────────────────────────
     ★ 수정: 반드시 해당 달(mk)의 데이터에서만 삭제
  ────────────────────────────────────────── */
  async function deleteBook(classId, mk, bookId) {
    const cls = getClassById(classId); if(!cls)return;
    // 해당 달 데이터가 없으면 초기화 후 진행
    if (!cls.monthBooks?.[mk]) { getMonthBooks(classId, mk); }
    if (!cls.monthBooks?.[mk]) return;

    const books = _migrateBooks(cls.monthBooks[mk]);
    for (const z of ['pool','main','sub']) {
      const idx = books[z].findIndex(b=>b.id===bookId);
      if (idx!==-1) { books[z].splice(idx,1); break; }
    }
    cls.monthBooks[mk] = books;
    await _syncCls(cls);

    // 해당 교재의 진도 데이터 정리
    const keys=Object.keys(C.progress).filter(k=>k.includes(`__${bookId}__`));
    if (keys.length) {
      keys.forEach(k=>delete C.progress[k]);
      ls(LS.progress,C.progress);
      if(FireDB.ready()){
        const u={};keys.forEach(k=>u[k]=null);
        await FireDB.update(FireDB.P.progress,u);
      }
    }
  }

  /* ── Zone 전체 삭제 ─────────────────────────
     ★ 수정: 반드시 mk의 독립 데이터에서 삭제 (다른 달 영향 없음)
  ────────────────────────────────────────── */
  async function clearZone(classId, mk, zone) {
    const cls = getClassById(classId); if(!cls)return;
    // 해당 달 데이터 없으면 초기화
    if (!cls.monthBooks?.[mk]) { getMonthBooks(classId, mk); }
    if (!cls.monthBooks?.[mk]) return;

    const books = _migrateBooks(cls.monthBooks[mk]);
    const ids = (books[zone]||[]).map(b=>b.id);
    books[zone] = []; // 해당 달만 비움
    cls.monthBooks[mk] = books;
    await _syncCls(cls);

    if (ids.length) {
      const keys=Object.keys(C.progress).filter(k=>ids.some(id=>k.includes(`__${id}__`)));
      if (keys.length) {
        keys.forEach(k=>delete C.progress[k]);
        ls(LS.progress,C.progress);
        if(FireDB.ready()){
          const u={};keys.forEach(k=>u[k]=null);
          await FireDB.update(FireDB.P.progress,u);
        }
      }
    }
  }

  /* ══════════════════════════════ PROGRESS ══════════════════════════════
     진도 키: classId__weekKey__dayName__bookId__progress
     메모 키: classId__weekKey__dayName__MEMO  (요일당 1개)
     날짜 키: classId__weekKey__dayName__bookId__savedAt
  ════════════════════════════════════════════════════════════════════════ */
  function getWeekProgress(classId, weekKey) {
    const pfx = `${classId}__${weekKey}__`;
    const res = {};
    Object.keys(C.progress).forEach(k=>{
      if(k.startsWith(pfx)) res[k.slice(pfx.length)] = C.progress[k];
    });
    return res;
  }

  function autoSave(classId, weekKey, dayName, field, value, bookId=null) {
    let key;
    if (field==='memo') {
      key = `${classId}__${weekKey}__${dayName}__MEMO`;
    } else {
      const dateKey = `${classId}__${weekKey}__${dayName}__${bookId}__savedAt`;
      const dv = value ? now() : null;
      if (!dv) delete C.progress[dateKey]; else C.progress[dateKey] = dv;
      if (FireDB.ready()) FireDB.debounced(`${FireDB.P.progress}/${dateKey}`, dv);
      key = `${classId}__${weekKey}__${dayName}__${bookId}__progress`;
    }
    if (!value) delete C.progress[key]; else C.progress[key] = value;
    ls(LS.progress, C.progress);
    if (FireDB.ready()) FireDB.debounced(`${FireDB.P.progress}/${key}`, value);
  }

  async function saveProgressBatch(entries) {
    const upd = {};
    entries.forEach(({key,value})=>{
      if(!value){delete C.progress[key];upd[key]=null;}
      else{C.progress[key]=value;upd[key]=value;}
    });
    ls(LS.progress,C.progress);
    if(FireDB.ready()) await FireDB.update(FireDB.P.progress,upd);
  }

  /* ══════════════════════════════ THEME ══════════════════════════════ */
  const getTheme = () => C.theme || {
    palette:'light1', fontFamily:'Noto Sans KR', fontSize:14,
    viewMode:'grid', operateView:'grid', inputBoxWidth:140
  };
  async function saveTheme(t) {
    C.theme=t; ls(LS.theme,t);
    if(FireDB.ready()) await FireDB.set(FireDB.P.theme,t);
  }

  /* ══════════════════════════════ EXPORT / IMPORT ══════════════════════════════ */
  function exportAll() {
    return { version:9, exportedAt:now(), classes:C.classes, progress:C.progress, theme:C.theme };
  }
  async function importAll(data) {
    const result={added:[],updated:[]};
    if(Array.isArray(data.classes)){
      for(const nc of data.classes){
        const ex=C.classes.find(c=>c.id===nc.id);
        if(!ex){C.classes.push({...nc,_new:true});result.added.push(nc.name);}
        else{Object.assign(ex,nc);result.updated.push(nc.name);}
        if(FireDB.ready()) await FireDB.set(`${FireDB.P.classes}/${nc.id}`,nc);
      }
      ls(LS.classes,C.classes);
    }
    if(data.progress){
      Object.assign(C.progress,data.progress); ls(LS.progress,C.progress);
      if(FireDB.ready()) await FireDB.update(FireDB.P.progress,data.progress);
    }
    if(data.theme) await saveTheme(data.theme);
    _fire('classes');_fire('progress');_fire('theme');
    return result;
  }

  /* ══════════════════════════════ DATE UTILS ══════════════════════════════ */
  function monthKey(d) {
    const x=new Date(d);
    // ★ 수정: padStart(2,'0') — '00' 버그 수정
    return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`;
  }
  function prevMonthKey(mk) {
    const [y,m]=mk.split('-').map(Number);
    return monthKey(new Date(y,m-2,1));
  }
  function nextMonthKey(mk) {
    const [y,m]=mk.split('-').map(Number);
    return monthKey(new Date(y,m,1));
  }
  function toWeekKey(d) {
    const x=new Date(d); x.setHours(0,0,0,0);
    const thu=new Date(x); thu.setDate(x.getDate()-((x.getDay()+6)%7)+3);
    const y=thu.getFullYear(), j=new Date(y,0,4);
    const w=Math.ceil(((thu-j)/86400000+j.getDay()+1)/7);
    return `${y}-W${String(w).padStart(2,'0')}`;
  }

  return {
    init, on,
    monthKey, prevMonthKey, nextMonthKey, toWeekKey,
    getSession, setSession, clearSession, isLoggedIn, isAdmin, canOperate, login,
    getAccounts, addAccount, updateAccount, deleteAccount,
    getClasses, getClassById, classExists, addClass, updateClass, deleteClass,
    getMonthBooks, addToPool, moveBook, renameBook, deleteBook, clearZone,
    getWeekProgress, autoSave, saveProgressBatch,
    getTheme, saveTheme, exportAll, importAll,
  };
})();
