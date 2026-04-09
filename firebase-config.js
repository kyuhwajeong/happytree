/**
 * firebase-config.js — v6
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
  let _db = null, _ok = false, _q = {};

  function init() {
    try {
      if (!firebase?.database) throw new Error('no sdk');
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      _db = firebase.database();
      _ok = true;
      console.log('[FireDB] ✅ connected');
    } catch(e) {
      _ok = false;
      console.warn('[FireDB] offline →', e.message);
    }
    return _ok;
  }

  const ready = () => _ok && !!_db;

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

  return { init, ready, get, set, update, remove, listen, debounced, P };
})();
