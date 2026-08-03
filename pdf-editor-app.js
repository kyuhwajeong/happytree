/**
 * pdf-editor-app.js — PDF 워크시트 제작 (콘텐츠 자료실 내 도구)
 *
 * 여러 PDF/이미지를 페이지 단위로 모아 자르고·합치고·텍스트와 이미지를 얹어
 * 새 워크시트 PDF를 만든다. 완성본은 다운로드되는 동시에 콘텐츠 자료실(파일)에
 * 자동 등록된다.
 *
 * 구조:
 *  - source: 사용자가 추가한 원본 파일 하나(PDF 또는 이미지). PDF는 pdf-lib(PDFDocument)
 *    와 pdf.js(pdfjsLib) 두 가지로 각각 로드해 둔다 — pdf-lib은 최종 병합/내보내기용,
 *    pdf.js는 화면 미리보기(썸네일) 렌더링용.
 *  - page: 작업 중인 "한 장"의 최종 페이지. source의 특정 쪽을 가리키거나(kind:'pdf'),
 *    통으로 삽입한 이미지(kind:'image') 또는 빈 페이지(kind:'blank')일 수 있다.
 *    페이지 위에 얹은 텍스트/이미지는 annots[] 배열로 따로 관리하고, 내보낼 때
 *    캔버스에 그려서 PNG로 합성해 pdf-lib page.drawImage()로 얹는다(한글 폰트를
 *    pdf-lib에 직접 임베드하지 않고, 사이트에 이미 있는 나눔고딕 base64를
 *    캔버스 렌더링에만 사용 — 별도 fontkit 라이브러리가 필요 없다).
 */
