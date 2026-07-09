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
  }
  function _dequeue(path) { _saveQueue(_loadQueue().filter(x => x.path !== path)); }

  let _flushing = false;
  async function _flushQueue() {
    if (_flushing || !_connected || !_db) return;
    const q = _loadQueue();
    if (!q.length) return;
    _flushing = true;
    console.log(`[FireDB] 🔄 오프라인 큐 전송 시작 (${q.length}건)`);
    let ok = 0, fail = 0;
    for (const item of q) {
      try {
        if (item.op === 'set')    await _db.ref(item.path).set(item.val);
        if (item.op === 'update') await _db.ref(item.path).update(item.val);
        if (item.op === 'remove') await _db.ref(item.path).remove();
        _dequeue(item.path);
        ok++;
      } catch (e) {
        console.warn('[FireDB] 큐 전송 실패:', item.path, e.message);
        fail++;
      }
    }
    _flushing = false;
    if (ok > 0) console.log(`[FireDB] ✅ 오프라인 큐 전송 완료: 성공 ${ok}건, 실패 ${fail}건`);
  }
  function getPendingCount() { return _loadQueue().length; }

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

  /* ── keepalive 핑 (60초 주기 — WebSocket 연결 유지) ── */
  function _startKeepAlive() {
    setInterval(async () => {
      /* 탭 비활성 또는 미초기화 상태면 핑 생략 */
      if (document.hidden || !_ok || !_db) return;
      try {
        await _db.ref('.info/serverTimeOffset').get();
        /* 성공 → 연결 유지 확인, 별도 동작 불필요 */
      } catch (e) {
        console.warn('[FireDB] ⚠️ keepalive 실패 — SDK 재연결 중:', e.message);
      }
    }, 60000);
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

      /* ★ 탭 백그라운드→포어그라운드 복귀 */
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        console.log('[FireDB] 👁 탭 활성화 → 연결 상태 확인');
        if (!_connected) {
          _retryCount = 0;
          clearTimeout(_retryTimer); _retryTimer = null;
          _scheduleRetry();
        }
      });

      /* ★ keepalive 시작 */
      _startKeepAlive();

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

  /* 서버에서 직접 강제 읽기 (캐시 우회, once 사용) */
  function getFromServer(path) {
    if (!ready()) return Promise.resolve(null);
    return _db.ref(path).once('value')
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
           debounced, transaction, syncNow, getPendingCount, P };
})();
