/**
 * dev-diagnostics.js — 개발자 모드: 코드 신뢰성 · 네트워크/외부연동 점검 · 버그 추적 로그
 * ─────────────────────────────────────────────────────────────
 * 목적
 *  ① 코드 신뢰성  — 핵심 모듈이 정상적으로 로드됐는지, 브라우저 저장소·
 *     서비스워커 등 필수 런타임 기능이 살아있는지 자가진단한다.
 *  ② 네트워크/외부 연동 신뢰성 — Firebase, Backblaze B2, Unsplash,
 *     Open-Meteo, Gemini AI, 자체 Geo-IP 프록시 등 이 앱이 의존하는
 *     외부 서비스에 실제로 도달 가능한지 점검한다.
 *     ※ 비용·부작용이 있는 호출(Gemini 생성, FCM 실제 발송, Unsplash
 *       검색 API 등)은 절대 실행하지 않고 "연결 가능 여부"만 확인한다.
 *  ③ 버그 추적 — window.onerror / unhandledrejection / 느리거나 실패한
 *     fetch 요청을 localStorage 링버퍼에 기록해서, 나중에 문제가
 *     생겼을 때 "언제·어느 화면·무슨 에러"였는지 바로 추적할 수 있게 한다.
 *
 * 설계 원칙(중요)
 *  - 순수 관찰자(observer)로만 동작한다. window.fetch를 감싸긴 하지만
 *    원래 호출·응답·에러를 그대로 통과시킬 뿐, 동작을 절대 바꾸지 않는다.
 *  - 어떤 데이터도 서버로 전송하지 않는다 — 모든 로그는 이 브라우저의
 *    localStorage에만 저장되고, 필요하면 관리자가 직접 파일로 내보낸다.
 *  - URL을 로그로 남길 때 쿼리스트링을 제거해 API 키가 남지 않게 한다.
 *  - 실제 admin 계정에게만 진입 버튼이 보인다(게스트 데모 계정 제외).
 *  - 이 모듈이 통째로 실패해도(예: 오래된 브라우저) 기존 앱 동작에는
 *    영향이 없도록 모든 진입점을 try/catch로 감싼다.
 * ─────────────────────────────────────────────────────────────
 * index.html <head> 맨 위에 아래 인라인 스크립트가 함께 있어야
 * "페이지 로드 초반"에 발생하는 에러까지 놓치지 않고 잡을 수 있다:
 *
 *   window.__hk10bEarlyLog = [];
 *   window.addEventListener('error', e => window.__hk10bEarlyLog.push({...}));
 *   window.addEventListener('unhandledrejection', e => window.__hk10bEarlyLog.push({...}));
 *
 * 이 파일은 그 배열을 흡수해서 영구 로그로 옮겨 담는다.
 * ─────────────────────────────────────────────────────────────
 */
