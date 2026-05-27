/**
 * monitor-patch.js — v2.1 (버그 수정)
 *
 * 해피트리 영어학원 — 모니터링 자동 연동 패치
 *
 * ■ 핵심 수정사항 (v2.1)
 *   app.js 마지막에 document.addEventListener('DOMContentLoaded', App.init) 으로
 *   원본 함수 참조가 이미 등록되어 있어, App.init 래핑 방식은 동작하지 않음.
 *
 *   → App.doLogin 을 스크립트 로드 즉시(동기) 패치
 *     onclick="App.doLogin()" 은 클릭 시점에 App 객체를 조회하므로 즉시 패치가 적용됨
 *   → 나머지 패치는 DOMContentLoaded + 충분한 지연(2초)으로 App.init 완료 후 적용
 *
 * ■ 로드 순서 (index.html)
 *   app.js  →  monitor-db.js  →  monitor-app.js  →  monitor-patch.js  (맨 마지막)
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
   * ★★★ STEP 1: App.doLogin 즉시(동기) 패치 ★★★
   *
   * 이 파일이 로드되는 시점에 App은 이미 정의되어 있음.
   * onclick="App.doLogin()" 은 클릭 시 App.doLogin 을 동적 조회하므로
   * 지금 교체하면 바로 적용됨.
   * ══════════════════════════════════════════════════════ */
  (function _patchLoginNow() {
    if (typeof App === 'undefined') {
      console.warn('[MonitorPatch] App not found — 패치 실패');
      return;
    }

    const _origDoLogin = App.doLogin;

    App.doLogin = async function () {
      const id = (document.getElementById('li-id')?.value || '').trim();
      const pw =  document.getElementById('li-pw')?.value || '';

      /* ★ 히든 모니터링 모드 ─────────────────────────── */
      if (id === 'admin' &&
          typeof MonitorDB !== 'undefined' &&
          MonitorDB.isMonitorPassword(pw)) {

        // 로그인 창·앱 숨기기
        document.getElementById('login-gate')?.classList.add('hidden');
        // 비밀번호 필드 즉시 소거 (보안)
        const pwEl = document.getElementById('li-pw');
        if (pwEl) pwEl.value = '';
        // 아이디 기억 기능이 켜진 경우도 비밀번호는 저장 안 함
        localStorage.removeItem('hk_rem_pw');

        // 모니터링 대시보드 표시
        if (typeof MonitorApp !== 'undefined') {
          MonitorApp.show();
        } else {
          console.error('[MonitorPatch] MonitorApp이 로드되지 않았습니다.');
        }
        return; // 일반 로그인 처리 중단
      }

      /* 일반 로그인 처리 (원본 실행) ─────────────────── */
      await _origDoLogin.apply(this, arguments);

      /* 로그인 성공 여부 확인 → 세션 시작 */
      const gate = document.getElementById('login-gate');
      const loginSucceeded = gate?.classList.contains('hidden');
      if (loginSucceeded) {
        try {
          const sess = (typeof DB !== 'undefined') ? DB.getSession() : null;
          if (sess && typeof MonitorDB !== 'undefined') {
            await MonitorDB.startSession(sess.username, sess.role);
            _log(DB.getRole() === 'teacher' ? 'operate' : 'manage', '로그인');
          }
        } catch(e) { console.warn('[MonitorPatch] 세션 시작 오류:', e); }
      }
    };

    console.log('[MonitorPatch] ✅ doLogin 패치 완료 (즉시)');
  })();

  /* ══════════════════════════════════════════════════════
   * ★★★ STEP 2: 나머지 패치 — DOMContentLoaded 후 적용 ★★★
   *
   * App.init 은 비동기(async)이므로 충분한 지연 후 패치.
   * DOMContentLoaded 리스너는 등록 순서대로 실행되고,
   * app.js 의 App.init 리스너가 먼저 등록되었으므로 먼저 실행됨.
   * ══════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', function () {
    // App.init 이 DB 초기화(Firebase 로드, seed 등) 완료할 시간 확보
    // Firebase 초기화는 최대 5초 타임아웃 설정되어 있으므로 2초로 충분
    setTimeout(_applyRemainingPatches, 2000);
  });

  /* ══════════════════════════════════════════════════════
   * 나머지 패치 적용 함수
   * ══════════════════════════════════════════════════════ */
  function _applyRemainingPatches() {
    if (typeof App === 'undefined') return;

    /* ── logout ── */
    _wrap(App, 'logout', async () => {
      _log('logout', '로그아웃');
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

    /* ── saveClass (반 추가/수정) ── */
    _wrap(App, 'saveClass', async () => {
      const name = document.getElementById('f-cname')?.value?.trim() || '';
      const days = [...document.querySelectorAll('#modal-cls .day-ck input:checked')]
        .map(c => c.value).join(',');
      _log('manage', `반 저장: ${name}`, `요일: ${days}`);
    });

    /* ── delClass (반 삭제) ── */
    _wrap(App, 'delClass', async (id) => {
      const cls = (typeof DB !== 'undefined') ? DB.getClassById(id) : null;
      _log('manage', `반 삭제: ${cls?.name || id}`);
    });

    /* ── saveAccount (계정 저장) ── */
    _wrap(App, 'saveAccount', async () => {
      const u    = document.getElementById('f-aid')?.value?.trim() || '';
      const role = document.getElementById('f-arole')?.value || '';
      const lbl  = {admin:'관리자', manager:'매니저', operator:'운용자', teacher:'강사'};
      _log('manage', `계정 저장: ${u}`, `역할: ${lbl[role] || role}`);
    });

    /* ── delAcc (계정 삭제) ── */
    _wrap(App, 'delAcc', async (id, username) => {
      _log('manage', `계정 삭제: ${username || id}`);
    });

    /* ── delAccBulk (계정 일괄 삭제) ── */
    _wrap(App, 'delAccBulk', async () => {
      const n = document.querySelectorAll('.acc-ck:checked').length;
      _log('manage', `계정 일괄 삭제 ${n}개`);
    });

    /* ── doCopyBooks (교재 복사) ── */
    _wrap(App, 'doCopyBooks', async () => {
      const sel = document.getElementById('f-copy-from');
      const txt = sel?.options[sel.selectedIndex]?.text || '';
      _log('manage', `교재 복사: ${txt}`);
    });

    /* ── handleImport (xlsx 가져오기) ── */
    _wrap(App, 'handleImport', async (input) => {
      const f = input?.files?.[0];
      if (f) _log('operate', `xlsx 가져오기: ${f.name}`, `${input.files.length}개`);
    });

    /* ── shareUrl / shareCurrentClass ── */
    _wrap(App, 'shareUrl', async () => { _log('operate', '진도 공유 URL 생성'); });
    if (typeof App.shareCurrentClass === 'function')
      _wrap(App, 'shareCurrentClass', async () => { _log('operate', '현재 반 공유'); });

    /* ── prevWeek / nextWeek ── */
    _wrap(App, 'prevWeek', async () => { _log('operate', '이전 주로 이동'); });
    _wrap(App, 'nextWeek', async () => { _log('operate', '다음 주로 이동'); });

    /* ── BooklibApp ── */
    if (typeof BooklibApp !== 'undefined') {
      _wrap(BooklibApp, '_toggleCheck', async (clsId, bkId, stuId, chId) => {
        const bk  = _bkName(bkId);
        const stu = _stuName(stuId);
        const ch  = _chName(chId);
        _log('booklib', `교재 체크 토글: ${stu} / ${ch}`, `교재: ${bk}`);
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

    /* ── 이벤트 위임 (진도 입력 / 학생 / 직원) ── */
    _watchOperateEvents();
    _watchStudentEvents();
    _watchStaffEvents();

    console.log('[MonitorPatch] ✅ 나머지 패치 모두 적용 완료');
  }

  /* ══════════════════════════════════════════════════════
   * 이벤트 위임 — 진도 입력
   * ══════════════════════════════════════════════════════ */
  let _opWatched = false;
  function _watchOperateEvents() {
    if (_opWatched) return;
    _opWatched = true;

    // 진도 범위 입력 focusout
    document.addEventListener('focusout', e => {
      const el = e.target;
      if (!el.classList.contains('sv-bk-range') && !el.closest?.('.sv-bk-range')) return;
      const chip    = el.closest('[data-cls],[data-name]');
      const clsName = chip?.dataset?.cls || chip?.dataset?.name || '';
      const val     = (el.value || el.textContent || '').trim();
      if (val) _log('operate', `진도 입력: ${clsName}`, `값: ${val}`);
    }, true);

    // 반 칩 클릭
    document.addEventListener('click', e => {
      const chip = e.target.closest('.cls-chip, .chip-btn, [data-cls]');
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
      const card = e.target.closest('.st-card, .st-row');
      if (card) {
        const name = card.querySelector('.st-name,.st-nm')?.textContent?.trim() || '';
        if (name) _log('students', `학생 조회: ${name}`);
      }
      const btn = e.target.closest('[data-status]');
      if (btn) _log('students', `재원 상태 변경: ${btn.dataset.status}`);
    });
    const srch = pg.querySelector('#st-search, .st-search');
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
      const card = e.target.closest('.sf-card, .sf-row');
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
    try {
      return (typeof BookLibDB !== 'undefined' && BookLibDB.getBook(bkId))?.name || bkId || '';
    } catch { return bkId || ''; }
  }
  function _chName(chId) {
    try {
      const el = document.querySelector(`[data-ch="${chId}"] .bl-ch-t,[data-chid="${chId}"]`);
      return el?.textContent?.trim()?.slice(0,30) || chId || '';
    } catch { return chId || ''; }
  }
  function _stuName(stuId) {
    try {
      const stus = typeof StudentDB !== 'undefined' ? StudentDB.getStudents() : [];
      return stus.find(s => s.id === stuId)?.name || stuId || '';
    } catch { return stuId || ''; }
  }

})();
