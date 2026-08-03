/**
 * monitor-db.js — v5.2
 *
 * ■ 신규 기능
 *   1. IP 지오코딩 — ip-api.com 으로 한국 도시·지역명 자동 조회
 *   2. IP 라벨 관리 — 특정 IP 대역에 장소명 지정
 *      (예: "211.234.12" → "해피트리영어학원")
 *      Firebase: hakwon10/monitor/ip_labels/{id}
 *   3. (v5.2) 원격 명령 — 관리자가 특정 세션에 원격으로 "캐시 전체 삭제 +
 *      새로고침"을 지시할 수 있음. 대상 브라우저 탭이 열려 Firebase에
 *      연결된 상태여야 즉시 반영됨 (FCM 푸시 기반 아님 — 하단 함수 주석 참고)
 */
const MonitorDB = (() => {

  /* ══ 히든 비밀번호 ════════════════════════════════════ */
  const MONITOR_SECRET = 'master';

  /* ══ 내부 상수 ══════════════════════════════════════ */
  const PATH         = 'hakwon10/monitor/sessions';
  const LABELS_PATH  = 'hakwon10/monitor/ip_labels';
  const TTL_MS       = 48 * 60 * 60 * 1000;
  const HB_MS        = 60 * 1000;
  const MAX_ACTIONS  = 200;
  const ONLINE_MS    = 5  * 60 * 1000;

  /* ══ 내부 상태 ══════════════════════════════════════ */
  let _sid     = null;
  let _hbTimer = null;
  let _actions = [];
  let _wTimer  = null;
  let _cmdUnlisten = null;
  let _lastCmdId   = null;

  /* ══════════════════════════════════════════════════════
   * 공개 유틸
   * ══════════════════════════════════════════════════════ */
  const isMonitorPassword = pw => pw === MONITOR_SECRET;
  const hasSession        = () => !!_sid;
  const isOnline          = s  =>
    s && !s.loggedOut &&
    (Date.now() - new Date(s.lastSeen).getTime() < ONLINE_MS);

  /* ══════════════════════════════════════════════════════
   * IP + 지오코딩 (ip-api.com — 무료, 한국어 지원)
   *
   * 반환 구조:
   *   { ip, city, region, country, isp, lat, lon }
   *   예) { ip:"211.x.x.x", city:"수원시", region:"경기도",
   *         country:"대한민국", isp:"KT" }
   * ══════════════════════════════════════════════════════ */
  async function _fetchGeo() {
    try {
      /* ★ Step 1: 브라우저에서 직접 본인 IP 조회 (HTTPS, ipify 무료)
       *   X-Forwarded-For 방식은 Vercel 프록시 레이어로 인해
       *   서버 IP(버지니아 등)가 반환되는 문제가 있어 이 방식으로 대체
       */
      const ipRes = await Promise.race([
        fetch('https://api.ipify.org?format=json'),
        new Promise((_,rej) => setTimeout(() => rej(), 3000)),
      ]);
      const { ip: myIp } = await ipRes.json();
      if (!myIp) throw new Error('IP 조회 실패');

      /* ★ Step 2: 실제 IP를 /api/geoip 에 전달 → 한국어 위치 반환
       *   서버사이드에서 ip-api.com 호출 (HTTP 혼합 콘텐츠 우회)
       */
      const geoRes = await Promise.race([
        fetch(`/api/geoip?ip=${encodeURIComponent(myIp)}`),
        new Promise((_,rej) => setTimeout(() => rej(), 5000)),
      ]);
      if (!geoRes.ok) throw new Error('geoip api error');
      const d = await geoRes.json();

      return {
        ip:     myIp,          // ipify 에서 가져온 실제 IP
        city:   d.city    || '',
        region: d.region  || '',
        country:d.country || '',
        isp:    d.isp     || '',
      };
    } catch(e) {
      console.warn('[MonitorDB] 지오코딩 실패:', e.message);
      /* 폴백: IP만 ipify로 조회, 위치 정보 없이 저장 */
      try {
        const r = await fetch('https://api.ipify.org?format=json');
        const { ip } = await r.json();
        return { ip: ip || '알 수 없음', city:'', region:'', country:'', isp:'' };
      } catch {
        return { ip:'알 수 없음', city:'', region:'', country:'', isp:'' };
      }
    }
  }

  /* 지오 정보를 보기 좋은 문자열로 */
  function geoStr(geo) {
    if (!geo) return '';
    const parts = [geo.region, geo.city].filter(Boolean);
    return parts.join(' ') || geo.country || '';
  }

  /* ══════════════════════════════════════════════════════
   * 기기 요약
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
   * 세션 시작
   * ══════════════════════════════════════════════════════ */
  async function startSession(username, role) {
    if (!FireDB.ready()) return null;
    if (_sid) await endSession();

    /* IP + 지오코딩 동시 획득 */
    const geo = await _fetchGeo();
    const sid = Date.now().toString(36) + Math.random().toString(36).slice(2,6);
    const now = new Date().toISOString();

    const session = {
      id: sid, username: username||'unknown', role: role||'unknown',
      ip:     geo.ip,
      city:   geo.city,
      region: geo.region,
      country:geo.country,
      isp:    geo.isp,
      ua: _ua(), loginAt: now, lastSeen: now,
      currentMenu: 'operate', currentDetail: '',
      expireAt: Date.now() + TTL_MS,
      loggedOut: null, actions: [],
    };

    await FireDB.set(`${PATH}/${sid}`, session);
    _sid     = sid;
    _actions = [];
    _lastCmdId = null;
    _startHB();
    _cleanupExpired();
    listenRemoteCommand();

    /* FCM 푸시 */
    if (typeof MonitorFCM !== 'undefined') {
      MonitorFCM.notifyNewSession(session).catch(() => {});
    }

    return sid;
  }

  /* ══════════════════════════════════════════════════════
   * 원격 명령 (v5.2 신규)
   *
   * 관리자가 모니터링 대시보드에서 특정 세션에 원격으로 명령을 보내고,
   * 그 세션의 브라우저(탭이 열려 실시간 연결된 상태)가 즉시 실행한다.
   *
   *   hakwon10/monitor/sessions/{sessionId}/remoteCmd
   *     { type:'clearAll', at, cmdId }
   *
   * ★ 제약: FCM 푸시가 아니라 Firebase 실시간 리스너 기반이라, 대상 탭이
   *   "지금 열려서 Firebase에 연결돼 있어야" 즉시 반영된다. 탭이 닫혀
   *   있으면 다음에 그 탭을 다시 열 때 반영된다(닫힌 브라우저를 강제로
   *   깨우는 방식은 아님 — FCM 토큰은 관리자 기기에만 등록돼 있어서
   *   일반 사용자 기기를 푸시로 깨울 수 없기 때문).
   * ══════════════════════════════════════════════════════ */
  async function sendRemoteCommand(sessionId, type) {
    if (!sessionId || !FireDB.ready()) return false;
    const cmd = {
      type,
      at: Date.now(),
      cmdId: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    };
    return await FireDB.set(`${PATH}/${sessionId}/remoteCmd`, cmd).catch(() => false);
  }

  function listenRemoteCommand() {
    if (!_sid || !FireDB.ready()) return;
    if (_cmdUnlisten) { _cmdUnlisten(); _cmdUnlisten = null; }
    _cmdUnlisten = FireDB.listen(`${PATH}/${_sid}/remoteCmd`, cmd => {
      if (!cmd || !cmd.cmdId || cmd.cmdId === _lastCmdId) return;
      _lastCmdId = cmd.cmdId;
      _handleRemoteCommand(cmd);
    });
  }

  function _handleRemoteCommand(cmd) {
    if (!cmd || !cmd.type) return;
    if (cmd.type === 'clearAll') {
      try {
        if (typeof App !== 'undefined' && App._toast)
          App._toast('🧹 관리자 요청으로 브라우저 저장소를 초기화합니다...', '', 2500);
      } catch (e) {}
      setTimeout(_execFullWipe, 1200);
    }
  }

  /* 이 브라우저(현재 origin)의 캐시·저장소를 전부 지우고 새로고침
   * - Service Worker 등록 해제
   * - Cache Storage 전체 삭제
   * - IndexedDB 전체 삭제 (Firebase SDK 로컬 캐시 등)
   * - 쿠키 삭제 (JS로 접근 가능한 범위)
   * - localStorage / sessionStorage 전체 삭제
   *   (로그인 세션·테마·탭순서 등 로컬 설정도 함께 사라짐 — "완전 초기화"가
   *    목적이므로 의도된 동작. 재로그인이 필요해짐)
   */
  async function _execFullWipe() {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister().catch(() => {})));
      }
    } catch (e) {}
    try {
      if (window.caches && caches.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
      }
    } catch (e) {}
    try {
      if (window.indexedDB && indexedDB.databases) {
        const dbs = await indexedDB.databases();
        await Promise.all((dbs || []).map(d => new Promise(res => {
          if (!d.name) return res();
          const req = indexedDB.deleteDatabase(d.name);
          req.onsuccess = req.onerror = req.onblocked = () => res();
        })));
      }
    } catch (e) {}
    try {
      document.cookie.split(';').forEach(c => {
        const name = c.split('=')[0].trim();
        if (name) document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      });
    } catch (e) {}
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}

    location.href = location.pathname + '?_rc=' + Date.now();
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
   * 액션 로깅
   * ══════════════════════════════════════════════════════ */
  function logAction(menu, detail, extra) {
    if (!_sid || !FireDB.ready()) return;
    FireDB.update(`${PATH}/${_sid}`, { lastSeen: new Date().toISOString() });
    _append({ type:'action', menu, detail: _san(detail), extra: extra||'' });
  }

  /* ══════════════════════════════════════════════════════
   * 세션 종료
   * ══════════════════════════════════════════════════════ */
  async function endSession() {
    if (!_sid || !FireDB.ready()) return;
    clearInterval(_hbTimer); _hbTimer = null;
    clearTimeout(_wTimer);
    if (_cmdUnlisten) { _cmdUnlisten(); _cmdUnlisten = null; }
    if (_actions.length) {
      await FireDB.set(`${PATH}/${_sid}/actions`, _actions);
    }
    await FireDB.update(`${PATH}/${_sid}`, {
      loggedOut: new Date().toISOString(), lastSeen: new Date().toISOString(),
    });
    _sid = null; _actions = [];
  }

  /* ══════════════════════════════════════════════════════
   * 실시간 리스닝
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
   * IP 라벨 관리
   *
   * 저장 구조 (Firebase):
   *   hakwon10/monitor/ip_labels/{id}
   *   { id, prefix:"211.234.12", label:"해피트리영어학원", color:"#10b981", createdAt }
   *
   * prefix 매칭:
   *   "211.234.12"  → 211.234.12.* 전체 일치
   *   "211.234"     → 211.234.*.* 전체 일치
   *   "211"         → 211.*.*.* 전체 일치
   * ══════════════════════════════════════════════════════ */

  /* 모든 라벨 조회 */
  async function getIpLabels() {
    const raw = await FireDB.get(LABELS_PATH);
    if (!raw) return [];
    return Object.values(raw).sort((a,b) =>
      new Date(a.createdAt) - new Date(b.createdAt)
    );
  }

  /* 라벨 저장 (신규/수정) */
  async function saveIpLabel(prefix, label, color) {
    if (!prefix || !label) return false;
    /* 기존에 같은 prefix가 있으면 덮어쓰기 */
    const existing = await getIpLabels();
    const dup = existing.find(l => l.prefix === prefix.trim());
    const id  = dup?.id || ('lbl_' + Date.now().toString(36));
    await FireDB.set(`${LABELS_PATH}/${id}`, {
      id,
      prefix:    prefix.trim(),
      label:     label.trim(),
      color:     color || '#38bdf8',
      createdAt: new Date().toISOString(),
    });
    return true;
  }

  /* 라벨 삭제 */
  async function deleteIpLabel(id) {
    if (!id) return;
    await FireDB.remove(`${LABELS_PATH}/${id}`);
  }

  /* IP에 매칭되는 라벨 찾기 (가장 긴 prefix 우선) */
  async function matchIpLabel(ip) {
    if (!ip || ip === '알 수 없음') return null;
    const labels = await getIpLabels();
    /* prefix 길이 내림차순 정렬 → 가장 구체적인 것 먼저 */
    const sorted = labels.sort((a,b) => b.prefix.length - a.prefix.length);
    return sorted.find(l => ip.startsWith(l.prefix)) || null;
  }

  /* 라벨 실시간 리스닝 (모니터링 UI 즉시 갱신용) */
  function listenIpLabels(cb) {
    return FireDB.listen(LABELS_PATH, raw => {
      if (!raw) { cb([]); return; }
      cb(Object.values(raw).sort((a,b) => new Date(a.createdAt)-new Date(b.createdAt)));
    });
  }

  /* ══════════════════════════════════════════════════════
   * 내부 헬퍼
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

  function _san(t) {
    return String(t||'').replace(/pass(?:word)?[\s=:]+\S+/gi,'****').slice(0,120);
  }

  /* ══ 삭제 함수들 ══ */
  async function deleteSession(sessionId) {
    if (!FireDB.ready() || !sessionId) return false;
    try { await FireDB.remove(`${PATH}/${sessionId}`); return true; }
    catch(e) { console.warn('[MonitorDB] deleteSession:', e); return false; }
  }

  async function clearFinishedSessions() {
    if (!FireDB.ready()) return 0;
    try {
      const raw = await FireDB.get(PATH);
      if (!raw) return 0;
      const now = Date.now();
      const toDelete = Object.entries(raw).filter(([,s]) =>
        s && (s.loggedOut || new Date(s.lastSeen).getTime() < now - ONLINE_MS)
      );
      await Promise.all(toDelete.map(([id]) => FireDB.remove(`${PATH}/${id}`)));
      return toDelete.length;
    } catch(e) { console.warn('[MonitorDB] clearFinished:', e); return 0; }
  }

  async function clearAllSessions() {
    if (!FireDB.ready()) return 0;
    try {
      const raw = await FireDB.get(PATH);
      if (!raw) return 0;
      const ids = Object.keys(raw);
      await Promise.all(ids.map(id => FireDB.remove(`${PATH}/${id}`)));
      return ids.length;
    } catch(e) { console.warn('[MonitorDB] clearAll:', e); return 0; }
  }

  /* ══ 공개 API ══ */
  return {
    isMonitorPassword, hasSession, isOnline, geoStr,
    startSession, endSession,
    updateMenu, logAction,
    listenSessions,
    deleteSession, clearFinishedSessions, clearAllSessions,
    cleanupExpired: _cleanupExpired,
    /* IP 라벨 */
    getIpLabels, saveIpLabel, deleteIpLabel, matchIpLabel, listenIpLabels,
    ONLINE_MS,
    /* 원격 명령 (v5.2 신규) */
    sendRemoteCommand,
  };
})();
