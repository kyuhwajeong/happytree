/**
 * firebase-config.js
 * Firebase Realtime Database 연동
 *
 * ★ 배포 전 반드시:
 *   1. https://console.firebase.google.com 에서 프로젝트 생성
 *   2. Realtime Database 활성화 → 규칙을 아래로 설정:
 *      { "rules": { ".read": true, ".write": true } }
 *      (운영 시 인증 기반으로 강화 권장)
 *   3. 아래 FIREBASE_CONFIG 값을 본인 프로젝트 값으로 교체
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAW7ZIEnEfvVb2QnshD-kr8ovYWL65m2IE",
  authDomain: "happytree-e16d7.firebaseapp.com",
  databaseURL: "https://happytree-e16d7-default-rtdb.firebaseio.com",
  projectId: "happytree-e16d7",
  storageBucket: "happytree-e16d7.firebasestorage.app",
  messagingSenderId: "154995256418",
  appId: "1:154995256418:web:19e23f0405d97da1dd353b",
  measurementId: "G-5Y9R50VXW9"
};

/* ── Firebase SDK (CDN) ─────────────────────────
   index.html 에서 아래 스크립트 태그로 로드:
   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>
──────────────────────────────────────────────── */

const FireDB = (() => {
  let db      = null;
  let isReady = false;
  let _pendingWrites = {}; // debounce 용

  function init() {
    try {
      if (!firebase?.apps?.length) firebase.initializeApp(FIREBASE_CONFIG);
      db      = firebase.database();
      isReady = true;
      console.log('[FireDB] ✅ Connected');
    } catch (e) {
      console.warn('[FireDB] ⚠️ Firebase 연결 실패 — localStorage 모드로 동작합니다.', e);
      isReady = false;
    }
  }

  function ready() { return isReady && db !== null; }

  /* ── 경로 헬퍼 ──────────────────────────── */
  const PATHS = {
    classes:   () => 'hakwon/classes',
    progress:  () => 'hakwon/progress',
    accounts:  () => 'hakwon/accounts',
    theme:     () => 'hakwon/theme',
  };

  /* ── 단순 set/get ───────────────────────── */
  function set(path, value) {
    if (!ready()) return Promise.resolve();
    return db.ref(path).set(value);
  }

  function get(path) {
    if (!ready()) return Promise.resolve(null);
    return db.ref(path).get().then(snap => snap.exists() ? snap.val() : null);
  }

  function update(path, value) {
    if (!ready()) return Promise.resolve();
    return db.ref(path).update(value);
  }

  function remove(path) {
    if (!ready()) return Promise.resolve();
    return db.ref(path).remove();
  }

  /* ── 실시간 리스너 ──────────────────────── */
  function listen(path, callback) {
    if (!ready()) return () => {};
    const ref = db.ref(path);
    ref.on('value', snap => callback(snap.exists() ? snap.val() : null));
    return () => ref.off('value');
  }

  /* ── 진도 debounce 저장 (자동저장용) ────── */
  function saveProgressDebounced(key, value, delay = 800) {
    clearTimeout(_pendingWrites[key]);
    _pendingWrites[key] = setTimeout(() => {
      const path = `${PATHS.progress()}/${key.replace(/\|/g, '__')}`;
      if (value === '' || value == null) {
        remove(path);
      } else {
        set(path, value);
      }
      delete _pendingWrites[key];
    }, delay);
  }

  return { init, ready, set, get, update, remove, listen, saveProgressDebounced, PATHS };
})();
