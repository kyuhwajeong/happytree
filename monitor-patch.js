/**
 * monitor-patch.js — v4.0 (전 메뉴 완전 추적)
 *
 * ■ v4.0 추가 항목
 *   [진도] sendSms(SMS 전송), toggleView(그리드/리스트), openCal/calToday(달력),
 *          진도 입력 시 반·교재·요일·값 정확히 추출
 *   [교재] switchTab(탭 전환), _onClsChange/_onBkChange(반·교재 선택),
 *          openShare/_copyText/_webShare/_printShare(공유),
 *          openClassReport/_printReport(리포트),
 *          addBook/deleteBook/saveEditor(교재 추가·삭제·편집 저장),
 *          importCsv/_runBatchImport(xlsx 일괄 반영),
 *          _toggleMemo/_saveMemo(메모), _archiveBook/_copyBook(완결·복사),
 *          openExemptMgr/_saveExempts(예외 설정)
 *   [성적] 기존 v3.0 전체 유지
 *
 * ■ 로드 순서 (index.html)
 *   app.js → monitor-db.js → monitor-app.js → monitor-patch.js
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════
   * 공통 유틸
   * ═══════════════════════════════════════════════════════ */
  function _log(menu, detail, extra) {
    try {
      if (typeof MonitorDB !== 'undefined' && MonitorDB.hasSession())
        MonitorDB.logAction(menu, detail, extra);
    } catch(e) {}
  }

  function _menuLog(menu, detail) {
    try {
      if (typeof MonitorDB !== 'undefined' && MonitorDB.hasSession())
        MonitorDB.updateMenu(menu, detail);
    } catch(e) {}
  }

  function _wrap(obj, name, before, after) {
    if (!obj || typeof obj[name] !== 'function') return;
    const orig = obj[name];
    obj[name] = async function (...args) {
      try { if (before) await before(...args); } catch(e) {}
      const result = await orig.apply(this, args);
      try { if (after) await after(result, ...args); } catch(e) {}
      return result;
    };
  }

  /* 현재 선택된 반 이름 (진도 칩바에서) */
  function _activeClsName() {
    return document.querySelector('.chip-row .chip-btn.on, .chip-row button.on')
      ?.textContent?.trim() || '';
  }

  /* 성적 메뉴 반/교재 DOM 조회 */
  function _grClsName() {
    const sel = document.getElementById('gr-csel');
    return sel ? (sel.options[sel.selectedIndex]?.text?.trim() || '') : '';
  }
  function _grBkName() {
    const sel = document.getElementById('gr-bsel');
    return sel ? (sel.options[sel.selectedIndex]?.text?.trim() || '') : '';
  }

  /* 교재 메뉴 반/교재 DOM 조회 */
  function _blClsName() {
    const sel = document.getElementById('bl-csel');
    return sel ? (sel.options[sel.selectedIndex]?.text?.trim() || '') : '';
  }
  function _blBkName() {
    const sel = document.getElementById('bl-bsel');
    return sel ? (sel.options[sel.selectedIndex]?.text?.trim() || '') : '';
  }

  /* StudentDB 학생명 */
  function _stuName(stuId) {
    try {
      return (typeof StudentDB !== 'undefined' ? StudentDB.getStudents() : [])
        .find(s => s.id === stuId)?.name || stuId || '';
    } catch { return stuId || ''; }
  }

  /* BookLibDB 교재명 — 다중 폴백으로 최대한 이름 조회
   *
   * 조회 우선순위:
   *   1. DOM select 옵션 (bl-bsel / gr-bsel) — 가장 신뢰성 높음
   *   2. BookLibDB.getBook(id)   — API 메서드명이 맞으면 성공
   *   3. BookLibDB.getBooks() / BookLibDB.books   — 배열/객체 탐색
   *   4. 폴백: "(bkId)" 형식으로 표시 — ID임을 명시
   *
   * 표시 형식: "교재명(id)" 또는 "(id)"
   */
  function _bkName(bkId) {
    if (!bkId) return '';
    let name = '';

    try {
      /* 1순위: DOM select 옵션에서 value === bkId 인 option의 text */
      for (const selId of ['bl-bsel','gr-bsel']) {
        const sel = document.getElementById(selId);
        if (!sel) continue;
        const opt = [...sel.options].find(o => o.value === bkId);
        if (opt?.text?.trim()) { name = opt.text.trim(); break; }
      }
    } catch {}

    if (!name) {
      try {
        /* 2순위: BookLibDB.getBook(id) */
        const book = typeof BookLibDB !== 'undefined'
          ? (BookLibDB.getBook?.(bkId) ?? BookLibDB.getBookById?.(bkId))
          : null;
        if (book?.name) name = book.name;
      } catch {}
    }

    if (!name) {
      try {
        /* 3순위: BookLibDB.getBooks() 배열 또는 BookLibDB.books 객체 탐색 */
        if (typeof BookLibDB !== 'undefined') {
          const books = BookLibDB.getBooks?.() ?? BookLibDB.getAllBooks?.() ?? BookLibDB.books;
          const arr   = Array.isArray(books) ? books : (books ? Object.values(books) : []);
          const found = arr.find(b => b?.id === bkId || b?.key === bkId);
          if (found?.name) name = found.name;
        }
      } catch {}
    }

    /* 표시 형식: 이름이 있으면 "교재명(id)", 없으면 "(id)" */
    return name ? `${name}(${bkId})` : `(${bkId})`;
  }

  /* 챕터명 DOM 조회 */
  function _chName(chId) {
    try {
      const el = document.querySelector(`[data-ch="${chId}"] .bl-ch-t,[data-chid="${chId}"]`);
      return el?.textContent?.trim()?.slice(0, 30) || chId || '';
    } catch { return chId || ''; }
  }

  /* ═══════════════════════════════════════════════════════
   * STEP 1: App.doLogin 즉시(동기) 패치 — 히든PW + 세션 시작
   * ═══════════════════════════════════════════════════════ */
  (function _patchLoginNow() {
    if (typeof App === 'undefined') {
      console.warn('[MonitorPatch] App 없음 — 패치 실패');
      return;
    }
    const _orig = App.doLogin;
    App.doLogin = async function () {
      const id = (document.getElementById('li-id')?.value || '').trim();
      const pw =  document.getElementById('li-pw')?.value || '';

      /* 히든 모니터링 모드 */
      if (id === 'admin' && typeof MonitorDB !== 'undefined' && MonitorDB.isMonitorPassword(pw)) {
        document.getElementById('login-gate')?.classList.add('hidden');
        const pwEl = document.getElementById('li-pw');
        if (pwEl) pwEl.value = '';
        localStorage.removeItem('hk_rem_pw');
        if (typeof MonitorApp !== 'undefined') MonitorApp.show();
        return;
      }

      await _orig.apply(this, arguments);

      /* 로그인 성공 → 세션 시작 */
      if (document.getElementById('login-gate')?.classList.contains('hidden'))
        await _startSession('doLogin');
    };
    console.log('[MonitorPatch] ✅ STEP1 doLogin 패치');
  })();

  /* ═══════════════════════════════════════════════════════
   * STEP 2: DOMContentLoaded + 3초 후 전체 패치
   * ═══════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', () => setTimeout(_applyAll, 3000));

  /* 세션 시작 헬퍼 */
  async function _startSession(reason) {
    try {
      if (!DB?.isLoggedIn() || MonitorDB?.hasSession()) return;
      const sess = DB.getSession();
      if (!sess) return;
      await MonitorDB.startSession(sess.username, sess.role);
      const page = document.querySelector('.bni.on')?.dataset?.pg
                || document.querySelector('.page.on')?.id?.replace('page-','')
                || 'operate';
      MonitorDB.logAction(page, reason === 'resume' ? '세션 복구 (기존 로그인)' : '로그인');
      MonitorDB.updateMenu(page, '');
      console.log(`[MonitorPatch] 세션 시작: ${sess.username} (${reason})`);
    } catch(e) { console.warn('[MonitorPatch] 세션 오류:', e); }
  }

  /* ═══════════════════════════════════════════════════════
   * 전체 패치 적용
   * ═══════════════════════════════════════════════════════ */
  function _applyAll() {
    if (typeof App === 'undefined') return;

    /* 이미 로그인 상태 자동 감지 (admin 포함) */
    _startSession('resume');

    /* ╔══════════════════════════════════════════════════╗
     * ║  App — 공통 / 진도 메뉴                          ║
     * ╚══════════════════════════════════════════════════╝ */

    _wrap(App, 'logout', async () => {
      _log('logout', '로그아웃');
      if (MonitorDB?.hasSession()) await MonitorDB.endSession();
    });

    /* 메뉴 이동 */
    _wrap(App, 'go', null, async (_, page) => { _menuLog(page, ''); });

    /* 보기 전환 (그리드 ↔ 리스트) */
    _wrap(App, 'toggleView', async () => {
      _log('operate', '보기 전환 (그리드/리스트)');
    });

    /* 달력 열기 */
    _wrap(App, 'openCal', async () => { _log('operate', '달력 열기'); });
    _wrap(App, 'calToday', async () => { _log('operate', '달력 → 오늘로 이동'); });

    /* 주간 이동 */
    _wrap(App, 'prevWeek', async () => {
      const wk = document.getElementById('op-wknum')?.textContent || '';
      _log('operate', `이전 주로 이동`, wk);
    });
    _wrap(App, 'nextWeek', async () => {
      const wk = document.getElementById('op-wknum')?.textContent || '';
      _log('operate', `다음 주로 이동`, wk);
    });

    /* 공유 URL 복사 */
    _wrap(App, 'shareUrl', async () => {
      const cls = _activeClsName();
      _log('operate', `공유 URL 복사: ${cls}`);
    });

    /* 현재 반 공유 */
    if (typeof App.shareCurrentClass === 'function')
      _wrap(App, 'shareCurrentClass', async () => {
        _log('operate', `현재 반 공유: ${_activeClsName()}`);
      });

    /* SMS 전송 ★ 새로 추가 */
    _wrap(App, 'sendSms', async () => {
      const cls = _activeClsName();
      _log('operate', `📱 SMS 전송: ${cls}`);
    });

    /* xlsx 가져오기 */
    _wrap(App, 'handleImport', async (input) => {
      const f = input?.files?.[0];
      if (f) _log('operate', `xlsx 가져오기: ${f.name}`, `${input.files.length}개`);
    });

    /* 관리 탭 */
    _wrap(App, 'mgTab', async (tab) => {
      const lbl = { classes:'반 관리', accounts:'계정 관리', theme:'테마 설정', io:'백업/복원', share:'공유' };
      _log('manage', `관리 탭: ${lbl[tab] || tab}`);
    });

    _wrap(App, 'saveClass', async () => {
      const name = document.getElementById('f-cname')?.value?.trim() || '';
      const days = [...document.querySelectorAll('#modal-cls .day-ck input:checked')]
        .map(c => c.value).join(',');
      _log('manage', `반 저장: ${name}`, `요일: ${days}`);
    });

    _wrap(App, 'delClass', async (id) => {
      _log('manage', `반 삭제: ${DB?.getClassById?.(id)?.name || id}`);
    });

    _wrap(App, 'saveAccount', async () => {
      const u    = document.getElementById('f-aid')?.value?.trim() || '';
      const role = document.getElementById('f-arole')?.value || '';
      const lbl  = { admin:'관리자', manager:'매니저', operator:'운용자', teacher:'강사' };
      _log('manage', `계정 저장: ${u}`, `역할: ${lbl[role] || role}`);
    });

    _wrap(App, 'delAcc', async (id, username) => {
      _log('manage', `계정 삭제: ${username || id}`);
    });

    _wrap(App, 'delAccBulk', async () => {
      const n = document.querySelectorAll('.acc-ck:checked').length;
      _log('manage', `계정 일괄 삭제 ${n}개`);
    });

    _wrap(App, 'doCopyBooks', async () => {
      const sel = document.getElementById('f-copy-from');
      _log('manage', `교재 복사: ${sel?.options[sel.selectedIndex]?.text || ''}`);
    });

    /* ╔══════════════════════════════════════════════════╗
     * ║  BooklibApp — 교재 메뉴 전체 추적               ║
     * ╚══════════════════════════════════════════════════╝ */
    if (typeof BooklibApp !== 'undefined') {

      /* 탭 전환 ★ 새로 추가 */
      _wrap(BooklibApp, 'switchTab', async (tab) => {
        const lbl = { library:'📚 교재 관리', matrix:'📊 학습 현황' };
        _log('booklib', `탭 전환: ${lbl[tab] || tab}`);
      });

      /* 반 선택 ★ 새로 추가 */
      _wrap(BooklibApp, '_onClsChange', async (clsId) => {
        const name = DB?.getActiveClasses?.().find(c => c.id === clsId)?.name || clsId || '(해제)';
        _log('booklib', `반 선택: ${name}`);
        _menuLog('booklib', `반: ${name}`);
      });

      /* 교재 선택 ★ 새로 추가 */
      _wrap(BooklibApp, '_onBkChange', async (bkId) => {
        const cls = _blClsName();
        const bk  = _bkName(bkId) || '(해제)';
        _log('booklib', `교재 선택: ${bk}`, `반: ${cls}`);
        _menuLog('booklib', `${cls} / ${bk}`);
      });

      /* 챕터 체크 토글 */
      _wrap(BooklibApp, '_toggleCheck', async (clsId, bkId, stuId, chId) => {
        _log('booklib',
          `챕터 체크 토글: ${_stuName(stuId)} / ${_chName(chId)}`,
          `교재: ${_bkName(bkId)}`);
      });

      /* 진도 스탬프 */
      _wrap(BooklibApp, '_toggleStamp', async (chId) => {
        _log('booklib', `진도 스탬프 토글: ${_chName(chId)}`, `교재: ${_blBkName()}`);
      });

      /* 전체 토글 */
      _wrap(BooklibApp, '_batchToggle', async (clsId, bkId, stuId) => {
        _log('booklib', `전체 토글: ${_stuName(stuId)}`, `교재: ${_bkName(bkId)}`);
      });

      /* 교재 추가 ★ 새로 추가 */
      _wrap(BooklibApp, 'addBook', async () => {
        _log('booklib', '교재 추가');
      });

      /* 교재 삭제 ★ 새로 추가 */
      _wrap(BooklibApp, 'deleteBook', async (bkId) => {
        _log('booklib', `교재 삭제: ${_bkName(bkId)}`);
      });

      /* 교재 편집 저장 (챕터 추가/수정) ★ 새로 추가 */
      _wrap(BooklibApp, 'saveEditor', async () => {
        const bk = document.getElementById('bl-edit-bname')?.value?.trim()
                || document.querySelector('#bl-editor-sh .sh-title')?.textContent?.replace('교재 편집: ','')?.trim()
                || _blBkName();
        _log('booklib', `교재 편집 저장: ${bk}`);
      });

      /* 교재 완결 처리 ★ 새로 추가 */
      _wrap(BooklibApp, '_archiveBook', async (bkId) => {
        _log('booklib', `교재 완결 처리: ${_bkName(bkId)}`);
      });

      /* 교재 복사 ★ 새로 추가 */
      _wrap(BooklibApp, '_copyBook', async (bkId) => {
        _log('booklib', `교재 복사: ${_bkName(bkId)}`);
      });

      /* 공유 열기 ★ 새로 추가 */
      _wrap(BooklibApp, 'openShare', async (bkId) => {
        _log('booklib', `공유 열기: ${_bkName(bkId) || _blBkName()}`);
      });

      /* 공유 텍스트 복사 ★ 새로 추가 */
      _wrap(BooklibApp, '_copyText', async () => {
        _log('booklib', `공유 텍스트 복사`, `반: ${_blClsName()} / ${_blBkName()}`);
      });

      /* 웹 공유 ★ 새로 추가 */
      _wrap(BooklibApp, '_webShare', async () => {
        _log('booklib', `웹 공유`, `${_blClsName()} / ${_blBkName()}`);
      });

      /* 공유 인쇄 ★ 새로 추가 */
      _wrap(BooklibApp, '_printShare', async () => {
        _log('booklib', `공유 인쇄`, `${_blClsName()} / ${_blBkName()}`);
      });

      /* 반별 리포트 열기 ★ 새로 추가 */
      _wrap(BooklibApp, 'openClassReport', async () => {
        _log('booklib', `반별 리포트 열기`, `${_blClsName()} / ${_blBkName()}`);
      });

      /* 리포트 인쇄 ★ 새로 추가 */
      _wrap(BooklibApp, '_printReport', async () => {
        _log('booklib', `리포트 인쇄`, `${_blClsName()} / ${_blBkName()}`);
      });

      /* CSV 단건 가져오기 ★ 새로 추가 */
      _wrap(BooklibApp, 'importCsv', async () => {
        _log('booklib', `xlsx 단건 가져오기`, `${_blClsName()} / ${_blBkName()}`);
      });

      /* xlsx 일괄 반영 실행 ★ 새로 추가 */
      _wrap(BooklibApp, '_runBatchImport', async () => {
        const n = document.querySelectorAll('.bl-bf-row, .batch-file-row').length;
        _log('booklib', `xlsx 일괄 반영 실행`, `${n}개 파일`);
      });

      /* 메모 토글 ★ 새로 추가 */
      _wrap(BooklibApp, '_toggleMemo', async (clsId, bkId) => {
        _log('booklib', `메모 열기/닫기`, `${_blClsName()} / ${_bkName(bkId)}`);
      });

      /* 메모 저장 ★ 새로 추가 */
      const _origSaveMemo = BooklibApp._saveMemo;
      if (typeof _origSaveMemo === 'function') {
        let _memoTimer;
        BooklibApp._saveMemo = function (clsId, bkId, val) {
          clearTimeout(_memoTimer);
          _memoTimer = setTimeout(() => {
            _log('booklib', `메모 저장: ${_bkName(bkId)}`, (val||'').slice(0, 40));
          }, 1500);
          return _origSaveMemo.apply(this, arguments);
        };
      }

      /* 예외 설정 저장 ★ 새로 추가 */
      _wrap(BooklibApp, '_saveExempts', async () => {
        _log('booklib', `예외 설정 저장`, `${_blClsName()} / ${_blBkName()}`);
      });

      /* 예외 설정 관리 열기 ★ 새로 추가 */
      _wrap(BooklibApp, 'openExemptMgr', async () => {
        _log('booklib', '예외 설정 관리 열기');
      });
    }

    /* ╔══════════════════════════════════════════════════╗
     * ║  GradeApp — 성적 메뉴 세부 추적 (v3.0 전체 유지) ║
     * ╚══════════════════════════════════════════════════╝ */
    if (typeof GradeApp !== 'undefined') {

      _wrap(GradeApp, '_onCls', async (clsId) => {
        const name = DB?.getActiveClasses?.().find(c=>c.id===clsId)?.name || '(해제)';
        _log('grade', `반 선택: ${name}`);
        _menuLog('grade', `반: ${name}`);
      });

      _wrap(GradeApp, '_onBk', async (bkId) => {
        const bk = _grBkName() || _bkName(bkId) || '(해제)';
        _log('grade', `교재 선택: ${bk}`, `반: ${_grClsName()}`);
        _menuLog('grade', `${_grClsName()} / ${bk}`);
      });

      _wrap(GradeApp, '_onStu', async (sid) => {
        _log('grade', `학생 선택: ${_stuName(sid)}`, `${_grClsName()} / ${_grBkName()}`);
      });

      _wrap(GradeApp, '_setView', async (mode) => {
        const lbl = { excel:'🔲 엑셀뷰', card:'🐱 카드뷰', report:'📄 리포트뷰' };
        _log('grade', `뷰 전환: ${lbl[mode] || mode}`);
      });

      /* 단어 점수 입력 — debounce 1.5초 */
      const _origW = GradeApp._excelWordInput;
      if (typeof _origW === 'function') {
        let _wt = {};
        GradeApp._excelWordInput = function (sid, val, tq) {
          clearTimeout(_wt[sid]);
          _wt[sid] = setTimeout(() => {
            _log('grade', `단어점수 입력: ${_stuName(sid)}`, `재시험:${val} / 총:${tq} (${_grBkName()})`);
          }, 1500);
          return _origW.apply(this, arguments);
        };
      }

      /* 리딩 점수 입력 — debounce 1.5초 */
      const _origR = GradeApp._excelRdInput;
      if (typeof _origR === 'function') {
        let _rt = {};
        GradeApp._excelRdInput = function (sid, key, val, tq) {
          const tk = `${sid}_${key}`;
          clearTimeout(_rt[tk]);
          _rt[tk] = setTimeout(() => {
            _log('grade', `리딩점수 입력: ${_stuName(sid)}`, `${key}:${val}개/총:${tq} (${_grBkName()})`);
          }, 1500);
          return _origR.apply(this, arguments);
        };
      }

      /* 코멘트 입력 — debounce 2초 */
      const _origC = GradeApp._onCmtInput;
      if (typeof _origC === 'function') {
        let _ct = {};
        GradeApp._onCmtInput = function (sid, val) {
          clearTimeout(_ct[sid]);
          _ct[sid] = setTimeout(() => {
            _log('grade', `코멘트 입력: ${_stuName(sid)}`, (val||'').slice(0,40));
          }, 2000);
          return _origC.apply(this, arguments);
        };
      }

      _wrap(GradeApp, 'saveAll', async () => {
        _log('grade', `💾 전체 저장`, `${_grClsName()} / ${_grBkName()}`);
      });

      _wrap(GradeApp, 'saveOne', async (result, sid) => {
        _log('grade', `💾 개인 저장: ${_stuName(sid)}`);
      });

      _wrap(GradeApp, 'resetOne', async (sid) => {
        _log('grade', `🗑 성적 초기화: ${_stuName(sid)}`);
      });

      _wrap(GradeApp, 'openReport', async () => {
        _log('grade', `📋 전체 성적표 열기`, `${_grClsName()} / ${_grBkName()}`);
      });

      _wrap(GradeApp, '_copyReport', async () => {
        _log('grade', `📋 리포트 복사`);
      });

      _wrap(GradeApp, '_shareReport', async () => { _log('grade', '📤 리포트 공유'); });
      _wrap(GradeApp, '_printReport', async () => { _log('grade', '🖨 리포트 인쇄'); });
      _wrap(GradeApp, '_deliverReport', async () => { _log('grade', '📨 리포트 전달'); });

      _wrap(GradeApp, '_openBulkComment', async () => {
        _log('grade', `✨ AI 일괄 코멘트`, `반: ${_grClsName()}`);
      });

      if (typeof GradeApp._cardAiGen === 'function')
        _wrap(GradeApp, '_cardAiGen', async (sid) => {
          _log('grade', `🤖 AI 코멘트 생성: ${_stuName(sid)}`);
        });

      if (typeof GradeApp._saveEvalCfg === 'function')
        _wrap(GradeApp, '_saveEvalCfg', async () => {
          _log('grade', `⚙️ 평가 설정 저장`, `교재: ${_grBkName()}`);
        });

      if (typeof GradeApp._exportAllGrades === 'function')
        _wrap(GradeApp, '_exportAllGrades', async () => { _log('grade', '📥 성적 xlsx 내보내기'); });

      if (typeof GradeApp._importAllGrades === 'function')
        _wrap(GradeApp, '_importAllGrades', async (file) => {
          _log('grade', `📤 성적 xlsx 불러오기: ${file?.name || ''}`);
        });

      if (typeof GradeApp._captureAllReports === 'function')
        _wrap(GradeApp, '_captureAllReports', async () => { _log('grade', '📸 전체 리포트 캡처'); });
    }

    /* 이벤트 위임 */
    _watchOperateEvents();
    _watchStudentEvents();
    _watchStaffEvents();

    console.log('[MonitorPatch] ✅ v4.0 전체 패치 완료');
  }

  /* ═══════════════════════════════════════════════════════
   * 이벤트 위임 — 진도 입력
   * 진도 입력 필드(.sv-bk-range) blur 시 반·교재·요일·값 추출
   * ═══════════════════════════════════════════════════════ */
  let _opWatched = false;
  function _watchOperateEvents() {
    if (_opWatched) return;
    _opWatched = true;

    /* 진도 입력 blur — 반·교재·요일 모두 추출 */
    document.addEventListener('focusout', e => {
      const el = e.target;
      if (!el.classList.contains('sv-bk-range') && !el.closest?.('.sv-bk-range')) return;
      const val = (el.value || el.textContent || '').trim();
      if (!val) return;

      /* 가장 가까운 day-card에서 요일 이름 추출 */
      const dayCard = el.closest('.day-card');
      const dayName = dayCard?.querySelector('.day-name')?.textContent?.trim() || '';

      /* 같은 row에서 교재 이름 추출 (brow div 내 두 번째 span) */
      const brow = el.closest('[style*="display:flex"]') || el.parentElement;
      const bkSpan = brow?.querySelectorAll('span')?.[1];
      const bkName = bkSpan?.textContent?.trim() || '';

      /* 현재 선택된 반 */
      const cls = _activeClsName();

      _log('operate', `진도 입력: ${cls} ${dayName}`, `${bkName}: ${val}`);
    }, true);

    /* 반 칩 클릭 */
    document.addEventListener('click', e => {
      const chip = e.target.closest('.cls-chip,.chip-btn,[data-cls]');
      if (!chip) return;
      const name = chip.dataset?.name || chip.dataset?.cls
                || chip.textContent?.trim()?.replace(/\s+/g,' ')?.slice(0,20) || '';
      if (name && name !== _activeClsName()) _log('operate', `반 선택: ${name}`);
    }, true);
  }

  /* ═══════════════════════════════════════════════════════
   * 이벤트 위임 — 학생 관리
   * ═══════════════════════════════════════════════════════ */
  function _watchStudentEvents() {
    const pg = document.getElementById('page-students');
    if (!pg || pg._monPatched) return;
    pg._monPatched = true;

    pg.addEventListener('click', e => {
      const card = e.target.closest('.st-card,.st-row');
      if (card) {
        const name = card.querySelector('.st-name,.st-nm')?.textContent?.trim() || '';
        if (name) _log('students', `학생 조회: ${name}`);
      }
      const btn = e.target.closest('[data-status]');
      if (btn) _log('students', `재원 상태 변경: ${btn.dataset.status}`);
    });

    const srch = pg.querySelector('#st-search,.st-search');
    if (srch && !srch._monPatched) {
      srch._monPatched = true;
      let t;
      srch.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          if (srch.value.length >= 1) _log('students', `학생 검색: ${srch.value}`);
        }, 800);
      });
    }
  }

  /* ═══════════════════════════════════════════════════════
   * 이벤트 위임 — 직원 관리
   * ═══════════════════════════════════════════════════════ */
  function _watchStaffEvents() {
    const pg = document.getElementById('page-staff');
    if (!pg || pg._monPatched) return;
    pg._monPatched = true;

    pg.addEventListener('click', e => {
      const card = e.target.closest('.sf-card,.sf-row');
      if (card) {
        const name = card.querySelector('.sf-name,.sf-nm')?.textContent?.trim() || '';
        if (name) _log('staff', `직원 조회: ${name}`);
      }
    });
  }

})();
