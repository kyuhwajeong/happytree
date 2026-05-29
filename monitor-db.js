/**
 * monitor-db.js — v5.0
 *
 * ■ 신규 기능
 *   1. IP 지오코딩 — ip-api.com 으로 한국 도시·지역명 자동 조회
 *   2. IP 라벨 관리 — 특정 IP 대역에 장소명 지정
 *      (예: "211.234.12" → "해피트리영어학원")
 *      Firebase: hakwon10/monitor/ip_labels/{id}
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
      /* ip-api.com: 분당 45회 무료, 한국어(lang=ko) 지원 */
      const r = await Promise.race([
        fetch('http://ip-api.com/json/?lang=ko&fields=status,message,country,regionName,city,isp,query'),
        new Promise((_,rej) => setTimeout(() => rej(), 4000)),
      ]);
      const d = await r.json();
      if (d.status !== 'success') throw new Error(d.message || 'geo fail');
      return {
        ip:     d.query      || '알 수 없음',
        city:   d.city       || '',
        region: d.regionName || '',
        country:d.country    || '',
        isp:    d.isp        || '',
      };
    } catch {
      /* 지오코딩 실패 시 IP만 별도로 조회 */
      try {
        const r2 = await Promise.race([
          fetch('https://api.ipify.org?format=json'),
          new Promise((_,rej) => setTimeout(() => rej(), 3000)),
        ]);
        const d2 = await r2.json();
        return { ip: d2.ip || '알 수 없음', city:'', region:'', country:'', isp:'' };
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
    _startHB();
    _cleanupExpired();

    /* FCM 푸시 */
    if (typeof MonitorFCM !== 'undefined') {
      MonitorFCM.notifyNewSession(session).catch(() => {});
    }

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
  };
})();