const PdfEditorApp = (() => {
  const _q = id => document.getElementById(id);
  const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const _nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const _toast = (msg, type, dur) => { if (typeof App !== 'undefined' && App._toast) App._toast(msg, type, dur); };
  const _fmtSize = b => { if (!b && b !== 0) return ''; const u = ['B','KB','MB','GB']; let i = 0, n = b; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)}${u[i]}`; };

  const A4 = { w: 595.28, h: 841.89 };
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const FONT_FAMILY = 'PEWorksheetFont';

  /* ══════════════════ 상태 ══════════════════ */
  let _sources = [];     // {id, name, kind:'pdf'|'image', pdfDoc(pdf-lib), pdfjsDoc, img(Image, kind='image')}
  let _pages = [];       // 작업 중인 페이지 배열(순서 = 최종 출력 순서)
  let _selectMode = false;
  let _selected = new Set();
  let _cssInjected = false;
  let _fontReady = null;  // Promise
  let _dragSrcIdx = null; // 그리드 드래그 재정렬용
  let _editingId = null;  // 편집 중인 페이지 id
  let _editorScale = 1;   // 편집기 캔버스 px per pt
  let _selAnnotId = null;
  let _drag = null;       // 편집기 내 드래그/리사이즈 상태
  let _busy = false;

  /* ══════════════════ CSS ══════════════════ */
  function _css() {
    if (_cssInjected) return; _cssInjected = true;
    const s = document.createElement('style');
    s.textContent = `
.pe-wrap{display:flex;flex-direction:column;height:100%}
.pe-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--bdr);flex-shrink:0}
.pe-btn{display:inline-flex;align-items:center;gap:5px;padding:8px 12px;border-radius:var(--rs);border:1px solid var(--bdr);background:var(--card2);color:var(--tx);font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap}
.pe-btn:hover{background:var(--card3)}
.pe-btn.primary{background:var(--a);border-color:var(--a);color:#fff}
.pe-btn.primary:hover{filter:brightness(1.08)}
.pe-btn.danger{color:var(--red);border-color:var(--red)}
.pe-btn:disabled{opacity:.45;cursor:not-allowed}
.pe-btn input[type=file]{display:none}
.pe-spacer{flex:1}
.pe-count{font-size:11.5px;color:var(--tx3);font-weight:700}
.pe-body{flex:1;overflow-y:auto;padding:14px}
.pe-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--tx3);padding:60px 20px;text-align:center}
.pe-empty-ico{font-size:44px}
.pe-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
.pe-card{background:var(--card);border:2px solid var(--bdr);border-radius:12px;overflow:hidden;cursor:grab;position:relative;transition:border-color .12s}
.pe-card.sel{border-color:var(--a)}
.pe-card.dragover{border-color:var(--green);border-style:dashed}
.pe-card-thumb{width:100%;aspect-ratio:210/297;background:var(--surf2);display:block;object-fit:contain}
.pe-card-bar{display:flex;align-items:center;justify-content:space-between;padding:6px 8px;font-size:10.5px;color:var(--tx3);gap:4px}
.pe-card-num{font-weight:700;color:var(--tx2)}
.pe-card-src{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:right}
.pe-card-acts{position:absolute;top:6px;right:6px;display:flex;gap:4px;z-index:2}
.pe-card-chk{position:absolute;top:6px;left:6px;z-index:2;width:20px;height:20px;cursor:pointer}
.pe-mini-btn{border:none;background:rgba(0,0,0,.55);color:#fff;width:26px;height:26px;border-radius:50%;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.pe-mini-btn:hover{background:rgba(0,0,0,.75)}
.pe-mini-btn.edit{background:var(--a)}
.pe-insert-slot{height:16px;margin:-7px 0;position:relative;z-index:3}
.pe-insert-line{position:absolute;left:0;right:0;top:50%;height:2px;background:var(--a);transform:scaleX(0);transition:transform .1s}
.pe-insert-slot:hover .pe-insert-line{transform:scaleX(1)}
/* ── 편집기 오버레이 ── */
.pe-editor-ov{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9000;display:flex;flex-direction:column}
.pe-editor-top{display:flex;align-items:center;gap:8px;padding:10px 16px;background:var(--surf);border-bottom:1px solid var(--bdr);flex-shrink:0;flex-wrap:wrap}
.pe-editor-title{font-weight:800;font-size:13.5px;color:var(--tx);flex:1}
.pe-editor-main{flex:1;display:flex;overflow:hidden}
.pe-editor-canvas-wrap{flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:24px;background:#3a3a4a}
.pe-page-stage{position:relative;box-shadow:0 4px 26px rgba(0,0,0,.4);flex-shrink:0}
.pe-page-stage canvas{display:block;background:#fff}
.pe-annot{position:absolute;border:1.5px dashed rgba(79,70,229,.6);cursor:move;box-sizing:border-box}
.pe-annot.sel{border:2px solid var(--a);box-shadow:0 0 0 2px var(--a40)}
.pe-annot-handle{position:absolute;right:-6px;bottom:-6px;width:13px;height:13px;background:var(--a);border-radius:50%;cursor:nwse-resize;border:2px solid #fff}
.pe-side{width:270px;flex-shrink:0;background:var(--surf);border-left:1px solid var(--bdr);padding:16px;overflow-y:auto}
.pe-side h4{margin:0 0 12px;font-size:13px;color:var(--tx)}
.pe-field{margin-bottom:12px}
.pe-field label{display:block;font-size:11px;font-weight:700;color:var(--tx3);margin-bottom:5px}
.pe-field textarea{width:100%;min-height:70px;border:1px solid var(--bdr);border-radius:8px;padding:8px;font-size:13px;background:var(--card2);color:var(--tx);font-family:inherit;resize:vertical}
.pe-field input[type=number],.pe-field select{width:100%;border:1px solid var(--bdr);border-radius:8px;padding:7px 8px;font-size:12.5px;background:var(--card2);color:var(--tx)}
.pe-field input[type=color]{width:100%;height:32px;border:1px solid var(--bdr);border-radius:8px;background:var(--card2);cursor:pointer}
.pe-row2{display:flex;gap:8px}
.pe-row2>div{flex:1}
.pe-chk-row{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tx2);margin-bottom:12px}
.pe-side-empty{color:var(--tx3);font-size:12px;line-height:1.6;text-align:center;padding:30px 6px}
.pe-side-tools{display:flex;gap:8px;margin-bottom:16px}
.pe-side-tools .pe-btn{flex:1;justify-content:center}
/* ── 자료실 가져오기 모달 ── */
.pe-modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9500;display:flex;align-items:center;justify-content:center;padding:20px}
.pe-modal{background:var(--surf);border-radius:var(--r);max-width:520px;width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:var(--sh2)}
.pe-modal-hd{padding:16px 18px;border-bottom:1px solid var(--bdr);font-weight:800;font-size:14px;color:var(--tx);display:flex;align-items:center;justify-content:space-between}
.pe-modal-hd button{border:none;background:none;font-size:18px;cursor:pointer;color:var(--tx3)}
.pe-modal-body{overflow-y:auto;padding:10px 18px;flex:1}
.pe-modal-ft{padding:14px 18px;border-top:1px solid var(--bdr);display:flex;justify-content:flex-end;gap:8px}
.pe-pick-item{display:flex;align-items:center;gap:10px;padding:9px 6px;border-bottom:1px solid var(--bdr)}
.pe-pick-item:last-child{border-bottom:none}
.pe-pick-item input{width:16px;height:16px;flex-shrink:0}
.pe-pick-thumb{width:34px;height:34px;border-radius:6px;object-fit:cover;background:var(--surf2);flex-shrink:0}
.pe-pick-name{flex:1;font-size:12.5px;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pe-pick-meta{font-size:10.5px;color:var(--tx3);flex-shrink:0}
.pe-busy-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9800;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700;flex-direction:column;gap:12px}
.pe-spin{width:34px;height:34px;border-radius:50%;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;animation:pe-sp .8s linear infinite}
@keyframes pe-sp{to{transform:rotate(360deg)}}`;
    document.head.appendChild(s);
  }

  /* ══════════════════ 한글 폰트(캔버스용) ══════════════════ */
  function _ensureFont() {
    if (_fontReady) return _fontReady;
    _fontReady = (async () => {
      try {
        if (typeof NANUM_GOTHIC_BASE64 === 'undefined') throw new Error('font missing');
        const bin = atob(NANUM_GOTHIC_BASE64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const face = new FontFace(FONT_FAMILY, bytes.buffer);
        await face.load();
        document.fonts.add(face);
        return true;
      } catch (e) {
        console.warn('[PdfEditorApp] 폰트 로드 실패, 기본 폰트로 대체', e);
        return false;
      }
    })();
    return _fontReady;
  }

  function _ensurePdfjsWorker() {
    if (typeof pdfjsLib === 'undefined') return false;
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return true;
  }

  /* ══════════════════ 소스/페이지 추가 ══════════════════ */
  function _readFileAsDataUrl(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
  function _loadImgEl(dataUrl) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = dataUrl; }); }
  function _fitA4(w, h) { const scale = Math.min(A4.w / w, A4.h / h, 1); return { w: w * scale, h: h * scale }; }

  async function _addPdfBytes(name, arrayBuffer) {
    if (typeof PDFLib === 'undefined') { _toast('⚠️ PDF 편집 라이브러리를 불러오지 못했습니다'); return; }
    _ensurePdfjsWorker();
    const bytes1 = new Uint8Array(arrayBuffer.slice(0));
    const bytes2 = new Uint8Array(arrayBuffer.slice(0));
    let pdfDoc, pdfjsDoc;
    try {
      pdfDoc = await PDFLib.PDFDocument.load(bytes1, { ignoreEncryption: true });
    } catch (e) { throw new Error(`"${name}" 파일을 열 수 없습니다 (손상되었거나 암호로 보호됨)`); }
    pdfjsDoc = await pdfjsLib.getDocument({ data: bytes2 }).promise;
    const srcId = _nid();
    _sources.push({ id: srcId, name, kind: 'pdf', pdfDoc, pdfjsDoc });
    const n = pdfDoc.getPageCount();
    for (let i = 0; i < n; i++) {
      const pg = pdfDoc.getPage(i);
      const { width, height } = pg.getSize();
      _pages.push({ id: _nid(), kind: 'pdf', srcId, srcPageIndex: i, width, height, annots: [] });
    }
  }

  async function _addImageFile(file) {
    const dataUrl = await _readFileAsDataUrl(file);
    const img = await _loadImgEl(dataUrl);
    const fit = _fitA4(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const srcId = _nid();
    _sources.push({ id: srcId, name: file.name, kind: 'image', img });
    _pages.push({ id: _nid(), kind: 'image', srcId, width: fit.w, height: fit.h, annots: [] });
  }

  async function _onPickPdf(fileList) {
    const files = Array.from(fileList || []); if (!files.length) return;
    _setBusy('PDF 불러오는 중...');
    for (const f of files) {
      try { await _addPdfBytes(f.name, await f.arrayBuffer()); }
      catch (e) { _toast('⚠️ ' + (e.message || 'PDF를 불러오지 못했습니다')); }
    }
    _clearBusy();
  }
  async function _onPickImage(fileList) {
    const files = Array.from(fileList || []); if (!files.length) return;
    _setBusy('이미지 불러오는 중...');
    for (const f of files) {
      try { await _addImageFile(f); }
      catch (e) { _toast('⚠️ 이미지를 불러오지 못했습니다: ' + (e.message || '')); }
    }
    _clearBusy();
  }
  function _addBlankPage() {
    _pages.push({ id: _nid(), kind: 'blank', width: A4.w, height: A4.h, annots: [] });
    _rerender();
    _toast('✅ 빈 페이지가 추가되었습니다');
  }

  /* ══════════════════ 페이지 렌더링(썸네일/캔버스 공용) ══════════════════ */
  async function _getBaseCanvas(page) {
    if (page._baseCv) return page._baseCv;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    if (page.kind === 'blank') {
      cv.width = Math.round(page.width * 2); cv.height = Math.round(page.height * 2);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    } else if (page.kind === 'image') {
      const src = _sources.find(s => s.id === page.srcId);
      cv.width = Math.round(page.width * 2); cv.height = Math.round(page.height * 2);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      if (src && src.img) ctx.drawImage(src.img, 0, 0, cv.width, cv.height);
    } else if (page.kind === 'pdf') {
      const src = _sources.find(s => s.id === page.srcId);
      const pjPage = await src.pdfjsDoc.getPage(page.srcPageIndex + 1);
      const viewport = pjPage.getViewport({ scale: 2 });
      cv.width = viewport.width; cv.height = viewport.height;
      await pjPage.render({ canvasContext: ctx, viewport }).promise;
    }
    page._baseCv = cv;
    return cv;
  }

  function _wrapText(ctx, text, maxW) {
    const out = [];
    String(text ?? '').split('\n').forEach(paragraph => {
      if (paragraph === '') { out.push(''); return; }
      const words = paragraph.split(' ');
      let line = '';
      words.forEach(word => {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; }
        else line = test;
      });
      if (line) out.push(line);
    });
    return out;
  }
  function _paintText(ctx, a, originX, originY, scale) {
    ctx.save();
    ctx.beginPath(); ctx.rect(originX, originY, a.w * scale, a.h * scale); ctx.clip();
    const fs = Math.max(1, (a.fontSize || 14) * scale);
    let fam = 'sans-serif';
    try { if (document.fonts.check(`${fs}px ${FONT_FAMILY}`)) fam = `${FONT_FAMILY}, sans-serif`; } catch (e) {}
    ctx.font = `${a.bold ? 'bold ' : ''}${fs}px ${fam}`;
    ctx.fillStyle = a.color || '#111111';
    ctx.textBaseline = 'top';
    const align = a.align || 'left'; ctx.textAlign = align;
    const pad = 3 * scale;
    const maxW = Math.max(10, a.w * scale - pad * 2);
    const lines = _wrapText(ctx, a.text || '', maxW);
    const lh = fs * 1.32;
    let ty = originY + pad;
    const alignX = align === 'center' ? originX + a.w * scale / 2 : align === 'right' ? originX + a.w * scale - pad : originX + pad;
    lines.forEach(line => { if (ty < originY + a.h * scale) ctx.fillText(line, alignX, ty); ty += lh; });
    ctx.restore();
  }
  async function _renderPageComposite(page, targetW) {
    const scale = targetW / page.width;
    const targetH = Math.max(1, Math.round(page.height * scale));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(targetW)); cv.height = targetH;
    const ctx = cv.getContext('2d');
    const base = await _getBaseCanvas(page);
    ctx.drawImage(base, 0, 0, cv.width, cv.height);
    await _ensureFont();
    for (const a of page.annots) {
      if (a.type === 'image') {
        if (!a._imgEl) { try { a._imgEl = await _loadImgEl(a.dataUrl); } catch (e) { continue; } }
        ctx.drawImage(a._imgEl, a.x * scale, a.y * scale, a.w * scale, a.h * scale);
      } else if (a.type === 'text') {
        _paintText(ctx, a, a.x * scale, a.y * scale, scale);
      }
    }
    return cv;
  }
  function _renderGridThumbs() {
    _pages.forEach(p => {
      const img = _q('pe-thumb-' + p.id); if (!img) return;
      if (p._thumbUrl) { img.src = p._thumbUrl; return; }
      _renderPageComposite(p, 320).then(cv => {
        p._thumbUrl = cv.toDataURL('image/jpeg', 0.85);
        const el = _q('pe-thumb-' + p.id); if (el) el.src = p._thumbUrl;
      }).catch(e => console.warn('[PdfEditorApp] 썸네일 생성 실패', e));
    });
  }
  async function _renderEditorCanvas() {
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    const cvEl = _q('pe-stage-cv'); if (!cvEl) return;
    const scale = _editorScaleFor(page);
    const w = Math.round(page.width * scale), h = Math.round(page.height * scale);
    cvEl.width = w; cvEl.height = h;
    try {
      const composite = await _renderPageComposite(page, w);
      const ctx = cvEl.getContext('2d'); ctx.clearRect(0, 0, w, h); ctx.drawImage(composite, 0, 0);
    } catch (e) { console.warn('[PdfEditorApp] 캔버스 렌더 실패', e); }
  }

  /* ══════════════════ 메인 화면(그리드) ══════════════════ */
  let _cid = null;
  function render(cid) {
    _cid = cid; _css();
    const el = _q(cid); if (!el) return;
    el.innerHTML = _shellHtml();
    _renderGridThumbs();
    if (_editingId) _renderEditorCanvas();
  }
  function _rerender() { if (_cid) render(_cid); }

  function _shellHtml() {
    const body = `<div class="pe-wrap">${_toolbarHtml()}<div class="pe-body" id="pe-body">${_pages.length ? _gridHtml() : _emptyHtml()}</div></div>`;
    const editor = _editingId ? _editorOverlayHtml() : '';
    const picker = _pickerOpen ? _pickerModalHtml() : '';
    const save = _saveOpen ? _saveModalHtml() : '';
    const busy = _busy ? _busyHtml() : '';
    return body + editor + picker + save + busy;
  }
  function _toolbarHtml() {
    return `<div class="pe-toolbar">
      <label class="pe-btn primary">📄 PDF 추가<input type="file" accept="application/pdf" multiple onchange="PdfEditorApp._onPickPdf(this.files);this.value=''"></label>
      <label class="pe-btn">🖼 이미지 추가<input type="file" accept="image/*" multiple onchange="PdfEditorApp._onPickImage(this.files);this.value=''"></label>
      <button class="pe-btn" onclick="PdfEditorApp._openArchivePicker()">📚 자료실에서 가져오기</button>
      <button class="pe-btn" onclick="PdfEditorApp._addBlankPage()">＋ 빈 페이지</button>
      <div class="pe-spacer"></div>
      <span class="pe-count">${_pages.length}쪽${_selectMode ? ` · 선택 ${_selected.size}` : ''}</span>
      <button class="pe-btn${_selectMode ? ' primary' : ''}" onclick="PdfEditorApp._toggleSelectMode()">${_selectMode ? '✕ 선택 취소' : '☑️ 선택'}</button>
      ${_selectMode ? `<button class="pe-btn danger" ${_selected.size ? '' : 'disabled'} onclick="PdfEditorApp._deleteSelected()">🗑 선택 삭제</button>
        <button class="pe-btn" ${_selected.size ? '' : 'disabled'} onclick="PdfEditorApp._exportSelected()">✂️ 선택만 내보내기</button>` : ''}
      <button class="pe-btn primary" ${_pages.length ? '' : 'disabled'} onclick="PdfEditorApp._exportAll()">💾 병합 내보내기</button>
    </div>`;
  }
  function _emptyHtml() {
    return `<div class="pe-empty"><div class="pe-empty-ico">📝</div>
      <div>PDF나 이미지를 추가해서 워크시트를 만들어보세요.<br>여러 PDF를 올려 페이지 순서를 자유롭게 배치하고,<br>텍스트·이미지를 얹은 뒤 하나의 PDF로 내보낼 수 있어요.</div></div>`;
  }
  function _gridHtml() {
    return `<div class="pe-grid" id="pe-grid">${_pages.map((p, i) => _cardHtml(p, i)).join('')}</div>`;
  }
  function _cardHtml(p, i) {
    const src = _sources.find(s => s.id === p.srcId);
    const label = p.kind === 'blank' ? '빈 페이지' : (src ? src.name : '');
    return `<div class="pe-card${_selected.has(p.id) ? ' sel' : ''}" draggable="true" data-idx="${i}"
        ondragstart="PdfEditorApp._onDragStart(event,${i})" ondragover="PdfEditorApp._onDragOver(event,${i})"
        ondrop="PdfEditorApp._onDrop(event,${i})" ondragend="PdfEditorApp._onDragEnd(event)">
      ${_selectMode ? `<input type="checkbox" class="pe-card-chk" ${_selected.has(p.id) ? 'checked' : ''} onclick="event.stopPropagation();PdfEditorApp._toggleSelect('${p.id}')">` : ''}
      <div class="pe-card-acts">
        <button class="pe-mini-btn edit" title="편집" onclick="PdfEditorApp._openEditor('${p.id}')">✏️</button>
        <button class="pe-mini-btn" title="삭제" onclick="PdfEditorApp._deletePage('${p.id}')">✕</button>
      </div>
      <img class="pe-card-thumb" id="pe-thumb-${p.id}" onclick="${_selectMode ? `PdfEditorApp._toggleSelect('${p.id}')` : `PdfEditorApp._openEditor('${p.id}')`}">
      <div class="pe-card-bar"><span class="pe-card-num">${i + 1}쪽</span><span class="pe-card-src" title="${_esc(label)}">${_esc(label)}</span></div>
    </div>`;
  }
  function _onDragStart(e, i) { _dragSrcIdx = i; try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); } catch (err) {} }
  function _onDragOver(e) { e.preventDefault(); }
  function _onDrop(e, i) {
    e.preventDefault();
    if (_dragSrcIdx === null || _dragSrcIdx === i) return;
    const [moved] = _pages.splice(_dragSrcIdx, 1);
    _pages.splice(i, 0, moved);
    _dragSrcIdx = null;
    _rerender();
  }
  function _onDragEnd() { _dragSrcIdx = null; }
  function _deletePage(id) {
    if (!confirm('이 페이지를 삭제할까요?')) return;
    _pages = _pages.filter(p => p.id !== id);
    _selected.delete(id);
    if (_editingId === id) _editingId = null;
    _rerender();
  }
  function _toggleSelectMode() { _selectMode = !_selectMode; if (!_selectMode) _selected.clear(); _rerender(); }
  function _toggleSelect(id) { if (_selected.has(id)) _selected.delete(id); else _selected.add(id); _rerender(); }
  function _deleteSelected() {
    if (!_selected.size) return;
    if (!confirm(`선택한 ${_selected.size}개 페이지를 삭제할까요?`)) return;
    _pages = _pages.filter(p => !_selected.has(p.id));
    _selected.clear(); _selectMode = false;
    _rerender();
  }
  function _setBusy(msg) { _busy = msg || '처리 중...'; _rerender(); }
  function _clearBusy() { _busy = null; _rerender(); }
  function _busyHtml() { return `<div class="pe-busy-ov"><div class="pe-spin"></div><div>${_esc(_busy)}</div></div>`; }

  /* ══════════════════ 페이지 편집기(텍스트/이미지 오버레이) ══════════════════ */
  const EDITOR_MAX_W = 640;
  function _editorScaleFor(page) { return EDITOR_MAX_W / page.width; }
  function _editorW() { return EDITOR_MAX_W; }
  function _editorH(page) { return Math.round(EDITOR_MAX_W * page.height / page.width); }

  function _openEditor(id) { _editingId = id; _selAnnotId = null; _rerender(); }
  function _closeEditor() { _editingId = null; _selAnnotId = null; _drag = null; _rerender(); }

  function _editorOverlayHtml() {
    const page = _pages.find(p => p.id === _editingId);
    if (!page) { _editingId = null; return ''; }
    const idx = _pages.indexOf(page);
    const sel = page.annots.find(a => a.id === _selAnnotId);
    return `<div class="pe-editor-ov">
      <div class="pe-editor-top">
        <div class="pe-editor-title">✏️ ${idx + 1}쪽 편집</div>
        <button class="pe-btn" onclick="PdfEditorApp._editorAddText()">＋ 텍스트</button>
        <label class="pe-btn">＋ 이미지<input type="file" accept="image/*" style="display:none" onchange="PdfEditorApp._editorAddImage(this.files);this.value=''"></label>
        <button class="pe-btn danger" ${sel ? '' : 'disabled'} onclick="PdfEditorApp._editorDeleteAnnot()">🗑 선택 삭제</button>
        <div class="pe-spacer"></div>
        <button class="pe-btn primary" onclick="PdfEditorApp._closeEditor()">✓ 완료</button>
      </div>
      <div class="pe-editor-main">
        <div class="pe-editor-canvas-wrap">
          <div class="pe-page-stage" id="pe-stage" style="width:${_editorW()}px;height:${_editorH(page)}px" onmousedown="PdfEditorApp._stageMouseDown(event)">
            <canvas id="pe-stage-cv"></canvas>
            ${page.annots.map(a => _annotOverlayHtml(a, page)).join('')}
          </div>
        </div>
        <div class="pe-side">${sel ? _annotPanelHtml(sel) : `<div class="pe-side-empty">페이지를 클릭한 뒤<br>"＋ 텍스트" 또는 "＋ 이미지"로<br>내용을 추가해보세요.<br><br>박스를 드래그해 위치를,<br>모서리 점을 드래그해 크기를<br>바꿀 수 있어요.</div>`}</div>
      </div>
    </div>`;
  }
  function _annotOverlayHtml(a, page) {
    const scale = _editorScaleFor(page);
    const x = Math.round(a.x * scale), y = Math.round(a.y * scale), w = Math.round(a.w * scale), h = Math.round(a.h * scale);
    return `<div class="pe-annot${a.id === _selAnnotId ? ' sel' : ''}" data-id="${a.id}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"
      onmousedown="PdfEditorApp._annotMouseDown(event,'${a.id}')">
      <div class="pe-annot-handle" onmousedown="event.stopPropagation();PdfEditorApp._annotResizeStart(event,'${a.id}')"></div>
    </div>`;
  }
  function _annotPanelHtml(a) {
    if (a.type === 'text') {
      return `<h4>텍스트 속성</h4>
        <div class="pe-field"><label>내용</label><textarea oninput="PdfEditorApp._annotUpdate('${a.id}',{text:this.value})">${_esc(a.text)}</textarea></div>
        <div class="pe-row2">
          <div class="pe-field"><label>글자 크기</label><input type="number" min="6" max="140" value="${a.fontSize}" oninput="PdfEditorApp._annotUpdate('${a.id}',{fontSize:(+this.value||14)})"></div>
          <div class="pe-field"><label>정렬</label><select onchange="PdfEditorApp._annotUpdate('${a.id}',{align:this.value})">
            <option value="left" ${a.align === 'left' ? 'selected' : ''}>왼쪽</option>
            <option value="center" ${a.align === 'center' ? 'selected' : ''}>가운데</option>
            <option value="right" ${a.align === 'right' ? 'selected' : ''}>오른쪽</option>
          </select></div>
        </div>
        <div class="pe-field"><label>색상</label><input type="color" value="${a.color}" oninput="PdfEditorApp._annotUpdate('${a.id}',{color:this.value})"></div>
        <div class="pe-chk-row"><input type="checkbox" id="pe-bold-${a.id}" ${a.bold ? 'checked' : ''} onchange="PdfEditorApp._annotUpdate('${a.id}',{bold:this.checked})"><label for="pe-bold-${a.id}">굵게</label></div>`;
    }
    return `<h4>이미지</h4><div class="pe-side-empty">박스를 드래그해서 위치를,<br>모서리 점을 드래그해서<br>크기를 바꿀 수 있어요.</div>`;
  }
  function _updateSelectionUI() {
    const stage = _q('pe-stage'); if (!stage) return;
    stage.querySelectorAll('.pe-annot').forEach(el => el.classList.toggle('sel', el.getAttribute('data-id') === _selAnnotId));
    const side = document.querySelector('.pe-side');
    const page = _pages.find(p => p.id === _editingId);
    const sel = page ? page.annots.find(a => a.id === _selAnnotId) : null;
    if (side) side.innerHTML = sel ? _annotPanelHtml(sel) : `<div class="pe-side-empty">페이지를 클릭한 뒤<br>"＋ 텍스트" 또는 "＋ 이미지"로<br>내용을 추가해보세요.<br><br>박스를 드래그해 위치를,<br>모서리 점을 드래그해 크기를<br>바꿀 수 있어요.</div>`;
    const delBtn = document.querySelector('.pe-editor-top .pe-btn.danger');
    if (delBtn) delBtn.disabled = !_selAnnotId;
  }
  function _stageMouseDown(e) {
    if (e.target.closest('.pe-annot')) return;
    _selAnnotId = null;
    _updateSelectionUI();
  }
  function _editorAddText() {
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    const w = Math.min(220, page.width * 0.55), h = 44;
    const a = { id: _nid(), type: 'text', x: (page.width - w) / 2, y: (page.height - h) / 2, w, h, text: '텍스트를 입력하세요', fontSize: 16, color: '#111111', bold: false, align: 'left' };
    page.annots.push(a); _selAnnotId = a.id; page._thumbUrl = null;
    _rerender();
  }
  async function _editorAddImage(fileList) {
    const file = fileList && fileList[0]; if (!file) return;
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    try {
      const dataUrl = await _readFileAsDataUrl(file);
      const img = await _loadImgEl(dataUrl);
      const maxW = page.width * 0.6;
      const s = Math.min(maxW / (img.naturalWidth || img.width), 1);
      const w = (img.naturalWidth || img.width) * s, h = (img.naturalHeight || img.height) * s;
      const a = { id: _nid(), type: 'image', x: (page.width - w) / 2, y: (page.height - h) / 2, w, h, dataUrl, _imgEl: img };
      page.annots.push(a); _selAnnotId = a.id; page._thumbUrl = null;
      _rerender();
    } catch (e) { _toast('⚠️ 이미지를 추가하지 못했습니다'); }
  }
  function _editorDeleteAnnot() {
    if (!_selAnnotId) return;
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    page.annots = page.annots.filter(a => a.id !== _selAnnotId);
    _selAnnotId = null; page._thumbUrl = null;
    _rerender();
  }
  function _annotUpdate(id, patch) {
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    const a = page.annots.find(x => x.id === id); if (!a) return;
    Object.assign(a, patch);
    page._thumbUrl = null;
    _renderEditorCanvas();
  }
  function _annotMouseDown(e, id) {
    e.stopPropagation();
    _selAnnotId = id;
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    const annot = page.annots.find(a => a.id === id); if (!annot) return;
    const scale = _editorScaleFor(page);
    _drag = { type: 'move', annotId: id, page, startX: e.clientX, startY: e.clientY, orig: { x: annot.x * scale, y: annot.y * scale, w: annot.w * scale, h: annot.h * scale } };
    _updateSelectionUI();
  }
  function _annotResizeStart(e, id) {
    e.stopPropagation();
    _selAnnotId = id;
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    const annot = page.annots.find(a => a.id === id); if (!annot) return;
    const scale = _editorScaleFor(page);
    _drag = { type: 'resize', annotId: id, page, startX: e.clientX, startY: e.clientY, orig: { x: annot.x * scale, y: annot.y * scale, w: annot.w * scale, h: annot.h * scale } };
    _updateSelectionUI();
  }
  function _onDocMouseMove(e) {
    if (!_drag) return;
    const stage = _q('pe-stage'); if (!stage) return;
    const el = stage.querySelector(`.pe-annot[data-id="${_drag.annotId}"]`); if (!el) return;
    const dx = e.clientX - _drag.startX, dy = e.clientY - _drag.startY;
    if (_drag.type === 'move') {
      const nx = Math.max(0, _drag.orig.x + dx), ny = Math.max(0, _drag.orig.y + dy);
      el.style.left = nx + 'px'; el.style.top = ny + 'px';
      _drag.curX = nx; _drag.curY = ny;
    } else {
      const nw = Math.max(16, _drag.orig.w + dx), nh = Math.max(16, _drag.orig.h + dy);
      el.style.width = nw + 'px'; el.style.height = nh + 'px';
      _drag.curW = nw; _drag.curH = nh;
    }
  }
  function _onDocMouseUp() {
    if (!_drag) return;
    const { page, annotId, type } = _drag;
    const scale = _editorScaleFor(page);
    const annot = page.annots.find(a => a.id === annotId);
    if (annot) {
      if (type === 'move') {
        annot.x = (_drag.curX ?? _drag.orig.x) / scale;
        annot.y = (_drag.curY ?? _drag.orig.y) / scale;
      } else {
        annot.w = (_drag.curW ?? _drag.orig.w) / scale;
        annot.h = (_drag.curH ?? _drag.orig.h) / scale;
      }
      page._thumbUrl = null;
    }
    _drag = null;
    _renderEditorCanvas();
    _renderGridThumbs();
  }

  /* ══════════════════ 자료실에서 가져오기 ══════════════════ */
  let _pickerOpen = false, _pickerItems = [], _pickerSelected = new Set();
  function _openArchivePicker() {
    if (typeof ArchiveDB === 'undefined') { _toast('⚠️ 콘텐츠 자료실을 불러오지 못했습니다'); return; }
    const posts = ArchiveDB.getVisiblePosts ? ArchiveDB.getVisiblePosts() : ArchiveDB.getAll();
    _pickerItems = [];
    posts.forEach(post => {
      (post.files || []).forEach(f => {
        const ext = (f.ext || '').toLowerCase();
        if (ext === 'pdf' || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) _pickerItems.push({ postName: post.name, f });
      });
    });
    _pickerSelected = new Set();
    _pickerOpen = true;
    _rerender();
  }
  function _closeArchivePicker() { _pickerOpen = false; _rerender(); }
  function _pickerToggle(i) { if (_pickerSelected.has(i)) _pickerSelected.delete(i); else _pickerSelected.add(i); _rerender(); }
  function _pickerModalHtml() {
    return `<div class="pe-modal-ov" onmousedown="if(event.target===this)PdfEditorApp._closeArchivePicker()">
      <div class="pe-modal">
        <div class="pe-modal-hd"><span>📚 자료실에서 가져오기</span><button onclick="PdfEditorApp._closeArchivePicker()">✕</button></div>
        <div class="pe-modal-body">${_pickerItems.length ? _pickerItems.map((it, i) => `
          <div class="pe-pick-item">
            <input type="checkbox" ${_pickerSelected.has(i) ? 'checked' : ''} onchange="PdfEditorApp._pickerToggle(${i})">
            <img class="pe-pick-thumb" src="${it.f.thumbnail || ''}">
            <span class="pe-pick-name" title="${_esc(it.f.originalName)}">${_esc(it.f.originalName)}</span>
            <span class="pe-pick-meta">${_esc(it.postName)}</span>
          </div>`).join('') : `<div class="pe-side-empty">자료실에 PDF·이미지 파일이 없습니다.</div>`}</div>
        <div class="pe-modal-ft">
          <button class="pe-btn" onclick="PdfEditorApp._closeArchivePicker()">취소</button>
          <button class="pe-btn primary" ${_pickerSelected.size ? '' : 'disabled'} onclick="PdfEditorApp._pickerConfirm()">가져오기 (${_pickerSelected.size})</button>
        </div>
      </div>
    </div>`;
  }
  async function _pickerConfirm() {
    const chosen = [..._pickerSelected].map(i => _pickerItems[i]).filter(Boolean);
    _pickerOpen = false;
    if (!chosen.length) { _rerender(); return; }
    _setBusy('자료실 파일 불러오는 중...');
    for (const it of chosen) {
      try {
        const url = ArchiveDB.getFileUrl(it.f.r2Key);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('다운로드 실패');
        const buf = await resp.arrayBuffer();
        const ext = (it.f.ext || '').toLowerCase();
        if (ext === 'pdf') { await _addPdfBytes(it.f.originalName, buf); }
        else {
          const blob = new Blob([buf]);
          const file = new File([blob], it.f.originalName, { type: it.f.mimeType || 'image/png' });
          await _addImageFile(file);
        }
      } catch (e) { _toast(`⚠️ "${it.f.originalName}" 불러오기 실패: ${e.message || ''}`); }
    }
    _clearBusy();
  }

  /* ══════════════════ 내보내기(병합/분리) ══════════════════ */
  function _canvasToPngBytes(cv) {
    const dataUrl = cv.toDataURL('image/png');
    const bin = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function _imgElToPngBytes(imgEl) {
    const cv = document.createElement('canvas');
    cv.width = imgEl.naturalWidth || imgEl.width; cv.height = imgEl.naturalHeight || imgEl.height;
    cv.getContext('2d').drawImage(imgEl, 0, 0);
    return _canvasToPngBytes(cv);
  }
  function _renderTextAnnotPng(a) {
    const density = 4; // pt당 px — 인쇄 품질을 위해 고해상도로 렌더링
    const w = Math.max(1, Math.round(a.w * density)), h = Math.max(1, Math.round(a.h * density));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    _paintText(cv.getContext('2d'), a, 0, 0, density);
    return _canvasToPngBytes(cv);
  }
  async function _buildPdfBytes(pageList) {
    const outDoc = await PDFLib.PDFDocument.create();
    for (const p of pageList) {
      let outPage;
      if (p.kind === 'pdf') {
        const src = _sources.find(s => s.id === p.srcId);
        const [copied] = await outDoc.copyPages(src.pdfDoc, [p.srcPageIndex]);
        outPage = outDoc.addPage(copied);
      } else {
        outPage = outDoc.addPage([p.width, p.height]);
        if (p.kind === 'image') {
          const src = _sources.find(s => s.id === p.srcId);
          if (src && src.img) {
            const embedded = await outDoc.embedPng(_imgElToPngBytes(src.img));
            outPage.drawImage(embedded, { x: 0, y: 0, width: p.width, height: p.height });
          }
        }
      }
      for (const a of p.annots) {
        if (a.type === 'image' && a._imgEl) {
          const embedded = await outDoc.embedPng(_imgElToPngBytes(a._imgEl));
          outPage.drawImage(embedded, { x: a.x, y: p.height - a.y - a.h, width: a.w, height: a.h });
        } else if (a.type === 'text' && (a.text || '').trim() !== '') {
          const embedded = await outDoc.embedPng(_renderTextAnnotPng(a));
          outPage.drawImage(embedded, { x: a.x, y: p.height - a.y - a.h, width: a.w, height: a.h });
        }
      }
    }
    return outDoc.save();
  }
  async function _runExport(pageList) {
    if (typeof PDFLib === 'undefined') { _toast('⚠️ PDF 편집 라이브러리를 불러오지 못했습니다'); return; }
    if (!pageList.length) { _toast('⚠️ 내보낼 페이지가 없습니다'); return; }
    _setBusy('PDF 만드는 중...');
    try {
      await _ensureFont();
      const bytes = await _buildPdfBytes(pageList);
      _clearBusy();
      _openSaveDialog(bytes, pageList.length);
    } catch (e) {
      console.error('[PdfEditorApp] export failed', e);
      _clearBusy();
      _toast('⚠️ PDF 생성 실패: ' + (e.message || ''));
    }
  }
  function _exportAll() { _runExport(_pages.slice()); }
  function _exportSelected() { _runExport(_pages.filter(p => _selected.has(p.id))); }

  /* ══════════════════ 저장(다운로드 + 자료실 등록) ══════════════════ */
  let _saveOpen = false, _pendingBytes = null, _pendingCount = 0, _saveTitle = '', _saveCategory = '기타', _saveVisibility = 'public';
  function _fmtDateForName() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }
  function _openSaveDialog(bytes, count) {
    _pendingBytes = bytes; _pendingCount = count;
    if (!_saveTitle) _saveTitle = `워크시트_${_fmtDateForName()}`;
    const cats = (typeof ArchiveDB !== 'undefined' && ArchiveDB.getCategories) ? ArchiveDB.getCategories() : [];
    if (cats.length && !cats.includes(_saveCategory)) _saveCategory = cats[0];
    _saveOpen = true;
    _rerender();
  }
  function _saveModalHtml() {
    const cats = (typeof ArchiveDB !== 'undefined' && ArchiveDB.getCategories) ? ArchiveDB.getCategories() : ['기타'];
    return `<div class="pe-modal-ov">
      <div class="pe-modal">
        <div class="pe-modal-hd"><span>💾 워크시트 저장</span><button onclick="PdfEditorApp._cancelSave()">✕</button></div>
        <div class="pe-modal-body">
          <div class="pe-field"><label>제목</label><input type="text" value="${_esc(_saveTitle)}" oninput="PdfEditorApp._saveTitleInput(this.value)" style="width:100%;border:1px solid var(--bdr);border-radius:8px;padding:8px;font-size:13px;background:var(--card2);color:var(--tx);box-sizing:border-box"></div>
          <div class="pe-field"><label>분류</label><select onchange="PdfEditorApp._saveCatInput(this.value)">${cats.map(c => `<option value="${_esc(c)}" ${c === _saveCategory ? 'selected' : ''}>${_esc(c)}</option>`).join('')}</select></div>
          <div class="pe-field"><label>공개 범위</label><select onchange="PdfEditorApp._saveVisInput(this.value)">
            <option value="public" ${_saveVisibility === 'public' ? 'selected' : ''}>공개 (모두 볼 수 있음)</option>
            <option value="private" ${_saveVisibility === 'private' ? 'selected' : ''}>비공개 (나만 보기)</option>
          </select></div>
          <div style="font-size:11.5px;color:var(--tx3);line-height:1.5">총 ${_pendingCount}쪽 · 콘텐츠 자료실(파일)에 등록되고, 내 PC에도 함께 다운로드됩니다.</div>
        </div>
        <div class="pe-modal-ft">
          <button class="pe-btn" onclick="PdfEditorApp._cancelSave()">취소</button>
          <button class="pe-btn primary" onclick="PdfEditorApp._confirmSave()">저장하기</button>
        </div>
      </div>
    </div>`;
  }
  function _saveTitleInput(v) { _saveTitle = v; }
  function _saveCatInput(v) { _saveCategory = v; }
  function _saveVisInput(v) { _saveVisibility = v; }
  function _cancelSave() { _saveOpen = false; _pendingBytes = null; _rerender(); }
  async function _confirmSave() {
    const name = (_saveTitle || '워크시트').trim() || '워크시트';
    const bytes = _pendingBytes;
    _saveOpen = false;
    if (!bytes) { _rerender(); return; }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const fileName = `${name.replace(/[\\/:*?"<>|]/g, '_')}.pdf`;
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { console.warn('[PdfEditorApp] 다운로드 실패', e); }
    if (typeof ArchiveDB !== 'undefined') {
      _setBusy('콘텐츠 자료실에 저장하는 중...');
      try {
        const file = new File([blob], fileName, { type: 'application/pdf' });
        const uploadedBy = (typeof DB !== 'undefined' && DB.getSession) ? (DB.getSession()?.username || '') : '';
        const result = await ArchiveDB.createPost([file], { name, category: _saveCategory, uploadedBy, visibility: _saveVisibility });
        _clearBusy();
        _toast(result.savedToServer ? '✅ 다운로드 완료 · 콘텐츠 자료실에 저장됐습니다' : '⏳ 다운로드 완료 · 자료실 저장은 서버 반영 대기 중', 'success');
      } catch (e) {
        _clearBusy();
        console.error('[PdfEditorApp] 자료실 등록 실패', e);
        _toast('⚠️ 다운로드는 완료됐지만 자료실 저장에 실패했습니다: ' + (e.message || ''));
      }
    } else {
      _toast('✅ 다운로드 완료');
    }
    _pendingBytes = null;
    _rerender();
  }

  document.addEventListener('mousemove', _onDocMouseMove);
  document.addEventListener('mouseup', _onDocMouseUp);

  return {
    render,
    _onPickPdf, _onPickImage, _addBlankPage,
    _openArchivePicker, _closeArchivePicker, _pickerToggle, _pickerConfirm,
    _toggleSelectMode, _toggleSelect, _deleteSelected, _deletePage,
    _exportAll, _exportSelected,
    _onDragStart, _onDragOver, _onDrop, _onDragEnd,
    _openEditor, _closeEditor, _editorAddText, _editorAddImage, _editorDeleteAnnot,
    _annotMouseDown, _annotResizeStart, _annotUpdate, _stageMouseDown,
    _saveTitleInput, _saveCatInput, _saveVisInput, _cancelSave, _confirmSave,
  };
})();
