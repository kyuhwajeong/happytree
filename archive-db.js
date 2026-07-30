/**
 * archive-db.js — 콘텐츠(자료실) 데이터 계층
 * ─────────────────────────────────────────────────────────
 * ★ 하나의 게시물(post)에 여러 파일을 첨부할 수 있다 — files[] 배열.
 *   기존에 파일 1개짜리로 저장된 옛날 게시물도 자동으로 이 구조로
 *   변환해서 읽어들이므로(정규화), 별도 마이그레이션 없이 그대로 호환된다.
 *
 * 파일 "내용물"은 Cloudflare Worker를 거쳐 R2/B2에 저장되고,
 * 게시물 "정보"(제목/분류/설명/첨부파일 목록 등)는 지금까지 이 프로젝트
 * 전체가 써온 것과 동일한 방식으로 Firebase에 저장된다
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

  // ★ 옛날(파일 1개짜리) 게시물을 files[] 구조로 변환 — 하위호환
  function _normalize(rec) {
    if (!rec) return rec;
    if (Array.isArray(rec.files)) return rec;
    if (rec.r2Key) {
      const { r2Key, originalName, ext, size, mimeType, thumbnail, contentText, ...rest } = rec;
      return { ...rest, files: [{ r2Key, originalName, ext, size, mimeType, thumbnail: thumbnail || '', contentText: contentText || '' }] };
    }
    return { ...rec, files: rec.files || [] };
  }
  function _normalizeAll(arr) { return (arr || []).map(_normalize); }

  function _saveLS() { _ls(LS_KEY, _list); }

  async function init() {
    _list = _normalizeAll(_lg(LS_KEY) || []);
    if (typeof FireDB === 'undefined') { console.warn('[ArchiveDB] FireDB 없음 — 초기화 중단'); return; }
    try {
      const data = await FireDB.get(FB_PATH);
      if (data) { _list = _normalizeAll(Object.values(data)); _saveLS(); }
    } catch (e) { console.warn('[ArchiveDB] init', e); }

    FireDB.listen(FB_PATH, v => {
      if (_updatesPaused) return; // 편집 중엔 서버 갱신을 반영하지 않음(입력 내용 보호)
      const nd = _normalizeAll(v ? Object.values(v) : []);
      if (JSON.stringify(nd) !== JSON.stringify(_list)) {
        _list = nd; _saveLS(); _fire('archive');
      }
    });

    // ★ Worker 주소가 아직 예시값 그대로 남아있으면 실제 업로드/미리보기가
    //   전부 실패하므로, 콘솔에서 바로 알아챌 수 있게 눈에 띄게 경고한다.
    if (WORKER_BASE.includes('YOUR-WORKER-NAME') || UPLOAD_TOKEN.includes('여기에')) {
      console.warn('[ArchiveDB] ⚠️ WORKER_BASE 또는 UPLOAD_TOKEN이 아직 예시값입니다 — archive-db.js 상단을 실제 값으로 채워주세요');
    }
    const fileCount = _list.reduce((s, p) => s + (p.files?.length || 0), 0);
    console.log(`[ArchiveDB] ✅ ready, posts: ${_list.length}, files: ${fileCount}, pinned: ${_list.filter(f => f.pinned).length}`);
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

  // ★ 파일 하나를 실제로 업로드하고, files[] 항목 하나를 만들어 반환
  //   (메타 추출 결과가 있으면 같이 담는다 — archive-app.js가 미리 뽑아서 넘겨줌)
  async function _uploadOneFile(postId, file, extra = {}) {
    const key = `${postId}_${_nid()}_${file.name}`.replace(/[^\w.\-가-힣]/g, '_'); // R2 키에 안전한 문자만
    await _uploadToWorker(key, file);
    return {
      r2Key: key,
      originalName: file.name,
      ext: _fileExt(file.name),
      size: file.size,
      mimeType: file.type || '',
      thumbnail: extra.thumbnail || '',
      contentText: extra.contentText || '',
    };
  }

  // Create — 파일 여러 개(files: File[] 또는 FileList)를 한 번에 업로드해서
  //   하나의 게시물로 묶는다. extraPerFile은 archive-app.js가 미리 추출한
  //   {thumbnail, contentText}를 파일 순서대로 넘겨줄 때 쓴다(선택).
  async function createPost(files, meta = {}, extraPerFile = []) {
    const fileArr = Array.from(files || []);
    if (!fileArr.length) throw new Error('파일이 없습니다');
    const id = _nid();
    const uploaded = [];
    let anyFailed = false;
    for (let i = 0; i < fileArr.length; i++) {
      try {
        uploaded.push(await _uploadOneFile(id, fileArr[i], extraPerFile[i] || {}));
      } catch (e) {
        console.error('[ArchiveDB] 파일 업로드 실패:', fileArr[i].name, e);
        anyFailed = true;
      }
    }
    if (!uploaded.length) throw new Error('모든 파일 업로드에 실패했습니다');
    const rec = {
      id,
      name: meta.name || fileArr[0].name,
      category: meta.category || '기타',
      description: meta.description || '',
      uploadedBy: meta.uploadedBy || '',
      files: uploaded,
      uploadedAt: _now(),
      updatedAt: _now(),
    };
    _list.push(rec);
    _saveLS(); _fire('archive');
    let savedToServer = false;
    if (typeof FireDB !== 'undefined') {
      savedToServer = await FireDB.set(`${FB_PATH}/${id}`, rec).catch(() => false);
    }
    return { ...rec, savedToServer: savedToServer === true, partialFailure: anyFailed };
  }

  // ★ 이미 있는 게시물에 파일을 추가로 첨부
  async function addFilesToPost(id, files, extraPerFile = []) {
    const idx = _list.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const fileArr = Array.from(files || []);
    const added = [];
    for (let i = 0; i < fileArr.length; i++) {
      try { added.push(await _uploadOneFile(id, fileArr[i], extraPerFile[i] || {})); }
      catch (e) { console.error('[ArchiveDB] 파일 추가 실패:', fileArr[i].name, e); }
    }
    const rec = { ..._list[idx], files: [..._list[idx].files, ...added], updatedAt: _now() };
    _list[idx] = rec;
    _saveLS(); _fire('archive');
    let savedToServer = false;
    if (typeof FireDB !== 'undefined') {
      savedToServer = await FireDB.set(`${FB_PATH}/${id}`, rec).catch(() => false);
    }
    return { ...rec, savedToServer: savedToServer === true };
  }

  // ★ 게시물에서 파일 하나만 제거(게시물 자체는 남음, 첨부파일이 0개가 되면 게시물도 삭제)
  async function removeFileFromPost(id, r2Key) {
    const idx = _list.findIndex(x => x.id === id);
    if (idx < 0) return { ok: false, error: '게시물을 찾을 수 없습니다' };
    try { await _deleteFromWorker(r2Key); } catch (e) { return { ok: false, error: e.message }; }
    const remaining = _list[idx].files.filter(f => f.r2Key !== r2Key);
    if (!remaining.length) return deletePost(id); // 마지막 파일이었으면 게시물 자체를 삭제
    const rec = { ..._list[idx], files: remaining, updatedAt: _now() };
    _list[idx] = rec;
    _saveLS(); _fire('archive');
    if (typeof FireDB !== 'undefined') {
      await FireDB.set(`${FB_PATH}/${id}`, rec).catch(e => console.warn('[ArchiveDB] 저장 실패', e));
    }
    return { ok: true };
  }

  // ★ 파일 내용을 그대로 덮어쓰기(같은 r2Key) — 예: 엑셀 편집 후 저장
  async function replaceFileContent(postId, r2Key, blob, meta = {}) {
    const idx = _list.findIndex(x => x.id === postId);
    if (idx < 0) return { ok: false, error: '게시물을 찾을 수 없습니다' };
    const fIdx = _list[idx].files.findIndex(f => f.r2Key === r2Key);
    if (fIdx < 0) return { ok: false, error: '파일을 찾을 수 없습니다' };
    try {
      await _uploadToWorker(r2Key, blob);
    } catch (e) {
      return { ok: false, error: e.message };
    }
    const newFiles = _list[idx].files.slice();
    newFiles[fIdx] = { ...newFiles[fIdx], size: blob.size, ...meta };
    const rec = { ..._list[idx], files: newFiles, updatedAt: _now() };
    _list[idx] = rec;
    _saveLS(); _fire('archive');
    if (typeof FireDB !== 'undefined') {
      await FireDB.set(`${FB_PATH}/${postId}`, rec).catch(e => console.warn('[ArchiveDB] 저장 실패', e));
    }
    return { ok: true, post: rec };
  }

  // Update — 메타데이터만 수정(제목/설명/분류/즐겨찾기 등). files[] 직접 수정은 지양.
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

  // Delete — 게시물에 첨부된 모든 파일 삭제 + 메타데이터 삭제
  async function deletePost(id) {
    const rec = getById(id);
    if (!rec) return { ok: false, error: '게시물을 찾을 수 없습니다' };
    for (const f of (rec.files || [])) {
      try { await _deleteFromWorker(f.r2Key); } catch (e) { console.warn('[ArchiveDB] 파일 삭제 실패:', f.originalName, e); }
    }
    _list = _list.filter(x => x.id !== id);
    _saveLS(); _fire('archive');
    if (typeof FireDB !== 'undefined') {
      await FireDB.remove(`${FB_PATH}/${id}`).catch(e => console.warn('[ArchiveDB] 메타데이터 삭제 실패', e));
    }
    return { ok: true };
  }
  const deleteFile = deletePost; // ★ 이전 이름 유지(하위 호환) — 기존 코드가 이 이름으로 호출해도 동작

  return {
    init, on, pauseUpdates,
    getAll, getById, getByCategory, getFileUrl,
    createPost, addFilesToPost, removeFileFromPost, replaceFileContent,
    updateFile, deletePost, deleteFile,
    CATEGORIES,
  };
})();
