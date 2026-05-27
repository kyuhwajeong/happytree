/**
 * monitor-db.js — v2.0
 *
 * 해피트리 영어학원 히든 실시간 모니터링 — 데이터 레이어
 *
 * ■ 히든 비밀번호
 *   username : admin
 *   password : master   ← 이것만 변경해도 동작
 *
 * ■ Firebase 경로
 *   hakwon10/monitor/sessions/{sessionId}
 *   hakwon10/monitor/sessions/{sessionId}/actions/{idx}
 *
 * ■ 세션 구조
 *   {
 *     id, username, role, ip, ua(기기), loginAt, lastSeen,
 *     currentMenu, currentDetail, expireAt, loggedOut,
 *     actions: [ {t, type, menu, detail, extra} ... ] ← 최대 200건
 *   }
 *
 * ■ TTL : 48 시간 → expireAt 이전 세션 자동 소멸
 */
const MonitorDB = (() => {

  /* ══ 히든 비밀번호 ══════════════════════════════════════ */
  const MONITOR_SECRET = 'master';          // ← 변경 가능

  /* ══ 내부 상수 ══════════════════════════════════════════ */
  const PATH          = 'hakwon10/monitor/sessions';
  const TTL_MS        = 48 * 60 * 60 * 1000;   // 48h
  const HB_MS         = 60 * 1000;              // heartbeat 60s
  const MAX_ACTIONS   = 200;
  const ONLINE_MS     = 5  * 60 * 1000;         // 5분 이내 = 온라인

  /* ══ 내부 상태 ══════════════════════════════════════════ */
  let _sid     = null;   // 내 세션 ID
  let _hbTimer = null;
  let _actions = [];     // 로컬 버퍼
  let _wTimer  = null;   // debounce write timer

  /* ══════════════════════════════════════════════════════
   * 공개 유틸
   * ══════════════════════════════════════════════════════ */

  const isMonitorPassword = pw => pw === MONITOR_SECRET;
  const hasSession        = () => !!_sid;
  const isOnline          = s  =>
    s && !s.loggedOut &&
    (Date.now() - new Date(s.lastSeen).getTime() < ONLINE_MS);

  /* ══════════════════════════════════════════════════════
   * IP 조회 (실패 시 '알 수 없음')
   * ══════════════════════════════════════════════════════ */
  async function _ip() {
    try {
      const r = await Promise.race([
        fetch('https://api.ipify.org?format=json'),
        new Promise((_,rej)=>setTimeout(()=>rej(),3000)),
      ]);
      return (await r.json()).ip || '알 수 없음';
    } catch { return '알 수 없음'; }
  }

  /* ══════════════════════════════════════════════════════
   * 기기 요약 (userAgent → 짧은 문자열)
   * ══════════════════════════════════════════════════════ */
  function _ua() {
    const ua = navigator.userAgent || '';
    if (/iPhone/i.test(ua))  return 'iPhone';
    if (/iPad/i.test(ua))    return 'iPad';
    if (/Android/i.test(ua)) return 'Android';
    if (/Mac/i.test(ua))     return 'macOS';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Linux/i.test(ua))   return 'Linux';
    return '기타';
  }

  /* ══════════════════════════════════════════════════════
   * 세션 시작 (로그인 성공 시)
   * ══════════════════════════════════════════════════════ */
  async function startSession(username, role) {
    if (!FireDB.ready()) return null;
    if (_sid) await endSession();

    const ip  = await _ip();
    const sid = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    const now = new Date().toISOString();

    const session = {
      id: sid, username: username||'unknown', role: role||'unknown',
      ip, ua: _ua(), loginAt: now, lastSeen: now,
      currentMenu: 'operate', currentDetail: '',
      expireAt: Date.now() + TTL_MS,
      loggedOut: null, actions: [],
    };

    await FireDB.set(`${PATH}/${sid}`, session);
    _sid     = sid;
    _actions = [];
    _startHB();
    _cleanupExpired();   // 오래된 세션 정리
    return sid;
  }

  /* ══════════════════════════════════════════════════════
   * 메뉴 이동 추적
   * ══════════════════════════════════════════════════════ */
  async function updateMenu(menu, detail) {
    if (!_sid || !FireDB.ready()) return;
    const now = new Date().toISOString();
    FireDB.update(`${PATH}/${_sid}`, {
      currentMenu: menu, currentDetail: detail||'', lastSeen: now,
    });
    _append({ type:'nav', menu, detail: detail||'' });
  }

  /* ══════════════════════════════════════════════════════
   * 액션 로깅 (버튼·입력 등)
   * ══════════════════════════════════════════════════════ */
  function logAction(menu, detail, extra) {
    if (!_sid || !FireDB.ready()) return;
    FireDB.update(`${PATH}/${_sid}`, { lastSeen: new Date().toISOString() });
    _append({ type:'action', menu, detail: _san(detail), extra: extra||'' });
  }

  /* ══════════════════════════════════════════════════════
   * 세션 종료 (로그아웃)
   * ══════════════════════════════════════════════════════ */
  async function endSession() {
    if (!_sid || !FireDB.ready()) return;
    clearInterval(_hbTimer); _hbTimer = null;
    clearTimeout(_wTimer);
    if (_actions.length) {
      await FireDB.set(`${PATH}/${_sid}/actions`, _actions);
    }
    await FireDB.update(`${PATH}/${_sid}`, {
      loggedOut: new Date().toISOString(), lastSeen: new Date().toISOString(),
    });
    _sid = null; _actions = [];
  }

  /* ══════════════════════════════════════════════════════
   * 실시간 세션 리스닝 (모니터 대시보드용)
   * ══════════════════════════════════════════════════════ */
  function listenSessions(cb) {
    return FireDB.listen(PATH, raw => {
      if (!raw) { cb([]); return; }
      const now = Date.now();
      const list = Object.values(raw)
        .filter(s => s && s.expireAt > now)
        .sort((a,b) => {
          const ao = isOnline(a), bo = isOnline(b);
          if (ao !== bo) return bo - ao;
          return new Date(b.lastSeen) - new Date(a.lastSeen);
        });
      cb(list);
    });
  }

  /* ══════════════════════════════════════════════════════
   * 내부: 액션 추가 + debounced Firebase 쓰기
   * ══════════════════════════════════════════════════════ */
  function _append(entry) {
    _actions.push({ t: new Date().toISOString(), ...entry });
    if (_actions.length > MAX_ACTIONS) _actions = _actions.slice(-MAX_ACTIONS);
    clearTimeout(_wTimer);
    _wTimer = setTimeout(async () => {
      if (_sid && FireDB.ready()) {
        await FireDB.set(`${PATH}/${_sid}/actions`, _actions);
      }
    }, 1000);
  }

  /* ══════════════════════════════════════════════════════
   * 내부: heartbeat (60초마다 lastSeen 갱신)
   * ══════════════════════════════════════════════════════ */
  function _startHB() {
    clearInterval(_hbTimer);
    _hbTimer = setInterval(async () => {
      if (_sid && FireDB.ready()) {
        await FireDB.update(`${PATH}/${_sid}`, {
          lastSeen: new Date().toISOString(),
        });
      }
    }, HB_MS);
  }

  /* ══════════════════════════════════════════════════════
   * 내부: 만료 세션 정리
   * ══════════════════════════════════════════════════════ */
  async function _cleanupExpired() {
    if (!FireDB.ready()) return;
    try {
      const raw = await FireDB.get(PATH);
      if (!raw) return;
      const now = Date.now();
      await Promise.all(
        Object.entries(raw)
          .filter(([,s]) => s && s.expireAt < now)
          .map(([id]) => FireDB.remove(`${PATH}/${id}`))
      );
    } catch(e) { console.warn('[MonitorDB] cleanup:', e); }
  }

  /* 민감 정보 마스킹 */
  function _san(t) {
    return String(t||'').replace(/pass(?:word)?[\s=:]+\S+/gi,'****').slice(0,120);
  }

  /* ══ 공개 API ══ */
  return {
    isMonitorPassword, hasSession, isOnline,
    startSession, endSession,
    updateMenu, logAction,
    listenSessions,
    cleanupExpired: _cleanupExpired,
    ONLINE_MS,
  };
})();
