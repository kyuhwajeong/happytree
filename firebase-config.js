/**
 * firebase-config.js — v8
 * ────────────────────────────────────────────────────────────────
 *  v6 → v8 변경사항
 *  · enablePersistence() — Firebase SDK 내장 오프라인 캐시 활성화
 *    → 오프라인 읽기/쓰기 SDK가 자동 처리
 *    → 온라인 복귀 시 SDK가 자동 동기화
 *  · .info/connected 리스너 — 연결 상태 실시간 감지
 *  · 연결 상태 인디케이터 — 화면 우하단 표시
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

  /* ── 연결 상태 인디케이터 ── */
  function _updateConnUI(connected) {
    let ind = document.getElementById('fb-conn-ind');
    if (!ind) {
      ind = document.createElement('div');
      ind.id = 'fb-conn-ind';
      ind.style.cssText = [
        'position:fixed;bottom:72px;right:12px;z-index:8888',
        'padding:5px 12px;border-radius:20px',
        'font-size:11px;font-weight:700;pointer-events:none',
        'box-shadow:0 2px 8px rgba(0,0,0,.15)',
        'backdrop-filter:blur(8px);transition:opacity .4s',
      ].join(';');
      document.body.appendChild(ind);
    }
    if (connected) {
      Object.assign(ind.style, {
        background: 'rgba(5,150,105,.12)', color: '#059669',
        border: '1px solid rgba(5,150,105,.3)', opacity: '1',
      });
      ind.innerHTML = '🟢 서버 연결됨';
      clearTimeout(ind._t);
      ind._t = setTimeout(() => { ind.style.opacity = '0'; }, 3000);
    } else {
      Object.assign(ind.style, {
        background: 'rgba(239,68,68,.1)', color: '#dc2626',
        border: '1px solid rgba(239,68,68,.3)', opacity: '1',
      });
      ind.innerHTML = '🔴 오프라인 — 자동 저장 대기 중';
      clearTimeout(ind._t);
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

      /* 연결 상태 실시간 감지 */
      _db.ref('.info/connected').on('value', snap => {
        const prev = _connected;
        _connected = !!snap.val();
        _updateConnUI(_connected);
        if (_connected && !prev) {
          console.log('[FireDB] 🌐 온라인 복귀 — SDK 자동 동기화');
        }
        if (!_connected) {
          console.log('[FireDB] 📴 오프라인 — SDK 캐시 사용');
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