const DevDiag = (() => {
  const LOG_KEY   = 'hk10b_devlog';
  const LOG_MAX   = 300;                 // ★ 링버퍼 상한 — localStorage 용량 보호
  const SLOW_MS   = 4000;                // ★ 이보다 느린 fetch는 "느림"으로 기록
  // ★ archive-db.js의 WORKER_BASE와 동일한 값(비공개 상수라 여기서 한 번 더
  //   선언함) — Backblaze B2 프록시 주소가 바뀌면 이 값도 같이 갱신 필요.
  const B2_WORKER_BASE = 'https://delicate-dream-791b.kuha0879.workers.dev';

  let _panelOpen = false;

  /* ══════════════════════════════════════════════
   * 로그 저장소 (localStorage 링버퍼)
   * ══════════════════════════════════════════════ */
  function _loadLog() {
    try { const v = JSON.parse(localStorage.getItem(LOG_KEY)); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function _saveLog(arr) { try { localStorage.setItem(LOG_KEY, JSON.stringify(arr)); } catch (e) {} }
  function _pushLog(entry) {
    try {
      const arr = _loadLog();
      arr.push(entry);
      while (arr.length > LOG_MAX) arr.shift();
      _saveLog(arr);
      if (_panelOpen) _renderLogTab();
    } catch (e) { /* 로그 저장 실패는 조용히 무시 — 앱 동작에 영향 주지 않음 */ }
  }
  function _clearLog() { try { localStorage.removeItem(LOG_KEY); } catch (e) {} }
  function _currentPage() {
    try {
      const on = document.querySelector('[id^="page-"].on');
      return on ? on.id.replace('page-', '') : '';
    } catch (e) { return ''; }
  }

  /* ══════════════════════════════════════════════
   * 초기 로드 구간(early)에서 잡힌 에러 흡수
   * ══════════════════════════════════════════════ */
  function _drainEarlyLog() {
    try {
      const early = window.__hk10bEarlyLog || [];
      early.forEach(e => _pushLog({
        ts: new Date(e.t || Date.now()).toISOString(), type: e.type || 'error',
        msg: String(e.msg || '').slice(0, 500), src: e.src || '', line: e.line || 0,
        stack: (e.stack || '').slice(0, 2000), page: 'boot',
      }));
      window.__hk10bEarlyLog = [];
    } catch (e) {}
  }

  /* ══════════════════════════════════════════════
   * 실시간 캡처 — window.onerror / unhandledrejection
   * ══════════════════════════════════════════════ */
  function _installLiveCapture() {
    if (window.__hk10bLiveCaptureOn) return;
    window.__hk10bLiveCaptureOn = true;
    window.addEventListener('error', e => {
      _pushLog({
        ts: new Date().toISOString(), type: 'error',
        msg: String(e.message || '').slice(0, 500), src: e.filename || '', line: e.lineno || 0,
        stack: (e.error && e.error.stack) ? String(e.error.stack).slice(0, 2000) : '',
        page: _currentPage(),
      });
    });
    window.addEventListener('unhandledrejection', e => {
      const r = e.reason;
      _pushLog({
        ts: new Date().toISOString(), type: 'promise',
        msg: String((r && r.message) || r || '').slice(0, 500),
        stack: (r && r.stack) ? String(r.stack).slice(0, 2000) : '',
        page: _currentPage(),
      });
    });
  }

  /* ══════════════════════════════════════════════
   * fetch 관찰(감시) — 실패하거나 느린 요청만 기록.
   * 원래 fetch의 호출·반환·예외를 그대로 전달하며 절대 가로막지 않는다.
   * ══════════════════════════════════════════════ */
  function _installFetchWatch() {
    try {
      if (typeof window.fetch !== 'function' || window.fetch.__hk10bWrapped) return;
      const orig = window.fetch.bind(window);
      const wrapped = function (...args) {
        const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        let url = '';
        try { url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || ''; } catch (e) {}
        const safeUrl = (url || '').split('?')[0]; // ★ 쿼리스트링(API 키 등) 제거 후 기록
        return orig(...args).then(res => {
          const dt = Math.round(((typeof performance !== 'undefined') ? performance.now() : Date.now()) - t0);
          // ★ 버그 수정: no-cors 요청의 응답은 브라우저가 항상 "불투명(opaque)"하게 감춰서
          //   실제로는 성공했어도 res.ok가 항상 false, res.status가 항상 0으로 나온다.
          //   이런 응답은 성공/실패를 판단할 수 없으므로 오류로 기록하지 않는다.
          if (res.type !== 'opaque' && (!res.ok || dt > SLOW_MS)) {
            _pushLog({ ts: new Date().toISOString(), type: 'network', msg: `${res.status} ${safeUrl}`, ms: dt, ok: res.ok, page: _currentPage() });
          }
          return res;
        }).catch(err => {
          const dt = Math.round(((typeof performance !== 'undefined') ? performance.now() : Date.now()) - t0);
          _pushLog({ ts: new Date().toISOString(), type: 'network', msg: `요청 실패 ${safeUrl} — ${String((err && err.message) || err)}`, ms: dt, ok: false, page: _currentPage() });
          throw err; // ★ 절대 삼키지 않고 원래대로 다시 던짐
        });
      };
      wrapped.__hk10bWrapped = true;
      window.fetch = wrapped;
    } catch (e) { /* 감시 설치 실패해도 원래 fetch는 그대로 살아있으므로 앱은 정상 동작 */ }
  }

  /* ══════════════════════════════════════════════
   * ① 코드 신뢰성 — 핵심 모듈·런타임 자가진단
   * ══════════════════════════════════════════════ */
  const MODULE_CHECKS = [
    { key: 'DB',            label: 'DB — 핵심 데이터 계층' },
    { key: 'App',           label: 'App — 화면 라우팅' },
    { key: 'FireDB',        label: 'FireDB — Firebase 연동' },
    { key: 'StudentDB',     label: 'StudentDB' },
    { key: 'BookLibDB',     label: 'BookLibDB' },
    { key: 'ScheduleApp',   label: 'ScheduleApp' },
    { key: 'ArchiveApp',    label: 'ArchiveApp' },
    { key: 'DashboardApp',  label: 'DashboardApp' },
    { key: 'StaffApp',      label: 'StaffApp' },
    { key: 'GradeApp',      label: 'GradeApp' },
    { key: 'GuestMode',     label: 'GuestMode' },
    { key: 'MonitorDB',     label: 'MonitorDB(모니터링)' },
    { key: 'GeminiAI',      label: 'GeminiAI(번역)' },
    { key: 'BgTheme',       label: 'BgTheme(배경 테마)' },
  ];
  function _runCodeCheck() {
    const modules = MODULE_CHECKS.map(m => ({ ...m, ok: typeof window[m.key] !== 'undefined' }));
    let storageOk = false;
    try { const k = '__hk10b_probe__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); storageOk = true; } catch (e) {}
    const runtime = [
      { label: 'localStorage 쓰기/읽기', ok: storageOk },
      { label: 'IndexedDB 사용 가능', ok: typeof indexedDB !== 'undefined' },
      { label: '네트워크 온라인 상태(navigator.onLine)', ok: navigator.onLine !== false },
      { label: 'Service Worker 지원', ok: 'serviceWorker' in navigator },
    ];
    return { modules, runtime };
  }
  async function _swStatus() {
    try {
      if (!('serviceWorker' in navigator)) return '미지원 브라우저';
      const regs = await navigator.serviceWorker.getRegistrations();
      if (!regs.length) return '등록된 서비스워커 없음';
      return regs.map(r => (r.active ? '활성' : r.installing ? '설치중' : '대기중')).join(', ') + ` (${regs.length}개)`;
    } catch (e) { return '확인 실패: ' + (e && e.message); }
  }

  /* ══════════════════════════════════════════════
   * ② 네트워크 / 외부 연동 신뢰성 점검
   * ══════════════════════════════════════════════ */
  async function _timedFetch(url, opts) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, opts);
      const noCors = opts && opts.mode === 'no-cors';
      return { ok: noCors ? true : res.ok, status: noCors ? '도달함(no-cors)' : res.status, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      return { ok: false, status: 0, ms: Math.round(performance.now() - t0), error: String((e && e.message) || e) };
    }
  }
  async function _runNetworkChecks(onEach) {
    const results = [];
    const push = r => { results.push(r); if (onEach) onEach(r, results.length); };

    // 🔥 Firebase — 이미 살아있는 연결상태·오프라인 큐를 그대로 읽음(추가 호출 없음)
    {
      const has = typeof FireDB !== 'undefined';
      const connected = has && FireDB.isConnected();
      const pending = has && FireDB.getPendingCount ? FireDB.getPendingCount() : 0;
      push({ key: 'firebase', label: '🔥 Firebase Realtime DB', ok: has ? connected : null,
        detail: !has ? '모듈 로드 안 됨' : connected ? `연결됨 · 대기중 쓰기 ${pending}건` : `연결 끊김 · 대기중 쓰기 ${pending}건(재연결 시 자동 전송)` });
    }
    // 🌤 Open-Meteo — 실제 조회, 무료·무제한 API라 비용 부담 없음
    { const r = await _timedFetch('https://api.open-meteo.com/v1/forecast?latitude=37.5&longitude=127&current=weather_code');
      push({ key: 'openmeteo', label: '🌤 Open-Meteo(날씨)', ok: r.ok, detail: r.error ? r.error : `${r.status} · ${r.ms}ms` }); }
    // 📍 자체 Geo-IP 프록시 — 우리 인프라라 자유롭게 확인 가능
    { const r = await _timedFetch('/api/geoip?ip=8.8.8.8');
      push({ key: 'geoip', label: '📍 자체 Geo-IP 프록시(/api/geoip)', ok: r.ok, detail: r.error ? r.error : `${r.status} · ${r.ms}ms` }); }
    // 🌐 ipify — 무료·무인증
    { const r = await _timedFetch('https://api.ipify.org?format=json');
      push({ key: 'ipify', label: '🌐 ipify(내 IP 조회)', ok: r.ok, detail: r.error ? r.error : `${r.status} · ${r.ms}ms` }); }
    // 🗄 Backblaze B2 Worker — no-cors 도달성만 확인(응답 코드는 못 읽음)
    { const r = await _timedFetch(B2_WORKER_BASE + '/', { mode: 'no-cors', cache: 'no-store' });
      push({ key: 'b2', label: '🗄 Backblaze B2 Worker 프록시', ok: r.ok, detail: r.error ? `도달 불가 · ${r.error}` : `도달 가능 · ${r.ms}ms(상태코드는 no-cors라 확인 불가)` }); }
    // 🖼 Unsplash CDN — 검색 API(과금·쿼터)는 호출하지 않고 CDN 도달성만 확인
    { const r = await _timedFetch('https://images.unsplash.com/', { mode: 'no-cors', cache: 'no-store' });
      push({ key: 'unsplash', label: '🖼 Unsplash CDN(검색 API는 호출 안 함)', ok: r.ok, detail: r.error ? `도달 불가 · ${r.error}` : `도달 가능 · ${r.ms}ms` }); }
    // 🤖 Gemini API 호스트 — generateContent(과금 발생)는 절대 호출하지 않음
    { const r = await _timedFetch('https://generativelanguage.googleapis.com/', { mode: 'no-cors', cache: 'no-store' });
      push({ key: 'gemini', label: '🤖 Gemini API 호스트(연결성만 · 과금 없음)', ok: r.ok, detail: r.error ? `도달 불가 · ${r.error}` : `도달 가능 · ${r.ms}ms` }); }
    // 🔔 FCM — 실제 발송은 사용자에게 알림이 가므로 자동 점검에서 제외
    push({ key: 'fcm', label: '🔔 FCM 푸시(/api/notify)', ok: null, detail: '실제 발송을 막기 위해 자동 점검 제외 — Vercel 함수 로그에서 별도 확인' });
    // 📄 manifest.json — PWA 매니페스트 자체 서빙 확인(같은 서버라 실제 상태 확인 가능)
    { const r = await _timedFetch('/manifest.json', { cache: 'no-store' });
      push({ key: 'manifest', label: '📄 manifest.json(PWA)', ok: r.ok, detail: r.error ? r.error : `${r.status} · ${r.ms}ms` }); }

    return results;
  }

  /* ══════════════════════════════════════════════
   * UI — 진입 버튼(FAB) + 패널
   * ══════════════════════════════════════════════ */
  function _css() {
    if (document.getElementById('dd-css')) return;
    const s = document.createElement('style');
    s.id = 'dd-css';
    s.textContent = `
#dd-fab{position:fixed;right:16px;bottom:16px;z-index:9500;width:44px;height:44px;border-radius:14px;
  background:var(--surf);border:1px solid var(--bdr2);box-shadow:0 6px 18px -6px rgba(0,0,0,.25);
  display:flex;align-items:center;justify-content:center;font-size:19px;cursor:pointer;color:var(--tx2)}
#dd-fab:active{transform:scale(.94)}
#dd-ov{position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center}
@media(min-width:720px){#dd-ov{align-items:center}}
#dd-sheet{width:100%;max-width:640px;max-height:86vh;background:var(--surf);border-radius:18px 18px 0 0;
  display:flex;flex-direction:column;overflow:hidden}
@media(min-width:720px){#dd-sheet{border-radius:18px;max-height:80vh}}
.dd-hdr{padding:14px 16px 10px;border-bottom:1px solid var(--bdr);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.dd-title{font-size:15px;font-weight:800;color:var(--tx)}
.dd-x{width:30px;height:30px;border-radius:9px;background:var(--card2);border:none;color:var(--tx2);font-size:15px;cursor:pointer}
.dd-tabs{display:flex;gap:6px;padding:10px 16px;border-bottom:1px solid var(--bdr);flex-shrink:0;overflow-x:auto}
.dd-tab{padding:7px 12px;border-radius:999px;border:1px solid var(--bdr);background:var(--card2);color:var(--tx2);
  font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
.dd-tab.on{background:var(--a);border-color:var(--a);color:#fff}
.dd-body{flex:1;overflow-y:auto;padding:14px 16px 22px}
.dd-row{display:flex;align-items:flex-start;gap:9px;padding:9px 10px;background:var(--card2);border:1px solid var(--bdr);
  border-radius:10px;margin-bottom:7px}
.dd-dot{width:9px;height:9px;border-radius:50%;margin-top:4px;flex-shrink:0}
.dd-dot.ok{background:#16a34a}.dd-dot.bad{background:#ef4444}.dd-dot.na{background:#9ca3af}
.dd-row-main{flex:1;min-width:0}
.dd-row-lbl{font-size:12.5px;font-weight:700;color:var(--tx)}
.dd-row-detail{font-size:11px;color:var(--tx3);margin-top:2px;word-break:break-all}
.dd-empty{text-align:center;color:var(--tx3);font-size:12px;padding:24px 8px}
.dd-actbar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.dd-btn{padding:8px 13px;border-radius:9px;background:var(--a);color:#fff;border:none;font-size:12px;font-weight:700;cursor:pointer}
.dd-btn.ghost{background:var(--card2);color:var(--tx2);border:1px solid var(--bdr2)}
.dd-log-item{padding:8px 10px;border-radius:8px;background:var(--card2);border:1px solid var(--bdr);margin-bottom:6px;font-size:11px}
.dd-log-top{display:flex;gap:6px;align-items:center;color:var(--tx3);margin-bottom:3px}
.dd-log-type{font-weight:800;border-radius:999px;padding:1px 7px;font-size:9.5px}
.dd-log-type.error{background:rgba(239,68,68,.12);color:#ef4444}
.dd-log-type.promise{background:rgba(249,115,22,.12);color:#f97316}
.dd-log-type.network{background:rgba(37,99,235,.12);color:#2563eb}
.dd-log-msg{color:var(--tx);word-break:break-all}
.dd-note{font-size:10.5px;color:var(--tx3);line-height:1.5;margin-bottom:10px}
    `;
    document.head.appendChild(s);
  }

  function _makeFab() {
    _css(); // ★ 버그 수정: 이전엔 패널을 열 때(_open)만 CSS가 주입돼서, 버튼 생성 시점엔
            // 스타일이 하나도 없어(=position:fixed 미적용) 전체화면 레이어(#app) 뒤에 깔려 안 보였음
    if (document.getElementById('dd-fab')) return;
    const b = document.createElement('button');
    b.id = 'dd-fab'; b.title = '개발자 모드 — 코드/네트워크 점검 · 오류 로그';
    b.textContent = '🛠';
    b.onclick = _open;
    document.body.appendChild(b);
  }
  function _removeFab() { document.getElementById('dd-fab')?.remove(); }

  let _tab = 'code';
  function _open() {
    _css();
    document.getElementById('dd-ov')?.remove();
    const ov = document.createElement('div'); ov.id = 'dd-ov';
    ov.onclick = e => { if (e.target === ov) _close(); };
    ov.innerHTML = `
<div id="dd-sheet">
  <div class="dd-hdr"><div class="dd-title">🛠 개발자 모드 — 신뢰성 점검 &amp; 오류 로그</div><button class="dd-x" id="dd-close">✕</button></div>
  <div class="dd-tabs">
    <button class="dd-tab" data-t="code">① 코드 점검</button>
    <button class="dd-tab" data-t="net">② 네트워크 점검</button>
    <button class="dd-tab" data-t="log">③ 오류 로그</button>
  </div>
  <div class="dd-body" id="dd-body"></div>
</div>`;
    document.body.appendChild(ov);
    document.getElementById('dd-close').onclick = _close;
    ov.querySelectorAll('.dd-tab').forEach(t => t.onclick = () => _setTab(t.dataset.t));
    _panelOpen = true;
    _setTab('code');
  }
  function _close() { document.getElementById('dd-ov')?.remove(); _panelOpen = false; }

  function _setTab(t) {
    _tab = t;
    document.querySelectorAll('.dd-tab').forEach(el => el.classList.toggle('on', el.dataset.t === t));
    if (t === 'code') _renderCodeTab();
    else if (t === 'net') _renderNetTab();
    else _renderLogTab();
  }

  async function _renderCodeTab() {
    const body = document.getElementById('dd-body'); if (!body) return;
    const { modules, runtime } = _runCodeCheck();
    const sw = await _swStatus();
    const rowsHtml = arr => arr.map(m => `
      <div class="dd-row"><span class="dd-dot ${m.ok ? 'ok' : 'bad'}"></span>
        <div class="dd-row-main"><div class="dd-row-lbl">${_esc(m.label)}</div></div></div>`).join('');
    body.innerHTML = `
      <div class="dd-note">앱이 의존하는 핵심 모듈과 브라우저 런타임 기능이 정상적으로 로드·동작 중인지 확인합니다.</div>
      <div class="dd-row-lbl" style="margin-bottom:6px">📦 핵심 모듈</div>
      ${rowsHtml(modules)}
      <div class="dd-row-lbl" style="margin:12px 0 6px">⚙️ 런타임 환경</div>
      ${rowsHtml(runtime)}
      <div class="dd-row"><span class="dd-dot na"></span>
        <div class="dd-row-main"><div class="dd-row-lbl">Service Worker 상태</div>
        <div class="dd-row-detail">${_esc(sw)}</div></div></div>
    `;
  }

  async function _renderNetTab() {
    const body = document.getElementById('dd-body'); if (!body) return;
    body.innerHTML = `
      <div class="dd-note">각 외부 서비스에 실제로 도달 가능한지 점검합니다. 비용이 발생하거나(Gemini 생성, Unsplash 검색) 사용자에게 영향을 주는(FCM 실제 발송) 호출은 하지 않습니다.</div>
      <div id="dd-ai-usage"></div>
      <div class="dd-actbar"><button class="dd-btn" id="dd-run-net">🔄 지금 점검 시작</button></div>
      <div id="dd-net-results"></div>
    `;
    _renderAiUsage();
    document.getElementById('dd-run-net').onclick = async () => {
      const resultsEl = document.getElementById('dd-net-results');
      resultsEl.innerHTML = `<div class="dd-empty">점검 중… 몇 초 정도 걸릴 수 있어요</div>`;
      const rendered = [];
      await _runNetworkChecks(r => {
        rendered.push(r);
        resultsEl.innerHTML = rendered.map(_netRowHtml).join('');
      });
    };
  }
  async function _renderAiUsage() {
    const el = document.getElementById('dd-ai-usage'); if (!el) return;
    if (typeof GeminiAI === 'undefined' || !GeminiAI.getUsageToday) return; // 구버전 gemini-ai.js면 조용히 생략
    try {
      const u = await GeminiAI.getUsageToday();
      const bar = (used, cap) => {
        const pct = cap ? Math.min(100, Math.round(used / cap * 100)) : 0;
        const color = pct >= 100 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#16a34a';
        return `<div style="height:6px;border-radius:999px;background:var(--card2);overflow:hidden;margin-top:4px">
          <div style="height:100%;width:${pct}%;background:${color}"></div></div>`;
      };
      const cooling = u.cooldownUntil && Date.now() < u.cooldownUntil;
      el.innerHTML = `
        <div class="dd-row-lbl" style="margin-bottom:6px">🤖 오늘의 AI 사용량 (자체 집계 · 태평양시 기준 ${_esc(u.day)})</div>
        <div class="dd-row" style="flex-direction:column;align-items:stretch">
          <div style="display:flex;justify-content:space-between"><span class="dd-row-lbl">🎬 영상 분석</span><span class="dd-row-detail">${u.video.used} / ${u.video.cap}회</span></div>
          ${bar(u.video.used, u.video.cap)}
        </div>
        <div class="dd-row" style="flex-direction:column;align-items:stretch">
          <div style="display:flex;justify-content:space-between"><span class="dd-row-lbl">✍️ 텍스트 생성(번역·코멘트 등)</span><span class="dd-row-detail">${u.text.used} / ${u.text.cap}회</span></div>
          ${bar(u.text.used, u.text.cap)}
        </div>
        ${cooling ? `<div class="dd-row"><span class="dd-dot bad"></span><div class="dd-row-main"><div class="dd-row-lbl">쿨다운 중</div><div class="dd-row-detail">${_esc(new Date(u.cooldownUntil).toLocaleTimeString('ko-KR'))}까지 재시도 보류</div></div></div>` : ''}
      `;
    } catch (e) { /* 표시 실패해도 나머지 패널엔 영향 없게 조용히 무시 */ }
  }
  function _netRowHtml(r) {
    const dot = r.ok === null ? 'na' : r.ok ? 'ok' : 'bad';
    return `<div class="dd-row"><span class="dd-dot ${dot}"></span>
      <div class="dd-row-main"><div class="dd-row-lbl">${_esc(r.label)}</div>
      <div class="dd-row-detail">${_esc(r.detail || '')}</div></div></div>`;
  }

  function _renderLogTab() {
    const body = document.getElementById('dd-body'); if (!body || _tab !== 'log') return;
    const log = _loadLog().slice().reverse(); // 최신 순
    body.innerHTML = `
      <div class="dd-note">에러·처리되지 않은 Promise 거부·느리거나 실패한 네트워크 요청을 이 기기의 브라우저에만 저장합니다(서버 전송 없음). 최근 ${LOG_MAX}건까지 보관됩니다.</div>
      <div class="dd-actbar">
        <button class="dd-btn ghost" id="dd-export-log">⬇️ 로그 내보내기</button>
        <button class="dd-btn ghost" id="dd-clear-log">🗑 로그 지우기</button>
      </div>
      ${log.length ? log.map(_logItemHtml).join('') : `<div class="dd-empty">🎉 기록된 오류가 없습니다</div>`}
    `;
    document.getElementById('dd-export-log').onclick = _exportLog;
    document.getElementById('dd-clear-log').onclick = () => {
      if (!confirm('저장된 오류 로그를 모두 지울까요?')) return;
      _clearLog(); _renderLogTab();
    };
  }
  function _logItemHtml(e) {
    const time = _fmtTime(e.ts);
    return `<div class="dd-log-item">
      <div class="dd-log-top"><span class="dd-log-type ${e.type}">${_esc(e.type || '')}</span>
        <span>${_esc(time)}</span>${e.page ? `<span>· ${_esc(e.page)}</span>` : ''}${e.ms != null ? `<span>· ${e.ms}ms</span>` : ''}</div>
      <div class="dd-log-msg">${_esc(e.msg || '')}</div>
    </div>`;
  }
  function _fmtTime(iso) {
    try { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`; }
    catch (e) { return iso || ''; }
  }
  function _exportLog() {
    try {
      const log = _loadLog();
      const payload = { exportedAt: new Date().toISOString(), page: location.href, userAgent: navigator.userAgent, count: log.length, entries: log };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.href = url; a.download = `happytree-devlog-${stamp}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { alert('로그 내보내기 실패: ' + (e && e.message)); }
  }

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ══════════════════════════════════════════════
   * 진입 버튼 표시/숨김 — 실제 admin 계정에만 노출(게스트 데모 제외)
   * ══════════════════════════════════════════════ */
  function _refreshVisibility() {
    try {
      if (typeof DB === 'undefined') { _removeFab(); return; }
      const sess = DB.getSession ? DB.getSession() : null;
      const show = !!sess && DB.isAdmin && DB.isAdmin() && !sess._isGuest;
      if (show) _makeFab(); else _removeFab();
    } catch (e) {}
  }

  /* ══════════════════════════════════════════════
   * init — 관찰(로그 캡처)은 항상 켜두고, 진입 버튼만 admin 조건부 표시
   * ══════════════════════════════════════════════ */
  function init() {
    try {
      _drainEarlyLog();
      _installLiveCapture();
      _installFetchWatch();
    } catch (e) {}
    const tryHook = () => {
      if (typeof DB !== 'undefined') {
        _refreshVisibility();
        try { DB.on && DB.on('session', _refreshVisibility); } catch (e) {}
        // ★ session 이벤트가 안 나가는 경로(App.doLogin/App.logout 등)를 대비해 주기적으로도 재확인
        setInterval(_refreshVisibility, 5000);
      } else setTimeout(tryHook, 200);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryHook);
    else tryHook();
  }

  return { init, _open, _close };
})();

DevDiag.init();
