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

  const DEFAULT_CATEGORIES = ['공지/양식', '학사자료', '교재자료', '행정서류', '기타'];
  const LS_CATS = 'hk10b_archiveCategories';
  const FB_CATS_PATH = 'hakwon10/archiveCategories';
  const PROTECTED_CATEGORY = '기타'; // ★ 마지막 안전망 — 삭제 시 갈 곳이 없어지지 않도록 이 하나는 항상 남겨둠
  let _categories = _lg(LS_CATS) || DEFAULT_CATEGORIES.slice();

  function getCategories() { return _categories.slice(); }
  async function addCategory(name) {
    name = (name || '').trim();
    if (!name || _categories.includes(name)) return _categories.slice();
    _categories.push(name);
    _ls(LS_CATS, _categories);
    if (typeof FireDB !== 'undefined') await FireDB.set(FB_CATS_PATH, _categories).catch(() => {});
    _fire('categories');
    return _categories.slice();
  }
  // ★ 분류를 지우면, 그 분류를 쓰던 게시물들은 자동으로 "기타"로 옮겨진다
  //   (분류가 없어져서 화면에서 아예 안 보이게 되는 걸 방지)
  async function removeCategory(name) {
    if (name === PROTECTED_CATEGORY) return { ok: false, error: `"${PROTECTED_CATEGORY}"는 삭제할 수 없습니다` };
    if (!_categories.includes(name)) return { ok: false, error: '없는 분류입니다' };
    const affected = _list.filter(p => p.category === name);
    for (const p of affected) {
      await updateFile(p.id, { category: PROTECTED_CATEGORY });
    }
    _categories = _categories.filter(c => c !== name);
    _ls(LS_CATS, _categories);
    if (typeof FireDB !== 'undefined') await FireDB.set(FB_CATS_PATH, _categories).catch(() => {});
    _fire('categories');
    return { ok: true, movedCount: affected.length };
  }

  // ★ 옛날(파일 1개짜리) 게시물을 files[] 구조로 변환 — 하위호환
  function _normalize(rec) {
    if (!rec) return rec;
    let out = rec;
    if (!Array.isArray(rec.files)) {
      if (rec.r2Key) {
        const { r2Key, originalName, ext, size, mimeType, thumbnail, contentText, ...rest } = rec;
        out = { ...rest, files: [{ r2Key, originalName, ext, size, mimeType, thumbnail: thumbnail || '', contentText: contentText || '' }] };
      } else {
        out = { ...rec, files: rec.files || [] };
      }
    }
    // ★ 이 기능(비밀번호/공개설정) 이전에 만들어진 게시물엔 기본값을 채워준다
    if (out.password === undefined) out = { ...out, password: '' };
    if (out.visibility === undefined) out = { ...out, visibility: 'public' };
    return out;
  }
  function _normalizeAll(arr) { return (arr || []).map(_normalize); }

  function _saveLS() { _ls(LS_KEY, _list); }

  async function init() {
    _list = _normalizeAll(_lg(LS_KEY) || []);
    if (typeof FireDB === 'undefined') { console.warn('[ArchiveDB] FireDB 없음 — 초기화 중단'); return; }
    try {
      const data = await FireDB.get(FB_PATH);
      if (data) { _list = _normalizeAll(Object.values(data)); _saveLS(); }
      const catData = await FireDB.get(FB_CATS_PATH);
      if (Array.isArray(catData) && catData.length) { _categories = catData; _ls(LS_CATS, _categories); }
    } catch (e) { console.warn('[ArchiveDB] init', e); }

    FireDB.listen(FB_PATH, v => {
      if (_updatesPaused) return; // 편집 중엔 서버 갱신을 반영하지 않음(입력 내용 보호)
      const nd = _normalizeAll(v ? Object.values(v) : []);
      if (JSON.stringify(nd) !== JSON.stringify(_list)) {
        _list = nd; _saveLS(); _fire('archive');
      }
    });
    FireDB.listen(FB_CATS_PATH, v => {
      if (Array.isArray(v) && JSON.stringify(v) !== JSON.stringify(_categories)) {
        _categories = v; _ls(LS_CATS, _categories); _fire('categories');
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
  // ★ 이 게시물 하나만 서버에서 강제로 다시 확인(캐시 무시) — 다른 기기에서
  //   바뀐 내용이 실시간 리스너로 놓쳤을 경우를 대비한 보정용
  async function refreshPost(id) {
    if (typeof FireDB === 'undefined' || !FireDB.getFromServer) return getById(id);
    // ★ 지금 오프라인 상태면 서버에 물어봐도 어차피 시간만 끌고 캐시값이
    //   돌아온다 — 굳이 기다리게 하지 말고 바로 로컬 캐시로 보여준다.
    //   (연결 끊긴 동안 게시물을 열면 느려지거나 멈춘 것처럼 보이던 문제)
    if (typeof FireDB.isConnected === 'function' && !FireDB.isConnected()) {
      console.warn('[ArchiveDB] refreshPost: 오프라인 — 로컬 캐시로 표시');
      return getById(id);
    }
    try {
      const fresh = await FireDB.getFromServer(`${FB_PATH}/${id}`);
      const idx = _list.findIndex(x => x.id === id);
      if (!fresh) {
        // ★ 서버에 아예 없다(다른 기기에서 삭제됨) — 로컬에도 반영해서 정리
        if (idx >= 0) { _list.splice(idx, 1); _saveLS(); _fire('archive'); }
        return null;
      }
      const norm = _normalize(fresh);
      if (idx >= 0) _list[idx] = norm; else _list.push(norm);
      _saveLS();
      return norm;
    } catch (e) {
      console.warn('[ArchiveDB] refreshPost 실패', e);
      return getById(id);
    }
  }
  function getByCategory(cat) { return getAll().filter(x => x.category === cat); }

  /* ── 권한(작성자/공개설정/비밀번호) ── */
  function _currentUsername() {
    return (typeof DB !== 'undefined' && DB.getSession) ? (DB.getSession()?.username || '') : '';
  }
  function _isCurrentAdmin() {
    return typeof DB !== 'undefined' && DB.isAdmin && DB.isAdmin();
  }
  function isOwner(post) {
    const u = _currentUsername();
    return !!u && post?.uploadedBy === u;
  }
  // ★ admin은 전부 다 보임(비공개 포함). 그 외 계정은 "공개"이거나
  //   "내가 올린 것"만 보인다 — 남이 올린 비공개 글은 목록에서부터 안 보임.
  function getVisiblePosts() {
    if (_isCurrentAdmin()) return getAll();
    return getAll().filter(p => p.visibility !== 'private' || isOwner(p));
  }
  // ★ 비밀번호는 "목록에 보이느냐"와는 별개 — 목록엔 보이되, 실제로
  //   열람하려면 admin이거나 본인이거나 비밀번호를 맞혀야 한다.
  function canOpenWithoutPassword(post) {
    return _isCurrentAdmin() || isOwner(post) || !post?.password;
  }
  function checkPassword(post, input) {
    return post?.password && input === post.password;
  }

  /* ── Worker 통신 ── */
  function _fileExt(name) {
    const m = (name || '').match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : '';
  }
  // ★ v2: Worker가 파일을 직접 받아 중계하던 방식(95MB 근처에서 실패하던 원인 —
  //   Cloudflare Workers 자체의 메모리 한도)에서, "Worker는 임시 서명 URL만
  //   발급하고 브라우저가 B2로 직접 업로드"하는 방식으로 바꿨다. Worker를 거치지
  //   않으니 그 메모리 한도가 아예 적용되지 않는다 — 이제 B2 자체 한도(약 5GB)가 기준.
  const MAX_UPLOAD_MB = 2000;

  function _uploadToWorker(key, file, onProgress) {
    return new Promise((resolve, reject) => {
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > MAX_UPLOAD_MB) {
        reject(new Error(`업로드 실패: 파일이 너무 큽니다 (${sizeMB.toFixed(0)}MB). ${MAX_UPLOAD_MB}MB 이하로 압축하거나 나눠서 올려주세요.`));
        return;
      }
      (async () => {
        try {
          // 1) Worker에서 이 파일 전용 임시 업로드 주소(presigned URL)를 받는다
          const presignRes = await fetch(`${WORKER_BASE}/presign/${encodeURIComponent(key)}`, {
            headers: { 'Authorization': `Bearer ${UPLOAD_TOKEN}` },
          });
          if (!presignRes.ok) { reject(new Error(`업로드 준비 실패: HTTP ${presignRes.status}`)); return; }
          const presignData = await presignRes.json();
          if (!presignData?.uploadUrl) { reject(new Error('업로드 준비 실패: 서명 URL을 받지 못했습니다')); return; }

          // 2) 그 주소로 파일을 B2에 직접 전송 — Worker를 거치지 않아 용량 제한이 없다
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', presignData.uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          if (onProgress) xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
          xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(true); else reject(new Error(`업로드 실패: HTTP ${xhr.status}`)); };
          xhr.onerror = () => reject(new Error('업로드 실패: 네트워크 오류(연결이 불안정하면 발생할 수 있습니다)'));
          xhr.ontimeout = () => reject(new Error('업로드 실패: 응답 시간 초과'));
          xhr.timeout = 15 * 60 * 1000; // 15분 — 대용량 파일 고려해 넉넉하게
          xhr.send(file);
        } catch (e) {
          reject(new Error(`업로드 준비 실패: ${e.message || String(e)}`));
        }
      })();
    });
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
  async function _uploadOneFile(postId, file, extra = {}, onProgress) {
    const key = `${postId}_${_nid()}_${file.name}`.replace(/[^\w.\-가-힣]/g, '_'); // R2 키에 안전한 문자만
    await _uploadToWorker(key, file, onProgress);
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
  //   onFileProgress(fileIndex, ratio)는 각 파일 업로드 진행률(0~1)을 알려준다.
  async function createPost(files, meta = {}, extraPerFile = [], onFileProgress) {
    const fileArr = Array.from(files || []);
    if (!fileArr.length) throw new Error('파일이 없습니다');
    const id = _nid();
    const uploaded = [];
    const failReasons = [];
    let anyFailed = false;
    for (let i = 0; i < fileArr.length; i++) {
      try {
        uploaded.push(await _uploadOneFile(id, fileArr[i], extraPerFile[i] || {}, ratio => onFileProgress?.(i, ratio)));
      } catch (e) {
        console.error('[ArchiveDB] 파일 업로드 실패:', fileArr[i].name, e);
        anyFailed = true;
        failReasons.push(`${fileArr[i].name}: ${e.message || '알 수 없는 오류'}`);
      }
    }
    if (!uploaded.length) throw new Error(failReasons[0] || '모든 파일 업로드에 실패했습니다');
    const rec = {
      id,
      name: meta.name || fileArr[0].name,
      category: meta.category || '기타',
      description: meta.description || '',
      uploadedBy: meta.uploadedBy || '',
      password: meta.password || '', // ★ 빈 문자열 = 비밀번호 없음
      visibility: meta.visibility === 'private' ? 'private' : 'public', // ★ 기본은 공개
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

  // ★ 파일을 올리는 대신, 온라인 문서(OneDrive·구글시트 등) 링크를 등록한다.
  //   실제 파일을 우리 저장소에 두지 않고 링크만 저장 — 열람 시 그 서비스의
  //   웹 편집기를 그대로 띄워서, 우리가 어설픈 뷰어/에디터를 직접 만드는
  //   대신 MS·구글이 이미 잘 만들어둔 걸 그대로 활용한다.
  function _linkFileEntry(url, title, linkType) {
    return {
      r2Key: `link_${_nid()}`, // ★ files[] 안에서 항목을 구분하는 용도로만 씀(실제 저장소 키 아님)
      originalName: title || url,
      ext: 'link',
      size: 0,
      mimeType: 'application/vnd.online-link',
      linkUrl: url,
      linkType: linkType || 'other',
      thumbnail: '', contentText: '',
    };
  }
  async function createLinkPost(meta = {}) {
    if (!meta.linkUrl) throw new Error('링크 주소가 없습니다');
    const id = _nid();
    const fileEntry = _linkFileEntry(meta.linkUrl, meta.linkTitle, meta.linkType);
    const rec = {
      id,
      name: meta.name || meta.linkTitle || '온라인 문서',
      category: meta.category || '기타',
      description: meta.description || '',
      uploadedBy: meta.uploadedBy || '',
      password: meta.password || '',
      visibility: meta.visibility === 'private' ? 'private' : 'public',
      files: [fileEntry],
      uploadedAt: _now(),
      updatedAt: _now(),
    };
    _list.push(rec);
    _saveLS(); _fire('archive');
    let savedToServer = false;
    if (typeof FireDB !== 'undefined') {
      savedToServer = await FireDB.set(`${FB_PATH}/${id}`, rec).catch(() => false);
    }
    return { ...rec, savedToServer: savedToServer === true };
  }
  async function addLinkToPost(id, url, title, linkType) {
    const idx = _list.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const fileEntry = _linkFileEntry(url, title, linkType);
    const rec = { ..._list[idx], files: [..._list[idx].files, fileEntry], updatedAt: _now() };
    _list[idx] = rec;
    _saveLS(); _fire('archive');
    if (typeof FireDB !== 'undefined') {
      await FireDB.set(`${FB_PATH}/${id}`, rec).catch(e => console.warn('[ArchiveDB] 저장 실패', e));
    }
    return rec;
  }

  // ★ 이미 있는 게시물에 파일을 추가로 첨부
  async function addFilesToPost(id, files, extraPerFile = [], onFileProgress) {
    const idx = _list.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const fileArr = Array.from(files || []);
    const added = [];
    for (let i = 0; i < fileArr.length; i++) {
      try { added.push(await _uploadOneFile(id, fileArr[i], extraPerFile[i] || {}, ratio => onFileProgress?.(i, ratio))); }
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
    const target = _list[idx].files.find(f => f.r2Key === r2Key);
    if (target && !target.linkUrl) { // ★ 링크 항목은 실제 저장된 파일이 없어 삭제 요청을 보낼 필요 없음
      try { await _deleteFromWorker(r2Key); } catch (e) { return { ok: false, error: e.message }; }
    }
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
      if (f.linkUrl) continue; // ★ 링크 항목은 실제 저장된 파일이 없음
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
    getAll, getById, refreshPost, getByCategory, getFileUrl,
    getVisiblePosts, isOwner, canOpenWithoutPassword, checkPassword,
    createPost, addFilesToPost, removeFileFromPost, replaceFileContent, createLinkPost, addLinkToPost,
    updateFile, deletePost, deleteFile,
    getCategories, addCategory, removeCategory,
    MAX_UPLOAD_MB,
  };
})();
