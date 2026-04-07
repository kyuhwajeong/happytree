/**
 * firebase-config.js — v5
 * Firebase Realtime Database 연동 + 안전한 폴백
 */

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAW7ZIEnEfvVb2QnshD-kr8ovYWL65m2IE",
  authDomain:        "happytree-e16d7.firebaseapp.com",
  databaseURL:       "https://happytree-e16d7-default-rtdb.firebaseio.com",
  projectId:         "happytree-e16d7",
  storageBucket:     "happytree-e16d7.firebasestorage.app",
  messagingSenderId: "154995256418",
  appId:             "1:154995256418:web:19e23f0405d97da1dd353b",
  measurementId:     "G-5Y9R50VXW9",
};

const FireDB = (() => {
  let _db       = null;
  let _ready    = false;
  let _pending  = {};   // debounce timers

  /* ── 초기화 (동기) ──────────────────────── */
  function init() {
    try {
      if (!firebase || !firebase.database) throw new Error('Firebase SDK 없음');
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      _db    = firebase.database();
      _ready = true;
      console.log('[FireDB] ✅ Connected to Firebase');
    } catch (e) {
      _ready = false;
      console.warn('[FireDB] ⚠️ Firebase 연결 실패 → localStorage 모드', e.message);
    }
    return _ready;
  }

  const ready = () => _ready && _db !== null;

  /* ── 데이터 한 번 읽기 (Promise) ─────────── */
  function get(path) {
    if (!ready()) return Promise.resolve(null);
    return _db.ref(path).get()
      .then(snap => snap.exists() ? snap.val() : null)
      .catch(e => { console.error('[FireDB] get error', path, e); return null; });
  }

  /* ── 쓰기 ────────────────────────────────── */
  function set(path, value) {
    if (!ready()) return Promise.resolve();
    return _db.ref(path).set(value)
      .catch(e => console.error('[FireDB] set error', path, e));
  }

  function update(path, value) {
    if (!ready()) return Promise.resolve();
    return _db.ref(path).update(value)
      .catch(e => console.error('[FireDB] update error', path, e));
  }

  function remove(path) {
    if (!ready()) return Promise.resolve();
    return _db.ref(path).remove()
      .catch(e => console.error('[FireDB] remove error', path, e));
  }

  /* ── 실시간 리스너 ──────────────────────── */
  function listen(path, cb) {
    if (!ready()) return () => {};
    const ref = _db.ref(path);
    ref.on('value', snap => cb(snap.exists() ? snap.val() : null),
      e => console.error('[FireDB] listen error', path, e));
    return () => ref.off('value');
  }

  /* ── 진도 디바운스 저장 ─────────────────── */
  function saveDebounced(path, value, delay = 800) {
    clearTimeout(_pending[path]);
    _pending[path] = setTimeout(async () => {
      if (value === '' || value == null) await remove(path);
      else await set(path, value);
      delete _pending[path];
    }, delay);
  }

  const PATHS = {
    root:      'hakwon',
    classes:   'hakwon/classes',
    progress:  'hakwon/progress',
    accounts:  'hakwon/accounts',
    theme:     'hakwon/theme',
  };

  return { init, ready, get, set, update, remove, listen, saveDebounced, PATHS };
})();
