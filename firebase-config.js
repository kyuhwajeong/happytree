/**
 * firebase-config.js — v10
 * ────────────────────────────────────────────────────────────────
 *  v10 변경사항 (버그 수정 + 안정화)
 *
 *  ★ 버그 수정 1 — _scheduleRetry() 절대 호출 안 되는 구조적 버그 수정
 *    · _offlineSince = Date.now() 직후 (Date.now()-_offlineSince > 10000)
 *      조건은 항상 ~0ms → 절대 true 불가 → 재연결 시도 dead code
 *    · 수정: 최초 오프라인 감지 시 즉시 _scheduleRetry() 호출
 *
 *  ★ 버그 수정 2 — 오프라인 배너 즉시 표시 문제
 *    · Firebase .info/connected 특성상 네트워크 일시 흔들림·탭 전환·
 *      WiFi↔LTE 전환에도 false 발생 후 SDK가 5~15초 내 자동 재연결
 *    · 수정: 8초 디바운스 적용 — 8초 후에도 오프라인이면 배너 표시
 *      → 일시적 끊김(< 8초)은 배너 없이 자동 해결됨
 *
 *  ★ 추가 — keepSynced(true)
 *    · 주요 경로 WebSocket 연결 유지로 재연결 빈도 감소
 *
 *  ★ 유지 — 초기 4초 억제, 재연결 최대 5회
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

  /* ── 오프라인 억제 타이머 (앱 시작 4초간 오탐 방지) ── */
  const _suppressUntil = Date.now() + 4000;

  /* ── 재연결 시도 ── */
  let _retryTimer = null, _retryCount = 0;
  const MAX_RETRY = 5, RETRY_INTERVAL = 5000;

  /* ── 오프라인 상태 추적 ── */
  let _offlineSince = 0;
  let _offlineShowTimer = null;   // 8초 디바운스 타이머

  function _scheduleRetry() {
    if (_retryTimer || _retryCount >= MAX_RETRY) return;
    _retryTimer = setTimeout(async () => {
      _retryTimer = null;
      if (_connected) return; // 이미 복구됨
      _retryCount++;
      console.log(`[FireDB] 🔄 재연결 시도 ${_retryCount}/${MAX_RETRY}`);
      try {
        // Firebase SDK가 내부적으로 재연결 관리하므로
        // goOffline → goOnline 사이클로 WebSocket 강제 재협상
        if (_db) {
          _db.goOffline();
          await new Promise(r => setTimeout(r, 500));
          _db.goOnline();
          // .info/connected 리스너가 재연결 결과를 자동 수신함
        }
      } catch(e) {
        console.warn('[FireDB] 재연결 오류:', e);
        _scheduleRetry();
      }
    }, RETRY_INTERVAL);
  }

  /* ── 오프라인 UI 실제 표시 (8초 디바운스 후 호출) ── */
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

  /* ── 연결 상태 인디케이터 ── */
  function _updateConnUI(connected) {
    // 초기 4초간 오프라인 표시 억제
    if (!connected && Date.now() < _suppressUntil) return;

    if (connected) {
      /* ─── 온라인 복귀 ─── */
      const wasOffline = _offlineSince > 0;

      // 오프라인 상태 초기화
      _offlineSince = 0;
      clearTimeout(_offlineShowTimer); _offlineShowTimer = null;
      clearTimeout(_retryTimer);       _retryTimer = null;
      _retryCount = 0;

      let ind = document.getElementById('fb-conn-ind');
      if (!ind) ind = _createInd();

      // 실제로 오프라인이 표시됐던 경우에만 "연결됨" 배너 표시
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
      /* ─── 오프라인 감지 ─── */
      if (!_offlineSince) {
        _offlineSince = Date.now();
        // ★ 버그 수정: 즉시 재연결 시도 스케줄 (이전 코드는 여기서 절대 retry 안 됐음)
        _scheduleRetry();
      }

      // ★ 핵심 개선: 8초 디바운스
      // Firebase SDK가 보통 5~15초 내 자동 재연결하므로
      // 일시적 끊김(WiFi 전환, 탭 전환 등)은 배너 없이 자동 해결됨
      if (!_offlineShowTimer) {
        _offlineShowTimer = setTimeout(() => {
          _offlineShowTimer = null;
          if (!_connected) _showOfflineUI(); // 8초 후에도 오프라인이면 표시
        }, 8000);
      }
    }
  }

  /* ── 초기화 ── */
  async function init() {
    try {
      if (!firebase?.database) throw new Error('no sdk');
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      _db = firebase.database();

      /* 오프라인 퍼시스턴스 — SDK 내장 캐시 활성화 */
      try {
        await _db.enablePersistence({ synchronizeTabs: true });
        console.log('[FireDB] ✅ 오프라인 퍼시스턴스 활성화');
      } catch (e) {
        if (e.code === 'failed-precondition') {
          console.warn('[FireDB] 퍼시스턴스: 다중 탭 — 첫 탭만 적용');
        } else if (e.code === 'unimplemented') {
          console.warn('[FireDB] 퍼시스턴스: 브라우저 미지원');
        }
      }

      _ok = true;
      console.log('[FireDB] ✅ connected');

      /* ★ keepSynced: 주요 경로 WebSocket 연결 유지 (재연결 빈도 감소) */
      try {
        _db.ref('hakwon10/classes').keepSynced(true);
        _db.ref('hakwon10/accounts').keepSynced(true);
        console.log('[FireDB] ✅ keepSynced 활성화');
      } catch(e) {
        console.warn('[FireDB] keepSynced 오류:', e);
      }

      /* 연결 상태 실시간 감지 */
      _db.ref('.info/connected').on('value', snap => {
        const prev = _connected;
        _connected = !!snap.val();
        _updateConnUI(_connected);
        if (_connected && !prev) {
          console.log('[FireDB] 🌐 온라인 복귀 — SDK 자동 동기화');
        }
        if (!_connected) {
          console.log('[FireDB] 📴 연결 끊김 — 8초 후 배너 표시 예정');
        }
      });

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
  function set(path, v) {
    if (!ready()) return Promise.resolve();
    return _db.ref(path).set(v).catch(e => console.error('set', path, e));
  }
  function update(path, v) {
    if (!ready()) return Promise.resolve();
    return _db.ref(path).update(v).catch(e => console.error('update', path, e));
  }
  function remove(path) {
    if (!ready()) return Promise.resolve();
    return _db.ref(path).remove().catch(e => console.error('remove', path, e));
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

  return { init, ready, isConnected, get, set, update, remove, listen, debounced, P };
})();
