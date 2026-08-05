/**
 * content-search-app.js
 * ─────────────────────────────────────────────────────────────
 * "전체 검색" — 자료실(ArchiveApp)과는 완전히 독립된 모듈.
 *
 * ★★★ 설계 원칙: 이 모듈은 사용자가 직접 열기 전까지는 아무 일도 하지 않는다 ★★★
 *   - app.js의 전체 init()에도 걸려있지 않고(자체 init 불필요 — 상태가 없음),
 *     Firebase 리스너도 걸지 않는다.
 *   - 검색 버튼을 눌러야만 그때부터 ArchiveDB.getSearchIndex()로 필요한
 *     게시물의 검색 인덱스만 하나씩 가져온다(지연 로딩).
 *   → 진도 사이트의 기본 기능(로딩 속도, 다른 화면 동작)에는 전혀 영향이 없다.
 *   → 오류가 나도 try/catch로 감싸여 있어 자료실 등 기존 기능에 지장 없음.
 *
 * 검색 범위(스코프)를 사용자가 직접 고를 수 있게 해서("전체" 또는 특정 분류만),
 * 범위가 넓어 시간이 걸릴 땐 "N / 전체 M개 확인 중..." 진행률을 실시간으로 보여준다.
 */
const ContentSearchApp = (() => {
  let _isOpen = false;
  let _scope = '전체';          // '전체' 또는 ArchiveDB.getCategories() 중 하나
  let _query = '';
  let _running = false;
  let _progress = { done: 0, total: 0 };
  let _results = [];            // { postId, name, category, matches: [{page, snippet, ocr}] }
  let _cancelToken = 0;         // ★ 검색 도중 다시 검색하거나 닫으면 이전 루프를 조용히 무시시키기 위함

  // ★ 관리자 전용 "기존 자료 일괄 인덱싱" 상태 — 검색 상태와 완전히 분리
  let _backfillRunning = false;
  let _backfillProgress = { done: 0, total: 0, indexed: 0, skipped: 0, failed: 0 };
  let _backfillToken = 0;
  let _adminOpen = false; // ★ 관리자 패널은 기본적으로 접혀 있음(평소엔 검색만 깔끔하게 보이도록)

  function _q(id) { return document.getElementById(id); }
  function _esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function _isAdmin() { return typeof DB !== 'undefined' && DB.isAdmin && DB.isAdmin(); }

  function _css() {
    if (_q('cs-style')) return;
    const s = document.createElement('style');
    s.id = 'cs-style';
    s.textContent = `
.cs-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9600;display:flex;align-items:flex-end;justify-content:center}
.cs-sheet{width:100%;max-width:560px;max-height:88vh;background:var(--surf);border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden;animation:cs-up .2s ease}
@keyframes cs-up{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}
.cs-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--bdr)}
.cs-hdr-title{font-size:15px;font-weight:800;color:var(--tx)}
.cs-close{border:none;background:transparent;font-size:16px;color:var(--tx3);cursor:pointer;padding:4px}
.cs-body{padding:14px 16px;overflow-y:auto;flex:1}
.cs-inp-row{display:flex;gap:8px;margin-bottom:10px}
.cs-inp{flex:1;padding:10px 12px;border-radius:10px;border:1px solid var(--bdr);background:var(--card2);color:var(--tx);font-size:13px;font-family:inherit}
.cs-go{flex:0 0 auto;padding:10px 16px;border-radius:10px;border:none;background:var(--accent);color:#fff;font-size:13px;font-weight:700;cursor:pointer}
.cs-go:disabled{opacity:.5;cursor:default}
.cs-scope-label{font-size:11.5px;color:var(--tx3);margin:0 0 6px 2px}
.cs-scopes{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.cs-scope-chip{padding:6px 12px;border-radius:999px;border:1px solid var(--bdr);background:var(--card2);color:var(--tx2);font-size:12px;cursor:pointer;white-space:nowrap}
.cs-scope-chip.on{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:700}
.cs-progress-wrap{margin:6px 0 14px}
.cs-progress-label{font-size:12px;color:var(--tx2);margin-bottom:6px;display:flex;justify-content:space-between}
.cs-progress-bar{height:8px;border-radius:5px;background:var(--card3);overflow:hidden}
.cs-progress-fill{height:100%;background:var(--accent);transition:width .15s ease}
.cs-empty{padding:36px 10px;text-align:center;color:var(--tx3);font-size:12.5px}
.cs-result-card{border:1px solid var(--bdr);border-radius:12px;padding:10px 12px;margin-bottom:8px;background:var(--card)}
.cs-result-name{font-size:13px;font-weight:700;color:var(--tx);display:flex;align-items:center;gap:6px}
.cs-result-cat{font-size:10.5px;color:var(--tx3);background:var(--card2);border-radius:6px;padding:1px 6px}
.cs-match-row{display:flex;align-items:flex-start;gap:8px;margin-top:6px;padding:6px 8px;border-radius:8px;background:var(--card2);cursor:pointer}
.cs-match-row:hover{background:var(--card3)}
.cs-match-page{flex:0 0 auto;font-size:11px;font-weight:700;color:var(--accent);white-space:nowrap;padding-top:1px}
.cs-match-snippet{font-size:12px;color:var(--tx2);line-height:1.4}
.cs-match-snippet b{color:var(--tx);background:rgba(99,102,241,.18);border-radius:3px;padding:0 2px}
.cs-ocr-badge{font-size:9.5px;color:#a855f7;font-weight:700}
.cs-raw-badge{font-size:9.5px;color:var(--amber, #f59e0b);font-weight:700}
.cs-admin-box{margin-top:18px;padding-top:16px;border-top:1px dashed var(--bdr)}
.cs-admin-toggle{font-family:var(--mono);font-size:11px;color:var(--tx3);background:none;border:none;cursor:pointer;padding:0}
.cs-admin-toggle:hover{color:var(--tx2)}
.cs-admin-panel{margin-top:10px;padding:12px 14px;border:1px solid var(--bdr);border-radius:10px;background:var(--card2)}
.cs-admin-desc{font-size:11.5px;color:var(--tx3);margin-bottom:10px;line-height:1.5}
.cs-admin-btn{padding:8px 14px;border-radius:8px;border:1px solid var(--bdr);background:var(--card2);color:var(--tx2);font-size:12px;cursor:pointer}
.cs-admin-btn:disabled{opacity:.5;cursor:default}
.cs-admin-result{font-family:var(--mono);font-size:11.5px;color:var(--tx2);margin-top:8px;line-height:1.7}
`;

    document.head.appendChild(s);
  }

  function _adminBoxHtml() {
    return `
      <div class="cs-admin-box">
        <button class="cs-admin-toggle" onclick="ContentSearchApp._toggleAdmin()">${_adminOpen ? '▲' : '▼'} 관리자 도구 — 기존 자료 일괄 인덱싱</button>
        ${_adminOpen ? `
          <div class="cs-admin-panel" id="cs-admin-panel">
            <div class="cs-admin-desc">이 검색 기능이 생기기 전에 이미 올라와 있던 파일들은 아직 검색 대상이 아닙니다.
              아래 버튼을 누르면 자료실 전체를 훑어서 <b style="color:var(--tx)">아직 인덱싱 안 된 PDF·엑셀·한글(hwpx)·워드(docx)·PPT(pptx)·이미지</b>는 정확히,
              <b style="color:var(--tx)">구버전 한글(hwp)·워드(doc)·PPT(ppt)</b>는 원시 바이트 스캔으로 "있을 가능성"만 찾아 처리합니다.
              이미 처리된 파일은 건너뛰므로 여러 번 눌러도 안전합니다. (파일 수·OCR 필요 여부에 따라 시간이 걸릴 수 있어요)</div>
            <button class="cs-admin-btn" id="cs-backfill-btn" ${_backfillRunning ? 'disabled' : ''} onclick="ContentSearchApp._runBackfill()">${_backfillRunning ? '처리 중...' : '▶ 기존 자료 인덱싱 시작'}</button>
            <div id="cs-backfill-progress"></div>
          </div>` : ''}
      </div>`;
  }
  function _toggleAdmin() { _adminOpen = !_adminOpen; _render(); }
  function _renderBackfillProgress() {
    const slot = _q('cs-backfill-progress');
    if (!slot) return;
    if (!_backfillRunning && !_backfillProgress.total) { slot.innerHTML = ''; return; }
    const pct = _backfillProgress.total ? Math.round((_backfillProgress.done / _backfillProgress.total) * 100) : 0;
    slot.innerHTML = `
      <div class="cs-progress-wrap">
        <div class="cs-progress-label"><span>${_backfillRunning ? '⚙️ 처리 중' : '✅ 완료'} — 게시물 ${_backfillProgress.done} / ${_backfillProgress.total}건 확인</span><span>${pct}%</span></div>
        <div class="cs-progress-bar"><div class="cs-progress-fill" style="width:${pct}%"></div></div>
      </div>
      <div class="cs-admin-result">신규 인덱싱: ${_backfillProgress.indexed}건 · 이미 처리됨(건너뜀): ${_backfillProgress.skipped}건 · 실패: ${_backfillProgress.failed}건</div>`;
  }
  async function _runBackfill() {
    if (typeof ArchiveDB === 'undefined' || typeof ArchiveApp === 'undefined') return;
    const myToken = ++_backfillToken;
    _backfillRunning = true;
    _backfillProgress = { done: 0, total: 0, indexed: 0, skipped: 0, failed: 0 };
    const targets = ArchiveDB.getAll().filter(p => (p.files || []).some(f => ArchiveApp.isIndexableForSearch(f.ext)));
    _backfillProgress.total = targets.length;
    _render();
    for (const post of targets) {
      if (myToken !== _backfillToken) return; // ★ 도중에 다시 실행되거나 모달이 닫히면 조용히 중단
      try {
        const r = await ArchiveApp.indexExistingPost(post);
        _backfillProgress.indexed += r.done; _backfillProgress.skipped += r.skipped; _backfillProgress.failed += r.failed;
      } catch (e) { console.warn('[ContentSearchApp] 일괄 인덱싱 실패:', post.name, e.message); _backfillProgress.failed++; }
      _backfillProgress.done++;
      _renderBackfillProgress();
    }
    if (myToken !== _backfillToken) return;
    _backfillRunning = false;
    _render();
  }

  function open() {
    _css();
    _isOpen = true;
    _scope = '전체';
    _query = '';
    _running = false;
    _results = [];
    _progress = { done: 0, total: 0 };
    _render();
  }
  function close() {
    _isOpen = false;
    _cancelToken++; // ★ 진행 중이던 검색 루프가 있으면 다음 체크에서 스스로 멈춤
    _backfillToken++; // ★ 일괄 인덱싱 도중 닫아도 다음 체크에서 스스로 멈춤
    _q('cs-ov')?.remove();
  }
  function _setScope(v) { _scope = v; _render(); }

  function _render() {
    if (!_isOpen) return;
    _q('cs-ov')?.remove();
    const cats = (typeof ArchiveDB !== 'undefined') ? ArchiveDB.getCategories() : [];
    const scopes = ['전체', ...cats];
    const ov = document.createElement('div');
    ov.id = 'cs-ov'; ov.className = 'cs-ov';
    ov.onmousedown = e => { if (e.target === ov) close(); };
    ov.innerHTML = `
      <div class="cs-sheet">
        <div class="cs-hdr">
          <div class="cs-hdr-title">🔎 콘텐츠 전체 검색</div>
          <button class="cs-close" onclick="ContentSearchApp.close()">✕</button>
        </div>
        <div class="cs-body">
          <div class="cs-inp-row">
            <input type="text" class="cs-inp" id="cs-inp" placeholder="찾을 단어를 입력하세요 (예: 여름방학 일정)" value="${_esc(_query)}"
              onkeydown="if(event.key==='Enter')ContentSearchApp._run()">
            <button class="cs-go" id="cs-go-btn" ${_running ? 'disabled' : ''} onclick="ContentSearchApp._run()">${_running ? '검색 중...' : '검색'}</button>
          </div>
          <div class="cs-scope-label">검색 범위</div>
          <div class="cs-scopes">${scopes.map(s => `<button class="cs-scope-chip${s === _scope ? ' on' : ''}" onclick="ContentSearchApp._setScope('${_esc(s)}')">${_esc(s)}</button>`).join('')}</div>
          <div id="cs-progress-slot"></div>
          <div id="cs-results-slot">${_resultsHtml()}</div>
          ${_isAdmin() ? _adminBoxHtml() : ''}
        </div>
      </div>`;
    document.body.appendChild(ov);
    _renderProgress();
  }

  function _renderProgress() {
    const slot = _q('cs-progress-slot');
    if (!slot) return;
    if (!_running && !_progress.total) { slot.innerHTML = ''; return; }
    const pct = _progress.total ? Math.round((_progress.done / _progress.total) * 100) : 0;
    slot.innerHTML = `
      <div class="cs-progress-wrap">
        <div class="cs-progress-label"><span>${_running ? '🔍 검색 중' : '✅ 검색 완료'} — ${_progress.done} / ${_progress.total}개 확인함</span><span>${pct}%</span></div>
        <div class="cs-progress-bar"><div class="cs-progress-fill" style="width:${pct}%"></div></div>
      </div>`;
  }

  function _highlight(text, words) {
    let out = _esc(text);
    words.forEach(w => {
      if (!w) return;
      const re = new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      out = out.replace(re, '<b>$1</b>');
    });
    return out;
  }

  function _snippetAround(text, word) {
    const idx = text.toLowerCase().indexOf(word.toLowerCase());
    if (idx < 0) return text.slice(0, 90) + (text.length > 90 ? '…' : '');
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + word.length + 60);
    return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  }
  // ★ page 값이 PDF는 숫자(페이지), 엑셀은 시트명, 파워포인트는 "슬라이드 N" 같은 문자열 —
  //   숫자일 때만 "N페이지"로 보여주고, 문자열이면 그대로 표시
  function _pageLabel(page) {
    return (typeof page === 'number') ? `${page}페이지` : _esc(page);
  }

  // ★ page 값을 onclick 안에 그대로 끼워 넣으면, 숫자(PDF 페이지)는 괜찮지만
  //   문자열(엑셀 시트명·"전체"·"슬라이드 3" 등)은 따옴표가 없어서 자바스크립트
  //   문법 오류가 나고 클릭이 조용히 씹힌다 — 반드시 안전한 JS 리터럴로 변환해서 넣어야 함
  function _jsLiteral(v) {
    if (typeof v === 'number') return String(v);
    return `'${String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  function _resultsHtml() {
    if (_running && !_results.length) return '';
    if (!_running && _progress.total && !_results.length) {
      return `<div class="cs-empty">🔍 "${_esc(_query)}"와(과) 일치하는 문서 내용을 찾지 못했습니다</div>`;
    }
    if (!_results.length) return '';
    const words = _query.trim().split(/\s+/).filter(Boolean);
    // ★ 게시물 하나에 파일이 여러 개면, 어떤 파일에서 나온 결과인지 구분해서 보여줌
    return _results.map(r => `
      <div class="cs-result-card">
        <div class="cs-result-name">📄 ${_esc(r.name)} <span class="cs-result-cat">${_esc(r.category)}</span></div>
        ${r.matches.map(m => `
          <div class="cs-match-row" onclick="ArchiveApp.openPreviewAtPage('${r.postId}', ${m.fileIdx}, ${_jsLiteral(m.page)}); ContentSearchApp.close()">
            <span class="cs-match-page">${r.fileCount > 1 ? _esc(m.fileName) + ' · ' : ''}${_pageLabel(m.page)}${m.ocr ? ' <span class="cs-ocr-badge">OCR</span>' : ''}${m.raw ? ' <span class="cs-raw-badge">⚠️ 비정형 스캔</span>' : ''}</span>
            <span class="cs-match-snippet">${_highlight(_snippetAround(m.text, words[0] || ''), words)}</span>
          </div>`).join('')}
      </div>`).join('');
  }

  async function _run() {
    const inp = _q('cs-inp');
    _query = (inp?.value || '').trim();
    if (!_query || typeof ArchiveDB === 'undefined') return;
    const myToken = ++_cancelToken;
    _running = true;
    _results = [];
    const words = _query.toLowerCase().split(/\s+/).filter(Boolean);

    // ★ 검색 범위 안의 게시물만 골라냄 — 비공개 게시물은 기존 접근 권한 규칙 그대로 존중(ArchiveDB.getVisiblePosts)
    let candidates = ArchiveDB.getVisiblePosts().filter(p => (p.files || []).some(f => ArchiveApp.isIndexableForSearch(f.ext)));
    if (_scope !== '전체') candidates = candidates.filter(p => p.category === _scope);

    _progress = { done: 0, total: candidates.length };
    _render();

    for (const post of candidates) {
      if (myToken !== _cancelToken) return; // ★ 취소됨(닫힘/재검색) — 조용히 중단
      try {
        // ★ 검색할 때만 이 게시물의 인덱스를 가져옴(지연 로딩) — 반환값은 { [fileIdx]: {pages} } 구조
        const idxByFile = await ArchiveDB.getSearchIndex(post.id);
        const matches = [];
        if (idxByFile) {
          Object.keys(idxByFile).forEach(fileIdxStr => {
            const fileIdx = Number(fileIdxStr);
            const fileMeta = post.files?.[fileIdx];
            const pages = idxByFile[fileIdxStr]?.pages || [];
            pages.forEach(p => {
              const hay = (p.text || '').toLowerCase();
              if (words.every(w => hay.includes(w))) {
                matches.push({ fileIdx, fileName: fileMeta?.originalName || '', page: p.page, text: p.text, ocr: !!p.ocr, raw: !!p.raw });
              }
            });
          });
          if (matches.length) _results.push({ postId: post.id, name: post.name, category: post.category, fileCount: (post.files || []).length, matches: matches.slice(0, 5) });
        }
      } catch (e) { console.warn('[ContentSearchApp] 인덱스 조회 실패:', post.name, e.message); }
      _progress.done++;
      if (_progress.done % 3 === 0 || _progress.done === _progress.total) { _renderProgress(); _q('cs-results-slot') && (_q('cs-results-slot').innerHTML = _resultsHtml()); }
    }
    if (myToken !== _cancelToken) return;
    _running = false;
    _render();
  }

  return { open, close, _setScope, _run, _toggleAdmin, _runBackfill, _getScope: () => _scope };
})();
