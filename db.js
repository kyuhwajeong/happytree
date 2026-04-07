/**
 * db.js — v6
 * 추가: 권한(role), 메모, 등록일, 입력날짜, 전체 백업/복원
 */
const DB = (() => {
  const LS = {
    classes:'hk6_cls', progress:'hk6_prog',
    accounts:'hk6_acc', theme:'hk6_theme', session:'hk6_sess',
  };
  const lg = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const ls = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };
  const nid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const nowISO = () => new Date().toISOString();

  /* 캐시 */
  let C = { classes:[], progress:{}, accounts:[], theme:null };

  /* 이벤트 */
  const _ev = {};
  function _fire(t) {
    (_ev[t]||[]).forEach(f=>{ try{f();}catch(e){console.error(e);} });
    (_ev['*'] ||[]).forEach(f=>{ try{f(t);}catch(e){} });
  }
  function on(t,f) { if(!_ev[t])_ev[t]=[]; _ev[t].push(f); }

  /* ═══════════════ INIT ═══════════════ */
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
    } catch(e) { console.warn('FB load fail →LS', e.message); _loadLS(); }
  }

  function _listenFB() {
    FireDB.listen(FireDB.P.classes, v => {
      const nd = v ? Object.values(v) : [];
      if (JSON.stringify(nd)!==JSON.stringify(C.classes)) {
        C.classes=nd; ls(LS.classes,C.classes); _fire('classes');
      }
    });
    FireDB.listen(FireDB.P.progress, v => {
      C.progress=v||{}; ls(LS.progress,C.progress); _fire('progress');
    });
    FireDB.listen(FireDB.P.accounts, v => {
      const nd=v?Object.values(v):[];
      if (JSON.stringify(nd)!==JSON.stringify(C.accounts)) {
        C.accounts=nd; ls(LS.accounts,C.accounts); _fire('accounts');
      }
    });
    FireDB.listen(FireDB.P.theme, v => {
      if (v) { C.theme=v; ls(LS.theme,v); _fire('theme'); }
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
    if (!C.theme) await saveTheme({ palette:'system', inputBoxWidth:160, operateView:'grid' });
    if (!C.classes.length) {
      const mk = monthKey(new Date());
      const c1 = await addClass({name:'H1',days:['월','화','목','금']});
      const c2 = await addClass({name:'T1',days:['월','수','금']});
      await addBook(c1.id,mk,'main','수학의 정석(상)');
      await addBook(c1.id,mk,'sub','쎈 수학');
      await addBook(c2.id,mk,'main','개념원리');
    }
  }

  /* ═══════════════ SESSION ═══════════════ */
  const getSession   = () => lg(LS.session);
  const setSession   = a  => ls(LS.session,a);
  const clearSession = () => localStorage.removeItem(LS.session);
  const isLoggedIn   = () => !!lg(LS.session);
  const isAdmin      = () => { const s=lg(LS.session); return s?.role==='admin'; };
  const canOperate   = () => { const s=lg(LS.session); return !!s; }; // admin + operator

  function login(username, pw) {
    const acc = C.accounts.find(a=>a.username===username&&a.password===pw);
    if (acc) { setSession(acc); return acc; }
    return null;
  }

  /* ═══════════════ ACCOUNTS ═══════════════ */
  const getAccounts = () => C.accounts||[];

  async function _addAcc(username,pw,role) {
    const acc={id:nid(),username,password:pw,role,createdAt:nowISO()};
    C.accounts=[...C.accounts,acc]; ls(LS.accounts,C.accounts);
    if(FireDB.ready()) await FireDB.set(`${FireDB.P.accounts}/${acc.id}`,acc);
    return acc;
  }
  async function addAccount(username,pw,role='operator') {
    if (C.accounts.find(a=>a.username===username)) return null;
    return _addAcc(username,pw,role);
  }
  async function updateAccount(id,data) {
    const idx=C.accounts.findIndex(a=>a.id===id);
    if(idx===-1) return null;
    C.accounts[idx]={...C.accounts[idx],...data};
    ls(LS.accounts,C.accounts);
    if(FireDB.ready()) await FireDB.set(`${FireDB.P.accounts}/${id}`,C.accounts[idx]);
    return C.accounts[idx];
  }
  async function deleteAccount(id) {
    C.accounts=C.accounts.filter(a=>a.id!==id);
    ls(LS.accounts,C.accounts);
    if(FireDB.ready()) await FireDB.remove(`${FireDB.P.accounts}/${id}`);
  }

  /* ═══════════════ CLASSES ═══════════════ */
  const getClasses   = () => C.classes||[];
  const getClassById = id => C.classes.find(c=>c.id===id)||null;
  const classExists  = name => C.classes.some(c=>c.name.trim()===name.trim());

  async function addClass(data) {
    if (classExists(data.name)) return null; // 중복 방지
    const cls={id:nid(),monthBooks:{},createdAt:nowISO(),...data};
    C.classes=[...C.classes,cls]; ls(LS.classes,C.classes);
    if(FireDB.ready()) await FireDB.set(`${FireDB.P.classes}/${cls.id}`,cls);
    return cls;
  }
  async function updateClass(id,data) {
    const idx=C.classes.findIndex(c=>c.id===id);
    if(idx===-1) return null;
    C.classes[idx]={...C.classes[idx],...data};
    ls(LS.classes,C.classes);
    if(FireDB.ready()) await FireDB.update(`${FireDB.P.classes}/${id}`,data);
    return C.classes[idx];
  }
  async function deleteClass(id) {
    C.classes=C.classes.filter(c=>c.id!==id);
    ls(LS.classes,C.classes);
    if(FireDB.ready()) await FireDB.remove(`${FireDB.P.classes}/${id}`);
    const keys=Object.keys(C.progress).filter(k=>k.startsWith(id+'__'));
    keys.forEach(k=>delete C.progress[k]);
    ls(LS.progress,C.progress);
    if(FireDB.ready()&&keys.length){
      const u={};keys.forEach(k=>u[k]=null);
      await FireDB.update(FireDB.P.progress,u);
    }
  }

  /* ═══════════════ MONTH BOOKS ═══════════════ */
  function getMonthBooks(classId, mk) {
    const cls=getClassById(classId);
    if(!cls) return {main:[],sub:[]};
    if(!cls.monthBooks) cls.monthBooks={};
    if(cls.monthBooks[mk]) return JSON.parse(JSON.stringify(cls.monthBooks[mk]));
    // 이전 달 복사
    const prev=prevMonthKey(mk);
    const base=cls.monthBooks[prev];
    cls.monthBooks[mk]=base
      ?{main:base.main.map(b=>({...b,id:nid(),createdAt:nowISO()})),
        sub: base.sub.map(b=>({...b,id:nid(),createdAt:nowISO()}))}
      :{main:[],sub:[]};
    _syncCls(cls);
    return JSON.parse(JSON.stringify(cls.monthBooks[mk]));
  }

  async function _syncCls(cls) {
    const idx=C.classes.findIndex(c=>c.id===cls.id);
    if(idx!==-1) C.classes[idx]=cls;
    ls(LS.classes,C.classes);
    if(FireDB.ready()) await FireDB.set(`${FireDB.P.classes}/${cls.id}`,cls);
  }

  async function addBook(classId,mk,type,name) {
    const cls=getClassById(classId); if(!cls) return null;
    if(!cls.monthBooks) cls.monthBooks={};
    if(!cls.monthBooks[mk]) cls.monthBooks[mk]={main:[],sub:[]};
    const b={id:nid(),name,active:true,createdAt:nowISO()};
    cls.monthBooks[mk][type].push(b);
    await _syncCls(cls); _fire('classes'); return b;
  }

  async function updateBook(classId,mk,type,bookId,data) {
    const cls=getClassById(classId);
    if(!cls||!cls.monthBooks?.[mk]) return;
    const idx=cls.monthBooks[mk][type].findIndex(b=>b.id===bookId);
    if(idx===-1) return;
    cls.monthBooks[mk][type][idx]={...cls.monthBooks[mk][type][idx],...data};
    await _syncCls(cls); _fire('classes');
  }

  async function deleteBook(classId,mk,type,bookId) {
    const cls=getClassById(classId);
    if(!cls||!cls.monthBooks?.[mk]) return;
    cls.monthBooks[mk][type]=cls.monthBooks[mk][type].filter(b=>b.id!==bookId);
    await _syncCls(cls);
    const keys=Object.keys(C.progress).filter(k=>k.includes(`__${bookId}`));
    keys.forEach(k=>delete C.progress[k]);
    ls(LS.progress,C.progress);
    if(FireDB.ready()&&keys.length){
      const u={};keys.forEach(k=>u[k]=null);
      await FireDB.update(FireDB.P.progress,u);
    }
    _fire('classes');
  }

  /** 특정 반+월 교재 전체 삭제 */
  async function clearMonthBooks(classId,mk,type) {
    const cls=getClassById(classId);
    if(!cls||!cls.monthBooks?.[mk]) return;
    const ids=(cls.monthBooks[mk][type]||[]).map(b=>b.id);
    cls.monthBooks[mk][type]=[];
    await _syncCls(cls);
    const keys=Object.keys(C.progress).filter(k=>ids.some(id=>k.includes(`__${id}`)));
    keys.forEach(k=>delete C.progress[k]);
    ls(LS.progress,C.progress);
    if(FireDB.ready()&&keys.length){
      const u={};keys.forEach(k=>u[k]=null);
      await FireDB.update(FireDB.P.progress,u);
    }
    _fire('classes');
  }

  /* ═══════════════ PROGRESS ═══════════════ */
  function getWeekProgress(classId,weekKey) {
    const pfx=`${classId}__${weekKey}__`;
    const res={};
    Object.keys(C.progress).forEach(k=>{
      if(k.startsWith(pfx)) res[k.slice(pfx.length)]=C.progress[k];
    });
    return res;
  }

  function autoSave(classId,weekKey,dayName,bookId,field,value) {
    // field: 'progress' | 'memo'
    const key=`${classId}__${weekKey}__${dayName}__${bookId}__${field}`;
    const dateKey=`${classId}__${weekKey}__${dayName}__${bookId}__savedAt`;
    if(!value){delete C.progress[key]; delete C.progress[dateKey];}
    else{C.progress[key]=value; C.progress[dateKey]=nowISO();}
    ls(LS.progress,C.progress);
    if(FireDB.ready()){
      FireDB.debounced(`${FireDB.P.progress}/${key}`,value);
      if(value) FireDB.debounced(`${FireDB.P.progress}/${dateKey}`,nowISO());
    }
  }

  async function saveProgressBatch(entries) {
    const upd={};
    entries.forEach(({classId,weekKey,dayName,bookId,field,value})=>{
      const k=`${classId}__${weekKey}__${dayName}__${bookId}__${field}`;
      if(!value){delete C.progress[k];upd[k]=null;}
      else{C.progress[k]=value;upd[k]=value;}
    });
    ls(LS.progress,C.progress);
    if(FireDB.ready()) await FireDB.update(FireDB.P.progress,upd);
  }

  /* ═══════════════ THEME ═══════════════ */
  const getTheme = () => C.theme||{palette:'system',inputBoxWidth:160,operateView:'grid'};
  async function saveTheme(t) {
    C.theme=t; ls(LS.theme,t);
    if(FireDB.ready()) await FireDB.set(FireDB.P.theme,t);
  }

  /* ═══════════════ EXPORT / IMPORT (전체 백업) ═══════════════ */
  function exportAll() {
    return {
      version:6,
      exportedAt:nowISO(),
      classes:C.classes,
      progress:C.progress,
      theme:C.theme,
      // 계정 비밀번호는 제외
      accounts:C.accounts.map(a=>({...a,password:'***'})),
    };
  }

  async function importAll(data) {
    const result={added:[],updated:[]};
    // classes
    if(Array.isArray(data.classes)){
      for(const nc of data.classes){
        const ex=C.classes.find(c=>c.id===nc.id);
        if(!ex){C.classes.push({...nc,_new:true});result.added.push(nc.name);}
        else{Object.assign(ex,nc);result.updated.push(nc.name);}
        if(FireDB.ready()) await FireDB.set(`${FireDB.P.classes}/${nc.id}`,nc);
      }
      ls(LS.classes,C.classes);
    }
    // progress (전체 덮어쓰기)
    if(data.progress&&typeof data.progress==='object'){
      Object.assign(C.progress,data.progress);
      ls(LS.progress,C.progress);
      if(FireDB.ready()) await FireDB.update(FireDB.P.progress,data.progress);
    }
    // theme
    if(data.theme) await saveTheme(data.theme);
    _fire('classes'); _fire('progress'); _fire('theme');
    return result;
  }

  /* ═══════════════ DATE UTILS ═══════════════ */
  function monthKey(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`;}
  function prevMonthKey(mk){const[y,m]=mk.split('-').map(Number);return monthKey(new Date(y,m-2,1));}
  function nextMonthKey(mk){const[y,m]=mk.split('-').map(Number);return monthKey(new Date(y,m,1));}
  function toWeekKey(d){
    const x=new Date(d);x.setHours(0,0,0,0);
    const thu=new Date(x);thu.setDate(x.getDate()-((x.getDay()+6)%7)+3);
    const y=thu.getFullYear(),j=new Date(y,0,4);
    const w=Math.ceil(((thu-j)/86400000+j.getDay()+1)/7);
    return `${y}-W${String(w).padStart(2,'0')}`;
  }

  return {
    init, on,
    monthKey,prevMonthKey,nextMonthKey,toWeekKey,
    getSession,setSession,clearSession,isLoggedIn,isAdmin,canOperate,login,
    getAccounts,addAccount,updateAccount,deleteAccount,
    getClasses,getClassById,classExists,addClass,updateClass,deleteClass,
    getMonthBooks,addBook,updateBook,deleteBook,clearMonthBooks,
    getWeekProgress,autoSave,saveProgressBatch,
    getTheme,saveTheme,
    exportAll,importAll,
  };
})();
