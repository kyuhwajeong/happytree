/**
 * archive-db.js — 자료실 데이터 계층
 * ─────────────────────────────────────────────────────────
 * 파일 "내용물"은 Cloudflare Worker를 거쳐 R2에 저장되고,
 * 파일 "정보"(이름/크기/설명/업로드일 등)는 지금까지 이 프로젝트
 * 전체가 써온 것과 완전히 동일한 방식으로 Firebase에 저장된다
 * (로컬 캐시 + 실시간 리스너 + 연결 무관 저장 시도 + undefined 방어).
 */
const ArchiveDB = (() => {
  // ★★★ Cloudflare Worker 배포 후 아래 2줄을 실제 값으로 바꿔주세요 ★★★
  const WORKER_BASE   = 'https://delicate-dream-791b.kuha0879.workers.dev';
  const UPLOAD_TOKEN  = 'happytree2026-archive-key-hjyjkh';

  const LS_KEY = 'hk10b_archive';
  const FB_PATH = 'hakwon10/archive';

  const _lg = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const _ls = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const _nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const _now = () => new Date().toISOString();

  const _ev = {};
  function _fire(t) { (_ev[t] || []).forEach(f => { try { f(); } catch (e) { console.warn('[ArchiveDB]', e); } }); }
  function on(t, f) { if (!_ev[t]) _ev[t] = []; _ev[t].push(f); }

  let _list = [];
  let _updatesPaused = false; // 편집 중 서버 갱신 보류용 (일정표/공지 모듈과 동일 패턴)
  function pauseUpdates(v) { _updatesPaused = !!v; }

  const CATEGORIES = ['공지/양식', '학사자료', '교재자료', '행정서류', '기타'];

  function _saveLS() { _ls(LS_KEY, _list); }

  async function init() {
    _list = _lg(LS_KEY) || [];
    if (typeof FireDB === 'undefined') return;
    try {
      const data = await FireDB.get(FB_PATH);
      if (data) { _list = Object.values(data); _saveLS(); }
    } catch (e) { console.warn('[ArchiveDB] init', e); }

    FireDB.listen(FB_PATH, v => {
      if (_updatesPaused) return; // 편집 중엔 서버 갱신을 반영하지 않음(입력 내용 보호)
      const nd = v ? Object.values(v) : [];
      if (JSON.stringify(nd) !== JSON.stringify(_list)) {
        _list = nd; _saveLS(); _fire('archive');
      }
    });
  }

  function getAll() { return _list.slice().sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || '')); }
  function getById(id) { return _list.find(x => x.id === id) || null; }
  function getByCategory(cat) { return getAll().filter(x => x.category === cat); }

  /* ── Worker 통신 ── */
  function _fileExt(name) {
    const m = (name || '').match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : '';
  }
  async function _uploadToWorker(key, file) {
    const res = await fetch(`${WORKER_BASE}/file/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${UPLOAD_TOKEN}`,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    });
    if (!res.ok) throw new Error(`업로드 실패: HTTP ${res.status}`);
    return true;
  }
  async function _deleteFromWorker(key) {
    const res = await fetch(`${WORKER_BASE}/file/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${UPLOAD_TOKEN}` },
    });
    if (!res.ok) throw new Error(`삭제 실패: HTTP ${res.status}`);
    return true;
  }
  function getFileUrl(key) {
    return `${WORKER_BASE}/file/${encodeURIComponent(key)}`;
  }

  /* ── CRUD ── */

  // Create — 실제 업로드(Worker→R2) 후 메타데이터를 Firebase에 기록
  async function uploadFile(file, meta = {}) {
    const id = _nid();
    const key = `${id}_${file.name}`.replace(/[^\w.\-가-힣]/g, '_'); // R2 키에 안전한 문자만
    let savedToServer = false;
    try {
      await _uploadToWorker(key, file);
      savedToServer = true;
    } catch (e) {
      console.error('[ArchiveDB] Worker 업로드 실패', e);
      throw e; // 업로드 자체가 실패하면 메타데이터도 남기지 않고 그대로 알림
    }
    const rec = {
      id, r2Key: key,
      name: meta.name || file.name,
      originalName: file.name,
      ext: _fileExt(file.name),
      size: file.size,
      mimeType: file.type || '',
      category: meta.category || '기타',
      description: meta.description || '',
      uploadedBy: meta.uploadedBy || '',
      uploadedAt: _now(),
      updatedAt: _now(),
    };
    _list.push(rec);
    _saveLS(); _fire('archive');
    if (typeof FireDB !== 'undefined') {
      await FireDB.set(`${FB_PATH}/${id}`, rec).catch(e => console.warn('[ArchiveDB] 메타데이터 저장 실패', e));
    }
    return { ...rec, savedToServer };
  }

  // Update — 메타데이터만 수정(이름/설명/분류). 파일 자체를 바꾸려면 삭제 후 재업로드.
  async function updateFile(id, patch) {
    const idx = _list.findIndex(x => x.id === id);
    if (idx < 0) return null;
    // ★ undefined 값이 섞이면 Firebase가 저장을 거부해 영원히 재시도만
    //   반복하게 된다 — 합치기 전에 제거(오늘 여러 모듈에서 잡았던 것과 동일 패턴)
    const cleanPatch = {};
    for (const k in patch) { if (patch[k] !== undefined) cleanPatch[k] = patch[k]; }
    const rec = { ..._list[idx], ...cleanPatch, updatedAt: _now() };
    _list[idx] = rec;
    _saveLS(); _fire('archive');
    let savedToServer = false;
    if (typeof FireDB !== 'undefined') {
      savedToServer = await FireDB.set(`${FB_PATH}/${id}`, rec).catch(() => false);
    }
    return { ...rec, savedToServer: savedToServer === true };
  }

  // Delete — R2 파일 삭제 + 메타데이터 삭제
  async function deleteFile(id) {
    const rec = getById(id);
    if (!rec) return { ok: false, error: '파일을 찾을 수 없습니다' };
    try {
      await _deleteFromWorker(rec.r2Key);
    } catch (e) {
      console.error('[ArchiveDB] Worker 삭제 실패', e);
      return { ok: false, error: e.message };
    }
    _list = _list.filter(x => x.id !== id);
    _saveLS(); _fire('archive');
    if (typeof FireDB !== 'undefined') {
      await FireDB.remove(`${FB_PATH}/${id}`).catch(e => console.warn('[ArchiveDB] 메타데이터 삭제 실패', e));
    }
    return { ok: true };
  }

  return {
    init, on, pauseUpdates,
    getAll, getById, getByCategory, getFileUrl,
    uploadFile, updateFile, deleteFile,
    CATEGORIES,
  };
})();
