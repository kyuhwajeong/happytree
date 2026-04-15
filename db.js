/**
 * db.js — v10b
 *
 * 주요 변경:
 * 1. 반 편성 기간(term) 지원: 같은 이름이라도 기간별 독립 데이터
 *    - 반 구조: {id, name, days, termStart(YYYY-MM), termEnd(YYYY-MM|null), monthBooks:{}}
 *    - 반 추가 시 termStart=현재달, termEnd=null(현재 운용 중)
 *    - "같은 이름 반 재편성" → 기존 반의 termEnd를 설정하고 새 반 생성
 * 2. 반간 교재 복사: copyBooksToClass(fromClsId, toClsId, mk)
 * 3. 백업: progress + memo + 반 전체 완전 백업/복원
 * 4. getTheme: mainFontSize, subFontSize 개별 추가
 */
const DB = (() => {
  const LS = {
    classes:'hk10b_cls', progress:'hk10b_prog',
    accounts:'hk10b_acc', theme:'hk10b_theme', session:'hk10b_sess',
  };
  const lg = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const ls = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };
  const nid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const now = () => new Date().toISOString();

  let C = { classes:[], progress:{}, accounts:[], theme:null };

  const _ev = {};
  function _fire(t) {
    (_ev[t]||[]).forEach(f=>{ try{f();}catch(e){} });
    (_ev['*'] ||[]).forEach(f=>{ try{f(t);}catch(e){} });
  }
  function on(t,f) { if(!_ev[t])_ev[t]=[]; _ev[t].push(f); }

  /* ═══ INIT ═══ */
  async function init() {
    const fbOk = FireDB.init();
    if (fbOk) { await _loadFB(); _listenFB(); }
    else _loadLS();
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
      } else _loadLS();
    } catch(e) { console.warn('FB→LS', e.message); _loadLS(); }
  }

  function _listenFB() {
    FireDB.listen(FireDB.P.classes, v => {
      const nd = v ? Object.values(v) : [];
      const merged = _mergeClasses(nd, C.classes);
      if (JSON.stringify(merged) !== JSON.stringify(C.classes)) {
        C.classes = merged; ls(LS.classes, C.classes); _fire('classes');
      }
    });
    FireDB.listen(FireDB.P.progress, v => {
      C.progress = v||{}; ls(LS.progress,C.progress); _fire('progress');
    });
    FireDB.listen(FireDB.P.accounts, async v => {
      const nd=v?Object.values(v):[];
      if (JSON.stringify(nd)!==JSON.stringify(C.accounts)) {
        C.accounts=nd; ls(LS.accounts,C.accounts);
        // ★ Firebase DB 삭제/초기화 후에도 admin 항상 보장
        await _ensureAdmin();
        _fire('accounts');
      }
    });
    FireDB.listen(FireDB.P.theme, v => {
      if (v && JSON.stringify(v)!==JSON.stringify(C.theme)) {
        C.theme=v; ls(LS.theme,v); _fire('theme');
      }
    });
  }

  function _mergeClasses(fbList, localList) {
    return fbList.map(fbCls => {
      const localCls = localList.find(c => c.id === fbCls.id);
      if (!localCls?.monthBooks) return fbCls;
      const merged = { ...fbCls, monthBooks: { ...(fbCls.monthBooks || {}) } };
      Object.keys(localCls.monthBooks).forEach(mk => {
        if (!merged.monthBooks[mk]) merged.monthBooks[mk] = localCls.monthBooks[mk];
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

  // ★ admin 계정 항상 보장 (Firebase 초기화 후에도)
  async function _ensureAdmin() {
    const hasAdmin = C.accounts.some(a => a.role === 'admin');
    if (!hasAdmin) {
      // admin이 없으면 기본 계정 생성
      const existing = C.accounts.find(a => a.username === 'admin');
      if (existing) {
        existing.role = 'admin';
        ls(LS.accounts, C.accounts);
        if (FireDB.ready()) await FireDB.set(`${FireDB.P.accounts}/${existing.id}`, existing);
      } else {
        await _addAcc('admin', '1234', 'admin');
      }
    }
  }

  async function _seed() {
    // ★ admin 항상 보장 (DB 삭제/초기화 후에도)
    await _ensureAdmin();
    if (!C.theme) await saveTheme({
      palette:'light1', fontFamily:'Noto Sans KR', fontSize:14,
      mainFontSize:14, subFontSize:13,
      viewMode:'grid', operateView:'grid', inputBoxWidth:140
    });
    if (!C.classes.length) {
      const mk = monthKey(new Date());
      const c1 = await addClass({name:'H1',days:['월','화','목','금'],termStart:mk});
      await addToPool(c1.id,mk,'수학의 정석(상)');
      await addToPool(c1.id,mk,'쎈 수학');
      const b1=getMonthBooks(c1.id,mk);
      if(b1.pool.length>=2){
        await moveBook(c1.id,mk,b1.pool[0].id,'main');
        await moveBook(c1.id,mk,b1.pool[0].id,'sub');
      }
    }
  }

  /* ═══ SESSION ═══ */
  const getSession   = () => lg(LS.session);
  const setSession   = a  => ls(LS.session,a);
  const clearSession = () => localStorage.removeItem(LS.session);
  const isLoggedIn   = () => !!lg(LS.session);
  const isAdmin      = () => lg(LS.session)?.role === 'admin';
  const canOperate   = () => !!lg(LS.session);
  function login(username, pw) {
    const acc = C.accounts.find(a=>a.username===username && a.password===pw);
    if (acc) { setSession(acc); return acc; } return null;
  }

  // ★ Firebase 초기화 후 admin 강제 생성 (로그인 불가 상황 복구)
  async function _forceAdminLogin() {
    await _addAcc('admin','1234','admin');
  }

  /* ═══ ACCOUNTS ═══ */
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

  /* ═══ CLASSES (편성 기간 지원) ═══
   * 반 구조:
   *   id: 고유 ID
   *   name: 반 이름 (H1 등)
   *   days: 수업 요일
   *   termStart: 편성 시작 월 (YYYY-MM)
   *   termEnd: 편성 종료 월 (YYYY-MM) or null(현재 운용 중)
   *   monthBooks: {YYYY-MM: {pool,main,sub}}
   *
   * 같은 이름이라도 termStart가 다르면 별개의 반
   * getActiveClasses(): termEnd=null인 현재 운용 중 반 목록
   * getClasses(): 전체 반 목록 (이력 포함)
   */
  const getClasses       = () => C.classes||[];
  const getActiveClasses = () => (C.classes||[]).filter(c=>!c.termEnd);
  const getClassById     = id => C.classes.find(c=>c.id===id)||null;
  const classExists      = name => (C.classes||[]).some(c=>c.name.trim()===name.trim() && !c.termEnd);

  // 특정 월(YYYY-MM)에 활성이었던 반 반환
  function getClassesForMonth(mk) {
    return (C.classes||[]).filter(c => {
      const s = c.termStart || '2000-01';
      const e = c.termEnd   || '9999-12';
      return s <= mk && mk <= e;
    });
  }

  async function addClass(data) {
    // 같은 이름 활성 반이 있으면 종료 처리 후 새 반 생성
    const existing = (C.classes||[]).find(c=>c.name.trim()===data.name.trim() && !c.termEnd);
    if (existing) {
      const prevMk = prevMonthKey(data.termStart||monthKey(new Date()));
      existing.termEnd = prevMk;
      await _syncClsQuiet(existing);
    }
    const mk = data.termStart || monthKey(new Date());
    const cls = {id:nid(),monthBooks:{},createdAt:now(),termStart:mk,termEnd:null,...data};
    C.classes = [...C.classes,cls]; ls(LS.classes,C.classes);
    if(FireDB.ready()) await FireDB.set(`${FireDB.P.classes}/${cls.id}`,cls);
    return cls;
  }

  async function addClassNew(data) {
    // 무조건 새 반 생성 (중복 이름 허용, 기존 반 종료 안 함)
    const mk = data.termStart || monthKey(new Date());
    const cls = {id:nid(),monthBooks:{},createdAt:now(),termStart:mk,termEnd:null,...data};
    C.classes = [...C.classes,cls]; ls(LS.classes,C.classes);
    if(FireDB.ready()) await FireDB.set(`${FireDB.P.classes}/${cls.id}`,cls);
    return cls;
  }

  async function terminateClass(id) {
    // 반 편성 종료 (termEnd 설정)
    const cls = getClassById(id); if(!cls)return;
    cls.termEnd = prevMonthKey(monthKey(new Date()));
    await _syncClsQuiet(cls); _fire('classes');
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
    keys.forEach(k=>delete C.progress[k]); ls(LS.progress,C.progress);
    if(FireDB.ready()&&keys.length){
      const u={}; keys.forEach(k=>u[k]=null);
      await FireDB.update(FireDB.P.progress,u);
    }
  }

  /* ═══ MONTH BOOKS ═══ */
  function _emptyBooks() { return {pool:[],main:[],sub:[]}; }
  function _migrateBooks(raw) {
    if (!raw) return _emptyBooks();
    if (!raw.pool) raw.pool = [];
    if (!raw.main) raw.main = [];
    if (!raw.sub)  raw.sub  = [];
    return raw;
  }

  function getMonthBooks(classId, mk) {
    const cls = getClassById(classId);
    if (!cls) return _emptyBooks();
    if (!cls.monthBooks) cls.monthBooks = {};
    if (cls.monthBooks[mk]) return JSON.parse(JSON.stringify(_migrateBooks(cls.monthBooks[mk])));

    const todayMk  = monthKey(new Date());
    const nextMk   = nextMonthKey(todayMk);
    const prevMk   = prevMonthKey(mk);

    let newBooks;
    if (mk <= nextMk && cls.monthBooks[prevMk]) {
      const base = _migrateBooks(cls.monthBooks[prevMk]);
      newBooks = {
        pool: base.pool.map(b=>({...b,id:nid(),createdAt:now()})),
        main: base.main.map(b=>({...b,id:nid(),createdAt:now()})),
        sub:  base.sub.map(b=>({...b,id:nid(),createdAt:now()})),
      };
    } else {
      newBooks = _emptyBooks();
    }
    cls.monthBooks[mk] = newBooks;
    _syncClsQuiet(cls);
    return JSON.parse(JSON.stringify(newBooks));
  }

  async function _syncClsQuiet(cls) {
    const idx = C.classes.findIndex(c=>c.id===cls.id);
    if (idx!==-1) C.classes[idx] = cls;
    ls(LS.classes, C.classes);
    if (FireDB.ready()) {
      try { await FireDB.set(`${FireDB.P.classes}/${cls.id}`, cls); }
      catch(e) { console.error('syncCls', e); }
    }
  }

  async function _syncCls(cls) { await _syncClsQuiet(cls); _fire('classes'); }

  async function addToPool(classId, mk, name) {
    const cls = getClassById(classId); if(!cls)return null;
    if (!cls.monthBooks) cls.monthBooks = {};
    if (!cls.monthBooks[mk]) { getMonthBooks(classId, mk); }
    _migrateBooks(cls.monthBooks[mk]);
    const b = {id:nid(), name, createdAt:now()};
    cls.monthBooks[mk].pool.push(b);
    await _syncCls(cls); return b;
  }

  async function moveBook(classId, mk, bookId, targetZone) {
    const cls = getClassById(classId); if(!cls)return;
    if (!cls.monthBooks?.[mk]) { getMonthBooks(classId, mk); }
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

  /** 반 간 교재 복사 (fromMk 원본 월, toMk 대상 월) */
  // ★ 교재 내용이 있는지 확인하는 헬퍼
  function _hasBooks(booksObj) {
    if (!booksObj) return false;
    return (booksObj.pool||[]).length > 0 ||
           (booksObj.main||[]).length > 0 ||
           (booksObj.sub||[]).length > 0;
  }

  async function copyBooksToClass(fromClsId, toClsId, fromMk, toMk) {
    const fromCls = getClassById(fromClsId);
    const toCls   = getClassById(toClsId);
    if (!fromCls || !toCls) return false;

    // ★ 핵심 수정: 키 존재 여부가 아니라 실제 교재 내용이 있는지 확인
    let srcMk = fromMk;
    const hasBooksInSrcMk = _hasBooks(fromCls.monthBooks?.[srcMk]);

    if (!hasBooksInSrcMk) {
      // 내용이 있는 가장 최근 월 탐색 (전체 monthBooks 검색)
      const months = Object.keys(fromCls.monthBooks || {})
        .filter(mk => _hasBooks(fromCls.monthBooks[mk]))
        .sort()
        .reverse();
      if (!months.length) {
        return false; // 복사할 교재 없음
      }
      srcMk = months[0];
    }

    const fromBooks = _migrateBooks(JSON.parse(JSON.stringify(fromCls.monthBooks[srcMk])));

    if (!toCls.monthBooks) toCls.monthBooks = {};
    const targetMk = toMk || monthKey(new Date());
    if (!toCls.monthBooks[targetMk]) { getMonthBooks(toClsId, targetMk); }
    const toBooks = _migrateBooks(toCls.monthBooks[targetMk]);

    let copied = 0;
    // pool + main + sub 모두 → 대상 반 pool에 추가 (중복 이름 제외)
    ['pool', 'main', 'sub'].forEach(z => {
      (fromBooks[z] || []).forEach(b => {
        const allNames = [
          ...toBooks.pool,
          ...toBooks.main,
          ...toBooks.sub
        ].map(x => x.name);
        if (!allNames.includes(b.name)) {
          toBooks.pool.push({
            id: nid(),
            name: b.name,
            createdAt: now(),
            copiedFrom: fromClsId
          });
          copied++;
        }
      });
    });

    if (copied === 0) return false; // 복사된 게 없음

    toCls.monthBooks[targetMk] = toBooks;
    await _syncCls(toCls);
    return copied;
  }

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

  async function deleteBook(classId, mk, bookId) {
    const cls = getClassById(classId); if(!cls)return;
    if (!cls.monthBooks?.[mk]) { getMonthBooks(classId, mk); }
    if (!cls.monthBooks?.[mk]) return;
    const books = _migrateBooks(cls.monthBooks[mk]);
    for (const z of ['pool','main','sub']) {
      const idx = books[z].findIndex(b=>b.id===bookId);
      if (idx!==-1) { books[z].splice(idx,1); break; }
    }
    cls.monthBooks[mk] = books;
    await _syncCls(cls);
    const keys=Object.keys(C.progress).filter(k=>k.includes(`__${bookId}__`));
    if (keys.length) {
      keys.forEach(k=>delete C.progress[k]); ls(LS.progress,C.progress);
      if(FireDB.ready()){const u={};keys.forEach(k=>u[k]=null);await FireDB.update(FireDB.P.progress,u);}
    }
  }

  async function clearZone(classId, mk, zone) {
    const cls = getClassById(classId); if(!cls)return;
    if (!cls.monthBooks?.[mk]) { getMonthBooks(classId, mk); }
    if (!cls.monthBooks?.[mk]) return;
    const books = _migrateBooks(cls.monthBooks[mk]);
    const ids = (books[zone]||[]).map(b=>b.id);
    books[zone] = [];
    cls.monthBooks[mk] = books;
    await _syncCls(cls);
    if (ids.length) {
      const keys=Object.keys(C.progress).filter(k=>ids.some(id=>k.includes(`__${id}__`)));
      if (keys.length) {
        keys.forEach(k=>delete C.progress[k]); ls(LS.progress,C.progress);
        if(FireDB.ready()){const u={};keys.forEach(k=>u[k]=null);await FireDB.update(FireDB.P.progress,u);}
      }
    }
  }

  /* ═══ PROGRESS ═══ */
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
      // ★ savedAt은 debounce 없이 즉시 저장 (날짜 표시 정확도)
      if (FireDB.ready()) {
        if (dv) FireDB.set(`${FireDB.P.progress}/${dateKey}`, dv);
        else FireDB.remove(`${FireDB.P.progress}/${dateKey}`);
      }
      key = `${classId}__${weekKey}__${dayName}__${bookId}__progress`;
    }
    if (!value) delete C.progress[key]; else C.progress[key] = value;
    ls(LS.progress, C.progress);
    // 진도값/메모는 debounce(800ms)
    if (FireDB.ready()) FireDB.debounced(`${FireDB.P.progress}/${key}`, value||null, 800);
  }

  /* ═══ THEME ═══ */
  const getTheme = () => C.theme || {
    palette:'light1', fontFamily:'Noto Sans KR', fontSize:14,
    mainFontSize:14, subFontSize:13,
    viewMode:'grid', operateView:'grid', inputBoxWidth:140
  };
  async function saveTheme(t) {
    C.theme=t; ls(LS.theme,t);
    if(FireDB.ready()) await FireDB.set(FireDB.P.theme,t);
  }

  /* ═══ EXPORT / IMPORT (완전 백업) ═══ */
  function exportAll() {
    return {
      version:'10b',
      exportedAt:now(),
      classes:C.classes,       // 반 + monthBooks 전체
      progress:C.progress,     // 진도 + 메모 전체
      theme:C.theme,
    };
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
    if(data.progress && typeof data.progress==='object'){
      // 기존 진도 덮어쓰기 (복원)
      C.progress = {...C.progress, ...data.progress};
      ls(LS.progress,C.progress);
      if(FireDB.ready()) await FireDB.update(FireDB.P.progress,data.progress);
    }
    if(data.theme) await saveTheme(data.theme);
    _fire('classes');_fire('progress');_fire('theme');
    return result;
  }

  /* ═══ DATE UTILS ═══ */
  function monthKey(d) {
    const x=new Date(d);
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
    getSession, setSession, clearSession, isLoggedIn, isAdmin, canOperate, login, _forceAdminLogin,
    getAccounts, addAccount, updateAccount, deleteAccount,
    getClasses, getActiveClasses, getClassesForMonth, getClassById, classExists,
    addClass, addClassNew, terminateClass, updateClass, deleteClass,
    getMonthBooks, addToPool, moveBook, copyBooksToClass, renameBook, deleteBook, clearZone,
    getWeekProgress, autoSave,
    getTheme, saveTheme, exportAll, importAll,
  };
})();
