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
  const FONT_FAMILY = 'PEWorksheetFont'; // 내장 나눔고딕(캔버스 전용 안전망) — Google Fonts가 실패해도 한글이 깨지지 않도록 최종 폴백으로 사용
  // ★ 사이트가 index.html에서 이미 불러오고 있는 구글 폰트들(다른 CDN·CSP 추가 없이 그대로 재사용)
  const TEXT_FONTS = [
    { v: 'Noto Sans KR',    l: '노토산스(기본고딕)' },
    { v: 'Nanum Gothic',    l: '나눔고딕' },
    { v: 'Nanum Myeongjo',  l: '나눔명조(바탕체)' },
    { v: 'IBM Plex Sans KR', l: 'IBM 플렉스 산스' },
  ];
  const DEFAULT_TEXT_FONT = 'Noto Sans KR';

  /* ══════════════════ 도형·스탬프 정의 ══════════════════ */
  // ★ "사각형/화살표"만 있던 걸 한곳에 묶어 고를 수 있게 확장한다.
  //   각 도형은 (x,y,w,h) 박스 안에 그려지는 draw(ctx,x,y,w,h,a) 함수를 갖고,
  //   기존 rect/arrow와 동일하게 박스 드래그·리사이즈 UI를 그대로 재사용한다.
  function _fillOrStroke(ctx, a) { if (a.fill) ctx.fill(); else ctx.stroke(); }
  function _roundRectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function _regularPolyPath(ctx, cx, cy, r, sides, rot) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const ang = rot + i * 2 * Math.PI / sides;
      const px = cx + r * Math.cos(ang), py = cy + r * Math.sin(ang);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function _starPath(ctx, cx, cy, rOuter, rInner, points, rot) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const ang = rot + i * Math.PI / points;
      const px = cx + r * Math.cos(ang), py = cy + r * Math.sin(ang);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function _heartPath(ctx, x, y, w, h) {
    const cx = x + w / 2;
    ctx.beginPath();
    ctx.moveTo(cx, y + h * 0.28);
    ctx.bezierCurveTo(cx, y, x, y, x, y + h * 0.28);
    ctx.bezierCurveTo(x, y + h * 0.55, cx, y + h * 0.75, cx, y + h);
    ctx.bezierCurveTo(cx, y + h * 0.75, x + w, y + h * 0.55, x + w, y + h * 0.28);
    ctx.bezierCurveTo(x + w, y, cx, y, cx, y + h * 0.28);
    ctx.closePath();
  }
  // ★ "오른쪽" 화살표를 단위 좌표(0~1)로 만들어두고 방향에 맞게 중심점 기준으로 회전시켜 재사용
  function _arrowPoly(ctx, x, y, w, h, dir) {
    const pts = [[0, 0.32], [0.58, 0.32], [0.58, 0.08], [1, 0.5], [0.58, 0.92], [0.58, 0.68], [0, 0.68]];
    const rot = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir] || 0;
    ctx.beginPath();
    pts.forEach(([u, v], i) => {
      const du = u - 0.5, dv = v - 0.5;
      const ru = du * Math.cos(rot) - dv * Math.sin(rot) + 0.5;
      const rv = du * Math.sin(rot) + dv * Math.cos(rot) + 0.5;
      const px = x + ru * w, py = y + rv * h;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
  }
  function _drawCat(ctx, x, y, w, h) {
    const cx = x + w / 2, cy = y + h * 0.58, r = Math.min(w, h) * 0.4;
    ctx.beginPath(); ctx.moveTo(cx - r * 0.75, cy - r * 0.55); ctx.lineTo(cx - r * 1.05, cy - r * 1.35); ctx.lineTo(cx - r * 0.15, cy - r * 0.85); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + r * 0.75, cy - r * 0.55); ctx.lineTo(cx + r * 1.05, cy - r * 1.35); ctx.lineTo(cx + r * 0.15, cy - r * 0.85); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(cx - r * 0.3, cy - r * 0.02, r * 0.09, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + r * 0.3, cy - r * 0.02, r * 0.09, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function _drawDog(ctx, x, y, w, h) {
    const cx = x + w / 2, cy = y + h * 0.55, r = Math.min(w, h) * 0.38;
    ctx.beginPath(); ctx.ellipse(cx - r * 0.95, cy - r * 0.1, r * 0.42, r * 0.68, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + r * 0.95, cy - r * 0.1, r * 0.42, r * 0.68, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.32, r * 0.28, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function _drawRabbit(ctx, x, y, w, h) {
    const cx = x + w / 2, cy = y + h * 0.62, r = Math.min(w, h * 0.7) * 0.42;
    ctx.beginPath(); _roundRectPath(ctx, cx - r * 0.62, y, r * 0.42, r * 1.5, r * 0.2); ctx.fill();
    ctx.beginPath(); _roundRectPath(ctx, cx + r * 0.2, y, r * 0.42, r * 1.5, r * 0.2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
  }
  function _drawBird(ctx, x, y, w, h) {
    const cx = x + w * 0.42, cy = y + h / 2, r = Math.min(w, h) * 0.38;
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.88, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + r * 0.85, cy - r * 0.15); ctx.lineTo(x + w * 0.98, cy); ctx.lineTo(cx + r * 0.85, cy + r * 0.15); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx - r * 0.15, cy + r * 0.1, r * 0.55, r * 0.32, 0.5, 0, Math.PI * 2); ctx.fill();
  }
  function _drawFish(ctx, x, y, w, h) {
    const cx = x + w * 0.42, cy = y + h / 2, rw = w * 0.42, rh = h * 0.38;
    ctx.beginPath(); ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + rw * 0.75, cy); ctx.lineTo(x + w, y + h * 0.12); ctx.lineTo(x + w, y + h * 0.88); ctx.closePath(); ctx.fill();
  }
  function _drawSun(ctx, x, y, w, h) {
    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.28;
    for (let i = 0; i < 8; i++) {
      const ang = i * Math.PI / 4;
      const bx1 = cx + Math.cos(ang - 0.12) * r * 1.05, by1 = cy + Math.sin(ang - 0.12) * r * 1.05;
      const bx2 = cx + Math.cos(ang + 0.12) * r * 1.05, by2 = cy + Math.sin(ang + 0.12) * r * 1.05;
      const tx = cx + Math.cos(ang) * Math.min(w, h) * 0.5, ty = cy + Math.sin(ang) * Math.min(w, h) * 0.5;
      ctx.beginPath(); ctx.moveTo(bx1, by1); ctx.lineTo(tx, ty); ctx.lineTo(bx2, by2); ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2); ctx.fill();
  }
  function _drawCloud(ctx, x, y, w, h) {
    const cy = y + h * 0.6;
    ctx.beginPath(); ctx.ellipse(x + w * 0.5, cy, w * 0.5, h * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w * 0.32, cy - h * 0.18, w * 0.24, h * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w * 0.62, cy - h * 0.22, w * 0.28, h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  }
  const SHAPE_DEFS = {
    circle:    { group: 'basic', emoji: '⬤',  label: '원',       fillable: true, defaultFill: false, defaultColor: '#e11d48', draw: (ctx,x,y,w,h,a) => { ctx.beginPath(); ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2); _fillOrStroke(ctx,a); } },
    triangle:  { group: 'basic', emoji: '▲',  label: '삼각형',   fillable: true, defaultFill: false, defaultColor: '#e11d48', draw: (ctx,x,y,w,h,a) => { ctx.beginPath(); ctx.moveTo(x+w/2,y); ctx.lineTo(x+w,y+h); ctx.lineTo(x,y+h); ctx.closePath(); _fillOrStroke(ctx,a); } },
    diamond:   { group: 'basic', emoji: '◆',  label: '마름모',   fillable: true, defaultFill: false, defaultColor: '#e11d48', draw: (ctx,x,y,w,h,a) => { ctx.beginPath(); ctx.moveTo(x+w/2,y); ctx.lineTo(x+w,y+h/2); ctx.lineTo(x+w/2,y+h); ctx.lineTo(x,y+h/2); ctx.closePath(); _fillOrStroke(ctx,a); } },
    pentagon:  { group: 'basic', emoji: '⬠',  label: '오각형',   fillable: true, defaultFill: false, defaultColor: '#e11d48', draw: (ctx,x,y,w,h,a) => { _regularPolyPath(ctx,x+w/2,y+h/2,Math.min(w,h)/2,5,-Math.PI/2); _fillOrStroke(ctx,a); } },
    hexagon:   { group: 'basic', emoji: '⬡',  label: '육각형',   fillable: true, defaultFill: false, defaultColor: '#e11d48', draw: (ctx,x,y,w,h,a) => { _regularPolyPath(ctx,x+w/2,y+h/2,Math.min(w,h)/2,6,0); _fillOrStroke(ctx,a); } },
    star:      { group: 'basic', emoji: '★',  label: '별',       fillable: true, defaultFill: true,  defaultColor: '#f59e0b', draw: (ctx,x,y,w,h,a) => { _starPath(ctx,x+w/2,y+h/2,Math.min(w,h)/2,Math.min(w,h)/2*0.42,5,-Math.PI/2); _fillOrStroke(ctx,a); } },
    heart:     { group: 'basic', emoji: '♥',  label: '하트',     fillable: true, defaultFill: true,  defaultColor: '#ef4444', draw: (ctx,x,y,w,h,a) => { _heartPath(ctx,x,y,w,h); _fillOrStroke(ctx,a); } },
    speech:    { group: 'mark',  emoji: '💬', label: '말풍선',   fillable: true, defaultFill: false, defaultColor: '#3b82f6', draw: (ctx,x,y,w,h,a) => {
      const r = Math.min(w,h) * 0.14, bh = h * 0.78;
      ctx.beginPath(); _roundRectPath(ctx,x,y,w,bh,r);
      ctx.moveTo(x+w*0.22,y+bh); ctx.lineTo(x+w*0.1,y+h); ctx.lineTo(x+w*0.38,y+bh); ctx.closePath();
      _fillOrStroke(ctx,a);
    } },
    'arrow-right': { group: 'arrow', emoji: '➡️', label: '오른쪽 화살표', fillable: false, defaultColor: '#2563eb', draw: (ctx,x,y,w,h) => { _arrowPoly(ctx,x,y,w,h,'right'); ctx.fill(); } },
    'arrow-left':  { group: 'arrow', emoji: '⬅️', label: '왼쪽 화살표',  fillable: false, defaultColor: '#2563eb', draw: (ctx,x,y,w,h) => { _arrowPoly(ctx,x,y,w,h,'left'); ctx.fill(); } },
    'arrow-up':    { group: 'arrow', emoji: '⬆️', label: '위쪽 화살표',  fillable: false, defaultColor: '#2563eb', draw: (ctx,x,y,w,h) => { _arrowPoly(ctx,x,y,w,h,'up'); ctx.fill(); } },
    'arrow-down':  { group: 'arrow', emoji: '⬇️', label: '아래쪽 화살표', fillable: false, defaultColor: '#2563eb', draw: (ctx,x,y,w,h) => { _arrowPoly(ctx,x,y,w,h,'down'); ctx.fill(); } },
    check:     { group: 'mark', emoji: '✔️', label: '체크',   fillable: false, defaultColor: '#16a34a', draw: (ctx,x,y,w,h,a) => { ctx.lineWidth = Math.max(3,(a.strokeWidth||6)); ctx.beginPath(); ctx.moveTo(x+w*0.12,y+h*0.55); ctx.lineTo(x+w*0.42,y+h*0.85); ctx.lineTo(x+w*0.9,y+h*0.18); ctx.stroke(); } },
    cross:     { group: 'mark', emoji: '✖️', label: '가위표', fillable: false, defaultColor: '#dc2626', draw: (ctx,x,y,w,h,a) => { ctx.lineWidth = Math.max(3,(a.strokeWidth||6)); ctx.beginPath(); ctx.moveTo(x+w*0.15,y+h*0.15); ctx.lineTo(x+w*0.85,y+h*0.85); ctx.moveTo(x+w*0.85,y+h*0.15); ctx.lineTo(x+w*0.15,y+h*0.85); ctx.stroke(); } },
    cat:    { group: 'char', emoji: '🐱', label: '고양이',   fillable: false, defaultColor: '#f59e0b', draw: _drawCat },
    dog:    { group: 'char', emoji: '🐶', label: '강아지',   fillable: false, defaultColor: '#92613a', draw: _drawDog },
    rabbit: { group: 'char', emoji: '🐰', label: '토끼',     fillable: false, defaultColor: '#f3a6c1', draw: _drawRabbit },
    bird:   { group: 'char', emoji: '🐦', label: '새',       fillable: false, defaultColor: '#3b82f6', draw: _drawBird },
    fish:   { group: 'char', emoji: '🐟', label: '물고기',   fillable: false, defaultColor: '#06b6d4', draw: _drawFish },
    sun:    { group: 'char', emoji: '☀️', label: '해',       fillable: false, defaultColor: '#f59e0b', draw: _drawSun },
    cloud:  { group: 'char', emoji: '☁️', label: '구름',     fillable: false, defaultColor: '#94a3b8', draw: _drawCloud },
  };
  const SHAPE_GROUP_LABELS = { basic: '📐 기본 도형', arrow: '➜ 화살표', mark: '✅ 표시', char: '🐾 캐릭터 스탬프' };
  const SHAPE_GROUP_ORDER = ['basic', 'arrow', 'mark', 'char'];
  function _paintShape(ctx, a, x, y, w, h) {
    const def = SHAPE_DEFS[a.shapeKind]; if (!def) return;
    ctx.save();
    ctx.fillStyle = a.color || def.defaultColor;
    ctx.strokeStyle = a.color || def.defaultColor;
    ctx.lineWidth = Math.max(1, a.strokeWidth || 3);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    try { def.draw(ctx, x, y, w, h, a); } catch (e) { console.warn('[PdfEditorApp] 도형 렌더 실패', e); }
    ctx.restore();
  }

  /* ══════════════════ 상태 ══════════════════ */
  let _sources = [];     // {id, name, kind:'pdf'|'image', pdfDoc(pdf-lib), pdfjsDoc, img(Image, kind='image')}
  let _pages = [];       // 작업 중인 페이지 배열(순서 = 최종 출력 순서)
  let _selectMode = false;
  let _selected = new Set();
  let _cssInjected = false;
  let _fontReady = null;  // Promise
  let _dragIds = null; // 그리드 드래그 재정렬용(선택한 순서대로의 페이지 id 배열)
  let _selectAnchorId = null; // Shift+클릭 범위 선택의 기준점
  let _insertAt = null; // "➕ 이 앞에 삽입"으로 지정한 목표 위치(없으면 맨 끝에 추가)
  let _insertMenuOpen = false;
  const LS_CARD_W = 'hk10b_peGridCardW';
  let _gridCardW = (() => { try { const v = parseInt(localStorage.getItem(LS_CARD_W), 10); return (v >= 110 && v <= 280) ? v : 150; } catch (e) { return 150; } })();
  let _nUpEnabled = false; // 체크 시 내보내기를 "2쪽씩 모아 인쇄용" 레이아웃으로 만든다
  let _fileDragCounter = 0; // 파일 드래그&드롭(dragenter/leave 중첩 처리용)
  let _editingId = null;  // 편집 중인 페이지 id
  let _editorScale = 1;   // 편집기 캔버스 px per pt
  let _selAnnotId = null;
  let _editingTextId = null; // 지금 실제로 캐럿을 놓고 타이핑 중인 텍스트 상자(더블클릭으로 진입)
  let _drag = null;       // 편집기 내 드래그/리사이즈 상태
  let _busy = false;
  let _shapePickerOpen = false; // 도형·스탬프 고르기 팝업
  let _textSelectMode = false;  // 본문 텍스트 블록 선택 모드
  let _pendingSelectedText = ''; // 방금 블록 선택한 텍스트(복사/텍스트상자 추가 대기중)

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
.pe-btn.disabled{opacity:.45;cursor:not-allowed;pointer-events:none}
.pe-btn input[type=file]{display:none}
.pe-spacer{flex:1}
.pe-count{font-size:11.5px;color:var(--tx3);font-weight:700}
.pe-body{flex:1;overflow-y:auto;padding:14px}
.pe-wrap.pe-filedrop .pe-body{outline:3px dashed var(--a);outline-offset:-3px;background:var(--a10);border-radius:10px}
.pe-filedrop-hint{position:sticky;top:0;z-index:5;text-align:center;font-size:12px;font-weight:700;color:var(--a);background:var(--a10);padding:8px;border-radius:8px;margin-bottom:10px;pointer-events:none;display:none}
.pe-wrap.pe-filedrop .pe-filedrop-hint{display:block}
.pe-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--tx3);padding:60px 20px;text-align:center}
.pe-restore-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--a10);border:1px solid var(--a40);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:var(--tx)}
.pe-restore-bar span{flex:1;min-width:200px}
.pe-empty-ico{font-size:44px}
.pe-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--pe-card-w,150px),1fr));gap:14px}
.pe-size-ctrl{display:flex;align-items:center;gap:6px;color:var(--tx3);font-size:12px}
.pe-size-ctrl input[type=range]{width:90px;accent-color:var(--a)}
.pe-card{background:var(--card);border:2px solid var(--bdr);border-radius:12px;overflow:hidden;cursor:grab;position:relative;transition:border-color .12s}
.pe-card.sel{border-color:var(--a)}
.pe-card.dragover{border-color:var(--green);border-style:dashed}
.pe-card-thumb{width:100%;aspect-ratio:210/297;background:var(--surf2);display:block;object-fit:contain}
.pe-card-bar{display:flex;align-items:center;justify-content:space-between;padding:6px 8px;font-size:10.5px;color:var(--tx3);gap:4px}
.pe-card-num{font-weight:700;color:var(--tx2)}
.pe-card-edited{display:inline-block;background:var(--a);color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:999px;margin-left:4px;vertical-align:middle}
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
.pe-back-btn{font-weight:800}
.pe-editor-title{font-weight:800;font-size:13.5px;color:var(--tx);flex:1}
.pe-editor-hint{font-size:10.5px;color:var(--tx3);white-space:nowrap}
.pe-editor-main{flex:1;display:flex;overflow:hidden}
.pe-editor-canvas-wrap{flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:24px;background:#3a3a4a}
.pe-page-stage{position:relative;box-shadow:0 4px 26px rgba(0,0,0,.4);flex-shrink:0}
.pe-page-stage canvas{display:block;background:#fff}
.pe-annot{position:absolute;border:1.5px dashed rgba(79,70,229,.6);cursor:move;box-sizing:border-box}
.pe-annot.sel{border:2px solid var(--a);box-shadow:0 0 0 2px var(--a40)}
.pe-annot-handle{position:absolute;right:-6px;bottom:-6px;width:13px;height:13px;background:var(--a);border-radius:50%;cursor:nwse-resize;border:2px solid #fff;z-index:2}
.pe-annot-input{position:absolute;inset:0;width:100%;height:100%;border:none;outline:none;resize:none;background:transparent;box-sizing:border-box;line-height:1.32;overflow:hidden;white-space:pre-wrap;cursor:move}
.pe-annot-input:focus{cursor:text}
.pe-annot-input::placeholder{color:rgba(120,120,140,.55)}
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
.pe-shape-grp{margin-bottom:16px}
.pe-shape-grp:last-child{margin-bottom:0}
.pe-shape-grp-title{font-size:12px;font-weight:800;color:var(--tx2);margin-bottom:8px}
.pe-shape-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px}
.pe-shape-cell{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;border:1px solid var(--bdr);border-radius:var(--rs);background:var(--card2);cursor:pointer;font-size:11px;color:var(--tx2)}
.pe-shape-cell:hover{background:var(--card3);border-color:var(--a)}
.pe-shape-emoji{font-size:22px;line-height:1}
.pe-textlayer{position:absolute;left:0;top:0;overflow:hidden;line-height:1;z-index:5;user-select:text}
.pe-textlayer span,.pe-textlayer br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0% 0%}
.pe-textlayer ::selection{background:rgba(37,99,235,.35)}
.pe-text-select-mode .pe-annot{pointer-events:none}
.pe-textsel-bar{display:flex;align-items:center;gap:8px;padding:9px 16px;background:var(--card2);border-bottom:1px solid var(--bdr);flex-shrink:0;flex-wrap:wrap}
.pe-textsel-hint,.pe-textsel-preview{font-size:12px;color:var(--tx2)}
.pe-textsel-preview{font-weight:700;color:var(--tx)}
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

  // ★ 텍스트 상자가 고른 구글 폰트가 실제로 준비됐는지 확인(처음 쓸 때만 네트워크로 받아오고, 그 뒤로는 캐시된 결과 재사용).
  //   실패해도 조용히 넘어가고 _paintText의 폰트 폴백 체인(선택폰트→내장 나눔고딕→sans-serif)이 대신 그려준다.
  const _loadedFontKeys = new Set();
  async function _ensureFontFamily(family, bold, sizePx) {
    if (!family || family === FONT_FAMILY) { await _ensureFont(); return; }
    const key = `${family}|${bold ? 700 : 400}`;
    if (_loadedFontKeys.has(key)) return;
    try {
      await document.fonts.load(`${bold ? '700' : '400'} ${Math.max(10, Math.round(sizePx))}px "${family}"`);
      _loadedFontKeys.add(key);
    } catch (e) { console.warn('[PdfEditorApp] 폰트 로드 실패, 대체 폰트로 표시됩니다', family, e); }
  }

  /* ══════════════════ 소스/페이지 추가 ══════════════════ */
  function _readFileAsDataUrl(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
  function _loadImgEl(dataUrl) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = dataUrl; }); }
  function _fitA4(w, h) { const scale = Math.min(A4.w / w, A4.h / h, 1); return { w: w * scale, h: h * scale }; }

  // ★ _insertAt이 지정돼 있으면(카드의 "➕ 이 앞에 삽입"으로 들어온 경우) 그 위치에 끼워 넣고,
  //   여러 쪽짜리 파일이면 그 다음 파일이 바로 뒤에 이어지도록 위치를 그만큼 밀어준다.
  //   지정이 없으면(기본 툴바 버튼) 항상 맨 끝에 추가한다 — 기존 동작 그대로.
  function _insertPages(newPages) {
    if (!newPages.length) return;
    if (_insertAt !== null) {
      _pages.splice(_insertAt, 0, ...newPages);
      _insertAt += newPages.length;
    } else {
      _pages.push(...newPages);
    }
  }
  async function _addPdfBytes(name, arrayBuffer) {
    if (typeof PDFLib === 'undefined') { _toast('⚠️ PDF 편집 라이브러리를 불러오지 못했습니다'); return; }
    _ensurePdfjsWorker();
    const bytes1 = new Uint8Array(arrayBuffer.slice(0));
    const bytes2 = new Uint8Array(arrayBuffer.slice(0));
    const bytes3 = new Uint8Array(arrayBuffer.slice(0)); // ★ 자동저장(새로고침 복구)용 원본 바이트 보관
    let pdfDoc, pdfjsDoc;
    try {
      pdfDoc = await PDFLib.PDFDocument.load(bytes1, { ignoreEncryption: true });
    } catch (e) { throw new Error(`"${name}" 파일을 열 수 없습니다 (손상되었거나 암호로 보호됨)`); }
    pdfjsDoc = await pdfjsLib.getDocument({ data: bytes2 }).promise;
    const srcId = _nid();
    _sources.push({ id: srcId, name, kind: 'pdf', pdfDoc, pdfjsDoc, rawBytes: bytes3.buffer });
    const n = pdfDoc.getPageCount();
    const newPages = [];
    for (let i = 0; i < n; i++) {
      const pg = pdfDoc.getPage(i);
      const { width, height } = pg.getSize();
      newPages.push({ id: _nid(), kind: 'pdf', srcId, srcPageIndex: i, width, height, annots: [] });
    }
    _insertPages(newPages);
  }

  async function _addImageFile(file) {
    const dataUrl = await _readFileAsDataUrl(file);
    const img = await _loadImgEl(dataUrl);
    const fit = _fitA4(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const srcId = _nid();
    _sources.push({ id: srcId, name: file.name, kind: 'image', img, dataUrl });
    _insertPages([{ id: _nid(), kind: 'image', srcId, width: fit.w, height: fit.h, annots: [] }]);
  }

  async function _onPickPdf(fileList) {
    const files = Array.from(fileList || []); if (!files.length) { _insertAt = null; return; }
    _pushUndo();
    _setBusy('PDF 불러오는 중...');
    for (const f of files) {
      try { await _addPdfBytes(f.name, await f.arrayBuffer()); }
      catch (e) { _toast('⚠️ ' + (e.message || 'PDF를 불러오지 못했습니다')); }
    }
    _insertAt = null; _insertMenuOpen = false;
    _clearBusy();
  }
  async function _onPickImage(fileList) {
    const files = Array.from(fileList || []); if (!files.length) { _insertAt = null; return; }
    _pushUndo();
    _setBusy('이미지 불러오는 중...');
    for (const f of files) {
      try { await _addImageFile(f); }
      catch (e) { _toast('⚠️ 이미지를 불러오지 못했습니다: ' + (e.message || '')); }
    }
    _insertAt = null; _insertMenuOpen = false;
    _clearBusy();
  }
  function _addBlankPage() {
    _pushUndo();
    _insertPages([{ id: _nid(), kind: 'blank', width: A4.w, height: A4.h, annots: [] }]);
    _insertAt = null; _insertMenuOpen = false;
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
      if (src && src.img) {
        const rot = ((page.rotation || 0) % 360 + 360) % 360;
        ctx.save();
        if (rot === 90) { ctx.translate(cv.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(src.img, 0, 0, cv.height, cv.width); }
        else if (rot === 180) { ctx.translate(cv.width, cv.height); ctx.rotate(Math.PI); ctx.drawImage(src.img, 0, 0, cv.width, cv.height); }
        else if (rot === 270) { ctx.translate(0, cv.height); ctx.rotate(-Math.PI / 2); ctx.drawImage(src.img, 0, 0, cv.height, cv.width); }
        else { ctx.drawImage(src.img, 0, 0, cv.width, cv.height); }
        ctx.restore();
      }
    } else if (page.kind === 'pdf') {
      const src = _sources.find(s => s.id === page.srcId);
      const pjPage = await src.pdfjsDoc.getPage(page.srcPageIndex + 1);
      const viewport = pjPage.getViewport({ scale: 2, rotation: page.rotation || 0 });
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
  async function _paintText(ctx, a, originX, originY, scale) {
    ctx.save();
    ctx.beginPath(); ctx.rect(originX, originY, a.w * scale, a.h * scale); ctx.clip();
    const fs = Math.max(1, (a.fontSize || 14) * scale);
    const chosen = a.fontFamily || DEFAULT_TEXT_FONT;
    await _ensureFontFamily(chosen, a.bold, fs);
    // ★ 폴백 체인: 고른 구글 폰트 → 내장 나눔고딕(한글 안전망) → 시스템 기본 산세리프
    const fam = `"${chosen}", ${FONT_FAMILY}, sans-serif`;
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
  async function _renderPageComposite(page, targetW, opts) {
    opts = opts || {};
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
        // ★ 편집기 화면에서는 실제 <textarea>를 페이지 위에 겹쳐서 바로 입력할 수 있게 하므로,
        //   캔버스에는 텍스트를 그리지 않는다(안 그러면 이중으로 보임). 썸네일·PDF 내보내기에서는 그대로 굽는다.
        if (opts.skipText) continue;
        await _paintText(ctx, a, a.x * scale, a.y * scale, scale);
      } else if (a.type === 'erase') {
        ctx.fillStyle = a.color || '#ffffff';
        ctx.fillRect(a.x * scale, a.y * scale, a.w * scale, a.h * scale);
      } else if (a.type === 'rect') {
        ctx.save();
        const lw = Math.max(1, (a.strokeWidth || 3) * scale);
        ctx.strokeStyle = a.color || '#e11d48'; ctx.lineWidth = lw;
        ctx.strokeRect(a.x * scale + lw / 2, a.y * scale + lw / 2, Math.max(0, a.w * scale - lw), Math.max(0, a.h * scale - lw));
        ctx.restore();
      } else if (a.type === 'highlight') {
        ctx.save();
        ctx.globalAlpha = a.opacity != null ? a.opacity : 0.4;
        ctx.fillStyle = a.color || '#fef08a';
        ctx.fillRect(a.x * scale, a.y * scale, a.w * scale, a.h * scale);
        ctx.restore();
      } else if (a.type === 'arrow') {
        ctx.save();
        const lw = Math.max(1, (a.strokeWidth || 4) * scale);
        ctx.strokeStyle = a.color || '#2563eb'; ctx.fillStyle = a.color || '#2563eb';
        ctx.lineWidth = lw; ctx.lineCap = 'round';
        const x1 = a.x * scale, y1 = a.y * scale, x2 = (a.x + a.w) * scale, y2 = (a.y + a.h) * scale;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const headLen = Math.max(10, lw * 3);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(ang - Math.PI / 6), y2 - headLen * Math.sin(ang - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(ang + Math.PI / 6), y2 - headLen * Math.sin(ang + Math.PI / 6));
        ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (a.type === 'shape') {
        _paintShape(ctx, a, a.x * scale, a.y * scale, a.w * scale, a.h * scale);
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
      const composite = await _renderPageComposite(page, w, { skipText: true });
      const ctx = cvEl.getContext('2d'); ctx.clearRect(0, 0, w, h); ctx.drawImage(composite, 0, 0);
    } catch (e) { console.warn('[PdfEditorApp] 캔버스 렌더 실패', e); }
  }

  /* ══════════════════ 본문 텍스트 블록 선택(마우스 드래그) → 복사·추출 ══════════════════ */
  // ★ pdf.js의 텍스트 레이어(글자 위치만 있는 투명한 <span>들)를 캔버스 위에 겹쳐서,
  //   원본 PDF 문자 그대로를 마우스로 드래그해 선택·복사하거나 새 텍스트 상자로 바로 옮길 수 있게 한다.
  function _toggleTextSelect() {
    if (!_editingId) return;
    _textSelectMode = !_textSelectMode;
    _pendingSelectedText = '';
    _selAnnotId = null;
    try { window.getSelection()?.removeAllRanges(); } catch (e) {}
    _rerender();
  }
  async function _renderTextLayer() {
    const page = _pages.find(p => p.id === _editingId); if (!page || page.kind !== 'pdf') return;
    const container = _q('pe-textlayer'); if (!container) return;
    const src = _sources.find(s => s.id === page.srcId); if (!src) return;
    try {
      const pjPage = await src.pdfjsDoc.getPage(page.srcPageIndex + 1);
      const scale = _editorScaleFor(page);
      const viewport = pjPage.getViewport({ scale, rotation: page.rotation || 0 });
      const el = _q('pe-textlayer'); if (!el) return; // 그사이 화면이 바뀌었으면(다른 쪽 이동 등) 중단
      el.innerHTML = '';
      el.style.width = Math.round(viewport.width) + 'px';
      el.style.height = Math.round(viewport.height) + 'px';
      const textContent = await pjPage.getTextContent();
      if (typeof pdfjsLib?.renderTextLayer === 'function') {
        await pdfjsLib.renderTextLayer({ textContentSource: textContent, container: el, viewport, textDivs: [] }).promise;
      }
    } catch (e) { console.warn('[PdfEditorApp] 텍스트 레이어 생성 실패', e); }
  }
  function _onTextLayerMouseUp() {
    const sel = window.getSelection();
    const text = (sel && !sel.isCollapsed) ? sel.toString() : '';
    _pendingSelectedText = text.trim();
    const bar = _q('pe-textsel-bar');
    if (bar) bar.innerHTML = _textSelectBarInnerHtml();
  }
  function _textSelectBarInnerHtml() {
    if (_pendingSelectedText) {
      const preview = _esc(_pendingSelectedText.slice(0, 80)).replace(/\n/g, ' ') + (_pendingSelectedText.length > 80 ? '…' : '');
      return `<span class="pe-textsel-preview">🔤 "${preview}"</span>
        <button class="pe-btn" onclick="PdfEditorApp._copySelectedText()">📋 복사</button>
        <button class="pe-btn primary" onclick="PdfEditorApp._addSelectedTextAsBox()">📝 텍스트 상자로 추가</button>
        <div class="pe-spacer"></div>
        <button class="pe-btn" onclick="PdfEditorApp._toggleTextSelect()">✕ 선택 모드 끄기</button>`;
    }
    return `<span class="pe-textsel-hint">💡 아래 본문을 마우스로 드래그해서 텍스트를 블록 선택하세요</span>
      <div class="pe-spacer"></div>
      <button class="pe-btn" onclick="PdfEditorApp._toggleTextSelect()">✕ 선택 모드 끄기</button>`;
  }
  function _textSelectBarHtml() { return `<div class="pe-textsel-bar" id="pe-textsel-bar">${_textSelectBarInnerHtml()}</div>`; }
  async function _copySelectedText() {
    if (!_pendingSelectedText) return;
    try {
      await navigator.clipboard.writeText(_pendingSelectedText);
      _toast('✅ 텍스트를 클립보드에 복사했어요');
    } catch (e) {
      _toast('⚠️ 클립보드 복사에 실패했습니다 — 브라우저 권한을 확인해주세요');
    }
  }
  function _addSelectedTextAsBox() {
    if (!_pendingSelectedText) return;
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    _pushUndo();
    const w = Math.min(260, page.width * 0.6), h = 60;
    const a = { id: _nid(), type: 'text', x: (page.width - w) / 2, y: (page.height - h) / 2, w, h, text: _pendingSelectedText.trim(), fontSize: 14, color: '#111111', bold: false, align: 'left', fontFamily: DEFAULT_TEXT_FONT };
    page.annots.push(a); _selAnnotId = a.id; _editingTextId = null; page._thumbUrl = null;
    _textSelectMode = false; _pendingSelectedText = '';
    try { window.getSelection()?.removeAllRanges(); } catch (e) {}
    _rerender();
    _toast('✅ 선택한 텍스트로 텍스트 상자를 만들었어요');
  }

  /* ══════════════════ 자동저장(새로고침·실수로 나가기 대비) — IndexedDB ══════════════════ */
  //   PDF·이미지 원본 바이트까지 통째로 남겨서, 페이지가 새로고침되거나 실수로 닫혀도
  //   다음에 다시 열었을 때 "복원하기"로 그대로 이어서 작업할 수 있게 한다.
  const AUTOSAVE_DB = 'pe_autosave_db', AUTOSAVE_STORE = 'sessions', AUTOSAVE_KEY = 'current';
  let _autosaveTimer = null, _restoreChecked = false, _restoreAvailable = null;
  function _openAutosaveDB() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB 미지원')); return; }
      const req = indexedDB.open(AUTOSAVE_DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(AUTOSAVE_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function _idbPut(record) {
    const db = await _openAutosaveDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUTOSAVE_STORE, 'readwrite');
      tx.objectStore(AUTOSAVE_STORE).put(record, AUTOSAVE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function _idbGet() {
    const db = await _openAutosaveDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(AUTOSAVE_STORE, 'readonly').objectStore(AUTOSAVE_STORE).get(AUTOSAVE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function _idbClear() {
    try {
      const db = await _openAutosaveDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(AUTOSAVE_STORE, 'readwrite');
        tx.objectStore(AUTOSAVE_STORE).delete(AUTOSAVE_KEY);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
    } catch (e) {}
  }
  function _scheduleAutosave() {
    if (_autosaveTimer) clearTimeout(_autosaveTimer);
    _autosaveTimer = setTimeout(_runAutosave, 1200);
  }
  async function _runAutosave() {
    try {
      if (!_pages.length) { await _idbClear(); return; }
      const record = {
        savedAt: Date.now(),
        sources: _sources.map(s => ({
          id: s.id, name: s.name, kind: s.kind,
          rawBytes: s.kind === 'pdf' ? s.rawBytes : undefined,
          dataUrl: s.kind === 'image' ? s.dataUrl : undefined,
        })),
        pages: _pages.map(p => ({
          id: p.id, kind: p.kind, srcId: p.srcId, srcPageIndex: p.srcPageIndex, width: p.width, height: p.height, rotation: p.rotation || 0,
          annots: p.annots.map(a => { const { _imgEl, ...rest } = a; return rest; }),
        })),
      };
      await _idbPut(record);
    } catch (e) { console.warn('[PdfEditorApp] 자동저장 실패(작업은 계속 가능)', e); }
  }
  async function _checkRestore() {
    try {
      const record = await _idbGet();
      if (record && record.pages && record.pages.length) { _restoreAvailable = record; _rerender(); }
    } catch (e) {}
  }
  async function _doRestore() {
    const record = _restoreAvailable; _restoreAvailable = null;
    if (!record) return;
    _setBusy('이전 작업 내용을 복원하는 중...');
    try {
      await _restoreFromRecord(record);
      _toast('✅ 이전 작업을 복원했습니다');
    } catch (e) {
      console.error('[PdfEditorApp] 복원 실패', e);
      _toast('⚠️ 일부 파일을 복원하지 못했습니다: ' + (e.message || ''));
    }
    _clearBusy();
  }
  function _discardRestore() {
    _restoreAvailable = null;
    _idbClear();
    _rerender();
  }
  async function _restoreFromRecord(record) {
    _sources = []; _pages = [];
    for (const s of record.sources || []) {
      if (s.kind === 'pdf' && s.rawBytes) {
        try {
          _ensurePdfjsWorker();
          const b1 = new Uint8Array(s.rawBytes.slice(0)), b2 = new Uint8Array(s.rawBytes.slice(0)), b3 = new Uint8Array(s.rawBytes.slice(0));
          const pdfDoc = await PDFLib.PDFDocument.load(b1, { ignoreEncryption: true });
          const pdfjsDoc = await pdfjsLib.getDocument({ data: b2 }).promise;
          _sources.push({ id: s.id, name: s.name, kind: 'pdf', pdfDoc, pdfjsDoc, rawBytes: b3.buffer });
        } catch (e) { console.warn('[PdfEditorApp] 복원 중 PDF 로드 실패', s.name, e); }
      } else if (s.kind === 'image' && s.dataUrl) {
        try { const img = await _loadImgEl(s.dataUrl); _sources.push({ id: s.id, name: s.name, kind: 'image', img, dataUrl: s.dataUrl }); }
        catch (e) { console.warn('[PdfEditorApp] 복원 중 이미지 로드 실패', s.name, e); }
      }
    }
    for (const p of record.pages || []) {
      const annots = [];
      for (const a of p.annots || []) {
        if (a.type === 'image' && a.dataUrl) { try { a._imgEl = await _loadImgEl(a.dataUrl); } catch (e) {} }
        annots.push(a);
      }
      _pages.push({ id: p.id, kind: p.kind, srcId: p.srcId, srcPageIndex: p.srcPageIndex, width: p.width, height: p.height, rotation: p.rotation || 0, annots });
    }
    _rerender();
  }
  function _restoreBannerHtml() {
    const n = (_restoreAvailable.pages || []).length;
    let when = '';
    try { when = new Date(_restoreAvailable.savedAt).toLocaleString('ko-KR'); } catch (e) {}
    return `<div class="pe-restore-bar">
      <span>💾 이전에 작업하던 내용(${n}쪽${when ? ` · ${_esc(when)}` : ''})이 남아있어요. 새로고침 등으로 끊긴 작업을 이어서 할 수 있어요.</span>
      <button class="pe-btn primary" onclick="PdfEditorApp._doRestore()">복원하기</button>
      <button class="pe-btn" onclick="PdfEditorApp._discardRestore()">새로 시작</button>
    </div>`;
  }

  /* ══════════════════ 실행취소/다시실행 ══════════════════ */
  //   _pages 전체를 "가볍게" 복제해 스택에 쌓는다 — annots는 각각 새 객체로 복사하되
  //   _imgEl(로드된 이미지)·_baseCv(렌더 캐시)는 그대로 참조 공유해도 안전(읽기 전용으로만 쓰임).
  const UNDO_LIMIT = 50;
  let _undoStack = [], _redoStack = [];
  function _clonePagesSnapshot() {
    return _pages.map(p => ({ ...p, annots: p.annots.map(a => ({ ...a })) }));
  }
  function _pushUndo() {
    _undoStack.push(_clonePagesSnapshot());
    if (_undoStack.length > UNDO_LIMIT) _undoStack.shift();
    _redoStack = []; // 새 작업을 하면 "다시실행" 기록은 의미가 없어지므로 비운다
  }
  function _resetTransientSelection() {
    _selAnnotId = null; _editingTextId = null; _drag = null; _selected.clear();
  }
  function _undo() {
    if (!_undoStack.length) return;
    _redoStack.push(_clonePagesSnapshot());
    _pages = _undoStack.pop();
    _resetTransientSelection();
    _rerender();
  }
  function _redo() {
    if (!_redoStack.length) return;
    _undoStack.push(_clonePagesSnapshot());
    _pages = _redoStack.pop();
    _resetTransientSelection();
    _rerender();
  }

  /* ══════════════════ 메인 화면(그리드) ══════════════════ */
  let _cid = null;
  function render(cid) {
    _cid = cid; _css();
    const el = _q(cid); if (!el) return;
    if (!_pages.length && !_sources.length && !_restoreChecked) { _restoreChecked = true; _checkRestore(); }
    el.innerHTML = _shellHtml();
    _renderGridThumbs();
    if (_editingId) _renderEditorCanvas();
    if (_editingId && _textSelectMode) _renderTextLayer();
  }
  function _rerender() { if (_cid) render(_cid); _scheduleAutosave(); }

  function _shellHtml() {
    const body = `<div class="pe-wrap" ondragenter="PdfEditorApp._onBodyDragEnter(event)" ondragover="PdfEditorApp._onBodyDragOver(event)" ondragleave="PdfEditorApp._onBodyDragLeave(event)" ondrop="PdfEditorApp._onBodyDrop(event)">${_toolbarHtml()}<div class="pe-body" id="pe-body">${_restoreAvailable ? _restoreBannerHtml() : ''}<div class="pe-filedrop-hint">📥 여기에 놓으면 새 페이지로 추가됩니다</div>${_pages.length ? _gridHtml() : _emptyHtml()}</div></div>`;
    const editor = _editingId ? _editorOverlayHtml() : '';
    const insertMenu = _insertMenuOpen ? _insertMenuHtml() : '';
    const picker = _pickerOpen ? _pickerModalHtml() : '';
    const save = _saveOpen ? _saveModalHtml() : '';
    const shapePicker = _shapePickerOpen ? _shapePickerModalHtml() : '';
    const busy = _busy ? _busyHtml() : '';
    return body + editor + insertMenu + picker + save + shapePicker + busy;
  }
  function _toolbarHtml() {
    return `<div class="pe-toolbar">
      <label class="pe-btn primary">📄 PDF 추가<input type="file" accept="application/pdf" multiple onchange="PdfEditorApp._onPickPdf(this.files);this.value=''"></label>
      <label class="pe-btn">🖼 이미지 추가<input type="file" accept="image/*" multiple onchange="PdfEditorApp._onPickImage(this.files);this.value=''"></label>
      <button class="pe-btn" onclick="PdfEditorApp._openArchivePicker()">📚 자료실에서 가져오기</button>
      <button class="pe-btn" onclick="PdfEditorApp._addBlankPage()">＋ 빈 페이지</button>
      <button class="pe-btn" title="실행 취소 (Ctrl+Z)" ${_undoStack.length ? '' : 'disabled'} onclick="PdfEditorApp._undo()">↶ 실행취소</button>
      <button class="pe-btn" title="다시 실행 (Ctrl+Shift+Z)" ${_redoStack.length ? '' : 'disabled'} onclick="PdfEditorApp._redo()">↷ 다시실행</button>
      <div class="pe-spacer"></div>
      <span class="pe-count">${_pages.length}쪽${_selected.size ? ` · 선택 ${_selected.size}` : ''}</span>
      <span class="pe-editor-hint">Shift+클릭: 범위 선택 · Ctrl(⌘)+클릭: 개별 선택 · Ctrl(⌘)+드래그: 복사</span>
      <div class="pe-size-ctrl" title="페이지 크게/작게 보기">
        <span>🔍</span>
        <input type="range" min="110" max="280" step="10" value="${_gridCardW}"
          oninput="PdfEditorApp._onGridSizeInput(this.value)" onchange="PdfEditorApp._onGridSizeChange(this.value)">
      </div>
      <button class="pe-btn${_selectMode ? ' primary' : ''}" onclick="PdfEditorApp._toggleSelectMode()">${_selectMode ? '✕ 선택 취소' : '☑️ 선택'}</button>
      ${_selectMode ? `<button class="pe-btn danger" ${_selected.size ? '' : 'disabled'} onclick="PdfEditorApp._deleteSelected()">🗑 선택 삭제</button>
        <button class="pe-btn" ${_selected.size ? '' : 'disabled'} onclick="PdfEditorApp._exportSelected()">✂️ 선택만 내보내기</button>` : ''}
      <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#666;white-space:nowrap;cursor:pointer" title="한 장에 두 쪽씩 모아서 인쇄하기 좋은 레이아웃으로 내보냅니다">
        <input type="checkbox" ${_nUpEnabled ? 'checked' : ''} onchange="PdfEditorApp._toggleNUp(this.checked)"> 🖨 2쪽씩 모아 내보내기
      </label>
      <button class="pe-btn primary" ${_pages.length ? '' : 'disabled'} onclick="PdfEditorApp._exportAll()">💾 병합 내보내기</button>
    </div>`;
  }
  function _emptyHtml() {
    return `<div class="pe-empty"><div class="pe-empty-ico">📝</div>
      <div>PDF나 이미지를 추가해서 워크시트를 만들어보세요.<br>여러 PDF를 올려 페이지 순서를 자유롭게 배치하고,<br>텍스트·이미지를 얹은 뒤 하나의 PDF로 내보낼 수 있어요.<br><br>💡 파일을 여기로 드래그해서 놓아도 바로 추가됩니다.</div></div>`;
  }
  function _gridHtml() {
    return `<div class="pe-grid" id="pe-grid" style="--pe-card-w:${_gridCardW}px" onclick="PdfEditorApp._onGridBackgroundClick(event)"
      ondragover="PdfEditorApp._onGridDragOver(event)" ondrop="PdfEditorApp._onGridDrop(event)">${_pages.map((p, i) => _cardHtml(p, i)).join('')}</div>`;
  }
  // ★ 슬라이더를 끄는 동안엔 전체를 다시 그리지 않고 CSS 변수만 바꿔서 부드럽게 반응하고,
  //   손을 뗀 순간(change)에만 다음에도 기억하도록 저장한다.
  function _onGridSizeInput(v) {
    _gridCardW = +v;
    const grid = _q('pe-grid');
    if (grid) grid.style.setProperty('--pe-card-w', _gridCardW + 'px');
  }
  function _onGridSizeChange(v) {
    _gridCardW = +v;
    try { localStorage.setItem(LS_CARD_W, String(_gridCardW)); } catch (e) {}
  }
  // ★ 표준 탐색기 관례 — 빈 공간(카드가 아닌 곳)을 클릭하면 선택이 모두 해제된다.
  function _onGridBackgroundClick(e) {
    if (e.target !== e.currentTarget) return; // 카드 자체 클릭은 각 카드 핸들러가 처리
    if (_selected.size) { _selected.clear(); _rerender(); }
  }
  // ★ 카드와 카드 "사이" 또는 마지막 카드 뒤의 빈 영역처럼, 정확히 카드 위가 아닌 곳에 놓아도
  //   재정렬이 되도록 그리드 컨테이너 자체에도 놓기를 허용한다(그렇지 않으면 카드 경계를
  //   1px이라도 벗어나 놓았을 때 브라우저가 드롭을 그냥 무시해버린다).
  function _onGridDragOver(e) {
    if (e.target.closest('.pe-card')) return; // 카드 위는 카드 자체 핸들러가 이미 처리
    if (_isFileDrag(e)) return; // 외부 파일 드래그는 pe-wrap 핸들러가 처리
    e.preventDefault();
    try { e.dataTransfer.dropEffect = (e.ctrlKey || e.metaKey) ? 'copy' : 'move'; } catch (err) {}
  }
  function _onGridDrop(e) {
    if (e.target.closest('.pe-card')) return; // 카드 위에 정확히 놓았으면 카드의 _onDrop이 이미 처리
    const ids = _dragIds; _dragIds = null;
    if (!ids || !ids.length) return; // 외부 파일 드래그는 _onBodyDrop이 처리
    e.preventDefault();
    _pushUndo();
    // ★ 카드가 아닌 빈 영역(카드 사이·마지막 카드 뒤)에 놓았을 땐 "맨 끝으로 이동"으로 처리한다
    if (e.ctrlKey || e.metaKey) {
      const clones = ids.map(id => { const src = _pages.find(p => p.id === id); return src ? _clonePage(src) : null; }).filter(Boolean);
      if (!clones.length) return;
      _pages.push(...clones);
      _selected = new Set(clones.map(c => c.id));
      _toast(`✅ ${clones.length}쪽 복사됨`);
    } else {
      const moving = ids.map(id => _pages.find(p => p.id === id)).filter(Boolean);
      _pages = _pages.filter(p => !ids.includes(p.id));
      _pages.push(...moving);
    }
    _rerender();
  }
  function _pageIsEdited(p) {
    return (p.annots && p.annots.length > 0) || !!(p.rotation && p.rotation % 360 !== 0);
  }
  function _cardHtml(p, i) {
    const src = _sources.find(s => s.id === p.srcId);
    const label = p.kind === 'blank' ? '빈 페이지' : (src ? src.name : '');
    const edited = _pageIsEdited(p);
    return `<div class="pe-card${_selected.has(p.id) ? ' sel' : ''}" draggable="true" data-idx="${i}"
        ondragstart="PdfEditorApp._onDragStart(event,${i})" ondragover="PdfEditorApp._onDragOver(event,${i})"
        ondrop="PdfEditorApp._onDrop(event,${i})" ondragend="PdfEditorApp._onDragEnd(event)">
      ${_selectMode ? `<input type="checkbox" class="pe-card-chk" ${_selected.has(p.id) ? 'checked' : ''} onclick="event.stopPropagation();PdfEditorApp._toggleSelect('${p.id}')">` : ''}
      <div class="pe-card-acts">
        <button class="pe-mini-btn" title="이 페이지 앞에 삽입" onclick="PdfEditorApp._openInsertMenu(${i})">➕</button>
        <button class="pe-mini-btn" title="복제" onclick="PdfEditorApp._duplicatePage('${p.id}')">⧉</button>
        <button class="pe-mini-btn" title="90도 회전" onclick="PdfEditorApp._rotatePage('${p.id}')">↻</button>
        <button class="pe-mini-btn edit" title="편집" onclick="PdfEditorApp._openEditor('${p.id}')">✏️</button>
        <button class="pe-mini-btn" title="삭제" onclick="PdfEditorApp._deletePage('${p.id}')">✕</button>
      </div>
      <img class="pe-card-thumb" id="pe-thumb-${p.id}" draggable="false" onclick="PdfEditorApp._onCardClick(event,'${p.id}')">
      <div class="pe-card-bar"><span class="pe-card-num">${i + 1}쪽${edited ? ' <span class="pe-card-edited" title="이 페이지에 주석/회전 등 수정 사항이 있어요">✎ 수정됨</span>' : ''}</span><span class="pe-card-src" title="${_esc(label)}">${_esc(label)}</span></div>
    </div>`;
  }
  // ★ 탐색기(Windows)·파인더(Mac)와 동일한 관례:
  //   · Shift+클릭 — 마지막 기준점(anchor)부터 지금 클릭한 카드까지 "범위(블록)" 선택
  //   · Ctrl(Cmd)+클릭 — 카드 하나씩 개별 토글(비연속 다중 선택), 이 카드가 새 기준점이 됨
  //   · 아무 키 없이 클릭 — 기존 선택은 모두 해제하고 이 카드를 바로 연다(이 카드가 새 기준점)
  function _onCardClick(e, id) {
    if (e.shiftKey) { _selectRange(id); return; }
    if (_selectMode || e.ctrlKey || e.metaKey) { _toggleSelect(id); return; }
    if (_selected.size) _selected.clear();
    _selectAnchorId = id;
    _openEditor(id);
  }
  // ★ Shift+클릭 범위 선택 — 기준점(anchor)은 그대로 두고, 그 사이 구간 전체를 선택한다.
  //   (탐색기처럼, 기준점은 Shift 없이 클릭했을 때만 갱신되고 Shift+클릭을 반복해도 바뀌지 않는다)
  function _selectRange(id) {
    const anchorId = _selectAnchorId || id;
    const ai = _pages.findIndex(p => p.id === anchorId);
    const bi = _pages.findIndex(p => p.id === id);
    if (ai < 0 || bi < 0) { _toggleSelect(id); return; }
    const [from, to] = ai <= bi ? [ai, bi] : [bi, ai];
    _selected = new Set(_pages.slice(from, to + 1).map(p => p.id));
    _rerender();
  }
  // ★ 페이지를 복제(딥카피 아님 — annots만 새 id로 복사하고, 렌더된 베이스 캔버스·원본 참조는 그대로 공유해도 안전함)
  function _clonePage(page) {
    const clone = {
      id: _nid(), kind: page.kind, srcId: page.srcId, srcPageIndex: page.srcPageIndex,
      width: page.width, height: page.height, rotation: page.rotation || 0,
      annots: page.annots.map(a => ({ ...a, id: _nid() })),
    };
    if (page._baseCv) clone._baseCv = page._baseCv;
    return clone;
  }
  // ★ 페이지 복제 — 원본 바로 뒤에 삽입한다(탐색기에서 "복사본"이 원본 옆에 생기는 것과 동일한 관례).
  function _duplicatePage(id) {
    const idx = _pages.findIndex(p => p.id === id); if (idx < 0) return;
    _pushUndo();
    const clone = _clonePage(_pages[idx]);
    _pages.splice(idx + 1, 0, clone);
    _rerender();
    _toast('✅ 페이지가 복제되었습니다');
  }
  // ★ 페이지를 90도 시계방향으로 회전 — 페이지 크기(가로/세로)와 그 위의 모든 주석 위치를 함께 변환해서
  //   회전 후에도 텍스트·이미지·지우개 박스가 원래 있던 자리에 그대로 보이게 한다.
  //   변환식(가로W×세로H 페이지를 90도 회전): {x,y,w,h} → {x: H-y-h, y: x, w: h, h: w}, 페이지는 W↔H swap.
  function _rotatePage(id) {
    const page = _pages.find(p => p.id === id); if (!page) return;
    _pushUndo();
    const W = page.width, H = page.height;
    page.annots.forEach(a => {
      const nx = H - a.y - a.h, ny = a.x, nw = a.h, nh = a.w;
      a.x = nx; a.y = ny; a.w = nw; a.h = nh;
    });
    page.width = H; page.height = W;
    page.rotation = ((page.rotation || 0) + 90) % 360;
    page._baseCv = null; page._thumbUrl = null;
    _rerender();
  }
  function _onDragStart(e, i) {
    const page = _pages[i]; if (!page) return;
    // ★ 지금 드래그를 시작한 카드가 이미 다중 선택되어 있으면(2장 이상), 선택된 전체 묶음을 함께 옮긴다(선택한 순서대로)
    _dragIds = (_selected.has(page.id) && _selected.size > 1) ? [..._selected] : [page.id];
    try {
      e.dataTransfer.effectAllowed = 'copyMove'; // ★ Ctrl 키에 따라 이동/복사를 오갈 수 있게 둘 다 허용
      e.dataTransfer.setData('text/plain', page.id);
    } catch (err) {}
  }
  function _onDragOver(e) {
    e.preventDefault();
    // ★ 실제 OS 탐색기처럼 — 지금 Ctrl(Cmd)을 누르고 있으면 커서에 "복사(+)", 아니면 "이동" 표시
    try { e.dataTransfer.dropEffect = (e.ctrlKey || e.metaKey) ? 'copy' : 'move'; } catch (err) {}
  }
  function _onDrop(e, i) {
    e.preventDefault();
    const ids = _dragIds; _dragIds = null;
    if (!ids || !ids.length) return;
    const targetPage = _pages[i];
    if (!targetPage || ids.includes(targetPage.id)) return; // 선택한 항목들 위/자기 자신 위에 놓으면 무시
    const targetId = targetPage.id;
    _pushUndo();
    if (e.ctrlKey || e.metaKey) {
      // ★ Ctrl(Cmd)을 누른 채 놓으면 — 원본은 그대로 두고, 놓은 자리에 사본을 끼워 넣는다(선택한 순서대로)
      const clones = ids.map(id => { const src = _pages.find(p => p.id === id); return src ? _clonePage(src) : null; }).filter(Boolean);
      if (!clones.length) return;
      const insertAt = _pages.findIndex(p => p.id === targetId);
      _pages.splice(insertAt < 0 ? _pages.length : insertAt, 0, ...clones);
      _selected = new Set(clones.map(c => c.id)); // ★ 탐색기와 동일하게, 복사 직후엔 새로 생긴 사본이 선택 상태가 된다
      _toast(`✅ ${clones.length}쪽 복사됨`);
    } else {
      // ★ Ctrl을 누르지 않았으면 — 선택한 항목들을 원래 자리에서 빼서, 놓은 자리로 통째로 이동(선택한 순서대로)
      const moving = ids.map(id => _pages.find(p => p.id === id)).filter(Boolean);
      _pages = _pages.filter(p => !ids.includes(p.id));
      const insertAt = _pages.findIndex(p => p.id === targetId);
      _pages.splice(insertAt < 0 ? _pages.length : insertAt, 0, ...moving);
    }
    _rerender();
  }
  function _onDragEnd() { _dragIds = null; }

  /* ══════════════════ 파일 드래그&드롭으로 추가 ══════════════════ */
  function _isFileDrag(e) {
    const types = e.dataTransfer && e.dataTransfer.types;
    return !!(types && Array.from(types).includes('Files'));
  }
  function _onBodyDragEnter(e) {
    if (!_isFileDrag(e)) return;
    e.preventDefault();
    _fileDragCounter++;
    const wrap = e.currentTarget; if (wrap) wrap.classList.add('pe-filedrop');
  }
  function _onBodyDragOver(e) { if (_isFileDrag(e)) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch (err) {} } }
  function _onBodyDragLeave(e) {
    if (!_isFileDrag(e)) return;
    _fileDragCounter = Math.max(0, _fileDragCounter - 1);
    if (_fileDragCounter === 0) { const wrap = e.currentTarget; if (wrap) wrap.classList.remove('pe-filedrop'); }
  }
  async function _onBodyDrop(e) {
    _fileDragCounter = 0;
    const wrap = e.currentTarget; if (wrap) wrap.classList.remove('pe-filedrop');
    if (!_isFileDrag(e)) return; // 내부 페이지 재정렬 드래그 — 각 카드 핸들러가 이미 처리함
    e.preventDefault();
    await _addDroppedFiles(e.dataTransfer.files);
  }
  async function _addDroppedFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const pdfs = files.filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    const imgs = files.filter(f => f.type.startsWith('image/'));
    const otherCount = files.length - pdfs.length - imgs.length;
    if (!pdfs.length && !imgs.length) { _toast('⚠️ PDF 또는 이미지 파일만 추가할 수 있습니다'); return; }
    _setBusy('파일 추가하는 중...');
    for (const f of pdfs) {
      try { await _addPdfBytes(f.name, await f.arrayBuffer()); }
      catch (e) { _toast('⚠️ ' + (e.message || 'PDF를 불러오지 못했습니다')); }
    }
    for (const f of imgs) {
      try { await _addImageFile(f); }
      catch (e) { _toast('⚠️ 이미지를 불러오지 못했습니다: ' + (e.message || '')); }
    }
    _clearBusy();
    if (otherCount > 0) _toast(`⚠️ 지원하지 않는 파일 ${otherCount}개는 제외했습니다`);
  }
  function _stageDragOver(e) { if (_isFileDrag(e)) { e.preventDefault(); try { e.dataTransfer.dropEffect = 'copy'; } catch (err) {} } }
  async function _stageDrop(e) {
    if (!_isFileDrag(e)) return;
    e.preventDefault();
    const files = e.dataTransfer && e.dataTransfer.files;
    const file = files && Array.from(files).find(f => f.type.startsWith('image/'));
    if (!file) { _toast('⚠️ 이미지 파일만 페이지 위에 바로 추가할 수 있어요(PDF는 워크스페이스로 드래그해주세요)'); return; }
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    const stage = _q('pe-stage'); if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const scale = _editorScaleFor(page);
    const dropX = (e.clientX - rect.left) / scale, dropY = (e.clientY - rect.top) / scale;
    try {
      const dataUrl = await _readFileAsDataUrl(file);
      const img = await _loadImgEl(dataUrl);
      const maxW = page.width * 0.5;
      const s = Math.min(maxW / (img.naturalWidth || img.width), 1);
      const w = (img.naturalWidth || img.width) * s, h = (img.naturalHeight || img.height) * s;
      const a = { id: _nid(), type: 'image', x: Math.max(0, Math.min(page.width - w, dropX - w / 2)), y: Math.max(0, Math.min(page.height - h, dropY - h / 2)), w, h, dataUrl, _imgEl: img };
      page.annots.push(a); _selAnnotId = a.id; page._thumbUrl = null;
      _rerender();
    } catch (err) { _toast('⚠️ 이미지를 추가하지 못했습니다'); }
  }
  function _deletePage(id) {
    if (!confirm('이 페이지를 삭제할까요?')) return;
    _pushUndo();
    _pages = _pages.filter(p => p.id !== id);
    _selected.delete(id);
    if (_editingId === id) _editingId = null;
    _rerender();
  }
  function _toggleSelectMode() { _selectMode = !_selectMode; if (!_selectMode) _selected.clear(); _rerender(); }
  function _toggleSelect(id) { _selectAnchorId = id; if (_selected.has(id)) _selected.delete(id); else _selected.add(id); _rerender(); }
  function _deleteSelected() {
    if (!_selected.size) return;
    if (!confirm(`선택한 ${_selected.size}개 페이지를 삭제할까요?`)) return;
    _pushUndo();
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

  function _openEditor(id) { _editingId = id; _selAnnotId = null; _shapePickerOpen = false; _textSelectMode = false; _pendingSelectedText = ''; _rerender(); }
  function _closeEditor() { _editingId = null; _selAnnotId = null; _drag = null; _shapePickerOpen = false; _textSelectMode = false; _pendingSelectedText = ''; _rerender(); }

  function _editorOverlayHtml() {
    const page = _pages.find(p => p.id === _editingId);
    if (!page) { _editingId = null; return ''; }
    const idx = _pages.indexOf(page);
    const sel = page.annots.find(a => a.id === _selAnnotId);
    return `<div class="pe-editor-ov">
      <div class="pe-editor-top">
        <button class="pe-btn pe-back-btn" onclick="PdfEditorApp._closeEditor()" title="목록으로 돌아가기">← 목록</button>
        <div class="pe-editor-title">✏️ ${idx + 1}쪽 편집</div>
        <button class="pe-btn" ${_textSelectMode ? 'disabled' : ''} onclick="PdfEditorApp._editorAddText()">＋ 텍스트</button>
        <label class="pe-btn${_textSelectMode ? ' disabled' : ''}">＋ 이미지<input type="file" accept="image/*" style="display:none" ${_textSelectMode ? 'disabled' : ''} onchange="PdfEditorApp._editorAddImage(this.files);this.value=''"></label>
        <button class="pe-btn" ${_textSelectMode ? 'disabled' : ''} onclick="PdfEditorApp._editorAddErase()" title="원본 내용을 흰 박스로 덮어 지웁니다">🧽 지우개</button>
        <button class="pe-btn" ${_textSelectMode ? 'disabled' : ''} onclick="PdfEditorApp._editorAddShape('highlight')" title="반투명 색으로 강조">🖍 형광펜</button>
        <button class="pe-btn" ${_textSelectMode ? 'disabled' : ''} onclick="PdfEditorApp._openShapePicker()" title="사각형·원·별·화살표·캐릭터 스탬프 등 다양한 도형 고르기">🔷 도형</button>
        ${page.kind === 'pdf' ? `<button class="pe-btn${_textSelectMode ? ' primary' : ''}" onclick="PdfEditorApp._toggleTextSelect()" title="본문 텍스트를 마우스로 블록 선택해 복사하거나 텍스트 상자로 추출">🔤 텍스트 선택</button>` : ''}
        <button class="pe-btn danger" ${sel ? '' : 'disabled'} onclick="PdfEditorApp._editorDeleteAnnot()">🗑 선택 삭제</button>
        <div class="pe-spacer"></div>
        <span class="pe-editor-hint">바깥을 클릭하거나 Esc를 누르면 닫혀요</span>
        <button class="pe-btn primary" onclick="PdfEditorApp._closeEditor()">✓ 완료</button>
      </div>
      ${_textSelectMode ? _textSelectBarHtml() : ''}
      <div class="pe-editor-main">
        <div class="pe-editor-canvas-wrap" onmousedown="PdfEditorApp._backdropMouseDown(event)">
          <div class="pe-page-stage${_textSelectMode ? ' pe-text-select-mode' : ''}" id="pe-stage" style="width:${_editorW()}px;height:${_editorH(page)}px" onmousedown="PdfEditorApp._stageMouseDown(event)" ondragover="PdfEditorApp._stageDragOver(event)" ondrop="PdfEditorApp._stageDrop(event)">
            <canvas id="pe-stage-cv"></canvas>
            ${_textSelectMode && page.kind === 'pdf' ? `<div class="pe-textlayer" id="pe-textlayer"></div>` : ''}
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
    if (a.type === 'text') {
      const fs = Math.max(1, (a.fontSize || 14) * scale);
      const fam = a.fontFamily || DEFAULT_TEXT_FONT;
      const pad = Math.round(3 * scale);
      const editing = _editingTextId === a.id;
      // ★ 실제 <textarea>를 페이지 위에 그대로 겹쳐서 클릭하면 바로 입력할 수 있게 한다.
      //   선택만 된 상태(더블클릭 전)에서는 pointer-events:none으로 클릭이 그대로 부모(이동/리사이즈)로
      //   전달되고, 더블클릭하면 pointer-events:auto가 되어 실제로 커서를 놓고 타이핑할 수 있다.
      return `<div class="pe-annot${a.id === _selAnnotId ? ' sel' : ''}" data-id="${a.id}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"
        onmousedown="PdfEditorApp._annotMouseDown(event,'${a.id}')" ondblclick="PdfEditorApp._annotEnterEditMode(event,'${a.id}')">
        <textarea class="pe-annot-input" data-id="${a.id}" spellcheck="false"
          style="pointer-events:${editing ? 'auto' : 'none'};font-family:'${_esc(fam)}','${FONT_FAMILY}',sans-serif;font-size:${fs}px;font-weight:${a.bold ? '700' : '400'};color:${_esc(a.color || '#111111')};text-align:${a.align || 'left'};padding:${pad}px;"
          placeholder="텍스트를 입력하세요"
          onmousedown="event.stopPropagation()"
          oninput="PdfEditorApp._annotTextInput('${a.id}',this.value)"
          onblur="PdfEditorApp._annotExitEditMode()">${_esc(a.text)}</textarea>
        <div class="pe-annot-handle" onmousedown="event.stopPropagation();PdfEditorApp._annotResizeStart(event,'${a.id}')"></div>
      </div>`;
    }
    return `<div class="pe-annot${a.id === _selAnnotId ? ' sel' : ''}" data-id="${a.id}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"
      onmousedown="PdfEditorApp._annotMouseDown(event,'${a.id}')">
      <div class="pe-annot-handle" onmousedown="event.stopPropagation();PdfEditorApp._annotResizeStart(event,'${a.id}')"></div>
    </div>`;
  }
  function _annotPanelHtml(a) {
    if (a.type === 'text') {
      return `<h4>텍스트 속성</h4>
        <div class="pe-field"><label>내용</label><textarea oninput="PdfEditorApp._annotUpdate('${a.id}',{text:this.value})">${_esc(a.text)}</textarea></div>
        <div class="pe-field"><label>폰트</label><select onchange="PdfEditorApp._annotUpdate('${a.id}',{fontFamily:this.value})">
          ${TEXT_FONTS.map(f => `<option value="${_esc(f.v)}" style="font-family:'${_esc(f.v)}'" ${(a.fontFamily || DEFAULT_TEXT_FONT) === f.v ? 'selected' : ''}>${_esc(f.l)}</option>`).join('')}
        </select></div>
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
    if (a.type === 'erase') {
      return `<h4>🧽 지우개</h4>
        <div class="pe-field"><label>덮는 색상</label><input type="color" value="${a.color || '#ffffff'}" oninput="PdfEditorApp._annotUpdate('${a.id}',{color:this.value})"></div>
        <div class="pe-side-empty">박스를 드래그해서 지울 영역의<br>위치를, 모서리 점을 드래그해서<br>크기를 맞춰보세요.<br><br>내보낼 때 이 영역이 원본 내용<br>위에 지정한 색으로 덮여요.</div>`;
    }
    if (a.type === 'rect') {
      return `<h4>▭ 사각형</h4>
        <div class="pe-field"><label>선 색상</label><input type="color" value="${a.color || '#e11d48'}" oninput="PdfEditorApp._annotUpdate('${a.id}',{color:this.value})"></div>
        <div class="pe-field"><label>선 굵기</label><input type="number" min="1" max="20" value="${a.strokeWidth || 3}" oninput="PdfEditorApp._annotUpdate('${a.id}',{strokeWidth:(+this.value||3)})"></div>
        <div class="pe-side-empty">박스를 드래그해서 위치를,<br>모서리 점을 드래그해서<br>크기를 바꿀 수 있어요.</div>`;
    }
    if (a.type === 'highlight') {
      return `<h4>🖍 형광펜</h4>
        <div class="pe-field"><label>색상</label><input type="color" value="${a.color || '#fef08a'}" oninput="PdfEditorApp._annotUpdate('${a.id}',{color:this.value})"></div>
        <div class="pe-field"><label>투명도</label><input type="range" min="10" max="90" value="${Math.round((a.opacity != null ? a.opacity : 0.4) * 100)}" oninput="PdfEditorApp._annotUpdate('${a.id}',{opacity:(+this.value/100)})"></div>
        <div class="pe-side-empty">텍스트나 그림 위에 겹쳐서<br>형광펜처럼 강조할 수 있어요.</div>`;
    }
    if (a.type === 'arrow') {
      return `<h4>➚ 화살표</h4>
        <div class="pe-field"><label>색상</label><input type="color" value="${a.color || '#2563eb'}" oninput="PdfEditorApp._annotUpdate('${a.id}',{color:this.value})"></div>
        <div class="pe-field"><label>굵기</label><input type="number" min="1" max="20" value="${a.strokeWidth || 4}" oninput="PdfEditorApp._annotUpdate('${a.id}',{strokeWidth:(+this.value||4)})"></div>
        <div class="pe-side-empty">박스의 왼쪽 위→오른쪽 아래<br>방향으로 화살표가 그려져요.<br>박스를 드래그해 위치를,<br>모서리 점으로 방향·길이를<br>바꿀 수 있어요.</div>`;
    }
    if (a.type === 'shape') {
      const def = SHAPE_DEFS[a.shapeKind] || {};
      return `<h4>${def.emoji || '🔷'} ${_esc(def.label || '도형')}</h4>
        <div class="pe-field"><label>색상</label><input type="color" value="${a.color || def.defaultColor || '#e11d48'}" oninput="PdfEditorApp._annotUpdate('${a.id}',{color:this.value})"></div>
        ${def.fillable ? `<div class="pe-chk-row"><input type="checkbox" id="pe-shfill-${a.id}" ${a.fill ? 'checked' : ''} onchange="PdfEditorApp._annotUpdate('${a.id}',{fill:this.checked})"><label for="pe-shfill-${a.id}">채우기</label></div>` : ''}
        ${(!def.fillable || !a.fill) ? `<div class="pe-field"><label>선 굵기</label><input type="number" min="1" max="30" value="${a.strokeWidth || 3}" oninput="PdfEditorApp._annotUpdate('${a.id}',{strokeWidth:(+this.value||3)})"></div>` : ''}
        <div class="pe-side-empty">박스를 드래그해서 위치를,<br>모서리 점을 드래그해서<br>크기를 바꿀 수 있어요.</div>`;
    }
    return `<h4>이미지</h4><div class="pe-side-empty">박스를 드래그해서 위치를,<br>모서리 점을 드래그해서<br>크기를 바꿀 수 있어요.</div>`;
  }
  function _updateSelectionUI() {
    const stage = _q('pe-stage'); if (!stage) return;
    stage.querySelectorAll('.pe-annot').forEach(el => el.classList.toggle('sel', el.getAttribute('data-id') === _selAnnotId));
    stage.querySelectorAll('.pe-annot-input').forEach(el => {
      el.style.pointerEvents = el.getAttribute('data-id') === _editingTextId ? 'auto' : 'none';
    });
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
    _editingTextId = null;
    _updateSelectionUI();
  }
  // ★ 표준 모달 관례 — 편집 화면 바깥(어두운 배경)을 클릭하면 목록으로 돌아간다.
  //   (실제로 클릭한 요소가 배경 자신일 때만 닫는다 — 안쪽 자식 클릭은 무시)
  function _backdropMouseDown(e) {
    if (e.target === e.currentTarget) _closeEditor();
  }
  // ★ 더블클릭 — 실제로 박스 안에 캐럿을 놓고 타이핑할 수 있는 "입력 모드"로 들어간다.
  //   (한 번 클릭은 선택/이동만, 더블클릭해야 입력 — PowerPoint·구글슬라이드 등과 같은 방식)
  function _annotEnterEditMode(e, id) {
    e.stopPropagation();
    _selAnnotId = id;
    _editingTextId = id;
    _updateSelectionUI();
    const ta = document.querySelector(`.pe-annot-input[data-id="${id}"]`);
    if (ta) { ta.focus(); const v = ta.value; try { ta.setSelectionRange(v.length, v.length); } catch (err) {} }
  }
  // ★ 포커스를 잃으면(다른 곳 클릭 등) 자동으로 입력 모드를 빠져나와, 다시 박스 이동/리사이즈가 되게 한다.
  function _annotExitEditMode() {
    if (!_editingTextId) return;
    _editingTextId = null;
    _updateSelectionUI();
  }
  // ★ 페이지 위 박스에서 직접 타이핑 — 캐럿·포커스를 잃지 않도록 전체 재렌더링 없이 데이터만 갱신한다.
  //   (편집기 캔버스에는 텍스트를 안 그리므로 다시 그릴 필요도 없다 — 그리드 썸네일만 다음에 최신화됨)
  function _annotTextInput(id, value) {
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    const a = page.annots.find(x => x.id === id); if (!a) return;
    a.text = value;
    page._thumbUrl = null;
    _scheduleAutosave(); // ★ 타이핑 중엔 _rerender()를 안 부르므로(캐럿 유지) 여기서 직접 예약
  }
  // ★ 사이드 패널에서 글자크기·색상·굵기·정렬·폰트를 바꾸면, 캐럿을 잃지 않도록 스타일만 즉시 반영한다.
  function _syncTextInputStyle(a) {
    const ta = document.querySelector(`.pe-annot-input[data-id="${a.id}"]`); if (!ta) return;
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    const scale = _editorScaleFor(page);
    const fs = Math.max(1, (a.fontSize || 14) * scale);
    ta.style.fontFamily = `'${a.fontFamily || DEFAULT_TEXT_FONT}','${FONT_FAMILY}',sans-serif`;
    ta.style.fontSize = fs + 'px';
    ta.style.fontWeight = a.bold ? '700' : '400';
    ta.style.color = a.color || '#111111';
    ta.style.textAlign = a.align || 'left';
    if (ta.value !== (a.text || '')) ta.value = a.text || ''; // 사이드 패널 텍스트창에서 바뀐 경우만 반영(보통은 이미 동일)
  }
  function _editorAddText() {
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    _pushUndo();
    const w = Math.min(220, page.width * 0.55), h = 44;
    const a = { id: _nid(), type: 'text', x: (page.width - w) / 2, y: (page.height - h) / 2, w, h, text: '', fontSize: 16, color: '#111111', bold: false, align: 'left', fontFamily: DEFAULT_TEXT_FONT };
    page.annots.push(a); _selAnnotId = a.id; _editingTextId = a.id; page._thumbUrl = null;
    _rerender();
    const ta = document.querySelector(`.pe-annot-input[data-id="${a.id}"]`);
    if (ta) { ta.style.pointerEvents = 'auto'; ta.focus(); }
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
      _pushUndo();
      const a = { id: _nid(), type: 'image', x: (page.width - w) / 2, y: (page.height - h) / 2, w, h, dataUrl, _imgEl: img };
      page.annots.push(a); _selAnnotId = a.id; page._thumbUrl = null;
      _rerender();
    } catch (e) { _toast('⚠️ 이미지를 추가하지 못했습니다'); }
  }
  function _editorAddErase() {
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    _pushUndo();
    const w = Math.min(200, page.width * 0.45), h = Math.min(90, page.height * 0.15);
    const a = { id: _nid(), type: 'erase', x: (page.width - w) / 2, y: (page.height - h) / 2, w, h, color: '#ffffff' };
    page.annots.push(a); _selAnnotId = a.id; page._thumbUrl = null;
    _rerender();
  }
  function _editorDeleteAnnot() {
    if (!_selAnnotId) return;
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    _pushUndo();
    page.annots = page.annots.filter(a => a.id !== _selAnnotId);
    _selAnnotId = null; page._thumbUrl = null;
    _rerender();
  }
  // ★ 도형/형광펜/화살표 — 기존 텍스트·이미지·지우개와 동일한 박스 이동/리사이즈 UI를 그대로 재사용한다.
  //   화살표는 박스의 왼쪽 위 모서리 → 오른쪽 아래 모서리 방향으로 그려진다(별도의 끝점 조작 UI 없이도
  //   기존 드래그/리사이즈만으로 위치·길이·방향을 바꿀 수 있게 하기 위함).
  function _editorAddShape(type) {
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    _pushUndo();
    const w = Math.min(180, page.width * 0.4);
    const h = type === 'highlight' ? Math.min(36, page.height * 0.06) : Math.min(90, page.height * 0.15);
    let a;
    if (type === 'rect') a = { id: _nid(), type: 'rect', x: (page.width - w) / 2, y: (page.height - h) / 2, w, h, color: '#e11d48', strokeWidth: 3 };
    else if (type === 'highlight') a = { id: _nid(), type: 'highlight', x: (page.width - w) / 2, y: (page.height - h) / 2, w, h, color: '#fef08a', opacity: 0.4 };
    else if (type === 'arrow') a = { id: _nid(), type: 'arrow', x: (page.width - w) / 2, y: (page.height - h) / 2, w, h, color: '#2563eb', strokeWidth: 4 };
    else return;
    page.annots.push(a); _selAnnotId = a.id; page._thumbUrl = null;
    _shapePickerOpen = false;
    _rerender();
  }
  // ★ 확장된 도형/스탬프 팔레트 — SHAPE_DEFS에 등록된 종류를 팝업에서 골라 추가한다.
  function _openShapePicker() { _shapePickerOpen = true; _rerender(); }
  function _closeShapePicker() { _shapePickerOpen = false; _rerender(); }
  function _editorAddShapeKind(kind) {
    const def = SHAPE_DEFS[kind]; if (!def) return;
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    _pushUndo();
    const w = Math.min(140, page.width * 0.3), h = w;
    const a = { id: _nid(), type: 'shape', shapeKind: kind, x: (page.width - w) / 2, y: (page.height - h) / 2, w, h,
      color: def.defaultColor, strokeWidth: 3, fill: def.fillable ? !!def.defaultFill : true };
    page.annots.push(a); _selAnnotId = a.id; page._thumbUrl = null;
    _shapePickerOpen = false;
    _rerender();
  }
  function _shapePickerModalHtml() {
    return `<div class="pe-modal-ov" style="z-index:9600" onmousedown="if(event.target===this)PdfEditorApp._closeShapePicker()">
      <div class="pe-modal" style="max-width:460px">
        <div class="pe-modal-hd"><span>🔷 도형 · 스탬프 고르기</span><button onclick="PdfEditorApp._closeShapePicker()">✕</button></div>
        <div class="pe-modal-body">
          <div class="pe-shape-grp">
            <div class="pe-shape-grp-title">✏️ 기본</div>
            <div class="pe-shape-grid">
              <button class="pe-shape-cell" onclick="PdfEditorApp._editorAddShape('rect')" title="사각형"><span class="pe-shape-emoji">▭</span><span>사각형</span></button>
              <button class="pe-shape-cell" onclick="PdfEditorApp._editorAddShape('arrow')" title="대각선 화살표"><span class="pe-shape-emoji">➚</span><span>대각선 화살표</span></button>
            </div>
          </div>
          ${SHAPE_GROUP_ORDER.map(g => `
          <div class="pe-shape-grp">
            <div class="pe-shape-grp-title">${SHAPE_GROUP_LABELS[g]}</div>
            <div class="pe-shape-grid">
              ${Object.entries(SHAPE_DEFS).filter(([, d]) => d.group === g).map(([k, d]) => `
                <button class="pe-shape-cell" onclick="PdfEditorApp._editorAddShapeKind('${k}')" title="${_esc(d.label)}">
                  <span class="pe-shape-emoji">${d.emoji}</span><span>${_esc(d.label)}</span>
                </button>`).join('')}
            </div>
          </div>`).join('')}
        </div>
      </div>
    </div>`;
  }
  function _annotUpdate(id, patch) {
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    const a = page.annots.find(x => x.id === id); if (!a) return;
    Object.assign(a, patch);
    page._thumbUrl = null;
    if (a.type === 'text') _syncTextInputStyle(a); // 캐럿을 안 잃도록 스타일만 바로 반영
    _renderEditorCanvas();
  }
  function _annotMouseDown(e, id) {
    e.stopPropagation();
    _selAnnotId = id;
    if (_editingTextId && _editingTextId !== id) _editingTextId = null; // 다른 박스를 클릭하면 이전 박스의 입력 모드는 빠져나옴
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    const annot = page.annots.find(a => a.id === id); if (!annot) return;
    _pushUndo();
    const scale = _editorScaleFor(page);
    _drag = { type: 'move', annotId: id, page, startX: e.clientX, startY: e.clientY, orig: { x: annot.x * scale, y: annot.y * scale, w: annot.w * scale, h: annot.h * scale } };
    _updateSelectionUI();
  }
  function _annotResizeStart(e, id) {
    e.stopPropagation();
    _selAnnotId = id;
    const page = _pages.find(p => p.id === _editingId); if (!page) return;
    const annot = page.annots.find(a => a.id === id); if (!annot) return;
    _pushUndo();
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
    if (_textSelectMode) _onTextLayerMouseUp();
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

  /* ══════════════════ "이 페이지 앞에 삽입" 메뉴 ══════════════════ */
  //   기존 PDF의 페이지들 사이에 새 PDF·이미지·자료실 파일·빈 페이지를 바로 끼워 넣을 때 쓴다.
  //   (드래그로 옮겨서 순서를 바꾸는 방법도 그대로 가능 — 이건 더 직접적인 지름길)
  function _openInsertMenu(i) {
    _insertAt = i;
    _insertMenuOpen = true;
    _rerender();
  }
  function _closeInsertMenu() {
    _insertMenuOpen = false;
    _insertAt = null;
    _rerender();
  }
  function _insertMenuOpenArchive() {
    _insertMenuOpen = false; // 자료실 선택 모달로 넘어가고, _insertAt은 그대로 유지해서 실제 삽입에 쓴다
    _openArchivePicker();
  }
  function _insertMenuHtml() {
    return `<div class="pe-modal-ov" onmousedown="if(event.target===this)PdfEditorApp._closeInsertMenu()">
      <div class="pe-modal">
        <div class="pe-modal-hd"><span>➕ ${(_insertAt || 0) + 1}쪽 위치에 삽입</span><button onclick="PdfEditorApp._closeInsertMenu()">✕</button></div>
        <div class="pe-modal-body" style="display:flex;flex-direction:column;gap:8px">
          <label class="pe-btn" style="justify-content:flex-start">📄 PDF 파일<input type="file" accept="application/pdf" multiple style="display:none" onchange="PdfEditorApp._onPickPdf(this.files);this.value=''"></label>
          <label class="pe-btn" style="justify-content:flex-start">🖼 이미지 파일<input type="file" accept="image/*" multiple style="display:none" onchange="PdfEditorApp._onPickImage(this.files);this.value=''"></label>
          <button class="pe-btn" style="justify-content:flex-start" onclick="PdfEditorApp._insertMenuOpenArchive()">📚 자료실에서 가져오기</button>
          <button class="pe-btn" style="justify-content:flex-start" onclick="PdfEditorApp._addBlankPage()">＋ 빈 페이지</button>
        </div>
      </div>
    </div>`;
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
    _pushUndo();
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
    _insertAt = null; _insertMenuOpen = false;
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
  async function _renderTextAnnotPng(a) {
    const density = 4; // pt당 px — 인쇄 품질을 위해 고해상도로 렌더링
    const w = Math.max(1, Math.round(a.w * density)), h = Math.max(1, Math.round(a.h * density));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    await _paintText(cv.getContext('2d'), a, 0, 0, density);
    return _canvasToPngBytes(cv);
  }
  // ★ 새 도형/스탬프(shape)는 종류가 많아 pdf-lib 벡터 명령으로 일일이 옮기는 대신,
  //   화면과 똑같은 _paintShape 함수로 고해상도 PNG를 구워 이미지처럼 심는다
  //   (기존 rect/highlight/arrow는 그대로 벡터로 내보내던 방식을 건드리지 않음).
  async function _renderShapeAnnotPng(a) {
    const density = 4;
    const w = Math.max(1, Math.round(a.w * density)), h = Math.max(1, Math.round(a.h * density));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    _paintShape(cv.getContext('2d'), a, 0, 0, w, h);
    return _canvasToPngBytes(cv);
  }
  async function _buildPdfBytes(pageList) {
    const outDoc = await PDFLib.PDFDocument.create();
    for (const p of pageList) {
      let outPage;
      const rotated = !!(p.rotation && p.rotation % 360 !== 0);
      if (p.kind === 'pdf' && !rotated) {
        // ★ 회전이 없는 PDF 페이지는 벡터 그대로 복사(화질 손실 없음)
        const src = _sources.find(s => s.id === p.srcId);
        const [copied] = await outDoc.copyPages(src.pdfDoc, [p.srcPageIndex]);
        outPage = outDoc.addPage(copied);
      } else if (p.kind === 'pdf' && rotated) {
        // ★ 회전된 PDF 페이지는 (이미 회전이 반영된) 베이스 캔버스를 고화질 PNG로 구워서 넣는다
        //   — 주석 좌표가 회전 후 좌표계(가로/세로 swap됨) 기준이므로, 배경도 같은 좌표계여야 정확히 겹쳐진다.
        const baseCv = await _getBaseCanvas(p);
        const embedded = await outDoc.embedPng(_canvasToPngBytes(baseCv));
        outPage = outDoc.addPage([p.width, p.height]);
        outPage.drawImage(embedded, { x: 0, y: 0, width: p.width, height: p.height });
      } else {
        outPage = outDoc.addPage([p.width, p.height]);
        if (p.kind === 'image') {
          // ★ 이미지 페이지도 베이스 캔버스를 통해 그려서 회전이 반영되게 한다
          const baseCv = await _getBaseCanvas(p);
          const embedded = await outDoc.embedPng(_canvasToPngBytes(baseCv));
          outPage.drawImage(embedded, { x: 0, y: 0, width: p.width, height: p.height });
        }
      }
      for (const a of p.annots) {
        if (a.type === 'image' && a._imgEl) {
          const embedded = await outDoc.embedPng(_imgElToPngBytes(a._imgEl));
          outPage.drawImage(embedded, { x: a.x, y: p.height - a.y - a.h, width: a.w, height: a.h });
        } else if (a.type === 'text' && (a.text || '').trim() !== '') {
          const pngBytes = await _renderTextAnnotPng(a);
          const embedded = await outDoc.embedPng(pngBytes);
          outPage.drawImage(embedded, { x: a.x, y: p.height - a.y - a.h, width: a.w, height: a.h });
        } else if (a.type === 'erase') {
          const { r, g, b } = _hexToRgb01(a.color || '#ffffff');
          outPage.drawRectangle({ x: a.x, y: p.height - a.y - a.h, width: a.w, height: a.h, color: PDFLib.rgb(r, g, b) });
        } else if (a.type === 'rect') {
          const { r, g, b } = _hexToRgb01(a.color || '#e11d48');
          outPage.drawRectangle({ x: a.x, y: p.height - a.y - a.h, width: a.w, height: a.h, borderColor: PDFLib.rgb(r, g, b), borderWidth: a.strokeWidth || 3 });
        } else if (a.type === 'highlight') {
          const { r, g, b } = _hexToRgb01(a.color || '#fef08a');
          outPage.drawRectangle({ x: a.x, y: p.height - a.y - a.h, width: a.w, height: a.h, color: PDFLib.rgb(r, g, b), opacity: a.opacity != null ? a.opacity : 0.4 });
        } else if (a.type === 'arrow') {
          const { r, g, b } = _hexToRgb01(a.color || '#2563eb');
          const x1 = a.x, y1 = p.height - a.y, x2 = a.x + a.w, y2 = p.height - (a.y + a.h);
          const lw = a.strokeWidth || 4;
          outPage.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: lw, color: PDFLib.rgb(r, g, b) });
          const ang = Math.atan2(y2 - y1, x2 - x1);
          const headLen = Math.max(10, lw * 3);
          const hx1 = x2 - headLen * Math.cos(ang - Math.PI / 6), hy1 = y2 - headLen * Math.sin(ang - Math.PI / 6);
          const hx2 = x2 - headLen * Math.cos(ang + Math.PI / 6), hy2 = y2 - headLen * Math.sin(ang + Math.PI / 6);
          outPage.drawLine({ start: { x: x2, y: y2 }, end: { x: hx1, y: hy1 }, thickness: lw, color: PDFLib.rgb(r, g, b) });
          outPage.drawLine({ start: { x: x2, y: y2 }, end: { x: hx2, y: hy2 }, thickness: lw, color: PDFLib.rgb(r, g, b) });
        } else if (a.type === 'shape') {
          const pngBytes = await _renderShapeAnnotPng(a);
          const embedded = await outDoc.embedPng(pngBytes);
          outPage.drawImage(embedded, { x: a.x, y: p.height - a.y - a.h, width: a.w, height: a.h });
        }
      }
    }
    return outDoc.save();
  }
  function _toggleNUp(checked) { _nUpEnabled = !!checked; }
  // ★ 2쪽씩(N-up) 모아 인쇄용 PDF — 이미 검증된 _buildPdfBytes로 "1쪽=1장" PDF를 먼저 만든 뒤,
  //   pdf-lib의 embedPage/drawPage로 벡터 그대로 더 큰 인쇄용 시트에 N쪽씩 축소 배치한다.
  //   (주석을 N-up 좌표로 다시 계산할 필요 없이, 이미 완성된 페이지를 그대로 재구성만 하면 되므로 안전하다)
  async function _buildNUpBytes(pageList, n) {
    const singleBytes = await _buildPdfBytes(pageList);
    const srcDoc = await PDFLib.PDFDocument.load(singleBytes);
    const outDoc = await PDFLib.PDFDocument.create();
    const srcPages = srcDoc.getPages();
    const sheetW = A4.h, sheetH = A4.w; // 인쇄용 시트는 가로(landscape)로
    const margin = 20, gap = 14;
    const cellW = (sheetW - margin * 2 - gap * (n - 1)) / n, cellH = sheetH - margin * 2;
    for (let i = 0; i < srcPages.length; i += n) {
      const outPage = outDoc.addPage([sheetW, sheetH]);
      for (let j = 0; j < n && i + j < srcPages.length; j++) {
        const srcPage = srcPages[i + j];
        const embedded = await outDoc.embedPage(srcPage);
        const pw = srcPage.getWidth(), ph = srcPage.getHeight();
        const scale = Math.min(cellW / pw, cellH / ph);
        const dw = pw * scale, dh = ph * scale;
        const cellX = margin + j * (cellW + gap);
        const x = cellX + (cellW - dw) / 2, y = margin + (cellH - dh) / 2;
        outPage.drawPage(embedded, { x, y, width: dw, height: dh });
      }
    }
    return outDoc.save();
  }
  // ★ "#rrggbb" → pdf-lib의 rgb()가 요구하는 0~1 범위 소수로 변환
  function _hexToRgb01(hex) {
    const h = String(hex || '#ffffff').replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    return { r: isNaN(r) ? 1 : r, g: isNaN(g) ? 1 : g, b: isNaN(b) ? 1 : b };
  }
  async function _runExport(pageList) {
    if (typeof PDFLib === 'undefined') { _toast('⚠️ PDF 편집 라이브러리를 불러오지 못했습니다'); return; }
    if (!pageList.length) { _toast('⚠️ 내보낼 페이지가 없습니다'); return; }
    _setBusy('PDF 만드는 중...');
    try {
      await _ensureFont();
      const bytes = _nUpEnabled ? await _buildNUpBytes(pageList, 2) : await _buildPdfBytes(pageList);
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
    return `<div class="pe-modal-ov" onmousedown="if(event.target===this)PdfEditorApp._cancelSave()">
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
    _idbClear(); // ★ 내보내기가 끝났으니, 다음에 다시 열었을 때 이 작업을 "복원하시겠습니까"로 다시 묻지 않는다
    _pendingBytes = null;
    _rerender();
  }

  // ★ 표준 편집기 관례 — Esc로 닫기/선택취소, Delete로 선택된 요소 삭제.
  //   입력창(텍스트박스 등)에 포커스가 있을 땐 타이핑을 방해하지 않도록 건너뛴다.
  function _onDocKeyDown(e) {
    const ae = document.activeElement;
    const typing = ae && /^(TEXTAREA|INPUT|SELECT)$/.test(ae.tagName);
    if (e.key === 'Escape') {
      if (typing) { ae.blur(); return; }
      if (_saveOpen) { _cancelSave(); return; }
      if (_pickerOpen) { _closeArchivePicker(); return; }
      if (_shapePickerOpen) { _closeShapePicker(); return; }
      if (_editingId) {
        if (_textSelectMode) { _toggleTextSelect(); return; }
        if (_selAnnotId) { _selAnnotId = null; _updateSelectionUI(); return; }
        _closeEditor(); return;
      }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
      if (_editingId && _selAnnotId) { e.preventDefault(); _editorDeleteAnnot(); }
    } else if (!typing && (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) _redo(); else _undo();
    } else if (!typing && (e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      _redo();
    }
  }
  document.addEventListener('keydown', _onDocKeyDown);
  document.addEventListener('mousemove', _onDocMouseMove);
  document.addEventListener('mouseup', _onDocMouseUp);
  // ★ 새로고침·탭 닫기 등으로 작업 중인 내용이 날아가지 않도록, 저장 안 된 페이지가 있으면
  //   브라우저 자체의 "이 페이지를 나가시겠습니까?" 확인창을 띄운다(자동저장은 별도로 계속 진행됨).
  window.addEventListener('beforeunload', (e) => {
    if (_pages.length > 0) { e.preventDefault(); e.returnValue = ''; }
  });

  return {
    render,
    _onPickPdf, _onPickImage, _addBlankPage,
    _openInsertMenu, _closeInsertMenu, _insertMenuOpenArchive,
    _openArchivePicker, _closeArchivePicker, _pickerToggle, _pickerConfirm,
    _toggleSelectMode, _toggleSelect, _deleteSelected, _deletePage,
    _onGridSizeInput, _onGridSizeChange,
    _exportAll, _exportSelected, _toggleNUp,
    _onDragStart, _onDragOver, _onDrop, _onDragEnd, _onCardClick, _onGridBackgroundClick,
    _onGridDragOver, _onGridDrop,
    _onBodyDragEnter, _onBodyDragOver, _onBodyDragLeave, _onBodyDrop,
    _stageDragOver, _stageDrop,
    _openEditor, _closeEditor, _editorAddText, _editorAddImage, _editorAddErase, _editorAddShape, _editorDeleteAnnot,
    _openShapePicker, _closeShapePicker, _editorAddShapeKind,
    _toggleTextSelect, _copySelectedText, _addSelectedTextAsBox,
    _annotMouseDown, _annotResizeStart, _annotUpdate, _stageMouseDown, _backdropMouseDown,
    _annotEnterEditMode, _annotExitEditMode, _annotTextInput,
    _saveTitleInput, _saveCatInput, _saveVisInput, _cancelSave, _confirmSave,
    _doRestore, _discardRestore,
    _undo, _redo, _duplicatePage, _rotatePage,
  };
})();
