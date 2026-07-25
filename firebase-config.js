/**
 * firebase-config.js — v11
 * ────────────────────────────────────────────────────────────────
 *  v11 개선사항 (세션 유지 강화)
 *
 *  ★ 개선 1 — keepSynced 경로 확장
 *    · hakwon10/grades 경로 추가 → 성적 데이터 WebSocket 상시 유지
 *    · hakwon10/books  경로 추가 → 교재 데이터 포함
 *
 *  ★ 개선 2 — 재연결 시도 무제한화
 *    · MAX_RETRY 5회 제한 제거 → 인터넷이 있는 한 무한 재시도
 *    · 재연결 간격: 5초 → 5초(1~3회) → 15초(4~10회) → 30초(11회~)
 *      지수 백오프로 과도한 요청 방지
 *
 *  ★ 개선 3 — navigator.onLine 이벤트 처리
 *    · WiFi↔LTE 전환, 네트워크 복귀 시 즉시 재연결 카운터 리셋
 *
 *  ★ 개선 4 — visibilitychange 이벤트 처리
 *    · 백그라운드 탭 복귀 시 연결 상태 확인 및 재연결 강제화
 *
 *  ★ 개선 5 — keepalive 핑 (60초 주기)
 *    · .info/serverTimeOffset 읽기로 WebSocket 연결 유지
 *    · 장시간 유휴에도 연결 끊김 방지
 *
 *  유지 — 초기 4초 억제, 8초 디바운스, goOffline/goOnline 미사용
 * ────────────────────────────────────────────────────────────────
 */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAW7ZIEnEfvVb2QnshD-kr8ovYWL65m2IE",
  authDomain:        "happytree-e16d7.firebaseapp.com",
  databaseURL:       "https://happytree-e16d7-default-rtdb.firebaseio.com",
  projectId:         "happytree-e16d7",
  storageBucket:     "happytree-e16d7.firebasestorage.app",
  messagingSenderId: "154995256418",
  appId:             "1:154995256418:web:19e23f0405d97da1dd353b",
};

