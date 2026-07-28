/**
 * notice-app.js — v1
 * ─────────────────────────────────────────────────────────────
 * 진도 사이트 "공지 알림 팝업" 기능
 *
 * 배경: 원장이 바쁜 업무 중 교재비·수업료 등 공지 시점을 놓치는 문제를
 *       해결하기 위해, 예약해둔 시점이 도래하면 진도 사이트에서 자동으로
 *       팝업을 띄워 인지시켜준다.
 *
 * 구성:
 *  - 헤더 🔔 버튼: 등록된 알림 목록 확인 + 새 알림 등록/수정/삭제 (관리자)
 *  - 자동 팝업: 예약 시점이 지나면 30초 주기로 감지해 자동으로 표시.
 *    "✅ 완료 처리"(서버 기록, 모든 기기에서 해당 회차 종료) 또는
 *    "⏰ 나중에"(이번 세션에서만 임시로 닫음, 다음 접속 시 다시 표시)
 *
 * 독립 모듈: 오류가 나도 기존 진도/반/계정 기능에 전혀 영향을 주지 않도록
 *            app.js에서 try/catch로 감싸서 초기화한다 (다른 모듈과 동일 패턴).
 */
const NoticeApp = (() => {
  const CATS = {
    textbook: { ico: '📚', label: '교재비' },
    tuition:  { ico: '💰', label: '수업료' },
    general:  { ico: '📢', label: '일반' },
  };

  let _timer = null;
  let _popupShowing = false;
  let _centerOpen = false;
  let _editId = null;

  function _esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function _q(id) { return document.getElementById(id); }

  /* ═══════════════════════════════════════════════════════════
   * 스타일 주입 (최초 1회)
   * ═══════════════════════════════════════════════════════════ */
  let _cssInjected = false;
  function _css() {
    if (_cssInjected) return; _cssInjected = true;
    const s = document.createElement('style');
    s.textContent = `
.ntc-pill-row{display:flex;gap:6px;flex-wrap:wrap}
.ntc-pill{padding:8px 12px;border-radius:999px;border:1.5px solid var(--bdr2);background:var(--card2);color:var(--tx2);font-size:12.5px;font-weight:700;cursor:pointer;transition:all .15s}
.ntc-pill.on{border-color:var(--a);background:var(--a10);color:var(--a)}
.ntc-item{display:flex;align-items:flex-start;gap:10px;background:var(--card2);border:1px solid var(--bdr);border-radius:12px;padding:12px;margin-bottom:8px}
.ntc-item.due{border-color:#ef4444;background:rgba(239,68,68,.07)}
.ntc-item.off{opacity:.5}
.ntc-ico{font-size:20px;flex-shrink:0;margin-top:1px}
.ntc-body{flex:1;min-width:0}
.ntc-title{font-size:13.5px;font-weight:800;color:var(--tx)}
.ntc-meta{font-size:11px;color:var(--tx3);margin-top:2px}
.ntc-msg{font-size:12px;color:var(--tx2);margin-top:5px;white-space:pre-line;line-height:1.5}
.ntc-acts{display:flex;gap:5px;flex-shrink:0}
.ntc-ibtn{width:28px;height:28px;border-radius:8px;background:var(--surf2);border:1px solid var(--bdr);display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer}
.ntc-badge{display:inline-block;font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;background:#ef4444;color:#fff;margin-left:6px;vertical-align:middle}
.ntc-badge.off{background:var(--surf2);color:var(--tx3)}
.ntc-empty{text-align:center;color:var(--tx3);font-size:12.5px;padding:30px 10px}
.ntc-active-ck{display:flex;align-items:center;gap:8px;cursor:pointer;padding:2px 0}
.ntc-active-ck input{width:17px;height:17px;flex-shrink:0;accent-color:var(--a);cursor:pointer}
.ntc-active-ck span{font-size:12.5px;color:var(--tx)}
.ntc-pop-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:3000;display:flex;align-items:center;justify-content:center;padding:20px}
.ntc-pop-box{background:var(--card,#fff);border-radius:18px;padding:24px;max-width:400px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.35);animation:ntcPop .25s cubic-bezier(.34,1.56,.64,1)}
@keyframes ntcPop{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}
.ntc-pop-ico{font-size:34px;margin-bottom:10px}
.ntc-pop-title{font-size:17px;font-weight:800;color:var(--tx);margin-bottom:6px}
.ntc-pop-msg{font-size:13.5px;color:var(--tx2);line-height:1.6;white-space:pre-line;margin-bottom:18px}
.ntc-pop-acts{display:flex;gap:8px}
    `;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════════
   * 초기화
   * ═══════════════════════════════════════════════════════════ */
  async function init() {
    _css();
    if (typeof NoticeDB === 'undefined') return;
    await NoticeDB.init();
    NoticeDB.on('notices', () => { _checkDue(); if (_centerOpen) _renderCenter(); });
    refreshUI();
    _checkDue();
    clearInterval(_timer);
    _timer = setInterval(_checkDue, 30000); // 30초마다 예약 시점 도래 여부 확인
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') _checkDue();
    });
  }

  // 로그인 상태에 따라 헤더 🔔 버튼 표시/숨김 (app.js _refreshAuthUI에서 호출)
  function refreshUI() {
    const btn = _q('op-notice-btn');
    if (!btn) return;
    const loggedIn = (typeof DB !== 'undefined') && DB.isLoggedIn();
    btn.classList.toggle('hidden', !loggedIn);
    _updateBadge();
  }

  /* ═══════════════════════════════════════════════════════════
   * 스케줄 계산
   * ═══════════════════════════════════════════════════════════ */
  function _targetDate(n, ref) {
    const [hh, mm] = (n.time || '09:00').split(':').map(Number);
    if (n.scheduleType === 'monthly') {
      const y = ref.getFullYear(), mo = ref.getMonth();
      const dim = new Date(y, mo + 1, 0).getDate(); // 해당 월 마지막 날
      const day = Math.min(+n.monthDay || 1, dim);
      return new Date(y, mo, day, hh || 9, mm || 0, 0);
    }
    if (!n.onceDate) return null;
    const [y, mo, d] = n.onceDate.split('-').map(Number);
    return new Date(y, mo - 1, d, hh || 9, mm || 0, 0);
  }
  // 회차 식별 키: 1회성은 날짜 자체, 매월 반복은 '연-월'
  function _periodKey(n, ref) {
    if (n.scheduleType === 'monthly') return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
    return n.onceDate || 'once';
  }
  function _isDue(n, ref) {
    if (!n.active) return false;
    const t = _targetDate(n, ref);
    if (!t || ref < t) return false;
    const pk = _periodKey(n, ref);
    return !(n.completedPeriods && n.completedPeriods[pk]);
  }
  function _audienceOk(n) {
    if (typeof DB === 'undefined' || !DB.isLoggedIn()) return false;
    return n.audience === 'all' ? true : DB.isAdmin();
  }
  function _dueList() {
    const ref = new Date();
    return NoticeDB.getAll().filter(n => _audienceOk(n) && _isDue(n, ref));
  }
  function _dismissKey(n, ref) { return `ntc_dismiss_${n.id}_${_periodKey(n, ref)}`; }

  /* ═══════════════════════════════════════════════════════════
   * 도래 감지 → 배지 갱신 + 자동 팝업
   * ═══════════════════════════════════════════════════════════ */
  function _checkDue() {
    if (typeof NoticeDB === 'undefined') return;
    const ref = new Date();
    const due = _dueList();
    _updateBadge(due.length);
    if (_popupShowing || _centerOpen || _q('ntc-editor-ov')) return;
    const target = due.find(n => !sessionStorage.getItem(_dismissKey(n, ref)));
    if (target) _showPopup(target, ref);
  }
  function _updateBadge(count) {
    const b = _q('notice-badge');
    if (!b) return;
    const n = count !== undefined ? count : _dueList().length;
    if (n > 0) { b.textContent = n > 9 ? '9+' : n; b.classList.remove('hidden'); }
    else b.classList.add('hidden');
  }

  /* ═══════════════════════════════════════════════════════════
   * 자동 팝업
   * ═══════════════════════════════════════════════════════════ */
  function _showPopup(n, ref) {
    _popupShowing = true;
    _q('ntc-pop-ov')?.remove();
    const cat = CATS[n.category] || CATS.general;
    const isAdmin = (typeof DB !== 'undefined') && DB.isAdmin();
    const ov = document.createElement('div');
    ov.id = 'ntc-pop-ov'; ov.className = 'ntc-pop-ov';
    ov.innerHTML = `
      <div class="ntc-pop-box">
        <div class="ntc-pop-ico">${cat.ico}</div>
        <div class="ntc-pop-title">${_esc(n.title)}</div>
        ${n.body ? `<div class="ntc-pop-msg">${_esc(n.body)}</div>` : '<div style="height:12px"></div>'}
        <div class="ntc-pop-acts">
          <button class="btn-x" id="ntc-pop-later">⏰ 나중에</button>
          ${isAdmin ? '<button class="btn-ok" id="ntc-pop-done">✅ 완료 처리</button>'
                    : '<button class="btn-ok" id="ntc-pop-ok">확인</button>'}
        </div>
      </div>`;
    document.body.appendChild(ov);

    const _close = () => { ov.remove(); _popupShowing = false; setTimeout(_checkDue, 300); };
    _q('ntc-pop-later').onclick = () => { sessionStorage.setItem(_dismissKey(n, ref), '1'); _close(); };
    const doneBtn = _q('ntc-pop-done') || _q('ntc-pop-ok');
    doneBtn.onclick = async () => {
      doneBtn.disabled = true;
      if (isAdmin && doneBtn.id === 'ntc-pop-done') {
        await NoticeDB.markPeriodComplete(n.id, _periodKey(n, ref));
      } else {
        sessionStorage.setItem(_dismissKey(n, ref), '1');
      }
      _close();
    };
  }

  /* ═══════════════════════════════════════════════════════════
   * 알림 센터 (목록 확인 + 관리)
   * ═══════════════════════════════════════════════════════════ */
  function openCenter() {
    if (typeof NoticeDB === 'undefined') return;
    _centerOpen = true;
    _q('ntc-center-ov')?.remove();
    const isAdmin = (typeof DB !== 'undefined') && DB.isAdmin();
    const ov = document.createElement('div');
    ov.id = 'ntc-center-ov'; ov.className = 'ov';
    ov.onclick = e => { if (e.target === ov) closeCenter(); };
    ov.innerHTML = `
      <div class="sh" style="max-height:88vh">
        <div class="sh-handle"></div>
        <div class="sh-title">🔔 공지 알림 관리</div>
        <div class="sh-sub" style="color:var(--tx3);font-size:11.5px;line-height:1.5;margin-bottom:10px">
          교재비·수업료 등 공지할 시점을 등록해두면, 그 시점에 자동으로 팝업이 표시됩니다.
        </div>
        <div id="ntc-list"></div>
        ${isAdmin ? '<button class="btn-ok" style="width:100%;margin-top:6px" onclick="NoticeApp.openEditor()">➕ 새 알림 등록</button>' : ''}
        <button class="btn-x" style="width:100%;margin-top:8px" onclick="NoticeApp.closeCenter()">닫기</button>
      </div>`;
    document.body.appendChild(ov);
    _renderCenter();
  }
  function closeCenter() {
    _centerOpen = false;
    _q('ntc-center-ov')?.remove();
    _checkDue();
  }
  function _renderCenter() {
    const wrap = _q('ntc-list');
    if (!wrap) return;
    const isAdmin = (typeof DB !== 'undefined') && DB.isAdmin();
    const ref = new Date();
    // 관리자는 전체 알림을 관리 목적으로 모두 보고, 비관리자는 본인이 볼 수 있는 알림만
    const list = NoticeDB.getAll().filter(n => isAdmin || _audienceOk(n));
    wrap.innerHTML = '';
    if (!list.length) { wrap.innerHTML = '<div class="ntc-empty">등록된 알림이 없습니다</div>'; return; }
    list
      .slice()
      .sort((a, b) => {
        const da = _isDue(a, ref), db = _isDue(b, ref);
        if (da !== db) return da ? -1 : 1;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      })
      .forEach(n => {
        const cat = CATS[n.category] || CATS.general;
        const due = _isDue(n, ref);
        const schedTxt = n.scheduleType === 'monthly'
          ? `매월 ${n.monthDay}일 ${n.time}`
          : `${n.onceDate} ${n.time} (1회)`;
        const audTxt = n.audience === 'all' ? '전체 로그인 사용자' : '원장/관리자만';
        const el = document.createElement('div');
        el.className = 'ntc-item' + (due ? ' due' : '') + (!n.active ? ' off' : '');
        el.innerHTML = `
          <div class="ntc-ico">${cat.ico}</div>
          <div class="ntc-body">
            <div class="ntc-title">${_esc(n.title)}${due ? '<span class="ntc-badge">도래함</span>' : ''}${!n.active ? '<span class="ntc-badge off">비활성</span>' : ''}</div>
            <div class="ntc-meta">${cat.label} · ${schedTxt} · ${audTxt}</div>
            ${n.body ? `<div class="ntc-msg">${_esc(n.body)}</div>` : ''}
          </div>
          ${isAdmin ? `<div class="ntc-acts">
            ${due ? `<button class="ntc-ibtn" title="완료 처리" onclick="NoticeApp.completeNow('${n.id}')">✅</button>` : ''}
            <button class="ntc-ibtn" title="수정" onclick="NoticeApp.openEditor('${n.id}')">✏️</button>
            <button class="ntc-ibtn" title="삭제" onclick="NoticeApp.deleteNotice('${n.id}')">🗑</button>
          </div>` : ''}
        `;
        wrap.appendChild(el);
      });
  }

  async function completeNow(id) {
    const n = NoticeDB.getById(id); if (!n) return;
    await NoticeDB.markPeriodComplete(id, _periodKey(n, new Date()));
    _renderCenter(); _checkDue();
    if (typeof App !== 'undefined' && App._toast) App._toast('✅ 알림을 완료 처리했습니다', 'success');
  }
  async function deleteNotice(id) {
    const n = NoticeDB.getById(id); if (!n) return;
    if (!confirm(`"${n.title}" 알림을 삭제할까요?`)) return;
    await NoticeDB.remove(id);
    _renderCenter(); _checkDue();
  }

  /* ═══════════════════════════════════════════════════════════
   * 등록 / 수정 폼
   * ═══════════════════════════════════════════════════════════ */
  function openEditor(id = null) {
    _editId = id;
    NoticeDB.pauseUpdates(true); // ★ 편집 중엔 서버 갱신이 화면을 덮어쓰지 않도록
    const n = id ? NoticeDB.getById(id) : null;
    _q('ntc-editor-ov')?.remove();
    const ov = document.createElement('div');
    ov.id = 'ntc-editor-ov'; ov.className = 'ov';
    ov.style.zIndex = 900;
    ov.onclick = e => { if (e.target === ov) closeEditor(); };
    const cat = n?.category || 'general';
    const schedType = n?.scheduleType || 'once';
    const today = new Date();
    const y = today.getFullYear(), m = String(today.getMonth() + 1).padStart(2, '0'), d = String(today.getDate()).padStart(2, '0');
    ov.innerHTML = `
      <div class="sh" style="max-height:92vh;overflow-y:auto">
        <div class="sh-handle"></div>
        <div class="sh-title">${n ? '✏️ 알림 수정' : '➕ 새 알림 등록'}</div>
        <div class="f-grp">
          <label class="f-lbl">제목</label>
          <input class="f-inp" id="ntc-f-title" maxlength="40" placeholder="예: 8월 신규 교재 안내" value="${_esc(n?.title || '')}">
        </div>
        <div class="f-grp">
          <label class="f-lbl">내용 (선택)</label>
          <textarea class="f-inp" id="ntc-f-body" rows="3" placeholder="공지에 포함할 세부 내용" style="resize:vertical">${_esc(n?.body || '')}</textarea>
        </div>
        <div class="f-grp">
          <label class="f-lbl">분류</label>
          <div class="ntc-pill-row" id="ntc-f-cat">
            ${Object.entries(CATS).map(([k, v]) => `<button type="button" class="ntc-pill${k === cat ? ' on' : ''}" data-v="${k}">${v.ico} ${v.label}</button>`).join('')}
          </div>
        </div>
        <div class="f-grp">
          <label class="f-lbl">반복 유형</label>
          <div class="ntc-pill-row" id="ntc-f-sched">
            <button type="button" class="ntc-pill${schedType === 'once' ? ' on' : ''}" data-v="once">1회성 (특정 날짜)</button>
            <button type="button" class="ntc-pill${schedType === 'monthly' ? ' on' : ''}" data-v="monthly">매월 반복</button>
          </div>
        </div>
        <div class="f-grp" id="ntc-f-once-wrap" style="display:${schedType === 'once' ? 'flex' : 'none'};gap:10px">
          <div style="flex:1">
            <label class="f-lbl">날짜</label>
            <input class="f-inp" id="ntc-f-date" type="date" value="${n?.onceDate || `${y}-${m}-${d}`}">
          </div>
          <div style="width:110px">
            <label class="f-lbl">시간</label>
            <input class="f-inp" id="ntc-f-time-once" type="time" value="${n?.time || '09:00'}">
          </div>
        </div>
        <div class="f-grp" id="ntc-f-monthly-wrap" style="display:${schedType === 'monthly' ? 'flex' : 'none'};gap:10px">
          <div style="flex:1">
            <label class="f-lbl">매월 며칠</label>
            <input class="f-inp" id="ntc-f-day" type="number" min="1" max="31" value="${n?.monthDay || 1}">
          </div>
          <div style="width:110px">
            <label class="f-lbl">시간</label>
            <input class="f-inp" id="ntc-f-time-monthly" type="time" value="${n?.time || '09:00'}">
          </div>
        </div>
        <div class="f-grp">
          <label class="f-lbl">알림 대상</label>
          <div class="ntc-pill-row" id="ntc-f-aud">
            <button type="button" class="ntc-pill${(n?.audience || 'admin') === 'admin' ? ' on' : ''}" data-v="admin">🔑 원장/관리자만</button>
            <button type="button" class="ntc-pill${n?.audience === 'all' ? ' on' : ''}" data-v="all">👥 전체 로그인 사용자</button>
          </div>
        </div>
        <div class="f-grp">
          <label class="ntc-active-ck">
            <input type="checkbox" id="ntc-f-active" ${n?.active !== false ? 'checked' : ''}>
            <span>사용 (활성화)</span>
          </label>
        </div>
        <div class="sh-acts">
          <button class="btn-x" onclick="NoticeApp.closeEditor()">취소</button>
          <button class="btn-ok" onclick="NoticeApp.saveEditor()">저장</button>
        </div>
      </div>`;
    document.body.appendChild(ov);

    ov.querySelectorAll('#ntc-f-cat .ntc-pill').forEach(b => b.onclick = () => {
      ov.querySelectorAll('#ntc-f-cat .ntc-pill').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });
    ov.querySelectorAll('#ntc-f-aud .ntc-pill').forEach(b => b.onclick = () => {
      ov.querySelectorAll('#ntc-f-aud .ntc-pill').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });
    ov.querySelectorAll('#ntc-f-sched .ntc-pill').forEach(b => b.onclick = () => {
      ov.querySelectorAll('#ntc-f-sched .ntc-pill').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      const v = b.dataset.v;
      _q('ntc-f-once-wrap').style.display = v === 'once' ? 'flex' : 'none';
      _q('ntc-f-monthly-wrap').style.display = v === 'monthly' ? 'flex' : 'none';
    });
    setTimeout(() => _q('ntc-f-title')?.focus(), 150);
  }
  function closeEditor() { _q('ntc-editor-ov')?.remove(); _editId = null; NoticeDB.pauseUpdates(false); }

  async function saveEditor() {
    const title = _q('ntc-f-title')?.value.trim();
    if (!title) { alert('제목을 입력해주세요'); return; }
    const cat = document.querySelector('#ntc-f-cat .ntc-pill.on')?.dataset.v || 'general';
    const sched = document.querySelector('#ntc-f-sched .ntc-pill.on')?.dataset.v || 'once';
    const aud = document.querySelector('#ntc-f-aud .ntc-pill.on')?.dataset.v || 'admin';
    const active = _q('ntc-f-active')?.checked !== false;
    const body = _q('ntc-f-body')?.value.trim() || '';
    const data = { title, body, category: cat, scheduleType: sched, audience: aud, active };
    if (sched === 'once') {
      data.onceDate = _q('ntc-f-date')?.value || '';
      data.time = _q('ntc-f-time-once')?.value || '09:00';
      if (!data.onceDate) { alert('날짜를 선택해주세요'); return; }
    } else {
      data.monthDay = Math.min(31, Math.max(1, +_q('ntc-f-day')?.value || 1));
      data.time = _q('ntc-f-time-monthly')?.value || '09:00';
    }
    if (_editId) await NoticeDB.update(_editId, data);
    else await NoticeDB.add(data);
    closeEditor();
    if (_centerOpen) _renderCenter();
    _checkDue();
    if (typeof App !== 'undefined' && App._toast) App._toast('✅ 알림이 저장되었습니다', 'success');
  }

  // ★ 대시보드 등 외부 화면에서 사용하는 조회 헬퍼
  function getDueList() {
    if (typeof NoticeDB === 'undefined') return [];
    return _dueList();
  }
  function getUpcomingList(limit = 5) {
    if (typeof NoticeDB === 'undefined') return [];
    const ref = new Date();
    return NoticeDB.getAll()
      .filter(n => _audienceOk(n) && n.active && !_isDue(n, ref))
      .map(n => ({ n, t: _targetDate(n, ref) }))
      .filter(x => x.t)
      .sort((a, b) => a.t.getTime() - b.t.getTime())
      .slice(0, limit)
      .map(x => x.n);
  }
  function getCatMeta(key) { return CATS[key] || CATS.general; }

  return {
    init, refreshUI,
    openCenter, closeCenter,
    openEditor, closeEditor, saveEditor,
    completeNow, deleteNotice,
    getDueList, getUpcomingList, getCatMeta,
  };
})();
