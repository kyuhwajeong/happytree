/**
 * monitor-patch.js — v5.1 (신규 모듈 커버리지 확대 + 기존 버그 수정)
 *
 * ■ v5.1 — 사용자 재점검 요청으로 v5.0에서 다룬 6개 신규 모듈의 전체
 *   public API를 다시 한 번 전수 대조하여 놓친 의미있는 액션을 추가:
 *   [자료실] 업로드 폼 열기, 분류 추가/삭제, 즐겨찾기, 인쇄,
 *            비밀번호 보호 자료 열람 시도(보안 관련 — 성공/실패 무관 기록)
 *   [영상]   주제 추가, AI 추천 검색(YouTube API 쿼터 소모 지점), 추천에서 등록,
 *            대본 수정, 즐겨찾기
 *   [게임]   콘텐츠 소스 선택(영상 대본 vs 직접입력)
 *   [일정]   "오늘의 수업" 패널 → 학생 상세 크로스 내비게이션
 *   [홈]     즐겨찾기 필터, 교재현황 날짜 탭 이동
 *   [직원]   등록폼 열기, 급여탭 이동, 근무기록 수정 시작, 근무 템플릿 추가,
 *            급여이력 열기, 급여 저장기록 삭제
 *   [학생]   필터 변경(재원상태/반/학년/학교)
 *   (게임/영상의 재생 중 클릭형 인터랙션 — 카드뒤집기·정답체크·재생 등 —은
 *    키 입력 수준으로 너무 촘촘해 기존 방침대로 액션 로그 대상에서 제외)
 *
 * ■ v5.0 추가/수정 항목
 *   [배경] GitHub dev 브랜치 코드 점검 결과, README가 "학생/직원 상세 액션까지
 *   추적한다"고 설명하고 있었지만 실제로는 페이지 이동만 기록되고 있었고
 *   (StudentApp/StaffApp에는 _wrap이 전혀 없었음), 최근 추가된 6개 모듈
 *   (일정관리/공지사항/학습게임/교육영상/자료실/홈 대시보드)은 monitor-app.js의
 *   MENU 라벨에도, 이 파일의 추적 대상에도 전혀 없어 세션 타임라인·통계·
 *   히트맵에 완전히 누락되고 있었음. 이번 버전에서 아래를 모두 보강함.
 *
 *   [신규 추적] ScheduleApp(일정 저장/삭제/근무 빠른등록/반복해제),
 *               NoticeApp(공지 저장/삭제/완료처리/공지함 열기),
 *               GameApp(게임 유형선택/시작/인쇄),
 *               EduVideoApp(영상 등록/삭제/AI단어추출/PDF생성/공유/상세보기),
 *               ArchiveApp(업로드/열람/삭제/수정/공유/다운로드/엑셀편집/변환),
 *               DashboardApp(바로가기 이동/섹션순서변경/일괄업데이트 요청)
 *   [보강] StudentApp(상세보기/재원상태변경/삭제/수정/엑셀가져오기/학원비계산기)
 *          — README에 있던 항목을 실제로 구현
 *   [보강] StaffApp(상세·편집열기/저장/삭제/근태등록·삭제/급여일괄정산/
 *          엑셀다운로드/즉시계산기 저장·공유) — 위와 동일
 *   [버그 수정] _stuName() 헬퍼가 존재하지 않는 StudentDB.getStudents()를
 *          호출하고 있어 항상 예외로 빠지고 raw ID만 표시되던 문제 수정
 *          (→ StudentDB.getAll()). booklib/grade 로그의 학생 이름 표시에도
 *          영향을 주던 버그.
 *   [정리] 구 _watchStudentEvents/_watchStaffEvents의 DOM 셀렉터 기반 추적은
 *          실제 마크업(.st-card-name 등)과 불일치해 항상 무동작이었음 —
 *          함수 직접 후킹(_wrap) 방식으로 교체, _watchStaffEvents는 제거
 *
 * ■ v4.0 (유지)
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
 *   (신규 모듈은 모두 monitor-patch.js보다 먼저 로드되므로 typeof 가드로 충분)
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

  /* StudentDB 학생명
   * ★ v5.0 버그 수정: StudentDB.getStudents()는 존재하지 않는 메서드였음
   *   (실제 API는 getAll()) → 항상 예외로 빠져 이름 대신 raw ID만 표시되던 문제 수정.
   *   이 버그는 booklib/grade 로그의 학생 이름 표시에도 영향을 주고 있었음. */
  function _stuName(stuId) {
    try {
      return (typeof StudentDB !== 'undefined' ? StudentDB.getAll() : [])
        .find(s => s.id === stuId)?.name || stuId || '';
    } catch { return stuId || ''; }
  }

  /* StaffDB 직원명 (v5.0 신규) */
  function _staffName(staffId) {
    try {
      return (typeof StaffDB !== 'undefined' ? StaffDB.getById?.(staffId) : null)?.name || staffId || '';
    } catch { return staffId || ''; }
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


    /* ╔══════════════════════════════════════════════════╗
     * ║  ScheduleApp — 일정관리 (홈 대시보드 내장, v5.0 신규) ║
     * ╚══════════════════════════════════════════════════╝ */
    if (typeof ScheduleApp !== 'undefined') {

      _wrap(ScheduleApp, 'saveEditor', async () => {
        const title = document.getElementById('sch-f-title')?.value?.trim() || '';
        _log('schedule', `일정 저장: ${title}`);
      });

      _wrap(ScheduleApp, 'deleteItem', async (id) => {
        const title = (typeof ScheduleDB !== 'undefined' ? ScheduleDB.getById?.(id)?.title : '') || id || '';
        _log('schedule', `일정 삭제: ${title}`);
      });

      _wrap(ScheduleApp, 'saveWorkQuickAdd', async (dateStr) => {
        const sid = document.getElementById('sch-wa-staff')?.value;
        _log('schedule', `⚡ 근무기록 빠른등록: ${_staffName(sid)}`, dateStr || '');
      });

      _wrap(ScheduleApp, '_confirmUnlinkSeries', async (id) => {
        _log('schedule', '반복 일정 시리즈에서 해제');
      });

      /* v5.1 보강 — "오늘의 수업" 패널에서 학생 상세로 바로 이동하는 크로스 내비게이션 */
      _wrap(ScheduleApp, '_goStudentDetail', async (studentId) => {
        _log('schedule', `학생 상세로 이동: ${_stuName(studentId)}`);
      });
    }

    /* ╔══════════════════════════════════════════════════╗
     * ║  NoticeApp — 공지사항 (헤더 🔔 팝업, v5.0 신규)  ║
     * ╚══════════════════════════════════════════════════╝ */
    if (typeof NoticeApp !== 'undefined') {

      _wrap(NoticeApp, 'openCenter', async () => { _log('notice', '공지함 열기'); });

      _wrap(NoticeApp, 'saveEditor', async () => {
        const title = document.getElementById('ntc-f-title')?.value?.trim() || '';
        _log('notice', `공지 저장: ${title}`);
      });

      _wrap(NoticeApp, 'completeNow', async (id) => {
        const title = (typeof NoticeDB !== 'undefined' ? NoticeDB.getById?.(id)?.title : '') || id || '';
        _log('notice', `✅ 공지 완료 처리: ${title}`);
      });

      _wrap(NoticeApp, 'deleteNotice', async (id) => {
        const title = (typeof NoticeDB !== 'undefined' ? NoticeDB.getById?.(id)?.title : '') || id || '';
        _log('notice', `공지 삭제: ${title}`);
      });
    }

    /* ╔══════════════════════════════════════════════════╗
     * ║  GameApp — 학습 게임 (콘텐츠 탭 내 도구, v5.0 신규) ║
     * ╚══════════════════════════════════════════════════╝ */
    if (typeof GameApp !== 'undefined') {

      _wrap(GameApp, '_selectSource', async (mode) => {
        /* v5.1 버그 수정: 실제 소스 모드 값은 video/paste/words (manual 아님) */
        const lbl = { video:'🎬 영상에서', paste:'📝 지문 붙여넣기', words:'🔤 단어만 입력' };
        _log('game', `콘텐츠 소스 선택: ${lbl[mode] || mode}`);
      });

      _wrap(GameApp, '_selectType', async (type) => {
        const lbl = { match:'🃏 짝맞추기', spell:'🔤 스펠링', quiz:'❓ 퀴즈' };
        _log('game', `게임 유형 선택: ${lbl[type] || type}`);
      });

      _wrap(GameApp, '_startGame', async () => { _log('game', '🎮 게임 시작'); });

      _wrap(GameApp, '_printMatch', async () => { _log('game', '🖨 짝맞추기 워크시트 인쇄'); });
      _wrap(GameApp, '_printSpell', async () => { _log('game', '🖨 스펠링 워크시트 인쇄'); });
      _wrap(GameApp, '_printQuiz',  async () => { _log('game', '🖨 퀴즈 워크시트 인쇄'); });
    }

    /* ╔══════════════════════════════════════════════════╗
     * ║  EduVideoApp — 교육 영상 (콘텐츠 탭 내 도구, v5.0 신규) ║
     * ╚══════════════════════════════════════════════════╝ */
    if (typeof EduVideoApp !== 'undefined') {

      _wrap(EduVideoApp, 'openDetail', async (id) => {
        const v = (typeof EduVideoDB !== 'undefined') ? EduVideoDB.getById?.(id) : null;
        _log('video', `영상 상세 보기: ${v?.title || id || ''}`);
      });

      _wrap(EduVideoApp, '_submitAdd', async () => {
        const title = document.getElementById('ev-title-inp')?.value?.trim() || '';
        _log('video', `영상 등록: ${title}`);
      });

      _wrap(EduVideoApp, '_confirmDeleteVideo', async (id) => {
        const v = (typeof EduVideoDB !== 'undefined') ? EduVideoDB.getById?.(id) : null;
        _log('video', `영상 삭제: ${v?.title || id || ''}`);
      });

      _wrap(EduVideoApp, '_extractWords', async (id) => {
        const v = (typeof EduVideoDB !== 'undefined') ? EduVideoDB.getById?.(id) : null;
        _log('video', `🤖 AI 단어 추출(대본): ${v?.title || id || ''}`);
      });

      _wrap(EduVideoApp, '_extractWordsFromVideo', async (id) => {
        const v = (typeof EduVideoDB !== 'undefined') ? EduVideoDB.getById?.(id) : null;
        _log('video', `🤖 AI 단어 추출(영상): ${v?.title || id || ''}`);
      });

      _wrap(EduVideoApp, '_makePdf', async (id) => {
        const v = (typeof EduVideoDB !== 'undefined') ? EduVideoDB.getById?.(id) : null;
        _log('video', `📄 워크시트 PDF 생성: ${v?.title || id || ''}`);
      });

      _wrap(EduVideoApp, '_shareVideo', async (id) => {
        const v = (typeof EduVideoDB !== 'undefined') ? EduVideoDB.getById?.(id) : null;
        _log('video', `📤 영상 공유: ${v?.title || id || ''}`);
      });

      /* v5.1 보강 — 주제 추가, AI 추천 검색(YouTube API 쿼터 소모 지점), 대본 수정, 즐겨찾기 */
      _wrap(EduVideoApp, '_promptNewTopic', async () => { _log('video', '🏷 주제 추가 시도'); });

      _wrap(EduVideoApp, 'openRecommend', async () => { _log('video', '🤖 AI 영상 추천 열기'); });

      _wrap(EduVideoApp, '_runRecommend', async () => {
        const topic = document.getElementById('ev-rec-topic')?.value || '';
        _log('video', `🤖 AI 영상 추천 검색 (YouTube API): ${topic}`);
      });

      _wrap(EduVideoApp, '_addFromRecommend', async (btn) => {
        _log('video', `🤖 추천 영상 등록: ${btn?.dataset?.title || ''}`);
      });

      _wrap(EduVideoApp, '_submitEditScript', async (id) => {
        const v = (typeof EduVideoDB !== 'undefined') ? EduVideoDB.getById?.(id) : null;
        _log('video', `대본 수정: ${v?.title || id || ''}`);
      });

      _wrap(EduVideoApp, '_togglePin', async (id) => {
        const v = (typeof EduVideoDB !== 'undefined') ? EduVideoDB.getById?.(id) : null;
        _log('video', `⭐ 즐겨찾기 토글: ${v?.title || id || ''}`);
      });
    }

    /* ╔══════════════════════════════════════════════════╗
     * ║  ArchiveApp — 자료실 (콘텐츠 탭 기본, v5.0 신규) ║
     * ╚══════════════════════════════════════════════════╝ */
    if (typeof ArchiveApp !== 'undefined') {

      /* 콘텐츠 하위 도구 전환 (자료실/영상/게임) — currentMenu도 함께 갱신 */
      _wrap(ArchiveApp, '_selectTool', async (key) => {
        /* v5.1 버그 수정: 실제 TOOL_TABS 키는 'files'인데 'library'로 잘못 매핑돼 있어
           자료실 탭 전환 시 라벨이 안 붙고 raw key로만 표시되고 있었음 */
        const lbl = { files:'🗂 자료실', 'video-worksheet':'🎬 영상 워크시트', games:'🎮 학습 게임' };
        _menuLog('archive', lbl[key] || key);
        _log('archive', `콘텐츠 탭 전환: ${lbl[key] || key}`);
      });

      _wrap(ArchiveApp, '_submitUpload', async () => { _log('archive', '📤 자료 업로드'); });

      _wrap(ArchiveApp, 'openPreview', async (id) => {
        const p = (typeof ArchiveDB !== 'undefined') ? ArchiveDB.getById?.(id) : null;
        _log('archive', `자료 열람: ${p?.name || id || ''}`);
      });

      _wrap(ArchiveApp, '_confirmDelete', async (id) => {
        const p = (typeof ArchiveDB !== 'undefined') ? ArchiveDB.getById?.(id) : null;
        _log('archive', `자료 삭제: ${p?.name || id || ''}`);
      });

      _wrap(ArchiveApp, '_submitEdit', async (id) => {
        const p = (typeof ArchiveDB !== 'undefined') ? ArchiveDB.getById?.(id) : null;
        _log('archive', `자료 수정: ${p?.name || id || ''}`);
      });

      _wrap(ArchiveApp, '_sharePost', async (postId) => {
        const p = (typeof ArchiveDB !== 'undefined') ? ArchiveDB.getById?.(postId) : null;
        _log('archive', `📤 자료 공유: ${p?.name || postId || ''}`);
      });

      _wrap(ArchiveApp, '_downloadPostZip', async (postId) => {
        const p = (typeof ArchiveDB !== 'undefined') ? ArchiveDB.getById?.(postId) : null;
        _log('archive', `📥 게시물 전체 다운로드(zip): ${p?.name || postId || ''}`);
      });

      _wrap(ArchiveApp, '_downloadSelectedZip', async () => { _log('archive', '📥 선택 자료 일괄 다운로드(zip)'); });

      _wrap(ArchiveApp, '_saveXlsxEdit', async () => { _log('archive', '💾 엑셀 미리보기 편집 저장'); });

      _wrap(ArchiveApp, '_convertAndDownload', async (targetExt) => {
        _log('archive', `🔄 파일 변환 다운로드 → ${targetExt}`);
      });

      /* v5.1 보강 — 1차 패치에서 빠졌던 분류 관리·업로드 열기·비밀번호 검증·즐겨찾기·인쇄 */
      _wrap(ArchiveApp, 'openUpload', async () => { _log('archive', '📤 업로드 폼 열기'); });

      _wrap(ArchiveApp, '_promptNewCategory', async () => { _log('archive', '🗂 자료실 분류 추가 시도'); });

      _wrap(ArchiveApp, '_removeCategory', async (name) => { _log('archive', `🗂 자료실 분류 삭제: ${name}`); });

      _wrap(ArchiveApp, '_togglePin', async (id) => {
        const p = (typeof ArchiveDB !== 'undefined') ? ArchiveDB.getById?.(id) : null;
        _log('archive', `⭐ 즐겨찾기 토글: ${p?.name || id || ''}`);
      });

      _wrap(ArchiveApp, '_printPreview', async () => { _log('archive', '🖨 자료 인쇄'); });

      /* 보안 관련: 비밀번호로 보호된 자료 열람 시도 — 성공/실패와 무관하게 시도 자체를 기록 */
      _wrap(ArchiveApp, '_submitPasswordGate', async (id) => {
        const p = (typeof ArchiveDB !== 'undefined') ? ArchiveDB.getById?.(id) : null;
        _log('archive', `🔒 비밀번호 보호 자료 열람 시도: ${p?.name || id || ''}`);
      });
    }

    /* ╔══════════════════════════════════════════════════╗
     * ║  DashboardApp — 홈 대시보드 (v5.0 신규)          ║
     * ╚══════════════════════════════════════════════════╝ */
    if (typeof DashboardApp !== 'undefined') {

      _wrap(DashboardApp, 'goMatrix', async (clsId, bkId) => {
        const cls = DB?.getActiveClasses?.().find(c => c.id === clsId)?.name || clsId || '';
        _log('dashboard', `바로가기 → 학습 현황: ${cls}`, _bkName(bkId));
      });

      _wrap(DashboardApp, 'goArchivePreview', async (id) => {
        _log('dashboard', '바로가기 → 자료실 미리보기', id || '');
      });

      _wrap(DashboardApp, 'goEduVideo', async (id) => {
        _log('dashboard', '바로가기 → 영상 상세', id || '');
      });

      _wrap(DashboardApp, '_saveReorder', async () => { _log('dashboard', '🧩 홈 섹션 순서 변경'); });

      _wrap(DashboardApp, '_requestBulkUpdate', async () => { _log('dashboard', '📤 일괄 진도 업데이트 요청'); });

      /* v5.1 보강 */
      _wrap(DashboardApp, '_filterFavorites', async (type) => { _log('dashboard', `즐겨찾기 필터: ${type}`); });

      _wrap(DashboardApp, '_selectBookDay', async (off) => { _log('dashboard', `교재현황 날짜 탭 이동: ${off}`); });
    }

    /* ╔══════════════════════════════════════════════════╗
     * ║  StudentApp — 학생 관리 세부 추적                ║
     * ║  ★ v5.0: README에는 "학생 상세보기·재원상태변경  ║
     * ║    추적"이라 적혀 있었지만 실제 코드엔 없었음     ║
     * ║    (구 _watchStudentEvents가 .st-name/[data-status]║
     * ║    를 찾았는데 실제 DOM엔 .st-card-name만 존재 →  ║
     * ║    항상 매칭 실패). _wrap 직접 후킹으로 교체.     ║
     * ╚══════════════════════════════════════════════════╝ */
    if (typeof StudentApp !== 'undefined') {

      _wrap(StudentApp, 'openDetail', async (id) => { _log('students', `학생 상세 보기: ${_stuName(id)}`); });

      _wrap(StudentApp, 'quickStatus', async (id, status) => {
        _log('students', `재원 상태 변경: ${_stuName(id)}`, `→ ${status}`);
      });

      _wrap(StudentApp, 'confirmDelete', async (id) => { _log('students', `학생 삭제: ${_stuName(id)}`); });

      _wrap(StudentApp, 'saveEdit', async (id) => { _log('students', `학생 정보 수정: ${_stuName(id)}`); });

      _wrap(StudentApp, 'handleFile', async (file) => {
        if (file) _log('students', `엑셀 학생 가져오기: ${file.name}`);
      });

      _wrap(StudentApp, 'openTuitionCalc', async (id) => {
        _log('students', `학원비 계산기 열기${id ? ': ' + _stuName(id) : ''}`);
      });

      /* v5.1 보강 — 필터 변경(재원상태/반/학년/학교) */
      _wrap(StudentApp, '_onFilter', async (key, val) => { _log('students', `필터 변경: ${key} = ${val}`); });
    }

    /* ╔══════════════════════════════════════════════════╗
     * ║  StaffApp — 직원 관리 세부 추적                  ║
     * ║  ★ v5.0: README의 "근태입력·급여정산 추적"도     ║
     * ║    동일하게 미구현 상태였음 — 신규 추가           ║
     * ╚══════════════════════════════════════════════════╝ */
    if (typeof StaffApp !== 'undefined') {

      _wrap(StaffApp, 'openEdit', async (id) => { _log('staff', `직원 상세/편집 열기: ${_staffName(id)}`); });

      _wrap(StaffApp, 'saveStaff', async () => {
        const name = document.getElementById('sf-f-name')?.value?.trim() || '';
        _log('staff', `직원 정보 저장: ${name}`);
      });

      _wrap(StaffApp, 'deleteStaff', async (id) => { _log('staff', `직원 삭제: ${_staffName(id)}`); });

      _wrap(StaffApp, '_doBatch', async () => { _log('staff', '📋 근태 일괄 등록'); });

      _wrap(StaffApp, '_addEntry', async () => { _log('staff', '근무 기록 등록'); });

      _wrap(StaffApp, '_delEntry', async () => { _log('staff', '근무 기록 삭제'); });

      _wrap(StaffApp, '_calcAll', async () => { _log('staff', '💰 전 직원 급여 일괄 정산'); });

      _wrap(StaffApp, '_downloadExcel', async () => { _log('staff', '📥 급여 엑셀 다운로드'); });

      _wrap(StaffApp, '_doQSave', async () => { _log('staff', '⚡ 즉시 시급계산 결과 저장'); });

      _wrap(StaffApp, '_qShare', async () => { _log('staff', '⚡ 즉시 시급계산 결과 공유'); });

      /* v5.1 보강 — 등록폼 열기, 급여탭 이동, 근무기록 수정, 근무 템플릿, 급여이력 */
      _wrap(StaffApp, 'openAdd', async () => { _log('staff', '➕ 직원 등록 폼 열기'); });

      _wrap(StaffApp, 'goToSalary', async (staffId) => {
        _log('staff', `급여 탭으로 이동${staffId ? ': ' + _staffName(staffId) : ''}`);
      });

      _wrap(StaffApp, '_editEntry', async (id) => { _log('staff', '근무 기록 수정 시작'); });

      _wrap(StaffApp, '_addTemplEntry', async () => { _log('staff', '📋 근무 템플릿 항목 추가'); });

      _wrap(StaffApp, '_openPayHistory', async () => { _log('staff', '📜 급여 이력 열기'); });

      _wrap(StaffApp, '_deletePaySnap', async (sid) => { _log('staff', `급여 저장 기록 삭제: ${_staffName(sid)}`); });
    }

    /* 이벤트 위임 */
    _watchOperateEvents();
    _watchStudentEvents();

    console.log('[MonitorPatch] ✅ v5.0 전체 패치 완료 (일정·공지·게임·영상·자료실·홈·학생·직원 커버리지 확대)');
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
   * 이벤트 위임 — 학생 관리 (검색어 입력만 담당)
   * ★ v5.0: 학생 상세보기·재원상태변경·삭제·수정·가져오기는
   *   위쪽 StudentApp _wrap 섹션에서 함수 직접 후킹으로 추적.
   *   (구버전은 .st-name/.st-nm/[data-status] 셀렉터로 DOM을 뒤졌으나
   *   실제 마크업은 .st-card-name이라 이름 조회가 항상 빈 문자열로
   *   실패했고, [data-status] 속성 자체가 존재하지 않아 상태변경도
   *   전혀 기록되지 않고 있었음 — 함수 후킹 방식이 DOM 구조 변경에도
   *   안전하므로 이 방식으로 교체)
   * ═══════════════════════════════════════════════════════ */
  function _watchStudentEvents() {
    const pg = document.getElementById('page-students');
    if (!pg || pg._monPatched) return;
    pg._monPatched = true;

    const srch = pg.querySelector('#st-q,.st-search');
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

})();
