/**
 * archive-app.js — 자료실 화면
 * 이미지: <img> 직접 표시 · PDF: <iframe> 직접 표시 · 엑셀: SheetJS로 읽어 표로 표시
 */
const ArchiveApp = (() => {
  const _q = id => document.getElementById(id);
  const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const _fmtSize = b => {
    if (b == null) return '';
    if (b < 1024) return `${b}B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
    return `${(b / 1024 / 1024).toFixed(1)}MB`;
  };
  const _fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; };
  const _ICONS = { pdf:'📕', xlsx:'📗', xls:'📗', csv:'📗', ppt:'📙', pptx:'📙', doc:'📘', docx:'📘',
    png:'🖼️', jpg:'🖼️', jpeg:'🖼️', gif:'🖼️', webp:'🖼️', zip:'🗜️', txt:'📄' };
  const _iconFor = ext => _ICONS[(ext||'').toLowerCase()] || '📄';
  const _isImg = ext => ['png','jpg','jpeg','gif','webp','svg'].includes((ext||'').toLowerCase());
  const _isPdf = ext => (ext||'').toLowerCase() === 'pdf';
  const _isXlsx = ext => ['xlsx','xls'].includes((ext||'').toLowerCase());
  const _isOffice = ext => ['ppt','pptx','doc','docx'].includes((ext||'').toLowerCase());

  let _curCategory = '전체';
  let _cssInjected = false;

  function _css() {
    if (_cssInjected) return; _cssInjected = true;
    const s = document.createElement('style');
    s.textContent = `
.ar-cats{display:flex;gap:6px;overflow-x:auto;padding:10px 14px;scrollbar-width:none;flex-shrink:0}
.ar-cats::-webkit-scrollbar{display:none}
.ar-cat-tab{flex-shrink:0;padding:7px 13px;border-radius:999px;border:1px solid var(--bdr);background:var(--card2);color:var(--tx2);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
.ar-cat-tab.on{background:var(--a);border-color:var(--a);color:#fff}
.ar-body{flex:1;overflow-y:auto;padding:0 14px 90px}
.ar-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.ar-card{background:var(--card);border:1px solid var(--bdr);border-radius:14px;padding:12px;cursor:pointer;transition:transform .1s}
.ar-card:active{transform:scale(.97)}
.ar-card-ico{font-size:30px;margin-bottom:8px}
.ar-card-name{font-size:12.5px;font-weight:700;color:var(--tx);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.35;min-height:34px}
.ar-card-meta{font-size:10px;color:var(--tx3);margin-top:6px;display:flex;justify-content:space-between;gap:4px}
.ar-card-cat{display:inline-block;margin-top:6px;font-size:9.5px;font-weight:700;color:var(--a);background:var(--a10);border-radius:6px;padding:2px 6px}
.ar-empty{text-align:center;padding:60px 20px;color:var(--tx3)}
.ar-empty-ico{font-size:44px;margin-bottom:10px;opacity:.6}
.ar-fab{position:fixed;right:18px;bottom:86px;width:54px;height:54px;border-radius:50%;background:var(--a);color:#fff;
  border:none;font-size:24px;box-shadow:0 6px 18px var(--a40);cursor:pointer;z-index:60;display:flex;align-items:center;justify-content:center}
.ar-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:flex-end;justify-content:center}
@media (min-width:640px){ .ar-ov{align-items:center} }
.ar-sheet{background:var(--card);width:100%;max-width:520px;max-height:88vh;border-radius:20px 20px 0 0;overflow-y:auto;padding:18px}
@media (min-width:640px){ .ar-sheet{border-radius:20px} }
.ar-sheet-title{font-size:15px;font-weight:800;color:var(--tx);margin-bottom:14px}
.ar-field{margin-bottom:12px}
.ar-field label{display:block;font-size:11px;font-weight:700;color:var(--tx3);margin-bottom:5px}
.ar-field input[type=text],.ar-field textarea,.ar-field select{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--bdr);background:var(--surf);color:var(--tx);font-size:13px;font-family:inherit}
.ar-field textarea{resize:vertical;min-height:60px}
.ar-drop{border:2px dashed var(--bdr2);border-radius:12px;padding:22px;text-align:center;color:var(--tx3);font-size:12.5px;cursor:pointer}
.ar-drop.has-file{border-color:var(--a);color:var(--tx);font-weight:700}
.ar-btn-row{display:flex;gap:8px;margin-top:16px}
.ar-btn{flex:1;padding:11px;border-radius:12px;border:none;font-size:13px;font-weight:800;cursor:pointer}
.ar-btn.primary{background:var(--a);color:#fff}
.ar-btn.ghost{background:var(--card2);color:var(--tx2);border:1px solid var(--bdr)}
.ar-btn.danger{background:rgba(239,68,68,.1);color:#ef4444}
.ar-prev-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px}
.ar-prev-name{font-size:14px;font-weight:800;color:var(--tx);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ar-prev-acts{display:flex;gap:6px;flex-shrink:0}
.ar-prev-icobtn{width:32px;height:32px;border-radius:9px;border:1px solid var(--bdr);background:var(--card2);cursor:pointer;font-size:14px}
.ar-prev-body{background:var(--surf2);border-radius:12px;overflow:hidden;min-height:200px;display:flex;align-items:center;justify-content:center}
.ar-prev-body img{max-width:100%;max-height:70vh;display:block}
.ar-prev-body iframe{width:100%;height:70vh;border:none}
.ar-prev-table-wrap{width:100%;max-height:70vh;overflow:auto;padding:8px}
.ar-prev-table{border-collapse:collapse;font-size:11.5px;width:100%}
.ar-prev-table td,.ar-prev-table th{border:1px solid var(--bdr);padding:5px 8px;white-space:nowrap;color:var(--tx)}
.ar-prev-none{padding:40px;text-align:center;color:var(--tx3);font-size:13px}
.ar-desc-view{font-size:12.5px;color:var(--tx2);margin-top:10px;line-height:1.5;white-space:pre-wrap}
.ar-progress{font-size:12px;color:var(--a);text-align:center;margin-top:8px}`;
    document.head.appendChild(s);
  }

  function _shellHtml() {
    const cats = ['전체', ...ArchiveDB.CATEGORIES];
    return `
      <div class="ph">
        <div class="phl"><div class="ph-title">📁 자료실</div></div>
      </div>
      <div class="ar-cats">${cats.map(c => `<button class="ar-cat-tab${c===_curCategory?' on':''}" onclick="ArchiveApp._selectCategory('${c}')">${_esc(c)}</button>`).join('')}</div>
      <div class="ar-body" id="ar-body">${_gridHtml()}</div>
      <button class="ar-fab" onclick="ArchiveApp.openUpload()" title="파일 올리기">＋</button>`;
  }

  function _gridHtml() {
    const items = _curCategory === '전체' ? ArchiveDB.getAll() : ArchiveDB.getByCategory(_curCategory);
    if (!items.length) {
      return `<div class="ar-empty"><div class="ar-empty-ico">🗂️</div>등록된 자료가 없습니다<br>오른쪽 아래 + 버튼으로 올려보세요</div>`;
    }
    return `<div class="ar-grid">${items.map(f => `
      <div class="ar-card" onclick="ArchiveApp.openPreview('${f.id}')">
        <div class="ar-card-ico">${_iconFor(f.ext)}</div>
        <div class="ar-card-name">${_esc(f.name)}</div>
        <div class="ar-card-meta"><span>${_fmtSize(f.size)}</span><span>${_fmtDate(f.uploadedAt)}</span></div>
        <span class="ar-card-cat">${_esc(f.category)}</span>
      </div>`).join('')}</div>`;
  }

  function render() {
    _css();
    const pg = _q('page-archive'); if (!pg) return;
    pg.innerHTML = _shellHtml();
  }
  function _refreshGrid() { const b = _q('ar-body'); if (b) b.innerHTML = _gridHtml(); }
  function _selectCategory(c) { _curCategory = c; render(); }

  /* ═══════════════ 업로드 ═══════════════ */
  let _pickedFile = null;

  function openUpload() {
    _pickedFile = null;
    const ov = document.createElement('div');
    ov.className = 'ar-ov'; ov.id = 'ar-upload-ov';
    ov.innerHTML = `<div class="ar-sheet">
      <div class="ar-sheet-title">📤 자료 올리기</div>
      <div class="ar-field">
        <label>파일 선택</label>
        <div class="ar-drop" id="ar-drop" onclick="document.getElementById('ar-file-inp').click()">파일을 선택하거나 여기를 눌러주세요</div>
        <input type="file" id="ar-file-inp" style="display:none" onchange="ArchiveApp._onPickFile(this.files[0])">
      </div>
      <div class="ar-field"><label>표시할 이름</label><input type="text" id="ar-name-inp" placeholder="예: 2026년 여름방학 안내문"></div>
      <div class="ar-field"><label>분류</label>
        <select id="ar-cat-inp">${ArchiveDB.CATEGORIES.map(c => `<option value="${_esc(c)}">${_esc(c)}</option>`).join('')}</select>
      </div>
      <div class="ar-field"><label>설명 (선택)</label><textarea id="ar-desc-inp" placeholder="메모나 설명을 남겨두면 나중에 찾기 편해요"></textarea></div>
      <div id="ar-upload-progress"></div>
      <div class="ar-btn-row">
        <button class="ar-btn ghost" onclick="ArchiveApp._closeUpload()">취소</button>
        <button class="ar-btn primary" id="ar-upload-submit" onclick="ArchiveApp._submitUpload()">업로드</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.onclick = e => { if (e.target === ov) _closeUpload(); };
  }
  function _closeUpload() { _q('ar-upload-ov')?.remove(); }
  function _onPickFile(file) {
    if (!file) return;
    _pickedFile = file;
    const drop = _q('ar-drop');
    if (drop) { drop.textContent = `✓ ${file.name} (${_fmtSize(file.size)})`; drop.classList.add('has-file'); }
    const nameInp = _q('ar-name-inp');
    if (nameInp && !nameInp.value) nameInp.value = file.name.replace(/\.[^.]+$/, '');
  }
  async function _submitUpload() {
    if (!_pickedFile) { alert('파일을 선택해 주세요'); return; }
    const btn = _q('ar-upload-submit');
    const prog = _q('ar-upload-progress');
    btn.disabled = true; btn.textContent = '업로드 중...';
    if (prog) prog.innerHTML = `<div class="ar-progress">⏳ 업로드하고 있어요...</div>`;
    try {
      const result = await ArchiveDB.uploadFile(_pickedFile, {
        name: _q('ar-name-inp')?.value?.trim() || _pickedFile.name,
        category: _q('ar-cat-inp')?.value || '기타',
        description: _q('ar-desc-inp')?.value?.trim() || '',
        uploadedBy: (typeof DB !== 'undefined' && DB.getSession) ? (DB.getSession()?.name || '') : '',
      });
      _closeUpload();
      _refreshGrid();
      if (typeof App !== 'undefined' && App._toast) App._toast(result.savedToServer ? '✅ 업로드 완료' : '⏳ 업로드됨 · 서버 반영 대기 중');
    } catch (e) {
      btn.disabled = false; btn.textContent = '업로드';
      if (prog) prog.innerHTML = `<div class="ar-progress" style="color:#ef4444">⚠️ 업로드 실패: ${_esc(e.message || '알 수 없는 오류')}</div>`;
    }
  }

  /* ═══════════════ 미리보기 ═══════════════ */
  async function openPreview(id) {
    const f = ArchiveDB.getById(id);
    if (!f) return;
    const ov = document.createElement('div');
    ov.className = 'ar-ov'; ov.id = 'ar-preview-ov';
    ov.innerHTML = `<div class="ar-sheet" style="max-width:680px">
      <div class="ar-prev-hdr">
        <div class="ar-prev-name">${_iconFor(f.ext)} ${_esc(f.name)}</div>
        <div class="ar-prev-acts">
          <button class="ar-prev-icobtn" onclick="ArchiveApp.openEdit('${id}')" title="수정">✏️</button>
          <button class="ar-prev-icobtn" onclick="ArchiveApp._confirmDelete('${id}')" title="삭제">🗑️</button>
          <a class="ar-prev-icobtn" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none" href="${ArchiveDB.getFileUrl(f.r2Key)}" download="${_esc(f.originalName)}" title="다운로드">⬇️</a>
          <button class="ar-prev-icobtn" onclick="document.getElementById('ar-preview-ov').remove()" title="닫기">✕</button>
        </div>
      </div>
      <div class="ar-prev-body" id="ar-prev-body">${_previewLoadingHtml(f)}</div>
      ${f.description ? `<div class="ar-desc-view">${_esc(f.description)}</div>` : ''}
    </div>`;
    document.body.appendChild(ov);
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    _renderPreviewBody(f);
  }
  function _previewLoadingHtml(f) {
    if (_isImg(f.ext) || _isPdf(f.ext) || _isOffice(f.ext)) return '';
    return `<div class="ar-prev-none">⏳ 불러오는 중...</div>`;
  }
  async function _renderPreviewBody(f) {
    const body = _q('ar-prev-body');
    if (!body) return;
    const url = ArchiveDB.getFileUrl(f.r2Key);
    if (_isImg(f.ext)) {
      body.innerHTML = `<img src="${url}" alt="${_esc(f.name)}">`;
      return;
    }
    if (_isPdf(f.ext)) {
      body.innerHTML = `<iframe src="${url}"></iframe>`;
      return;
    }
    // ★ 파워포인트/워드 — 마이크로소프트 무료 온라인 뷰어로 미리보기.
    //   이 뷰어는 파일 주소를 자기네 서버에서 직접 가져가야 해서, 반드시
    //   외부에서 접근 가능한 주소여야 한다(Worker의 GET은 인증 없이 열려있어 조건 충족).
    if (_isOffice(f.ext)) {
      const viewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`;
      body.innerHTML = `<iframe src="${viewerUrl}"></iframe>`;
      return;
    }
    if (_isXlsx(f.ext)) {
      if (typeof XLSX === 'undefined') { body.innerHTML = `<div class="ar-prev-none">엑셀 미리보기 라이브러리를 불러오지 못했습니다</div>`; return; }
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const html = XLSX.utils.sheet_to_html(ws, { editable: false });
        body.innerHTML = `<div class="ar-prev-table-wrap">${html.replace('<table', '<table class="ar-prev-table"')}</div>`;
      } catch (e) {
        body.innerHTML = `<div class="ar-prev-none">⚠️ 미리보기를 불러오지 못했습니다<br><span style="font-size:11px">${_esc(e.message)}</span></div>`;
      }
      return;
    }
    body.innerHTML = `<div class="ar-prev-none">이 형식은 미리보기를 지원하지 않아요<br>다운로드 버튼(⬇️)으로 받아서 확인해 주세요</div>`;
  }

  /* ═══════════════ 수정 ═══════════════ */
  function openEdit(id) {
    const f = ArchiveDB.getById(id);
    if (!f) return;
    ArchiveDB.pauseUpdates(true); // ★ 편집 중엔 서버 갱신이 화면을 덮어쓰지 않도록
    _q('ar-preview-ov')?.remove();
    const ov = document.createElement('div');
    ov.className = 'ar-ov'; ov.id = 'ar-edit-ov';
    ov.innerHTML = `<div class="ar-sheet">
      <div class="ar-sheet-title">✏️ 자료 정보 수정</div>
      <div class="ar-field"><label>표시할 이름</label><input type="text" id="ar-edit-name" value="${_esc(f.name)}"></div>
      <div class="ar-field"><label>분류</label>
        <select id="ar-edit-cat">${ArchiveDB.CATEGORIES.map(c => `<option value="${_esc(c)}"${c===f.category?' selected':''}>${_esc(c)}</option>`).join('')}</select>
      </div>
      <div class="ar-field"><label>설명</label><textarea id="ar-edit-desc">${_esc(f.description||'')}</textarea></div>
      <div class="ar-btn-row">
        <button class="ar-btn ghost" onclick="ArchiveApp._closeEdit()">취소</button>
        <button class="ar-btn primary" onclick="ArchiveApp._submitEdit('${id}')">저장</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.onclick = e => { if (e.target === ov) _closeEdit(); };
  }
  function _closeEdit() { _q('ar-edit-ov')?.remove(); ArchiveDB.pauseUpdates(false); }
  async function _submitEdit(id) {
    const result = await ArchiveDB.updateFile(id, {
      name: _q('ar-edit-name')?.value?.trim(),
      category: _q('ar-edit-cat')?.value,
      description: _q('ar-edit-desc')?.value?.trim(),
    });
    _closeEdit();
    _refreshGrid();
    if (typeof App !== 'undefined' && App._toast) App._toast(result?.savedToServer ? '✅ 수정 완료' : '⏳ 로컬 저장됨 · 서버 전송 대기 중');
  }

  /* ═══════════════ 삭제 ═══════════════ */
  function _confirmDelete(id) {
    const f = ArchiveDB.getById(id);
    if (!f) return;
    if (!confirm(`"${f.name}"을(를) 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
    _deleteNow(id);
  }
  async function _deleteNow(id) {
    _q('ar-preview-ov')?.remove();
    const result = await ArchiveDB.deleteFile(id);
    _refreshGrid();
    if (typeof App !== 'undefined' && App._toast) {
      App._toast(result.ok ? '🗑️ 삭제되었습니다' : `⚠️ 삭제 실패: ${result.error || ''}`);
    }
  }

  async function init() {
    if (typeof ArchiveDB === 'undefined') return;
    await ArchiveDB.init();
    // ★ 다른 기기에서 자료가 추가/삭제되면, 지금 자료실 화면을 보고 있을 때만 새로고침
    ArchiveDB.on('archive', () => { if (_q('page-archive')?.classList.contains('on')) _refreshGrid(); });
  }

  return {
    init, render, _selectCategory,
    openUpload, _closeUpload, _onPickFile, _submitUpload,
    openPreview, openEdit, _closeEdit, _submitEdit,
    _confirmDelete,
  };
})();
