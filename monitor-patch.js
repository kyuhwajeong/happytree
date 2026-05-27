/**
 * monitor-patch.js — v2.0
 *
 * 해피트리 영어학원 — 모니터링 자동 연동 패치
 *
 * ■ 역할
 *   app.js / booklib-app.js / grade-app.js / students-app.js / staff-app.js
 *   의 공개 메서드를 래핑하여 MonitorDB 추적을 자동 삽입합니다.
 *   → 원본 소스 파일 수정 없음!
 *
 * ■ 추적 항목 (전체)
 *   [App]        doLogin, logout, go, mgTab, saveClass, delClass,
 *                saveAccount, delAcc, delAccBulk, doCopyBooks,
 *                handleImport, shareUrl, shareCurrentClass
 *   [BooklibApp] _toggleCheck, _toggleStamp, _batchToggle
 *   [GradeApp]   (render 후 입력 이벤트 delegation)
 *   [StudentApp] (render 후 상세/삭제 이벤트)
 *   [StaffApp]   (render 후 이벤트)
 *
 * ■ 로드 순서 (index.html)
 *   ... app.js (기존)
 *   monitor-db.js
 *   monitor-app.js
 *   monitor-patch.js   ← 맨 마지막
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════
   * 유틸
   * ══════════════════════════════════════════════════════ */
  /** 안전한 MonitorDB.logAction 호출 */
  function _log(menu, detail, extra) {
    try {
      if (typeof MonitorDB !== 'undefined' && MonitorDB.hasSession()) {
        MonitorDB.logAction(menu, detail, extra);
      }
    } catch(e) { /* 추적 오류는 조용히 무시 */ }
  }

  function _menuLog(menu, detail) {
    try {
      if (typeof MonitorDB !== 'undefined' && MonitorDB.hasSession()) {
        MonitorDB.updateMenu(menu, detail);
      }
    } catch(e) {}
  }

  /** 원본 함수를 래핑하여 before/after 훅 삽입 */
  function _wrap(obj, name, before, after) {
    if (!obj || typeof obj[name] !== 'function') return;
    const orig = obj[name];
    obj[name] = async function (...args) {
      try { if (before) await before(...args); } catch(e) {}
      const result = await orig.apply(this, args);
      try { if (after)  await after(result, ...args); } catch(e) {}
      return result;
    };
  }

  /* ══════════════════════════════════════════════════════
   * DOMContentLoaded 후 패치 적용
   * (App 객체들이 모두 초기화된 뒤)
   * ══════════════════════════════════════════════════════ */
  function _applyPatches() {

    /* ──────────────────────────────────────────────────
     * [App] doLogin — 히든PW 감지 + 일반 로그인 추적
     * ────────────────────────────────────────────────── */
    if (typeof App !== 'undefined') {
      const _origDoLogin = App.doLogin;
      App.doLogin = async function () {
        const id = document.getElementById('li-id')?.value?.trim() || '';
        const pw = document.getElementById('li-pw')?.value || '';

        /* ★ 히든 모니터링 모드 진입 */
        if (id === 'admin' &&
            typeof MonitorDB !== 'undefined' &&
            MonitorDB.isMonitorPassword(pw)) {
          // 로그인 창 닫기
          document.getElementById('login-gate')?.classList.add('hidden');
          // 비밀번호 즉시 소거 (보안)
          const pwEl = document.getElementById('li-pw');
          if (pwEl) pwEl.value = '';
          // 모니터링 화면 진입
          MonitorApp.show();
          return;
        }

        /* 일반 로그인 → 원본 실행 */
        await _origDoLogin.apply(this, arguments);

        /* 로그인 성공 여부 확인 (로그인 창이 닫혔으면 성공) */
        const gate = document.getElementById('login-gate');
        if (gate && gate.classList.contains('hidden')) {
          // 세션 시작
          const sess = (typeof DB !== 'undefined') ? DB.getSession() : null;
          if (sess) {
            try {
              await MonitorDB.startSession(sess.username, sess.role);
              _log(DB.getRole()==='teacher'?'operate':'manage', '로그인 성공');
            } catch(e) {}
          }
        }
      };

      /* ──────────────────────────────────────────────────
       * [App] logout
       * ────────────────────────────────────────────────── */
      _wrap(App, 'logout', async () => {
        _log('logout', '로그아웃');
        if (typeof MonitorDB !== 'undefined' && MonitorDB.hasSession()) {
          await MonitorDB.endSession();
        }
      });

      /* ──────────────────────────────────────────────────
       * [App] go — 메뉴 이동 추적
       * ────────────────────────────────────────────────── */
      _wrap(App, 'go', null, async (result, page) => {
        _menuLog(page, '');
      });

      /* ──────────────────────────────────────────────────
       * [App] mgTab — 관리 탭 전환
       * ────────────────────────────────────────────────── */
      _wrap(App, 'mgTab', async (tab) => {
        const labels = {
          classes:'반 관리', accounts:'계정 관리',
          theme:'테마 설정', io:'백업/복원', share:'공유',
        };
        _log('manage', `관리 탭: ${labels[tab]||tab}`);
      });

      /* ──────────────────────────────────────────────────
       * [App] saveClass — 반 추가/수정
       * ────────────────────────────────────────────────── */
      _wrap(App, 'saveClass', async () => {
        const name = document.getElementById('f-cname')?.value?.trim() || '';
        const days = [...document.querySelectorAll('#modal-cls .day-ck input:checked')]
          .map(c=>c.value).join(',');
        _log('manage', `반 저장: ${name}`, `요일: ${days}`);
      });

      /* ──────────────────────────────────────────────────
       * [App] delClass — 반 삭제
       * ────────────────────────────────────────────────── */
      _wrap(App, 'delClass', async (id) => {
        const cls = (typeof DB !== 'undefined') ? DB.getClassById(id) : null;
        _log('manage', `반 삭제: ${cls?.name||id}`);
      });

      /* ──────────────────────────────────────────────────
       * [App] saveAccount — 계정 추가/수정
       * ────────────────────────────────────────────────── */
      _wrap(App, 'saveAccount', async () => {
        const u    = document.getElementById('f-aid')?.value?.trim() || '';
        const role = document.getElementById('f-arole')?.value || '';
        const labels = {admin:'관리자',manager:'매니저',operator:'운용자',teacher:'강사'};
        _log('manage', `계정 저장: ${u}`, `역할: ${labels[role]||role}`);
      });

      /* ──────────────────────────────────────────────────
       * [App] delAcc — 계정 삭제
       * ────────────────────────────────────────────────── */
      _wrap(App, 'delAcc', async (id, username) => {
        _log('manage', `계정 삭제: ${username||id}`);
      });

      /* ──────────────────────────────────────────────────
       * [App] delAccBulk — 계정 일괄 삭제
       * ────────────────────────────────────────────────── */
      _wrap(App, 'delAccBulk', async () => {
        const checked = [...document.querySelectorAll('.acc-ck:checked')];
        _log('manage', `계정 일괄 삭제 ${checked.length}개`);
      });

      /* ──────────────────────────────────────────────────
       * [App] doCopyBooks — 교재 복사
       * ────────────────────────────────────────────────── */
      _wrap(App, 'doCopyBooks', async () => {
        const fromEl = document.getElementById('f-copy-from');
        const fromTxt = fromEl?.options[fromEl.selectedIndex]?.text || '';
        _log('manage', `교재 복사: ${fromTxt}`);
      });

      /* ──────────────────────────────────────────────────
       * [App] handleImport — xlsx 가져오기
       * ────────────────────────────────────────────────── */
      _wrap(App, 'handleImport', async (input) => {
        const files = input?.files;
        if (files && files.length) {
          _log('operate', `xlsx 가져오기: ${files[0].name}`, `파일 ${files.length}개`);
        }
      });

      /* ──────────────────────────────────────────────────
       * [App] shareUrl / shareCurrentClass — 공유
       * ────────────────────────────────────────────────── */
      _wrap(App, 'shareUrl', async () => {
        _log('operate', '진도 공유 URL 생성');
      });
      if (typeof App.shareCurrentClass === 'function') {
        _wrap(App, 'shareCurrentClass', async () => {
          _log('operate', '현재 반 공유');
        });
      }

      /* ──────────────────────────────────────────────────
       * [App] prevWeek / nextWeek — 주간 이동
       * ────────────────────────────────────────────────── */
      _wrap(App, 'prevWeek', async () => { _log('operate', '이전 주로 이동'); });
      _wrap(App, 'nextWeek', async () => { _log('operate', '다음 주로 이동'); });
    }

    /* ──────────────────────────────────────────────────
     * [BooklibApp] — 교재 체크/스탬프/배치
     * ────────────────────────────────────────────────── */
    if (typeof BooklibApp !== 'undefined') {
      _wrap(BooklibApp, '_toggleCheck', async (clsId, bkId, stuId, chId, chType) => {
        const bk  = _bkName(bkId);
        const ch  = _chName(chId);
        const stu = _stuName(stuId);
        _log('booklib', `교재 체크 토글: ${stu} / ${ch}`, `교재: ${bk}`);
      });

      _wrap(BooklibApp, '_toggleStamp', async (chId) => {
        const ch = _chName(chId);
        _log('booklib', `진도 스탬프 토글: ${ch}`);
      });

      _wrap(BooklibApp, '_batchToggle', async (clsId, bkId, stuId) => {
        const stu = _stuName(stuId);
        _log('booklib', `전체 토글: ${stu}`);
      });

      // 교재 추가/삭제
      if (typeof BooklibApp.saveBook === 'function') {
        _wrap(BooklibApp, 'saveBook', async () => {
          const n = document.getElementById('bl-bname')?.value?.trim() || '';
          _log('booklib', `교재 저장: ${n}`);
        });
      }
    }

    /* ──────────────────────────────────────────────────
     * [StudentApp] — 학생 관리
     * ────────────────────────────────────────────────── */
    if (typeof StudentApp !== 'undefined') {
      // StudentApp의 공개 render 훅: render 후 이벤트 감시
      const _origRender = StudentApp.render;
      if (typeof _origRender === 'function') {
        StudentApp.render = async function (...args) {
          const r = await _origRender.apply(this, args);
          _watchStudentEvents();
          return r;
        };
      }
    }

    /* ──────────────────────────────────────────────────
     * [StaffApp] — 직원 관리
     * ────────────────────────────────────────────────── */
    if (typeof StaffApp !== 'undefined') {
      const _origRender = StaffApp.render;
      if (typeof _origRender === 'function') {
        StaffApp.render = async function (...args) {
          const r = await _origRender.apply(this, args);
          _watchStaffEvents();
          return r;
        };
      }
    }

    /* ──────────────────────────────────────────────────
     * 진도 입력 — 이벤트 위임 (operate 페이지)
     * ────────────────────────────────────────────────── */
    _watchOperateEvents();

    console.log('[MonitorPatch] ✅ 모든 패치 적용 완료');
  }

  /* ══════════════════════════════════════════════════════
   * 이벤트 위임 : 진도 입력 (sv-bk-range 클래스 input)
   * ══════════════════════════════════════════════════════ */
  let _opDelegated = false;
  function _watchOperateEvents() {
    if (_opDelegated) return;
    _opDelegated = true;
    document.addEventListener('focusout', e => {
      const el = e.target;
      // 진도 범위 입력박스
      if (el.classList.contains('sv-bk-range') || el.closest('.sv-bk-range')) {
        const chip = el.closest('[data-cls]') || el.closest('.cls-chip');
        const clsName = chip?.dataset?.cls || chip?.dataset?.name || '';
        const bkName  = el.title || el.placeholder || '';
        const val     = el.value || el.textContent || '';
        if (val) _log('operate', `진도 입력: ${clsName}`, `${bkName}: ${val}`);
      }
    }, true);

    // 반 칩(chip) 클릭 추적
    document.addEventListener('click', e => {
      const chip = e.target.closest('.cls-chip, .chip-btn');
      if (chip) {
        const name = chip.dataset?.name || chip.dataset?.cls || chip.textContent?.trim()?.slice(0,20) || '';
        if (name) _log('operate', `반 선택: ${name}`);
      }
    }, true);
  }

  /* ══════════════════════════════════════════════════════
   * 이벤트 위임 : 학생 관리
   * ══════════════════════════════════════════════════════ */
  function _watchStudentEvents() {
    const pg = document.getElementById('page-students');
    if (!pg || pg._monPatched) return;
    pg._monPatched = true;
    pg.addEventListener('click', e => {
      // 학생 상세 보기
      const card = e.target.closest('.st-card, .st-row');
      if (card) {
        const name = card.querySelector('.st-name, .st-nm')?.textContent?.trim() || '';
        if (name) _log('students', `학생 조회: ${name}`);
      }
      // 재원 상태 변경
      const statusBtn = e.target.closest('.st-status-btn, [data-status]');
      if (statusBtn) {
        const status = statusBtn.dataset?.status || statusBtn.textContent?.trim() || '';
        _log('students', `재원 상태 변경: ${status}`);
      }
    });
    // 검색
    const search = pg.querySelector('#st-search, .st-search');
    if (search && !search._monPatched) {
      search._monPatched = true;
      let _sTimer;
      search.addEventListener('input', () => {
        clearTimeout(_sTimer);
        _sTimer = setTimeout(() => {
          if (search.value.length >= 1) {
            _log('students', `학생 검색: ${search.value}`);
          }
        }, 800);
      });
    }
  }

  /* ══════════════════════════════════════════════════════
   * 이벤트 위임 : 직원 관리
   * ══════════════════════════════════════════════════════ */
  function _watchStaffEvents() {
    const pg = document.getElementById('page-staff');
    if (!pg || pg._monPatched) return;
    pg._monPatched = true;
    pg.addEventListener('click', e => {
      const card = e.target.closest('.sf-card, .sf-row');
      if (card) {
        const name = card.querySelector('.sf-name, .sf-nm')?.textContent?.trim() || '';
        if (name) _log('staff', `직원 조회: ${name}`);
      }
    });
  }

  /* ══════════════════════════════════════════════════════
   * DB 헬퍼 (이름 조회)
   * ══════════════════════════════════════════════════════ */
  function _bkName(bkId) {
    try {
      const bk = typeof BookLibDB !== 'undefined' ? BookLibDB.getBook(bkId) : null;
      return bk?.name || bkId || '';
    } catch { return bkId || ''; }
  }

  function _chName(chId) {
    try {
      // 챕터 ID로 DOM에서 제목 조회 (BookLibDB에 직접 접근 어려울 수 있음)
      const el = document.querySelector(`[data-ch="${chId}"] .bl-ch-t, [data-chid="${chId}"]`);
      if (el) return el.textContent?.trim()?.slice(0,30) || chId;
      return chId || '';
    } catch { return chId || ''; }
  }

  function _stuName(stuId) {
    try {
      const stus = typeof StudentDB !== 'undefined' ? StudentDB.getStudents() : [];
      const stu  = stus.find(s => s.id === stuId);
      return stu?.name || stuId || '';
    } catch { return stuId || ''; }
  }

  /* ══════════════════════════════════════════════════════
   * 초기화 — App.init 완료 후 패치 적용
   * (DOMContentLoaded 이후 App.init이 비동기로 실행됨)
   * ══════════════════════════════════════════════════════ */
  function _init() {
    // App.init 원본을 래핑하여 완료 후 패치 적용
    if (typeof App !== 'undefined') {
      const _origInit = App.init;
      App.init = async function (...args) {
        const r = await _origInit.apply(this, args);
        _applyPatches();
        return r;
      };
    } else {
      // App이 아직 없으면 DOMContentLoaded 후 재시도
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(_applyPatches, 500);
      });
    }
  }

  /* ══ 실행 ══ */
  _init();

})();