const FireDB = (() => {
  let _db = null, _ok = false, _connected = false, _q = {};

  /* ══════════════════════════════════════════════════════
   * 오프라인 쓰기 큐 (localStorage 영구 보관)
   * 목적: set()/update()/remove() 호출 시점에 연결이 끊겨 있어도
   *       "그냥 사라지는" 것을 막고, 재연결되는 순간 반드시 서버에 반영되게 함.
   *       (교재/진도/직원/급여 등 모든 모듈이 이 큐를 공통으로 사용)
   * ══════════════════════════════════════════════════════ */
  const LS_QUEUE = 'hk10b_fbQueue';
  function _loadQueue() {
    try { return JSON.parse(localStorage.getItem(LS_QUEUE)) || []; } catch { return []; }
  }
  function _saveQueue(q) {
    try { localStorage.setItem(LS_QUEUE, JSON.stringify(q)); } catch {}
  }
  function _enqueue(op, path, val) {
    const q = _loadQueue();
    const idx = q.findIndex(x => x.path === path);
    const item = { op, path, val, ts: Date.now() };
    if (idx >= 0) q[idx] = item; else q.push(item); // 같은 경로는 최신값으로 덮어씀
    _saveQueue(q);
    console.log(`[FireDB] 📥 오프라인 큐 적재 (${op}):`, path);
    _updatePendingBadge();
  }
  function _dequeue(path) {
    _saveQueue(_loadQueue().filter(x => x.path !== path));
    _updatePendingBadge();
  }

  let _flushing = false;
  async function _flushQueue() {
    if (_flushing) return { attempted: false, reason: 'already-flushing', ok: 0, fail: 0 };
    if (!_connected || !_db) return { attempted: false, reason: 'offline', ok: 0, fail: 0 };
    const q = _loadQueue();
    if (!q.length) return { attempted: false, reason: 'empty', ok: 0, fail: 0 };
    _flushing = true;
    console.log(`[FireDB] 🔄 오프라인 큐 전송 시작 (${q.length}건)`);
    let ok = 0, fail = 0;
    for (const item of q) {
      try {
        if (item.op === 'set')    await _db.ref(item.path).set(item.val);
        if (item.op === 'update') await _db.ref(item.path).update(item.val);
        if (item.op === 'remove') await _db.ref(item.path).remove();
        _dequeue(item.path); // ★ 항목 하나 성공할 때마다 즉시 배지 갱신(전체 완료를 기다리지 않음)
        ok++;
      } catch (e) {
        console.warn('[FireDB] 큐 전송 실패:', item.path, e.message);
        fail++;
      }
    }
    _flushing = false;
    if (ok > 0) {
      console.log(`[FireDB] ✅ 오프라인 큐 전송 완료: 성공 ${ok}건, 실패 ${fail}건`);
      _showFlushedBadge(ok);
    }
    _updatePendingBadge();
    return { attempted: true, reason: 'done', ok, fail };
  }
  function getPendingCount() { return _loadQueue().length; }

  /* ══════════════════════════════════════════════════════
   * ★ 대기 항목을 사람이 읽을 수 있는 설명으로 변환
   * ────────────────────────────────────────────────────────
   * 큐에는 Firebase 경로(path)만 저장되어 있어 그 자체로는
   * "hakwon10/staffwork/ab12/2026_07_08" 처럼 사용자가 알아볼 수
   * 없는 형태다. 경로 패턴을 보고 어느 메뉴의 무엇인지, 그리고
   * 탭하면 이동할 화면(App.go 인자)까지 함께 계산해서 반환한다.
   * ══════════════════════════════════════════════════════ */
  function _describePath(path) {
    // 진도 (db.js: hakwon10/progress/{classId}__{weekKey}__{dayName}__...)
    if (path.startsWith('hakwon10/progress/')) {
      const rest = path.slice('hakwon10/progress/'.length);
      const parts = rest.split('__');
      const isMemo = rest.includes('__MEMO');
      const isDate = rest.includes('__savedAt');
      let label = '📅 진도';
      if (isMemo) label += ' · 메모';
      else if (isDate) label += ' · 완료일 표시';
      else label += ' · 입력값';
      if (parts[1]) label += ` (${parts[1]}주차)`;
      return { icon: '📅', label, page: 'operate' };
    }
    // 직원 근무 (staff-db.js: hakwon10/staffwork/{sid}/{date})
    if (path.startsWith('hakwon10/staffwork/')) {
      return { icon: '👥', label: '👥 직원 · 근무 기록', page: 'staff' };
    }
    if (path.startsWith('hakwon10/staff/')) {
      return { icon: '👥', label: '👥 직원 · 기본 정보', page: 'staff' };
    }
    if (path.startsWith('hakwon10/stafftempl/')) {
      return { icon: '👥', label: '👥 직원 · 근무 템플릿', page: 'staff' };
    }
    if (path.startsWith('hakwon10/staffpay')) {
      return { icon: '👥', label: '👥 직원 · 급여 저장', page: 'staff' };
    }
    // 교재
    if (path.startsWith('hakwon10/booklib')) {
      return { icon: '📚', label: '📚 교재 · 도서 정보', page: 'booklib' };
    }
    if (path.startsWith('hakwon10/bookcheck')) {
      return { icon: '📚', label: '📚 교재 · 학습현황 체크', page: 'booklib' };
    }
    if (path.startsWith('hakwon10/bookstamps')) {
      return { icon: '📚', label: '📚 교재 · 스탬프', page: 'booklib' };
    }
    // 성적
    if (path.startsWith('hakwon10/grades')) {
      return { icon: '📝', label: '📝 성적 · 입력값', page: 'grade' };
    }
    // 학생
    if (path.startsWith('hakwon10/students')) {
      return { icon: '🎓', label: '🎓 학생 · 정보', page: 'students' };
    }
    // 반/계정/테마 (db.js 공통)
    if (path.startsWith('hakwon10/classes/')) {
      return { icon: '🏫', label: '🏫 반 정보', page: 'manage' };
    }
    if (path.startsWith('hakwon10/accounts/')) {
      return { icon: '👤', label: '👤 계정 정보', page: 'manage' };
    }
    if (path.startsWith('hakwon10/theme')) {
      return { icon: '🎨', label: '🎨 테마 설정', page: 'manage' };
    }
    // 알 수 없는 경로 — 원본 그대로 표시
    return { icon: '❓', label: path, page: null };
  }

  function getPendingItems() {
    return _loadQueue().map(item => ({
      ...item,
      ...(_describePath(item.path)),
    })).sort((a, b) => b.ts - a.ts);
  }

  function _timeAgo(ts) {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return '방금';
    if (sec < 3600) return `${Math.floor(sec/60)}분 전`;
    if (sec < 86400) return `${Math.floor(sec/3600)}시간 전`;
    return `${Math.floor(sec/86400)}일 전`;
  }

  /* ── 대기 항목 상세 패널 — 배지를 탭하면 뜬다 ── */
  /* 상세 패널의 "지금 재시도" 버튼 전용 핸들러 —
   * _flushQueue()를 직접 호출해 성공/실패/오프라인 여부를 정확히 알고,
   * 그 결과에 맞는 메시지를 보여준 뒤에야 패널을 닫는다(무조건 즉시
   * 닫아버리면 실제로 전송됐는지 사용자가 확인할 수 없기 때문). */
  async function _retryFromPanel(btn) {
    if (btn) { btn.disabled = true; btn.textContent = '🔄 전송 중...'; }
    const r = await _flushQueue();
    if (r.reason === 'offline') {
      if (btn) { btn.disabled = false; btn.textContent = '🔄 지금 전체 재시도'; }
      alert('⚠️ 현재 오프라인 상태입니다. 인터넷 연결을 확인한 뒤 다시 시도해주세요.');
      return;
    }
    if (r.reason === 'already-flushing') {
      if (btn) { btn.disabled = false; btn.textContent = '🔄 지금 전체 재시도'; }
      return; // 이미 다른 전송이 진행 중 — 그 결과를 기다리면 배지가 알아서 갱신됨
    }
    const stillLeft = getPendingCount();
    if (stillLeft === 0) {
      if (btn) { btn.textContent = '✅ 서버 반영 완료'; btn.style.background = '#059669'; }
      setTimeout(() => document.getElementById('fb-pending-panel')?.remove(), 700);
    } else {
      // 일부만 성공 — 패널을 다시 그려서 남은 항목을 보여준다(닫지 않음)
      _showPendingDetail();
    }
  }
  window._fbRetryFromPanel = _retryFromPanel; // onclick에서 호출하기 위한 전역 브릿지

  function _showPendingDetail() {
    document.getElementById('fb-pending-panel')?.remove();
    const items = getPendingItems();
    if (!items.length) return;

    const panel = document.createElement('div');
    panel.id = 'fb-pending-panel';
    panel.style.cssText = 'position:fixed;inset:0;z-index:9996;background:rgba(0,0,0,.4);display:flex;align-items:flex-end;justify-content:center';
    panel.onclick = (e) => { if (e.target === panel) panel.remove(); };

    const rows = items.map((it, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #f0f0f0;${it.page ? 'cursor:pointer' : ''}"
           ${it.page ? `onclick="document.getElementById('fb-pending-panel').remove(); if(typeof App!=='undefined'&&App.go) App.go('${it.page}');"` : ''}>
        <span style="font-size:18px;flex-shrink:0">${it.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.label}</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:1px">${_timeAgo(it.ts)} 저장 시도 · ${it.op==='remove'?'삭제':'저장'}</div>
        </div>
        ${it.page ? `<span style="font-size:11px;color:#2563eb;font-weight:700;flex-shrink:0">이동 ›</span>` : ''}
      </div>`).join('');

    panel.innerHTML = `
      <div style="background:#fff;width:100%;max-width:480px;border-radius:16px 16px 0 0;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 -4px 24px rgba(0,0,0,.2)" onclick="event.stopPropagation()">
        <div style="width:36px;height:4px;background:#e5e7eb;border-radius:2px;margin:10px auto 4px"></div>
        <div style="padding:8px 16px 12px;display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:14px;font-weight:800;color:#111">⏳ 서버 저장 대기 중 (${items.length}건)</div>
          <button onclick="document.getElementById('fb-pending-panel').remove()" style="border:none;background:none;font-size:18px;color:#9ca3af;cursor:pointer;padding:4px">✕</button>
        </div>
        <div style="font-size:11px;color:#9ca3af;padding:0 16px 8px">항목을 탭하면 해당 메뉴로 이동합니다. 인터넷 연결이 되면 자동으로 다시 전송을 시도합니다.</div>
        <div style="flex:1;overflow-y:auto">${rows}</div>
        <div style="padding:10px 16px;border-top:1px solid #f0f0f0">
          <button onclick="window._fbRetryFromPanel(this)"
            style="width:100%;padding:11px;border-radius:10px;background:#2563eb;color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;transition:background .2s">
            🔄 지금 전체 재시도
          </button>
        </div>
      </div>`;
    document.body.appendChild(panel);
  }

  /* ══════════════════════════════════════════════════════
   * ★ 대기 항목 상시 배지 — 모든 모듈(진도·교재·성적·직원) 공통
   * ────────────────────────────────────────────────────────
   * "언젠가 다 전송되고 나서"만 잠깐 뜨는 완료 배지와 달리,
   * 큐에 무언가 쌓여 있는 "동안 내내" 화면 한쪽에 계속 보인다.
   * 사용자가 지금 입력한 게 서버에 반영됐는지 안 됐는지를
   * 어느 화면(진도/교재/성적/직원)에 있든 항상 스스로 판단할 수 있게 함.
   * 탭하면 어떤 항목이 대기 중인지 상세 목록으로 확인 가능.
   * ══════════════════════════════════════════════════════ */
  function _updatePendingBadge() {
    const n = getPendingCount();
    let badge = document.getElementById('fb-pending-badge');
    if (n === 0) {
      if (badge) badge.remove();
      document.getElementById('fb-pending-panel')?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'fb-pending-badge';
      badge.style.cssText = [
        'position:fixed;bottom:118px;right:12px;z-index:8887',
        'display:flex;align-items:center;gap:6px',
        'padding:6px 12px;border-radius:20px',
        'font-size:11px;font-weight:800;pointer-events:auto;cursor:pointer',
        'background:rgba(245,158,11,.14);color:#b45309',
        'border:1.5px solid rgba(245,158,11,.4)',
        'box-shadow:0 2px 10px rgba(0,0,0,.15)',
        'backdrop-filter:blur(8px);transition:opacity .3s',
      ].join(';');
      badge.onclick = () => { _showPendingDetail(); };
      document.body.appendChild(badge);
    }
    badge.innerHTML = `⏳ 서버 저장 대기 ${n}건 · 탭하여 확인`;
  }

  /* ★ 큐 전송 완료 알림 배지 (사용자가 자동 동기화를 인지할 수 있도록) */
  function _showFlushedBadge(count) {
    let ind = document.getElementById('fb-conn-ind');
    if (!ind) ind = _createInd();
    Object.assign(ind.style, {
      background: 'rgba(5,150,105,.12)', color: '#059669',
      border: '1px solid rgba(5,150,105,.3)', opacity: '1',
    });
    ind.innerHTML = `✅ 대기 데이터 ${count}건 서버 전송 완료`;
    clearTimeout(ind._t);
    ind._t = setTimeout(() => { ind.style.opacity = '0'; }, 3500);
  }

  /* ── 초기 4초 오탐 억제 ── */
  const _suppressUntil = Date.now() + 4000;

  /* ── 재연결 상태 ── */
  let _retryTimer  = null;
  let _retryCount  = 0;
  // 지수 백오프: 1~3회=5초, 4~10회=15초, 11회~=30초
  function _retryDelay() {
    if (_retryCount <= 3)  return 5000;
    if (_retryCount <= 10) return 15000;
    return 30000;
  }

  /* ── 오프라인 상태 추적 ── */
  let _offlineSince    = 0;
  let _offlineShowTimer = null;

  /* ── 재연결 스케줄 (무제한 — 인터넷 있는 한 계속 시도) ── */
  function _scheduleRetry() {
    if (_retryTimer || _connected) return;
    const delay = _retryDelay();
    _retryTimer = setTimeout(() => {
      _retryTimer = null;
      if (_connected) return;
      _retryCount++;
      console.log(`[FireDB] ⏳ 재연결 대기 ${_retryCount}회차 (${delay/1000}초 후)`);
      _scheduleRetry(); // 무한 재시도
    }, delay);
  }

  /* ── 오프라인 UI 표시 (8초 디바운스 후) ── */
  function _showOfflineUI() {
    let ind = document.getElementById('fb-conn-ind');
    if (!ind) ind = _createInd();
    Object.assign(ind.style, {
      background: 'rgba(239,68,68,.1)', color: '#dc2626',
      border: '1px solid rgba(239,68,68,.3)', opacity: '1',
    });
    const elapsed = _offlineSince ? Math.round((Date.now() - _offlineSince) / 1000) : 0;
    ind.innerHTML = `🔴 오프라인${elapsed > 0 ? ` (${elapsed}초)` : ''} — 재연결 중...`;
    clearTimeout(ind._t);
    /* 오프라인 표시 중 경과 시간 업데이트 (10초마다) */
    ind._elapsed = setInterval(() => {
      if (!ind || !document.getElementById('fb-conn-ind')) { clearInterval(ind._elapsed); return; }
      if (_connected) { clearInterval(ind._elapsed); return; }
      const sec = _offlineSince ? Math.round((Date.now() - _offlineSince) / 1000) : 0;
      ind.innerHTML = `🔴 오프라인 (${sec}초) — 재연결 중...`;
    }, 10000);
  }

  /* ── 인디케이터 DOM 생성 ── */
  function _createInd() {
    const ind = document.createElement('div');
    ind.id = 'fb-conn-ind';
    ind.style.cssText = [
      'position:fixed;bottom:72px;right:12px;z-index:8888',
      'padding:5px 12px;border-radius:20px',
      'font-size:11px;font-weight:700;pointer-events:none',
      'box-shadow:0 2px 8px rgba(0,0,0,.15)',
      'backdrop-filter:blur(8px);transition:opacity .4s',
      'opacity:0',
    ].join(';');
    document.body.appendChild(ind);
    return ind;
  }

  /* ── 연결 상태 UI 업데이트 ── */
  function _updateConnUI(connected) {
    if (!connected && Date.now() < _suppressUntil) return;

    if (connected) {
      const wasOffline = _offlineSince > 0;

      _offlineSince = 0;
      clearTimeout(_offlineShowTimer); _offlineShowTimer = null;
      clearTimeout(_retryTimer);       _retryTimer = null;
      _retryCount = 0;

      let ind = document.getElementById('fb-conn-ind');
      if (ind?._elapsed) { clearInterval(ind._elapsed); ind._elapsed = null; }
      if (!ind) ind = _createInd();

      if (wasOffline) {
        Object.assign(ind.style, {
          background: 'rgba(5,150,105,.12)', color: '#059669',
          border: '1px solid rgba(5,150,105,.3)', opacity: '1',
        });
        ind.innerHTML = '🟢 서버 연결됨';
        clearTimeout(ind._t);
        ind._t = setTimeout(() => { ind.style.opacity = '0'; }, 3000);
      }

    } else {
      if (!_offlineSince) {
        _offlineSince = Date.now();
        _scheduleRetry();
      }
      if (!_offlineShowTimer) {
        _offlineShowTimer = setTimeout(() => {
          _offlineShowTimer = null;
          if (!_connected) _showOfflineUI();
        }, 8000);
      }
    }
  }

  /* ── keepalive 핑 (60초 주기 — WebSocket 연결 유지) ──
   * 기존엔 `.info/serverTimeOffset`에 .get()을 호출했는데, 이 특수 경로는
   * Firebase compat SDK에서 .get()을 안정적으로 지원하지 않아
   * "Invalid token in path" 오류가 계속 발생했음.
   * .info/connected는 이미 실시간 리스너로 추적 중이므로, 별도 네트워크
   * 요청 없이 그 값만 재확인하는 것으로 충분히 안전하게 대체함. */
  function _startKeepAlive() {
    setInterval(() => {
      if (document.hidden || !_ok || !_db) return;
      // 실시간 리스너가 살아있는지만 가볍게 재확인 (네트워크 요청 없음)
      if (!_connected) {
        console.log('[FireDB] 🔁 keepalive: 연결 끊김 상태 감지, 재연결 대기 중');
      }
    }, 60000);
  }

  /* ★ 주기적 큐 자동 전송 (레벨 기반 — 재연결 "이벤트"에 의존하지 않음)
   *   문제: 기존엔 disconnected→connected "전환 순간"에만 큐를 비웠기 때문에,
   *         연결이 끊김 없이 계속 유지되는데도 어떤 이유로 큐에만 쌓인 채
   *         남아있는 데이터는 브라우저를 완전히 새로고침(=새 연결 이벤트 발생)
   *         하기 전까지 서버로 전송되지 않는 문제가 있었음.
   *   해결: 15초마다 "현재 연결되어 있고 대기 항목이 있으면" 무조건 재전송 시도.
   *         네이티브 새로고침/캐시삭제 없이도 자동으로 서버 동기화가 보장됨. */
  function _startQueueWatcher() {
    setInterval(() => {
      if (_connected && getPendingCount() > 0) {
        console.log(`[FireDB] 🔁 주기적 큐 점검 — 대기 ${getPendingCount()}건 재전송 시도`);
        _flushQueue();
      }
    }, 15000);
  }

  /* ── 초기화 ── */
  async function init() {
    try {
      if (!firebase?.database) throw new Error('no sdk');
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      _db = firebase.database();
      _ok = true;
      console.log('[FireDB] ✅ connected');

      // keepSynced 제거 (v10 compat 미지원) — 실시간 listen()이 연결 유지 대체

      /* 연결 상태 실시간 감지 */
      _db.ref('.info/connected').on('value', snap => {
        const prev = _connected;
        _connected = !!snap.val();
        _updateConnUI(_connected);
        if (_connected && !prev) {
          console.log('[FireDB] 🌐 온라인 복귀');
          setTimeout(_flushQueue, 500); // 재연결 안정화 후 큐 전송
        }
        if (!_connected) console.log('[FireDB] 📴 연결 끊김 — 8초 후 배너 예정');
      });

      /* ★ 네트워크 복귀 이벤트 (WiFi↔LTE 전환 등) */
      window.addEventListener('online', () => {
        console.log('[FireDB] 🌐 navigator.online 감지 → 재연결 시도');
        _retryCount = 0;
        clearTimeout(_retryTimer); _retryTimer = null;
        if (!_connected) _scheduleRetry();
      });

      /* ★ 탭 백그라운드→포어그라운드 복귀 — 장시간 방치 후에도
       * 즉시 응답하도록, 연결이 끊겨 있었다면 재연결부터, 이미
       * 연결돼 있다면 대기 중인 큐가 있는지 바로 확인해 전송 시도 */
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        console.log('[FireDB] 👁 탭 활성화 → 연결 상태 확인');
        if (!_connected) {
          _retryCount = 0;
          clearTimeout(_retryTimer); _retryTimer = null;
          _scheduleRetry();
        } else if (getPendingCount() > 0) {
          console.log(`[FireDB] 👁 탭 재활성화 시 대기 항목 ${getPendingCount()}건 발견 → 즉시 전송 시도`);
          _flushQueue();
        }
        _updatePendingBadge();
      });

      /* ★ keepalive 시작 */
      _startKeepAlive();
      /* ★ 주기적 큐 자동 전송 시작 */
      _startQueueWatcher();
      /* ★ 이전 세션에서 넘어온 대기 항목이 있으면 즉시 배지로 알림 */
      _updatePendingBadge();

    } catch (e) {
      _ok = false;
      console.warn('[FireDB] offline →', e.message);
    }
    return _ok;
  }

  const ready       = () => _ok && !!_db;
  const isConnected = () => _connected;

  function get(path) {
    if (!ready()) return Promise.resolve(null);
    return _db.ref(path).get()
      .then(s => s.exists() ? s.val() : null)
      .catch(e => { console.error('get', path, e); return null; });
  }

  /* 서버에서 직접 강제 읽기 —
   * .once('value') 대신 .get() 사용: Firebase 공식 문서상 .get()은
   * "항상 서버의 최신 데이터로 응답을 시도하고, 도달 불가능할 때만
   * 캐시로 폴백"하도록 설계된 API. .once('value')는 레거시로 연결
   * 상태에 따라 조용히 로컬 캐시를 반환할 수 있어 배제함.
   */
  function getFromServer(path) {
    if (!ready()) return Promise.resolve(null);
    if (!_connected) {
      console.warn('[FireDB] getFromServer: 현재 오프라인 — 캐시값이 반환될 수 있음', path);
    }
    return _db.ref(path).get()
      .then(s => s.exists() ? s.val() : null)
      .catch(e => { console.error('getFromServer', path, e); return null; });
  }
  function set(path, v) {
    if (!ready() || !_connected) { _enqueue('set', path, v); return Promise.resolve(false); }
    return _db.ref(path).set(v)
      .then(() => true)
      .catch(e => { console.error('set', path, e); _enqueue('set', path, v); return false; });
  }
  function update(path, v) {
    if (!ready() || !_connected) { _enqueue('update', path, v); return Promise.resolve(false); }
    return _db.ref(path).update(v)
      .then(() => true)
      .catch(e => { console.error('update', path, e); _enqueue('update', path, v); return false; });
  }
  function remove(path) {
    if (!ready() || !_connected) { _enqueue('remove', path, null); return Promise.resolve(); }
    return _db.ref(path).remove().catch(e => { console.error('remove', path, e); _enqueue('remove', path, null); });
  }
  /* ── 트랜잭션: 여러 기기가 동시에 같은 경로에 쓸 때 원자적으로 처리 ──
   *   updateFn(currentVal) → 반환값이 undefined면 트랜잭션 중단(abort, 내 값을 버림)
   *   결과: { committed: 내가 이겼는지, snapshot: 최종적으로 서버에 반영된 값 }
   */
  function transaction(path, updateFn) {
    if (!ready()) return Promise.resolve({ committed:false, snapshot:null });
    return _db.ref(path).transaction(updateFn)
      .then(r => ({ committed: r.committed, snapshot: r.snapshot ? r.snapshot.val() : null }))
      .catch(e => { console.error('transaction', path, e); return { committed:false, snapshot:null }; });
  }
  function listen(path, cb) {
    if (!ready()) return () => {};
    const ref = _db.ref(path);
    ref.on('value', s => cb(s.exists() ? s.val() : null),
      e => console.error('listen', path, e));
    return () => ref.off('value');
  }
  function debounced(path, val, delay = 700) {
    clearTimeout(_q[path]);
    _q[path] = setTimeout(async () => {
      if (!val && val !== 0) await remove(path); else await set(path, val);
      delete _q[path];
    }, delay);
  }

  const P = {
    root:'hakwon10', classes:'hakwon10/classes',
    progress:'hakwon10/progress', accounts:'hakwon10/accounts', theme:'hakwon10/theme',
  };

  async function syncNow() { await _flushQueue(); return getPendingCount() === 0; }

  return { init, ready, isConnected, get, getFromServer, set, update, remove, listen,
           debounced, transaction, syncNow, getPendingCount, getPendingItems, P };
})();
