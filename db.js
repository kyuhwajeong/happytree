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
    inited:'hk10b_inited',  // ★ 최초 설치 완료 플래그
    outbox:'hk10b_outbox',  // ★ 신규: 서버에 아직 확인 안 된 진도/메모 대기열(강제종료 대비)
  };
  const lg = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const ls = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };
  const nid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const now = () => new Date().toISOString();

  let C = { classes:[], progress:{}, accounts:[], theme:null };

  // ★ Pending 쓰기 키 추적: Firebase 리스너가 debounce 대기 중인 로컬 값을 덮어쓰지 않도록 보호
  const _pendingKeys = new Set();
  const _progressDebounce = {};

  // ★★★ 데이터 유실 방지 핵심 장치 ★★★
  // 진도/메모는 "입력 → 최대 800ms 대기 → Firebase 전송" 구조라, 그 800ms 안에
  // 반을 전환하거나 앱/탭을 닫으면 서버에 반영되기 전에 다음 로그인 시 통째로
  // 덮어써져 사라질 수 있었다(_loadFB가 서버 스냅샷으로 C.progress를 무조건 교체하기 때문).
  // → 화면이 보이지 않게 되는 "모든" 시점에 대기 중인 쓰기를 즉시(디바운스 무시) 강제 실행한다.
  function _flushPendingWrites() {
    Object.keys(_progressDebounce).forEach(key => {
      clearTimeout(_progressDebounce[key]);
      delete _progressDebounce[key];
      const value = C.progress[key];
      const path = `${FireDB.P.progress}/${key}`;
      const p = (value === undefined || value === null || value === '')
        ? FireDB.remove(path)
        : FireDB.set(path, value);
      Promise.resolve(p).then(()=>_outboxRemove(key)).catch(e => console.warn('[DB] flush 실패:', key, e));
      _pendingKeys.delete(key);
    });
  }
  if (typeof document !== 'undefined') {
    // visibilitychange: 탭 전환/앱 백그라운드 전환을 모바일에서도 안정적으로 감지(권장 방식)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') _flushPendingWrites();
    });
    // pagehide: 실제 페이지 종료(탭 닫기/새로고침 포함) 시 마지막 안전망
    window.addEventListener('pagehide', _flushPendingWrites);
  }

  // ★ 로컬 대기열(outbox): "예약됨"과 동시에 즉시 localStorage에 기록 →
  //   visibilitychange/pagehide조차 못 뜨는 강제종료·크래시 상황에서도 다음 실행 때 재전송 가능
  const _outboxGet = () => { try{ return JSON.parse(localStorage.getItem(LS.outbox))||{}; }catch{ return {}; } };
  const _outboxSet = o => { try{ localStorage.setItem(LS.outbox, JSON.stringify(o)); }catch{} };
  const _outboxPut = (key,value) => { const o=_outboxGet(); o[key]=value; _outboxSet(o); };
  const _outboxRemove = key => { const o=_outboxGet(); delete o[key]; _outboxSet(o); };

  // ★★★ 반(classes) 동기화 충돌 감지 ★★★
  //  각 반 객체에 _rev(정수) 필드를 두고, 쓰기 직전 서버의 현재 _rev와
  //  "내가 마지막으로 확인한 서버 _rev(baseline)"를 비교한다.
  //  - 같으면: 그 사이 아무도 안 건드림 → 안전하게 덮어쓰기, rev+1
  //  - 다르면: 다른 기기가 그 사이 먼저 저장함 → 즉시 덮어쓰지 않고
  //            _conflictCb 로 알려서 사용자가 "내 값 유지 / 서버 값 사용"을 고르게 함
  const _classBaseRev = {};          // classId -> 마지막으로 확인한 서버 _rev
  const _pendingConflicts = {};      // classId -> resolve(choice) 콜백
  let _conflictCb = null;            // UI(app.js)가 등록하는 충돌 알림 핸들러
  const _monthPending = new Set();   // ★ 신규: "classId__mk" — 새 달 교재목록이 서버에서 확정되기 전까지 잠금
  function isMonthPending(classId, mk) { return _monthPending.has(`${classId}__${mk}`); }
  function onConflict(cb) { _conflictCb = cb; }
  function resolveConflict(classId, choice) {
    const fn = _pendingConflicts[classId];
    if (fn) fn(choice);
  }
  function _trackRev(cls) { if (cls && cls.id) _classBaseRev[cls.id] = cls._rev || 0; }

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
    await _drainOutbox(); // ★ 이전 세션에서 강제종료 등으로 못 보낸 진도/메모가 있으면 지금 재전송 + 화면에 즉시 복구
    await _seed();
  }

  // ★ 앱 시작 시, 이전 세션에서 서버 확인을 못 받고 남아있던 대기열을 재전송한다.
  //   _loadFB()가 방금 서버 스냅샷으로 C.progress를 덮어썼더라도, 여기서 다시 얹어주므로
  //   "입력했는데 다음 로그인 때 사라져 있는" 현상이 원천 차단된다.
  async function _drainOutbox() {
    const o = _outboxGet();
    const keys = Object.keys(o);
    if (!keys.length) return;
    console.log(`[DB] 🔁 미전송 대기열 ${keys.length}건 복구·재전송`);
    for (const key of keys) {
      const value = o[key];
      if (value === undefined || value === null || value === '') delete C.progress[key];
      else C.progress[key] = value; // ★ 서버 확인 전이라도 화면엔 즉시 반영(유실처럼 보이지 않도록)
      const path = `${FireDB.P.progress}/${key}`;
      try {
        if (value === undefined || value === null || value === '') await FireDB.remove(path);
        else await FireDB.set(path, value);
        _outboxRemove(key);
      } catch(e) {
        console.warn('[DB] outbox 재전송 실패(다음 세션에 재시도):', key, e);
      }
    }
    ls(LS.progress, C.progress);
    _fire('progress');
  }

  let _fbLoadedOk = false; // ★ Firebase 데이터 정상 로드 여부 추적

  async function _loadFB() {
    // ★ LS에 이미 계정이 있으면 먼저 LS 로드 (빠른 시작)
    const lsAccs = lg(LS.accounts) || [];
    if (lsAccs.length > 0) _loadLS();
    try {
      const snap = await Promise.race([
        FireDB.get(FireDB.P.root),
        new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),15000)), // ★ 5초→15초 (초기 재연결 대기)
      ]);
      if (snap) {
        C.classes  = snap.classes  ? Object.values(snap.classes)  : [];
        C.progress = snap.progress || {};
        C.accounts = snap.accounts ? Object.values(snap.accounts) : [];
        C.theme    = snap.theme    || null;
        C.classes.forEach(_trackRev); // ★ 서버 rev baseline 기록 (충돌감지용)
        ls(LS.classes,C.classes); ls(LS.progress,C.progress);
        ls(LS.accounts,C.accounts); ls(LS.theme,C.theme);
        // ★ Firebase에서 계정 정상 로드 시 초기화 플래그 설정
        if (C.accounts.length > 0) ls(LS.inited, true);
        _fbLoadedOk = true;
      } else _loadLS();
    } catch(e) {
      console.warn('FB→LS', e.message);
      _loadLS();
      // ★ 타임아웃 폴백 후 Firebase 재연결 시 자동 재로드
      _scheduleRetryLoad();
    }
  }

  // ★ Firebase 연결 후 데이터 재로드 (타임아웃 폴백 복구용)
  function _scheduleRetryLoad() {
    if (_fbLoadedOk) return;
    const check = setInterval(async () => {
      if (!FireDB.isConnected()) return;
      clearInterval(check);
      if (_fbLoadedOk) return;
      console.log('[DB] 🔄 Firebase 재연결 감지 — 데이터 재로드');
      try {
        const snap = await FireDB.get(FireDB.P.root);
        if (snap) {
          C.classes  = snap.classes  ? Object.values(snap.classes)  : [];
          C.classes.forEach(_trackRev); // ★ 서버 rev baseline 기록 (충돌감지용)
          // ★ 재로드 시에도 pending 키 보호
          const retryIncoming = snap.progress || {};
          _pendingKeys.forEach(k => {
            if (C.progress[k] !== undefined) retryIncoming[k] = C.progress[k];
            else delete retryIncoming[k];
          });
          C.progress = retryIncoming;
          C.accounts = snap.accounts ? Object.values(snap.accounts) : [];
          C.theme    = snap.theme    || null;
          ls(LS.classes,C.classes); ls(LS.progress,C.progress);
          ls(LS.accounts,C.accounts); ls(LS.theme,C.theme);
          if (C.accounts.length > 0) ls(LS.inited, true);
          _fbLoadedOk = true;
          _fire('classes'); _fire('progress'); _fire('theme');
          console.log('[DB] ✅ 재로드 완료');
        }
      } catch(e) { console.warn('[DB] 재로드 실패', e.message); }
    }, 1000);
    // 30초 후 인터벌 자동 정리
    setTimeout(() => clearInterval(check), 30000);
  }

  function _listenFB() {
    FireDB.listen(FireDB.P.classes, v => {
      const nd = v ? Object.values(v) : [];
      nd.forEach(_trackRev); // ★ 서버가 보낸 원본 rev를 baseline으로 기록 (merge 이전 원본 기준)
      const merged = _mergeClasses(nd, C.classes);
      if (JSON.stringify(merged) !== JSON.stringify(C.classes)) {
        C.classes = merged; ls(LS.classes, C.classes); _fire('classes');
      }
    });
    FireDB.listen(FireDB.P.progress, v => {
      // ★ 핵심 수정: pending 키(debounce 대기 중)는 로컬 값 보호
      //   Firebase가 보낸 서버 스냅샷이 아직 쓰지 않은 입력값을 덮어쓰는 버그 방지
      const incoming = v || {};
      _pendingKeys.forEach(k => {
        // 로컬에 값이 있으면 서버 값 대신 로컬 값 유지
        if (C.progress[k] !== undefined) incoming[k] = C.progress[k];
        else delete incoming[k];
      });
      C.progress = incoming;
      ls(LS.progress, C.progress);
      _fire('progress');
    });
    FireDB.listen(FireDB.P.accounts, async v => {
      const nd=v?Object.values(v):[];
      if (JSON.stringify(nd)!==JSON.stringify(C.accounts)) {
        // ★ 핵심 보안: Firebase에서 빈 accounts가 오면 LS를 절대 덮어쓰지 않음
        //   오프라인·캐시 만료·Firebase 초기화 등으로 v=null이 올 수 있음
        //   → LS를 빈 배열로 덮어쓰면 다음 로드 시 admin/1234 재생성 트리거됨
        if (nd.length > 0) {
          C.accounts = nd;
          ls(LS.accounts, C.accounts);
          ls(LS.inited, true); // 실제 계정 데이터 수신 → 플래그 갱신
        } else {
          // Firebase가 빈값 → C.accounts만 동기화, LS는 기존 값 유지
          C.accounts = nd;
        }
        // ★ 지금 이 기기에 로그인해 있는 계정의 권한(역할·담당 반·메뉴 접근 권한 등)을
        //   admin이 다른 곳에서 바꿨다면, 재로그인 없이 이 세션에도 즉시 반영한다.
        //   (기존엔 로그인 시점의 스냅샷이 localStorage 세션에 고정돼 있어 admin이
        //   바꿔도 다음 로그인 전까지 반영이 안 됐음 — 여기서 실시간으로 맞춰준다.)
        const sess = getSession();
        if (sess) {
          if (nd.length > 0) {
            const fresh = C.accounts.find(a => a.id === sess.id);
            if (fresh) {
              if (JSON.stringify(fresh) !== JSON.stringify(sess)) { setSession(fresh); _fire('session'); }
            } else {
              // 계정이 삭제됨 → 세션 즉시 종료
              clearSession(); _fire('session');
            }
          }
        }
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

  // ★ admin 계정 보장 — 완전 최초 설치(플래그 없음 + 계정 없음) 시에만 기본 계정 생성
  async function _ensureAdmin() {
    // ★ 1차 가드: 초기화 플래그 — 한번이라도 계정이 존재했으면 절대 admin/1234 생성 안 함
    if (lg(LS.inited)) {
      if (C.accounts.length === 0) {
        const lsAccs = lg(LS.accounts) || [];
        if (lsAccs.length > 0) C.accounts = lsAccs;
      }
      return;
    }
    // ★ 2차 가드: LS 계정 존재 여부
    const lsAccs = lg(LS.accounts) || [];
    if (lsAccs.length > 0) {
      ls(LS.inited, true); // 기존 계정 있음 → 플래그 세팅
      if (C.accounts.length === 0) C.accounts = lsAccs;
      return;
    }
    // ★ 3차: C.accounts에 admin이 있으면 플래그만 세팅
    if (C.accounts.some(a => a.role === 'admin')) {
      ls(LS.inited, true);
      return;
    }
    // 완전 최초 설치: 기본 계정 생성 후 플래그 영구 저장
    const existing = C.accounts.find(a => a.username === 'admin');
    if (existing) {
      existing.role = 'admin';
      ls(LS.accounts, C.accounts);
      await FireDB.set(`${FireDB.P.accounts}/${existing.id}`, existing);
    } else {
      await _addAcc('admin', '1234', 'admin');
    }
    ls(LS.inited, true); // ★ 초기화 완료 플래그 영구 저장
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
  const isAdmin      = () => ['admin','manager'].includes(lg(LS.session)?.role||'');
  const isManager    = () => isAdmin();  // admin + manager
  const isOperator   = () => ['admin','manager','operator'].includes(lg(LS.session)?.role||'');
  const isTeacher    = () => lg(LS.session)?.role === 'teacher';
  const getRole           = () => lg(LS.session)?.role || '';
  const getTeacherClasses = () => lg(LS.session)?.teacherClasses || [];
  const canOperate   = () => !!lg(LS.session);
  function login(username, pw) {
    const acc = C.accounts.find(a=>a.username===username && a.password===pw);
    if (acc) { setSession(acc); return acc; } return null;
  }

  // ★ 보안: _forceAdminLogin 비활성화 — admin/1234 강제 생성 차단
  //   (기존에 app.js doLogin 백도어에서 호출하던 함수, 지금은 아무것도 안 함)
  async function _forceAdminLogin() {
    console.warn('[DB] _forceAdminLogin 호출 차단됨 (보안 정책)');
  }

  /* ═══ ACCOUNTS ═══ */
  const getAccounts = () => C.accounts||[];

  // ★ Firebase 쓰기 헬퍼: SDK 미준비여도 스킵하지 않음 — set/update/remove가 오프라인 시 자체 큐잉
  function _fbWrite(op, ...args) {
    return op(...args);
  }

  async function _addAcc(username,pw,role) {
    const acc = {id:nid(),username,password:pw,role,createdAt:now()};
    C.accounts = [...C.accounts,acc]; ls(LS.accounts,C.accounts);
    ls(LS.inited, true); // ★ 계정 생성 시 플래그 갱신
    await _fbWrite(FireDB.set, `${FireDB.P.accounts}/${acc.id}`, acc);
    return acc;
  }
  async function addAccount(username,pw,role='operator',teacherClasses=[],allowedMenus=[]) {
    if (C.accounts.find(a=>a.username===username)) return null;
    const acc = await _addAcc(username,pw,role);
    if(acc && (teacherClasses.length || allowedMenus.length)){
      if(teacherClasses.length) acc.teacherClasses = teacherClasses;
      if(allowedMenus.length)   acc.allowedMenus   = allowedMenus;
      ls(LS.accounts, C.accounts);
      await _fbWrite(FireDB.set, `${FireDB.P.accounts}/${acc.id}`, acc);
    }
    return acc;
  }
  async function updateAccount(id,data) {
    const idx=C.accounts.findIndex(a=>a.id===id); if(idx===-1)return null;
    C.accounts[idx]={...C.accounts[idx],...data}; ls(LS.accounts,C.accounts);
    ls(LS.inited, true); // ★ 계정 수정 시 플래그 갱신
    await _fbWrite(FireDB.set, `${FireDB.P.accounts}/${id}`, C.accounts[idx]);
    return C.accounts[idx];
  }
  async function deleteAccount(id) {
    C.accounts=C.accounts.filter(a=>a.id!==id); ls(LS.accounts,C.accounts);
    await _fbWrite(FireDB.remove, `${FireDB.P.accounts}/${id}`);
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
    await FireDB.set(`${FireDB.P.classes}/${cls.id}`,cls);
    return cls;
  }

  async function addClassNew(data) {
    // 무조건 새 반 생성 (중복 이름 허용, 기존 반 종료 안 함)
    const mk = data.termStart || monthKey(new Date());
    const cls = {id:nid(),monthBooks:{},createdAt:now(),termStart:mk,termEnd:null,...data};
    C.classes = [...C.classes,cls]; ls(LS.classes,C.classes);
    await FireDB.set(`${FireDB.P.classes}/${cls.id}`,cls);
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
    await FireDB.update(`${FireDB.P.classes}/${id}`,data);
    return C.classes[idx];
  }

  async function deleteClass(id) {
    C.classes=C.classes.filter(c=>c.id!==id); ls(LS.classes,C.classes);
    await FireDB.remove(`${FireDB.P.classes}/${id}`);
    const keys=Object.keys(C.progress).filter(k=>k.startsWith(id+'__'));
    keys.forEach(k=>delete C.progress[k]); ls(LS.progress,C.progress);
    if (keys.length) {
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
      // ★ firstRegisteredAt은 이월돼도 절대 덮어쓰지 않음(진짜 최초 등록일 보존).
      //   이 필드가 아직 없는 옛 교재(과거에 만들어진 데이터)는 지금 이 순간을
      //   "확인 가능한 가장 이른 시점"으로 1회에 한해 채워 넣어 자연스럽게 마이그레이션한다.
      newBooks = {
        pool: base.pool.map(b=>({...b,id:nid(),createdAt:now(),firstRegisteredAt:b.firstRegisteredAt||b.createdAt||now()})),
        main: base.main.map(b=>({...b,id:nid(),createdAt:now(),firstRegisteredAt:b.firstRegisteredAt||b.createdAt||now()})),
        sub:  base.sub.map(b=>({...b,id:nid(),createdAt:now(),firstRegisteredAt:b.firstRegisteredAt||b.createdAt||now()})),
      };
      _monthPending.add(`${classId}__${mk}`); // ★ 신규: 서버가 확정해줄 때까지 이 달은 입력 잠금
    } else {
      newBooks = _emptyBooks();
    }
    cls.monthBooks[mk] = newBooks; // 낙관적 반영 — 화면엔 즉시 표시
    _createMonthSafely(classId, mk, newBooks); // ★ 서버엔 트랜잭션으로 "최초 1회만" 반영
    return JSON.parse(JSON.stringify(newBooks));
  }

  // ★★★ 신규 월 데이터 최초 생성 — Firebase 트랜잭션으로 동시 생성 경쟁(race) 원천 차단 ★★★
  //  버그 재현 조건: 폰/PC가 거의 동시에 새 달(예: 7월) 진도화면을 처음 열면
  //  각자 이전달 데이터를 복사해 "다른 랜덤 ID"로 새 데이터를 만들고, 나중에 쓰는 쪽이
  //  먼저 쓴 쪽을 통째로 덮어써서 교재가 사라지거나 뒤바뀌는 문제가 있었음(2026-07 T1반 사례).
  //  → monthBooks/{mk} 경로에 트랜잭션을 걸어 "이미 값이 있으면 포기(abort)"하게 하여
  //    실제로 서버에 반영되는 건 딱 하나뿐이고, 진 기기는 그 결과를 자동으로 되받아 화면을 맞춘다.
  async function _createMonthSafely(classId, mk, myBooks) {
    const pendKey = `${classId}__${mk}`;
    if (!FireDB.ready() || typeof FireDB.transaction !== 'function') {
      _monthPending.delete(pendKey);
      return; // 오프라인 → 로컬 유지, 재접속 시 리스너가 정리
    }
    const path = `${FireDB.P.classes}/${classId}/monthBooks/${mk}`;
    try {
      const result = await FireDB.transaction(path, current => {
        if (current !== null && current !== undefined) return; // 이미 누가 먼저 만들었음 → 포기
        return myBooks; // 최초 생성자만 반영됨
      });
      if (!result.committed && result.snapshot) {
        // 다른 기기가 먼저 만듦 → 내 로컬을 서버의 승자 데이터로 교체
        const cls = getClassById(classId);
        if (cls) {
          cls.monthBooks[mk] = result.snapshot;
          ls(LS.classes, C.classes);
        }
      }
    } catch(e) {
      console.warn('[DB] _createMonthSafely 실패:', e.message);
    } finally {
      _monthPending.delete(pendKey); // ★ 신규: 성공/실패/오프라인 어떤 경우든 반드시 잠금 해제
      _fire('classes');              // ★ 신규: 항상 화면 갱신 → 잠금 UI가 자동으로 풀림
    }
  }

  // ★★★ 반 데이터 저장 — rev 충돌 감지 포함 ★★★
  //  기존: 항상 FireDB.set()으로 반 객체 전체를 무조건 덮어씀 (다른 기기 편집을 소리없이 삭제할 위험)
  //  변경: 쓰기 직전 서버의 현재 _rev를 확인 → 내가 마지막으로 본 값(baseline)과 같으면 안전하게 저장.
  //        다르면(그 사이 다른 기기가 먼저 저장함) 즉시 쓰지 않고 사용자에게 선택을 묻는다.
  async function _syncClsQuiet(cls) {
    const idx = C.classes.findIndex(c=>c.id===cls.id);
    if (!FireDB.ready()) {
      // 오프라인/미준비: 서버 값을 읽을 수 없어 충돌검사는 불가하지만,
      // 저장 자체는 포기하지 않는다 — FireDB.set()이 큐에 적재해 재연결 시 자동 재전송함.
      // (기존: 여기서 그냥 return 해버려 오프라인 중 교재 등록/이동/삭제가 서버에 영원히 반영 안 됨)
      if (idx!==-1) C.classes[idx] = cls; else C.classes.push(cls);
      ls(LS.classes, C.classes);
      const path = `${FireDB.P.classes}/${cls.id}`;
      FireDB.set(path, cls).catch(e => console.error('syncCls(offline-queue)', e));
      return;
    }
    const path = `${FireDB.P.classes}/${cls.id}`;
    let server = null;
    try { server = await FireDB.get(path); } catch(e) {}
    const baseline  = _classBaseRev[cls.id] || 0;
    const serverRev = server?._rev || 0;

    if (!server || serverRev === baseline) {
      // ★ 충돌 없음 — 안전하게 저장
      cls._rev = serverRev + 1;
      cls._updatedAt = now();
      if (idx!==-1) C.classes[idx] = cls; else C.classes.push(cls);
      ls(LS.classes, C.classes);
      try { await FireDB.set(path, cls); _trackRev(cls); }
      catch(e) { console.error('syncCls', e); }
      return;
    }

    // ★ 충돌 발생 — 다른 기기가 그 사이 먼저 저장함. 무조건 덮어쓰지 않고 사용자에게 묻는다.
    return new Promise(resolve => {
      _pendingConflicts[cls.id] = async (choice) => {
        delete _pendingConflicts[cls.id];
        if (choice === 'server') {
          // 서버 값을 최종으로 채택 — 내 로컬 편집은 버림
          if (idx!==-1) C.classes[idx] = server; else C.classes.push(server);
          ls(LS.classes, C.classes);
          _trackRev(server);
          _fire('classes');
        } else {
          // 내 값을 최종으로 채택 — 서버를 내 값으로 덮어씀
          cls._rev = serverRev + 1;
          cls._updatedAt = now();
          if (idx!==-1) C.classes[idx] = cls; else C.classes.push(cls);
          ls(LS.classes, C.classes);
          try { await FireDB.set(path, cls); _trackRev(cls); }
          catch(e) { console.error('syncCls(conflict-mine)', e); }
          _fire('classes');
        }
        resolve();
      };
      if (_conflictCb) {
        try { _conflictCb({ classId: cls.id, mine: cls, server }); }
        catch(e) { console.error('conflictCb', e); }
      } else {
        // UI가 핸들러를 등록 안 했으면(구버전 등) 안전한 기본값: 서버값 우선 채택
        console.warn('[DB] 충돌 핸들러 미등록 — 서버 값 우선 적용');
        _pendingConflicts[cls.id]('server');
      }
    });
  }

  async function _syncCls(cls) { await _syncClsQuiet(cls); _fire('classes'); }

  async function addToPool(classId, mk, name) {
    const cls = getClassById(classId); if(!cls)return null;
    if (!cls.monthBooks) cls.monthBooks = {};
    if (!cls.monthBooks[mk]) { getMonthBooks(classId, mk); }
    _migrateBooks(cls.monthBooks[mk]);
    const b = {id:nid(), name, createdAt:now(), firstRegisteredAt:now()}; // ★ firstRegisteredAt: 이월돼도 절대 안 바뀌는 "진짜 최초 등록일"
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
            firstRegisteredAt: now(), // ★ 이 반 입장에선 지금이 최초 등록 시점
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
      { const u={}; keys.forEach(k=>u[k]=null); await FireDB.update(FireDB.P.progress,u); }
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
        { const u={}; keys.forEach(k=>u[k]=null); await FireDB.update(FireDB.P.progress,u); }
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

  // ★ progress 개별 키 debounce 쓰기 — 완료 시 _pendingKeys에서 제거
  //   Firebase 리스너보다 늦게 도착한 서버 데이터가 로컬 입력을 덮어쓰는 버그 방지
  //   ★ Promise를 반환해 호출부(UI)가 "진짜 서버 확인" vs "로컬 대기중"을
  //     구분해서 보여줄 수 있게 한다 (true=서버 확인됨, false=오프라인 큐 대기중)
  function _writeProgress(key, value) {
    _pendingKeys.add(key);
    _outboxPut(key, value); // ★ 예약과 동시에 즉시 기록(디바운스 타이머가 못 돌아도 다음 세션에서 복구 가능)
    clearTimeout(_progressDebounce[key]);
    return new Promise((resolve) => {
      _progressDebounce[key] = setTimeout(async () => {
        delete _progressDebounce[key];
        // 연결 여부와 무관하게 항상 저장 시도 — 오프라인이면 FireDB.set/remove가 자체 큐잉
        const path = `${FireDB.P.progress}/${key}`;
        let confirmed = false;
        try {
          if (!value && value !== 0) confirmed = await FireDB.remove(path);
          else                        confirmed = await FireDB.set(path, value);
          // FireDB.set/remove: true=서버에 실제 반영됨, false=오프라인이라 큐에 적재만 됨
          if (confirmed !== false) _outboxRemove(key); // ★ 서버 반영 확인된 경우만 대기열에서 제거
        } catch(e) {
          console.warn('[DB] progress 쓰기 실패:', key, e);
          confirmed = false;
        }
        _pendingKeys.delete(key);
        resolve(confirmed === true);
      }, 800);
    });
  }

  function getPendingCount() { return _pendingKeys.size; }

  function autoSave(classId, weekKey, dayName, field, value, bookId=null) {
    let key;
    if (field==='memo') {
      key = `${classId}__${weekKey}__${dayName}__MEMO`;
    } else {
      const dateKey = `${classId}__${weekKey}__${dayName}__${bookId}__savedAt`;
      const dv = value ? now() : null;
      if (!dv) delete C.progress[dateKey]; else C.progress[dateKey] = dv;
      // ★ savedAt은 debounce 없이 즉시 저장 (날짜 표시 정확도)
      if (dv) FireDB.set(`${FireDB.P.progress}/${dateKey}`, dv);
      else FireDB.remove(`${FireDB.P.progress}/${dateKey}`);
      key = `${classId}__${weekKey}__${dayName}__${bookId}__progress`;
    }
    if (!value) delete C.progress[key]; else C.progress[key] = value;
    ls(LS.progress, C.progress);
    // ★ 전용 debounce — 완료 후 _pendingKeys 자동 해제. 호출부에서 await 가능하도록 반환.
    return _writeProgress(key, value||null);
  }

  /* ═══ THEME ═══ */
  const getTheme = () => C.theme || {
    palette:'light1', fontFamily:'Noto Sans KR', fontSize:14,
    mainFontSize:14, subFontSize:13,
    viewMode:'grid', operateView:'grid', inputBoxWidth:140,
    progressViewMode:'timeline', // ★ 신규: 진도 탭 표시 방식 ('timeline' | 'weekly'), 기본값 타임라인
  };
  async function saveTheme(t) {
    C.theme=t; ls(LS.theme,t);
    await FireDB.set(FireDB.P.theme,t);
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
        await FireDB.set(`${FireDB.P.classes}/${nc.id}`,nc);
      }
      ls(LS.classes,C.classes);
    }
    if(data.progress && typeof data.progress==='object'){
      // 기존 진도 덮어쓰기 (복원)
      C.progress = {...C.progress, ...data.progress};
      ls(LS.progress,C.progress);
      await FireDB.update(FireDB.P.progress,data.progress);
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
    flushPendingWrites: _flushPendingWrites, // ★ 신규: 대기 중인 진도/메모 저장을 즉시 강제 실행 (데이터 유실 방지)
    monthKey, prevMonthKey, nextMonthKey, toWeekKey,
    getSession, setSession, clearSession, isLoggedIn, isAdmin, canOperate, login, _forceAdminLogin,
    getAccounts, addAccount, updateAccount, deleteAccount,
  isManager, isOperator, isTeacher, getRole, getTeacherClasses,
    getClasses, getActiveClasses, getClassesForMonth, getClassById, classExists,
    addClass, addClassNew, terminateClass, updateClass, deleteClass,
    getMonthBooks, addToPool, moveBook, copyBooksToClass, renameBook, deleteBook, clearZone,
    getWeekProgress, autoSave,
    getTheme, saveTheme, exportAll, importAll,
    onConflict, resolveConflict,
    getPendingCount, isMonthPending,
  };
})();
