/**
 * monitor-patch.js — v2.2
 *
 * ■ v2.2 수정사항
 *   - 이미 로그인된 상태(localStorage 세션 복구)에서도 자동으로 추적 시작
 *   - admin 포함 모든 계정 추적
 *   - 페이지 로드 직후 DB.isLoggedIn() 확인 → 세션 자동 등록
 *
 * ■ 로드 순서 (index.html)
 *   app.js → monitor-db.js → monitor-app.js → monitor-patch.js  (맨 마지막)
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════
   * 유틸
   * ══════════════════════════════════════════════════════ */
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
      try { if (after)  await after(result, ...args); } catch(e) {}
      return result;
    };
  }

  /* ══════════════════════════════════════════════════════
   * STEP 1: App.doLogin 즉시(동기) 패치
   *
   * app.js 마지막 줄이 DOMContentLoaded 리스너에 원본 App.init 참조를
   * 등록해 버리므로 App.init 래핑은 의미 없음.
   * 반면 onclick="App.doLogin()" 은 클릭 시점에 App.doLogin 을
   * 동적으로 조회하므로, 지금 교체하면 즉시 적용됨.
   * ══════════════════════════════════════════════════════ */
  (function _patchLoginNow() {
    if (typeof App === 'undefined') {
      console.warn('[MonitorPatch] App 없음 — 패치 실패');
      return;
    }

    const _origDoLogin = App.doLogin;

    App.doLogin = async function () {
      const id = (document.getElementById('li-id')?.value || '').trim();
      const pw =  document.getElementById('li-pw')?.value || '';

      /* ★ 히든 모니터링 모드 진입 */
      if (id === 'admin' &&
          typeof MonitorDB !== 'undefined' &&
          MonitorDB.isMonitorPassword(pw)) {

        document.getElementById('login-gate')?.classList.add('hidden');
        const pwEl = document.getElementById('li-pw');
        if (pwEl) pwEl.value = '';
        // 기억하기 ON이어도 히든 PW는 저장 안 함
        localStorage.removeItem('hk_rem_pw');

        if (typeof MonitorApp !== 'undefined') {
          MonitorApp.show();
        }
        return; // 일반 로그인 중단
      }

      /* 일반 로그인 (원본 실행) */
      await _origDoLogin.apply(this, arguments);

      /* 로그인 성공 → 세션 시작 (admin 포함 모든 계정) */
      const gate = document.getElementById('login-gate');
      if (gate?.classList.contains('hidden')) {
        await _startSessionIfNeeded('doLogin');
      }
    };

    console.log('[MonitorPatch] ✅ STEP1: doLogin 패치 즉시 적용');
  })();

  /* ══════════════════════════════════════════════════════
   * STEP 2: DOMContentLoaded + 충분한 지연 후 나머지 패치
   *
   * App.init 이 async이고 Firebase 초기화 최대 5초가 걸리므로
   * 3초 여유를 두고 적용. 동시에 "이미 로그인" 상태도 감지.
   * ══════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(_applyRemainingPatches, 3000);
  });

  /* ══════════════════════════════════════════════════════
   * 핵심 보조 함수: 세션이 없으면 지금 로그인 상태로 세션 시작
   *
   * 호출 상황:
   *  a) doLogin 성공 직후
   *  b) 페이지 로드 시 이미 로그인 상태 (localStorage 세션 복구)
   * ══════════════════════════════════════════════════════ */
  async function _startSessionIfNeeded(reason) {
    try {
      if (typeof DB === 'undefined' || typeof MonitorDB === 'undefined') return;
      if (!DB.isLoggedIn()) return;
      if (MonitorDB.hasSession()) return; // 이미 세션 있으면 중복 생성 안 함

      const sess = DB.getSession();
      if (!sess) return;

      await MonitorDB.startSession(sess.username, sess.role);

      // 현재 페이지 기록
      const curPage = document.querySelector('.bni.on')?.dataset?.pg
                   || document.querySelector('.page.on')?.id?.replace('page-','')
                   || 'operate';
      MonitorDB.logAction(curPage, reason === 'resume' ? '세션 복구 (이미 로그인 상태)' : '로그인');
      MonitorDB.updateMenu(curPage, '');

      console.log(`[MonitorPatch] ✅ 세션 시작: ${sess.username} (${reason})`);
    } catch(e) {
      console.warn('[MonitorPatch] 세션 시작 오류:', e);
    }
  }

  /* ══════════════════════════════════════════════════════
   * 나머지 패치 + 이미 로그인 상태 감지
   * ══════════════════════════════════════════════════════ */
  function _applyRemainingPatches() {
    if (typeof App === 'undefined') return;

    /* ── ★★★ 이미 로그인된 상태 자동 감지 ★★★
     *   remember-me 또는 세션 유지 중인 모든 사용자 (admin 포함) 추적 시작
     * ── */
    _startSessionIfNeeded('resume');

    /* ── logout ── */
    _wrap(App, 'logout', async () => {
      _log(DB?.getRole()==='teacher'?'operate':'manage', '로그아웃');
      if (typeof MonitorDB !== 'undefined' && MonitorDB.hasSession())
        await MonitorDB.endSession();
    });

    /* ── go (메뉴 이동) ── */
    _wrap(App, 'go', null, async (result, page) => {
      _menuLog(page, '');
    });

    /* ── mgTab (관리 탭 전환) ── */
    _wrap(App, 'mgTab', async (tab) => {
      const labels = {
        classes:'반 관리', accounts:'계정 관리',
        theme:'테마 설정', io:'백업/복원', share:'공유',
      };
      _log('manage', `관리 탭: ${labels[tab] || tab}`);
    });

    /* ── saveClass ── */
    _wrap(App, 'saveClass', async () => {
      const name = document.getElementById('f-cname')?.value?.trim() || '';
      const days = [...document.querySelectorAll('#modal-cls .day-ck input:checked')]
        .map(c => c.value).join(',');
      _log('manage', `반 저장: ${name}`, `요일: ${days}`);
    });

    /* ── delClass ── */
    _wrap(App, 'delClass', async (id) => {
      const cls = DB?.getClassById(id);
      _log('manage', `반 삭제: ${cls?.name || id}`);
    });

    /* ── saveAccount ── */
    _wrap(App, 'saveAccount', async () => {
      const u    = document.getElementById('f-aid')?.value?.trim() || '';
      const role = document.getElementById('f-arole')?.value || '';
      const lbl  = {admin:'관리자', manager:'매니저', operator:'운용자', teacher:'강사'};
      _log('manage', `계정 저장: ${u}`, `역할: ${lbl[role] || role}`);
    });

    /* ── delAcc ── */
    _wrap(App, 'delAcc', async (id, username) => {
      _log('manage', `계정 삭제: ${username || id}`);
    });

    /* ── delAccBulk ── */
    _wrap(App, 'delAccBulk', async () => {
      const n = document.querySelectorAll('.acc-ck:checked').length;
      _log('manage', `계정 일괄 삭제 ${n}개`);
    });

    /* ── doCopyBooks ── */
    _wrap(App, 'doCopyBooks', async () => {
      const sel = document.getElementById('f-copy-from');
      const txt = sel?.options[sel.selectedIndex]?.text || '';
      _log('manage', `교재 복사: ${txt}`);
    });

    /* ── handleImport ── */
    _wrap(App, 'handleImport', async (input) => {
      const f = input?.files?.[0];
      if (f) _log('operate', `xlsx 가져오기: ${f.name}`, `${input.files.length}개`);
    });

    /* ── share ── */
    _wrap(App, 'shareUrl', async () => { _log('operate', '진도 공유 URL 생성'); });
    if (typeof App.shareCurrentClass === 'function')
      _wrap(App, 'shareCurrentClass', async () => { _log('operate', '현재 반 공유'); });

    /* ── 주간 이동 ── */
    _wrap(App, 'prevWeek', async () => { _log('operate', '이전 주로 이동'); });
    _wrap(App, 'nextWeek', async () => { _log('operate', '다음 주로 이동'); });

    /* ── BooklibApp ── */
    if (typeof BooklibApp !== 'undefined') {
      _wrap(BooklibApp, '_toggleCheck', async (clsId, bkId, stuId, chId) => {
        _log('booklib', `교재 체크 토글: ${_stuName(stuId)} / ${_chName(chId)}`, `교재: ${_bkName(bkId)}`);
      });
      _wrap(BooklibApp, '_toggleStamp', async (chId) => {
        _log('booklib', `진도 스탬프 토글: ${_chName(chId)}`);
      });
      _wrap(BooklibApp, '_batchToggle', async (clsId, bkId, stuId) => {
        _log('booklib', `전체 토글: ${_stuName(stuId)}`);
      });
      if (typeof BooklibApp.saveBook === 'function')
        _wrap(BooklibApp, 'saveBook', async () => {
          const n = document.getElementById('bl-bname')?.value?.trim() || '';
          _log('booklib', `교재 저장: ${n}`);
        });
    }

    /* ── 이벤트 위임 ── */
    _watchOperateEvents();
    _watchStudentEvents();
    _watchStaffEvents();

    console.log('[MonitorPatch] ✅ STEP2: 나머지 패치 모두 적용');
  }

  /* ══════════════════════════════════════════════════════
   * 이벤트 위임 — 진도 입력
   * ══════════════════════════════════════════════════════ */
  let _opWatched = false;
  function _watchOperateEvents() {
    if (_opWatched) return;
    _opWatched = true;

    document.addEventListener('focusout', e => {
      const el = e.target;
      if (!el.classList.contains('sv-bk-range') && !el.closest?.('.sv-bk-range')) return;
      const chip    = el.closest('[data-cls],[data-name]');
      const clsName = chip?.dataset?.cls || chip?.dataset?.name || '';
      const val     = (el.value || el.textContent || '').trim();
      if (val) _log('operate', `진도 입력: ${clsName}`, `값: ${val}`);
    }, true);

    document.addEventListener('click', e => {
      const chip = e.target.closest('.cls-chip,.chip-btn,[data-cls]');
      if (!chip) return;
      const name = chip.dataset?.name || chip.dataset?.cls
                || chip.textContent?.trim()?.slice(0, 20) || '';
      if (name) _log('operate', `반 선택: ${name}`);
    }, true);
  }

  /* ══════════════════════════════════════════════════════
   * 이벤트 위임 — 학생 관리
   * ══════════════════════════════════════════════════════ */
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

  /* ══════════════════════════════════════════════════════
   * 이벤트 위임 — 직원 관리
   * ══════════════════════════════════════════════════════ */
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

  /* ══════════════════════════════════════════════════════
   * DB 헬퍼
   * ══════════════════════════════════════════════════════ */
  function _bkName(bkId) {
    try { return BookLibDB?.getBook(bkId)?.name || bkId || ''; } catch { return bkId || ''; }
  }
  function _chName(chId) {
    try {
      const el = document.querySelector(`[data-ch="${chId}"] .bl-ch-t,[data-chid="${chId}"]`);
      return el?.textContent?.trim()?.slice(0,30) || chId || '';
    } catch { return chId || ''; }
  }
  function _stuName(stuId) {
    try {
      return (typeof StudentDB !== 'undefined' ? StudentDB.getStudents() : [])
        .find(s => s.id === stuId)?.name || stuId || '';
    } catch { return stuId || ''; }
  }

})();
