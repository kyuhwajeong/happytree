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
  // ★ 게시물(post)은 files[] 배열을 갖는다 — 대표 파일(첫 번째)과 전체 용량 헬퍼
  const _primaryFile = p => (p.files && p.files[0]) || {};
  const _postSize = p => (p.files || []).reduce((s, f) => s + (f.size || 0), 0);
  const _ICONS = { pdf:'📕', xlsx:'📗', xls:'📗', csv:'📗', ppt:'📙', pptx:'📙', doc:'📘', docx:'📘',
    hwp:'📃', hwpx:'📃',
    png:'🖼️', jpg:'🖼️', jpeg:'🖼️', gif:'🖼️', webp:'🖼️', zip:'🗜️', txt:'📄',
    mp4:'🎬', avi:'🎬', mov:'🎬', mkv:'🎬', webm:'🎬', wmv:'🎬',
    mp3:'🎵', wav:'🎵', m4a:'🎵', ogg:'🎵', aac:'🎵', flac:'🎵' };
  const _iconFor = ext => _ICONS[(ext||'').toLowerCase()] || '📄';
  const _isImg = ext => ['png','jpg','jpeg','gif','webp','svg'].includes((ext||'').toLowerCase());
  const _isPdf = ext => (ext||'').toLowerCase() === 'pdf';
  const _isXlsx = ext => ['xlsx','xls'].includes((ext||'').toLowerCase());
  const _isOffice = ext => ['ppt','pptx','doc','docx'].includes((ext||'').toLowerCase());
  const _isVideo = ext => ['mp4','avi','mov','mkv','webm','wmv','m4v'].includes((ext||'').toLowerCase());
  const _isAudio = ext => ['mp3','wav','m4a','ogg','aac','flac'].includes((ext||'').toLowerCase());
  const _isHwp = ext => ['hwp','hwpx'].includes((ext||'').toLowerCase());
  const _isCsv = ext => (ext||'').toLowerCase() === 'csv';

  let _curCategory = '전체';
  let _cssInjected = false;

  function _css() {
    if (_cssInjected) return; _cssInjected = true;
    const s = document.createElement('style');
    s.textContent = `
.ar-view-toggle{display:flex;border:1px solid var(--bdr);border-radius:10px;overflow:hidden;margin-right:2px}
.ar-view-toggle button{width:30px;height:30px;border:none;background:var(--card2);color:var(--tx3);font-size:14px;cursor:pointer}
.ar-view-toggle button.on{background:var(--a);color:#fff}
.ar-list{display:flex;flex-direction:column;gap:8px}
.ar-lrow{display:flex;align-items:flex-start;gap:10px;background:var(--card);border:1px solid var(--bdr);border-radius:12px;padding:10px 12px;cursor:pointer}
.ar-lrow.selected{border-color:var(--a);background:var(--a10)}
.ar-lrow-ico{font-size:22px;flex-shrink:0;margin-top:1px}
.ar-lrow-thumb{width:34px;height:34px;object-fit:cover;border-radius:7px;border:1px solid var(--bdr);flex-shrink:0}
.ar-lrow-check{font-size:16px;flex-shrink:0;margin-top:1px}
.ar-lrow-body{flex:1;min-width:0}
.ar-lrow-top{display:flex;align-items:center;gap:8px}
.ar-lrow-name{font-size:12.5px;font-weight:700;color:var(--tx);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ar-lrow-desc{font-size:11px;color:var(--tx2);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ar-lrow-meta{font-size:10px;color:var(--tx3);margin-top:4px}
.ar-storage-footer{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--bdr);
  padding:10px 14px calc(10px + env(safe-area-inset-bottom));z-index:55}
.ar-storage{margin:0}
.ar-storage-bar{height:6px;border-radius:4px;background:var(--card2);overflow:hidden}
.ar-storage-fill{height:100%;background:var(--a);border-radius:4px;transition:width .3s}
.ar-storage.warn .ar-storage-fill{background:#f59e0b}
.ar-storage.over .ar-storage-fill{background:#ef4444}
.ar-storage-text{font-size:10.5px;color:var(--tx3);margin-top:4px}
.ar-storage.warn .ar-storage-text{color:#f59e0b;font-weight:700}
.ar-storage.over .ar-storage-text{color:#ef4444;font-weight:700}
.ar-card-check{position:absolute;top:8px;left:8px;font-size:16px;line-height:1;z-index:1}
.ar-card.selected{border-color:var(--a);background:var(--a10)}
.ar-select-bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--bdr);
  padding:10px 14px calc(10px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:8px;z-index:60;box-shadow:0 -4px 16px rgba(0,0,0,.08)}
.ar-select-count{font-size:12px;font-weight:700;color:var(--tx2);flex:1}
.ar-select-bar .ar-btn{padding:9px 14px;font-size:12.5px}
.ar-tool-tabs-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 14px 0;border-bottom:1px solid var(--bdr)}
.ar-tool-tabs{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}
.ar-tool-tabs::-webkit-scrollbar{display:none}
.ar-tool-tab{flex-shrink:0;padding:8px 14px;border-radius:10px 10px 0 0;border:none;background:transparent;color:var(--tx3);font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-1px}
.ar-tool-tab.on{color:var(--a);border-bottom-color:var(--a)}
.ar-tool-tabs-actions{display:flex;align-items:center;gap:8px;flex-shrink:0;padding-bottom:8px}
.ar-tool-body{flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;padding-top:10px}
.ar-search-wrap{position:relative;margin:0 14px 10px}
.ar-search-inp{width:100%;box-sizing:border-box;padding:9px 34px 9px 12px;border-radius:12px;border:1px solid var(--bdr);background:var(--card2);color:var(--tx);font-size:12.5px;font-family:inherit}
.ar-search-clear{position:absolute;right:8px;top:50%;transform:translateY(-50%);border:none;background:transparent;color:var(--tx3);font-size:13px;cursor:pointer;padding:4px}
.ar-cats{display:flex;gap:6px;overflow-x:auto;padding:0 14px 10px;scrollbar-width:none;flex-shrink:0}
.ar-cats::-webkit-scrollbar{display:none}
.ar-cat-tab{flex-shrink:0;padding:7px 13px;border-radius:999px;border:1px solid var(--bdr);background:var(--card2);color:var(--tx2);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
.ar-cat-tab.on{background:var(--a);border-color:var(--a);color:#fff}
.ar-body{flex:1;overflow-y:auto;padding:0 14px 150px}
.ar-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.ar-card{background:var(--card);border:1px solid var(--bdr);border-radius:14px;padding:12px;cursor:pointer;transition:transform .1s;position:relative}
.ar-card:active{transform:scale(.97)}
.ar-card-pin{position:absolute;top:8px;right:8px;border:none;background:transparent;font-size:16px;cursor:pointer;line-height:1;padding:2px;opacity:.5}
.ar-card-pin.on{opacity:1}
.ar-card-ico{font-size:30px;margin-bottom:8px}
.ar-card-thumb{width:100%;aspect-ratio:1;object-fit:cover;border-radius:9px;margin-bottom:8px;background:var(--surf2);display:block}
.ar-card-name{font-size:12.5px;font-weight:700;color:var(--tx);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.35;min-height:34px}
.ar-card-meta{font-size:10px;color:var(--tx3);margin-top:6px;display:flex;justify-content:space-between;gap:4px}
.ar-card-cat{display:inline-block;margin-top:6px;font-size:9.5px;font-weight:700;color:var(--a);background:var(--a10);border-radius:6px;padding:2px 6px}
.ar-empty{text-align:center;padding:60px 20px;color:var(--tx3)}
.ar-empty-ico{font-size:44px;margin-bottom:10px;opacity:.6}
.ar-fab{position:fixed;right:18px;bottom:150px;width:54px;height:54px;border-radius:50%;background:var(--a);color:#fff;
  border:none;font-size:24px;box-shadow:0 6px 18px var(--a40);cursor:pointer;z-index:60;display:flex;align-items:center;justify-content:center}
.ar-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:flex-end;justify-content:center}
@media (min-width:640px){ .ar-ov{align-items:center} }
.ar-sheet{background:var(--card);width:100%;max-width:520px;max-height:88vh;border-radius:20px 20px 0 0;overflow-y:auto;padding:18px}
@media (min-width:640px){ .ar-sheet{border-radius:20px} }
.ar-prev-sheet.fullscreen{max-width:98vw!important;width:98vw;max-height:96vh;height:96vh;display:flex;flex-direction:column}
.ar-prev-sheet.fullscreen .ar-prev-body{flex:1;height:auto}
.ar-prev-sheet.fullscreen .ar-prev-body iframe,.ar-prev-sheet.fullscreen .ar-prev-body img,.ar-prev-sheet.fullscreen .ar-prev-body video{max-height:none;height:100%}
.ar-prev-sheet.fullscreen .ar-prev-table-wrap{max-height:none;height:100%}
.ar-sheet-title{font-size:15px;font-weight:800;color:var(--tx);margin-bottom:14px}
.ar-field{margin-bottom:12px}
.ar-field label{display:block;font-size:11px;font-weight:700;color:var(--tx3);margin-bottom:5px}
.ar-field input[type=text],.ar-field textarea,.ar-field select{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--bdr);background:var(--surf);color:var(--tx);font-size:13px;font-family:inherit}
.ar-field textarea{resize:vertical;min-height:60px}
.ar-drop{border:2px dashed var(--bdr2);border-radius:12px;padding:22px;text-align:center;color:var(--tx3);font-size:12.5px;cursor:pointer;transition:all .12s}
.ar-drop.has-file{border-color:var(--a);color:var(--tx);font-weight:700}
.ar-drop.dragover{border-color:var(--a);background:var(--a10);color:var(--a);font-weight:700}
.ar-btn-row{display:flex;gap:8px;margin-top:16px}
.ar-btn{flex:1;padding:11px;border-radius:12px;border:none;font-size:13px;font-weight:800;cursor:pointer}
.ar-btn.primary{background:var(--a);color:#fff}
.ar-btn.ghost{background:var(--card2);color:var(--tx2);border:1px solid var(--bdr)}
.ar-btn.danger{background:rgba(239,68,68,.1);color:#ef4444}
.ar-prev-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px}
.ar-prev-name{font-size:14px;font-weight:800;color:var(--tx);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ar-prev-date{font-size:10.5px;color:var(--tx3);margin-bottom:10px}
.ar-prev-acts{display:flex;gap:6px;flex-shrink:0}
.ar-prev-icobtn{width:32px;height:32px;border-radius:9px;border:1px solid var(--bdr);background:var(--card2);cursor:pointer;font-size:14px}
.ar-conv-wrap{position:relative}
.ar-conv-menu{position:absolute;top:38px;right:0;background:var(--card);border:1px solid var(--bdr);border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.15);padding:4px;z-index:10;min-width:110px}
.ar-conv-menu.hidden{display:none}
.ar-conv-menu button{display:block;width:100%;text-align:left;padding:8px 10px;border:none;background:transparent;color:var(--tx);font-size:12px;border-radius:7px;cursor:pointer}
.ar-conv-menu button:hover{background:var(--card2)}
.ar-hwp-wrap{width:100%;overflow-y:auto;max-height:70vh;padding:10px;display:flex;flex-direction:column;gap:10px;align-items:center;background:#f0f0f0}
.ar-hwp-page{background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.15);max-width:100%}
.ar-hwp-page svg{max-width:100%;height:auto;display:block}
.ar-prev-body{background:var(--surf2);border-radius:12px;overflow:hidden;min-height:200px;display:flex;align-items:center;justify-content:center}
.ar-prev-body img{max-width:100%;max-height:70vh;display:block}
.ar-prev-body iframe{width:100%;height:70vh;border:none}
.ar-prev-table-wrap{width:100%;max-height:70vh;overflow:auto;padding:8px}
.ar-prev-table{border-collapse:collapse;font-size:11.5px;width:100%}
.ar-prev-table td,.ar-prev-table th{border:1px solid var(--bdr);padding:5px 8px;white-space:nowrap;color:var(--tx)}
.ar-prev-none{padding:40px;text-align:center;color:var(--tx3);font-size:13px}
.ar-desc-view{font-size:12.5px;color:var(--tx2);margin-top:10px;line-height:1.5;white-space:pre-wrap}
.ar-card-multi{position:absolute;bottom:8px;right:8px;background:var(--a);color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:999px;z-index:1}
.ar-lrow-multi{font-size:9.5px;font-weight:700;color:var(--a);background:var(--a10);border-radius:6px;padding:1px 5px;margin-left:4px}
.ar-file-switch{display:flex;flex-wrap:wrap;gap:6px;padding-bottom:8px;margin-bottom:6px;border-bottom:1px solid var(--bdr)}
.ar-file-switch-single{margin-bottom:6px}
.ar-file-tab{flex-shrink:0;padding:6px 11px;border-radius:999px;border:1px solid var(--bdr);background:var(--card2);color:var(--tx2);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis}
.ar-file-tab.on{background:var(--a);border-color:var(--a);color:#fff}
.ar-file-tab.add{border-style:dashed;color:var(--a)}
.ar-file-tab-wrap{display:inline-flex;align-items:center;gap:4px;flex-shrink:0}
.ar-file-tab-wrap input{width:14px;height:14px;cursor:pointer;flex-shrink:0}
.ar-file-select-bar{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.ar-file-select-count{font-size:11px;font-weight:700;color:var(--tx2);flex:1}
.ar-picked-list{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.ar-picked-item{display:flex;align-items:center;gap:8px;background:var(--surf2);border-radius:9px;padding:7px 10px;font-size:11.5px}
.ar-picked-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tx)}
.ar-picked-size{color:var(--tx3);font-size:10.5px;flex-shrink:0}
.ar-picked-item button{border:none;background:transparent;color:var(--tx3);cursor:pointer;font-size:13px;flex-shrink:0;padding:2px 4px}
.ar-picked-item button:hover{color:#ef4444}
.ar-progress{font-size:12px;color:var(--a);text-align:center;margin-top:8px}`;
    document.head.appendChild(s);
  }

  let _searchQuery = '';
  let _selectMode = false;
  let _selectedIds = new Set();
  const STORAGE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // ★ Backblaze B2 무료 한도 10GB 기준
  const LS_VIEW_MODE = 'hk10b_archiveViewMode';
  let _viewMode = (() => { try { const v = localStorage.getItem(LS_VIEW_MODE); return (v === 'list' || v === 'grid') ? v : 'grid'; } catch { return 'grid'; } })();
  function _setViewMode(m) {
    _viewMode = m;
    try { localStorage.setItem(LS_VIEW_MODE, m); } catch (e) {}
    render();
  }

  function _storageUsageHtml() {
    const totalBytes = ArchiveDB.getAll().reduce((s, p) => s + _postSize(p), 0);
    const pct = Math.min(100, (totalBytes / STORAGE_LIMIT_BYTES) * 100);
    const over = totalBytes >= STORAGE_LIMIT_BYTES, warn = pct >= 80;
    return `<div class="ar-storage${over ? ' over' : warn ? ' warn' : ''}">
      <div class="ar-storage-bar"><div class="ar-storage-fill" style="width:${pct}%"></div></div>
      <div class="ar-storage-text">${_fmtSize(totalBytes)} / 10GB 사용 중${over ? ' · ⚠️ 무료 한도를 초과했어요, 확인이 필요합니다' : warn ? ' · ⚠️ 한도에 가까워지고 있어요' : ''}</div>
    </div>`;
  }

  // ★ 자료실을 여러 도구를 담는 허브로 확장 — 새 도구가 생기면 이 배열에
  //   한 줄만 추가하면 된다(예: PDF 병합/분할, 포맷 뷰어·편집기 등).
  //   각 도구는 mount(containerId)만 구현하면 이 구조에 바로 편입된다.
  const TOOL_TABS = [
    { key: 'files',           ico: '📁', lbl: '파일',        mount: (cid) => { const el = _q(cid); if (el) el.innerHTML = _filesTabHtml(); } },
    { key: 'video-worksheet', ico: '🎬', lbl: '영상 워크시트', mount: (cid) => { if (typeof EduVideoApp !== 'undefined') EduVideoApp.render(cid); } },
  ];
  let _activeTool = 'files';
  function _selectTool(key) { _activeTool = key; render(); }

  function _shellHtml() {
    return `
      <div class="ph">
        <div class="phl"><div class="ph-title">📁 콘텐츠</div></div>
      </div>
      <div class="ar-tool-tabs-row">
        <div class="ar-tool-tabs">${TOOL_TABS.map(t => `<button class="ar-tool-tab${_activeTool===t.key?' on':''}" onclick="ArchiveApp._selectTool('${t.key}')">${t.ico} ${t.lbl}</button>`).join('')}</div>
        ${_activeTool === 'files' ? `<div class="ar-tool-tabs-actions">
          <div class="ar-view-toggle">
            <button class="${_viewMode==='grid'?'on':''}" onclick="ArchiveApp._setViewMode('grid')" title="그리드로 보기">▦</button>
            <button class="${_viewMode==='list'?'on':''}" onclick="ArchiveApp._setViewMode('list')" title="리스트로 보기">☰</button>
          </div>
          <button class="db-mini-btn${_selectMode ? '' : ' ghost'}" onclick="ArchiveApp._toggleSelectMode()">${_selectMode ? '✕ 선택 취소' : '☑️ 선택'}</button>
        </div>` : ''}
      </div>
      <div class="ar-tool-body" id="ar-tool-body"></div>`;
  }

  function _filesTabHtml() {
    const cats = ['전체', ...ArchiveDB.CATEGORIES];
    return `
      <div class="ar-search-wrap">
        <input type="text" id="ar-search-inp" class="ar-search-inp" placeholder="🔍 파일명, 설명, 문서 내용으로 검색..."
          value="${_esc(_searchQuery)}" oninput="ArchiveApp._onSearchInput(this.value)">
        ${_searchQuery ? `<button class="ar-search-clear" onclick="ArchiveApp._onSearchInput('')">✕</button>` : ''}
      </div>
      <div class="ar-cats">${cats.map(c => `<button class="ar-cat-tab${c===_curCategory?' on':''}" onclick="ArchiveApp._selectCategory('${c}')">${_esc(c)}</button>`).join('')}</div>
      <div class="ar-body" id="ar-body">${_gridHtml()}</div>
      ${_selectMode ? _selectBarHtml() : `<div class="ar-storage-footer">${_storageUsageHtml()}</div><button class="ar-fab" onclick="ArchiveApp.openUpload()" title="파일 올리기">＋</button>`}`;
  }

  function _selectBarHtml() {
    return `<div class="ar-select-bar" id="ar-select-bar">
      <span class="ar-select-count">${_selectedIds.size}개 선택됨</span>
      <button class="ar-btn ghost" style="flex:0" onclick="ArchiveApp._selectAllVisible()">전체선택</button>
      <button class="ar-btn primary" style="flex:0" onclick="ArchiveApp._downloadSelectedZip()" ${_selectedIds.size ? '' : 'disabled'}>⬇️ ZIP으로 백업</button>
    </div>`;
  }
  function _refreshSelectBar() {
    const bar = _q('ar-select-bar');
    if (bar) bar.outerHTML = _selectBarHtml();
  }
  function _toggleSelectMode() {
    _selectMode = !_selectMode;
    if (!_selectMode) _selectedIds.clear();
    render();
  }
  function _toggleSelect(id) {
    if (_selectedIds.has(id)) _selectedIds.delete(id); else _selectedIds.add(id);
    _refreshGrid();
    _refreshSelectBar();
  }
  function _selectAllVisible() {
    let items = _curCategory === '전체' ? ArchiveDB.getAll() : ArchiveDB.getByCategory(_curCategory);
    if (_searchQuery) items = items.filter(f => _matchesSearch(f, _searchQuery));
    items.forEach(f => _selectedIds.add(f.id));
    _refreshGrid();
    _refreshSelectBar();
  }

  // ★ 검색 — 파일명(표시 이름·원본 파일명)과 설명까지 전부 대상으로,
  //   검색어를 띄어쓰기로 나눠 각 단어가 어디든 포함되면 매칭(순서·위치 무관)
  //   되게 해서 "정확히 같은 제목"이 아니어도 느슨하게 잘 찾아지도록 한다.
  function _matchesSearch(f, query) {
    if (!query) return true;
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const filesText = (f.files || []).map(x => `${x.originalName || ''} ${x.contentText || ''}`).join(' ');
    const haystack = `${f.name} ${f.description || ''} ${filesText}`.toLowerCase();
    return words.every(w => haystack.includes(w));
  }
  function _onSearchInput(v) {
    _searchQuery = v;
    const body = _q('ar-body');
    if (body) body.innerHTML = _gridHtml();
    const clearBtn = document.querySelector('.ar-search-clear');
    const wrap = document.querySelector('.ar-search-wrap');
    if (wrap) {
      const existing = wrap.querySelector('.ar-search-clear');
      if (v && !existing) { const b = document.createElement('button'); b.className='ar-search-clear'; b.textContent='✕'; b.onclick=()=>ArchiveApp._onSearchInput(''); wrap.appendChild(b); }
      if (!v && existing) existing.remove();
    }
  }

  function _gridHtml() {
    let items = _curCategory === '전체' ? ArchiveDB.getAll() : ArchiveDB.getByCategory(_curCategory);
    if (_searchQuery) items = items.filter(f => _matchesSearch(f, _searchQuery));
    if (!items.length) {
      return _searchQuery
        ? `<div class="ar-empty"><div class="ar-empty-ico">🔍</div>"${_esc(_searchQuery)}"와(과) 일치하는 자료가 없습니다</div>`
        : `<div class="ar-empty"><div class="ar-empty-ico">🗂️</div>등록된 자료가 없습니다<br>오른쪽 아래 + 버튼으로 올려보세요</div>`;
    }
    return _viewMode === 'list' ? _listRowsHtml(items) : _gridCardsHtml(items);
  }
  function _gridCardsHtml(items) {
    return `<div class="ar-grid">${items.map(f => { const pf = _primaryFile(f); const n = f.files?.length || 0; return `
      <div class="ar-card${_selectMode && _selectedIds.has(f.id) ? ' selected' : ''}" onclick="${_selectMode ? `ArchiveApp._toggleSelect('${f.id}')` : `ArchiveApp.openPreview('${f.id}')`}">
        ${_selectMode
          ? `<span class="ar-card-check">${_selectedIds.has(f.id) ? '✅' : '⬜'}</span>`
          : `<button class="ar-card-pin${f.pinned ? ' on' : ''}" onclick="event.stopPropagation();ArchiveApp._togglePin('${f.id}')" title="${f.pinned ? '대시보드에서 빼기' : '대시보드에 썸네일로 표시'}">${f.pinned ? '⭐' : '☆'}</button>`}
        ${n > 1 ? `<span class="ar-card-multi">📎 ${n}</span>` : ''}
        ${pf.thumbnail ? `<img class="ar-card-thumb" src="${pf.thumbnail}" alt="">`
          : _isImg(pf.ext) ? `<img class="ar-card-thumb" src="${ArchiveDB.getFileUrl(pf.r2Key)}" alt="">`
          : `<div class="ar-card-ico">${_iconFor(pf.ext)}</div>`}
        <div class="ar-card-name">${_esc(f.name)}</div>
        <div class="ar-card-meta"><span>${_fmtSize(_postSize(f))}</span><span>${_fmtDate(f.uploadedAt)}</span></div>
        <span class="ar-card-cat">${_esc(f.category)}</span>
      </div>`; }).join('')}</div>`;
  }
  // ★ 리스트형 — 한 줄에 더 많은 정보(설명 미리보기 포함)를 보여줘서
  //   여러 파일을 빠르게 훑어보는 용도에 적합하다.
  function _listRowsHtml(items) {
    return `<div class="ar-list">${items.map(f => { const pf = _primaryFile(f); const n = f.files?.length || 0; return `
      <div class="ar-lrow${_selectMode && _selectedIds.has(f.id) ? ' selected' : ''}" onclick="${_selectMode ? `ArchiveApp._toggleSelect('${f.id}')` : `ArchiveApp.openPreview('${f.id}')`}">
        ${_selectMode
          ? `<span class="ar-lrow-check">${_selectedIds.has(f.id) ? '✅' : '⬜'}</span>`
          : (pf.thumbnail || _isImg(pf.ext))
            ? `<img class="ar-lrow-thumb" src="${pf.thumbnail || ArchiveDB.getFileUrl(pf.r2Key)}" alt="">`
            : `<span class="ar-lrow-ico">${_iconFor(pf.ext)}</span>`}
        <div class="ar-lrow-body">
          <div class="ar-lrow-top">
            <span class="ar-lrow-name">${_esc(f.name)}${n > 1 ? ` <span class="ar-lrow-multi">📎${n}</span>` : ''}</span>
            <span class="ar-card-cat">${_esc(f.category)}</span>
          </div>
          ${f.description ? `<div class="ar-lrow-desc">${_esc(f.description)}</div>` : ''}
          <div class="ar-lrow-meta">${_fmtSize(_postSize(f))} · ${_fmtDate(f.uploadedAt)}</div>
        </div>
        ${_selectMode ? '' : `<button class="ar-card-pin${f.pinned ? ' on' : ''}" onclick="event.stopPropagation();ArchiveApp._togglePin('${f.id}')" title="${f.pinned ? '대시보드에서 빼기' : '대시보드에 썸네일로 표시'}">${f.pinned ? '⭐' : '☆'}</button>`}
      </div>`; }).join('')}</div>`;
  }

  async function _togglePin(id) {
    const f = ArchiveDB.getById(id);
    if (!f) return;
    const result = await ArchiveDB.updateFile(id, { pinned: !f.pinned });
    console.log(`[ArchiveApp] 즐겨찾기 ${result?.pinned ? 'ON' : 'OFF'} — 서버 반영: ${result?.savedToServer}`, result);
    _refreshGrid();
  }

  function render() {
    _css();
    const pg = _q('page-archive'); if (!pg) return;
    pg.innerHTML = _shellHtml();
    const tab = TOOL_TABS.find(t => t.key === _activeTool) || TOOL_TABS[0];
    tab.mount('ar-tool-body');
  }
  function _refreshGrid() {
    const b = _q('ar-body'); if (b) b.innerHTML = _gridHtml();
    const sf = document.querySelector('.ar-storage-footer'); if (sf) sf.innerHTML = _storageUsageHtml();
  }
  function _selectCategory(c) { _curCategory = c; render(); }

  /* ═══════════════ 업로드 ═══════════════ */
  let _pickedFiles = [];

  function openUpload() {
    _pickedFiles = [];
    const ov = document.createElement('div');
    ov.className = 'ar-ov'; ov.id = 'ar-upload-ov';
    ov.innerHTML = `<div class="ar-sheet">
      <div class="ar-sheet-title">📤 자료 올리기</div>
      <div class="ar-field">
        <label>파일 선택 (여러 개 선택·드래그 가능)</label>
        <div class="ar-drop" id="ar-drop" onclick="document.getElementById('ar-file-inp').click()">파일을 선택하거나 여러 개를 끌어다 놓으세요</div>
        <input type="file" id="ar-file-inp" multiple style="display:none" onchange="ArchiveApp._onPickFiles(this.files)">
        <div id="ar-picked-list"></div>
      </div>
      <div class="ar-field"><label>표시할 이름 (게시물 제목)</label><input type="text" id="ar-name-inp" placeholder="예: 2026년 여름방학 안내문"></div>
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

    // ★ 드래그 앤 드롭 — 여러 파일을 한 번에 끌어다 놓을 수 있다
    const dropEl = _q('ar-drop');
    if (dropEl) {
      ['dragenter', 'dragover'].forEach(ev => dropEl.addEventListener(ev, e => {
        e.preventDefault(); e.stopPropagation();
        dropEl.classList.add('dragover');
      }));
      ['dragleave', 'dragend'].forEach(ev => dropEl.addEventListener(ev, e => {
        e.preventDefault(); e.stopPropagation();
        dropEl.classList.remove('dragover');
      }));
      dropEl.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation();
        dropEl.classList.remove('dragover');
        if (e.dataTransfer?.files?.length) _onPickFiles(e.dataTransfer.files);
      });
    }
  }
  function _closeUpload() { _q('ar-upload-ov')?.remove(); }
  function _renderPickedList() {
    const wrap = _q('ar-picked-list');
    if (!wrap) return;
    if (!_pickedFiles.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = `<div class="ar-picked-list">${_pickedFiles.map((file, i) => `
      <div class="ar-picked-item">
        <span class="ar-picked-name">📄 ${_esc(file.name)}</span>
        <span class="ar-picked-size">${_fmtSize(file.size)}</span>
        <button type="button" onclick="ArchiveApp._removePickedFile(${i})" title="빼기">✕</button>
      </div>`).join('')}</div>`;
    const drop = _q('ar-drop');
    if (drop) { drop.textContent = `✓ ${_pickedFiles.length}개 파일 선택됨 — 더 추가하려면 다시 눌러주세요`; drop.classList.add('has-file'); }
  }
  function _onPickFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    _pickedFiles = _pickedFiles.concat(files); // ★ 여러 번에 걸쳐 추가할 수도 있게 누적
    _renderPickedList();
    const nameInp = _q('ar-name-inp');
    if (nameInp && !nameInp.value) nameInp.value = _pickedFiles[0].name.replace(/\.[^.]+$/, '');
  }
  function _removePickedFile(idx) {
    _pickedFiles.splice(idx, 1);
    _renderPickedList();
  }
  // ═══════════════ 업로드 시 썸네일·검색용 텍스트 미리 추출 ═══════════════
  // ★ 형식별로 가능한 만큼만 최선을 다해 시도한다. 실패해도 업로드 자체는
  //   정상 진행되고, 그냥 아이콘/검색불가 상태로 남을 뿐이다(치명적이지 않음).
  function _extFromName(name) { return (name.match(/\.([a-zA-Z0-9]+)$/)?.[1] || '').toLowerCase(); }

  async function _extractPdf(file) {
    if (typeof pdfjsLib === 'undefined') return {};
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const thumbnail = canvas.toDataURL('image/jpeg', 0.6);
    // ★ 검색용 텍스트 — 문서가 길 수 있어 최대 10페이지 · 5000자까지만
    let text = '';
    const maxPages = Math.min(pdf.numPages, 10);
    for (let i = 1; i <= maxPages && text.length < 5000; i++) {
      const p = await pdf.getPage(i);
      const content = await p.getTextContent();
      text += content.items.map(it => it.str).join(' ') + ' ';
    }
    return { thumbnail, contentText: text.slice(0, 5000) };
  }
  async function _extractSheet(file, isCsv) {
    if (typeof XLSX === 'undefined') return {};
    const wb = isCsv ? XLSX.read(await file.text(), { type: 'string' }) : XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const contentText = (XLSX.utils.sheet_to_txt ? XLSX.utils.sheet_to_txt(ws) : XLSX.utils.sheet_to_csv(ws)).slice(0, 5000);
    let thumbnail = '';
    if (typeof html2canvas !== 'undefined') {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;left:-9999px;top:0;background:#fff;padding:6px;width:280px;font-size:8px';
      wrap.innerHTML = XLSX.utils.sheet_to_html(ws);
      wrap.querySelectorAll('td,th').forEach(c => { c.style.border = '1px solid #ddd'; c.style.padding = '2px 4px'; });
      document.body.appendChild(wrap);
      try {
        const canvas = await html2canvas(wrap, { backgroundColor: '#fff', scale: 1 });
        thumbnail = canvas.toDataURL('image/jpeg', 0.6);
      } catch (e) { /* 썸네일 실패해도 텍스트는 이미 뽑았으니 검색은 됨 */ }
      wrap.remove();
    }
    return { thumbnail, contentText };
  }
  async function _extractTxt(file) {
    const text = await file.text();
    return { contentText: text.slice(0, 5000) };
  }
  async function _extractHwp(file) {
    // ★ HWP는 텍스트 추출 API가 아직 확실치 않아 썸네일만 시도(검색용
    //   텍스트는 지원 안 함 — 실패해도 조용히 넘어감)
    try {
      if (!globalThis.measureTextWidth) {
        globalThis.measureTextWidth = (font, text) => {
          const ctx = document.createElement('canvas').getContext('2d');
          ctx.font = font; return ctx.measureText(text).width;
        };
      }
      const rhwp = await import('https://esm.sh/@rhwp/core');
      await rhwp.default();
      const buf = new Uint8Array(await file.arrayBuffer());
      const doc = new rhwp.HwpDocument(buf);
      const svg = doc.renderPageSvg(0);
      const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = svgUrl; });
      const canvas = document.createElement('canvas');
      const scale = 200 / img.width;
      canvas.width = 200; canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(svgUrl);
      return { thumbnail: canvas.toDataURL('image/jpeg', 0.7) };
    } catch (e) { return {}; }
  }
  async function _extractPreview(file) {
    const ext = _extFromName(file.name);
    try {
      if (_isPdf(ext)) return await _extractPdf(file);
      if (_isXlsx(ext)) return await _extractSheet(file, false);
      if (_isCsv(ext)) return await _extractSheet(file, true);
      if (ext === 'txt') return await _extractTxt(file);
      if (_isHwp(ext)) return await _extractHwp(file);
    } catch (e) { console.warn('[ArchiveApp] 미리보기/검색용 추출 실패', e); }
    return {};
  }

  async function _submitUpload() {
    if (!_pickedFiles.length) { alert('파일을 선택해 주세요'); return; }
    const btn = _q('ar-upload-submit');
    const prog = _q('ar-upload-progress');
    btn.disabled = true; btn.textContent = '업로드 중...';
    const extraPerFile = [];
    for (let i = 0; i < _pickedFiles.length; i++) {
      if (prog) prog.innerHTML = `<div class="ar-progress">⏳ 미리보기 준비 중... (${i + 1}/${_pickedFiles.length})</div>`;
      extraPerFile.push(await _extractPreview(_pickedFiles[i]).catch(() => ({})));
    }
    if (prog) prog.innerHTML = `<div class="ar-progress">⏳ 업로드하고 있어요... (0/${_pickedFiles.length})</div>`;
    try {
      const result = await ArchiveDB.createPost(_pickedFiles, {
        name: _q('ar-name-inp')?.value?.trim() || _pickedFiles[0].name,
        category: _q('ar-cat-inp')?.value || '기타',
        description: _q('ar-desc-inp')?.value?.trim() || '',
        uploadedBy: (typeof DB !== 'undefined' && DB.getSession) ? (DB.getSession()?.name || '') : '',
      }, extraPerFile);
      _closeUpload();
      _refreshGrid();
      const msg = result.partialFailure ? '⚠️ 일부 파일 업로드 실패 — 나머지는 완료됨'
        : result.savedToServer ? '✅ 업로드 완료' : '⏳ 업로드됨 · 서버 반영 대기 중';
      if (typeof App !== 'undefined' && App._toast) App._toast(msg);
    } catch (e) {
      btn.disabled = false; btn.textContent = '업로드';
      if (prog) prog.innerHTML = `<div class="ar-progress" style="color:#ef4444">⚠️ 업로드 실패: ${_esc(e.message || '알 수 없는 오류')}</div>`;
    }
  }

  /* ═══════════════ 미리보기 ═══════════════ */
  let _previewPost = null, _previewFileIdx = 0;
  let _previewSelectedKeys = new Set(); // ★ 게시물 안에서 원하는 파일만 골라 받기용
  function _currentPreviewFile() { return _previewPost?.files?.[_previewFileIdx] || null; }

  async function openPreview(id) {
    const post = ArchiveDB.getById(id);
    if (!post || !post.files?.length) return;
    _previewPost = post; _previewFileIdx = 0; _previewSelectedKeys = new Set();
    const ov = document.createElement('div');
    ov.className = 'ar-ov'; ov.id = 'ar-preview-ov';
    ov.innerHTML = `<div class="ar-sheet ar-prev-sheet" id="ar-prev-sheet" style="max-width:680px"><div id="ar-prev-inner"></div></div>`;
    document.body.appendChild(ov);
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    _renderPreviewModal();
  }
  function _renderPreviewModal() {
    const post = _previewPost;
    const f = _currentPreviewFile();
    const inner = _q('ar-prev-inner');
    if (!post || !f || !inner) return;
    const convOpts = _convertOptionsFor(f.ext);
    inner.innerHTML = `
      <div class="ar-prev-hdr">
        <div class="ar-prev-name">${_iconFor(f.ext)} ${_esc(post.name)}</div>
        <div class="ar-prev-acts">
          ${convOpts.length ? `<div class="ar-conv-wrap">
            <button class="ar-prev-icobtn" onclick="ArchiveApp._toggleConvertMenu()" title="다른 형식으로 다운로드">🔄</button>
            <div class="ar-conv-menu hidden" id="ar-conv-menu">
              ${convOpts.map(e => `<button onclick="ArchiveApp._convertAndDownload('${e}')">.${e}로 저장</button>`).join('')}
            </div>
          </div>` : ''}
          <button class="ar-prev-icobtn" onclick="ArchiveApp._printPreview()" title="인쇄">🖨️</button>
          <button class="ar-prev-icobtn" onclick="ArchiveApp._toggleFullscreen()" title="전체화면">⛶</button>
          <button class="ar-prev-icobtn" onclick="ArchiveApp.openEdit('${post.id}')" title="수정">✏️</button>
          <button class="ar-prev-icobtn" onclick="ArchiveApp._confirmDelete('${post.id}')" title="삭제">🗑️</button>
          ${post.files.length > 1 ? `<button class="ar-prev-icobtn" onclick="ArchiveApp._downloadPostZip('${post.id}')" title="첨부파일 전체 ZIP으로 받기">📦</button>` : ''}
          <a class="ar-prev-icobtn" style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none" href="${ArchiveDB.getFileUrl(f.r2Key)}" download="${_esc(f.originalName)}" title="이 파일만 다운로드">⬇️</a>
          <button class="ar-prev-icobtn" onclick="document.getElementById('ar-preview-ov').remove()" title="닫기">✕</button>
        </div>
      </div>
      <div class="ar-prev-date">🗓️ 등록일 ${_fmtDate(post.uploadedAt)}${post.uploadedBy ? ` · ${_esc(post.uploadedBy)}` : ''}</div>
      ${post.files.length > 1 ? `<div class="ar-file-switch">${post.files.map((pf, i) => `
        <label class="ar-file-tab-wrap">
          <input type="checkbox" class="ar-file-chk" onclick="event.stopPropagation();ArchiveApp._toggleFileSelect('${_esc(pf.r2Key)}')" ${_previewSelectedKeys.has(pf.r2Key) ? 'checked' : ''}>
          <button class="ar-file-tab${i === _previewFileIdx ? ' on' : ''}" onclick="ArchiveApp._switchPreviewFile(${i})">${_iconFor(pf.ext)} ${_esc(pf.originalName)}</button>
        </label>`).join('')}
        <button class="ar-file-tab add" onclick="ArchiveApp._addMoreFiles('${post.id}')" title="파일 추가">＋</button>
      </div>
      <div class="ar-file-select-bar">
        <span class="ar-file-select-count">${_previewSelectedKeys.size}개 선택됨</span>
        <button class="ar-btn ghost" style="flex:0;padding:6px 12px;font-size:11.5px" onclick="ArchiveApp._selectAllFilesInPreview()">전체선택</button>
        <button class="ar-btn primary" style="flex:0;padding:6px 12px;font-size:11.5px" onclick="ArchiveApp._downloadSelectedFilesInPost()" ${_previewSelectedKeys.size ? '' : 'disabled'}>⬇️ 선택한 파일 받기</button>
      </div>` : `<div class="ar-file-switch-single"><button class="ar-file-tab add" onclick="ArchiveApp._addMoreFiles('${post.id}')" title="파일 추가">＋ 파일 추가</button></div>`}
      <div class="ar-prev-body" id="ar-prev-body">${_previewLoadingHtml(f)}</div>
      ${post.description ? `<div class="ar-desc-view">${_esc(post.description)}</div>` : ''}
      <div id="ar-detail-progress"></div>`;
    _renderPreviewBody(f);
  }
  function _switchPreviewFile(idx) {
    _previewFileIdx = idx;
    _renderPreviewModal();
  }
  function _toggleFileSelect(r2Key) {
    if (_previewSelectedKeys.has(r2Key)) _previewSelectedKeys.delete(r2Key); else _previewSelectedKeys.add(r2Key);
    _renderPreviewModal();
  }
  function _selectAllFilesInPreview() {
    (_previewPost?.files || []).forEach(f => _previewSelectedKeys.add(f.r2Key));
    _renderPreviewModal();
  }
  // ★ 게시물 안에서 체크한 파일만 골라서 받기 — 1개면 그냥 바로 다운로드,
  //   여러 개면 ZIP으로 묶어서 받는다.
  async function _downloadSelectedFilesInPost() {
    const post = _previewPost;
    if (!post || !_previewSelectedKeys.size) return;
    const chosen = post.files.filter(f => _previewSelectedKeys.has(f.r2Key));
    if (chosen.length === 1) {
      const a = document.createElement('a');
      a.href = ArchiveDB.getFileUrl(chosen[0].r2Key);
      a.download = chosen[0].originalName || 'file';
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    if (typeof JSZip === 'undefined') { if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ ZIP 라이브러리를 불러오지 못했습니다'); return; }
    const zip = new JSZip();
    const usedNames = new Set();
    let failCount = 0;
    for (let i = 0; i < chosen.length; i++) {
      const f = chosen[i];
      if (typeof App !== 'undefined' && App._toast) App._toast(`📦 압축 준비 중... (${i + 1}/${chosen.length})`, '', 60000);
      try {
        const res = await fetch(ArchiveDB.getFileUrl(f.r2Key));
        if (!res.ok) throw new Error('fetch failed');
        const blob = await res.blob();
        let name = f.originalName || 'file';
        if (usedNames.has(name)) {
          const dot = name.lastIndexOf('.');
          const base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
          let n = 2; while (usedNames.has(`${base}(${n})${ext}`)) n++;
          name = `${base}(${n})${ext}`;
        }
        usedNames.add(name);
        zip.file(name, blob);
      } catch (e) { failCount++; console.warn('[ArchiveApp] ZIP 포함 실패:', f.originalName, e); }
    }
    try {
      const content = await zip.generateAsync({ type: 'blob' });
      _downloadBlob(content, `${post.name.replace(/[^\w가-힣 ]/g, '')}_선택항목.zip`);
      if (typeof App !== 'undefined' && App._toast) App._toast(failCount ? `✅ 다운로드 완료 (${failCount}개 실패)` : '✅ 다운로드 완료', 'success');
    } catch (e) {
      if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ 압축 파일 생성 실패: ' + (e.message || ''));
    }
  }
  // ★ 이미 있는 게시물에 파일을 더 추가 — 같은 미리보기·검색용 추출 파이프라인을 재사용
  async function _addMoreFiles(postId) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = async () => {
      const files = Array.from(inp.files || []);
      inp.remove();
      if (!files.length) return;
      const prog = _q('ar-detail-progress');
      const extraPerFile = [];
      for (let i = 0; i < files.length; i++) {
        if (prog) prog.innerHTML = `<div class="ar-progress">⏳ 추가하는 중... (${i + 1}/${files.length})</div>`;
        extraPerFile.push(await _extractPreview(files[i]).catch(() => ({})));
      }
      const result = await ArchiveDB.addFilesToPost(postId, files, extraPerFile);
      if (result) {
        _previewPost = result;
        _renderPreviewModal();
        _refreshGrid();
        if (typeof App !== 'undefined' && App._toast) App._toast('✅ 파일이 추가되었습니다');
      }
    };
    inp.click();
  }
  function _toggleConvertMenu() { _q('ar-conv-menu')?.classList.toggle('hidden'); }
  function _printPreview() {
    const body = _q('ar-prev-body');
    if (!body) return;
    const img = body.querySelector('img'), iframe = body.querySelector('iframe');
    if (iframe) { iframe.contentWindow?.print(); return; }
    if (img) {
      const w = window.open('', '_blank');
      w.document.write(`<html><body style="margin:0"><img src="${img.src}" style="max-width:100%" onload="window.print()"></body></html>`);
      w.document.close();
      return;
    }
    window.print(); // 표(엑셀) 등 — 페이지 전체 인쇄로 대체
  }
  // ★ 형식 변환 다운로드 — 실제로 브라우저 안에서 안정적으로 가능한
  //   범위만 지원한다(이미지 상호변환, 엑셀↔CSV). 워드/파워포인트/PDF를
  //   다른 포맷으로 바꾸는 건 진짜 변환 엔진이 있어야 해서 무료로는
  //   지원하지 않는다 — 여기서 옵션 자체를 아예 안 보여주는 것으로 정직하게 처리.
  function _convertOptionsFor(ext) {
    ext = (ext || '').toLowerCase();
    if (_isImg(ext) && ext !== 'svg') return ['png', 'jpg', 'webp', 'pdf'].filter(e => e !== ext);
    if (_isXlsx(ext)) return ['csv', 'pdf'];
    if (_isCsv(ext)) return ['xlsx', 'pdf'];
    return [];
  }
  async function _convertAndDownload(targetExt) {
    const f = _currentPreviewFile();
    if (!f) return;
    _q('ar-conv-menu')?.classList.add('hidden');
    const url = ArchiveDB.getFileUrl(f.r2Key);
    const baseName = (f.originalName || 'file').replace(/\.[^.]+$/, '');
    const busyToast = () => { if (typeof App !== 'undefined' && App._toast) App._toast('⏳ 변환 중...', '', 15000); };
    try {
      if (_isImg(f.ext) && targetExt === 'pdf') {
        busyToast();
        if (typeof window.jspdf === 'undefined') { if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ PDF 변환 라이브러리를 불러오지 못했습니다'); return; }
        const res = await fetch(url);
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        // ★ 이미지 비율에 맞춰 PDF 페이지 크기를 그대로 잡는다(A4로 억지로 맞추지 않음)
        const orientation = bitmap.width >= bitmap.height ? 'l' : 'p';
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation, unit: 'px', format: [bitmap.width, bitmap.height] });
        pdf.addImage(dataUrl, 'JPEG', 0, 0, bitmap.width, bitmap.height);
        pdf.save(`${baseName}.pdf`);
        return;
      }
      if (_isImg(f.ext)) {
        const res = await fetch(url);
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (targetExt === 'jpg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); } // JPG는 투명 배경 지원 안 하므로 흰 배경 채움
        ctx.drawImage(bitmap, 0, 0);
        const mime = targetExt === 'jpg' ? 'image/jpeg' : targetExt === 'webp' ? 'image/webp' : 'image/png';
        canvas.toBlob(outBlob => _downloadBlob(outBlob, `${baseName}.${targetExt}`), mime, 0.92);
        return;
      }
      if (typeof XLSX === 'undefined') { if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ 변환 라이브러리를 불러오지 못했습니다'); return; }
      if ((_isXlsx(f.ext) || _isCsv(f.ext)) && targetExt === 'pdf') {
        busyToast();
        if (typeof window.jspdf === 'undefined' || typeof html2canvas === 'undefined') {
          if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ PDF 변환 라이브러리를 불러오지 못했습니다'); return;
        }
        const res = await fetch(url);
        const wb = _isCsv(f.ext) ? XLSX.read(await res.text(), { type: 'string' }) : XLSX.read(await res.arrayBuffer(), { type: 'array' });
        const html = XLSX.utils.sheet_to_html(wb.Sheets[wb.SheetNames[0]]);
        await _tableToPdf(html, baseName);
        return;
      }
      if (_isXlsx(f.ext) && targetExt === 'csv') {
        const res = await fetch(url);
        const wb = XLSX.read(await res.arrayBuffer(), { type: 'array' });
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
        _downloadBlob(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), `${baseName}.csv`); // ★ BOM 붙여서 엑셀에서 한글 깨짐 방지
        return;
      }
      if (_isCsv(f.ext) && targetExt === 'xlsx') {
        const res = await fetch(url);
        const wb = XLSX.read(await res.text(), { type: 'string' });
        const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
        _downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${baseName}.xlsx`);
        return;
      }
    } catch (e) {
      if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ 변환 실패: ' + (e.message || '알 수 없는 오류'));
    }
  }
  // ★ 엑셀/CSV 표를 PDF로 — 화면 밖에 실제로 그려서(html2canvas로 캡처해야
  //   하므로) 캡처한 뒤 바로 지운다. 표가 한 페이지보다 길면 여러 페이지로 나눈다.
  async function _tableToPdf(tableHtml, baseName) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-9999px;top:0;background:#fff;padding:16px;width:1000px';
    wrap.innerHTML = tableHtml;
    const table = wrap.querySelector('table');
    if (table) { table.style.borderCollapse = 'collapse'; table.style.width = '100%'; table.style.fontSize = '13px';
      wrap.querySelectorAll('td,th').forEach(c => { c.style.border = '1px solid #ccc'; c.style.padding = '4px 8px'; }); }
    document.body.appendChild(wrap);
    try {
      const canvas = await html2canvas(wrap, { backgroundColor: '#fff', scale: 2 });
      const { jsPDF } = window.jspdf;
      const pageW = 595, pageH = 842; // A4 (pt 단위, 72dpi 기준)
      const imgW = pageW, imgH = (canvas.height * imgW) / canvas.width;
      const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
      if (imgH <= pageH) {
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgW, imgH);
      } else {
        // ★ 세로로 긴 표 — 캔버스를 페이지 높이만큼씩 잘라서 여러 페이지에 나눠 담는다
        const pagePxH = Math.floor((canvas.width * pageH) / pageW);
        let renderedPx = 0, first = true;
        while (renderedPx < canvas.height) {
          const sliceH = Math.min(pagePxH, canvas.height - renderedPx);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width; sliceCanvas.height = sliceH;
          sliceCanvas.getContext('2d').drawImage(canvas, 0, renderedPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          if (!first) pdf.addPage(); first = false;
          pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 0, 0, imgW, (sliceH * imgW) / canvas.width);
          renderedPx += sliceH;
        }
      }
      pdf.save(`${baseName}.pdf`);
    } finally {
      wrap.remove();
    }
  }
  function _downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  // ★ 게시물 하나에 첨부된 파일 전체를 ZIP으로 (여러 개 선택 백업과 별개로,
  //   미리보기 화면에서 "이 게시물 전체"만 바로 받고 싶을 때 쓴다)
  async function _downloadPostZip(postId) {
    const post = ArchiveDB.getById(postId);
    if (!post?.files?.length) return;
    if (typeof JSZip === 'undefined') { if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ ZIP 라이브러리를 불러오지 못했습니다'); return; }
    const zip = new JSZip();
    const usedNames = new Set();
    let failCount = 0;
    for (let i = 0; i < post.files.length; i++) {
      const f = post.files[i];
      if (typeof App !== 'undefined' && App._toast) App._toast(`📦 압축 준비 중... (${i + 1}/${post.files.length})`, '', 60000);
      try {
        const res = await fetch(ArchiveDB.getFileUrl(f.r2Key));
        if (!res.ok) throw new Error('fetch failed');
        const blob = await res.blob();
        let name = f.originalName || 'file';
        if (usedNames.has(name)) {
          const dot = name.lastIndexOf('.');
          const base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
          let n = 2; while (usedNames.has(`${base}(${n})${ext}`)) n++;
          name = `${base}(${n})${ext}`;
        }
        usedNames.add(name);
        zip.file(name, blob);
      } catch (e) {
        failCount++;
        console.warn('[ArchiveApp] ZIP 포함 실패:', f.originalName, e);
      }
    }
    try {
      const content = await zip.generateAsync({ type: 'blob' });
      _downloadBlob(content, `${post.name.replace(/[^\w가-힣 ]/g, '')}.zip`);
      if (typeof App !== 'undefined' && App._toast) {
        App._toast(failCount ? `✅ 다운로드 완료 (${failCount}개 실패)` : '✅ 다운로드 완료', 'success');
      }
    } catch (e) {
      if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ 압축 파일 생성 실패: ' + (e.message || ''));
    }
  }

  async function _downloadSelectedZip() {
    if (!_selectedIds.size) return;
    if (typeof JSZip === 'undefined') { if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ ZIP 라이브러리를 불러오지 못했습니다'); return; }
    const ids = [..._selectedIds];
    const zip = new JSZip();
    const usedNames = new Set();
    let failCount = 0, totalFiles = 0;
    const allFiles = []; // {postName, file}
    ids.forEach(id => { const p = ArchiveDB.getById(id); if (p) (p.files || []).forEach(f => allFiles.push({ postName: p.name, file: f })); });
    totalFiles = allFiles.length;
    for (let i = 0; i < allFiles.length; i++) {
      const f = allFiles[i].file;
      if (typeof App !== 'undefined' && App._toast) App._toast(`📦 압축 준비 중... (${i + 1}/${totalFiles})`, '', 60000);
      try {
        const res = await fetch(ArchiveDB.getFileUrl(f.r2Key));
        if (!res.ok) throw new Error('fetch failed');
        const blob = await res.blob();
        // ★ 같은 이름 파일이 여러 개 선택됐을 수 있어 중복 시 번호를 붙임
        let name = f.originalName || 'file';
        if (usedNames.has(name)) {
          const dot = name.lastIndexOf('.');
          const base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
          let n = 2; while (usedNames.has(`${base}(${n})${ext}`)) n++;
          name = `${base}(${n})${ext}`;
        }
        usedNames.add(name);
        zip.file(name, blob);
      } catch (e) {
        failCount++;
        console.warn('[ArchiveApp] ZIP 포함 실패:', f.originalName, e);
      }
    }
    if (typeof App !== 'undefined' && App._toast) App._toast('📦 압축 파일 생성 중...', '', 30000);
    try {
      const content = await zip.generateAsync({ type: 'blob' });
      const dateStr = new Date().toISOString().slice(0, 10);
      _downloadBlob(content, `콘텐츠_백업_${dateStr}.zip`);
      if (typeof App !== 'undefined' && App._toast) {
        App._toast(failCount ? `✅ 백업 완료 (${failCount}개 실패)` : '✅ 백업 완료', 'success');
      }
    } catch (e) {
      if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ 압축 파일 생성 실패: ' + (e.message || ''));
    }
  }
  function _toggleFullscreen() {
    const sheet = _q('ar-prev-sheet');
    if (sheet) sheet.classList.toggle('fullscreen');
  }
  function _previewLoadingHtml(f) {
    if (_isImg(f.ext) || _isPdf(f.ext) || _isOffice(f.ext) || _isVideo(f.ext) || _isAudio(f.ext) || _isHwp(f.ext)) return '';
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
    if (_isVideo(f.ext)) {
      body.innerHTML = `<video src="${url}" controls style="max-width:100%;max-height:70vh"></video>`;
      return;
    }
    if (_isAudio(f.ext)) {
      body.innerHTML = `<div style="padding:40px 20px;width:100%;text-align:center">
        <div style="font-size:44px;margin-bottom:16px">🎵</div>
        <audio src="${url}" controls style="width:100%;max-width:400px"></audio>
      </div>`;
      return;
    }
    // ★ HWP/HWPX — rhwp(오픈소스, MIT 라이선스, WASM 기반) 미리보기.
    //   완전히 브라우저 안에서만 처리되고 파일이 외부 서버로 전송되지
    //   않는다. 다만 비교적 신생 프로젝트라 일부 문서에서 렌더링이 실패할
    //   수 있어, 실패 시 조용히 "다운로드로 확인" 안내로 넘어간다.
    if (_isHwp(f.ext)) {
      body.innerHTML = `<div class="ar-prev-none">⏳ 한글 문서를 불러오는 중...</div>`;
      try {
        if (!globalThis.measureTextWidth) {
          globalThis.measureTextWidth = (font, text) => {
            const ctx = document.createElement('canvas').getContext('2d');
            ctx.font = font;
            return ctx.measureText(text).width;
          };
        }
        const rhwp = await import('https://esm.sh/@rhwp/core');
        await rhwp.default();
        const res = await fetch(url);
        const buf = new Uint8Array(await res.arrayBuffer());
        const doc = new rhwp.HwpDocument(buf);
        let pagesHtml = '';
        for (let i = 0; i < 200; i++) { // ★ 페이지 수를 미리 알 방법이 없어 실패할 때까지 순서대로 렌더링
          try { pagesHtml += `<div class="ar-hwp-page">${doc.renderPageSvg(i)}</div>`; }
          catch (e) { break; }
        }
        if (!pagesHtml) throw new Error('렌더링된 페이지가 없습니다');
        body.innerHTML = `<div class="ar-hwp-wrap">${pagesHtml}</div>`;
      } catch (e) {
        console.warn('[ArchiveApp] HWP 미리보기 실패', e);
        body.innerHTML = `<div class="ar-prev-none">⚠️ 이 한글 문서는 미리보기가 지원되지 않아요<br>다운로드 버튼(⬇️)으로 받아서 확인해 주세요</div>`;
      }
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
    if (_isXlsx(f.ext) || _isCsv(f.ext)) {
      if (typeof XLSX === 'undefined') { body.innerHTML = `<div class="ar-prev-none">엑셀 미리보기 라이브러리를 불러오지 못했습니다</div>`; return; }
      try {
        const res = await fetch(url);
        let wb;
        if (_isCsv(f.ext)) { wb = XLSX.read(await res.text(), { type: 'string' }); }
        else { wb = XLSX.read(await res.arrayBuffer(), { type: 'array' }); }
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
      <div class="ar-field">
        <label>첨부 파일 (${f.files?.length || 0}개)</label>
        <div id="ar-edit-files">${_editFilesListHtml(id)}</div>
        <button type="button" class="ar-btn ghost" style="margin-top:8px;flex:0;padding:8px 14px;font-size:12px" onclick="ArchiveApp._addMoreFilesInEdit('${id}')">＋ 파일 추가</button>
      </div>
      <div class="ar-btn-row">
        <button class="ar-btn ghost" onclick="ArchiveApp._closeEdit()">취소</button>
        <button class="ar-btn primary" onclick="ArchiveApp._submitEdit('${id}')">저장</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.onclick = e => { if (e.target === ov) _closeEdit(); };
  }
  function _editFilesListHtml(postId) {
    const f = ArchiveDB.getById(postId);
    const files = f?.files || [];
    if (!files.length) return `<div class="ar-progress" style="color:var(--tx3)">첨부된 파일이 없습니다</div>`;
    return `<div class="ar-picked-list">${files.map(file => `
      <div class="ar-picked-item">
        <span class="ar-picked-name">${_iconFor(file.ext)} ${_esc(file.originalName)}</span>
        <span class="ar-picked-size">${_fmtSize(file.size)}</span>
        <button type="button" onclick="ArchiveApp._removeFileInEdit('${postId}','${_esc(file.r2Key)}')" title="이 파일 삭제">✕</button>
      </div>`).join('')}</div>`;
  }
  async function _removeFileInEdit(postId, r2Key) {
    const f = ArchiveDB.getById(postId);
    if (f?.files?.length === 1) {
      if (!confirm('마지막 파일을 삭제하면 이 게시물 전체가 삭제됩니다. 계속할까요?')) return;
    } else if (!confirm('이 파일을 삭제할까요?')) {
      return;
    }
    const result = await ArchiveDB.removeFileFromPost(postId, r2Key);
    if (!result.ok) { if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ 삭제 실패: ' + (result.error || '')); return; }
    if (!ArchiveDB.getById(postId)) { _closeEdit(); _refreshGrid(); return; } // 게시물 자체가 없어졌으면 편집창도 닫음
    const wrap = _q('ar-edit-files');
    if (wrap) wrap.innerHTML = _editFilesListHtml(postId);
    _refreshGrid();
  }
  function _addMoreFilesInEdit(postId) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = async () => {
      const files = Array.from(inp.files || []);
      inp.remove();
      if (!files.length) return;
      const extraPerFile = [];
      for (let i = 0; i < files.length; i++) extraPerFile.push(await _extractPreview(files[i]).catch(() => ({})));
      const result = await ArchiveDB.addFilesToPost(postId, files, extraPerFile);
      if (result) {
        const wrap = _q('ar-edit-files');
        if (wrap) wrap.innerHTML = _editFilesListHtml(postId);
        _refreshGrid();
        if (typeof App !== 'undefined' && App._toast) App._toast('✅ 파일이 추가되었습니다');
      }
    };
    inp.click();
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
    const n = f.files?.length || 0;
    const warn = n > 1 ? `이 게시물에 첨부된 파일 ${n}개가 모두 삭제됩니다.` : '이 작업은 되돌릴 수 없습니다.';
    if (!confirm(`"${f.name}"을(를) 삭제할까요?\n${warn}`)) return;
    _deleteNow(id);
  }
  async function _deleteNow(id) {
    _q('ar-preview-ov')?.remove();
    const result = await ArchiveDB.deletePost(id);
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
    init, render, _selectCategory, _onSearchInput, _togglePin, _setViewMode, _selectTool,
    openUpload, _closeUpload, _onPickFiles, _removePickedFile, _submitUpload,
    openPreview, _switchPreviewFile, _addMoreFiles, _toggleFileSelect, _selectAllFilesInPreview, _downloadSelectedFilesInPost,
    openEdit, _closeEdit, _submitEdit,
    _removeFileInEdit, _addMoreFilesInEdit,
    _confirmDelete, _toggleFullscreen, _printPreview,
    _toggleConvertMenu, _convertAndDownload,
    _toggleSelectMode, _toggleSelect, _selectAllVisible, _downloadSelectedZip, _downloadPostZip,
  };
})();
