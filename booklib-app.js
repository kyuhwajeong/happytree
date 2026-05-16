/**
 * booklib-app.js — v3.2
 *
 * v3.2 변경사항
 * ─────────────
 * · 교재 편집 모달에 성적 리포트 설정 통합
 *   - 단어 총 테스트(문제) 수 입력
 *   - 리딩 체크 → 활성화 시 총 문제 수 + Review 컬럼 설정
 *   - Review: 기본 4개, 컬럼명 편집 가능, 개별 체크(성적표 표시 여부)
 *   - + 버튼으로 Review 추가 가능
 * · 나머지 기능 동일 (스탬프·체크·드래그·공유·출력)
 */
const BooklibApp = (() => {
  const LS_COL_PFX = 'hk10b_col_';
  const LS_CH_W    = 'hk10b_chw';
  const DEF_CH_W   = 220;
  const MIN_CH_W   = 70;
  const MAX_CH_W   = 420;
  const STU_W      = 72;
  const DOW_KO = ['일','월','화','수','목','금','토'];

  let _st = {
    subTab:'library', editBookId:null,
    matrixClassId:null, matrixBookId:null,
    stopMatrix:null, stopStamps:null,
    colOrder:[], chColWidth:parseInt(localStorage.getItem(LS_CH_W)||DEF_CH_W),
    chCollapsed:false, shareText:'', reportText:'',
    /* 편집 중 임시 리포트 설정 */
    editConfig: null,
  };
  let _checks={}, _stamps={};

  /* ══ CSS ══ */
  function _css() {
    if (document.getElementById('bl-styles')) return;
    const s = document.createElement('style');
    s.id = 'bl-styles';
    s.textContent = `
#page-booklib{display:none;flex-direction:column;height:100%;overflow:hidden;}
#page-booklib.on{display:flex;}
.bl-stabs{display:flex;background:var(--surf);border-bottom:1.5px solid var(--bdr);flex-shrink:0;overflow-x:auto;scrollbar-width:none;}
.bl-stabs::-webkit-scrollbar{display:none;}
.bl-stab{flex:1;min-width:80px;padding:11px 8px;text-align:center;font-size:13px;font-weight:700;color:var(--tx3);cursor:pointer;border-bottom:2.5px solid transparent;background:none;border-top:none;border-left:none;border-right:none;font-family:var(--font);transition:color .18s,border-color .18s;white-space:nowrap;}
.bl-stab.on{color:var(--a);border-bottom-color:var(--a);}
.bl-lib-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 14px 120px;position:relative;}
.bl-lbl{display:block;font-size:9px;font-weight:800;color:var(--tx3);letter-spacing:1.2px;text-transform:uppercase;padding:8px 2px 5px;}
.bl-add-row{display:flex;gap:8px;margin-bottom:8px;}
.bl-add-inp{flex:1;padding:10px 13px;border-radius:10px;background:var(--surf2);border:1.5px solid var(--bdr);font-size:14px;color:var(--tx);outline:none;font-family:var(--font);transition:border-color .2s;}
.bl-add-inp:focus{border-color:var(--a);background:var(--a10);}
.bl-add-inp::placeholder{color:var(--tx3);}
.bl-add-btn{padding:10px 18px;border-radius:10px;background:var(--a);color:#fff;font-weight:700;font-size:14px;border:none;cursor:pointer;flex-shrink:0;font-family:var(--font);box-shadow:0 3px 10px var(--a40);transition:all .15s;}
.bl-add-btn:active{transform:scale(.95);}
.bl-drop-zone{border:2px dashed var(--bdr2);border-radius:12px;padding:13px 16px;text-align:center;color:var(--tx3);font-size:12px;cursor:pointer;margin-bottom:12px;transition:all .18s;line-height:1.9;background:var(--surf2);}
.bl-drop-zone:hover,.bl-drop-zone.drag-over{border-color:var(--a);background:var(--a10);color:var(--a);}
.bl-empty{text-align:center;padding:56px 20px;color:var(--tx3);font-size:14px;line-height:2.2;}
.bl-book-card{background:var(--card);border:1px solid var(--bdr);border-radius:var(--r);overflow:hidden;box-shadow:var(--sh);margin-bottom:10px;cursor:pointer;transition:border-color .2s;animation:cardIn .22s ease both;}
.bl-book-card.has-ch{background:linear-gradient(135deg,var(--card) 80%,rgba(5,150,105,.06));}
.bl-book-card:not(.has-ch):not(.archived){background:linear-gradient(135deg,var(--card) 80%,rgba(59,130,246,.05));}
.bl-book-card.archived{background:var(--surf2);opacity:.75;cursor:default;}
.bl-stu-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:var(--a10);border:1px solid var(--a40);border-radius:12px;font-size:11px;font-weight:600;color:var(--a);}
.bl-stu-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;padding:8px;background:var(--surf2);border-radius:10px;border:1px solid var(--bdr);min-height:36px;}
.bl-stu-dropdown{position:absolute;left:0;right:0;top:100%;z-index:9999;background:var(--card);border:1.5px solid var(--a40);border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.12);max-height:200px;overflow-y:auto;margin-top:2px;}
.bl-book-card.multi-selecting{cursor:default;}
.bl-multi-ck{margin-right:2px;}
.bl-book-card:hover{border-color:var(--a40);}
.bl-move-btn{background:var(--surf2);border:1px solid var(--bdr2);border-radius:5px;width:22px;height:18px;font-size:9px;cursor:pointer;color:var(--tx3);line-height:1;padding:0;display:flex;align-items:center;justify-content:center;transition:all .12s;}
.bl-move-btn:hover{background:var(--a);color:#fff;border-color:var(--a);}
.bl-book-chdr{display:flex;align-items:center;gap:10px;padding:11px 13px;border-bottom:1px solid var(--bdr);background:var(--surf2);position:relative;}
.bl-book-ico{width:36px;height:36px;border-radius:9px;background:var(--a20);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;}
.bl-book-info{flex:1;min-width:0;}
.bl-book-title{font-size:15px;font-weight:800;color:var(--tx);}
.bl-book-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;}
.bl-badge{display:inline-flex;align-items:center;gap:2px;background:var(--card2);border:1px solid var(--bdr);border-radius:6px;padding:2px 7px;font-size:10px;font-weight:700;color:var(--tx2);}
.bl-badge.hi{background:var(--a10);border-color:var(--a40);color:var(--a);}
.bl-book-acts{display:flex;gap:5px;align-items:center;flex-shrink:0;}
.bl-ch-preview{padding:8px 13px;display:flex;gap:6px;flex-wrap:wrap;}
.bl-ch-tag{background:var(--card2);border:1px solid var(--bdr);border-radius:5px;padding:2px 7px;color:var(--tx3);font-size:11px;}

/* ── 편집 모달 ── */
.bl-editor-body{flex:1;overflow-y:auto;padding-bottom:8px;}
.bl-sec-divider{height:1px;background:var(--bdr);margin:12px 0 4px;}
.bl-ch-ta{width:100%;box-sizing:border-box;padding:10px 12px;background:var(--surf2);border:1.5px solid var(--bdr);border-radius:10px;font-size:13px;color:var(--tx);font-family:var(--font);outline:none;min-height:88px;resize:vertical;line-height:1.8;margin-bottom:4px;transition:border-color .2s;}
.bl-ch-ta:focus{border-color:var(--a);}
.bl-ch-hint{font-size:11px;color:var(--tx3);margin-bottom:10px;line-height:1.8;}
.bl-paste-row{display:flex;gap:8px;margin-bottom:14px;}
.bl-paste-btn{flex:1;padding:9px 8px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .15s;}
.bl-paste-btn.replace{background:var(--a10);border:1.5px solid var(--a40);color:var(--a);}
.bl-paste-btn.append{background:rgba(5,150,105,.1);border:1.5px solid rgba(5,150,105,.3);color:var(--green);}
.bl-paste-btn:active{transform:scale(.96);}
.bl-cls-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px;}
.bl-cls-chip{padding:5px 13px;border-radius:20px;font-size:12px;font-weight:700;border:1.5px solid var(--bdr2);background:var(--card2);color:var(--tx2);cursor:pointer;transition:all .15s;font-family:var(--font);}
.bl-cls-chip.on{border-color:var(--a);background:var(--a20);color:var(--a);box-shadow:0 2px 8px var(--a20);}
.bl-ch-list-wrap{max-height:200px;overflow-y:auto;margin-bottom:8px;}
.bl-ch-item{display:flex;align-items:center;gap:8px;padding:7px 6px;border-radius:8px;transition:background .12s;}
.bl-ch-item:hover{background:var(--card2);}
.bl-ch-ns{font-size:10px;font-weight:800;color:var(--tx3);min-width:26px;text-align:right;flex-shrink:0;}
.bl-ch-ts-label{flex:1;font-size:13px;color:var(--tx);}
.bl-ch-del-btn{background:none;border:none;color:var(--tx3);cursor:pointer;padding:3px 7px;font-size:12px;border-radius:5px;flex-shrink:0;font-family:var(--font);transition:all .12s;}
.bl-ch-del-btn:hover{color:#ef4444;background:rgba(239,68,68,.15);}

/* ── 성적 설정 섹션 ── */
.bl-grade-sec{background:var(--surf2);border-radius:10px;padding:10px 12px;margin-bottom:8px;}
.bl-grade-row{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--bdr);}
.bl-grade-row:last-child{border-bottom:none;}
.bl-grade-lbl{font-size:13px;font-weight:700;color:var(--tx2);flex:1;}
.bl-grade-inp{width:72px;padding:6px 10px;border-radius:9px;background:var(--surf);border:1.5px solid var(--bdr);font-size:14px;font-weight:700;color:var(--a);text-align:center;outline:none;font-family:var(--font);transition:border-color .2s;}
.bl-grade-inp:focus{border-color:var(--a);}
/* Review 행 */
.bl-rv-row{display:flex;align-items:center;gap:8px;padding:6px 4px;border-radius:8px;transition:background .1s;}
.bl-rv-row:hover{background:var(--card2);}
.bl-rv-check{width:16px;height:16px;cursor:pointer;flex-shrink:0;accent-color:var(--a);}
.bl-rv-name-inp{flex:1;padding:5px 8px;border-radius:7px;background:var(--surf);border:1.5px solid var(--bdr);font-size:12px;color:var(--tx);outline:none;font-family:var(--font);}
.bl-rv-name-inp:focus{border-color:var(--a);}
.bl-rv-del{background:none;border:none;color:var(--tx3);cursor:pointer;padding:4px 6px;font-size:12px;border-radius:5px;font-family:var(--font);}
.bl-rv-del:hover{color:#ef4444;}
.bl-rv-add-btn{display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:9px;background:var(--a10);border:1.5px dashed var(--a40);color:var(--a);font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font);margin-top:6px;transition:all .15s;width:100%;justify-content:center;}
.bl-rv-add-btn:active{transform:scale(.97);}

/* 매트릭스 탭 */
.bl-msel-bar{padding:10px 14px 8px;flex-shrink:0;display:flex;gap:8px;background:var(--surf);border-bottom:1px solid var(--bdr);flex-wrap:wrap;}
.bl-msel-item{flex:1;min-width:130px;}
.bl-msel-lbl{display:block;font-size:9px;font-weight:800;color:var(--tx3);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;}
.bl-msel-item select{width:100%;padding:8px 10px;border-radius:10px;background:var(--surf2);border:1.5px solid var(--bdr);font-size:13px;color:var(--tx);outline:none;cursor:pointer;font-family:var(--font);-webkit-appearance:none;transition:border-color .2s;}
.bl-msel-item select:focus{border-color:var(--a);}
.bl-mstats{display:flex;gap:10px;padding:6px 12px;flex-shrink:0;border-bottom:1px solid var(--bdr);flex-wrap:wrap;align-items:center;background:var(--surf2);}
.bl-mstat{font-size:11px;color:var(--tx3);display:flex;align-items:center;gap:3px;}
.bl-mstat-v{font-weight:800;color:var(--tx2);}
.bl-pct-bar{flex:1;min-width:50px;height:5px;border-radius:3px;background:var(--bdr);overflow:hidden;}
.bl-pct-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,var(--a),#10b981);transition:width .4s ease;}
.bl-wbtn{padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;background:var(--card);border:1px solid var(--bdr2);color:var(--tx2);cursor:pointer;font-family:var(--font);transition:all .12s;}
.bl-wbtn:active{background:var(--card2);}
.bl-report-btn{padding:5px 10px;border-radius:8px;font-size:11px;font-weight:700;background:var(--a10);border:1px solid var(--a40);color:var(--a);cursor:pointer;font-family:var(--font);white-space:nowrap;transition:all .15s;}
.bl-lib-view-btn{padding:5px 10px;border-radius:8px;font-size:12px;font-weight:700;background:var(--card);border:1px solid var(--bdr2);color:var(--tx2);cursor:pointer;transition:all .15s;}
.bl-lib-view-btn.active{background:var(--a10);border-color:var(--a40);color:var(--a);}
.bl-book-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.bl-cls-section{margin-bottom:18px;}
.bl-cls-section-hdr{display:flex;align-items:center;gap:8px;padding:6px 2px 8px;border-bottom:2px solid var(--a40);margin-bottom:10px;font-size:13px;font-weight:800;color:var(--a);}

.bl-report-btn:active{transform:scale(.95);}
.bl-mwrap{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:0 0 120px;}
.bl-mwrap::-webkit-scrollbar{width:4px;height:4px;}
.bl-mwrap::-webkit-scrollbar-thumb{background:var(--bdr2);border-radius:2px;}
.bl-mtbl{border-collapse:collapse;font-size:12px;width:100%;--ch-w:30%;--stu-w:auto;}
.bl-ch-hdr{position:sticky;top:0;left:0;z-index:5;width:30%;min-width:140px;background:var(--surf);border:1px solid var(--bdr);padding:7px 8px;font-size:10px;font-weight:800;color:var(--tx3);min-width:var(--ch-w);width:var(--ch-w);max-width:var(--ch-w);white-space:nowrap;display:flex;align-items:center;justify-content:space-between;gap:6px;}
.bl-collapse-btn{width:22px;height:22px;border-radius:5px;background:var(--card2);border:1px solid var(--bdr2);color:var(--tx3);font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:var(--font);transition:all .12s;}
.bl-shdr{position:sticky;top:0;z-index:7;background:var(--surf);border:1px solid var(--bdr);padding:7px 4px;text-align:center;min-width:var(--stu-w);width:var(--stu-w);cursor:pointer;transition:background .12s;user-select:none;-webkit-user-select:none;}
.bl-shdr:hover{background:var(--a10)!important;}
.bl-shdr.dragging{opacity:.4;background:var(--a10)!important;}
.bl-shdr.drag-over-left{border-left:2.5px solid var(--a)!important;}
.bl-shdr.drag-over-right{border-right:2.5px solid var(--a)!important;}
.bl-shdr-name{font-size:11px;font-weight:800;color:var(--tx);white-space:nowrap;}
.bl-shdr-cnt{font-size:10px;margin-top:2px;}
.bl-shdr-act{font-size:9px;margin-top:2px;color:var(--a);}
.bl-batch-row{background:var(--surf2);position:sticky;z-index:5;}
.bl-batch-hdr{position:sticky;left:0;background:var(--surf2);position:sticky;left:0;z-index:2;background:var(--surf2);border:1px solid var(--bdr);padding:5px 8px;font-size:9px;font-weight:800;color:var(--tx3);min-width:var(--ch-w);width:var(--ch-w);max-width:var(--ch-w);}
.bl-batch-ck{border:1px solid var(--bdr);text-align:center;cursor:pointer;transition:background .12s;width:var(--stu-w);}
.bl-batch-ck:hover{background:var(--a10);}
.bl-ch-cell{position:sticky;left:0;z-index:2;background:var(--surf);border:1px solid var(--bdr);min-width:var(--ch-w);width:var(--ch-w);max-width:var(--ch-w);padding:6px 8px;cursor:pointer;transition:background .15s;vertical-align:top;user-select:none;-webkit-user-select:none;}
.bl-ch-cell:hover{background:var(--card2);}
.bl-ch-cell.stamped{background:#fef3c7!important;border-left:3px solid #f59e0b!important;}
.dark .bl-ch-cell.stamped{background:#78350f28!important;border-left-color:#d97706!important;}
.bl-ch-inner{display:flex;flex-direction:column;gap:3px;}
.bl-ch-top{display:flex;align-items:flex-start;gap:4px;}
.bl-ch-n{font-size:10px;font-weight:800;color:var(--tx3);flex-shrink:0;padding-top:1px;min-width:18px;text-align:right;}
.bl-ch-t{font-size:11px;color:var(--tx2);line-height:1.55;word-break:break-all;overflow-wrap:anywhere;white-space:normal;}
.bl-ch-ts-row{display:flex;justify-content:flex-end;margin-top:4px;}
.bl-ch-ts{display:inline-flex;align-items:center;gap:3px;padding:2px 5px 2px 7px;border-radius:5px;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.3);font-size:9px;font-weight:700;color:#d97706;text-align:right;}
.dark .bl-ch-ts{background:rgba(245,158,11,.1);color:#fbbf24;}
.bl-ch-ts-t{font-variant-numeric:tabular-nums;letter-spacing:.2px;}
.bl-mtbl.ch-collapsed .bl-ch-cell,.bl-mtbl.ch-collapsed .bl-batch-hdr,.bl-mtbl.ch-collapsed .bl-ch-hdr{min-width:32px;width:32px;max-width:32px;padding:4px 2px;}
.bl-mtbl.ch-collapsed .bl-ch-t,.bl-mtbl.ch-collapsed .bl-ch-ts-row{display:none;}
.bl-cc{border:1px solid var(--bdr);vertical-align:top;cursor:pointer;transition:background .1s;-webkit-user-select:none;user-select:none;width:var(--stu-w);min-width:var(--stu-w);padding:0;}
.bl-cc:active{opacity:.6;}
.bl-chrow.in-eval .bl-cc:not(.undone){background:rgba(5,150,105,.07);}
.dark .bl-chrow.in-eval .bl-cc:not(.undone){background:rgba(5,150,105,.1);}
.bl-cc.undone{background:rgba(234,88,12,.07);}
.dark .bl-cc.undone{background:rgba(234,88,12,.1);}
.bl-cc-inner{display:flex;flex-direction:column;align-items:center;padding:5px 3px;min-height:32px;}
.bl-cm{font-size:14px;line-height:1;}
.bl-cc .bl-cm{color:transparent;}
.bl-cc.undone .bl-cm{color:#ea580c;font-weight:900;font-size:13px;}
.bl-chrow.from-xlsx-row .bl-ch-title{background:rgba(99,102,241,.07)!important;border-left:3px solid rgba(99,102,241,.4)!important;}
.bl-chrow.in-eval .bl-cc:not(.undone):hover .bl-cm{color:rgba(234,88,12,.25);}
.bl-sub-badges{display:flex;flex-wrap:wrap;gap:2px;justify-content:center;padding:2px 2px 3px;}
.bl-sub-badge{font-size:8px;font-weight:800;padding:1px 4px;border-radius:4px;background:rgba(234,88,12,.15);color:#ea580c;border:1px solid rgba(234,88,12,.25);}
.bl-chrow.after-stamp{opacity:.35;}
.bl-chrow.after-stamp .bl-cc{cursor:default;}
.bl-chrow.last-stamp .bl-ch-cell,.bl-chrow.last-stamp .bl-cc,.bl-chrow.last-stamp .bl-batch-ck{border-bottom:2.5px solid #f59e0b!important;}
.bl-mempty{padding:60px 24px;text-align:center;color:var(--tx3);font-size:14px;line-height:2.4;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;}
.bl-mempty-ico{font-size:44px;margin-bottom:8px;}
.bl-sub-popup{position:fixed;z-index:200;background:var(--card);border:1.5px solid var(--bdr);border-radius:12px;box-shadow:var(--sh2);padding:10px 12px;min-width:150px;animation:cardIn .14s ease;}
.bl-sub-popup-title{font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.5px;margin-bottom:8px;}
.bl-sub-opts{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;}
.bl-sub-opt{padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;border:1.5px solid var(--bdr2);background:var(--card2);color:var(--tx2);cursor:pointer;transition:all .12s;font-family:var(--font);}
.bl-sub-opt.on{border-color:#ea580c;background:rgba(234,88,12,.12);color:#ea580c;}
.bl-sub-opt:active{transform:scale(.93);}
.bl-sub-popup-acts{display:flex;gap:6px;}
.bl-sub-save{flex:1;padding:7px 8px;border-radius:8px;background:var(--a);color:#fff;border:none;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font);}
.bl-sub-close{padding:7px 10px;border-radius:8px;background:var(--surf2);border:1px solid var(--bdr2);color:var(--tx3);font-size:12px;cursor:pointer;font-family:var(--font);}
.bl-share-stats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;}
.bl-share-stat{flex:1;min-width:70px;border-radius:10px;padding:10px 6px;text-align:center;border:1px solid var(--bdr);}
.bl-share-stat-n{font-size:22px;font-weight:900;line-height:1;}
.bl-share-stat-l{font-size:11px;color:var(--tx3);margin-top:3px;}
.bl-share-box{background:var(--surf2);border-radius:10px;padding:13px 14px;font-size:12px;line-height:2;color:var(--tx);white-space:pre-wrap;word-break:break-all;border:1px solid var(--bdr);max-height:340px;overflow-y:auto;font-family:var(--font);margin:8px 0;}
.bl-share-scroll{flex:1;overflow-y:auto;}
.bl-share-acts{display:flex;gap:8px;flex-wrap:wrap;}
.bl-sbtn{flex:1;min-width:80px;padding:12px 8px;border-radius:10px;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .15s;}
.bl-sbtn.copy{background:var(--a10);color:var(--a);border:1px solid var(--a40);}
.bl-sbtn.share{background:var(--a);color:#fff;box-shadow:0 3px 10px var(--a40);}
.bl-sbtn.print{background:rgba(5,150,105,.1);color:var(--green);border:1px solid rgba(5,150,105,.3);}
.bl-sbtn:active{transform:scale(.96);}
.bl-ov-load{position:absolute;inset:0;background:rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;z-index:80;}
.bl-ov-load-box{background:var(--card);border-radius:14px;padding:22px 30px;text-align:center;font-size:14px;font-weight:700;color:var(--tx);box-shadow:var(--sh2);}
@media print{body>*:not(#bl-pf){display:none!important;}#bl-pf{display:block!important;position:fixed;inset:0;z-index:9999;background:#fff;padding:20px;font-family:var(--font);font-size:13px;color:#000;overflow:auto;}#bl-pf pre{white-space:pre-wrap;font-size:12px;line-height:1.9;}}
`;
    document.head.appendChild(s);
  }

  /* ══ INIT ══ */
  async function init() {
    _css();
    if (typeof BookLibDB==='undefined'){console.warn('[BooklibApp] BookLibDB not loaded');return;}
    await BookLibDB.init();
    BookLibDB.on('books',()=>{
      const pg=document.getElementById('page-booklib');
      if(!pg?.classList.contains('on'))return;
      if(_st.subTab==='library')_renderLibrary();
      else{const bsel=document.getElementById('bl-bsel');if(bsel)_fillBookSel(bsel);}
    });
    console.log('[BooklibApp] ✅ v3.2');
  }

  /* ══ RENDER ══ */
  function render(){
    const pg=document.getElementById('page-booklib');if(!pg)return;
    _stopListeners();pg.innerHTML=_shell();
    if(_st.subTab==='library')_renderLibrary();else _renderMatrixTab();
    // ★ FAB 표시 상태 초기화
    const fab=document.getElementById('bl-reg-fab');
    if(fab) fab.style.display=(_st.subTab==='library'?'flex':'none');
  }
  function _stopListeners(){
    if(_st.stopMatrix){_st.stopMatrix();_st.stopMatrix=null;}
    if(_st.stopStamps){_st.stopStamps();_st.stopStamps=null;}
  }
  function _shell(){return`
    <div class="ph">
      <div class="phl">
        <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#8b5cf6,#6366f1);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;box-shadow:0 3px 10px rgba(139,92,246,.4)">📖</div>
        <div style="min-width:0">
          <div class="ph-title" onclick="BooklibApp.render()" title="새로고침" style="cursor:pointer">교재 학습 관리 <span class="admin-badge">🔑 관리자</span></div>
          <div class="ph-sub" id="bl-ph-sub">교재 등록 · 챕터 체크</div>
          </div>



      </div>
    </div>
    <div class="bl-stabs">
      <button class="bl-stab ${_st.subTab==='library'?'on':''}" onclick="BooklibApp.switchTab('library')">📚 교재 관리</button>
      <button class="bl-stab ${_st.subTab==='matrix'?'on':''}"  onclick="BooklibApp.switchTab('matrix')">📊 학습 현황</button>
    </div>
    <!-- ★ 교재 등록 FAB 버튼 (교재관리 탭에서만 표시) -->
    <div id="bl-reg-fab" style="position:fixed;right:12px;bottom:90px;z-index:999;display:none;flex-direction:column;align-items:center;gap:4px">
      <button onclick="BooklibApp._openArchivedPopup()" title="완결 교재 목록" style="width:44px;height:44px;border-radius:50%;background:var(--surf2);color:var(--tx3);border:1.5px solid var(--bdr2);font-size:20px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12)">📦</button>
      <button onclick="BooklibApp._openRegModal()" title="교재 등록"
        style="width:54px;height:54px;border-radius:50%;background:var(--a);color:#fff;border:none;font-size:26px;cursor:pointer;box-shadow:0 4px 18px var(--a40);display:flex;align-items:center;justify-content:center;transition:all .15s">＋</button>
      <span style="font-size:9px;font-weight:800;color:var(--a);background:var(--card);padding:1px 6px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.1)">교재 등록</span>
    </div>
    <div id="bl-cnt" style="flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative;"></div>
    <div id="bl-editor-ov" class="ov hidden" onclick="if(event.target.id==='bl-editor-ov')BooklibApp.closeEditor()">
      <div class="sh" id="bl-editor-sh" onclick="event.stopPropagation()" style="max-height:94vh;display:flex;flex-direction:column;"></div>
    </div>
    <div id="bl-share-ov" class="ov hidden" onclick="if(event.target.id==='bl-share-ov')BooklibApp.closeShare()">
      <div class="sh" id="bl-share-sh" onclick="event.stopPropagation()" style="max-height:88vh;display:flex;flex-direction:column;"></div>
    </div>
    <div id="bl-report-ov" class="ov hidden" onclick="if(event.target.id==='bl-report-ov')BooklibApp.closeReport()">
      <div class="sh" id="bl-report-sh" onclick="event.stopPropagation()" style="max-height:92vh;display:flex;flex-direction:column;"></div>
    </div>`;}

  function switchTab(tab){
    // ★ 교재관리 탭에서만 FAB 표시
    const fab=document.getElementById('bl-reg-fab');
    if(fab) fab.style.display=(tab==='library'?'flex':'none');
    _st.subTab=tab;
    if(tab!=='matrix')_stopListeners();
    document.querySelectorAll('.bl-stab').forEach((b,i)=>b.classList.toggle('on',(i===0&&tab==='library')||(i===1&&tab==='matrix')));
    if(tab==='library')_renderLibrary();else _renderMatrixTab();
  }

  /* ══ LIBRARY ══ */
  function _openArchivedPopup(){
    document.getElementById('bl-arc-popup')?.remove();
    const arcBooks=typeof BookLibDB!=='undefined'?BookLibDB.getAllBooks().filter(b=>b.archived):[];
    const isAdm=typeof DB!=='undefined'&&DB.isAdmin();
    const modal=document.createElement('div');
    modal.id='bl-arc-popup';
    Object.assign(modal.style,{position:'fixed',inset:'0',background:'rgba(0,0,0,.45)',zIndex:'400',display:'flex',alignItems:'flex-end',justifyContent:'center'});
    modal.onclick=e=>{if(e.target===modal)modal.remove();};
    const sheet=document.createElement('div');
    Object.assign(sheet.style,{background:'var(--card)',borderRadius:'20px 20px 0 0',padding:'20px',width:'100%',maxWidth:'480px',maxHeight:'72vh',display:'flex',flexDirection:'column',boxShadow:'0 -4px 24px rgba(0,0,0,.18)'});
    const hdr=document.createElement('div');
    hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:12px';
    const titleEl=document.createElement('span'); titleEl.style.cssText='font-size:15px;font-weight:800';
    titleEl.textContent='📦 완결 교재 목록 ('+arcBooks.length+'개)';
    const closeBtn=document.createElement('button'); closeBtn.textContent='✕';
    closeBtn.style.cssText='background:none;border:none;font-size:22px;cursor:pointer;color:var(--tx3)';
    closeBtn.onclick=()=>modal.remove();
    hdr.appendChild(titleEl); hdr.appendChild(closeBtn); sheet.appendChild(hdr);
    if(isAdm&&arcBooks.length>0){
      const bulk=document.createElement('div'); bulk.style.cssText='display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap';
      const mkB=(txt,cb,red)=>{const b=document.createElement('button');b.textContent=txt;b.style.cssText='font-size:11px;padding:4px 10px;border-radius:7px;cursor:pointer;'+(red?'background:rgba(239,68,68,.1);border:1.5px solid rgba(239,68,68,.3);color:#dc2626;font-weight:700':'background:var(--surf2);border:1px solid var(--bdr2)');b.onclick=cb;return b;};
      bulk.appendChild(mkB('전체선택',()=>modal.querySelectorAll('.arc-ck').forEach(c=>c.checked=true)));
      bulk.appendChild(mkB('전체해제',()=>modal.querySelectorAll('.arc-ck').forEach(c=>c.checked=false)));
      bulk.appendChild(mkB('🗑 선택삭제',async()=>{
        const cks=[...modal.querySelectorAll('.arc-ck:checked')];
        if(!cks.length){_toast('삭제할 교재를 선택하세요','error');return;}
        if(!confirm(cks.length+'개를 삭제하시겠습니까?'))return;
        for(const ck of cks){
          const bName=BookLibDB.getBookById(ck.dataset.bid)?.name||ck.dataset.bid;
          const arcMsg=['"'+bName+'" 완결 교재를 완전히 삭제하시겠습니까?','','⚠️ 아래 데이터가 모두 삭제됩니다:','  · 챕터 목록','  · 학습 현황','  · 플로팅 메모','  · 성적 평가/리포트 데이터','','정말 삭제하시겠습니까? 되돌릴 수 없습니다.'].join('\n');
          if(!confirm(arcMsg)) continue;
          await BookLibDB.deleteBook(ck.dataset.bid);ck.closest('.arc-row')?.remove();
        }
        titleEl.textContent='📦 완결 교재 목록 ('+modal.querySelectorAll('.arc-row').length+'개)';
        _renderLibrary();
      },true));
      sheet.appendChild(bulk);
    }
    const listEl=document.createElement('div'); listEl.style.cssText='overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:6px';
    if(!arcBooks.length){listEl.innerHTML='<p style="text-align:center;color:var(--tx3);padding:24px">완결된 교재가 없습니다</p>';}
    else{arcBooks.forEach(b=>{
      const row=document.createElement('div'); row.className='arc-row';
      row.style.cssText='display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--surf2);border-radius:10px;border:1px solid var(--bdr)';
      if(isAdm){const ck=document.createElement('input');ck.type='checkbox';ck.className='arc-ck';ck.dataset.bid=b.id;ck.style.cssText='width:16px;height:16px;accent-color:var(--a);flex-shrink:0';row.appendChild(ck);}
      const info=document.createElement('div'); info.style.cssText='flex:1;min-width:0';
      const _arcAllCls=typeof DB!=='undefined'?DB.getActiveClasses():[];
      const _arcClsNames=(b.classIds||[]).map(cid=>{const c=_arcAllCls.find(x=>x.id===cid);return c?c.name:'?';}).filter(Boolean);
      const _arcStuNames=(b.studentIds||[]).length&&typeof StudentDB!=='undefined'?StudentDB.getAll().filter(s=>(b.studentIds||[]).includes(s.id)).map(s=>s.name).slice(0,3):[]; 
      const _arcBadge=_arcClsNames.length?'<span style="background:var(--a10);color:var(--a);border:1px solid var(--a40);border-radius:10px;padding:1px 8px;font-size:10px;font-weight:700">'+_arcClsNames.join('·')+'반</span>':(_arcStuNames.length?'<span style="background:rgba(99,102,241,.1);color:#6366f1;border:1px solid rgba(99,102,241,.3);border-radius:10px;padding:1px 8px;font-size:10px;font-weight:700">🐱 '+_arcStuNames.join('·')+(((b.studentIds||[]).length>3)?' 외':'')+' </span>':'');
      info.innerHTML='<div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_e(b.name)+'</div><div style="display:flex;align-items:center;gap:6px;margin-top:3px">'+_arcBadge+'<span style="font-size:11px;color:var(--tx3)">'+(b.archivedAt?b.archivedAt.slice(0,10):'')+'</span></div>';
      row.appendChild(info);
      if(isAdm){
        const rBtn=document.createElement('button'); rBtn.textContent='↩️ 복원';
        rBtn.style.cssText='padding:4px 10px;border-radius:7px;background:rgba(99,102,241,.1);border:1.5px solid rgba(99,102,241,.4);color:var(--a);font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap';
        rBtn.onclick=()=>BooklibApp._unarchiveBook(b.id);
        const dBtn=document.createElement('button'); dBtn.textContent='🗑';
        dBtn.style.cssText='padding:4px 10px;border-radius:7px;background:rgba(239,68,68,.1);border:1.5px solid rgba(239,68,68,.3);color:#dc2626;font-size:11px;font-weight:700;cursor:pointer';
        dBtn.onclick=async()=>{if(!confirm('"'+b.name+'" 을 삭제하시겠습니까?'))return;await BookLibDB.deleteBook(b.id);row.remove();titleEl.textContent='📦 완결 교재 목록 ('+modal.querySelectorAll('.arc-row').length+'개)';_renderLibrary();};
        row.appendChild(rBtn); row.appendChild(dBtn);
      }
      listEl.appendChild(row);
    });}
    sheet.appendChild(listEl); modal.appendChild(sheet); document.body.appendChild(modal);
  }

  function _inlineRenameInPopup(bookId, spanEl){
    // 챕터 팝업 상단 교재명 인라인 편집
    const cur = spanEl.textContent.trim();
    const inp = document.createElement('input');
    inp.value = cur;
    inp.style.cssText = 'font-size:16px;font-weight:800;padding:2px 6px;border:2px solid var(--a);border-radius:6px;background:var(--surf2);font-family:var(--font);outline:none;max-width:200px';
    spanEl.replaceWith(inp);
    inp.focus(); inp.select();
    const done = async () => {
      const newName = inp.value.trim();
      if(newName && newName !== cur){
        await BookLibDB.updateBook(bookId, {name: newName});
        _renderLibrary();
        _toast('✅ 교재명 변경: ' + newName, 'success');
        // 팝업 제목 업데이트
        const newSpan = document.createElement('span');
        newSpan.id = 'bl-ed-book-name-lbl';
        newSpan.title = '더블클릭하여 교재명 변경';
        newSpan.style.cssText = 'cursor:pointer;border-bottom:2px dashed var(--a40);padding-bottom:1px';
        newSpan.textContent = newName;
        newSpan.ondblclick = ()=>BooklibApp._inlineRenameInPopup(bookId, newSpan);
        inp.replaceWith(newSpan);
      } else {
        // 원복
        const newSpan = document.createElement('span');
        newSpan.id = 'bl-ed-book-name-lbl';
        newSpan.title = '더블클릭하여 교재명 변경';
        newSpan.style.cssText = 'cursor:pointer;border-bottom:2px dashed var(--a40);padding-bottom:1px';
        newSpan.textContent = cur;
        newSpan.ondblclick = ()=>BooklibApp._inlineRenameInPopup(bookId, newSpan);
        inp.replaceWith(newSpan);
      }
    };
    inp.addEventListener('blur', done);
    inp.addEventListener('keydown', e=>{
      if(e.key==='Enter') inp.blur();
      if(e.key==='Escape'){ inp.value=cur; inp.blur(); }
    });
  }

  function _inlineRenameBook(bookId, titleEl){
    const cur = titleEl.textContent.trim();
    const inp = document.createElement('input');
    inp.value = cur;
    inp.style.cssText = 'width:100%;font-size:14px;font-weight:800;padding:2px 6px;border:2px solid var(--a);border-radius:6px;background:var(--surf2);font-family:var(--font);outline:none';
    titleEl.replaceWith(inp);
    inp.focus(); inp.select();
    const confirm_rename = async () => {
      const newName = inp.value.trim();
      if(newName && newName !== cur) {
        await BookLibDB.updateBook(bookId, {name: newName});
        _renderLibrary();
        _toast('✅ 교재명 변경: ' + newName, 'success');
      } else {
        _renderLibrary();
      }
    };
    inp.addEventListener('blur', confirm_rename);
    inp.addEventListener('keydown', e => {
      if(e.key==='Enter') { inp.blur(); }
      if(e.key==='Escape') { inp.value=cur; inp.blur(); }
    });
  }

  let _libViewMode = localStorage.getItem('bl_lib_view')||'list';
  let _libFilterCls = null; // 현재 선택된 반 필터

  function _renderClsFilterBtns(books, isAdmin){
    const wrap = document.getElementById('bl-cls-filter-btns');
    if(!wrap) return;
    const allCls = typeof DB!=='undefined' ? DB.getActiveClasses() : [];
    // 실제 교재가 있는 반만 표시
    const usedCls = allCls.filter(c=>books.some(b=>(b.classIds||[]).includes(c.id)));
    const hasStu = books.some(b=>(b.studentIds||[]).length>0);
    const hasNone = books.some(b=>!(b.classIds||[]).length&&!(b.studentIds||[]).length);

    wrap.innerHTML = '';
    // [전체] 버튼
    const allBtn = document.createElement('button');
    allBtn.textContent = '전체';
    allBtn.style.cssText = 'padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;' + (!_libFilterCls?'background:var(--a);color:#fff;border:none;':'background:var(--card);color:var(--tx3);border:1px solid var(--bdr2);');
    allBtn.onclick = ()=>{ _libFilterCls=null; _rerenderBookGroups(books,isAdmin); _renderClsFilterBtns(books,isAdmin); };
    wrap.appendChild(allBtn);

    // 반별 버튼
    usedCls.forEach(cls=>{
      const btn = document.createElement('button');
      btn.textContent = cls.name+'반';
      const isActive = _libFilterCls===cls.id;
      btn.style.cssText = 'padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;' + (isActive?'background:var(--a);color:#fff;border:none;':'background:var(--card);color:var(--tx3);border:1px solid var(--bdr2);');
      btn.onclick = ()=>{
        _libFilterCls = (_libFilterCls===cls.id)?null:cls.id;
        _rerenderBookGroups(books,isAdmin);
        _renderClsFilterBtns(books,isAdmin);
        // ★ 선택한 반 섹션으로 스크롤
        if(_libFilterCls){
          setTimeout(()=>{
            const sec = document.querySelector('.bl-cls-section[data-cls-id="'+_libFilterCls+'"]');
            if(sec) sec.scrollIntoView({behavior:'smooth',block:'start'});
          },50);
        }
      };
      wrap.appendChild(btn);
    });

    // 학생배정/미배정 버튼
    if(hasStu){
      const btn=document.createElement('button');
      btn.textContent='🐱 학생배정';
      const isActive=_libFilterCls==='__stu__';
      btn.style.cssText='padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;'+(isActive?'background:var(--a);color:#fff;border:none;':'background:var(--card);color:var(--tx3);border:1px solid var(--bdr2);');
      btn.onclick=()=>{_libFilterCls=(_libFilterCls==='__stu__')?null:'__stu__';_rerenderBookGroups(books,isAdmin);_renderClsFilterBtns(books,isAdmin);if(_libFilterCls){setTimeout(()=>{const sec=document.querySelector('.bl-cls-section[data-cls-id="__stu__"]');if(sec)sec.scrollIntoView({behavior:'smooth',block:'start'});},50);}};
      wrap.appendChild(btn);
    }
  }

  function _rerenderBookGroups(books, isAdmin){
    const grpEl = document.querySelector('.bl-books-grouped');
    if(!grpEl) return;
    grpEl.innerHTML = _renderBooksByClass(books.filter(b=>!b.archived).sort((a,b2)=>(a.sortOrder??999)-(b2.sortOrder??999)), isAdmin);
  }



  function _setLibView(mode){
    _libViewMode = mode;
    localStorage.setItem('bl_lib_view', mode);
    document.getElementById('bl-view-list')?.classList.toggle('active', mode==='list');
    document.getElementById('bl-view-grid')?.classList.toggle('active', mode==='grid');
    // 교재 목록 영역만 재렌더
    const activeBooks = document.getElementById('bl-active-books');
    if(!activeBooks) return;
    const books = BookLibDB.getBooks();
    const isAdmin = typeof DB!=='undefined'&&DB.isAdmin();
    const activeList = books.filter(b=>!b.archived).sort((a,b2)=>(a.sortOrder??999)-(b2.sortOrder??999));
    // 그룹 영역만 교체
    const grpEl = activeBooks.querySelector('.bl-books-grouped');
    if(grpEl) grpEl.innerHTML = _renderBooksByClass(activeList, isAdmin);
  }

  function _renderBooksByClass(activeBooks, isAdmin){
    if(!activeBooks.length) return '';
    const allCls = typeof DB!=='undefined' ? DB.getActiveClasses() : [];
    const viewMode = _libViewMode || 'list';
    const wrapClass = viewMode==='grid' ? 'bl-book-grid' : '';

    // 반별 그룹핑
    const groups = {}; // clsId → {cls, books:[]}
    const noClass = []; // 반 미배정
    const stuOnly = []; // 학생만 배정

    activeBooks.forEach(b=>{
      const cIds = b.classIds||[];
      if(cIds.length===0){
        if((b.studentIds||[]).length>0) stuOnly.push(b);
        else noClass.push(b);
      } else {
        cIds.forEach(cid=>{
          if(!groups[cid]) groups[cid]={cls:allCls.find(c=>c.id===cid)||{id:cid,name:'?'},books:[]};
          if(!groups[cid].books.find(x=>x.id===b.id)) groups[cid].books.push(b);
        });
      }
    });

    const sections = [];

    // ★ 필터 적용: 특정 반 선택 시 해당 반 맨 위
    const filterId = typeof _libFilterCls !== 'undefined' ? _libFilterCls : null;
    let sortedCls = [...allCls];
    if(filterId && filterId !== '__stu__'){
      sortedCls = [
        ...sortedCls.filter(c=>c.id===filterId),
        ...sortedCls.filter(c=>c.id!==filterId)
      ];
    }

    // 반별 섹션
    sortedCls.forEach(cls=>{
      if(!groups[cls.id]) return;
      const isFiltered = filterId && filterId!=='__stu__';
      const isActive = filterId===cls.id;
      // 필터 있고 해당 반 아니면 숨김
      const display = isFiltered && !isActive ? 'display:none;' : '';
      const highlight = isActive ? 'border:2px solid var(--a);box-shadow:0 0 0 3px var(--a20);' : '';
      const booksHTML = groups[cls.id].books.map(b=>_bookCardHTML(b,isAdmin)).join('');
      sections.push(`<div class="bl-cls-section" data-cls-id="${cls.id}" style="${display}">
        <div class="bl-cls-section-hdr" style="${highlight}border-radius:8px;padding:6px 10px;">
          <span style="background:${isActive?'var(--a)':'var(--a)'};color:#fff;padding:2px 10px;border-radius:20px;font-size:12px">${_e(cls.name)}반</span>
          <span style="font-size:11px;color:var(--tx3);font-weight:400">${groups[cls.id].books.length}개</span>
        </div>
        <div class="${wrapClass}">${booksHTML}</div>
      </div>`);
    });

    // 학생만 배정
    if(stuOnly.length){
      const booksHTML = stuOnly.map(b=>_bookCardHTML(b,isAdmin)).join('');
      sections.push(`<div class="bl-cls-section" data-cls-id="__stu__" style="${filterId&&filterId!=='__stu__'?'display:none;':''}">
        <div class="bl-cls-section-hdr">
          <span style="background:rgba(99,102,241,.6);color:#fff;padding:2px 10px;border-radius:20px;font-size:12px">🐱 학생 배정</span>
          <span style="font-size:11px;color:var(--tx3);font-weight:400">${stuOnly.length}개</span>
        </div>
        <div class="${wrapClass}">${booksHTML}</div>
      </div>`);
    }

    // 반 미배정
    if(noClass.length){
      const booksHTML = noClass.map(b=>_bookCardHTML(b,isAdmin)).join('');
      sections.push(`<div class="bl-cls-section">
        <div class="bl-cls-section-hdr">
          <span style="background:var(--bdr2);color:var(--tx2);padding:2px 10px;border-radius:20px;font-size:12px">📦 반 미배정</span>
          <span style="font-size:11px;color:var(--tx3);font-weight:400">${noClass.length}개</span>
        </div>
        <div class="${wrapClass}">${booksHTML}</div>
      </div>`);
    }

    return '<div class="bl-books-grouped">'+sections.join('')+'</div>';
  }

  function _renderLibrary(){
    const cnt=document.getElementById('bl-cnt');if(!cnt)return;
    const books=BookLibDB.getBooks(),isAdmin=typeof DB!=='undefined'&&DB.isAdmin();
    const sub=document.getElementById('bl-ph-sub');if(sub)sub.textContent=`교재 ${books.length}개`;
    // ★ 반 필터 버튼 생성
    // ★ 반 필터 버튼은 cnt.innerHTML 이후에 생성 (아래에서 호출)
    cnt.innerHTML=`<div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
      <!-- ★ 고정 헤더 (스크롤해도 고정) -->
      <div style="flex-shrink:0;background:var(--card);border-bottom:1.5px solid var(--bdr2);padding:8px 14px 0;z-index:5">
        ${isAdmin?`
        <!-- 교재 등록 영역 (기본 숨김, FAB 버튼으로 토글) -->
        <div id="bl-reg-area" style="display:none;margin-bottom:10px;padding:12px;background:var(--surf2);border-radius:12px;border:1.5px solid var(--bdr2)">
          <div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:1px;margin-bottom:8px">교재 등록</div>
          <div class="bl-add-row">
            <input class="bl-add-inp" id="bl-book-inp" placeholder="📖 교재명 입력 후 Enter" onkeydown="if(event.key==='Enter'){BooklibApp.addBook();event.preventDefault()}">
            <button class="bl-add-btn" onclick="BooklibApp.addBook()">추가</button>
          </div>
          <div class="bl-drop-zone" id="bl-book-csv">📂 교재 목록 파일 드롭 · 또는 탭하여 선택<div style="font-size:10px;margin-top:2px;opacity:.7">.csv/.txt/.xlsx</div></div>
        </div>`:``}
        <!-- 교재 목록 타이틀 + 다중선택 버튼 -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0 8px;gap:8px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:1;min-width:0">
            <span style="font-size:12px;font-weight:800;color:var(--tx2);flex-shrink:0">교재 목록</span>
            <span style="font-size:11px;color:var(--tx3);background:var(--surf2);padding:1px 7px;border-radius:10px;font-weight:700;flex-shrink:0" id="bl-book-cnt-badge">${books.filter(b=>!b.archived).length}개</span>
            <!-- ★ 반 퀵 서치 버튼 -->
            <div id="bl-cls-filter-btns" style="display:flex;gap:4px;flex-wrap:wrap"></div>
          </div>
          <div style="display:flex;align-items:center;gap:5px;flex-shrink:0">
            <!-- ★ 뷰 모드 토글 -->
            <button id="bl-view-list" class="bl-lib-view-btn active" onclick="BooklibApp._setLibView('list')" title="리스트 보기" style="padding:3px 8px;border-radius:6px;font-size:13px;background:var(--a10);border:1px solid var(--a40);color:var(--a);cursor:pointer;font-weight:700">☰</button>
            <button id="bl-view-grid" class="bl-lib-view-btn" onclick="BooklibApp._setLibView('grid')" title="2열 그리드" style="padding:3px 8px;border-radius:6px;font-size:13px;background:var(--card);border:1px solid var(--bdr2);color:var(--tx3);cursor:pointer">⊞</button>
            ${isAdmin&&books.filter(b=>!b.archived).length>0?`<button id="bl-multi-arc-btn" style="font-size:11px;padding:3px 10px;border-radius:7px;background:var(--card2);border:1px solid var(--bdr2);color:var(--tx3);cursor:pointer;font-family:var(--font)" onclick="BooklibApp._toggleMultiSelect()">☑ 다중선택</button>`:''}
          </div>
        </div>
        <!-- 다중선택 액션바 -->
        <div id="bl-multi-bar" style="display:none;padding:0 0 8px;gap:6px;align-items:center;flex-wrap:wrap">
          <span id="bl-multi-cnt" style="font-size:12px;font-weight:700;color:var(--tx2)">0개 선택</span>
          <button id="bl-multi-copy-btn" style="font-size:12px;padding:4px 12px;border-radius:8px;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.3);color:var(--a);cursor:pointer;font-family:var(--font);font-weight:700;display:none" onclick="BooklibApp._multiCopy()">📋 복사</button>
          <button id="bl-multi-arch-btn" style="font-size:12px;padding:4px 12px;border-radius:8px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.4);color:#d97706;cursor:pointer;font-family:var(--font);font-weight:700;display:none" onclick="BooklibApp._multiArchive()">📦 완결 처리</button>
          <button id="bl-multi-del-btn" style="font-size:12px;padding:4px 12px;border-radius:8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#dc2626;cursor:pointer;font-family:var(--font);font-weight:700;display:none" onclick="BooklibApp._multiDelete()">🗑 삭제</button>
          <button style="font-size:12px;padding:4px 10px;border-radius:8px;background:var(--surf2);border:1px solid var(--bdr2);color:var(--tx3);cursor:pointer;font-family:var(--font)" onclick="BooklibApp._cancelMultiSelect()">✕ 해제</button>
        </div>
      </div>
      <!-- ★ 스크롤 영역 (교재 카드만 스크롤) -->
      <div id="bl-active-books" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 14px 120px">
        ${books.length===0?`<div class="bl-empty"><div style="font-size:48px;margin-bottom:10px">📚</div>등록된 교재가 없습니다</div>`:`
        ${_renderBooksByClass(books.filter(b=>!b.archived).sort((a,b2)=>(a.sortOrder??999)-(b2.sortOrder??999)),isAdmin)}
        ${books.some(b=>b.archived)?`
        <div style="margin-top:20px">
          <div style="display:flex;align-items:center;gap:8px;padding:10px 4px;border-top:2px solid var(--bdr);cursor:pointer"
               onclick="BooklibApp._toggleArchivedSection(this)">
            <span style="font-size:13px;font-weight:800;color:var(--tx2)">📦 완결된 교재</span>
            <span style="font-size:11px;color:var(--tx3);background:var(--surf2);padding:1px 7px;border-radius:10px">${books.filter(b=>b.archived).length}개</span>
            <span id="bl-arc-arrow" style="margin-left:auto;font-size:12px;color:var(--tx3)">▼</span>
          </div>
          <div id="bl-arc-list" style="display:flex;flex-direction:column;gap:6px;opacity:.8">
            ${books.filter(b=>b.archived).map(b=>_bookCardHTML(b,isAdmin)).join('')}
          </div>
        </div>`:``}
        `}
      </div>
    </div>`;
    // ★ cnt DOM 생성 후 반 필터 버튼 생성
    _renderClsFilterBtns(books,isAdmin);
    if(isAdmin){
      _bindDrop('bl-book-csv',null,_importBookFile);
      setTimeout(()=>document.getElementById('bl-book-inp')?.focus(),80);
      setTimeout(()=>{
        const list=document.getElementById('bl-active-books');
        if(!list) return;
        // ★ click과 touchend 모두 처리 (draggable 제거 후 click으로 충분)
        const handler=e=>{
          if(list.classList.contains('multi-selecting')) return;
          if(e.target.closest('.bl-book-acts')) return;
          if(e.target.type==='checkbox') return;
          if(e.target.tagName==='BUTTON') return;
          if(e.target.closest('.bl-book-title[contenteditable]')) return;
          const card=e.target.closest('[data-bid]');
          if(!card) return;
          if(card.dataset.admin!=='1') return;
          BooklibApp.openEditor(card.dataset.bid,'chapters');
        };
        list.addEventListener('click', handler);
      },100);
      // ★ 교재 드래그앤드롭 순서 변경 이벤트 바인딩
      setTimeout(()=>_bindBookListDrag(), 50);
    }
  }

  function _bookCardHTML(b,isAdmin){
    const chN=(b.chapters||[]).length;
    const allCls=typeof DB!=='undefined'?DB.getActiveClasses():[];
    const clsNames=(b.classIds||[]).map(id=>allCls.find(c=>c.id===id)?.name||id).join(', ');
    const cfg=b.reportConfig;
    const hasGrade=cfg?.word?.totalQ>0||cfg?.reading?.enabled;
    const isArchived=!!b.archived;
    // ★ 챕터 없으면 [일반], 있으면 [N챕터]
    const chLabel=chN>0?`📑 ${chN}챕터`:`[일반]`;
    const chLabelStyle=chN>0?'':'color:#9333ea;background:rgba(147,51,234,.1);border-color:rgba(147,51,234,.3)';
    // ★ 학생 직접 배정 이름들
    const allStus=typeof DB!=='undefined'?DB.getClasses().flatMap(c=>
      (typeof DB.getStudents==='function'?DB.getStudents().filter(s=>s.cls===c.name):[])):[];
    const stuNames=(b.studentIds||[]).map(id=>allStus.find(s=>s.id===id)?.name||'').filter(Boolean).join(', ');
    return`<div class="bl-book-card ${isArchived?'archived':chN>0?'has-ch':''}" data-bid="${b.id}"
      data-admin="${isAdmin&&!isArchived?'1':'0'}">
      <div class="bl-book-chdr">


        ${isAdmin&&!isArchived?`<input type="checkbox" class="bl-multi-ck" data-bid="${b.id}" onclick="event.stopPropagation();BooklibApp._onMultiCkChange()" style="display:none;width:17px;height:17px;accent-color:var(--a);cursor:pointer;flex-shrink:0">`:''} 
        <div class="bl-book-ico">${isArchived?'📦':'📖'}</div>
        <div class="bl-book-info" style="flex:1;min-width:0">
          <div class="bl-book-title" ondblclick="event.stopPropagation();BooklibApp._inlineRenameBook('${b.id}',this)" title="더블클릭하여 교재명 변경">${_e(b.name)}</div>
          <div class="bl-book-meta">
            <span class="bl-badge" style="${chLabelStyle}">${chLabel}</span>
            ${clsNames?`<span class="bl-badge hi">🏫 ${_e(clsNames)}</span>`:(b.studentIds&&b.studentIds.length?(()=>{const _aS=typeof StudentDB!=="undefined"?StudentDB.getAll():[];const _nms=(b.studentIds||[]).slice(0,3).map(id=>(_aS.find(s=>s.id===id)||{}).name||"").filter(Boolean);return _nms.length?`<span class="bl-badge" style="background:var(--a10);color:var(--a);border:1px solid var(--a40)">🐱 ${_nms.join(" · ")}${(b.studentIds||[]).length>3?" 외 "+((b.studentIds||[]).length-3)+"명":""}</span>`:"";})():"")}
            ${isArchived?`<span class="bl-badge" style="color:var(--tx3)">📦 완결 ${b.archivedAt?b.archivedAt.slice(0,10):''}</span>`:''}
          </div>
        </div>
        ${isAdmin?`<div class="bl-book-acts" onclick="event.stopPropagation()" style="display:flex;gap:4px;align-items:center;flex-shrink:0">
          ${!isArchived?`
            <button class="ibtn" onclick="event.stopPropagation();BooklibApp._openEvalTab('${b.id}')" title="평가 설정">📊</button>
            <button class="ibtn" onclick="event.stopPropagation();BooklibApp._copyBook('${b.id}')" title="복사">📋</button>
            <button class="ibtn" onclick="event.stopPropagation();BooklibApp._archiveBook('${b.id}')" title="완결 처리">🔒</button>
          `:`<button class="ibtn" onclick="event.stopPropagation();BooklibApp._unarchiveBook('${b.id}')" title="복원">↩️</button>`}
        </div>`:''} 
      </div>
      ${chN>0&&!isArchived?`<div class="bl-ch-preview">${(b.chapters||[]).slice(0,5).map(c=>`<span class="bl-ch-tag">${_e(c.title)}</span>`).join('')}${chN>5?`<span style="color:var(--a);font-weight:700;font-size:11px">+${chN-5}</span>`:''}</div>`:''}
    </div>`;}


  function _bindBookListDrag(){ /* draggable 제거됨 */ }

  function _bindBookListDrag(){
    const container=document.getElementById('bl-active-books'); if(!container) return;
    let dragId=null;
    container.querySelectorAll('[data-bid][draggable="true"]').forEach(card=>{
      card.addEventListener('dragstart',e=>{
        dragId=card.dataset.bid; card.style.opacity='.4';
        e.dataTransfer.effectAllowed='move';
      });
      card.addEventListener('dragend',()=>{card.style.opacity='';dragId=null;
        container.querySelectorAll('.drag-over-book').forEach(c=>c.classList.remove('drag-over-book'));
      });
      card.addEventListener('dragover',e=>{
        e.preventDefault(); if(!dragId||dragId===card.dataset.bid)return;
        container.querySelectorAll('.drag-over-book').forEach(c=>c.classList.remove('drag-over-book'));
        card.classList.add('drag-over-book');
      });
      card.addEventListener('dragleave',()=>card.classList.remove('drag-over-book'));
      card.addEventListener('drop',async e=>{
        e.preventDefault(); card.classList.remove('drag-over-book');
        if(!dragId||dragId===card.dataset.bid)return;
        // 순서 재배열
        const cards=[...container.querySelectorAll('[data-bid]')];
        const fromIdx=cards.findIndex(c=>c.dataset.bid===dragId);
        const toIdx=cards.findIndex(c=>c.dataset.bid===card.dataset.bid);
        if(fromIdx<0||toIdx<0)return;
        const ids=cards.map(c=>c.dataset.bid);
        const [moved]=ids.splice(fromIdx,1); ids.splice(toIdx,0,moved);
        await BookLibDB.reorderBooks(ids);
        _renderLibrary();
      });
    });
  }

  function _bindDrop(elId,bookId,handler){
    const el=document.getElementById(elId);if(!el)return;
    el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('drag-over');});
    el.addEventListener('dragleave',()=>el.classList.remove('drag-over'));
    el.addEventListener('drop',async e=>{e.preventDefault();el.classList.remove('drag-over');if(e.dataTransfer?.files?.[0])await handler(e.dataTransfer.files[0],bookId);});
    el.addEventListener('click',()=>{const inp=document.createElement('input');inp.type='file';inp.accept='.xlsx,.xls,.csv,.txt';inp.onchange=e=>{if(e.target.files[0])handler(e.target.files[0],bookId);};inp.click();});
  }
  async function _importBookFile(file){
    const ov=_showLoading(document.getElementById('bl-cnt'));
    try{const lines=await _fileToLines(file);let added=0;for(const name of lines)if(name&&!BookLibDB.getBooks().some(b=>b.name===name)){await BookLibDB.addBook(name);added++;}_toast(`📚 ${added}개 추가`,'success');_renderLibrary();}
    catch(e){_toast('❌ '+e.message);}finally{ov.remove();}
  }
  // ★ 교재 등록 팝업 모달 (bl-reg-area DOM 없을 때 폴백)
  function _openRegModal() {
    let modal = document.getElementById('bl-reg-modal');
    if (modal) { modal.remove(); return; }

    const allCls   = typeof DB!=='undefined' ? DB.getActiveClasses() : [];
    const allStus  = typeof StudentDB!=='undefined' ? StudentDB.getAll().filter(s=>s.status!=='퇴원') : [];
    const CHOSUNGS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

    modal = document.createElement('div');
    modal.id  = 'bl-reg-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:500;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.45)';

    // ── 내부 상태 ──
    modal._selCls  = new Set();   // 선택된 classId
    modal._selStus = new Map();   // studentId → {id,name,classCode}

    const sheet = document.createElement('div');
    sheet.style.cssText = 'background:var(--card);border-radius:20px 20px 0 0;padding:20px 20px 36px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 -4px 20px rgba(0,0,0,.15);display:flex;flex-direction:column;gap:0';

    // ── 헤더 ──
    sheet.innerHTML = `
      <div style="text-align:center;width:40px;height:4px;background:var(--bdr);border-radius:2px;margin:0 auto 16px"></div>
      <div style="font-size:15px;font-weight:800;color:var(--tx);margin-bottom:14px">📖 교재 등록</div>`;

    // ── 교재명 ──
    const nameWrap = document.createElement('div');
    nameWrap.style.cssText = 'margin-bottom:16px';
    nameWrap.innerHTML = `
      <div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.8px;margin-bottom:5px">교재명 <span style="color:#ef4444">*</span></div>
      <input id="bl-modal-inp" class="bl-add-inp" placeholder="예: Happy 1 단어장" style="width:100%;box-sizing:border-box"
        onkeydown="if(event.key==='Enter')BooklibApp._modalAddBook()">`;
    sheet.appendChild(nameWrap);

    // ── 파일 드롭존 (접기/펼치기) ──
    const dropWrap = document.createElement('div');
    dropWrap.style.cssText = 'margin-bottom:16px';
    dropWrap.innerHTML = `
      <div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.8px;margin-bottom:5px">교재 파일 가져오기 <span style="font-size:9px;font-weight:400">(선택)</span></div>
      <div class="bl-drop-zone" id="bl-modal-csv" style="padding:10px 16px;font-size:11px">📂 챕터 파일 드롭 · 또는 탭 <span style="opacity:.7">(.csv/.txt/.xlsx)</span></div>`;
    sheet.appendChild(dropWrap);

    // ── 반 배정 ──
    const clsSection = document.createElement('div');
    clsSection.style.cssText = 'margin-bottom:16px';
    clsSection.innerHTML = `<div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.8px;margin-bottom:7px">반 배정 <span style="font-size:9px;font-weight:400">(선택)</span></div>
      <div id="bl-reg-cls-chips" style="display:flex;flex-wrap:wrap;gap:6px">
        ${allCls.length
          ? allCls.map(c=>`<button class="bl-cls-chip" data-cid="${c.id}"
              style="padding:5px 14px;border-radius:18px;font-size:12px;font-weight:700;border:1.5px solid var(--bdr2);background:var(--card2);color:var(--tx2);cursor:pointer;font-family:var(--font);transition:all .15s"
              onclick="BooklibApp._regToggleCls(this,'${c.id}')">${_e(c.name)}</button>`).join('')
          : '<span style="font-size:12px;color:var(--tx3)">운용 중인 반 없음</span>'}
      </div>`;
    sheet.appendChild(clsSection);

    // ── 학생 배정 ──
    const stuSection = document.createElement('div');
    stuSection.style.cssText = 'margin-bottom:16px';
    stuSection.innerHTML = `
      <div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.8px;margin-bottom:8px">학생 배정 <span style="font-size:9px;font-weight:400">(선택)</span></div>

      <!-- 반 선택 일괄 추가 -->
      <div style="background:var(--surf2);border:1px solid var(--bdr);border-radius:11px;padding:11px 12px;margin-bottom:8px">
        <div style="font-size:11px;font-weight:800;color:var(--tx2);margin-bottom:7px">🏫 반 선택 → 학생 일괄 추가</div>
        <div style="display:flex;gap:7px;margin-bottom:8px">
          <select id="bl-reg-cls-bulk" style="flex:1;padding:7px 10px;border-radius:9px;border:1.5px solid var(--bdr2);background:var(--card);font-size:13px;font-family:var(--font);outline:none">
            <option value="">— 반 선택 —</option>
            ${allCls.map(c=>`<option value="${c.id}">${_e(c.name)}</option>`).join('')}
          </select>
        </div>
        <div id="bl-reg-bulk-list" style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:4px"></div>
      </div>

      <!-- 이름 검색 -->
      <div style="background:var(--surf2);border:1px solid var(--bdr);border-radius:11px;padding:11px 12px;margin-bottom:8px">
        <div style="font-size:11px;font-weight:800;color:var(--tx2);margin-bottom:7px">🔍 이름으로 검색</div>
        <div style="position:relative">
          <input id="bl-reg-stu-search" type="text" placeholder="이름 입력..."
            style="width:100%;box-sizing:border-box;padding:7px 10px;border-radius:9px;border:1.5px solid var(--bdr2);background:var(--card);font-size:13px;font-family:var(--font);outline:none">
          <div id="bl-reg-stu-results" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:99;background:var(--card);border:1.5px solid var(--a40);border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.12);max-height:160px;overflow-y:auto;margin-top:2px"></div>
        </div>
      </div>

      <!-- 배정된 학생 칩 -->
      <div id="bl-reg-stu-chips" style="display:flex;flex-wrap:wrap;gap:6px;min-height:28px;padding:6px 2px"></div>`;
    sheet.appendChild(stuSection);

    // ── 버튼 ──
    const acts = document.createElement('div');
    acts.style.cssText = 'display:flex;gap:8px;margin-top:4px;flex-shrink:0';
    acts.innerHTML = `
      <button onclick="document.getElementById('bl-reg-modal')?.remove()"
        style="flex:1;padding:12px;border:none;border-radius:10px;background:var(--surf2);color:var(--tx3);font-size:13px;font-family:var(--font);cursor:pointer">취소</button>
      <button onclick="BooklibApp._modalAddBook()"
        style="flex:2;padding:12px;border:none;border-radius:10px;background:var(--a);color:#fff;font-size:13px;font-weight:800;font-family:var(--font);cursor:pointer;box-shadow:0 3px 10px var(--a40)">📖 등록 완료</button>`;
    sheet.appendChild(acts);

    modal.appendChild(sheet);
    modal.addEventListener('click', e => { if(e.target===modal) modal.remove(); });
    document.body.appendChild(modal);
    setTimeout(()=>document.getElementById('bl-modal-inp')?.focus(), 80);

    // ── 파일 드롭존 ──
    _bindDrop('bl-modal-csv', null, async(file)=>{ modal.remove(); await _importBookFile(file); });

    // ── 반 선택 일괄 목록 렌더 ──
    const bulkSel = document.getElementById('bl-reg-cls-bulk');
    bulkSel.onchange = () => {
      const cid = bulkSel.value;
      const listWrap = document.getElementById('bl-reg-bulk-list');
      if (!listWrap) return;
      if (!cid) { listWrap.innerHTML = ''; return; }
      const cls = allCls.find(c=>c.id===cid);
      if (!cls) return;
      const stus = allStus.filter(s=>s.classCode===cls.name);
      if (!stus.length) { listWrap.innerHTML = '<div style="font-size:12px;color:var(--tx3);padding:4px 2px">이 반에 학생이 없습니다</div>'; return; }

      listWrap.innerHTML = '';
      // 전체 선택 행
      const hdr = document.createElement('div');
      hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 6px;margin-bottom:4px;border-bottom:1px solid var(--bdr)';
      hdr.innerHTML = `<span style="font-size:11px;font-weight:700;color:var(--tx3)">${_e(cls.name)}반 학생 ${stus.length}명</span>
        <div style="display:flex;gap:6px">
          <button style="font-size:10px;padding:2px 8px;border-radius:5px;background:var(--card);border:1px solid var(--bdr2);cursor:pointer;font-family:var(--font)" id="bl-reg-bulk-all">전체 선택</button>
          <button style="font-size:10px;padding:2px 8px;border-radius:5px;background:var(--a);color:#fff;border:none;cursor:pointer;font-family:var(--font);font-weight:700" id="bl-reg-bulk-apply">✅ 일괄 추가</button>
        </div>`;
      listWrap.appendChild(hdr);

      stus.forEach(s => {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:7px;cursor:pointer;transition:background .1s';
        row.onmouseenter = ()=>row.style.background='var(--card2)';
        row.onmouseleave = ()=>row.style.background='';
        const ck = document.createElement('input');
        ck.type='checkbox'; ck.dataset.sid=s.id; ck.style.cssText='accent-color:var(--a);width:15px;height:15px;flex-shrink:0';
        ck.checked = true; // 기본 전체 선택
        const nm = document.createElement('span');
        nm.style.cssText='font-size:13px;color:var(--tx)';
        nm.textContent = s.name;
        row.appendChild(ck); row.appendChild(nm);
        listWrap.appendChild(row);
      });

      // 전체 선택 버튼
      document.getElementById('bl-reg-bulk-all').onclick = () => {
        const cks = [...listWrap.querySelectorAll('input[type=checkbox]')];
        const allOn = cks.every(c=>c.checked);
        cks.forEach(c=>c.checked=!allOn);
        document.getElementById('bl-reg-bulk-all').textContent = allOn?'전체 선택':'전체 해제';
      };

      // 일괄 추가 버튼
      document.getElementById('bl-reg-bulk-apply').onclick = () => {
        const checked = [...listWrap.querySelectorAll('input[type=checkbox]:checked')];
        checked.forEach(ck => {
          const s = allStus.find(x=>x.id===ck.dataset.sid);
          if (s) modal._selStus.set(s.id, s);
        });
        _renderRegStuChips(modal, allStus);
        bulkSel.value = '';
        listWrap.innerHTML = '';
        _toast(`✅ ${checked.length}명 추가됨`,'success');
      };
    };

    // ── 이름 검색 ──
    const searchInp = document.getElementById('bl-reg-stu-search');
    const searchRes = document.getElementById('bl-reg-stu-results');
    searchInp.addEventListener('input', () => {
      const q = searchInp.value.trim();
      searchRes.innerHTML = '';
      if (!q) { searchRes.style.display='none'; return; }
      function matchChosung(name,q){
        if(name.toLowerCase().includes(q.toLowerCase())) return true;
        let ci=0;
        for(const ch of name){
          const code=ch.charCodeAt(0);
          if(code>=0xAC00&&code<=0xD7A3){const cho=CHOSUNGS[Math.floor((code-0xAC00)/588)];if(ci<q.length&&q[ci]===cho)ci++;}
        }
        return ci===q.length&&q.split('').every(c=>CHOSUNGS.includes(c));
      }
      const found = allStus.filter(s=>!modal._selStus.has(s.id)&&matchChosung(s.name||'',q)).slice(0,10);
      if (!found.length) { searchRes.innerHTML='<div style="padding:8px 12px;font-size:12px;color:var(--tx3)">결과 없음</div>'; searchRes.style.display='block'; return; }
      found.forEach(s => {
        const row = document.createElement('div');
        row.style.cssText = 'padding:8px 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--bdr);cursor:pointer;background:var(--card)';
        row.onmouseenter=()=>row.style.background='var(--a10)';
        row.onmouseleave=()=>row.style.background='var(--card)';
        const cls2 = allCls.find(c=>c.name===s.classCode);
        row.innerHTML = `<span style="font-size:13px;font-weight:700">${_e(s.name)}${cls2?`<span style="font-size:10px;color:var(--tx3);margin-left:5px">${_e(cls2.name)}반</span>`:''}</span>
          <button style="font-size:11px;padding:3px 10px;border-radius:6px;background:var(--a);color:#fff;border:none;cursor:pointer;font-weight:700">추가</button>`;
        row.querySelector('button').onclick = () => {
          modal._selStus.set(s.id, s);
          _renderRegStuChips(modal, allStus);
          searchInp.value=''; searchRes.style.display='none';
        };
        searchRes.appendChild(row);
      });
      searchRes.style.display='block';
    });
    // 외부 클릭 시 검색 결과 닫기
    document.addEventListener('click', function _closeRes(e){
      if(!searchRes.contains(e.target)&&e.target!==searchInp){ searchRes.style.display='none'; document.removeEventListener('click',_closeRes); }
    });
  }

  // 등록 모달 - 배정된 학생 칩 렌더
  function _renderRegStuChips(modal, allStus) {
    const wrap = document.getElementById('bl-reg-stu-chips');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!modal._selStus.size) {
      wrap.innerHTML = '<span style="font-size:11px;color:var(--tx3)">배정된 학생 없음</span>';
      return;
    }
    modal._selStus.forEach((s, sid) => {
      const chip = document.createElement('div');
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:var(--a10);border:1px solid var(--a40);border-radius:12px;font-size:12px;font-weight:600;color:var(--a)';
      chip.innerHTML = `<span>${_e(s.name)}</span><button style="background:none;border:none;cursor:pointer;color:var(--a);font-size:13px;padding:0 2px;line-height:1" data-sid="${sid}">✕</button>`;
      chip.querySelector('button').onclick = () => { modal._selStus.delete(sid); _renderRegStuChips(modal, allStus); };
      wrap.appendChild(chip);
    });
  }

  // 등록 모달 - 반 칩 토글
  function _regToggleCls(btn, clsId) {
    const modal = document.getElementById('bl-reg-modal');
    if (!modal) return;
    const isOn = modal._selCls.has(clsId);
    if (isOn) { modal._selCls.delete(clsId); btn.style.background='var(--card2)'; btn.style.color='var(--tx2)'; btn.style.borderColor='var(--bdr2)'; }
    else { modal._selCls.add(clsId); btn.style.background='var(--a20)'; btn.style.color='var(--a)'; btn.style.borderColor='var(--a)'; }
  }

  async function _modalAddBook() {
    const inp = document.getElementById('bl-modal-inp');
    if (!inp || !inp.value.trim()) { inp?.focus(); _toast('⚠️ 교재명을 입력해주세요','error'); return; }
    const name = inp.value.trim();
    if (BookLibDB.getBooks().some(b=>b.name===name)) { _toast('⚠️ 이미 존재하는 교재명입니다','error'); return; }

    const modal = document.getElementById('bl-reg-modal');
    const selCls  = modal?._selCls  || new Set();
    const selStus = modal?._selStus || new Map();

    const book = await BookLibDB.addBook(name);
    // 반 배정
    for (const cid of selCls) await BookLibDB.assignBook(book.id, cid).catch(console.warn);
    // 학생 배정
    if (selStus.size) await BookLibDB.batchAddStudents(book.id, [...selStus.keys()]).catch(console.warn);

    document.getElementById('bl-reg-modal')?.remove();
    _renderLibrary();
    _toast(`📖 "${name}" 등록 완료`,'success');
  }

  async function addBook(nameArg){
    // ★ nameArg 우선, 없으면 bl-book-inp 값
    const inp=document.getElementById('bl-book-inp');
    const name=(typeof nameArg==='string'&&nameArg.trim() ? nameArg.trim() : (inp?.value||'').trim());
    if(!name){_toast('⚠️ 교재명을 입력해주세요');return;}
    if(BookLibDB.getBooks().some(b=>b.name===name)){_toast('⚠️ 이미 존재하는 교재명입니다');return;}
    await BookLibDB.addBook(name);
    if(inp)inp.value='';
    _renderLibrary();
    _toast(`📖 "${name}" 등록 완료`,'success');
    setTimeout(()=>document.getElementById('bl-book-inp')?.focus(),60);
  }
  // ★ 다중 선택 완결 처리
  let _multiSelectMode = false;

  // ★ 교재 등록 영역 토글
  function _toggleRegArea() {
    const area = document.getElementById('bl-reg-area');
    if (!area) {
      // bl-reg-area가 없으면 팝업 모달로 교재 등록
      _openRegModal(); return;
    }
    const isVisible = area.style.display !== 'none';
    area.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
      // 열릴 때 입력창에 포커스
      setTimeout(() => document.getElementById('bl-book-inp')?.focus(), 80);
    }
  }
  function _toggleMultiSelect(){
    _multiSelectMode = !_multiSelectMode;
    _applyMultiSelectUI();
  }
  function _toggleArchivedSection(header) {
    const list = document.getElementById('bl-arc-list');
    const arrow = document.getElementById('bl-arc-arrow');
    if (!list) return;
    const isOpen = list.style.display !== 'none';
    list.style.display = isOpen ? 'none' : 'flex';
    if (arrow) arrow.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0deg)';
  }

  function _cancelMultiSelect(){
    _multiSelectMode = false;
    _applyMultiSelectUI();
  }
  function _applyMultiSelectUI(){
    const bar = document.getElementById('bl-multi-bar');
    const btn = document.getElementById('bl-multi-arc-btn');
    const cks = document.querySelectorAll('.bl-multi-ck');
    const moveBtns = document.querySelectorAll('.bl-move-btns');
    if(_multiSelectMode){
      if(bar){bar.style.display='flex';}
      if(btn){btn.style.background='var(--a10)';btn.style.color='var(--a)';btn.style.borderColor='var(--a40)';}
      cks.forEach(ck=>{ck.style.display='block';ck.checked=false;});
      moveBtns.forEach(mb=>{mb.style.display='flex';});
    } else {
      if(bar){bar.style.display='none';}
      if(btn){btn.style.background='var(--card2)';btn.style.color='var(--tx3)';btn.style.borderColor='var(--bdr2)';}
      cks.forEach(ck=>{ck.style.display='none';ck.checked=false;});
      moveBtns.forEach(mb=>{mb.style.display='none';});
    }
    _onMultiCkChange();
  }
  function _onMultiCkChange(){
    const checked = [...document.querySelectorAll('.bl-multi-ck:checked')];
    const cnt = document.getElementById('bl-multi-cnt');
    if(cnt) cnt.textContent = checked.length + '개 선택';
    // 체크된 항목 있을 때만 복사/완결 버튼 표시
    const hasChecked = checked.length > 0;
    const copyBtn = document.getElementById('bl-multi-copy-btn');
    const archBtn = document.getElementById('bl-multi-arch-btn');
    if(copyBtn) copyBtn.style.display = hasChecked ? '' : 'none';
    if(archBtn) archBtn.style.display = hasChecked ? '' : 'none';
    const delBtn = document.getElementById('bl-multi-del-btn');
    if(delBtn) delBtn.style.display = hasChecked ? '' : 'none';
  }
  // ★ 개별 교재 위/아래 이동 (DOM 직접 조작 + 비동기 DB 저장)
  function _moveBook(id, dir) {
    const container = document.getElementById('bl-active-books');
    if (!container) return;
    const cards = [...container.querySelectorAll('[data-bid]')];
    const idx = cards.findIndex(c => c.dataset.bid === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= cards.length) return;
    // DOM 즉시 이동 (빠른 피드백)
    if (dir === -1) {
      container.insertBefore(cards[idx], cards[target]);
    } else {
      container.insertBefore(cards[target], cards[idx]);
    }
    // DB 비동기 저장 (UI 블로킹 없음)
    const newOrder = [...container.querySelectorAll('[data-bid]')].map(c => c.dataset.bid);
    BookLibDB.reorderBooks(newOrder).catch(console.warn);
  }

  // ★ 선택된 교재 위로 이동
    async function _multiMoveUp(){ /* 제거됨 */ }

    async function _multiMoveDown(){ /* 제거됨 */ }

  async function _multiDelete() {
    const ids = [...document.querySelectorAll('.bl-multi-ck:checked')].map(c=>c.dataset.bid);
    if (!ids.length) return;
    const names = ids.map(id=>BookLibDB.getBookById(id)?.name||'').filter(Boolean);
    const msg = [
      `선택한 ${ids.length}개 교재를 삭제하시겠습니까?`,
      '',
      '📚 삭제 대상:',
      ...names.map(n=>'  · '+n),
      '',
      '⚠️ 아래 데이터가 모두 삭제됩니다:',
      '  · 챕터 목록',
      '  · 학습 현황 (학생별 수행/미수행)',
      '  · 플로팅 메모',
      '  · 성적 평가 및 리포트 데이터',
      '',
      '정말 삭제하시겠습니까? 되돌릴 수 없습니다.'
    ].join('\n');
    if (!confirm(msg)) return;
    for (const id of ids) { await BookLibDB.deleteBook(id); }
    _multiSelectMode = false;
    _renderLibrary();
    _toast(`🗑 ${ids.length}개 교재 삭제 완료`,'success');
  }

  async function _multiCopy() {
    const ids = [...document.querySelectorAll('.bl-multi-ck:checked')].map(c=>c.dataset.bid);
    if (!ids.length) { _toast('⚠️ 복사할 교재를 선택해주세요'); return; }
    let count = 0;
    for (const id of ids) {
      const src = BookLibDB.getBookById(id); if (!src) continue;
      const copy = await BookLibDB.copyBook(id);
      if (copy) {
        // 복사본 이름에 "_복사본" 추가
        await BookLibDB.updateBook(copy.id, { name: src.name + '_복사본' });
        count++;
      }
    }
    _renderLibrary();
    _toast(`📋 ${count}개 교재 복사 완료`, 'success');
  }

  async function _multiArchive(){
    const ids = [...document.querySelectorAll('.bl-multi-ck:checked')].map(ck=>ck.dataset.bid);
    if(!ids.length){_toast('⚠️ 완결 처리할 교재를 선택해주세요');return;}
    const names = ids.map(id=>BookLibDB.getBookById(id)?.name||'').filter(Boolean);
    if(!confirm(`선택한 ${ids.length}개 교재를 완결 처리하시겠습니까?\n${names.join(', ')}`))return;
    for(const id of ids){ await BookLibDB.archiveBook(id); }
    _multiSelectMode = false;
    _renderLibrary();
    _toast(`📦 ${ids.length}개 교재 완결 처리 완료`,'success');
  }

  async function _archiveBook(id){
    const b=BookLibDB.getBookById(id); if(!b)return;
    if(!confirm(`"${b.name}"을 완결 처리하시겠습니까?\n완결된 교재는 하단 목록으로 이동됩니다.`))return;
    await BookLibDB.archiveBook(id); _renderLibrary(); _toast(`📦 "${b.name}" 완결 처리`,'success');
  }
  async function _unarchiveBook(id){
    const b=BookLibDB.getBookById(id); if(!b) return;
    // ★ 동일 이름 교재가 활성 목록에 이미 있는지 확인
    const dupName = BookLibDB.getBooks().find(bk=>!bk.archived && bk.name===b.name);
    let finalName = b.name;
    if(dupName){
      const ans = confirm('"'+b.name+'" 과 동일한 교재명이 이미 있습니다.\n다른 이름으로 복원하시겠습니까?');
      if(!ans) return;
      const newName = window.prompt('복원할 새 교재명을 입력하세요:', b.name+'_복원');
      if(!newName || !newName.trim()) return;
      finalName = newName.trim();
    } else {
      if(!confirm('"'+b.name+'" 을 교재 목록으로 복원하시겠습니까?')) return;
    }
    await BookLibDB.unarchiveBook(id);
    if(finalName !== b.name) await BookLibDB.updateBook(id, {name: finalName});
    _renderLibrary();
    document.getElementById('bl-arc-popup')?.remove();
    _toast('↩️ "'+finalName+'" 복원됐습니다', 'success');
  }
  async function _copyBook(id){
    const src = BookLibDB.getBookById(id); if(!src) return;
    const copy = await BookLibDB.copyBook(id);
    if(copy){
      // ★ 복사본을 맨 위(sortOrder=0)로 이동
      const books = BookLibDB.getBooks();
      const minOrder = Math.min(...books.map(b=>b.sortOrder??0));
      await BookLibDB.updateBook(copy.id, {
        name: src.name + '_복사본',
        sortOrder: minOrder - 1
      });
      _renderLibrary();
      _toast(`📋 "${copy.name}_복사본" 목록 상단에 추가됨`,'success');
    } else {
      _toast('⚠️ 복사 실패','error');
    }
  }

  function _renameBook(id, currentName) {
    const newName = window.prompt('교재명을 변경하세요:', currentName);
    if (!newName || newName.trim() === currentName) return;
    BookLibDB.updateBook(id, { name: newName.trim() }).then(()=>{
      _renderLibrary();
      _toast(`✅ 교재명 변경: ${newName.trim()}`, 'success');
    }).catch(()=>_toast('⚠️ 변경 실패','error'));
  }

  async function deleteBook(id){
    const book=BookLibDB.getBookById(id);if(!book)return;
    const _delMsg=['"'+book.name+'" 교재를 삭제하시겠습니까?','','⚠️ 아래 데이터가 모두 삭제됩니다:','  · 챕터 목록','  · 학습 현황 (학생별 수행/미수행)','  · 플로팅 메모','  · 성적 평가 및 리포트 데이터','','정말 삭제하시겠습니까? 되돌릴 수 없습니다.'].join('\n');
    if(!confirm(_delMsg))return;
    await BookLibDB.deleteBook(id);_renderLibrary();_toast(`🗑 "${book.name}" 삭제`);
  }

  /* ══ EDITOR MODAL (챕터 + 성적 설정 통합) ══ */
  function _openEvalTab(bookId){
    _editorTab='eval';
    openEditor(bookId);
  }

  function openEditor(bookId, tab){
    _st.editBookId=bookId;
    // ★ tab 인자로 탭 명시적 지정, 없으면 현재 _editorTab 유지
    if (tab) _editorTab = tab;
    /* 편집 시작 시 현재 config 로드 */
    if(typeof GradeDB!=='undefined'){
      _st.editConfig=JSON.parse(JSON.stringify(GradeDB.getReportConfig(bookId)));
    } else {
      _st.editConfig={ word:{totalQ:0}, reading:{enabled:false,totalQ:0,reviews:[
        {name:'Review 1',enabled:true},{name:'Review 2',enabled:true},
        {name:'Review 3',enabled:false},{name:'Review 4',enabled:false}
      ]}};
    }
    const sh=document.getElementById('bl-editor-sh');if(sh)_drawEditor(sh);
    document.getElementById('bl-editor-ov')?.classList.remove('hidden');
    history.pushState({pg:'booklib',modal:'editor'},'');
  }

  // ★ 에디터 현재 탭 상태
  let _editorTab = 'chapters'; // 'chapters' | 'eval'

  function _drawEditor(sh){
    const book=BookLibDB.getBookById(_st.editBookId);
    if(!book){sh.innerHTML='<div style="padding:24px;text-align:center;color:var(--tx3)">교재를 찾을 수 없습니다</div>';return;}
    const isAdmin=typeof DB!=='undefined'&&DB.isAdmin();
    const chs=book.chapters||[];
    const allCls=typeof DB!=='undefined'?DB.getActiveClasses():[];
    const cfg=_st.editConfig;
    // 학생 목록 (DB.getStudents 지원 시)
    // ★ 전체 반 학생 목록 (StudentDB 우선, 초성 검색 지원)
    const allStus=typeof StudentDB!=='undefined'
      ?StudentDB.getAll().filter(s=>s.status!=='퇴원')
      :(typeof StudentDB!=='undefined'?StudentDB.getFiltered({}):[]); 

    sh.innerHTML=`
      <div class="sh-handle"></div>
      <div class="sh-title" style="display:flex;align-items:center;gap:8px">
        📖 <span id="bl-ed-book-name-lbl" ondblclick="BooklibApp._inlineRenameInPopup('${book.id}',this)" title="더블클릭하여 교재명 변경" style="cursor:pointer;border-bottom:2px dashed var(--a40);padding-bottom:1px">${_e(book.name)}</span>
        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:var(--a10);color:var(--a);border:1px solid var(--a30)">${_editorTab==='eval'?'평가 설정':'챕터 관리'}</span>
      </div>

      <div class="bl-editor-body" id="bl-editor-body">
        ${_editorTab==='chapters'?_edChaptersHTML(book,chs,allCls,allStus,isAdmin):_edEvalHTML(cfg,isAdmin)}
      </div>
      <div class="sh-acts" style="flex-wrap:nowrap;gap:8px">
        ${isAdmin?`<button id="bl-ed-del-btn"
          style="flex:1;padding:13px;background:rgba(239,68,68,.1);border:1.5px solid rgba(239,68,68,.3);border-radius:var(--rs);color:#dc2626;font-size:var(--fz);font-weight:700;cursor:pointer;font-family:var(--font)">🗑 교재 삭제</button>`:''}
        ${isAdmin?`<button class="btn-ok" onclick="BooklibApp.saveEditor()">저장</button>`:''}
        <button class="btn-x" onclick="BooklibApp.closeEditor()">취소</button>
      </div>`;
    if(isAdmin&&_editorTab==='chapters')_bindDrop('bl-ch-drop',book.id,_importChFile);
    // 학생 검색 이벤트
    if(isAdmin&&_editorTab==='chapters'){
      const sinp=document.getElementById('bl-stu-search');
      if(sinp)sinp.addEventListener('input',()=>_renderStuSearchResults(book.id,sinp.value,allStus));
    }
    // ★ 교재 삭제 버튼 - addEventListener 직접 등록
    if(isAdmin){
      const _dBtn=document.getElementById('bl-ed-del-btn');
      if(_dBtn){
        const _bid=book.id, _bname=book.name;
        const _doDelete=async(e)=>{
          e.preventDefault(); e.stopPropagation();
          const msg=[
            '"'+_bname+'" 교재를 삭제하시겠습니까?','',
            '⚠️ 아래 데이터가 모두 삭제됩니다:',
            '  · 챕터 목록','  · 학습 현황 (학생별 수행/미수행)',
            '  · 플로팅 메모','  · 성적 평가 및 리포트 데이터','',
            '정말 삭제하시겠습니까? 되돌릴 수 없습니다.'
          ].join('\n');
          if(!confirm(msg)) return;
          await BookLibDB.deleteBook(_bid);
          BooklibApp.closeEditor();
          _renderLibrary();
          _toast('🗑 "'+_bname+'" 삭제 완료','success');
        };
        _dBtn.addEventListener('click',_doDelete);
        _dBtn.addEventListener('touchstart',e=>{e.preventDefault();_doDelete(e);},{passive:false});
      }
    }
  }

  function _switchEdTab(tab){_editorTab=tab;const sh=document.getElementById('bl-editor-sh');if(sh)_drawEditor(sh);}

  // ─── 탭1: 챕터 관리 HTML ───
  function _edChaptersHTML(book,chs,allCls,allStus,isAdmin){
    const assignedStus=(book.studentIds||[]).map(id=>allStus.find(s=>s.id===id)).filter(Boolean);
    return `
      ${isAdmin?`
        <span class="bl-lbl">챕터 추가</span>
        <div class="bl-drop-zone" id="bl-ch-drop">📂 파일 드롭 또는 탭 (.xlsx/.csv/.txt)</div>
        <textarea class="bl-ch-ta" id="bl-ch-ta" placeholder="챕터를 한 줄에 하나씩&#10;[단어] Unit 1&#10;[문장] Unit 1"></textarea>
        <div class="bl-ch-hint">💡 [단어]/[문장] 포함 시 세부미수행 옵션 자동 활성화</div>
        <div class="bl-paste-row">
          <button class="bl-paste-btn replace" onclick="BooklibApp._pasteChapters('replace')">🔄 교체</button>
          <button class="bl-paste-btn append"  onclick="BooklibApp._pasteChapters('append')">➕ 추가</button>
        </div>

        <span class="bl-lbl">반 배정</span>
        <div class="bl-cls-chips">${allCls.length?allCls.map(cls=>`<div class="bl-cls-chip ${BookLibDB.isBookInClass(book.id,cls.id)?'on':''}" onclick="BooklibApp._toggleAssign('${book.id}','${cls.id}',this)">${_e(cls.name)}</div>`).join(''):'<span style="font-size:12px;color:var(--tx3)">운용 중인 반 없음</span>'}</div>

        <!-- ★ 학생 직접 배정 -->
        <span class="bl-lbl">학생 배정</span>

        <!-- 반별 일괄 추가 -->
        <div style="background:var(--surf2);border:1px solid var(--bdr);border-radius:11px;padding:10px 12px;margin-bottom:8px">
          <div style="font-size:11px;font-weight:800;color:var(--tx2);margin-bottom:7px">🏫 반 선택 → 일괄 추가</div>
          <select id="bl-cls-bulk-sel" style="width:100%;padding:7px 10px;border-radius:9px;border:1.5px solid var(--bdr2);background:var(--card);font-size:13px;font-family:var(--font);outline:none;margin-bottom:8px"
            onchange="BooklibApp._renderClsBulkList('${book.id}',this.value)">
            <option value="">— 반 선택 —</option>
            ${allCls.map(c=>`<option value="${c.id}">${_e(c.name)}</option>`).join('')}
          </select>
          <div id="bl-cls-bulk-list" style="max-height:200px;overflow-y:auto;display:flex;flex-direction:column;gap:4px"></div>
        </div>

        <!-- 이름 검색 -->
        <div style="background:var(--surf2);border:1px solid var(--bdr);border-radius:11px;padding:10px 12px;margin-bottom:8px">
          <div style="font-size:11px;font-weight:800;color:var(--tx2);margin-bottom:7px">🔍 이름으로 검색</div>
          <div style="position:relative">
            <input class="f-inp" id="bl-stu-search" placeholder="학생 이름 검색 (초성 지원)..." style="width:100%;padding:7px 10px;font-size:13px">
            <div id="bl-stu-results" class="bl-stu-dropdown"></div>
          </div>
        </div>

        <!-- 배정된 학생 칩 -->
        ${assignedStus.length?`<div id="bl-stu-chips-wrap" class="bl-stu-chips">${assignedStus.map(s=>`<div class="bl-stu-chip"><span>${_e(s.name)}</span><button onclick="BooklibApp._removeStudent('${book.id}','${s.id}')">✕</button></div>`).join('')}</div>`:'<div id="bl-stu-chips-wrap" class="bl-stu-chips" style="min-height:36px"><span style="font-size:11px;color:var(--tx3)">배정된 학생 없음</span></div>'}
      `:''}

      <!-- 챕터 목록 -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0 6px">
        <span class="bl-lbl" style="padding:0">챕터 (${chs.length}개)</span>
        ${isAdmin&&chs.length?`<button style="font-size:11px;color:var(--tx3);background:none;border:none;cursor:pointer;font-family:var(--font)" onclick="BooklibApp._clearChs()">전체 삭제</button>`:''}
      </div>
      <div class="bl-ch-list-wrap">${chs.length?chs.map((ch,i)=>{
        const type=BookLibDB.detectChapterType(ch.title);const icon=type==='word'?'🔤':type==='sentence'?'📝':'';
        return`<div class="bl-ch-item"><span class="bl-ch-ns">${i+1}</span><span class="bl-ch-ts-label">${icon} ${_e(ch.title)}</span>${isAdmin?`<button class="bl-ch-del-btn" onclick="BooklibApp._delCh('${book.id}','${ch.id}')">✕</button>`:''}</div>`;
      }).join(''):'<div style="font-size:12px;color:var(--tx3);padding:10px 6px">챕터 없음</div>'}</div>
    `;
  }

  // ─── 탭2: 평가 설정 HTML ───
  function _edEvalHTML(cfg,isAdmin){
    if(!isAdmin)return '<div style="padding:24px;text-align:center;color:var(--tx3)">관리자만 설정 가능합니다</div>';
    return `
      <span class="bl-lbl">📝 성적 리포트 설정</span>
      <div class="bl-grade-sec">
        <div style="font-size:12px;font-weight:800;color:var(--tx2);margin-bottom:6px">🔤 단어 테스트</div>
        <div class="bl-grade-row">
          <span class="bl-grade-lbl">총 테스트(문제) 수</span>
          <input class="bl-grade-inp" type="number" min="0" step="1" id="bl-cfg-wq" placeholder="0" value="${cfg.word?.totalQ||''}">
        </div>
      </div>
      <div class="bl-grade-sec">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:12px;font-weight:800;color:var(--tx2)">📖 리딩 테스트</span>
          <label style="display:flex;align-items:center;gap:5px;cursor:pointer;margin-left:auto">
            <input type="checkbox" id="bl-cfg-rd-on" ${cfg.reading?.enabled?'checked':''}
                   style="width:16px;height:16px;accent-color:var(--a);cursor:pointer"
                   onchange="BooklibApp._onRdToggle(this.checked)">
            <span style="font-size:12px;font-weight:700;color:var(--tx2)">리딩 포함</span>
          </label>
        </div>
        <div id="bl-cfg-rd-body" style="${cfg.reading?.enabled?'':'display:none'}">
          <div class="bl-grade-row">
            <span class="bl-grade-lbl">총 문제 수</span>
            <input class="bl-grade-inp" type="number" min="0" step="1" id="bl-cfg-rdq" placeholder="0" value="${cfg.reading?.totalQ||''}">
          </div>
          <div style="margin-top:10px">
            <div style="font-size:11px;font-weight:800;color:var(--tx3);letter-spacing:.5px;margin-bottom:6px">Review 컬럼 (☑ 체크된 항목만 성적관리에 표시)</div>
            <div id="bl-rv-list">${_rvListHTML(cfg.reading?.reviews||[])}</div>
            <button class="bl-rv-add-btn" onclick="BooklibApp._addReview()">＋ Review 컬럼 추가</button>
          </div>
        </div>
      </div>
    `;
  }

  // ─── 챕터 에디터: 반별 학생 일괄 배정 목록 렌더 ───
  function _renderClsBulkList(bookId, clsId) {
    const container = document.getElementById('bl-cls-bulk-list');
    if (!container) return;
    if (!clsId) { container.innerHTML = ''; return; }

    const allCls  = typeof DB!=='undefined' ? DB.getActiveClasses() : [];
    const allStus = typeof StudentDB!=='undefined' ? StudentDB.getAll().filter(s=>s.status!=='퇴원') : [];
    const cls = allCls.find(c=>c.id===clsId);
    if (!cls) return;

    const book = BookLibDB.getBookById(bookId);
    const assigned = new Set(book?.studentIds||[]);
    const stus = allStus.filter(s=>s.classCode===cls.name);
    const unassigned = stus.filter(s=>!assigned.has(s.id));
    const alreadyAll = stus.length && !unassigned.length;

    container.innerHTML = '';

    if (!stus.length) {
      container.innerHTML = '<div style="font-size:12px;color:var(--tx3);padding:4px 2px">이 반에 등록된 학생이 없습니다</div>';
      return;
    }
    if (alreadyAll) {
      container.innerHTML = '<div style="font-size:12px;color:var(--green);padding:4px 2px">✅ 이 반 학생이 모두 배정되어 있습니다</div>';
      return;
    }

    // 헤더 행 (전체선택 + 적용 버튼)
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 4px 6px;border-bottom:1px solid var(--bdr);margin-bottom:4px';
    hdr.innerHTML = `
      <span style="font-size:11px;font-weight:700;color:var(--tx3)">
        ${_e(cls.name)}반 · 미배정 ${unassigned.length}명 (${stus.length}명 중)
      </span>
      <div style="display:flex;gap:6px">
        <button id="bl-bulk-all-btn" style="font-size:10px;padding:2px 9px;border-radius:6px;background:var(--card);border:1px solid var(--bdr2);cursor:pointer;font-family:var(--font)">전체 선택</button>
        <button id="bl-bulk-apply-btn" style="font-size:11px;padding:3px 11px;border-radius:7px;background:var(--a);color:#fff;border:none;cursor:pointer;font-weight:700;font-family:var(--font)">✅ 배정</button>
      </div>`;
    container.appendChild(hdr);

    // 이미 배정된 학생 표시
    const alreadyAssigned = stus.filter(s=>assigned.has(s.id));
    if (alreadyAssigned.length) {
      const alreadyRow = document.createElement('div');
      alreadyRow.style.cssText = 'font-size:10px;color:var(--tx3);padding:3px 4px 5px;';
      alreadyRow.textContent = `이미 배정됨: ${alreadyAssigned.map(s=>s.name).join(', ')}`;
      container.appendChild(alreadyRow);
    }

    // 미배정 학생 체크박스
    unassigned.forEach(s => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:7px;cursor:pointer;transition:background .1s';
      row.onmouseenter=()=>row.style.background='var(--card2)';
      row.onmouseleave=()=>row.style.background='';
      const ck = document.createElement('input');
      ck.type='checkbox'; ck.dataset.sid=s.id; ck.checked=true;
      ck.style.cssText='accent-color:var(--a);width:14px;height:14px;flex-shrink:0;cursor:pointer';
      const nm = document.createElement('span');
      nm.style.cssText='font-size:13px;color:var(--tx)';
      nm.textContent = s.name;
      row.appendChild(ck); row.appendChild(nm);
      container.appendChild(row);
    });

    // 전체 선택 버튼
    const allBtn = document.getElementById('bl-bulk-all-btn');
    allBtn.onclick = () => {
      const cks = [...container.querySelectorAll('input[type=checkbox]')];
      const allOn = cks.every(c=>c.checked);
      cks.forEach(c=>c.checked=!allOn);
      allBtn.textContent = allOn ? '전체 선택' : '전체 해제';
    };

    // 배정 적용 버튼
    const applyBtn = document.getElementById('bl-bulk-apply-btn');
    applyBtn.onclick = async () => {
      const sids = [...container.querySelectorAll('input[type=checkbox]:checked')].map(c=>c.dataset.sid);
      if (!sids.length) { _toast('⚠️ 배정할 학생을 선택하세요','error'); return; }
      applyBtn.disabled=true; applyBtn.textContent='⏳...';
      await BookLibDB.batchAddStudents(bookId, sids).catch(e=>console.error(e));
      // chips 갱신 (wrap이 없으면 생성)
      let wrap = document.getElementById('bl-stu-chips-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id='bl-stu-chips-wrap'; wrap.className='bl-stu-chips';
        container.closest('.bl-editor-body')?.querySelector('#bl-cls-bulk-list')?.closest('div[style]')?.after(wrap);
      }
      _refreshStudentChips(bookId);
      // 드롭다운 초기화
      const sel = document.getElementById('bl-cls-bulk-sel');
      if (sel) { sel.value=''; }
      container.innerHTML='';
      _toast(`✅ ${sids.length}명 일괄 배정 완료`,'success');
    };
  }

  // ─── 학생 검색 드롭다운 ───
    function _renderStuSearchResults(bookId,query,allStus){
    const res=document.getElementById('bl-stu-results'); if(!res)return;
    const q=query.trim();
    if(q.length<1){res.innerHTML='';res.style.display='none';return;}
    const CHOSUNGS='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
    function matchChosung(name,q){
      if(name.toLowerCase().includes(q.toLowerCase())) return true;
      let ci=0;
      for(const ch of name){
        const code=ch.charCodeAt(0);
        if(code>=0xAC00&&code<=0xD7A3){
          const cho=CHOSUNGS[Math.floor((code-0xAC00)/588)];
          if(ci<q.length&&q[ci]===cho)ci++;
        }
      }
      return ci===q.length&&q.split('').every(c=>CHOSUNGS.includes(c));
    }
    const book=BookLibDB.getBookById(bookId);
    const assigned=new Set(book?.studentIds||[]);
    const allCls=typeof DB!=='undefined'?DB.getActiveClasses():[];
    const found=allStus.filter(s=>!assigned.has(s.id)&&matchChosung(s.name||'',q)).slice(0,15);

    res.innerHTML='';
    if(!found.length){
      const noResult=document.createElement('div');
      noResult.style.cssText='padding:8px 12px;font-size:12px;color:var(--tx3)';
      noResult.textContent='결과 없음';
      res.appendChild(noResult);
      res.style.display='block';
      return;
    }

    // ★ 체크박스 목록
    found.forEach(s=>{
      const cls=allCls.find(c=>c.name===s.classCode);
      const row=document.createElement('label');
      row.style.cssText='padding:8px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--bdr);background:var(--card);cursor:pointer';
      row.onmouseenter=()=>row.style.background='var(--a10)';
      row.onmouseleave=()=>row.style.background='var(--card)';

      const ck=document.createElement('input');
      ck.type='checkbox'; ck.dataset.sid=s.id; ck.dataset.sname=s.name;
      ck.style.cssText='width:15px;height:15px;accent-color:var(--a);flex-shrink:0;cursor:pointer';
      ck.addEventListener('mousedown',e=>e.stopPropagation());
      ck.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});

      const nameSpan=document.createElement('span');
      nameSpan.style.cssText='font-size:13px;font-weight:700;color:var(--tx)';
      nameSpan.textContent=s.name||'';

      if(cls){
        const clsBadge=document.createElement('span');
        clsBadge.style.cssText='font-size:10px;color:var(--tx3);background:var(--surf2);padding:1px 5px;border-radius:5px;margin-left:2px';
        clsBadge.textContent=cls.name+'반';
        nameSpan.appendChild(clsBadge);
      }
      row.appendChild(ck);
      row.appendChild(nameSpan);
      res.appendChild(row);
    });

    // ★ 하단 적용 버튼
    const applyRow=document.createElement('div');
    applyRow.style.cssText='padding:8px 12px;background:var(--surf2);border-top:2px solid var(--a40);display:flex;gap:8px;align-items:center';

    const selectAll=document.createElement('button');
    selectAll.textContent='전체선택';
    selectAll.style.cssText='font-size:11px;padding:3px 8px;border-radius:5px;background:var(--card);border:1px solid var(--bdr2);cursor:pointer';
    selectAll.addEventListener('mousedown',e=>{e.preventDefault();res.querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=true);});
    selectAll.addEventListener('touchstart',e=>{e.preventDefault();res.querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=true);},{passive:false});

    const applyBtn=document.createElement('button');
    applyBtn.textContent='✅ 배정 적용';
    applyBtn.style.cssText='font-size:12px;padding:5px 14px;border-radius:7px;background:var(--a);color:#fff;border:none;font-weight:700;cursor:pointer;margin-left:auto';

    const doApply=async(e)=>{
      e.preventDefault(); e.stopPropagation();
      const checked=[...res.querySelectorAll('input[type=checkbox]:checked')];
      if(!checked.length){_toast('배정할 학생을 선택하세요','error');return;}
      applyBtn.disabled=true; applyBtn.textContent='⏳ 적용 중...';
      const sids=checked.map(ck=>ck.dataset.sid);
      await BookLibDB.batchAddStudents(bookId,sids).catch(e=>console.error('배정오류',e));
      _refreshStudentChips(bookId);
      res.style.display='none';
      const inp=document.getElementById('bl-stu-search');
      if(inp) inp.value='';
      _toast(`✅ ${sids.length}명 배정 완료`,'success');
    };
    applyBtn.addEventListener('mousedown',doApply);
    applyBtn.addEventListener('touchstart',doApply,{passive:false});

    applyRow.appendChild(selectAll);
    applyRow.appendChild(applyBtn);
    res.appendChild(applyRow);
    res.style.display='block';
  }

  function _rvListHTML(reviews){
    return reviews.map((rv,i)=>`
      <div class="bl-rv-row" id="bl-rv-${i}">
        <input type="checkbox" class="bl-rv-check" ${rv.enabled?'checked':''}
               onchange="BooklibApp._onRvCheck(${i},this.checked)">
        <input class="bl-rv-name-inp" type="text" value="${_e(rv.name)}"
               placeholder="Review ${i+1}"
               oninput="BooklibApp._onRvName(${i},this.value)">
        <button class="bl-rv-del" onclick="BooklibApp._delReview(${i})" title="삭제">✕</button>
      </div>`).join('');
  }

  function _onRdToggle(checked){
    const body=document.getElementById('bl-cfg-rd-body');
    if(body)body.style.display=checked?'':'none';
    _st.editConfig.reading.enabled=checked;
  }
  function _onRvCheck(idx,checked){
    if(_st.editConfig.reading.reviews[idx])_st.editConfig.reading.reviews[idx].enabled=checked;
  }
  function _onRvName(idx,val){
    if(_st.editConfig.reading.reviews[idx])_st.editConfig.reading.reviews[idx].name=val||`Review ${idx+1}`;
  }
  function _addReview(){
    const n=_st.editConfig.reading.reviews.length+1;
    _st.editConfig.reading.reviews.push({name:`Review ${n}`,enabled:true});
    const el=document.getElementById('bl-rv-list');
    if(el)el.innerHTML=_rvListHTML(_st.editConfig.reading.reviews);
  }
  function _delReview(idx){
    if(_st.editConfig.reading.reviews.length<=1){_toast('⚠️ 최소 1개 이상이어야 합니다');return;}
    _st.editConfig.reading.reviews.splice(idx,1);
    // idx 재정렬
    const el=document.getElementById('bl-rv-list');
    if(el)el.innerHTML=_rvListHTML(_st.editConfig.reading.reviews);
  }

  /* 저장 (챕터 + 성적 설정 동시 저장) */
  async function saveEditor(){
    const bookId=_st.editBookId;
    // ★ 교재명 변경 저장
    const _nameInp = document.getElementById('ed-book-name-inp');
    if(_nameInp){
      const _newName = _nameInp.value.trim();
      const _curBook = BookLibDB.getBookById(bookId);
      if(_newName && _curBook && _newName !== _curBook.name){
        await BookLibDB.updateBook(bookId, {name: _newName});
      }
    }
    // 성적 설정 수집
    const wq  = Number(document.getElementById('bl-cfg-wq')?.value||0);
    const rdOn= document.getElementById('bl-cfg-rd-on')?.checked||false;
    const rdQ = Number(document.getElementById('bl-cfg-rdq')?.value||0);
    // review 최신값 반영
    _st.editConfig.word.totalQ=wq;
    _st.editConfig.reading.enabled=rdOn;
    _st.editConfig.reading.totalQ=rdQ;
    // 저장
    if(typeof GradeDB!=='undefined') await GradeDB.saveReportConfig(bookId,_st.editConfig);
    closeEditor();
    _toast('✅ 저장 완료','success');
    // ★ 성적관리가 같은 교재를 보고 있으면 자동 새로고침
    if(typeof GradeApp!=='undefined'&&GradeApp._refreshAfterEvalUpdate){
      GradeApp._refreshAfterEvalUpdate(bookId);
    }
  }

  async function _importChFile(file,bookId){try{const lines=await _fileToLines(file);if(!lines.length){_toast('⚠️ 유효한 챕터가 없습니다');return;}await BookLibDB.setChapters(bookId,lines,'replace');_toast(`✅ ${lines.length}개 챕터 등록`,'success');_drawEditor(document.getElementById('bl-editor-sh'));}catch(e){_toast('❌ '+e.message);}}
  function _pasteChapters(mode){const ta=document.getElementById('bl-ch-ta');const text=(ta?.value||'').trim();if(!text){_toast('⚠️ 챕터 목록을 입력해주세요');return;}const titles=text.split(/[\r\n]+/).map(l=>l.trim()).filter(Boolean);if(!titles.length){_toast('⚠️ 유효한 챕터가 없습니다');return;}BookLibDB.setChapters(_st.editBookId,titles,mode).then(()=>{if(ta)ta.value='';_toast(`✅ ${titles.length}개 ${mode==='append'?'추가':'교체'}`,'success');_drawEditor(document.getElementById('bl-editor-sh'));});}
  function _delCh(bid,chId){BookLibDB.deleteChapter(bid,chId).then(()=>_drawEditor(document.getElementById('bl-editor-sh')));}
  function _clearChs(){if(!confirm('챕터를 전체 삭제하시겠습니까?'))return;BookLibDB.updateBook(_st.editBookId,{chapters:[]}).then(()=>_drawEditor(document.getElementById('bl-editor-sh')));}
  async function _deleteBookFromPopup(bookId, bookName){
    const msg = [
      '"'+bookName+'" 교재를 삭제하시겠습니까?',
      '',
      '⚠️ 아래 데이터가 모두 삭제됩니다:',
      '  · 챕터 목록',
      '  · 학습 현황 (학생별 수행/미수행)',
      '  · 플로팅 메모',
      '  · 성적 평가 및 리포트 데이터 (*)',
      '',
      '(*) 성적 데이터는 성적 관리 탭에 저장된 데이터입니다.',
      '',
      '정말 삭제하시겠습니까? 되돌릴 수 없습니다.'
    ].join('\n');
    if(!confirm(msg)) return;
    await BookLibDB.deleteBook(bookId);
    BooklibApp.closeEditor();
    _renderLibrary();
    _toast('🗑 "'+bookName+'" 삭제 완료','success');
  }

  async function _toggleAssign(bookId,classId,el){const isOn=el.classList.contains('on');if(isOn)await BookLibDB.unassignBook(bookId,classId);else await BookLibDB.assignBook(bookId,classId);el.classList.toggle('on',!isOn);_toast(isOn?'반 배정 해제':'✅ 반 배정','success');}

  // ★ 학생 직접 배정
  async function _assignStudentBtn(bookId, studentId, btn){
    try{
      await BookLibDB.addStudentToBook(bookId, studentId);
      if(btn){btn.textContent='✅';btn.style.background='var(--green)';btn.disabled=true;}
      _refreshStudentChips(bookId);
      const res=document.getElementById('bl-stu-results');
      const inp=document.getElementById('bl-stu-search');
      if(res) res.style.display='none';
      if(inp) inp.value='';
      const stu=typeof StudentDB!=='undefined'?StudentDB.getAll().find(s=>s.id===studentId):null;
      _toast('✅ '+(stu?.name||'학생')+'님 배정 완료','success');
    }catch(e){_toast('❌ 배정 실패: '+e.message,'error');}
  }
  function _refreshStudentChips(bookId){
    const wrap=document.getElementById('bl-stu-chips-wrap'); if(!wrap) return;
    const book=BookLibDB.getBookById(bookId); if(!book) return;
    const allStus=typeof StudentDB!=='undefined'?StudentDB.getAll():[];
    const allCls=typeof DB!=='undefined'?DB.getActiveClasses():[];
    const assigned=(book.studentIds||[]).map(id=>allStus.find(s=>s.id===id)).filter(Boolean);
    if(!assigned.length){wrap.innerHTML='<span style="font-size:11px;color:var(--tx3)">배정된 학생 없음</span>';return;}
    wrap.innerHTML=assigned.map(s=>{
      const c=allCls.find(cl=>cl.name===s.classCode);
      const lbl=c?'('+c.name+'반)':'';
      return`<div class="bl-stu-chip"><span>${_e(s.name)+lbl}</span><button onclick="BooklibApp._removeStudent('${bookId}','${s.id}')" style="margin-left:4px;background:none;border:none;cursor:pointer;color:var(--tx3);font-size:13px">✕</button></div>`;
    }).join('');
  }
  async function _removeStudent(bookId, studentId){
    await BookLibDB.removeStudentFromBook(bookId, studentId);
    _refreshStudentChips(bookId);
    _toast('🗑 배정 해제','success');
  }
  function closeEditor(){document.getElementById('bl-editor-ov')?.classList.add('hidden');_st.editBookId=null;_st.editConfig=null;if(_st.subTab==='library')_renderLibrary();}

  /* ══ MATRIX TAB ══ */
  function _renderMatrixTab(){
    const cnt=document.getElementById('bl-cnt');if(!cnt)return;
    const allCls=typeof DB!=='undefined'?DB.getActiveClasses():[];
    // ★ 반 미선택 시: 반 미배정이거나 학생만 배정된 교재만 표시 (전체 교재 표시 버그 수정)
    let clsBks;
    if(_st.matrixClassId){
      clsBks=BookLibDB.getBooksForClass(_st.matrixClassId).filter(b=>!b.archived);
    } else {
      clsBks=BookLibDB.getBooks().filter(b=>{
        if(b.archived) return false;
        const noClass=!(b.classIds&&b.classIds.length>0);
        const hasStu=(b.studentIds&&b.studentIds.length>0)||(b.assignedStudents&&b.assignedStudents.length>0);
        return noClass&&hasStu; // ★ 반 미배정 + 학생 배정된 교재만
      });
    }
    cnt.innerHTML=`<div class="bl-msel-bar">
      <div class="bl-msel-item"><span class="bl-msel-lbl">📋 반</span>
        <select id="bl-csel" onchange="BooklibApp._onClsChange(this.value)">
          <option value="">— 반 선택 —</option>
          ${allCls.map(c=>`<option value="${c.id}" ${_st.matrixClassId===c.id?'selected':''}>${_e(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="bl-msel-item"><span class="bl-msel-lbl">📖 교재</span>
        <select id="bl-bsel" onchange="BooklibApp._onBkChange(this.value)">
          <option value="">— 교재 선택 —</option>
          ${clsBks.map(b=>`<option value="${b.id}" ${_st.matrixBookId===b.id?'selected':''}>${_e(b.name)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="bl-mbody" style="flex:1;overflow:hidden;display:flex;flex-direction:column;">${_matrixHTML()}</div>`;
  }

  function _fillBookSel(sel){
    let allBks;
    if(_st.matrixClassId){
      allBks=BookLibDB.getBooksForClass(_st.matrixClassId);
    } else {
      // ★ 반 미선택: 반 미배정(classIds 없음) 또는 학생만 배정된 교재
      const _all=BookLibDB.getBooks().filter(b=>!b.archived);
      allBks=_all.filter(b=>{
        const noClass=!(b.classIds&&b.classIds.length>0);
        const hasStu=(b.studentIds&&b.studentIds.length>0)||(b.assignedStudents&&b.assignedStudents.length>0);
        return noClass||hasStu;
      });
    }
    const bks=allBks.filter(b=>!b.archived); // ★ 완결 교재 제외
    sel.innerHTML=`<option value="">— 교재 선택 —</option>`+bks.map(b=>`<option value="${b.id}" ${_st.matrixBookId===b.id?'selected':''}>${_e(b.name)}</option>`).join('');
  }

  function _fmtStamp(raw){if(!raw)return'';const[dp='',tp='']=String(raw).split(' ');const[,mo='',d='']=dp.split('-');if(!mo||!d)return raw;const dow=DOW_KO[new Date(dp).getDay()]||'';return`${Number(mo)}/${Number(d)} (${dow}) ${tp.slice(0,5)}`;}

  function _matrixHTML(){
    if(!_st.matrixBookId)return`<div class="bl-mempty"><div class="bl-mempty-ico">📊</div>교재를 선택하면 학습 현황이 표시됩니다<br><small style="font-size:11px">챕터 셀 탭 → 진도 스탬프 · 학생 이름 탭 → 공유</small></div>`;
    const book=BookLibDB.getBookById(_st.matrixBookId);
    if(!book)return`<div class="bl-mempty"><div class="bl-mempty-ico">❌</div>교재를 찾을 수 없습니다</div>`;
    const chs=book.chapters||[];if(!chs.length)return`<div class="bl-mempty"><div class="bl-mempty-ico">📑</div>챕터가 없습니다<br><small>교재 관리 탭 → 챕터 추가</small></div>`;
    const cls=_st.matrixClassId?_getCls(_st.matrixClassId):null;
    if(_st.matrixClassId&&!cls)return`<div class="bl-mempty"><div class="bl-mempty-ico">❌</div>반 정보를 찾을 수 없습니다</div>`;
    const allStu=cls
      ?(typeof StudentDB!=='undefined'?StudentDB.getFiltered({classCode:cls.name,status:'재원'}):[])
      :((book.studentIds||[]).length&&typeof StudentDB!=='undefined'
        ?StudentDB.getAll().filter(s=>(book.studentIds||[]).includes(s.id)):[]);
    if(!allStu.length)return`<div class="bl-mempty"><div class="bl-mempty-ico">👨‍🎓</div>${cls?_e(cls.name)+'반 ':''}학생이 없습니다</div>`;
    const savedOrder=_loadColOrder(_st.matrixClassId,_st.matrixBookId);_st.colOrder=_buildColOrder(allStu,savedOrder);const students=_getOrderedStu(allStu);
    const lastStamp=_getLastStamp(chs,_stamps);const evalChs=lastStamp?chs.filter(ch=>ch.order<=lastStamp.order):chs;
    // ★ 미수행 = evalChs(타임스탬프 이내) 챕터 × 학생 조합 중 체크된 것만
    const evalChIds = new Set(evalChs.map(ch=>ch.id));
    const lastCh=lastStamp?chs.find(c=>c.id===lastStamp.chId):null;
    const stampNote=lastStamp?`📍 기준: ${_e(lastCh?.title||'')} (${_fmtStamp(_stamps[lastStamp.chId])})`:'📍 챕터 셀 탭 → 진도 스탬프 설정';

    // ★ 챕터명 기반 자동 너비 계산
    // 가장 긴 챕터명 글자 수 × 7px(한글 기준) + 여백 40px, min/max 제한
    let w;
    if (_st.chCollapsed) {
      w = 32;
    } else {
      const maxChLen = chs.reduce((max, ch) => Math.max(max, (ch.title||'').length), 0);
      const autoW = Math.max(MIN_CH_W, Math.min(MAX_CH_W, maxChLen * 7 + 52));
      // 사용자가 수동 조절한 경우(localStorage에 저장됨) vs 자동
      const savedW = parseInt(localStorage.getItem(LS_CH_W));
      // 학생이 1명일 때는 자동 너비 우선 적용, 여러 명이면 저장값 사용
      w = (students.length === 1 || !savedW || savedW === DEF_CH_W) ? autoW : _st.chColWidth;
      _st.chColWidth = w;
    }

    // ★ 후처리 필터 로드
    const _pf=_loadPf(_st.matrixClassId,_st.matrixBookId);
    const _pfActive=Object.keys(_pf).length>0;

    // 셀이 후처리로 시각적으로 수행 처리되는지 판단
    function _pfVisualUndone(stuName, raw){
      if(!raw) return false;
      const pfItems=_pf[stuName]||[];
      if(!pfItems.length) return true; // 필터 없으면 원본
      const parsed=BookLibDB._parseCheck(raw);
      if(!parsed.tasks.length) return true; // 세부항목 없으면 그대로
      const remaining=parsed.tasks.filter(t=>!pfItems.includes(t));
      return remaining.length>0; // 남은 항목 있으면 여전히 미수행
    }
    function _pfFilteredTasks(stuName, raw){
      if(!raw) return [];
      const pfItems=_pf[stuName]||[];
      const parsed=BookLibDB._parseCheck(raw);
      return pfItems.length ? parsed.tasks.filter(t=>!pfItems.includes(t)) : parsed.tasks;
    }

    // ★ 후처리 필터 적용 미수행 통계
    let undone=0;
    const doneByS={};
    students.forEach(s=>{
      let uc=0;
      evalChs.forEach(ch=>{
        const raw=_checks[`${s.id}__${ch.id}`];
        if(raw && _pfVisualUndone(s.name,raw)) uc++;
      });
      doneByS[s.id]=uc;
      undone+=uc;
    });
    // ★ 학생 수에 따른 열 너비: 1명이면 나머지 공간 전부, 여러 명이면 고정
    const total = students.length * evalChs.length;
    const pct = total ? Math.max(0, Math.round((total-undone)/total*100)) : 100;
    const pfCnt=Object.keys(_pf).length;
    const stuColStyle = students.length <= 3
      ? `style="--ch-w:${w}px;--stu-w:auto;table-layout:fixed;width:100%"`
      : `style="--ch-w:${w}px;--stu-w:${STU_W}px"`;
    const stuColW = students.length <= 3 ? '' : `width:${STU_W}px`;
    return`<div class="bl-mstats" id="bl-mstats">
      <div class="bl-mstat">⬜ 미수행 <span class="bl-mstat-v">${undone}</span></div>
      <div class="bl-mstat">✅ 수행률 <span class="bl-mstat-v">${pct}%</span></div>
      <div class="bl-pct-bar"><div class="bl-pct-fill" id="bl-pct-fill" style="width:${pct}%"></div></div>
      <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:11px;font-weight:700;color:var(--tx3);background:var(--surf2);border:1px solid var(--bdr2);border-radius:7px;padding:3px 8px;user-select:none"><input type="checkbox" id="bl-memo-ck" style="accent-color:var(--a)" onchange="BooklibApp._toggleMemo(this.checked)"> 📝 메모</label>
        <button class="bl-wbtn" title="글자 크기 줄이기" onclick="BooklibApp._mtblFontSize(-1)">A-</button>
        <button class="bl-wbtn" title="글자 크기 늘리기" onclick="BooklibApp._mtblFontSize(1)">A+</button>
        <button class="bl-report-btn" onclick="BooklibApp.openClassReport()">📋 전체 출력</button>
         <button class="bl-report-btn" onclick="BooklibApp.openBatchImport()" title="여러 xlsx 파일 일괄 반영" style="background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.4);color:#059669">📂 일괄 반영</button>
         <button class="bl-report-btn" onclick="BooklibApp.openExemptMgr()" title="반+교재별 예외 학생 관리" style="background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.4);color:#d97706">⚙️ 예외 설정</button>
         <button class="bl-report-btn" onclick="BooklibApp.openExemptList()" title="예외 학생 전체 목록" style="background:rgba(99,102,241,.1);border-color:rgba(99,102,241,.4);color:var(--a)">📋 예외 목록</button>
        <button id="bl-pf-btn" class="bl-report-btn" onclick="BooklibApp.openPostFilter()" title="xlsx 반영 후 시각적 미수행 면제 후처리"
          style="background:${pfCnt?'rgba(99,102,241,.2)':'rgba(99,102,241,.07)'};border-color:${pfCnt?'var(--a)':'rgba(99,102,241,.3)'};color:var(--a);font-weight:${pfCnt?'900':'700'}">🔍 후처리${pfCnt?` (${pfCnt}명)`:''}</button>
        <button class="bl-report-btn" style="background:rgba(5,150,105,.1);border-color:rgba(5,150,105,.3);color:var(--green)"
                onclick="document.getElementById('bl-csv-inp').click()" title="XLSX/CSV 파일로 학습현황 자동 반영">📊 XLSX</button>
        <input type="file" id="bl-csv-inp" accept=".xlsx,.xls,.csv" style="display:none"
               onchange="if(this.files[0]){BooklibApp.openCsvImportModal(this.files[0]);this.value=''}">
      </div>
    </div>
    <div style="font-size:10px;color:var(--tx3);padding:4px 12px;flex-shrink:0;background:var(--surf2);border-bottom:1px solid var(--bdr)">${stampNote}</div>
    <div class="bl-mwrap">
      <table class="bl-mtbl ${_st.chCollapsed?'ch-collapsed':''}" id="bl-mtbl" ${stuColStyle}>
        <colgroup><col style="width:${w}px">${students.map(()=>`<col ${stuColW?`style="${stuColW}"`:''}>`).join('')}</colgroup>
        <thead>
          <tr style="position:sticky;top:0;z-index:6;background:var(--surf)">
            <th class="bl-ch-hdr">
              ${!_st.chCollapsed?`<span style="font-size:9px;font-weight:800;color:var(--tx3)">챕터 / 학생</span>`:''}
              <button class="bl-collapse-btn" id="bl-collapse-btn" onclick="BooklibApp._toggleCollapse()">${_st.chCollapsed?'▶':'◀'}</button>
            </th>
            ${students.map((s,i)=>{const uc=doneByS[s.id];return`<th class="bl-shdr" draggable="true" data-idx="${i}" data-sid="${s.id}" onclick="BooklibApp.openShare('${s.id}','${_st.matrixClassId}','${_st.matrixBookId}')">
              <div class="bl-shdr-name">${_e(s.name)}${s.nickname?`<span style="font-size:9px;font-weight:600;color:var(--tx3);display:block">(${_e(s.nickname)})</span>`:''}</div>
              <div class="bl-shdr-cnt" style="color:${uc?'#ea580c':'var(--green)'}" id="shdr-cnt-${s.id}">${uc?uc+' 미수행':'완료✅'}</div>
              <div class="bl-shdr-act">${uc?'📤':''}</div>
            </th>`;}).join('')}
          </tr>
          <tr class="bl-batch-row" id="bl-batch-row">
            <td class="bl-batch-hdr">전체 토글 ↓</td>
            ${students.map(s=>`<td class="bl-batch-ck" onclick="BooklibApp._batchToggle('${_st.matrixClassId}','${_st.matrixBookId}','${s.id}')"><span style="font-size:12px;color:var(--tx3)">⇅</span></td>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${chs.map(ch=>{
            const isStamped=!!_stamps[ch.id],isLastStamp=lastStamp&&ch.id===lastStamp.chId;
            const isAfter=lastStamp&&ch.order>lastStamp.order,isInEval=!lastStamp||ch.order<=lastStamp.order;
            const rowCls=[isInEval?'in-eval':'',isAfter?'after-stamp':'',isLastStamp?'last-stamp':''].filter(Boolean).join(' ');
            const chType=BookLibDB.detectChapterType(ch.title);const typeIcon=chType==='word'?'🔤':chType==='sentence'?'📝':'';
            return`<tr class="bl-chrow ${rowCls}">
              <td class="bl-ch-cell ${isStamped?'stamped':''}" onclick="BooklibApp._toggleStamp('${ch.id}')">
                <div class="bl-ch-inner">
                  <div class="bl-ch-top"><span class="bl-ch-n">${ch.order+1}.</span>${!_st.chCollapsed?`<span class="bl-ch-t">${typeIcon} ${_e(ch.title)}</span>`:''}</div>
                  ${isStamped&&!_st.chCollapsed?`<div class="bl-ch-ts-row"><div class="bl-ch-ts"><span>📍</span><span class="bl-ch-ts-t">${_fmtStamp(_stamps[ch.id])}</span></div></div>`:''}
                </div>
              </td>
              ${students.map(s=>{
                const key=`${s.id}__${ch.id}`,raw=_checks[key],isUndone=!!raw;
                // ★ 후처리 필터 적용
                const visualUndone=isUndone&&_pfVisualUndone(s.name,raw);
                const filteredTasks=isUndone?_pfFilteredTasks(s.name,raw):[];
                const noClick=isAfter?'style="pointer-events:none"':'';
                const hasSubOpts=chType!=='none';
                return`<td class="bl-cc${visualUndone?' undone':''}" ${noClick}
                  onclick="BooklibApp._toggleCheck('${_st.matrixClassId}','${_st.matrixBookId}','${s.id}','${ch.id}','${chType}',this)">
                  <div class="bl-cc-inner">
                    <span class="bl-cm">${visualUndone?'✕':''}</span>
                    ${visualUndone&&filteredTasks.length?`<div class="bl-sub-badges">${filteredTasks.map(t=>`<span class="bl-sub-badge">${_e(t)}</span>`).join('')}</div>`:''}
                  </div>
                </td>`;
              }).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  function _onClsChange(clsId){
    // ★ 반 변경 시: 메모창 제거
    document.getElementById('bl-memo-pad')?.remove();
    _stopListeners();_st.matrixClassId=clsId||null;_st.matrixBookId=null;_checks={};_stamps={};
    // ★ 첫 번째 교재 자동 선택
    if(clsId){
      const books=BookLibDB.getBooksForClass(clsId).filter(b=>!b.archived);
      if(books.length) _st.matrixBookId=books[0].id;
    }
    _renderMatrixTab();
    if(_st.matrixBookId){
      const _cid2=_st.matrixClassId||'__noclass__';
      _checks=BookLibDB.getMatrixChecks(_cid2,_st.matrixBookId);
      _stamps=BookLibDB.getStamps(_cid2,_st.matrixBookId);
      _st.stopMatrix=BookLibDB.listenMatrix(_cid2,_st.matrixBookId,v=>{_checks=v;_refreshBody();});
      _st.stopStamps=BookLibDB.listenStamps(_cid2,_st.matrixBookId,v=>{_stamps=v;_refreshBody();});
      _refreshBody();
    }
  }
  function _onBkChange(bkId){
    // ★ 교재 변경 시: 메모창 제거 (체크 상태는 건드리지 않음 - 교재별 독립 유지)
    document.getElementById('bl-memo-pad')?.remove();
    _stopListeners();_st.matrixBookId=bkId||null;_checks={};_stamps={};
    if(_st.matrixBookId){
      const _cid=_st.matrixClassId||'__noclass__';
      _checks=BookLibDB.getMatrixChecks(_cid,_st.matrixBookId);
      _stamps=BookLibDB.getStamps(_cid,_st.matrixBookId);
      _st.stopMatrix=BookLibDB.listenMatrix(_cid,_st.matrixBookId,v=>{_checks=v;_refreshBody();});
      _st.stopStamps=BookLibDB.listenStamps(_cid,_st.matrixBookId,v=>{_stamps=v;_refreshBody();});
    }
    _refreshBody();
  }
  function _refreshBody(){
    const mb=document.getElementById('bl-mbody'); if(!mb)return;
    // ★ 스크롤 위치 보존: innerHTML 교체 전 현재 스크롤 저장
    const tbl=mb.querySelector('.bl-mtbl-wrap');
    const scrollTop=tbl?tbl.scrollTop:0;
    const scrollLeft=tbl?tbl.scrollLeft:0;
    mb.innerHTML=_matrixHTML();
    _setupDrag();_bindCsvDrop();
    // ★ 교재 목록 재필터링
    const _bsel2=document.getElementById('bl-bsel');
    if(_bsel2) _fillBookSel(_bsel2);
    // ★ 교재 목록 필터 재적용 (innerHTML 재생성 후)
    const _bsel=mb.querySelector('#bl-bsel')||document.getElementById('bl-bsel');
    if(_bsel) _fillBookSel(_bsel);
    // ★ 폰트 크기 복원 (localStorage에 저장된 값)
    requestAnimationFrame(()=>{
      const _fs=parseFloat(localStorage.getItem('bl_mtbl_fontsize'));
      if(_fs&&_fs!==12){
        const _tbl=document.getElementById('bl-mtbl');
        if(_tbl) _tbl.style.fontSize=_fs+'px';
        document.querySelectorAll('#bl-mtbl th,#bl-mtbl td,.bl-ch-hdr,.bl-shdr,.bl-shdr-name,.bl-shdr-cnt,.bl-batch-row,.bl-chdr,.bl-ch-t,.bl-ch-n').forEach(el=>el.style.fontSize=_fs+'px');
      }
      // ★ 메모 상태 복원 - Firebase에서 직접 읽기
      if(typeof BooklibApp!=='undefined'&&BooklibApp._restoreMemoState){
        BooklibApp._restoreMemoState();
      }
      const _ck=document.getElementById('bl-memo-ck');
      if(_ck&&_st.matrixClassId&&_st.matrixBookId){
        const _ckKey='bl_memo_ck_'+_st.matrixClassId+'_'+_st.matrixBookId;
        const _wasCk=localStorage.getItem(_ckKey)==='1';
        _ck.checked=_wasCk;
        if(_wasCk) BooklibApp._toggleMemo&&BooklibApp._toggleMemo(true);
        else{ const _p=document.getElementById('bl-memo-pad'); if(_p) _p.style.display='none'; }
      }
    });
    // ★ 교체 후 동일 위치 복원 (rAF 2회로 렌더링 완료 후 복원)
    const newTbl=mb.querySelector('.bl-mtbl-wrap');
    if(newTbl){
      requestAnimationFrame(()=>{
        requestAnimationFrame(()=>{
          newTbl.scrollTop=scrollTop;
          newTbl.scrollLeft=scrollLeft;
        });
      });
    }
  }

  async function _toggleStamp(chId){
    const cid=_st.matrixClassId,bid=_st.matrixBookId; if(!cid||!bid)return;
    if(_stamps[chId]){
      /* ③ 스탬프 해제 → stampInfo 함께 삭제 */
      delete _stamps[chId];
      await BookLibDB.removeStamp(cid,bid,chId);
      if(BookLibDB.removeStampInfo) await BookLibDB.removeStampInfo(cid,bid,chId);
      _toast('📍 스탬프 해제');
    } else {
      const now=new Date();
      const ts=`${now.toISOString().slice(0,10)} ${now.toTimeString().slice(0,5)}`;
      _stamps[chId]=ts;
      await BookLibDB.setStamp(cid,bid,chId,ts);
      /* ② 스탬프 생성 당시 미수행 통계 수집 → DB 저장 */
      if(BookLibDB.setStampInfo){
        try{
          const book=BookLibDB.getBookById(bid);
          const chs=book?.chapters||[];
          const stampOrder=chs.find(c=>c.id===chId)?.order??0;
          const evalChs=chs.filter(c=>c.order<=stampOrder);
          const students=_getStudents();
          const undoneStudents=students.map(s=>{
            const count=evalChs.filter(ch=>_checks[`${s.id}__${ch.id}`]).length;
            return count>0?{name:s.name,count}:null;
          }).filter(Boolean);
          await BookLibDB.setStampInfo(cid,bid,chId,{
            ts, undoneCount:undoneStudents.length,
            totalStudents:students.length, evalChsCount:evalChs.length,
            undoneStudents,
          });
        }catch(e){console.warn('[stampInfo]',e);}
      }
      _toast(`📍 ${_fmtStamp(ts)}`,'success');
    }
    _refreshBody();
  }

  async function _toggleCheck(classId,bookId,studentId,chapterId,chType,cell){
    const wasUndone=cell.classList.contains('undone'),nowUndone=!wasUndone;
    cell.classList.toggle('undone',nowUndone);
    const mark=cell.querySelector('.bl-cm');if(mark)mark.textContent=nowUndone?'✕':'';
    await BookLibDB.setCheck(classId,bookId,studentId,chapterId,nowUndone,[]);
    if(!nowUndone){const bads=cell.querySelector('.bl-sub-badges');if(bads)bads.remove();}
    _refreshStatsBar();_refreshStuHdr(studentId,classId,bookId);
    if(nowUndone&&chType!=='none')_showSubPopup(cell,classId,bookId,studentId,chapterId,chType);
  }

  let _activePopup=null;
  function _showSubPopup(cell,classId,bookId,studentId,chapterId,chType){
    _closeSubPopup();
    const opts=BookLibDB.SUBTASKS[chType]||[];const existing=BookLibDB.getSubTasks(classId,bookId,studentId,chapterId);
    const popup=document.createElement('div');popup.className='bl-sub-popup';
    popup.innerHTML=`<div class="bl-sub-popup-title">미수행 항목 선택 (선택사항)</div>
      <div class="bl-sub-opts">${opts.map(o=>`<div class="bl-sub-opt ${existing.includes(o)?'on':''}" data-opt="${_e(o)}">${_e(o)}</div>`).join('')}</div>
      <div class="bl-sub-popup-acts">
        <button class="bl-sub-save" onclick="BooklibApp._saveSubTasks('${classId}','${bookId}','${studentId}','${chapterId}')">저장</button>
        <button class="bl-sub-close" onclick="BooklibApp._closeSubPopup()">닫기</button>
      </div>`;
    const rect=cell.getBoundingClientRect();
    popup.style.left=Math.min(rect.left+4,window.innerWidth-160)+'px';
    popup.style.top=(rect.bottom+4+180>window.innerHeight?rect.top-190:rect.bottom+4)+'px';
    document.body.appendChild(popup);_activePopup=popup;
    popup.querySelectorAll('.bl-sub-opt').forEach(el=>el.addEventListener('click',()=>el.classList.toggle('on')));
    setTimeout(()=>document.addEventListener('click',_outsidePopup,{once:true,capture:true}),50);
  }
  function _outsidePopup(e){if(_activePopup&&!_activePopup.contains(e.target))_closeSubPopup();}
  function _closeSubPopup(){if(_activePopup){_activePopup.remove();_activePopup=null;}document.removeEventListener('click',_outsidePopup,true);}
  async function _saveSubTasks(classId,bookId,studentId,chapterId){
    const tasks=[];_activePopup?.querySelectorAll('.bl-sub-opt.on').forEach(el=>tasks.push(el.dataset.opt));
    await BookLibDB.setSubTasks(classId,bookId,studentId,chapterId,tasks);_closeSubPopup();
    const cell=document.querySelector(`.bl-cc[onclick*="${studentId}"][onclick*="${chapterId}"]`);
    if(cell&&tasks.length){let bads=cell.querySelector('.bl-sub-badges');if(!bads){bads=document.createElement('div');bads.className='bl-sub-badges';cell.querySelector('.bl-cc-inner')?.appendChild(bads);}bads.innerHTML=tasks.map(t=>`<span class="bl-sub-badge">${_e(t)}</span>`).join('');}
    else if(cell)cell.querySelector('.bl-sub-badges')?.remove();
    _toast(tasks.length?`✅ 미수행: ${tasks.join(', ')}`:'저장 완료','success');
  }

  async function _batchToggle(classId,bookId,studentId){
    const book=BookLibDB.getBookById(bookId);if(!book)return;const chs=book.chapters||[];
    const lastStamp=_getLastStamp(chs,_stamps);const evalChs=lastStamp?chs.filter(ch=>ch.order<=lastStamp.order):chs;
    if(!evalChs.length){_toast('⚠️ 평가 범위 내 챕터가 없습니다');return;}
    const allUndone=evalChs.every(ch=>_checks[`${studentId}__${ch.id}`]);
    for(const ch of evalChs)await BookLibDB.setCheck(classId,bookId,studentId,ch.id,!allUndone,[]);
    _checks=BookLibDB.getMatrixChecks(classId,bookId);_refreshBody();
    _toast(allUndone?'✅ 전체 수행으로':'⬜ 전체 미수행으로','success');
  }

  function _refreshStatsBar(){
    const bar=document.getElementById('bl-mstats');if(!bar||!_st.matrixBookId)return;
    const book=BookLibDB.getBookById(_st.matrixBookId);if(!book)return;
    const chs=book.chapters||[];
    const cls=_getCls(_st.matrixClassId);
    // ★ 반 미배정 교재: cls null 허용, 학생은 book.studentIds 기반
    const sts=cls
      ?(typeof StudentDB!=='undefined'?StudentDB.getFiltered({classCode:cls.name,status:'재원'}):[])
      :((book.studentIds||[]).length&&typeof StudentDB!=='undefined'
          ?StudentDB.getAll().filter(s=>(book.studentIds||[]).includes(s.id)):[]);
    const lastStamp=_getLastStamp(chs,_stamps);const evalChs=lastStamp?chs.filter(ch=>ch.order<=lastStamp.order):chs;
    const pf=_loadPf(_st.matrixClassId,_st.matrixBookId);
    let undone=0;
    sts.forEach(s=>{
      const pfItems=pf[s.name]||[];
      evalChs.forEach(ch=>{
        const raw=_checks[`${s.id}__${ch.id}`];
        if(!raw) return;
        if(pfItems.length){
          const parsed=BookLibDB._parseCheck(raw);
          if(parsed.tasks.length){const rem=parsed.tasks.filter(t=>!pfItems.includes(t));if(rem.length)undone++;}
          else undone++;
        } else undone++;
      });
    });
    const total=sts.length*evalChs.length;const pct=total?Math.max(0,Math.round((total-undone)/total*100)):100;
    const nodes=bar.querySelectorAll('.bl-mstat-v');if(nodes[0])nodes[0].textContent=undone;if(nodes[1])nodes[1].textContent=pct+'%';
    const fill=document.getElementById('bl-pct-fill');if(fill)fill.style.width=pct+'%';
  }
  function _refreshStuHdr(sid,cid,bid){
    const th=document.querySelector(`.bl-shdr[data-sid="${sid}"]`);if(!th)return;
    const book=BookLibDB.getBookById(bid);if(!book)return;
    const chs=book.chapters||[];
    // ★ cls null 허용
    const lastStamp=_getLastStamp(chs,_stamps);const evalChs=lastStamp?chs.filter(ch=>ch.order<=lastStamp.order):chs;
    // ★ 후처리 필터 적용 - 학생 이름 필요
    const pf=_loadPf(cid,bid);
    const stu=typeof StudentDB!=='undefined'?StudentDB.getAll().find(s=>s.id===sid):null;
    const pfItems=(stu&&pf[stu.name])||[];
    let uc=0;
    evalChs.forEach(ch=>{
      const raw=_checks[`${sid}__${ch.id}`];
      if(!raw) return;
      if(pfItems.length){
        const parsed=BookLibDB._parseCheck(raw);
        if(parsed.tasks.length){const rem=parsed.tasks.filter(t=>!pfItems.includes(t));if(rem.length)uc++;}
        else uc++;
      } else uc++;
    });
    const cntEl=document.getElementById(`shdr-cnt-${sid}`),actEl=th.querySelector('.bl-shdr-act');
    if(cntEl){cntEl.textContent=uc?uc+' 미수행':'완료✅';cntEl.style.color=uc?'#ea580c':'var(--green)';}
    if(actEl)actEl.textContent=uc?'📤':'';
  }

  function _chWider(){if(_st.chCollapsed){_toggleCollapse();return;}_st.chColWidth=Math.min(MAX_CH_W,_st.chColWidth+20);localStorage.setItem(LS_CH_W,_st.chColWidth);const tbl=document.getElementById('bl-mtbl');if(tbl&&!_st.chCollapsed)tbl.style.setProperty('--ch-w',_st.chColWidth+'px');_updWLbl();}
  function _mtblFontSize(delta){
    const tbl=document.getElementById('bl-mtbl'); if(!tbl) return;
    const LS_FONT='bl_mtbl_fontsize';
    const cur=parseFloat(localStorage.getItem(LS_FONT))||12;
    const ns=Math.min(18,Math.max(9,cur+delta));
    localStorage.setItem(LS_FONT, ns); // ★ 교재 변경해도 유지
    tbl.style.fontSize=ns+'px';
    document.querySelectorAll('#bl-mtbl th,#bl-mtbl td,.bl-ch-hdr,.bl-shdr,.bl-shdr-name,.bl-shdr-cnt,.bl-batch-row,.bl-chdr,.bl-ch-t,.bl-ch-n').forEach(el=>{el.style.fontSize=ns+'px';});
  }
  function _applyFontSize(){
    // ★ 교재/반 변경 후 저장된 폰트 크기 재적용
    const ns=parseFloat(localStorage.getItem('bl_mtbl_fontsize'));
    if(!ns||ns===12) return;
    const tbl=document.getElementById('bl-mtbl'); if(!tbl) return;
    tbl.style.fontSize=ns+'px';
    document.querySelectorAll('#bl-mtbl th,#bl-mtbl td,.bl-ch-hdr,.bl-shdr,.bl-shdr-name,.bl-shdr-cnt,.bl-batch-row,.bl-chdr,.bl-ch-t,.bl-ch-n').forEach(el=>{el.style.fontSize=ns+'px';});
  }
  function _toggleMemo(show){
    let pad=document.getElementById('bl-memo-pad');
    const clsId=_st.matrixClassId, bkId=_st.matrixBookId;
    if(show){
      if(!pad){
        pad=document.createElement('div'); pad.id='bl-memo-pad';
        pad.style.cssText='position:fixed;right:16px;bottom:100px;width:300px;border-radius:14px;background:var(--card);border:1.5px solid var(--a40);box-shadow:0 8px 30px rgba(0,0,0,.15);z-index:200;overflow:hidden';
        const cls=(_getCls(clsId)||{}).name||'';
        const bkName=(BookLibDB.getBookById(bkId)||{}).name||'';
        const hdrDiv=document.createElement('div');
        hdrDiv.id='bl-memo-hdr';
        hdrDiv.style.cssText='background:var(--a);color:#fff;padding:8px 12px;font-size:12px;font-weight:800;cursor:move;display:flex;justify-content:space-between;align-items:center';
        hdrDiv.innerHTML='<span>📝 메모 — '+_e(cls)+'반 · '+_e(bkName)+'</span>';
        const xBtn=document.createElement('button');
        xBtn.textContent='✕'; xBtn.style.cssText='background:none;border:none;color:#fff;cursor:pointer;font-size:14px';
        xBtn.onclick=()=>{
          const ck=document.getElementById('bl-memo-ck');
          if(ck) ck.checked=false;
          // ★ 체크 해제 → Firebase 저장
          const txt=document.getElementById('bl-memo-txt')?.value||'';
          BooklibApp._saveMemo(txt,false);
          pad.style.display='none';
        };
        hdrDiv.appendChild(xBtn);
        // 수정 날짜시간 표시
        const dtDiv=document.createElement('div');
        dtDiv.id='bl-memo-dt';
        dtDiv.style.cssText='font-size:10px;color:var(--tx3);padding:4px 12px;border-bottom:1px solid var(--bdr);background:var(--surf2)';
        dtDiv.textContent='저장된 메모 없음';
        const ta=document.createElement('textarea'); ta.id='bl-memo-txt';
        ta.style.cssText='width:100%;height:160px;padding:10px;border:none;outline:none;resize:vertical;font-size:12px;font-family:var(--font);background:var(--card);color:var(--tx);box-sizing:border-box';
        ta.placeholder='반·교재별 메모를 입력하세요...';
        ta.oninput=()=>BooklibApp._saveMemo(ta.value);
        pad.appendChild(hdrDiv); pad.appendChild(dtDiv); pad.appendChild(ta);
        document.body.appendChild(pad);
        // DB에서 메모 로드
        (async()=>{
          let data=null;
          if(typeof BookLibDB!=='undefined'&&BookLibDB.loadMemo){
            data=await BookLibDB.loadMemo(clsId,bkId);
          }
          if(!data){
            const local=localStorage.getItem('bl_memo_'+clsId+'_'+bkId);
            if(local) data={text:local,updatedAt:null};
          }
          if(data){
            ta.value=data.text||'';
            if(data.updatedAt){
              const d=new Date(data.updatedAt);
              dtDiv.textContent='수정: '+d.toLocaleString('ko-KR');
            }
          }
        })();
        let ox=0,oy=0,mx=0,my=0;
        hdrDiv.onmousedown=e=>{e.preventDefault();mx=e.clientX;my=e.clientY;
          document.onmousemove=e2=>{ox=mx-e2.clientX;oy=my-e2.clientY;mx=e2.clientX;my=e2.clientY;
            pad.style.top=(pad.offsetTop-oy)+'px';pad.style.left=(pad.offsetLeft-ox)+'px';pad.style.right='auto';pad.style.bottom='auto';};
          document.onmouseup=()=>{document.onmousemove=null;document.onmouseup=null;};};
      } else pad.style.display='block';
    } else { if(pad) pad.style.display='none'; }
    // ★ 체크 ON/OFF 상태를 Firebase에 저장 (텍스트는 입력 시 저장)
    const _memoTxt=document.getElementById('bl-memo-txt')?.value||'';
    if(typeof BookLibDB!=='undefined'&&BookLibDB.saveMemo){
      // 메모창 닫을 때만 (show=false) checked 저장 → 열기 시에는 덮어쓰지 않음
      if(!show){
        BookLibDB.saveMemo(clsId, bkId, {
          text: _memoTxt,
          checked: false,
          updatedAt: new Date().toISOString()
        }).catch(()=>{});
      }
      // show=true 시에는 checked:true를 별도로 저장 (텍스트 덮어쓰기 방지)
      if(show && !document.getElementById('bl-memo-pad')?._dataLoaded){
        BookLibDB.loadMemo(clsId,bkId).then(data=>{
          const curTxt=data?.text||'';
          BookLibDB.saveMemo(clsId, bkId, {
            text: curTxt,
            checked: true,
            updatedAt: new Date().toISOString()
          }).catch(()=>{});
        }).catch(()=>{});
      }
    }
  }
  function _saveMemo(val){
    const clsId=_st.matrixClassId, bkId=_st.matrixBookId;
    if(!clsId||!bkId) return;
    const now=new Date().toISOString();
    const ck=document.getElementById('bl-memo-ck');
    const checked=ck?ck.checked:false;
    const data={text:val, checked:checked, updatedAt:now};
    // localStorage 즉시 저장
    localStorage.setItem('bl_memo_'+clsId+'_'+bkId, val);
    localStorage.setItem('bl_memo_ck_'+clsId+'_'+bkId, checked?'1':'0');
    // ★ DB 비동기 저장 (text + checked + updatedAt)
    if(typeof BookLibDB!=='undefined'&&BookLibDB.saveMemo){
      BookLibDB.saveMemo(clsId, bkId, data).catch(()=>{});
    }
    // 날짜시간 업데이트
    const dtDiv=document.getElementById('bl-memo-dt');
    if(dtDiv) dtDiv.textContent='수정: '+new Date(now).toLocaleString('ko-KR');
  }
  async function _restoreMemoState(){
    const ck=document.getElementById('bl-memo-ck');
    if(!ck||!_st.matrixBookId) return;
    const clsId=_st.matrixClassId, bkId=_st.matrixBookId;

    // ★ Firebase에서 직접 로드 (localStorage 캐시와 무관)
    let data=null;
    try{
      if(typeof BookLibDB!=='undefined'&&BookLibDB.loadMemo){
        data=await BookLibDB.loadMemo(clsId,bkId);
      }
    }catch(e){}

    const wasCk = data?(data.checked===true||data.checked==='1'):false;
    ck.checked = wasCk;

    if(wasCk){
      // 메모창 생성 (없을 경우만)
      let pad=document.getElementById('bl-memo-pad');
      if(pad) pad.remove(); // 이전 교재 메모창 제거
      _toggleMemo(true);   // 메모창 열기
      // 메모창 생성 후 데이터 직접 주입 (Firebase 재로드 없이)
      requestAnimationFrame(()=>{
        const ta=document.getElementById('bl-memo-txt');
        const dtDiv=document.getElementById('bl-memo-dt');
        if(ta&&data){
          ta.value=data.text||'';
          if(dtDiv&&data.updatedAt){
            dtDiv.textContent='수정: '+new Date(data.updatedAt).toLocaleString('ko-KR');
          } else if(dtDiv){
            dtDiv.textContent=data.text?'저장된 메모 있음':'저장된 메모 없음';
          }
        }
      });
    } else {
      const pad=document.getElementById('bl-memo-pad');
      if(pad) pad.style.display='none';
    }
  }

    function _chNarrow(){if(_st.chColWidth<=MIN_CH_W+10){_toggleCollapse();return;}_st.chColWidth=Math.max(MIN_CH_W,_st.chColWidth-20);localStorage.setItem(LS_CH_W,_st.chColWidth);const tbl=document.getElementById('bl-mtbl');if(tbl&&!_st.chCollapsed)tbl.style.setProperty('--ch-w',_st.chColWidth+'px');_updWLbl();}
  function _toggleCollapse(){_st.chCollapsed=!_st.chCollapsed;const tbl=document.getElementById('bl-mtbl'),btn=document.getElementById('bl-collapse-btn'),w=_st.chCollapsed?32:_st.chColWidth;if(tbl){tbl.classList.toggle('ch-collapsed',_st.chCollapsed);tbl.style.setProperty('--ch-w',w+'px');}if(btn)btn.textContent=_st.chCollapsed?'▶':'◀';_updWLbl();}
  function _updWLbl(){const lbl=document.querySelector('.bl-mstats span[style*="font-size:10px"]');if(lbl)lbl.textContent=_st.chCollapsed?'접힘':_st.chColWidth+'px';}

  function _setupDrag(){
    const ths=document.querySelectorAll('.bl-shdr');let srcIdx=null;
    ths.forEach((th,i)=>{
      th.addEventListener('dragstart',e=>{srcIdx=i;th.classList.add('dragging');e.dataTransfer.effectAllowed='move';th._dragging=true;});
      th.addEventListener('dragend',()=>{th.classList.remove('dragging');ths.forEach(t=>t.classList.remove('drag-over-left','drag-over-right'));setTimeout(()=>{th._dragging=false;},100);});
      th.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';ths.forEach(t=>t.classList.remove('drag-over-left','drag-over-right'));if(srcIdx!==null&&srcIdx!==i)th.classList.add(i>srcIdx?'drag-over-right':'drag-over-left');});
      th.addEventListener('drop',e=>{e.preventDefault();ths.forEach(t=>t.classList.remove('drag-over-left','drag-over-right'));if(srcIdx===null||srcIdx===i)return;const newOrder=[..._st.colOrder];const[moved]=newOrder.splice(srcIdx,1);newOrder.splice(i,0,moved);_st.colOrder=newOrder;_saveColOrder(_st.matrixClassId,_st.matrixBookId,newOrder);srcIdx=null;_refreshBody();});
      th.addEventListener('click',()=>{if(th._dragging)return;});
    });
  }
  const _colKey=(c,b)=>LS_COL_PFX+c+'__'+b;
  function _loadColOrder(cid,bid){try{return JSON.parse(localStorage.getItem(_colKey(cid,bid))||'null')||[];}catch{return[];}}
  function _saveColOrder(cid,bid,order){localStorage.setItem(_colKey(cid,bid),JSON.stringify(order));}
  function _buildColOrder(students,saved){if(!saved.length)return students.map(s=>s.id);const existing=saved.filter(id=>students.some(s=>s.id===id));const newOnes=students.filter(s=>!saved.includes(s.id)).map(s=>s.id);return[...existing,...newOnes];}
  function _getOrderedStu(students){return _st.colOrder.map(id=>students.find(s=>s.id===id)).filter(Boolean);}
  function _getLastStamp(chs,stamps){if(!stamps||!Object.keys(stamps).length)return null;let lo=-1,lchId=null;chs.forEach(ch=>{if(stamps[ch.id]&&ch.order>lo){lo=ch.order;lchId=ch.id;}});return lchId?{chId:lchId,order:lo}:null;}

  function openShare(sid,classId,bookId){
    if(document.querySelector(`.bl-shdr[data-sid="${sid}"]`)?._dragging)return;
    const ov=document.getElementById('bl-share-ov'),sh=document.getElementById('bl-share-sh');if(!ov||!sh)return;
    const student=typeof StudentDB!=='undefined'?StudentDB.getAll().find(s=>s.id===sid):null;
    const book=BookLibDB.getBookById(bookId);if(!book)return;
    // ★ 반 미배정 교재: cls가 없어도 동작 (학생 직접 배정)
    const cls=_getCls(classId)||{id:'',name:student?.name||'학생'};
    const{text,undone,done,total}=_buildShareData(sid,book,cls);
    _st.shareText=text;const pct=total?Math.round(done.length/total*100):100;
    sh.innerHTML=`<div class="sh-handle"></div>
      <div class="sh-title">📤 학습 현황 공유</div>
      <div class="sh-sub">${_e(student?.name||'학생')} · ${_e(book.name)} · ${pct}%</div>
      <div class="bl-share-scroll">
        <div class="bl-share-stats">
          ${[{n:undone.length,l:'미수행',bg:'rgba(234,88,12,.08)',nc:undone.length?'#ea580c':'var(--green)'},{n:done.length,l:'수행',bg:'rgba(5,150,105,.07)',nc:'var(--green)'},{n:total,l:'평가범위',bg:'var(--card2)',nc:'var(--tx)'}].map(it=>`<div class="bl-share-stat" style="background:${it.bg}"><div class="bl-share-stat-n" style="color:${it.nc}">${it.n}</div><div class="bl-share-stat-l">${it.l}</div></div>`).join('')}
        </div>
        <div class="bl-share-box">${_e(text)}</div>
      </div>
      <div class="bl-share-acts">
        <button class="bl-sbtn copy"  onclick="BooklibApp._copyText(BooklibApp._getShareText())">📋 복사</button>
        <button class="bl-sbtn share" onclick="BooklibApp._webShare('share')">📤 공유</button>
      </div>
      <div style="margin-top:8px"><button class="btn-x" style="width:100%" onclick="BooklibApp.closeShare()">닫기</button></div>`;
    ov.classList.remove('hidden');history.pushState({pg:'booklib',modal:'share'},'');
  }
  function _buildShareData(sid,book,cls){
    const chs=book.chapters||[];const lastStamp=_getLastStamp(chs,_stamps);const evalChs=lastStamp?chs.filter(ch=>ch.order<=lastStamp.order):chs;
    const undone=evalChs.filter(ch=>_checks[`${sid}__${ch.id}`]),done=evalChs.filter(ch=>!_checks[`${sid}__${ch.id}`]);
    const today=new Date().toLocaleDateString('ko-KR');const lastCh=lastStamp?chs.find(c=>c.id===lastStamp.chId):null;
    const undoneLines=undone.map(ch=>{const parsed=BookLibDB._parseCheck(_checks[`${sid}__${ch.id}`]);const ts=parsed.tasks.length?` [${parsed.tasks.join('/')}]`:'';return`  ${ch.title}`;});
    const text=[`📚 ${book.name} 학습 현황`,`🐱 ${cls.name}반`,lastCh?`📍 진도 기준: ${lastCh.title} (${_fmtStamp(_stamps[lastStamp.chId])})`:'',`📅 ${today}`,'',undone.length?`⬜ 미수행 (${undone.length}개)\n${undoneLines.join('\n')}`:'🎉 완료!',done.length&&undone.length?`\n✅ 수행 (${done.length}개)`:''].filter(l=>l!==undefined).join('\n').trim();
    return{text,undone,done,total:evalChs.length};
  }

  function openClassReport(){
    const ov=document.getElementById('bl-report-ov'),sh=document.getElementById('bl-report-sh');
    if(!ov||!sh||!_st.matrixBookId){_toast('⚠️ 교재를 먼저 선택해주세요');return;}
    const book=BookLibDB.getBookById(_st.matrixBookId);if(!book)return;
    // ★ 반 미배정 교재: cls null 허용, 학생은 book.studentIds 기반
    const cls=_getCls(_st.matrixClassId)||null;
    const clsName=cls?cls.name:'(학생배정)';
    const chs=book.chapters||[];const lastStamp=_getLastStamp(chs,_stamps);const evalChs=lastStamp?chs.filter(ch=>ch.order<=lastStamp.order):chs;
    const today=new Date().toLocaleDateString('ko-KR');const lastCh=lastStamp?chs.find(c=>c.id===lastStamp.chId):null;
    // 학생 목록: 반 선택 시 반 학생, 미선택 시 교재 직접 배정 학생
    const allStu = cls
      ? (typeof StudentDB!=='undefined'?StudentDB.getFiltered({classCode:cls.name,status:'재원'}):[])
      : ((book.studentIds||[]).length&&typeof StudentDB!=='undefined'
          ?StudentDB.getAll().filter(s=>(book.studentIds||[]).includes(s.id)):[]);
    const students=_getOrderedStu(allStu);
    const lines=[`════════════════════════`,`📚 ${book.name}`,`🏫 ${clsName} 미수행 현황`,lastCh?`📍 기준: ${lastCh.title} (${_fmtStamp(_stamps[lastStamp.chId])})`:`📍 기준: 미설정`,`📅 ${today}`,`════════════════════════`,''];
    let hasAny=false;
    students.forEach(s=>{const undone=evalChs.filter(ch=>_checks[`${s.id}__${ch.id}`]);if(undone.length){hasAny=true;(()=>{const _A=['🐶','🐱','🐹','🐰','🐻','🦊','🐼','🐨','🐸','🐯'];let _h=0;for(let _i=0;_i<s.name.length;_i++)_h=(_h*31+s.name.charCodeAt(_i))&0xffff;lines.push(`${_A[_h%10]} ${s.name}  (${undone.length}/${evalChs.length})`);})();undone.forEach(ch=>{const parsed=BookLibDB._parseCheck(_checks[`${s.id}__${ch.id}`]);const ts=parsed.tasks.length?` [${parsed.tasks.join('/')}]`:'';lines.push(`  ${ch.title}`);});lines.push('');}});
    if(!hasAny)lines.push('🎉 모든 학생이 완료했습니다!');
    _st.reportText=lines.join('\n');
    const summaryRows=students.map(s=>{const uc=evalChs.filter(ch=>_checks[`${s.id}__${ch.id}`]).length;const pct=evalChs.length?Math.round((evalChs.length-uc)/evalChs.length*100):100;return`<tr><td style="padding:6px 10px;border-bottom:1px solid var(--bdr);font-weight:700">${_e(s.name)}</td><td style="padding:6px 10px;border-bottom:1px solid var(--bdr);color:${uc?'#ea580c':'var(--green)'}">${uc?`⬜ ${uc}개`:'✅'}</td><td style="padding:6px 10px;border-bottom:1px solid var(--bdr)"><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;height:6px;background:var(--bdr);border-radius:3px;overflow:hidden;min-width:60px"><div style="height:100%;width:${pct}%;background:${uc?'#f97316':'#10b981'};border-radius:3px"></div></div><span style="font-size:11px;color:var(--tx3)">${pct}%</span></div></td></tr>`;}).join('');
    sh.innerHTML=`<div class="sh-handle"></div>
      <div class="sh-title">📋 전체 미수행 현황</div>
      <div class="sh-sub">${_e(clsName)} · ${_e(book.name)}</div>
      <!-- ★ 출력 항목 선택 체크박스 -->
      <div style="background:var(--surf2);border-radius:10px;padding:10px 14px;margin:6px 0 10px;border:1px solid var(--bdr)">
        <div style="font-size:11px;font-weight:800;color:var(--tx3);margin-bottom:8px">🖨️ 출력할 항목 선택</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:700;color:var(--tx)">
            <input type="checkbox" id="bl-prn-ck1" checked style="width:16px;height:16px;accent-color:var(--a)">
            1. 반 · 교재 헤더 (출력일 포함)
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:700;color:var(--tx)">
            <input type="checkbox" id="bl-prn-ck2" checked style="width:16px;height:16px;accent-color:var(--a)">
            2. 학생별 요약 테이블
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:700;color:var(--tx)">
            <input type="checkbox" id="bl-prn-ck3" checked style="width:16px;height:16px;accent-color:var(--a)">
            3. 상세 미수행 항목 목록
          </label>
        </div>
      </div>
      <div class="bl-share-scroll">
        <div style="margin:10px 0 6px;font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:1px">학생별 요약</div>
        <table style="width:100%;border-collapse:collapse;border:1px solid var(--bdr);border-radius:8px;overflow:hidden;margin-bottom:10px;font-size:13px">
          <thead><tr style="background:var(--surf2)"><th style="padding:7px 10px;text-align:left;font-size:11px;color:var(--tx3)">학생</th><th style="padding:7px 10px;text-align:left;font-size:11px;color:var(--tx3)">미수행</th><th style="padding:7px 10px;text-align:left;font-size:11px;color:var(--tx3)">수행률</th></tr></thead>
          <tbody>${summaryRows}</tbody>
        </table>
        <div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:1px;margin-bottom:4px">상세 (복사·출력용)</div>
        <div class="bl-share-box">${_e(_st.reportText)}</div>
      </div>
      <div class="bl-share-acts">
        <button class="bl-sbtn copy"  onclick="BooklibApp._copyText(BooklibApp._getReportText())">📋 복사</button>
        <button class="bl-sbtn print" onclick="BooklibApp._printReport()">🖨️ 인쇄</button>
        <button class="bl-sbtn share" onclick="BooklibApp._webShare('report')">📤 공유</button>
      </div>
      <div style="margin-top:8px"><button class="btn-x" style="width:100%" onclick="BooklibApp.closeReport()">닫기</button></div>`;
    ov.classList.remove('hidden');history.pushState({pg:'booklib',modal:'report'},'');
  }
  function _printReport(){
    const book=BookLibDB.getBookById(_st.matrixBookId);
    if(!book){_toast('⚠️ 교재를 선택해주세요','error');return;}
    const cls=_getCls(_st.matrixClassId);
    const clsName=cls?cls.name:'(학생배정)';

    const prn1=document.getElementById('bl-prn-ck1')?.checked!==false;
    const prn2=document.getElementById('bl-prn-ck2')?.checked!==false;
    const prn3=document.getElementById('bl-prn-ck3')?.checked!==false;
    if(!prn1&&!prn2&&!prn3){_toast('⚠️ 출력할 항목을 하나 이상 선택해주세요','error');return;}

    const today=new Date().toLocaleDateString('ko-KR');
    let body='';
    if(prn1) body+='<div class="ph"><h1>📋 '+_e(clsName)+' · '+_e(book.name)+' — 미수행 현황</h1><p>출력일: '+today+'</p></div>';
    if(prn2) body+='<h2>학생별 요약</h2>'+(document.getElementById('bl-rpt-summary-tbl')?.outerHTML||'');
    if(prn3) body+='<h2>상세 미수행 항목</h2><pre>'+_e(_st.reportText||'')+'</pre>';

    const w=window.open('','_blank','width=900,height=700');
    if(!w){_toast('⚠️ 팝업이 차단됐습니다. 팝업을 허용해주세요.','error');return;}
    w.document.open();
    w.document.write('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">'+
      '<style>'+
      '@page{size:A4 portrait;margin:15mm}'+
      'body{font-family:"Noto Sans KR","맑은 고딕",sans-serif;font-size:12px;color:#111;margin:0;padding:16px;background:#fff}'+
      '.ph{border-bottom:2px solid #334155;margin-bottom:14px;padding-bottom:8px}'+
      '.ph h1{font-size:18px;font-weight:900;margin:0 0 4px;color:#1e293b}'+
      '.ph p{font-size:11px;color:#64748b;margin:0}'+
      'h2{font-size:13px;font-weight:800;color:#334155;margin:16px 0 6px;letter-spacing:.5px;border-left:3px solid #6366f1;padding-left:8px}'+
      'table{width:100%;border-collapse:collapse;margin-bottom:12px}'+
      'th{background:#f1f5f9;font-size:11px;font-weight:700;padding:7px 10px;border:1px solid #cbd5e1;text-align:left}'+
      'td{padding:7px 10px;border:1px solid #cbd5e1;font-size:12px}'+
      'tr:nth-child(even) td{background:#f8fafc}'+
      'pre{white-space:pre-wrap;word-break:break-all;font-family:inherit;font-size:11px;line-height:1.8;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px;margin:0}'+
      '</style></head><body>'+
      body+
      '</body></html>');
    w.document.close();
    w.focus();
    // 렌더링 완료 후 인쇄 (이미지/폰트 로딩 대기)
    w.onload=function(){w.print();};
    // onload가 이미 완료된 경우 대비
    if(w.document.readyState==='complete'){
      setTimeout(function(){w.print();},400);
    }
  }

  
  const _getShareText=()=>_st.shareText;
  const _getReportText=()=>_st.reportText;
  async function _copyText(text){try{await navigator.clipboard.writeText(text);_toast('📋 복사됐습니다','success');}catch{_toast('⚠️ 복사 실패');}}
  async function _webShare(type){const text=type==='report'?_st.reportText:_st.shareText;const sd={title:'학습 현황',text};if(navigator.share&&navigator.canShare?.(sd)){try{await navigator.share(sd);_toast('📤 공유 완료','success');return;}catch(e){if(e.name==='AbortError')return;}}_copyText(text);}
  function closeShare(){document.getElementById('bl-share-ov')?.classList.add('hidden');}
  function closeReport(){document.getElementById('bl-report-ov')?.classList.add('hidden');}

  function _getCls(id){if(typeof DB==='undefined')return null;if(typeof DB.getClassById==='function')return DB.getClassById(id);return(DB.getActiveClasses?.()||[]).find(c=>c.id===id)||null;}
  async function _fileToLines(file){if(/\.(xlsx|xls)$/i.test(file.name)&&typeof XLSX!=='undefined'){const buf=await file.arrayBuffer();const wb=XLSX.read(buf,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{header:1});return rows.map(r=>String(r[0]||'').trim()).filter(Boolean);}const text=await file.text();return text.split(/[\r\n,]+/).map(l=>l.trim()).filter(Boolean);}
  function _showLoading(container){const ov=document.createElement('div');ov.className='bl-ov-load';ov.innerHTML='<div class="bl-ov-load-box">⏳ 처리 중…</div>';if(container){container.style.position='relative';container.appendChild(ov);}return ov;}
  const _e=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function _toast(msg,type){const el=document.getElementById('toast');if(!el)return;el.textContent=msg;el.className=type==='success'?'success':'';el.classList.remove('hidden');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.add('hidden'),3000);}

  /* ══════════════════════════════════════════════════════════════
   * CSV 임포트 — 학습 현황 자동 반영
   * ══════════════════════════════════════════════════════════════
   *
   * CSV 포맷: 제목, 타입, 학생명(예:001.도현/수진), 아이디, 암기, 리콜, 스펠, 스피킹, 게임, 테스트, 완료
   *
   * 매칭 규칙
   *   1. 챕터 매칭: 학습현황 챕터명에 CSV '제목' 포함 여부 (or 역방향)
   *                 + CSV '타입'(단어/문장) 이 챕터명에 포함
   *   2. 학생 매칭: CSV '학생명' → 이름 추출 (번호.이름1/이름2)
   *                 → 학습현황 학생의 성 제외 이름(1글자 성 제거)과 매칭
   *                 → 닉네임은 StudentDB에서 매칭된 학생의 닉네임 사용
   *   3. 미수행 판별: 완료='미완료' && !(예외조건)
   *   4. 예외조건: 미완료 + 게임만 공란 + 나머지(암기·리콜·스펠·스피킹·테스트) 전부 공란
   *               → 사용자가 "신규학생 예외 적용" 설정 ON 시 수행으로 처리
   *   5. 세부항목: 미완료 + 암기~테스트 각 공란인 컬럼 = 미수행 항목
   *               게임 값에 '매칭'/'스크램블' 포함 시 해당 항목 활성화
   *   6. 타임스탬프: CSV 역순으로 챕터 순회 → 첫 번째 완료율 ≥50% 챕터
   *                  시간 = CSV 파일 드롭 시각
   * ═══════════════════════════════════════════════════════════════ */

  /* CSV 임포트 UI 진입점 — 학습 현황 탭 드롭존에서 호출 */
  // ★ XLSX/CSV 모두 지원 (XLSX 우선)
  async function importCsv(file) {
    if (!_st.matrixBookId) {
      _toast('⚠️ 교재를 먼저 선택해주세요'); return;
    }
    if (!window.XLSX) { _toast('⚠️ XLSX 라이브러리 로딩 중...', 'error'); return; }
    const ov = _showLoading(document.getElementById('bl-cnt'));
    try {
      const buf    = await file.arrayBuffer();
      const wb     = XLSX.read(buf, { type: 'array' });
      const ws     = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      // ★ 컬럼 정규화: xlsx('세트 제목','완료여부') ↔ csv('제목','완료') 통일
      const rows = rawRows.map(r => {
        const norm = {};
        Object.keys(r).forEach(k => { norm[k] = r[k]; });
        if (!norm['제목']   && norm['세트 제목']) norm['제목']  = norm['세트 제목'];
        if (!norm['완료']   && norm['완료여부'])  norm['완료']  = norm['완료여부'];
        return norm;
      });
      // ★ xlsx 기준 챕터 목록 최신화 (덮어쓰기)
      await _syncChaptersFromXlsx(rows, _st.matrixBookId);

      const result = await _processCsv(rows);  // rows 배열 직접 전달
      const stampMsg = result.stampTitle ? ` | 📍 ${result.stampTitle}까지 처리` : '';
      _toast(`✅ 반영 완료 — 챕터 동기화 + 미수행 ${result.undone}건, 수행 ${result.done}건${stampMsg}`, 'success');
      _refreshBody();
    } catch(e) {
      console.error('[XLSX Import]', e);
      _toast('❌ 파일 처리 오류: ' + e.message);
    } finally { ov.remove(); }
  }

  /**
   * ★ xlsx 기준 챕터 목록 최신화
   * - 중복 제거 → "[타입] 세트 제목" 형식으로 챕터 목록 구성
   * - 기존 챕터와 동일한 것은 id 유지(overwrite), 신규는 새 id 부여
   * - 기존에 없던 xlsx 신규 챕터: fromXlsx:true 플래그 부여 (배경색 구분용)
   * - 최종적으로 xlsx 목록 수량 = DB 챕터 수량 (완전 동기화)
   */
  async function _syncChaptersFromXlsx(rows, bookId) {
    const book = BookLibDB.getBookById(bookId); if (!book) return;

    // 1. xlsx에서 중복 제거 챕터 목록 추출 (순서 유지)
    const seen = new Set(), xlsxChs = [];
    rows.forEach(r => {
      const title = String(r['세트 제목'] || r['제목'] || '').trim();
      const typ   = String(r['타입'] || '').trim();
      if (!title || !typ) return;
      const key = `[${typ}] ${title}`;
      if (!seen.has(key)) { seen.add(key); xlsxChs.push({ key, title, typ }); }
    });
    if (!xlsxChs.length) return;

    // 2. 기존 챕터와 매칭: 동일하면 기존 id 유지, 없으면 신규
    const existingChs = book.chapters || [];
    const existingMap = {};
    existingChs.forEach(ch => { existingMap[ch.title] = ch; });

    const newChs = xlsxChs.map((x, i) => {
      const fullTitle = x.key;  // "[타입] 세트 제목"
      const existing  = existingMap[fullTitle];
      return {
        id:       existing ? existing.id : '',
        title:    fullTitle,
        order:    i,
        fromXlsx: !existing,  // ★ 신규 챕터 표시용 플래그
      };
    });

    await BookLibDB.setChapters(bookId, newChs, 'replace');
  }

  /* 핵심 처리 로직 - rows 배열(정규화 완료) 직접 받음 */
  async function _processCsv(rows) {
    if (!Array.isArray(rows) || !rows.length) throw new Error('유효한 데이터가 없습니다');

    const classId = _st.matrixClassId||'__noclass__';
    const bookId  = _st.matrixBookId;
    const book    = BookLibDB.getBookById(bookId);
    const chs     = book?.chapters || [];
    const cls     = _st.matrixClassId ? _getCls(_st.matrixClassId) : null;

    /* 2. 학생 목록: 반 선택 시 반 학생 / 미선택 시 교재 직접 배정 학생 */
    const students = cls
      ? (typeof StudentDB!=='undefined' ? StudentDB.getFiltered({classCode:cls.name,status:'재원'}) : [])
      : (()=>{
          const sIds = book?.studentIds||[];
          if(!sIds.length||typeof StudentDB==='undefined') return [];
          return StudentDB.getAll().filter(s=>sIds.includes(s.id));
        })();

    /* 3. 타임스탬프 기준 챕터 결정 (CSV 역순, 완료율 ≥80%) */
    const stampTs   = _nowStampStr();
    const stampThreshold = Number(localStorage.getItem('bl_stamp_threshold')||50);
    const stampChId = _findStampChapter(rows, chs, stampThreshold);

    /* ★ 타임스탬프 이후 챕터는 처리 대상에서 제외
     *   - 타임스탬프 챕터 order 이하만 처리
     *   - 이후 챕터는 완료/미수행 여부 불문 완전 무시 */
    const stampCh    = stampChId ? chs.find(ch => ch.id === stampChId) : null;
    const chsInScope = stampCh
      ? chs.filter(ch => ch.order <= stampCh.order)
      : chs; // 타임스탬프 없으면 전체 처리

    /* 4. 예외 설정 가져오기 (모달에서 설정한 값) */
    const exceptionOn = _csvImportState.exceptionOn;

    /* ★ 중복 이름 집합: 같은 반 학생 중 givenName이 겹치는 경우 full 이름으로 매칭 */
    const dupGivens = _buildDupGivens(students);

    let undone=0, done=0, exception=0, skipped=0;

    /* 5. 챕터 × 학생 매트릭스 순회 (★ 타임스탬프 이후 챕터 제외) */
    for (const ch of chsInScope) {
      /* 챕터에 해당하는 CSV 행들 */
      const chRows = rows.filter(r => _matchChapter(ch.title, r['제목'], r['타입']));
      if (!chRows.length) continue;

      for (const stu of students) {
        /* 학생 매칭: 성 제외 이름으로 CSV 학생명 검색 */
        const matchRow  = _findMatchRow(chRows, stu.name, dupGivens);
        const givenName = _givenName(stu.name); // 예외 조회용
        if (!matchRow) continue;

        const isDone      = (matchRow['완료'] || '').trim() === '완료';
        // ★ '완료'가 아닌 모든 값 = 미완료 처리 ('미완료', 공란, 기타)
        const isUndone    = (matchRow['완료'] || '').trim() !== '완료';
        // ★ 학생별 면제 항목 조회
        const exemptItems = _getExemptItems(givenName);
        const isException = isUndone && _checkException(matchRow, exemptItems);

        if (isDone || isException) {
          /* 수행 → 체크 해제 */
          const wasChecked = BookLibDB.isChecked(classId, bookId, stu.id, ch.id);
          if (wasChecked) await BookLibDB.setCheck(classId, bookId, stu.id, ch.id, false, []);
          if (isException) exception++; else done++;
        } else if (isUndone) {
          /* 미수행 → 체크 + 면제 항목 제외한 세부항목 */
          const tasks = _extractTasks(matchRow, exemptItems);
          await BookLibDB.setCheck(classId, bookId, stu.id, ch.id, true, tasks);
          undone++;
        }
      }
    }

    /* 6. 타임스탬프 설정 */
    if (stampChId) {
      await BookLibDB.setStamp(classId, bookId, stampChId, stampTs);
    }

    /* 7. 로컬 캐시 갱신 */
    _checks = BookLibDB.getMatrixChecks(classId, bookId);
    _stamps = BookLibDB.getStamps(classId, bookId);

    return { undone, done, exception, skipped,
      stampTitle: stampCh?.title || null };
  }

  /* ── CSV 파싱 ── */
  function _parseCsv(text) {
    /* BOM 제거 */
    const clean = text.replace(/^\uFEFF/, '');
    const lines  = clean.split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = _splitCsvLine(lines[0]);
    const rows    = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const vals = _splitCsvLine(line);
      const row  = {};
      headers.forEach((h, hi) => { row[h] = (vals[hi] || '').trim(); });
      rows.push(row);
    }
    return rows;
  }

  function _splitCsvLine(line) {
    /* 따옴표 안의 쉼표·줄바꿈 처리 */
    const result = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur);
    return result.map(s => s.replace(/^"|"$/g, '').replace(/\n/g, ' ').trim());
  }

  /* ── 챕터 매칭 ──
   * 학습현황 챕터명에 CSV 제목이 포함되거나, CSV 제목에 챕터명이 포함
   * + CSV 타입(단어/문장)이 챕터명에 포함
   */
  function _matchChapter(chTitle, csvTitle, csvType) {
    const stripType = s => s.replace(/\[단어\]|\[문장\]/g,'').trim();
    // ★ normalize: 괄호 안 번호를 _N으로 변환하여 "Unit.10(1)"→"unit.10_1" 구분 보장
    // 이렇게 하면 "Unit.10"≠"Unit.10(1)"이면서 L01≠L01-02 구분도 유지됨
    const norm = s => {
      let r = stripType(s).toLowerCase();
      r = r.replace(/\s*\((\d+)\)/g, '_$1');   // "(1)"→"_1", "(2)"→"_2"
      r = r.replace(/[\s.\-~\[\]]+/g, '');      // 나머지 특수문자 제거
      return r;
    };
    const ct = norm(chTitle);
    const cv = norm(csvTitle);
    // ★ 정확 일치만 허용 (이전 포함 관계 제거로 흡수 버그 방지)
    if (ct !== cv) return false;
    if (!csvType) return true;
    const chTypeMatch =
      (csvType === '단어' && /\[단어\]/.test(chTitle)) ||
      (csvType === '문장' && /\[문장\]/.test(chTitle));
    return chTypeMatch;
  }

  /* ── 학생 매칭 ──
   * CSV 학생명 예: "001.도현/수진" → 이름 추출: ["도현","수진"]
   * 학생 이름에서 성(첫 1글자) 제외한 이름과 비교
   */
  function _givenName(fullName) {
    /* 한국 이름: 성은 일반적으로 1자 → 나머지가 이름 */
    if (!fullName) return '';
    return fullName.length > 1 ? fullName.slice(1) : fullName;
  }

  function _extractNamesFromCsv(csvStudentName) {
    /* "030.김채원/유림" → ["김채원","유림"] (성 포함 원본 이름 전체 추출) */
    const stripped = (csvStudentName || '').replace(/^\d+\.\s*/, '');
    return stripped.split('/').map(n => n.trim()).filter(Boolean);
  }

  /**
   * ★ 중복 이름(givenName 동일) 처리
   * - 같은 반에 "김채원"/"이채원" 처럼 성만 다르고 이름이 같은 경우
   *   → 2자 이름(givenName)으로 매칭 시 두 학생 모두 매칭되는 문제 발생
   * 해결:
   *   dupGivens 에 포함된 이름 → DB fullName(성포함) 전체로 CSV 이름과 비교
   *   그 외 → givenName(성 제외)으로 CSV 이름(포함 관계) 비교
   */
  function _buildDupGivens(students) {
    /* students: [{name:'김채원'}, ...] 또는 ['김채원',...] */
    const cnt = {};
    students.forEach(s => {
      const n = typeof s === 'string' ? s : (s.name || '');
      const gn = _givenName(n);
      cnt[gn] = (cnt[gn] || 0) + 1;
    });
    return new Set(Object.keys(cnt).filter(gn => cnt[gn] > 1));
  }

  /**
   * _matchStudent: 앞 위치('/') 우선 매칭 → 뒤 위치 폴백
   * - 중복 givenName(dupGivens): fullName 정확 일치로 비교
   * - 일반: givenName 포함 관계로 비교
   * - 위치 우선순위: 앞('/') > 뒤('/')
   *   예) "승호/하진","하진/유진" 에서 "하진" → 앞 위치의 "하진/유진" 선택
   */
  function _matchStudent(csvStudentName, dbFullName, dupGivens) {
    if (!dbFullName) return false;
    const gn      = _givenName(dbFullName);
    const useFullName = dupGivens && dupGivens.has(gn);
    const cmpName = useFullName ? dbFullName : gn;
    const csvNames = _extractNamesFromCsv(csvStudentName);

    function nameHit(n) {
      if (useFullName) return n === cmpName;           // fullName: 정확 일치
      return n === cmpName || n.includes(cmpName) || cmpName.includes(n); // givenName: 포함
    }

    // ★ 1차: 앞 위치('/') 매칭
    if (csvNames.length > 0 && nameHit(csvNames[0])) return true;
    // ★ 2차: 뒤 위치 폴백
    if (csvNames.length > 1 && nameHit(csvNames[1])) return true;
    return false;
  }

  /**
   * _findMatchRow: 학생별 가장 적합한 xlsx 행 반환
   * 앞 위치 우선 탐색 → 뒤 위치 폴백 (행 단위 탐색)
   */
  function _findMatchRow(chRows, dbFullName, dupGivens) {
    const gn = _givenName(dbFullName); // 예: "손세연" → "세연"
    const useFullName = dupGivens && dupGivens.has(gn);
    const cmpName = useFullName ? dbFullName : gn;

    // ★ 가명 매칭: exceptions에서 조회 (fullName, givenName 두 가지 모두 체크)
    const _excMap = _csvImportState.exceptions || {};
    const _excInfo = _excMap[dbFullName] || _excMap[gn];
    const aliasName = (_excInfo && typeof _excInfo==='object' && _excInfo.useAlias && _excInfo.alias)
      ? _excInfo.alias.trim() : null;

    function nameHit(rawCsv) {
      const n = rawCsv.trim();
      if (aliasName) {
        if (n === aliasName) return true;
        // "소율/Seri" 형식: "/" 분리 후 각각 비교
        if (n.split('/').map(p=>p.trim()).some(p => p === aliasName)) return true;
      }
      if (useFullName) return n === cmpName || n.split('/').some(p=>p.trim()===cmpName);
      return n===cmpName || n.includes(cmpName) || cmpName.includes(n)
        || n.split('/').some(p => { const t=p.trim(); return t===cmpName||t.includes(cmpName)||cmpName.includes(t); });
    }

    // 1차: 앞 위치('/') 우선
    const front = chRows.find(r => {
      const names = _extractNamesFromCsv(r['학생명']||'');
      return names.length>0 && nameHit(names[0]);
    });
    if (front) return front;

    // 2차: 뒤 위치 폴백
    return chRows.find(r => {
      const names = _extractNamesFromCsv(r['학생명']||'');
      return names.length>1 && nameHit(names[1]);
    }) || null;
  }

  
  /* ── 신규학생 예외 조건 ──
   * 미완료 + 게임만 공란 + 암기·리콜·스펠·스피킹·테스트 모두 공란
   */
  function _isNewStudentException(row) {
    const gameEmpty   = !row['게임'];
    const othersEmpty = ['암기','리콜','스펠','스피킹','테스트'].every(k => !row[k]);
    return gameEmpty && othersEmpty;
  }

  // ★ 면제 항목 저장 키: classId + bookId 조합
  function _exemptKey() {
    return 'bl_exempt_' + _st.matrixClassId + '_' + _st.matrixBookId;
  }
  // ★ 면제 항목 LocalStorage 영구 저장
  function _saveExempts(excs) {
    try { localStorage.setItem(_exemptKey(), JSON.stringify(excs)); } catch(e) {}
    _csvImportState.exceptions = excs;
  }
  // ★ 면제 항목 로드 (반/교재 전환 시 자동 복원)
  function _loadExempts() {
    try {
      const saved = localStorage.getItem(_exemptKey());
      _csvImportState.exceptions = saved ? JSON.parse(saved) : {};
    } catch(e) { _csvImportState.exceptions = {}; }
  }

  // ══ 후처리 필터 (Post-Filter) — localStorage only, DB 저장 없음 ══
  // Key: bl_pf_{classId}_{bookId}
  // 구조: { "학생명": ["게임","테스트", ...] }
  const _pfKeyOf = (cid,bid) => `bl_pf_${cid||'_'}_${bid||'_'}`;
  function _loadPf(cid, bid){
    try{ return JSON.parse(localStorage.getItem(_pfKeyOf(cid,bid)))||{}; }catch{ return {}; }
  }
  function _savePf(cid, bid, pf){
    try{ localStorage.setItem(_pfKeyOf(cid,bid), JSON.stringify(pf)); }catch(e){}
  }
  function _clearPf(cid, bid){
    try{ localStorage.removeItem(_pfKeyOf(cid,bid)); }catch(e){}
  }

  // 후처리 UI 열기
  function openPostFilter(){
    document.getElementById('bl-pf-modal')?.remove();
    if(!_st.matrixClassId||!_st.matrixBookId){ _toast('⚠️ 반과 교재를 먼저 선택하세요','error'); return; }

    const cls=_getCls(_st.matrixClassId)||null;
    const book=BookLibDB.getBookById(_st.matrixBookId)||null;
    const ALL_ITEMS=['암기','리콜','스펠','스피킹','게임','테스트'];

    // 현재 반 학생 목록
    const stuNames = cls && typeof StudentDB!=='undefined'
      ? StudentDB.getFiltered({classCode:cls.name,status:'재원'}).map(s=>s.name)
      : [];

    // 현재 저장된 필터
    let pf = _loadPf(_st.matrixClassId, _st.matrixBookId);

    const modal=document.createElement('div');
    modal.id='bl-pf-modal';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:300;display:flex;align-items:flex-end;justify-content:center';
    modal.onclick=e=>{if(e.target===modal)modal.remove();};

    const sheet=document.createElement('div');
    sheet.style.cssText='background:var(--card);border-radius:20px 20px 0 0;padding:0;width:100%;max-width:600px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 -4px 24px rgba(0,0,0,.18);overflow:hidden';

    // 헤더
    sheet.innerHTML=`
      <div style="padding:18px 20px 10px;flex-shrink:0;border-bottom:1px solid var(--bdr)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div>
            <div style="font-size:16px;font-weight:800">🔍 후처리 미수행 필터</div>
            <div style="font-size:11px;color:var(--tx3);margin-top:2px">${_e(cls?.name||'')}반 · ${_e(book?.name||'')} — xlsx 반영 후 시각적으로 면제 항목을 제거합니다</div>
          </div>
          <button id="bl-pf-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--tx3);padding:4px">✕</button>
        </div>
        <div style="font-size:10px;color:var(--a);background:var(--a10);border:1px solid var(--a40);border-radius:6px;padding:5px 10px;margin-top:6px;line-height:1.7">
          💡 <strong>이 필터는 화면 표시에만 적용</strong>됩니다. DB 데이터는 변경되지 않으며, 직접 적용 버튼을 눌러야 반영됩니다.
        </div>
      </div>`;

    // 입력 영역
    const dlId='bl-pf-dl-'+Math.random().toString(36).slice(2,7);
    const inputArea=document.createElement('div');
    inputArea.style.cssText='padding:14px 20px;flex-shrink:0;border-bottom:1px solid var(--bdr);background:var(--surf2)';
    inputArea.innerHTML=`
      <datalist id="${dlId}">${stuNames.map(n=>`<option value="${_e(n)}">`).join('')}</datalist>
      <div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.8px;margin-bottom:8px">새 필터 추가</div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input id="bl-pf-name" type="text" list="${dlId}" placeholder="학생 이름 입력..."
          style="flex:1;padding:8px 11px;border:1.5px solid var(--bdr2);border-radius:9px;font-size:13px;background:var(--card);font-family:var(--font);outline:none;transition:border-color .2s">
      </div>
      <div style="font-size:10px;font-weight:800;color:var(--tx3);margin-bottom:6px">면제 항목 선택</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px" id="bl-pf-items">
        ${ALL_ITEMS.map(it=>`<label class="pf-item-lbl" style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;background:var(--card);border:1.5px solid var(--bdr2);border-radius:7px;cursor:pointer;font-size:12px;font-weight:700">
          <input class="pf-item-ck" type="checkbox" value="${it}" style="accent-color:var(--a)" onchange="this.closest('label').style.borderColor=this.checked?'var(--a)':'var(--bdr2)'"> ${it}</label>`).join('')}
      </div>
      <div style="display:flex;gap:8px">
        <button id="bl-pf-all-btn" style="flex:1;padding:8px;border-radius:9px;background:var(--card);border:1.5px solid var(--bdr2);color:var(--tx2);font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font)">전체 선택</button>
        <button id="bl-pf-add-btn" style="flex:2;padding:8px 16px;border-radius:9px;background:var(--a);color:#fff;border:none;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font);box-shadow:0 2px 8px var(--a40)">＋ 추가</button>
      </div>`;
    sheet.appendChild(inputArea);

    // 전체선택 토글
    const allCkBtn=inputArea.querySelector('#bl-pf-all-btn');
    allCkBtn.onclick=()=>{
      const cks=[...inputArea.querySelectorAll('.pf-item-ck')];
      const allOn=cks.every(c=>c.checked);
      cks.forEach(c=>{c.checked=!allOn;c.closest('label').style.borderColor=c.checked?'var(--a)':'var(--bdr2)';});
      allCkBtn.textContent=allOn?'전체 선택':'전체 해제';
    };

    // 목록 영역
    const listWrap=document.createElement('div');
    listWrap.id='bl-pf-list';
    listWrap.style.cssText='flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 20px;display:flex;flex-direction:column;gap:8px';
    sheet.appendChild(listWrap);

    // 하단 버튼
    const acts=document.createElement('div');
    acts.style.cssText='padding:12px 20px 24px;flex-shrink:0;display:flex;gap:8px;border-top:1px solid var(--bdr);background:var(--card)';
    acts.innerHTML=`
      <button id="bl-pf-clear" style="flex:1;padding:11px;border-radius:10px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#dc2626;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font)">전체 초기화</button>
      <button id="bl-pf-apply" style="flex:2;padding:11px;border-radius:10px;background:var(--a);color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);box-shadow:0 3px 10px var(--a40)">✅ 적용</button>`;
    sheet.appendChild(acts);
    modal.appendChild(sheet);
    document.body.appendChild(modal);

    document.getElementById('bl-pf-close').onclick=()=>modal.remove();

    // 입력창 포커스 스타일
    const nameInp=document.getElementById('bl-pf-name');
    nameInp.onfocus=()=>nameInp.style.borderColor='var(--a)';
    nameInp.onblur=()=>nameInp.style.borderColor='var(--bdr2)';

    // 목록 렌더 함수
    function renderList(){
      listWrap.innerHTML='';
      const entries=Object.entries(pf);
      if(!entries.length){
        listWrap.innerHTML='<div style="text-align:center;color:var(--tx3);font-size:12px;padding:24px">등록된 후처리 필터가 없습니다<br><span style="font-size:10px">위에서 학생 이름과 면제 항목을 추가하세요</span></div>';
        return;
      }
      entries.forEach(([stuName, exemptItems])=>{
        const entry=document.createElement('div');
        entry.style.cssText='display:flex;align-items:flex-start;gap:8px;padding:10px 12px;background:var(--surf2);border:1px solid var(--bdr);border-radius:10px';
        const itemBadges=exemptItems.length
          ? exemptItems.map(it=>`<span style="display:inline-flex;padding:2px 8px;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.3);border-radius:5px;font-size:11px;font-weight:700;color:var(--a)">${_e(it)}</span>`).join('')
          : '<span style="font-size:11px;color:var(--tx3)">항목 없음</span>';
        entry.innerHTML=`
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:800;color:var(--tx);margin-bottom:5px">🐱 ${_e(stuName)}</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">${itemBadges}</div>
          </div>
          <button data-name="${_e(stuName)}" class="pf-del-btn"
            style="flex-shrink:0;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#dc2626;border-radius:7px;padding:5px 10px;cursor:pointer;font-size:12px">🗑</button>`;
        entry.querySelector('.pf-del-btn').onclick=()=>{
          delete pf[stuName]; renderList();
        };
        listWrap.appendChild(entry);
      });
    }
    renderList();

    // ＋ 추가 버튼
    document.getElementById('bl-pf-add-btn').onclick=()=>{
      const nm=(nameInp.value||'').trim();
      if(!nm){ _toast('⚠️ 학생 이름을 입력하세요','error'); return; }
      const selected=[...inputArea.querySelectorAll('.pf-item-ck:checked')].map(c=>c.value);
      if(!selected.length){ _toast('⚠️ 면제 항목을 1개 이상 선택하세요','error'); return; }
      // 기존 항목과 합치기 (중복 제거)
      const existing2=pf[nm]||[];
      pf[nm]=[...new Set([...existing2,...selected])];
      nameInp.value='';
      inputArea.querySelectorAll('.pf-item-ck').forEach(c=>{c.checked=false;c.closest('label').style.borderColor='var(--bdr2)';});
      allCkBtn.textContent='전체 선택';
      renderList();
      _toast(`✅ "${nm}" 필터 추가됨`,'success');
    };

    // 전체 초기화
    document.getElementById('bl-pf-clear').onclick=()=>{
      if(!Object.keys(pf).length) return;
      if(!confirm('후처리 필터를 전체 초기화하시겠습니까?')) return;
      pf={};
      renderList();
    };

    // ✅ 적용
    document.getElementById('bl-pf-apply').onclick=()=>{
      _savePf(_st.matrixClassId, _st.matrixBookId, pf);
      modal.remove();
      _refreshBody();
      const cnt=Object.keys(pf).length;
      _toast(cnt?`🔍 후처리 필터 적용 (${cnt}명)`:'후처리 필터가 초기화되었습니다','success');
      // 버튼 상태 업데이트
      _updatePfBtn();
    };
  }

  // 후처리 버튼 상태 업데이트
  function _updatePfBtn(){
    const btn=document.getElementById('bl-pf-btn');
    if(!btn) return;
    const pf=_loadPf(_st.matrixClassId, _st.matrixBookId);
    const cnt=Object.keys(pf).length;
    if(cnt){
      btn.style.background='rgba(99,102,241,.15)';
      btn.style.borderColor='var(--a)';
      btn.style.color='var(--a)';
      btn.textContent=`🔍 후처리 (${cnt}명)`;
    } else {
      btn.style.background='rgba(99,102,241,.07)';
      btn.style.borderColor='rgba(99,102,241,.3)';
      btn.style.color='var(--a)';
      btn.textContent='🔍 후처리';
    }
  }

  // ★ 해당 학생(이름)의 면제 항목 목록 반환
  function _getExemptItems(givenName) {
    if (!givenName) return [];
    const excs = _csvImportState.exceptions || {};
    for (const [name, val] of Object.entries(excs)) {
      // fullName 또는 givenName 포함 관계로 매칭
      const nameGiven = name.length>1 && /[가-힣]/.test(name[0]) ? name.slice(1) : name;
      if (givenName===name || givenName===nameGiven || name.includes(givenName) || givenName.includes(name)) {
        // ★ val이 배열이면 그대로, 객체이면 .items 배열 추출
        return Array.isArray(val) ? val : (Array.isArray(val?.items) ? val.items : []);
      }
    }
    return [];
  }

  
  // ★ 면제 항목을 고려한 예외 체크
  // 미완료이고, 모든 공란 항목이 면제 항목이면 → 완료로 처리
  function _checkException(row, exemptItems) {
    if (!exemptItems || !exemptItems.length) return false;
    const ALL_COLS = ['암기','리콜','스펠','스피킹','게임','테스트'];
    // 공란인 항목들 중 면제되지 않은 것이 있으면 → 예외 아님
    const nonExemptEmpty = ALL_COLS.filter(c => !row[c] && !exemptItems.includes(c));
    return nonExemptEmpty.length === 0;
  }

  /* ── 세부항목 추출 ──
   * 미완료 + 해당 컬럼 공란 → 미수행 항목
   * 게임: '매칭' or '스크램블' 포함 시 해당 값으로 세부항목 추가
   */
  // ★ 수행 여부 판단: 공란('') 또는 0%(=0점, 미수행) 모두 미수행
  function _isColEmpty(val) {
    if (!val) return true;                      // 공란
    const s = String(val).trim();
    if (s === '' || s === '0%' || s === '0') return true; // 0%·0 = 미수행
    return false;
  }

  function _extractTasks(row, exemptItems=[]) {
    const tasks = [];
    const cols = ['암기','리콜','스펠','스피킹'];
    // ★ 공란 또는 0% → 미수행 (면제 항목 제외)
    cols.forEach(c => {
      if (_isColEmpty(row[c]) && !exemptItems.includes(c)) tasks.push(c);
    });
    /* 게임: 공란이면 미수행, '매칭…'/'스크램블…' 있으면 수행 */
    const game = (row['게임'] || '').trim();
    if (!game && !exemptItems.includes('게임')) {
      tasks.push('게임');
    }
    /* 테스트: 공란 또는 0 이면 미수행 */
    if (_isColEmpty(row['테스트']) && !exemptItems.includes('테스트')) {
      tasks.push('테스트');
    }
    return tasks;
  }

  /* ── 타임스탬프 기준 챕터 찾기 ──
   * CSV를 챕터 역순으로 순회, 첫 번째 완료율 ≥50% 챕터
   */
  function _findStampChapter(rows, chs, threshold) {
    threshold = threshold || 50; // default 50%
    /* ★ CSV 챕터 고유 목록: 제목+타입 조합으로 dedup (역순) */
    const csvChapters = []; // [{title, type}]
    const seen = new Set();
    for (let i = rows.length-1; i >= 0; i--) {
      const t   = rows[i]['제목']?.trim();
      const typ = rows[i]['타입']?.trim();
      const key = t + '||' + typ;
      if (t && !seen.has(key)) { csvChapters.push({title:t, type:typ}); seen.add(key); }
    }

    /* 각 제목+타입 조합별 완료율 계산 → 역순 첫 ≥50% 챕터 반환 */
    for (const {title:csvTitle, type:csvType} of csvChapters) {
      const titleRows = rows.filter(r =>
        r['제목']?.trim() === csvTitle && r['타입']?.trim() === csvType
      );
      if (!titleRows.length) continue;
      const done = titleRows.filter(r => r['완료']?.trim() === '완료').length;
      // ★ 50% 이상(포함): done/total >= 0.5 → done*2 >= total
      const pct  = done / titleRows.length * 100;
      if (pct >= threshold) {
        /* ★ 학습현황 챕터에서 제목+타입 매칭 (_syncChaptersFromXlsx로 이미 동기화됨) */
        const fullTitle = `[${csvType}] ${csvTitle}`;
        // 1차: _matchChapter 정확 매칭 → 동일명 전체 중 order 최대(마지막) 반환
        let matchedAll = chs.filter(ch => _matchChapter(ch.title, csvTitle, csvType));
        // 2차: fullTitle 직접 매칭
        if (!matchedAll.length) matchedAll = chs.filter(ch => ch.title === fullTitle);
        // 3차: 정규화 없이 title 포함 비교
        if (!matchedAll.length) matchedAll = chs.filter(ch => ch.title.includes(csvTitle));
        if (matchedAll.length) {
          // ★ 동일명 그룹 중 가장 마지막(order 최대) 챕터를 stamp로 지정
          // → chsInScope = order ≤ 마지막 → 동일명 그룹 전체가 scope에 포함
          const matched = matchedAll.reduce((a,b)=>(b.order>a.order?b:a));
          return matched.id;
        }
        /* 매칭 실패 시: 계속 탐색 */
      }
    }
    return null;
  }

  function _nowStampStr() {
    const now = new Date();
    const ymd = now.toISOString().slice(0,10);
    const hm  = now.toTimeString().slice(0,5);
    return `${ymd} ${hm}`;
  }

  /* ── CSV 임포트 상태 (예외 설정) ── */
  const _csvImportState = {
    exceptionOn: false,
    // ★ 학생별 예외 항목: { givenName: ['암기','게임',...] }
    exceptions: {},
  };

  /* ── CSV 임포트 확인 모달 ── */
  async function openCsvImportModal(file) {
    if (!_st.matrixBookId) {
      _toast('⚠️ 교재를 먼저 선택해주세요'); return;
    }
    /* 기존 모달 있으면 제거 */
    document.getElementById('bl-csv-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'bl-csv-modal';
    modal.className = 'ov';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:150;display:flex;align-items:flex-end;justify-content:center';
    // ★ 기존 면제 설정 로드 (반 기준 영구 저장된 값)
    _loadExempts();
    // DB에서 더 상세한 정보(enabled 포함) 로드 — 신구조: {bookId:{studentName:{...}}}
    let _dbExcs = {};
    if (_st.matrixClassId && _st.matrixBookId && typeof BookLibDB!=='undefined' && BookLibDB.loadClassExempts) {
      const rawEx = await BookLibDB.loadClassExempts(_st.matrixClassId) || {};
      const exemptsByBook = _migrateExemptsIfNeeded(rawEx);
      _dbExcs = exemptsByBook[_st.matrixBookId] || {};
      if (Object.keys(_dbExcs).length) {
        const simpleExcs = Object.fromEntries(Object.entries(_dbExcs).map(([n,v])=>[n, Array.isArray(v)?v:(v.items||[])]));
        _csvImportState.exceptions = simpleExcs;
      }
    }
    // CSV에서 학생명 목록 추출 (모달 표시용)
    const csvStudents = _extractCsvStudentNames(file);

    modal.innerHTML = `
      <div style="background:var(--card);border-radius:20px 20px 0 0;width:100%;max-width:540px;padding:20px 20px 32px;box-shadow:var(--sh2);animation:slideUp .22s ease;max-height:90vh;overflow-y:auto" onclick="event.stopPropagation()">
        <div style="width:40px;height:4px;border-radius:2px;background:var(--bdr2);margin:0 auto 16px"></div>
        <div style="font-size:16px;font-weight:800;color:var(--tx);margin-bottom:4px">📊 CSV 임포트</div>
        <div style="font-size:12px;color:var(--tx3);margin-bottom:16px">${_e(file.name)}</div>

        <!-- 규칙 안내 (접기 가능) -->
        <details style="margin-bottom:12px">
          <summary style="font-size:11px;font-weight:700;color:var(--tx3);cursor:pointer;padding:6px 0">▸ 매칭 규칙 안내</summary>
          <div style="font-size:11px;color:var(--tx3);line-height:1.9;padding:8px 0 0 8px">
            • CSV '제목'+'타입' → 챕터 매칭<br>
            • CSV '학생명'(예: 001.도현/수진) → 성 제외 이름 매칭<br>
            • 완료='완료' → 수행 처리 / '미완료' → 미수행+공란 항목 체크<br>
            • 타임스탬프: 역순 첫 완료율 ≥80% 챕터 → 이후 챕터 제외
          </div>
        </details>

        <!-- ★ 학생별 예외 설정 -->
        <div style="background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:14px;margin-bottom:14px">
          <div style="font-size:13px;font-weight:800;color:#92400e;margin-bottom:4px">🆕 학생별 미수행 항목 면제</div>
          <div style="font-size:11px;color:#b45309;margin-bottom:12px">특정 학생의 선택 항목이 비어있어도 수행 완료로 처리합니다</div>
          <div id="bl-exc-list" style="display:flex;flex-direction:column;gap:8px"></div>
          <button onclick="BooklibApp._addExcRow()"
            style="margin-top:10px;width:100%;padding:8px;border-radius:8px;background:rgba(245,158,11,.1);border:1.5px dashed rgba(245,158,11,.5);color:#92400e;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font)">
            ＋ 예외 학생 추가
          </button>
        </div>

        <div style="display:flex;gap:8px">
          <button style="flex:1;padding:12px;border-radius:10px;background:var(--surf2);border:1px solid var(--bdr2);color:var(--tx2);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font)"
                  onclick="document.getElementById('bl-csv-modal')?.remove()">취소</button>
          <button style="flex:2;padding:12px;border-radius:10px;background:var(--a);color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);box-shadow:0 3px 10px var(--a40)"
                  onclick="BooklibApp._confirmCsvImport()">📊 CSV 반영 시작</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    // ★ 기존 면제 항목 UI 복원 (DB에서 enabled 정보 포함)
    if (Object.keys(_dbExcs).length) {
      // DB에 상세 정보(enabled 포함) 있으면 우선 사용
      Object.entries(_dbExcs).forEach(([name, v]) => {
        const items = Array.isArray(v) ? v : (v.items || []);
        const enabled = typeof v === 'object' ? (v.enabled !== false) : true;
        const alias = typeof v === 'object' ? (v.alias||'') : '';
        const useAlias = typeof v === 'object' ? !!v.useAlias : false;
        _addExcRow(name, items, enabled, alias, useAlias);
      });
    } else {
      const savedExcs = _csvImportState.exceptions || {};
      Object.entries(savedExcs).forEach(([name, items]) => {
        _addExcRow(name, items);
      });
    }

    /* 임시로 file 참조 보관 */
    _csvImportState._pendingFile = file;
    modal.addEventListener('click', () => modal.remove());
  }

  // CSV에서 학생 이름 목록 (미리 추출해서 datalist에 활용)
  function _extractCsvStudentNames(file) {
    // file.text()는 비동기이므로 모달 렌더 후 채움
    // 빈 배열 반환 후 실제 파싱은 읽기 후 수행
    return [];
  }

  // ★ 예외 학생 행 추가
    function _addExcRow(name='', items=[], enabled=true, alias='', useAlias=false) {
    const list = document.getElementById('bl-exc-list'); if (!list) return;
    const ALL_ITEMS = ['암기','리콜','스펠','스피킹','게임','테스트'];
    const rowId = 'exc-row-' + Date.now();
    const clsStudents = typeof StudentDB!=='undefined'
      ? StudentDB.getFiltered({classCode: (_getCls(_st.matrixClassId)||{}).name}).map(s=>s.name)
      : [];
    const div = document.createElement('div');
    div.id = rowId;
    div.style.cssText = `background:${enabled?'var(--card)':'var(--surf2)'};border:1.5px solid ${enabled?'var(--a40)':'var(--bdr2)'};border-radius:10px;padding:10px 12px;transition:all .15s`;
    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <input type="checkbox" id="${rowId}-ck" ${enabled?'checked':''}
          style="width:16px;height:16px;accent-color:var(--a);cursor:pointer;flex-shrink:0"
          onchange="const d=document.getElementById('${rowId}');d.style.opacity=this.checked?'1':'0.55';d._enabled=this.checked;d.style.borderColor=this.checked?'var(--a40)':'var(--bdr2)'">
        <div style="position:relative;flex:1">
          <input id="${rowId}-inp" type="text" class="f-inp" placeholder="실제 학생 이름 (예: 세연)" value="${_e(name)}"
            style="width:100%;padding:6px 10px;font-size:12px" autocomplete="off"
            oninput="document.getElementById('${rowId}')._name=this.value;BooklibApp._excAutoComplete('${rowId}',this.value)">
          <div id="${rowId}-ac" style="display:none;position:absolute;left:0;right:0;top:100%;background:var(--card);border:1px solid var(--a40);border-radius:8px;z-index:200;max-height:140px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.15)"></div>
        </div>
        <button onclick="BooklibApp._deleteExcRow('${rowId}')"
          style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#dc2626;border-radius:7px;padding:4px 8px;cursor:pointer;font-size:13px;flex-shrink:0">🗑</button>
      </div>
      <!-- ★ 가명 매칭 -->
      <div style="display:flex;align-items:center;gap:6px;margin-top:6px;margin-bottom:6px">
        <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--tx3);white-space:nowrap;cursor:pointer">
          <input type="checkbox" id="${rowId}-alias-ck" style="width:13px;height:13px;accent-color:var(--a);cursor:pointer"
            onchange="const inp=document.getElementById('${rowId}-alias-inp');inp.style.display=this.checked?'block':'none';document.getElementById('${rowId}')._useAlias=this.checked;">
          <span style="color:var(--a);font-weight:700">xlsx 가명</span>
        </label>
        <input id="${rowId}-alias-inp" type="text" placeholder="xlsx에서 찾을 가명/영문명 (예: Seri)" value=""
          style="display:none;flex:1;padding:4px 8px;border:1px solid var(--a40);border-radius:6px;font-size:12px;background:var(--surf2)"
          oninput="document.getElementById('${rowId}')._alias=this.value.trim()">
      </div>
      </div>
      <div style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.5px;margin-bottom:6px">면제 항목 선택 (체크된 항목은 비어있어도 완료 처리)</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${ALL_ITEMS.map(it=>`
          <label style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:var(--card2);border:1.5px solid ${items.includes(it)?'var(--a)':'var(--bdr2)'};border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;color:var(--tx2)">
            <input type="checkbox" value="${it}" ${items.includes(it)?'checked':''}
              style="width:13px;height:13px;accent-color:var(--a);cursor:pointer"
              onchange="this.closest('label').style.borderColor=this.checked?'var(--a)':'var(--bdr2)'">
            ${it}
          </label>`).join('')}
      </div>`;
    div._name = name;
    div._enabled = enabled;
    div._clsStudents = clsStudents;
    div._alias = alias;
    div._useAlias = useAlias;
    list.appendChild(div);
    if(!enabled) div.style.opacity='0.6';
    // ★ 가명 복원
    if(alias){
      const aliasCk = document.getElementById(rowId+'-alias-ck');
      const aliasInp = document.getElementById(rowId+'-alias-inp');
      if(aliasCk && useAlias){ aliasCk.checked=true; }
      if(aliasInp){ aliasInp.value=alias; aliasInp.style.display=(useAlias?'block':'none'); }
    }
  }

  // ★ 면제 학생 행 삭제 (UI + DB)
  function _deleteExcRow(rowId) {
    const row = document.getElementById(rowId); if(!row) return;
    const nameInput = document.getElementById(row.id+'-inp'); // ★ id로 정확히 지정
    const name = (nameInput?.value || row._name || '').trim();
    if (!name) { row.remove(); return; }
    const gn = name.length>1 && /[가-힣]/.test(name[0]) ? name.slice(1) : name;
    // DB에서 완전 삭제 (fullName + givenName 두 key 모두)
    if (_st.matrixClassId && typeof BookLibDB!=='undefined' && BookLibDB.loadClassExempts && BookLibDB.saveClassExempts) {
      const db = BookLibDB.loadClassExempts(_st.matrixClassId) || {};
      delete db[name]; delete db[gn];
      BookLibDB.saveClassExempts(_st.matrixClassId, db);
    }
    if (_csvImportState.exceptions) {
      delete _csvImportState.exceptions[name];
      delete _csvImportState.exceptions[gn];
    }
    row.remove();
    _toast('🗑 "'+name+'" 면제 학생 삭제', 'success');
  }

  
  // ★ AutoComplete for 면제 학생 이름
  function _excAutoComplete(rowId, val) {
    const ac = document.getElementById(rowId+'-ac'); if(!ac) return;
    const row = document.getElementById(rowId); if(!row) return;
    const students = row._clsStudents || [];
    if(!val.trim()){ ac.style.display='none'; return; }
    const matches = students.filter(n => n.includes(val) || n.replace(/^./, '').includes(val));
    if(!matches.length){ ac.style.display='none'; return; }
    ac.innerHTML = matches.slice(0,8).map(n =>
      `<div onclick="document.getElementById('${rowId}-inp').value='${n}';document.getElementById('${rowId}')._name='${n}';document.getElementById('${rowId}-ac').style.display='none'"
        style="padding:7px 12px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--bdr)"
        onmouseover="this.style.background='var(--a10)'" onmouseout="this.style.background=''">${n}</div>`
    ).join('');
    ac.style.display = 'block';
  }

  
  // ★ 예외 설정 수집 (모달 → _csvImportState.exceptions)
    function _collectExceptions() {
    const result = {};
    const list = document.getElementById('bl-exc-list'); if (!list) return result;
    list.querySelectorAll('[id^="exc-row-"]').forEach(row => {
      const enableCk = row.querySelector('[id$="-ck"]:not([id$="-alias-ck"])');
      if (enableCk && !enableCk.checked) return; // 비활성 면제 학생 제외
      const nameInput = document.getElementById(row.id+'-inp'); // ★ id로 정확히 지정
      const name = (nameInput?.value || row._name || '').trim();
      if (!name) return;
      const aliasCk  = row.querySelector('[id$="-alias-ck"]');
      const aliasInp = row.querySelector('[id$="-alias-inp"]');
      const useAlias = aliasCk ? aliasCk.checked : !!row._useAlias;
      const alias    = (aliasInp?.value || row._alias || '').trim();
      const checked  = [...row.querySelectorAll('input[type="checkbox"]:checked')]
        .filter(c => !c.id?.endsWith('-ck') && !c.id?.endsWith('-alias-ck'))
        .map(c => c.value).filter(Boolean);
      if (checked.length || (useAlias && alias)) {
        // ★ fullName으로만 저장 (givenName은 _findMatchRow에서 동적 계산)
        result[name] = { items: checked, useAlias, alias: alias || null };
      }
    });
    return result;
  }

  function _collectExceptionsForSave() {
    const result = {};
    const list = document.getElementById('bl-exc-list'); if (!list) return result;
    list.querySelectorAll('[id^="exc-row-"]').forEach(row => {
      const enableCk = row.querySelector('[id$="-ck"]:not([id$="-alias-ck"])');
      const isEnabled = enableCk ? enableCk.checked : (row._enabled !== false);
      const nameInput = document.getElementById(row.id+'-inp'); // ★ id로 정확히 지정
      const name = (nameInput?.value || row._name || '').trim();
      if (!name) return;
      const aliasCk  = row.querySelector('[id$="-alias-ck"]');
      const aliasInp = document.getElementById(row.id+'-alias-inp');
      const useAlias = aliasCk ? aliasCk.checked : !!row._useAlias;
      const alias    = (aliasInp?.value || row._alias || '').trim();
      const checked  = [...row.querySelectorAll('input[type="checkbox"]:checked')]
        .filter(c => !c.id?.endsWith('-ck') && !c.id?.endsWith('-alias-ck'))
        .map(c => c.value).filter(Boolean);
      // ★ fullName 하나의 key만 저장 (이중저장 제거 → 모달 복원 시 중복 행 방지)
      result[name] = { items: checked, enabled: isEnabled, alias: alias || null, useAlias };
    });
    return result;
  }

  
  
  async function _confirmCsvImport() {
    // 예외 항목 수집
    _csvImportState.exceptions = _collectExceptions();
    _csvImportState.exceptionOn = Object.keys(_csvImportState.exceptions).length > 0;

    // ★★★ 핵심 수정: 신구조 {bookId:{학생명:{...}}}로 저장 ★★★
    // 기존 저장 방식(_collectExceptionsForSave 결과를 그대로 저장)은
    // bookId가 없는 구버전 구조로 저장되어, 다음 로드 시 마이그레이션에서
    // bookId를 찾지 못해 {} 반환 → 예외 목록이 사라지는 버그 발생
    if (_st.matrixClassId && _st.matrixBookId &&
        typeof BookLibDB !== 'undefined' && BookLibDB.saveClassExempts) {
      const collected = _collectExceptionsForSave();
      // 기존 DB 데이터를 신구조로 읽어온 뒤 해당 bookId만 교체 (다른 교재 보존)
      const rawExisting = await BookLibDB.loadClassExempts(_st.matrixClassId) || {};
      const existing    = _migrateExemptsIfNeeded(rawExisting);
      if (Object.keys(collected).length) {
        existing[_st.matrixBookId] = collected;
      } else {
        delete existing[_st.matrixBookId];  // 빈 경우 키 제거
      }
      await BookLibDB.saveClassExempts(_st.matrixClassId, existing);
    }

    document.getElementById('bl-csv-modal')?.remove();
    const file = _csvImportState._pendingFile;
    if (file) await importCsv(file);
  }

  /* ── 학습 현황 통계 바에 CSV 드롭존 바인딩 추가 ──
   * _renderMatrixTab / _refreshBody 호출 후 이 함수를 호출하면
   * 매트릭스 래퍼 영역에 드래그앤드롭 이벤트 등록
   */
  function _bindCsvDrop() {
    const wrap = document.getElementById('bl-mbody');
    if (!wrap || wrap._csvDropBound) return;
    wrap._csvDropBound = true;

    wrap.addEventListener('dragover', e => {
      if (!_hasCsvFile(e)) return;
      e.preventDefault();
      wrap.style.outline = '3px dashed var(--a)';
      wrap.style.outlineOffset = '-6px';
    });
    wrap.addEventListener('dragleave', e => {
      if (!wrap.contains(e.relatedTarget)) {
        wrap.style.outline = '';
        wrap.style.outlineOffset = '';
      }
    });
    wrap.addEventListener('drop', e => {
      wrap.style.outline = '';
      wrap.style.outlineOffset = '';
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { _toast('⚠️ .xlsx 또는 .csv 파일을 드롭해주세요'); return; }
      e.preventDefault();
      openCsvImportModal(file);
    });
  }

  function _hasCsvFile(e) {
    return Array.from(e.dataTransfer?.types || []).includes('Files');
  }


  // ★★★ 일괄 xlsx 반영 ★★★
  // 파일명에서 반 이름과 교재명 추출하여 매칭
  // ★ 정규화: 공백·언더스코어·하이픈 제거 후 소문자 변환
  // '워드 중등 기본_1' → '워드중등기본1'
  function _normStr(s){ return String(s||'').replace(/[\s　_\-]+/g,'').toLowerCase(); }


  function _matchFileToTarget(fname){
    // 파일명 패턴:
    //   "04.[T2] 단어가 된다 2_20260516.xlsx"    → 반(T2) + 교재명 매칭
    //   "01.[나현] 파닉스 몬스터 3_20260516.xlsx" → 교재명(나현 포함) 매칭
    //   "03.[서우,혜온] 초등 천일문_20260516.xlsx" → 교재명(서우 또는 혜온 포함) 매칭
    const allCls  = typeof DB!=='undefined'?DB.getActiveClasses():[];
    const allBks  = BookLibDB.getBooks().filter(b=>!b.archived);
    const fnNorm  = _normStr(fname);

    // ── 브라켓 내용 추출: 예) "[나현]" → "나현", "[T2]" → "T2"
    const bracketMatch = fname.match(/\[([^\]]+)\]/);
    const bracketRaw   = bracketMatch ? bracketMatch[1].trim() : '';
    const bracketNorm  = _normStr(bracketRaw);

    // ── 반 매칭: 브라켓 내용 기준 우선 (false positive 방지)
    // 브라켓 안의 텍스트와 클래스 이름을 정확히(exact) 또는 포함으로 비교
    let matchedCls = null;
    if(bracketNorm){
      for(const cls of allCls){
        const clsNorm = _normStr(cls.name);
        if(!clsNorm) continue;
        // 브라켓 내용이 클래스 이름과 정확히 일치하거나 포함
        if(bracketNorm===clsNorm || bracketNorm.startsWith(clsNorm+',') || bracketNorm.endsWith(','+clsNorm)){
          if(!matchedCls || cls.name.length > matchedCls.name.length) matchedCls = cls;
        }
      }
    }
    // 브라켓에서 못 찾은 경우: 파일명 전체에서 매칭하되 길이 2 이상만 허용
    // (단일 문자 클래스는 '.xlsx' 같은 확장자 안의 문자와 오매칭될 수 있어 제외)
    if(!matchedCls){
      for(const cls of allCls){
        const clsNorm = _normStr(cls.name);
        if(clsNorm.length < 2) continue; // ★ 단일 문자 false-positive 방지
        if(fnNorm.includes(clsNorm)){
          if(!matchedCls || cls.name.length > matchedCls.name.length) matchedCls = cls;
        }
      }
    }

    // ── 파일명 제목 부분 추출 후 정규화 (공백·언더스코어·하이픈 제거)
    // "09.[S] 워드 중등 실력_20260516.xlsx" → "워드중등실력"
    const rawTitle = fname
      .replace(/^\d+[.\-_)]*\s*/,'')
      .replace(/\[[^\]]*\]\s*/g,'')
      .replace(/[_\-]\d{6,}.*$/,'')
      .replace(/\.(xlsx|xls|csv|txt)$/i,'')
      .trim();
    const fnTitleNorm = _normStr(rawTitle);

    // ── 교재명 매칭 (★ 양방향 포함 + 공백·언더스코어 무시)
    // A) 파일제목 ⊃ 교재명: fnTitleNorm.includes(bkNorm)
    // B) 교재명 ⊃ 파일제목: bkNorm.includes(fnTitleNorm)  (교재명이 더 길 때)
    // C) 파일명 전체 ⊃ 교재명: fnNorm.includes(bkNorm)  (기존 방식 호환)
    let matchedBk = null;
    for(const bk of allBks){
      const bkNorm = _normStr(bk.name);
      if(bkNorm.length < 2) continue;
      const inTitle = fnTitleNorm.length >= 2 && fnTitleNorm.includes(bkNorm);
      const inBook  = fnTitleNorm.length >= 2 && bkNorm.includes(fnTitleNorm);
      const inFull  = fnNorm.includes(bkNorm);
      if(inTitle || inBook || inFull){
        if(!matchedBk || bk.name.length > matchedBk.name.length) matchedBk = bk;
      }
    }

    // ── 반+교재 모두 매칭 → 기존 처리
    if(matchedCls && matchedBk){
      const assigned = (matchedBk.classIds||[]).includes(matchedCls.id);
      return {cls:matchedCls, bk:matchedBk, assigned};
    }

    // ── 반 미매칭 → 학생명 기반 교재 매칭
    // 브라켓 안의 한글 이름으로 교재명에 학생이름이 포함된 반 미배정 교재를 탐색
    if(!matchedCls && bracketRaw){
      const stuNames = bracketRaw.split(/[,，·、]+/).map(s=>s.trim()).filter(s=>/[가-힣]/.test(s));

      if(stuNames.length){
        const noClsBks = allBks.filter(b=>!(b.classIds&&b.classIds.length));

        // ★ 1순위: 교재명 안에 학생이름이 포함된 경우
        // 예) "파닉스 몬스터 3(나현)" → 이름 "나현" 포함 → 파일명에서 "파닉스몬스터3" 매칭 확인
        for(const bk of noClsBks){
          const bkNameContainsStu = stuNames.some(sn=>bk.name.includes(sn));
          if(!bkNameContainsStu) continue;

          // 교재명에서 학생이름과 괄호를 제거한 기본명이 파일명에 포함되는지 확인
          let baseName = bk.name;
          stuNames.forEach(sn => { baseName = baseName.replace(new RegExp(sn.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'), ''); });
          baseName = baseName.replace(/[(（）)[\]【】,·]+/g,' ').trim();
          const baseNorm = _normStr(baseName);

          if(baseNorm.length >= 2 && fnNorm.includes(baseNorm)){
            return {cls:null, bk, assigned:true, stuNames};
          }
        }

        // ★ 2순위: 교재명엔 이름 없지만 studentIds에 해당 학생이 등록된 경우
        // (교재명 기반 파일명 매칭도 함께 확인)
        const allStus = typeof StudentDB!=='undefined' ? StudentDB.getAll() : [];
        for(const bk of noClsBks){
          const bkNorm = _normStr(bk.name);
          if(bkNorm.length<2 || !fnNorm.includes(bkNorm)) continue;
          const bkStus = (bk.studentIds||[]).map(id=>allStus.find(s=>s.id===id)).filter(Boolean);
          const stuHit = stuNames.some(qn=>bkStus.some(s=>(s.name||'').includes(qn)||qn.includes(s.name||'')));
          if(stuHit) return {cls:null, bk, assigned:true, stuNames};
        }
      }
    }

    return {cls:matchedCls, bk:matchedBk, assigned:false};
  }

  function openBatchImport(){
    document.getElementById('bl-batch-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'bl-batch-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:300;display:flex;align-items:flex-end;justify-content:center';
    modal.onclick = e=>{ if(e.target===modal) modal.remove(); };

    const sheet = document.createElement('div');
    sheet.style.cssText = 'background:var(--card);border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:600px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 -4px 24px rgba(0,0,0,.18)';

    // 헤더
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px';
    hdr.innerHTML = '<div><div style="font-size:16px;font-weight:800">📂 일괄 xlsx 반영</div><div style="font-size:11px;color:var(--tx3);margin-top:2px">여러 파일을 한번에 드래그하여 반영합니다</div></div>';
    const closeBtn = document.createElement('button');
    closeBtn.textContent='✕'; closeBtn.style.cssText='background:none;border:none;font-size:22px;cursor:pointer;color:var(--tx3)';
    closeBtn.onclick=()=>modal.remove();
    hdr.appendChild(closeBtn);
    sheet.appendChild(hdr);
    // ★ 타임스탬프 임계값 슬라이더
    const _threshRow = document.createElement('div');
    _threshRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surf2);border-radius:8px;border:1px solid var(--bdr);margin-bottom:8px;flex-shrink:0';
    const _threshVal = Number(localStorage.getItem('bl_stamp_threshold')||50);
    _threshRow.innerHTML = '<span style="font-size:11px;font-weight:700;color:var(--tx2);white-space:nowrap">📍 스탬프 기준</span>'
      +'<input type="range" id="bl-stamp-thresh" min="30" max="80" step="5" value="'+_threshVal+'" style="flex:1;accent-color:var(--a)">'
      +'<span id="bl-stamp-thresh-val" style="font-size:12px;font-weight:800;color:var(--a);min-width:34px;text-align:right">'+_threshVal+'%</span>'
      +'<span style="font-size:10px;color:var(--tx3)">(기본50%)</span>';
    _threshRow.querySelector('#bl-stamp-thresh').addEventListener('input', function(){
      document.getElementById('bl-stamp-thresh-val').textContent = this.value+'%';
      localStorage.setItem('bl_stamp_threshold', this.value);
    });
    sheet.appendChild(_threshRow);

    // 드롭존
    const dropZone = document.createElement('div');
    dropZone.id = 'bl-batch-dropzone';
    dropZone.style.cssText = 'border:2px dashed var(--a40);border-radius:12px;padding:24px;text-align:center;cursor:pointer;background:var(--a10);margin-bottom:14px;transition:all .2s';
    dropZone.innerHTML = '<div style="font-size:32px;margin-bottom:8px">📁</div><div style="font-size:13px;font-weight:700;color:var(--a)">여러 xlsx 파일을 여기에 드래그하세요</div><div style="font-size:11px;color:var(--tx3);margin-top:4px">또는 클릭하여 파일 선택</div>';

    const fileInput = document.createElement('input');
    fileInput.type='file'; fileInput.multiple=true; fileInput.accept='.xlsx,.xls';
    fileInput.style.display='none';
    fileInput.onchange = e=>_addBatchFiles([...e.target.files]);
    dropZone.appendChild(fileInput);

    dropZone.onclick = e=>{ if(e.target!==fileInput) fileInput.click(); };
    dropZone.ondragover = e=>{ e.preventDefault(); dropZone.style.background='var(--a20)'; dropZone.style.borderColor='var(--a)'; };
    dropZone.ondragleave = ()=>{ dropZone.style.background='var(--a10)'; dropZone.style.borderColor='var(--a40)'; };
    dropZone.ondrop = e=>{ e.preventDefault(); dropZone.style.background='var(--a10)'; dropZone.style.borderColor='var(--a40)'; _addBatchFiles([...e.dataTransfer.files]); };
    sheet.appendChild(dropZone);

    // 파일 목록
    const listWrap = document.createElement('div');
    listWrap.id = 'bl-batch-list';
    listWrap.style.cssText = 'overflow-y:auto;flex:1;max-height:320px;display:flex;flex-direction:column;gap:8px';
    listWrap.innerHTML = '<div style="text-align:center;color:var(--tx3);font-size:12px;padding:20px">추가된 파일이 없습니다</div>';
    sheet.appendChild(listWrap);

    // 하단 버튼
    const acts = document.createElement('div');
    acts.style.cssText = 'display:flex;gap:8px;margin-top:14px;flex-shrink:0';
    acts.innerHTML = '<button onclick="document.getElementById(\'bl-batch-modal\')?.remove()" style="flex:1;padding:12px;border-radius:10px;background:var(--surf2);border:1px solid var(--bdr2);color:var(--tx2);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font)">취소</button>'
      +'<button id="bl-batch-run-btn" onclick="BooklibApp._runBatchImport()" disabled style="flex:2;padding:12px;border-radius:10px;background:var(--a);color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);box-shadow:0 3px 10px var(--a40);opacity:.4">📊 반영 시작</button>';
    sheet.appendChild(acts);

    modal.appendChild(sheet);
    document.body.appendChild(modal);

    // 내부 파일 목록 관리
    modal._files = [];
  }

  function _addBatchFiles(files){
    const modal = document.getElementById('bl-batch-modal');
    if(!modal) return;
    modal._files = modal._files || [];
    files.filter(f=>/\.(xlsx|xls)$/i.test(f.name)).forEach(f=>{
      if(!modal._files.find(x=>x.name===f.name)) modal._files.push(f);
    });
    _renderBatchList();
  }

  function _renderBatchList(){
    const modal  = document.getElementById('bl-batch-modal');
    const list   = document.getElementById('bl-batch-list');
    const runBtn = document.getElementById('bl-batch-run-btn');
    if(!modal||!list) return;
    const files  = modal._files||[];

    if(!files.length){
      list.innerHTML = '<div style="text-align:center;color:var(--tx3);font-size:12px;padding:20px">추가된 파일이 없습니다</div>';
      if(runBtn){ runBtn.disabled=true; runBtn.style.opacity='.4'; }
      return;
    }

    list.innerHTML = '';
    let hasError = false;

    files.forEach((f,idx)=>{
      const match = _matchFileToTarget(f.name);
      // ★ 학생명 매칭도 유효한 매칭으로 처리
      const ok  = match.bk && (match.cls || match.stuNames);
      const warn= ok && !match.assigned && match.cls; // 반 있을 때만 미배정 경고
      if(!ok) hasError=true;

      const row = document.createElement('div');
      row.style.cssText = `display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:${ok?'var(--surf2)':'rgba(239,68,68,.07)'};border:1px solid ${ok?(warn?'rgba(245,158,11,.4)':'var(--bdr)'):'rgba(239,68,68,.3)'}`;

      const icon = ok?(warn?'⚠️':'✅'):'❌';
      // ★ 반 또는 학생명 표시
      const clsText = match.cls
        ? `<span style="background:var(--a10);color:var(--a);padding:2px 7px;border-radius:5px;font-size:11px;font-weight:700">${match.cls.name}반</span>`
        : match.stuNames
          ? `<span style="background:rgba(99,102,241,.1);color:#6366f1;padding:2px 7px;border-radius:5px;font-size:11px;font-weight:700">🐱 ${match.stuNames.join('·')}</span>`
          : `<span style="color:#dc2626;font-size:11px">반 미매칭</span>`;
      const bkText   = match.bk?`<span style="font-size:11px;color:var(--tx2)">${match.bk.name}</span>`:`<span style="color:#dc2626;font-size:11px">교재 미매칭</span>`;
      const warnText = warn?`<span style="font-size:10px;color:#d97706">⚠ 반에 미배정 교재</span>`:'';

      row.innerHTML = `<span style="font-size:18px;flex-shrink:0">${icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</div>
          <div style="display:flex;gap:6px;align-items:center;margin-top:3px;flex-wrap:wrap">${clsText}${bkText}${warnText}</div>
        </div>
        <button onclick="BooklibApp._removeBatchFile(${idx})" style="background:none;border:none;color:var(--tx3);cursor:pointer;font-size:16px;flex-shrink:0">✕</button>`;
      list.appendChild(row);
    });

    if(runBtn){
      // ★ 학생명 매칭도 실행 가능으로 처리
      const canRun = files.some(f=>{ const m=_matchFileToTarget(f.name); return m.bk&&(m.cls||m.stuNames); });
      runBtn.disabled = !canRun;
      runBtn.style.opacity = canRun?'1':'.4';
      runBtn.style.cursor  = canRun?'pointer':'not-allowed';
    }
  }

  function _removeBatchFile(idx){
    const modal = document.getElementById('bl-batch-modal');
    if(!modal) return;
    modal._files.splice(idx,1);
    _renderBatchList();
  }

  async function _runBatchImport(){
    const modal  = document.getElementById('bl-batch-modal');
    const runBtn = document.getElementById('bl-batch-run-btn');
    if(!modal) return;
    const files = modal._files||[];
    if(!files.length) return;

    if(runBtn){ runBtn.disabled=true; runBtn.textContent='⏳ 처리 중...'; }

    const results = [];
    for(const f of files){
      const match = _matchFileToTarget(f.name);
      // ★ 반 미매칭 + 학생명 매칭인 경우도 처리 (cls:null, stuNames:[...])
      if(!match.bk || (!match.cls && !match.stuNames)){
        results.push({name:f.name, ok:false, msg:'반/교재 매칭 실패 - 건너뜀'});
        continue;
      }
      try{
        // 이전 상태 백업 및 임시 설정
        const prevCls = _st.matrixClassId, prevBk = _st.matrixBookId;
        // ★ cls가 null인 경우 (학생 배정 교재): matrixClassId = null
        _st.matrixClassId = match.cls ? match.cls.id : null;
        _st.matrixBookId  = match.bk.id;
        const _cid = _st.matrixClassId || '__noclass__';
        _checks = BookLibDB.getMatrixChecks(_cid, match.bk.id);
        _stamps = BookLibDB.getStamps(_cid, match.bk.id);

        // ★ 해당 반+교재의 저장된 예외 설정 로드 (신구조: {bookId:{studentName:{...}}})
        const exemptClsId = match.cls ? match.cls.id : null;
        const rawExempts = await BookLibDB.loadClassExempts(exemptClsId)||{};
        const exemptsByBook = _migrateExemptsIfNeeded(rawExempts);
        const bkExempts = exemptsByBook[match.bk.id] || {};
        _csvImportState.exceptions = Object.fromEntries(
          Object.entries(bkExempts).map(([k,v])=>[k,{items:Array.isArray(v)?v:(v.items||[]),useAlias:v.useAlias||false,alias:v.alias||null}])
        );
        _csvImportState.exceptionOn = Object.keys(_csvImportState.exceptions).length>0;

        // xlsx 처리
        const buf  = await f.arrayBuffer();
        const wb   = XLSX.read(buf,{type:'array'});
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(ws,{defval:''});
        const rows = rawRows.map(r=>{
          const n={...r};
          if(!n['제목']&&n['세트 제목']) n['제목']=n['세트 제목'];
          if(!n['완료']&&n['완료여부'])  n['완료']=n['완료여부'];
          return n;
        });

        await _syncChaptersFromXlsx(rows, match.bk.id);
        const res = await _processCsv(rows);

        // ★ 결과 레이블: 반명 또는 학생명
        const targetLabel = match.cls
          ? `${match.cls.name}반`
          : match.stuNames ? `🐱 ${match.stuNames.join('·')}` : '(미배정)';
        results.push({name:f.name, ok:true,
          msg:`✅ ${targetLabel} · ${match.bk.name} — 미수행 ${res.undone}건, 수행 ${res.done}건${res.stampTitle?' | 📍'+res.stampTitle:''}` });

        // 현재 화면 반영 (현재 선택된 반+교재이면 새로고침)
        const matchClsId = match.cls ? match.cls.id : null;
        _st.matrixClassId = prevCls; _st.matrixBookId = prevBk;
        if(prevCls===matchClsId && prevBk===match.bk.id) _refreshBody();
      } catch(err){
        results.push({name:f.name, ok:false, msg:'❌ 오류: '+err.message});
      }
    }

    // 결과 표시
    modal.remove();
    _showBatchResult(results);
  }

  function _showBatchResult(results){
    document.getElementById('bl-batch-result')?.remove();
    const modal = document.createElement('div');
    modal.id = 'bl-batch-result';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:300;display:flex;align-items:flex-end;justify-content:center';
    modal.onclick=e=>{if(e.target===modal)modal.remove();};
    const ok  = results.filter(r=>r.ok).length;
    const err = results.filter(r=>!r.ok).length;
    const rows = results.map(r=>`<div style="padding:10px 12px;border-radius:10px;background:${r.ok?'var(--surf2)':'rgba(239,68,68,.07)'};border:1px solid ${r.ok?'var(--bdr)':'rgba(239,68,68,.3)'};margin-bottom:6px">
      <div style="font-size:11px;font-weight:700">${r.name}</div>
      <div style="font-size:11px;margin-top:4px;color:${r.ok?'var(--green)':'#dc2626'}">${r.msg}</div>
    </div>`).join('');
    modal.innerHTML=`<div style="background:var(--card);border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:600px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 -4px 24px rgba(0,0,0,.18)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div>
          <div style="font-size:16px;font-weight:800">📊 일괄 반영 결과</div>
          <div style="font-size:12px;color:var(--tx3);margin-top:2px">성공 ${ok}건 / 실패 ${err}건</div>
        </div>
        <button onclick="document.getElementById('bl-batch-result').remove()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--tx3)">✕</button>
      </div>
      <div style="overflow-y:auto;flex:1">${rows}</div>
      <button onclick="document.getElementById('bl-batch-result').remove()" style="margin-top:14px;width:100%;padding:12px;border-radius:10px;background:var(--a);color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font)">확인</button>
    </div>`;
    document.body.appendChild(modal);
  }
  // ★★★ 일괄 반영 끝 ★★★

  
  // ══════════════════════════════════════════════════════════════
  // ★ 예외 데이터 구조 마이그레이션 헬퍼
  //   구버전: { studentName: { bookId, items, alias, useAlias } }
  //   신버전: { bookId: { studentName: { items, alias, useAlias } } }
  // ══════════════════════════════════════════════════════════════
  function _migrateExemptsIfNeeded(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const keys = Object.keys(raw);
    if (!keys.length) return {};
    const firstVal = raw[keys[0]];
    // 구버전 감지: 최상위 값에 items 배열이 직접 존재
    if (firstVal && Array.isArray(firstVal.items)) {
      const newFmt = {};
      Object.entries(raw).forEach(([studentName, data]) => {
        const bookId = data.bookId;
        if (!bookId) return;
        if (!newFmt[bookId]) newFmt[bookId] = {};
        newFmt[bookId][studentName] = {
          items:    data.items    || [],
          alias:    data.alias    || null,
          useAlias: data.useAlias || false,
        };
      });
      return newFmt;
    }
    // 신버전은 그대로 반환
    return raw;
  }

  // ★★★ 예외 학생 관리 (반+교재별, DB 저장) ★★★
  async function openExemptMgr(){
    document.getElementById('bl-exempt-mgr')?.remove();
    // 반+교재 선택 필요
    const allCls = typeof DB!=='undefined'?DB.getActiveClasses():[];
    const allBks = BookLibDB.getBooks().filter(b=>!b.archived);

    const modal=document.createElement('div');
    modal.id='bl-exempt-mgr';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:300;display:flex;align-items:flex-end;justify-content:center';
    modal.onclick=e=>{if(e.target===modal)modal.remove();};

    const sheet=document.createElement('div');
    sheet.style.cssText='background:var(--card);border-radius:20px 20px 0 0;padding:20px;width:100%;max-width:580px;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 -4px 24px rgba(0,0,0,.18)';

    // 헤더
    const hdr=document.createElement('div');
    hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-shrink:0';
    hdr.innerHTML='<div><div style="font-size:16px;font-weight:800">⚙️ 예외 학생 관리</div><div style="font-size:11px;color:var(--tx3);margin-top:2px">반+교재별 미수행 예외 학생 및 가명을 DB에 저장합니다</div></div>';
    const xBtn=document.createElement('button'); xBtn.textContent='✕';
    xBtn.style.cssText='background:none;border:none;font-size:22px;cursor:pointer;color:var(--tx3)';
    xBtn.onclick=()=>modal.remove(); hdr.appendChild(xBtn); sheet.appendChild(hdr);

    // 반/교재 선택
    const selRow=document.createElement('div');
    selRow.style.cssText='display:flex;gap:8px;margin-bottom:14px;flex-shrink:0';
    const clsSel=document.createElement('select');
    clsSel.style.cssText='flex:1;padding:8px;border-radius:8px;border:1px solid var(--bdr2);background:var(--card);font-size:13px;font-family:var(--font)';
    clsSel.innerHTML='<option value="">— 반 선택 —</option>'+allCls.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
    const bkSel=document.createElement('select');
    bkSel.style.cssText='flex:1;padding:8px;border-radius:8px;border:1px solid var(--bdr2);background:var(--card);font-size:13px;font-family:var(--font)';
    bkSel.innerHTML='<option value="">— 교재 선택 —</option>';
    clsSel.onchange=()=>{
      const cid=clsSel.value;
      const bks=cid?BookLibDB.getBooksForClass(cid).filter(b=>!b.archived):allBks;
      bkSel.innerHTML='<option value="">— 교재 선택 —</option>'+bks.map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
    };
    bkSel.onchange=()=>_loadExemptMgrList(clsSel.value, bkSel.value, listWrap, modal);
    selRow.appendChild(clsSel); selRow.appendChild(bkSel); sheet.appendChild(selRow);

    // 목록 영역
    const listWrap=document.createElement('div');
    listWrap.style.cssText='overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px';
    listWrap.innerHTML='<div style="text-align:center;color:var(--tx3);font-size:12px;padding:20px">반과 교재를 선택하세요</div>';
    sheet.appendChild(listWrap);

    // 하단 버튼
    const acts=document.createElement('div');
    acts.style.cssText='display:flex;gap:8px;margin-top:14px;flex-shrink:0';
    const addBtn=document.createElement('button');
    addBtn.textContent='＋ 예외 학생 추가'; addBtn.style.cssText='flex:1;padding:10px;border-radius:10px;background:rgba(245,158,11,.1);border:1.5px dashed rgba(245,158,11,.5);color:#92400e;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font)';
    addBtn.onclick=()=>{
      if(!clsSel.value||!bkSel.value){_toast('⚠️ 반과 교재를 먼저 선택하세요','error');return;}
      _addExemptRow(clsSel.value, bkSel.value, listWrap, modal, null);
    };
    acts.appendChild(addBtn);
    const saveBtn=document.createElement('button');
    saveBtn.textContent='💾 저장'; saveBtn.style.cssText='flex:1;padding:10px;border-radius:10px;background:var(--a);color:#fff;border:none;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font)';
    saveBtn.onclick=()=>_saveExemptMgr(clsSel.value, bkSel.value, listWrap, modal);
    acts.appendChild(saveBtn);
    sheet.appendChild(acts);

    // 현재 선택된 반/교재 자동 선택
    if(_st.matrixClassId) clsSel.value=_st.matrixClassId;
    if(_st.matrixClassId){
      const bks=BookLibDB.getBooksForClass(_st.matrixClassId).filter(b=>!b.archived);
      bkSel.innerHTML='<option value="">— 교재 선택 —</option>'+bks.map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
    }
    if(_st.matrixBookId){ bkSel.value=_st.matrixBookId; }
    if(_st.matrixClassId&&_st.matrixBookId){
      _loadExemptMgrList(_st.matrixClassId, _st.matrixBookId, listWrap, modal);
    }

    modal.appendChild(sheet); document.body.appendChild(modal);
  }

  async function _loadExemptMgrList(clsId, bkId, listWrap, modal){
    if(!clsId||!bkId){listWrap.innerHTML='<div style="text-align:center;color:var(--tx3);font-size:12px;padding:20px">반과 교재를 선택하세요</div>';return;}
    listWrap.innerHTML='<div style="text-align:center;color:var(--tx3);font-size:12px;padding:20px">로드 중...</div>';
    const raw=await BookLibDB.loadClassExempts(clsId)||{};
    // ★ 신구조로 마이그레이션 후 bookId 기준으로 필터
    const exemptsByBook=_migrateExemptsIfNeeded(raw);
    const bkExempts=exemptsByBook[bkId]||{};
    listWrap.innerHTML='';
    if(!Object.keys(bkExempts).length){
      listWrap.innerHTML='<div style="text-align:center;color:var(--tx3);font-size:12px;padding:16px">등록된 예외 학생이 없습니다</div>';
    } else {
      Object.entries(bkExempts).forEach(([name,v])=>_addExemptRow(clsId,bkId,listWrap,modal,{name,data:v}));
    }
  }

  function _addExemptRow(clsId, bkId, listWrap, modal, existing){
    const ALL=['암기','리콜','스펠','스피킹','게임','테스트'];
    const name=existing?.name||'';
    const items=(existing?.data?.items)||[];
    const alias=(existing?.data?.alias)||'';
    const useAlias=(existing?.data?.useAlias)||false;

    // ★ 해당 반 학생 목록 (autocomplete용)
    const cls2 = (typeof DB!=='undefined'&&clsId) ? DB.getActiveClasses().find(c=>c.id===clsId) : null;
    const stuNames = cls2 && typeof StudentDB!=='undefined'
      ? StudentDB.getFiltered({classCode:cls2.name,status:'재원'}).map(s=>s.name)
      : [];

    const dlId = 'em-dl-'+Math.random().toString(36).slice(2,8);

    const row=document.createElement('div');
    row.className='em-row';  // ★ 저장 시 정확하게 식별할 클래스
    row.style.cssText='background:var(--surf2);border:1px solid var(--bdr);border-radius:10px;padding:12px;position:relative';
    row.innerHTML=`
      <datalist id="${dlId}">${stuNames.map(n=>`<option value="${_e(n)}">`).join('')}</datalist>
      <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
        <div style="flex:1">
          <input class="em-name" type="text" value="${_e(name)}" placeholder="학생 이름 (예: 홍길동)"
            list="${dlId}"
            style="width:100%;box-sizing:border-box;padding:6px 10px;border:1px solid var(--bdr2);border-radius:7px;font-size:13px;background:var(--card);font-family:var(--font);outline:none">
        </div>
        <button class="em-del-btn" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#dc2626;border-radius:7px;padding:4px 8px;cursor:pointer;flex-shrink:0">🗑</button>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
        <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--tx3);cursor:pointer">
          <input class="em-alias-ck" type="checkbox" ${useAlias?'checked':''} style="accent-color:var(--a)"> xlsx 가명
        </label>
        <input class="em-alias" type="text" value="${_e(alias)}" placeholder="xlsx 가명/영문명" style="display:${useAlias?'block':'none'};flex:1;padding:4px 8px;border:1px solid var(--a40);border-radius:6px;font-size:12px;background:var(--card)">
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:10px;font-weight:800;color:var(--tx3)">면제 항목</span>
        <button class="em-all-btn" style="font-size:10px;font-weight:700;padding:2px 9px;border-radius:6px;background:var(--card);border:1px solid var(--bdr2);color:var(--tx2);cursor:pointer;font-family:var(--font)">전체 선택</button>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${ALL.map(it=>`<label class="em-item-lbl" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:var(--card);border:1.5px solid ${items.includes(it)?'var(--a)':'var(--bdr2)'};border-radius:6px;cursor:pointer;font-size:11px;font-weight:700">
          <input class="em-item" type="checkbox" value="${it}" ${items.includes(it)?'checked':''} style="accent-color:var(--a)" onchange="this.closest('label').style.borderColor=this.checked?'var(--a)':'var(--bdr2)'"> ${it}</label>`).join('')}
      </div>`;

    // 삭제 버튼
    row.querySelector('.em-del-btn').onclick=()=>row.remove();

    // 가명 체크박스 토글
    const aliasCk=row.querySelector('.em-alias-ck');
    const aliasInp=row.querySelector('.em-alias');
    aliasCk.onchange=()=>{ aliasInp.style.display=aliasCk.checked?'block':'none'; };

    // ★ 전체 선택/해제 토글
    const allBtn=row.querySelector('.em-all-btn');
    allBtn.onclick=()=>{
      const cks=[...row.querySelectorAll('.em-item')];
      const allChecked=cks.every(c=>c.checked);
      cks.forEach(c=>{
        c.checked=!allChecked;
        c.closest('label').style.borderColor=c.checked?'var(--a)':'var(--bdr2)';
      });
      allBtn.textContent=allChecked?'전체 선택':'전체 해제';
    };
    // 초기 버튼 텍스트
    const initChecked=[...row.querySelectorAll('.em-item')].every(c=>c.checked);
    allBtn.textContent=initChecked?'전체 해제':'전체 선택';

    listWrap.appendChild(row);
  }

  async function _saveExemptMgr(clsId, bkId, listWrap, modal){
    if(!clsId||!bkId){_toast('⚠️ 반과 교재를 선택하세요','error');return;}
    // ★ div[style*=position] → .em-row 로 변경: 내부 래퍼 div 오중복 매칭 방지
    const rows=[...listWrap.querySelectorAll('.em-row')];
    const raw=await BookLibDB.loadClassExempts(clsId)||{};
    // ★ 신구조로 마이그레이션 후 해당 bookId 항목만 교체 (다른 교재 독립 유지)
    const existing=_migrateExemptsIfNeeded(raw);
    existing[bkId]={};
    rows.forEach(row=>{
      const nm=row.querySelector('.em-name')?.value?.trim();
      if(!nm) return;
      const items=[...row.querySelectorAll('.em-item:checked')].map(c=>c.value);
      const useAlias=row.querySelector('.em-alias-ck')?.checked||false;
      const alias=row.querySelector('.em-alias')?.value?.trim()||'';
      existing[bkId][nm]={items, useAlias, alias:alias||null};
    });
    // 빈 교재 키 정리
    if(!Object.keys(existing[bkId]).length) delete existing[bkId];
    await BookLibDB.saveClassExempts(clsId, existing);
    _toast('✅ 예외 설정 저장 완료','success');
    modal.remove();
  }
  // ★★★ 예외 학생 관리 끝 ★★★

  
  // ★ 예외 학생 전체 목록 조회 — 반별 슬라이더 UI
  async function openExemptList(){
    document.getElementById('bl-exempt-list')?.remove();
    const modal=document.createElement('div');
    modal.id='bl-exempt-list';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:300;display:flex;align-items:flex-end;justify-content:center';
    modal.onclick=e=>{if(e.target===modal)modal.remove();};

    const sheet=document.createElement('div');
    sheet.style.cssText='background:var(--card);border-radius:20px 20px 0 0;width:100%;max-width:640px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 -4px 24px rgba(0,0,0,.18);overflow:hidden';

    // ─── 헤더 ───
    const hdr=document.createElement('div');
    hdr.style.cssText='padding:18px 20px 10px;flex-shrink:0';
    hdr.innerHTML=`
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div>
          <div style="font-size:16px;font-weight:800">📋 예외 학생 전체 목록</div>
          <div style="font-size:11px;color:var(--tx3);margin-top:2px">등록된 예외 학생을 반별로 확인합니다</div>
        </div>
        <button id="bl-el-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--tx3);padding:4px">✕</button>
      </div>`;
    sheet.appendChild(hdr);
    modal.appendChild(sheet);
    document.body.appendChild(modal);
    document.getElementById('bl-el-close').onclick=()=>modal.remove();

    // ─── 로딩 영역 ───
    const body=document.createElement('div');
    body.style.cssText='flex:1;overflow:hidden;display:flex;flex-direction:column';
    body.innerHTML='<div style="text-align:center;color:var(--tx3);font-size:12px;padding:40px">로드 중...</div>';
    sheet.appendChild(body);

    // 데이터 로드
    const allCls=(typeof DB!=='undefined'?DB.getActiveClasses():[]);
    const allBks=BookLibDB.getBooks().filter(b=>!b.archived);

    // classId → { bookId → { studentName → data } }
    const byClass={};
    for(const cls of allCls){
      const raw=await BookLibDB.loadClassExempts(cls.id)||{};
      const exemptsByBook=_migrateExemptsIfNeeded(raw);
      // 이 반에 등록된 교재만 포함
      const clsBks=allBks.filter(b=>(b.classIds||[]).includes(cls.id));
      let hasAny=false;
      const bkMap={};
      clsBks.forEach(bk=>{
        const stuMap=exemptsByBook[bk.id]||{};
        if(Object.keys(stuMap).length){ bkMap[bk.id]={bk,stuMap}; hasAny=true; }
      });
      if(hasAny) byClass[cls.id]={cls, bkMap};
    }

    const classEntries=Object.values(byClass);

    if(!classEntries.length){
      body.innerHTML='<div style="text-align:center;color:var(--tx3);font-size:13px;padding:40px">등록된 예외 학생이 없습니다<br><span style="font-size:11px">⚙️ 예외 설정 버튼으로 등록하세요</span></div>';
      return;
    }

    // ─── 퀵점프 버튼 ───
    const quickBar=document.createElement('div');
    quickBar.style.cssText='display:flex;gap:6px;padding:4px 20px 10px;flex-shrink:0;overflow-x:auto;scrollbar-width:none';
    quickBar.innerHTML='<span style="font-size:10px;font-weight:800;color:var(--tx3);letter-spacing:.8px;white-space:nowrap;align-self:center">QUICK →</span>';
    hdr.appendChild(quickBar);

    // ─── 슬라이더 래퍼 ───
    const sliderOuter=document.createElement('div');
    sliderOuter.style.cssText='flex:1;overflow:hidden;position:relative;display:flex;flex-direction:column';
    body.innerHTML='';
    body.appendChild(sliderOuter);

    // ─── 슬라이더 내비 바 ───
    const navBar=document.createElement('div');
    navBar.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:6px 16px;background:var(--surf2);border-bottom:1px solid var(--bdr);flex-shrink:0';
    sliderOuter.appendChild(navBar);

    // ─── 슬라이드 컨테이너 ───
    const slideWrap=document.createElement('div');
    slideWrap.style.cssText='flex:1;overflow:hidden;position:relative';
    sliderOuter.appendChild(slideWrap);

    let _curIdx=0;

    // 단일 슬라이드 렌더
    function _renderSlide(idx){
      _curIdx=idx;
      const entry=classEntries[idx];
      const {cls, bkMap}=entry;

      // 퀵버튼 활성 업데이트
      quickBar.querySelectorAll('.bl-el-qbtn').forEach((b,i)=>{
        b.style.background=i===idx?'var(--a)':'var(--card2)';
        b.style.color=i===idx?'#fff':'var(--tx2)';
        b.style.borderColor=i===idx?'var(--a)':'var(--bdr2)';
      });

      // 내비 업데이트
      navBar.innerHTML='';
      const prevBtn=document.createElement('button');
      prevBtn.innerHTML='‹ 이전';
      prevBtn.style.cssText='padding:6px 14px;border-radius:8px;background:var(--card);border:1.5px solid var(--bdr2);color:var(--tx2);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .12s';
      prevBtn.disabled=idx===0;
      prevBtn.style.opacity=idx===0?'.35':'1';
      prevBtn.onclick=()=>{ if(idx>0) _renderSlide(idx-1); };
      navBar.appendChild(prevBtn);

      const counterEl=document.createElement('div');
      counterEl.style.cssText='text-align:center;flex:1';
      counterEl.innerHTML=`<span style="font-size:14px;font-weight:800;color:var(--tx)">${_e(cls.name)}반</span><span style="font-size:11px;color:var(--tx3);margin-left:8px">${idx+1} / ${classEntries.length}</span>`;
      navBar.appendChild(counterEl);

      const nextBtn=document.createElement('button');
      nextBtn.innerHTML='다음 ›';
      nextBtn.style.cssText='padding:6px 14px;border-radius:8px;background:var(--card);border:1.5px solid var(--bdr2);color:var(--tx2);font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .12s';
      nextBtn.disabled=idx===classEntries.length-1;
      nextBtn.style.opacity=idx===classEntries.length-1?'.35':'1';
      nextBtn.onclick=()=>{ if(idx<classEntries.length-1) _renderSlide(idx+1); };
      navBar.appendChild(nextBtn);

      // 슬라이드 내용
      slideWrap.innerHTML='';
      const scroll=document.createElement('div');
      scroll.style.cssText='height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 16px 80px';

      const bkEntries=Object.values(bkMap);
      if(!bkEntries.length){
        scroll.innerHTML='<div style="text-align:center;color:var(--tx3);font-size:13px;padding:40px">등록된 예외 항목 없음</div>';
      } else {
        bkEntries.forEach(({bk, stuMap})=>{
          const bkSec=document.createElement('div');
          bkSec.style.cssText='background:var(--surf2);border:1px solid var(--bdr);border-radius:14px;padding:14px;margin-bottom:14px';

          // 교재 헤더
          const bkHdr=document.createElement('div');
          bkHdr.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:10px';
          bkHdr.innerHTML=`
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:16px">📖</span>
              <div>
                <div style="font-size:13px;font-weight:800;color:var(--tx)">${_e(bk.name)}</div>
                <div style="font-size:10px;color:var(--tx3);margin-top:1px">${Object.keys(stuMap).length}명 등록</div>
              </div>
            </div>
            <button data-cls="${cls.id}" data-bk="${bk.id}"
              style="font-size:11px;padding:5px 11px;border-radius:8px;background:var(--a10);border:1px solid var(--a40);color:var(--a);cursor:pointer;font-weight:700;font-family:var(--font)"
              onclick="BooklibApp.openExemptMgr_cls('${cls.id}','${bk.id}')">✏️ 수정</button>`;
          bkSec.appendChild(bkHdr);

          // 학생 목록
          Object.entries(stuMap).forEach(([studentName, data])=>{
            const stuRow=document.createElement('div');
            stuRow.setAttribute('data-exempt-row', `${cls.id}_${bk.id}_${studentName}`);
            stuRow.style.cssText='display:flex;align-items:flex-start;gap:8px;padding:9px 10px;background:var(--card);border-radius:9px;margin-bottom:6px;border:1px solid var(--bdr)';

            const itemList=(data.items||[]);
            const aliasHtml=data.alias?`<span style="font-size:9px;color:#d97706;margin-left:4px;background:rgba(217,119,6,.1);padding:1px 5px;border-radius:4px">가명: ${_e(data.alias)}</span>`:'';
            const itemsHtml=itemList.length
              ? itemList.map(it=>`<span style="display:inline-flex;padding:2px 7px;background:rgba(234,88,12,.1);border:1px solid rgba(234,88,12,.25);border-radius:5px;font-size:10px;font-weight:700;color:#ea580c">${_e(it)}</span>`).join('')
              : '<span style="font-size:10px;color:var(--tx3)">면제 항목 없음</span>';

            stuRow.innerHTML=`
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:4px;margin-bottom:5px">
                  <span style="font-size:13px;font-weight:800;color:var(--tx)">${_e(studentName)}</span>${aliasHtml}
                </div>
                <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
                  <span style="font-size:10px;font-weight:700;color:var(--tx3);margin-right:2px">면제:</span>
                  ${itemsHtml}
                </div>
              </div>
              <button onclick="BooklibApp._deleteExemptItem('${cls.id}','${bk.id}','${studentName.replace(/'/g,"\\'")}')"
                style="flex-shrink:0;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#dc2626;border-radius:7px;padding:5px 10px;cursor:pointer;font-size:12px;font-weight:700">🗑</button>`;
            bkSec.appendChild(stuRow);
          });



          scroll.appendChild(bkSec);
        });
      }
      slideWrap.appendChild(scroll);
    }

    // 퀵버튼 생성
    classEntries.forEach((entry,i)=>{
      const qb=document.createElement('button');
      qb.className='bl-el-qbtn';
      qb.textContent=entry.cls.name;
      qb.style.cssText='flex-shrink:0;padding:5px 13px;border-radius:16px;font-size:12px;font-weight:700;cursor:pointer;border:1.5px solid var(--bdr2);background:var(--card2);color:var(--tx2);font-family:var(--font);transition:all .15s;white-space:nowrap';
      qb.onclick=()=>_renderSlide(i);
      quickBar.appendChild(qb);
    });

    // 초기 렌더 - 현재 학습현황에서 선택된 반으로 자동 이동
    const initIdx = _st.matrixClassId
      ? Math.max(0, classEntries.findIndex(e=>e.cls.id===_st.matrixClassId))
      : 0;
    _renderSlide(initIdx);
  }

  async function _deleteExemptItem(clsId, bkId, studentName, rowEl){
    if(!confirm('"'+studentName+'" 예외 설정을 삭제하시겠습니까?')) return;
    const raw=await BookLibDB.loadClassExempts(clsId)||{};
    const existing=_migrateExemptsIfNeeded(raw);
    if(existing[bkId]){
      delete existing[bkId][studentName];
      if(!Object.keys(existing[bkId]).length) delete existing[bkId];
    }
    await BookLibDB.saveClassExempts(clsId, existing);
    // 행 제거: data-exempt-row 속성이 있는 조상 또는 직접 제거
    const targetRow=document.querySelector(`[data-exempt-row="${clsId}_${bkId}_${studentName}"]`);
    (targetRow||rowEl)?.remove();
    _toast('🗑 삭제 완료','success');
  }

  function openExemptMgr_cls(clsId, bkId){
    document.getElementById('bl-exempt-list')?.remove();
    document.getElementById('bl-exempt-mgr')?.remove();
    openExemptMgr();
    // 선택값 자동 설정
    setTimeout(()=>{
      const clsSel=document.querySelector('#bl-exempt-mgr select:first-of-type');
      if(clsSel&&clsId){ clsSel.value=clsId; clsSel.dispatchEvent(new Event('change')); }
      if(bkId) setTimeout(()=>{
        const bkSel=document.querySelector('#bl-exempt-mgr select:last-of-type');
        if(bkSel){ bkSel.value=bkId; bkSel.dispatchEvent(new Event('change')); }
      },100);
    },50);
  }

    /* ══ PUBLIC ══ */
  return{
    init,render,switchTab,
    _addExcRow,
    addBook,deleteBook,_renameBook,_excAutoComplete,
    openEditor,closeEditor,saveEditor,
    _pasteChapters,_delCh,_clearChs,_toggleAssign,_assignStudentBtn,_refreshStudentChips,_removeStudent,
    _onRdToggle,_onRvCheck,_onRvName,_addReview,_delReview,
    _onClsChange,_onBkChange,
    _toggleStamp,_toggleCheck,_batchToggle,
    _saveSubTasks,_closeSubPopup,
    _chWider,_chNarrow,_mtblFontSize,_applyFontSize,_toggleMemo,_saveMemo,_restoreMemoState,_toggleCollapse,
    openShare,closeShare,_copyText,_getShareText,
    openClassReport,closeReport,_getReportText,_webShare,_printReport,
    importCsv, openCsvImportModal, _confirmCsvImport, _syncChaptersFromXlsx,
    openBatchImport, _addBatchFiles, _removeBatchFile, _runBatchImport,
    _setLibView, _renderBooksByClass, _renderClsFilterBtns, _rerenderBookGroups,
    openExemptList, _deleteExemptItem, openExemptMgr_cls,
    openExemptMgr,
    _saveExempts, _loadExempts,
    openPostFilter, _updatePfBtn, _loadPf, _savePf, _clearPf,
    _archiveBook,_unarchiveBook,_copyBook, _openEvalTab,
    _toggleMultiSelect,_cancelMultiSelect,_multiArchive,_onMultiCkChange,
    _openRegModal, _modalAddBook, _openArchivedPopup, _inlineRenameBook, _inlineRenameInPopup, _toggleRegArea, _toggleArchivedSection, _deleteExcRow,
    _renderRegStuChips, _regToggleCls, _renderClsBulkList,
    _multiCopy, _multiDelete, _multiMoveUp, _multiMoveDown, _moveBook,
    _renameBook, _excAutoComplete,
  };
})();
if(typeof window!=='undefined') window.BooklibApp=BooklibApp;
