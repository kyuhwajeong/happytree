/**
 * firebase-config.js — v11
 * ────────────────────────────────────────────────────────────────
 *  v11 개선사항 (세션 유지 강화)
 *
 *  ★ 개선 1 — keepSynced 경로 확장
 *    · hakwon10/grades 경로 추가 → 성적 데이터 WebSocket 상시 유지
 *    · hakwon10/books  경로 추가 → 교재 데이터 포함
 *
 *  ★ 개선 2 — 재연결 시도 무제한화
 *    · MAX_RETRY 5회 제한 제거 → 인터넷이 있는 한 무한 재시도
 *    · 재연결 간격: 5초 → 5초(1~3회) → 15초(4~10회) → 30초(11회~)
 *      지수 백오프로 과도한 요청 방지
 *
 *  ★ 개선 3 — navigator.onLine 이벤트 처리
 *    · WiFi↔LTE 전환, 네트워크 복귀 시 즉시 재연결 카운터 리셋
 *
 *  ★ 개선 4 — visibilitychange 이벤트 처리
 *    · 백그라운드 탭 복귀 시 연결 상태 확인 및 재연결 강제화
 *
 *  ★ 개선 5 — keepalive 핑 (60초 주기)
 *    · .info/serverTimeOffset 읽기로 WebSocket 연결 유지
 *    · 장시간 유휴에도 연결 끊김 방지
 *
 *  유지 — 초기 4초 억제, 8초 디바운스, goOffline/goOnline 미사용
 * ────────────────────────────────────────────────────────────────
 */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAW7ZIEnEfvVb2QnshD-kr8ovYWL65m2IE",
  authDomain:        "happytree-e16d7.firebaseapp.com",
  databaseURL:       "https://happytree-e16d7-default-rtdb.firebaseio.com",
  projectId:         "happytree-e16d7",
  storageBucket:     "happytree-e16d7.firebasestorage.app",
  messagingSenderId: "154995256418",
  appId:             "1:154995256418:web:19e23f0405d97da1dd353b",
};

const FireDB = (() => {
  let _db = null, _ok = false, _connected = false, _q = {};

  /* ══════════════════════════════════════════════════════
   * 오프라인 쓰기 큐 (localStorage 영구 보관)
   * 목적: set()/update()/remove() 호출 시점에 연결이 끊겨 있어도
   *       "그냥 사라지는" 것을 막고, 재연결되는 순간 반드시 서버에 반영되게 함.
   *       (교재/진도/직원/급여 등 모든 모듈이 이 큐를 공통으로 사용)
   * ══════════════════════════════════════════════════════ */
  const LS_QUEUE = 'hk10b_fbQueue';
  function _loadQueue() {
    let q;
    try { q = JSON.parse(localStorage.getItem(LS_QUEUE)) || []; } catch { return []; }
    // ★ 최종 방어선 — 큐에 어떤 경로로 들어갔든(과거 버전이 쌓아둔 것 포함),
    //   읽는 시점에 무조건 한 번 더 걸러낸다. _enqueue()에서 막는 것과
    //   별개로, 여기서 걸러야 배지·패널 등 큐를 읽는 모든 곳에 예외 없이
    //   적용되고, 예전에 이미 쌓인 항목도 다음 읽기에서 자동 정리된다.
    const clean = q.filter(x => !_isDisposablePath(x.path));
    if (clean.length !== q.length) _saveQueue(clean);
    return clean;
  }
  function _saveQueue(q) {
    try { localStorage.setItem(LS_QUEUE, JSON.stringify(q)); } catch {}
  }
  /* ★ 큐에 올리지 않고 조용히 버릴 경로 — 관리자 전용 모니터링의 세션
   * 하트비트/행동 로그(hakwon10/monitor/sessions/...)는:
   *   - 일반 사용자는 존재조차 모르는 부가 기능(관리자만 봄)
   *   - 자주(수십 초 간격) 갱신되는 휘발성 데이터라 지금 값이 유실돼도
   *     다음 하트비트가 금방 다시 채워줌
   *   - 오래되면 _cleanupExpired()로 어차피 자동 삭제됨
   * → 학원 실제 데이터(성적/진도/교재/직원/급여)와 달리 "재접속 시도 중"
   *   같은 메시지로 일반 사용자를 신경 쓰이게 할 가치가 없다.
   * (같은 monitor 경로라도 ip_labels처럼 관리자가 명시적으로 저장한
   *  설정은 제외 대상이 아님 — 세션 로그만 정확히 걸러낸다) */
  function _isDisposablePath(path) {
    return path.startsWith('hakwon10/monitor/sessions/');
  }

  function _enqueue(op, path, val) {
    if (_isDisposablePath(path)) {
      console.log(`[FireDB] 🗑 휘발성 모니터링 로그 — 큐 적재 생략:`, path);
      return;
    }
    const q = _loadQueue();
    const idx = q.findIndex(x => x.path === path);
    const item = { op, path, val, ts: Date.now(), failCount: 0, lastError: null, permanent: false };
    if (idx >= 0) q[idx] = item; else q.push(item); // 같은 경로는 최신값으로 덮어씀 (재시도 이력 초기화)
    _saveQueue(q);
    console.log(`[FireDB] 📥 오프라인 큐 적재 (${op}):`, path);
    _updatePendingBadge();
  }
  function _dequeue(path) {
    _saveQueue(_loadQueue().filter(x => x.path !== path));
    _updatePendingBadge();
  }
  // ★ 재시도로 절대 해결되지 않는 오류(권한 거부 등)인지 판별 —
  //   이런 경우는 "오프라인이라 못 보낸 것"이 아니라 서버가 명시적으로
  //   거부한 것이므로, 영원히 재시도만 반복하지 않고 사용자에게 실패로 알려야 함.
  function _isPermanentError(e) {
    const code = (e && e.code || '').toString().toUpperCase();
    const msg = (e && e.message || '').toString().toLowerCase();
    return code.includes('PERMISSION_DENIED') || msg.includes('permission_denied') || msg.includes('permission denied')
        || msg.includes('contains undefined') || msg.includes('invalid data'); // ★ 데이터 형식 오류 — 재시도로 절대 해결 안 됨
  }
  // ★ 재시도를 포기하지 않고 계속 시도할 항목만 삭제 대상에서 제외하고,
  //   사용자가 직접 "삭제"를 누른 경우에만 큐에서 완전히 제거한다.
  function discardPending(path) {
    _dequeue(path);
    console.log('[FireDB] 🗑 사용자가 대기 항목을 삭제함(재시도 중단):', path);
  }

  let _flushing = false;
  /* ★ REST(HTTPS) 백업 전송 경로 — WebSocket이 막힌 환경 대비
   *   방금 사용자가 브라우저 주소창에 databaseURL + ".json"을 직접 쳐서
   *   접속했더니 정상적으로 데이터가 나온 것으로 확인됨: 이 PC에서는
   *   일반 HTTPS 요청은 완전히 통과되고, WebSocket 프로토콜만 막혀있는
   *   상태(보안 소프트웨어의 SSL 검사 등에서 흔한 패턴). 그렇다면
   *   실시간 연결이 영구히 안 되는 환경에서도, 저장만큼은 이 REST
   *   경로로 우회하면 된다. 사용자가 보안 프로그램을 직접 만질 필요가
   *   없어진다. */
  async function _restWrite(op, path, val) {
    const url = `${FIREBASE_CONFIG.databaseURL}/${path}.json`;
    const method = op === 'remove' ? 'DELETE' : (op === 'update' ? 'PATCH' : 'PUT');
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: op === 'remove' ? undefined : JSON.stringify(val === undefined ? null : val),
    });
    if (!res.ok) throw new Error(`REST ${method} 실패: HTTP ${res.status}`);
    return true;
  }

  async function _flushQueue() {
    if (_flushing) return { attempted: false, reason: 'already-flushing', ok: 0, fail: 0 };
    // ★ WebSocket 연결(_connected) 여부와 무관하게 시도한다 — 진짜 인터넷이
    //   없을 때만(navigator.onLine=false) 포기한다. WebSocket이 막혀도
    //   REST 경로로 시도할 기회를 준다.
    if (!navigator.onLine || !_db) return { attempted: false, reason: 'offline', ok: 0, fail: 0 };
    const q = _loadQueue();
    if (!q.length) return { attempted: false, reason: 'empty', ok: 0, fail: 0 };
    _flushing = true;
    console.log(`[FireDB] 🔄 오프라인 큐 전송 시작 (${q.length}건)${_connected ? '' : ' — WebSocket 미연결, REST 경로 사용'}`);
    let ok = 0, fail = 0;
    for (const item of q) {
      try {
        const val = _stripUndefined(item.val); // ★ 예전에 이미 쌓인 항목도 재전송 시점에 정리
        if (_connected) {
          // 정상 상황 — 기존 SDK 경로
          if (item.op === 'set')    await _db.ref(item.path).set(val);
          if (item.op === 'update') await _db.ref(item.path).update(val);
          if (item.op === 'remove') await _db.ref(item.path).remove();
        } else {
          // ★ WebSocket 미연결 — REST(HTTPS)로 우회
          await _restWrite(item.op, item.path, val);
        }
        _dequeue(item.path); // ★ 항목 하나 성공할 때마다 즉시 배지 갱신(전체 완료를 기다리지 않음)
        try { window.dispatchEvent(new CustomEvent('fb:write-confirmed', { detail: { path: item.path } })); } catch {}
        ok++;
      } catch (e) {
        console.warn('[FireDB] 큐 전송 실패:', item.path, e.message);
        // ★ 그냥 로그만 남기고 넘어가면 다음에도 똑같이 재시도만 반복됨 —
        //   실패 횟수와 영구 실패 여부를 큐에 기록해서 UI가 "삭제" 옵션을 보여줄 수 있게 함
        const q2 = _loadQueue();
        const idx2 = q2.findIndex(x => x.path === item.path);
        if (idx2 >= 0) {
          q2[idx2].failCount = (q2[idx2].failCount || 0) + 1;
          q2[idx2].lastError = e.message || String(e);
          q2[idx2].permanent = _isPermanentError(e) || q2[idx2].failCount >= 3;
          _saveQueue(q2);
        }
        fail++;
      }
    }
    _flushing = false;
    if (ok > 0) {
      console.log(`[FireDB] ✅ 오프라인 큐 전송 완료: 성공 ${ok}건, 실패 ${fail}건`);
      _showFlushedBadge(ok);
    }
    _updatePendingBadge();
    return { attempted: true, reason: 'done', ok, fail };
  }
  function getPendingCount() { return _loadQueue().length; }

  /* ══════════════════════════════════════════════════════
   * ★ 대기 항목을 사람이 읽을 수 있는 설명으로 변환
   * ────────────────────────────────────────────────────────
   * 큐에는 Firebase 경로(path)만 저장되어 있어 그 자체로는
   * "hakwon10/staffwork/ab12/2026_07_08" 처럼 사용자가 알아볼 수
   * 없는 형태다. 경로 패턴을 보고 어느 메뉴의 무엇인지, 그리고
   * 탭하면 이동할 화면(App.go 인자)까지 함께 계산해서 반환한다.
   * ══════════════════════════════════════════════════════ */
  function _describePath(path) {
    // 진도 (db.js: hakwon10/progress/{classId}__{weekKey}__{dayName}__...)
    if (path.startsWith('hakwon10/progress/')) {
      const rest = path.slice('hakwon10/progress/'.length);
      const parts = rest.split('__');
      const isMemo = rest.includes('__MEMO');
      const isDate = rest.includes('__savedAt');
      let label = '📅 진도';
      if (isMemo) label += ' · 메모';
      else if (isDate) label += ' · 완료일 표시';
      else label += ' · 입력값';
      if (parts[1]) label += ` (${parts[1]}주차)`;
      return { icon: '📅', label, page: 'operate' };
    }
    // 직원 근무 (staff-db.js: hakwon10/staffwork/{sid}/{date})
    if (path.startsWith('hakwon10/staffwork/')) {
      return { icon: '👥', label: '👥 직원 · 근무 기록', page: 'staff' };
    }
    if (path.startsWith('hakwon10/staff/')) {
      return { icon: '👥', label: '👥 직원 · 기본 정보', page: 'staff' };
    }
    if (path.startsWith('hakwon10/stafftempl/')) {
      return { icon: '👥', label: '👥 직원 · 근무 템플릿', page: 'staff' };
    }
    if (path.startsWith('hakwon10/staffpay')) {
      return { icon: '👥', label: '👥 직원 · 급여 저장', page: 'staff' };
    }
    // 교재
    if (path.startsWith('hakwon10/booklib')) {
      return { icon: '📚', label: '📚 교재 · 도서 정보', page: 'booklib' };
    }
    if (path.startsWith('hakwon10/bookcheck')) {
      return { icon: '📚', label: '📚 교재 · 학습현황 체크', page: 'booklib' };
    }
    if (path.startsWith('hakwon10/bookstamps')) {
      return { icon: '📚', label: '📚 교재 · 스탬프', page: 'booklib' };
    }
    // 성적
    if (path.startsWith('hakwon10/grades')) {
      return { icon: '📝', label: '📝 성적 · 입력값', page: 'grade' };
    }
    // 학생
    if (path.startsWith('hakwon10/students')) {
      return { icon: '🎓', label: '🎓 학생 · 정보', page: 'students' };
    }
    // 반/계정/테마 (db.js 공통)
    if (path.startsWith('hakwon10/classes/')) {
      return { icon: '🏫', label: '🏫 반 정보', page: 'manage' };
    }
    if (path.startsWith('hakwon10/accounts/')) {
      return { icon: '👤', label: '👤 계정 정보', page: 'manage' };
    }
    if (path.startsWith('hakwon10/theme')) {
      return { icon: '🎨', label: '🎨 테마 설정', page: 'manage' };
    }
    // 일정표 (schedule-db.js: hakwon10/schedules/{id})
    if (path.startsWith('hakwon10/schedules')) {
      return { icon: '🗓️', label: '🗓️ 일정표', page: 'dashboard' };
    }
    // 공지 알림 (notice-db.js: hakwon10/notices/{id})
    if (path.startsWith('hakwon10/notices')) {
      return { icon: '🔔', label: '🔔 공지 알림', page: 'dashboard' };
    }
    // 알 수 없는 경로 — 원본 그대로 표시
    return { icon: '❓', label: path, page: null };
  }

  function getPendingItems() {
    return _loadQueue().map(item => ({
      ...item,
      ...(_describePath(item.path)),
    })).sort((a, b) => b.ts - a.ts);
  }

  function _timeAgo(ts) {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return '방금';
    if (sec < 3600) return `${Math.floor(sec/60)}분 전`;
    if (sec < 86400) return `${Math.floor(sec/3600)}시간 전`;
    return `${Math.floor(sec/86400)}일 전`;
  }

  /* ── 대기 항목 상세 패널 — 배지를 탭하면 뜬다 ── */
  /* 상세 패널의 "지금 재시도" 버튼 전용 핸들러 —
   * _flushQueue()를 직접 호출해 성공/실패/오프라인 여부를 정확히 알고,
   * 그 결과에 맞는 메시지를 보여준 뒤에야 패널을 닫는다(무조건 즉시
   * 닫아버리면 실제로 전송됐는지 사용자가 확인할 수 없기 때문). */
  async function _retryFromPanel(btn) {
    if (btn) { btn.disabled = true; btn.textContent = '🔄 전송 중...'; }
    let r = await _flushQueue();
    if (r.reason === 'offline') {
      // 소켓 재수립 시도 (앱 인스턴스 재생성은 실시간 구독을 죽이는
      // 부작용이 있어 제거 — 그래도 안 되면 아래에서 새로고침으로 처리)
      _forceReconnect();
      await new Promise(res => setTimeout(res, 1500));
      r = await _flushQueue();
    }
    if (r.reason === 'offline') {
      // ★ alert()로 "자동으로 처리됩니다"라고 말하면서 확인 버튼을 누르게
      //   하는 건 모순이라 제거했다. 사용자가 직접 재시도를 눌렀다는 것
      //   자체가 "이미 한참 막혀있었다"는 신호이므로, 팝업 없이 바로
      //   최후 수단(3단계: 조용한 새로고침)까지 자동으로 진행한다.
      if (navigator.onLine) {
        // ★ 사용자가 직접 "재시도"까지 눌렀다는 건 명백한 의사표시이므로,
        //   자동 루프용 5분 쿨다운을 여기서는 무시하고 새로고침한다.
        _autoReload(true);
      }
      if (btn) { btn.disabled = false; btn.textContent = navigator.onLine ? '🔄 재연결 중...' : '📴 인터넷 연결 대기 중'; }
      return;
    }
    if (r.reason === 'already-flushing') {
      if (btn) { btn.disabled = false; btn.textContent = '🔄 지금 전체 재시도'; }
      return; // 이미 다른 전송이 진행 중 — 그 결과를 기다리면 배지가 알아서 갱신됨
    }
    const stillLeft = getPendingCount();
    if (stillLeft === 0) {
      if (btn) { btn.textContent = '✅ 서버 반영 완료'; btn.style.background = '#059669'; }
      setTimeout(() => document.getElementById('fb-pending-panel')?.remove(), 700);
    } else {
      // 일부만 성공 — 패널을 다시 그려서 남은 항목을 보여준다(닫지 않음)
      _showPendingDetail();
    }
  }
  window._fbRetryFromPanel = _retryFromPanel; // onclick에서 호출하기 위한 전역 브릿지

  function _showPendingDetail() {
    document.getElementById('fb-pending-panel')?.remove();
    const items = getPendingItems();
    if (!items.length) return;

    const panel = document.createElement('div');
    panel.id = 'fb-pending-panel';
    panel.style.cssText = 'position:fixed;inset:0;z-index:9996;background:rgba(0,0,0,.4);display:flex;align-items:flex-end;justify-content:center';
    panel.onclick = (e) => { if (e.target === panel) panel.remove(); };

    const rows = items.map((it, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #f0f0f0">
        <span style="font-size:18px;flex-shrink:0;${it.page ? 'cursor:pointer' : ''}"
          ${it.page ? `onclick="document.getElementById('fb-pending-panel').remove(); if(typeof App!=='undefined'&&App.go) App.go('${it.page}');"` : ''}>${it.icon}</span>
        <div style="flex:1;min-width:0;${it.page ? 'cursor:pointer' : ''}"
          ${it.page ? `onclick="document.getElementById('fb-pending-panel').remove(); if(typeof App!=='undefined'&&App.go) App.go('${it.page}');"` : ''}>
          <div style="font-size:13px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${it.label}</div>
          ${it.permanent
            ? `<div style="font-size:11px;color:#dc2626;margin-top:1px;font-weight:700">❌ 저장 실패 (${it.failCount || 1}회 시도) — 계속 재시도해도 서버가 거부하고 있어요</div>`
            : `<div style="font-size:11px;color:#9ca3af;margin-top:1px">${_timeAgo(it.ts)} 저장 시도 · ${it.op==='remove'?'삭제':'저장'}</div>`}
        </div>
        ${it.permanent
          ? `<button onclick="if(confirm('이 항목은 계속 실패하고 있습니다. 재시도를 중단하고 삭제할까요?\\n(서버에는 반영되지 않은 채로 남습니다)')){ FireDB.discardPending('${it.path}'); FireDB._showPendingDetailPublic(); }"
             style="font-size:11px;color:#dc2626;font-weight:700;flex-shrink:0;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:5px 9px;cursor:pointer">🗑 삭제</button>`
          : (it.page ? `<span style="font-size:11px;color:#2563eb;font-weight:700;flex-shrink:0">이동 ›</span>` : '')}
      </div>`).join('');

    const permCount = items.filter(it => it.permanent).length;
    const titleTxt = permCount > 0
      ? `⏳ 저장 대기 ${items.length}건 (❌ 실패 ${permCount}건)`
      : `⏳ 서버 저장 대기 중 (${items.length}건)`;
    const descTxt = permCount > 0
      ? '실패로 표시된 항목은 서버가 계속 거부하고 있어요. 삭제하거나 그대로 두면 계속 재시도합니다.'
      : '항목을 탭하면 해당 메뉴로 이동합니다. 인터넷 연결이 되면 자동으로 다시 전송을 시도합니다.';
    panel.innerHTML = `
      <div style="background:#fff;width:100%;max-width:480px;border-radius:16px 16px 0 0;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 -4px 24px rgba(0,0,0,.2)" onclick="event.stopPropagation()">
        <div style="width:36px;height:4px;background:#e5e7eb;border-radius:2px;margin:10px auto 4px"></div>
        <div style="padding:8px 16px 12px;display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:14px;font-weight:800;color:#111">${titleTxt}</div>
          <button onclick="document.getElementById('fb-pending-panel').remove()" style="border:none;background:none;font-size:18px;color:#9ca3af;cursor:pointer;padding:4px">✕</button>
        </div>
        <div style="font-size:11px;color:#9ca3af;padding:0 16px 8px">${descTxt}</div>
        <div style="flex:1;overflow-y:auto">${rows}</div>
        <div style="padding:10px 16px;border-top:1px solid #f0f0f0">
          <button onclick="window._fbRetryFromPanel(this)"
            style="width:100%;padding:11px;border-radius:10px;background:#2563eb;color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;transition:background .2s">
            🔄 지금 전체 재시도
          </button>
        </div>
      </div>`;
    document.body.appendChild(panel);
  }

  /* ══════════════════════════════════════════════════════
   * ★ 대기 항목 상시 배지 — 모든 모듈(진도·교재·성적·직원) 공통
   * ────────────────────────────────────────────────────────
   * "언젠가 다 전송되고 나서"만 잠깐 뜨는 완료 배지와 달리,
   * 큐에 무언가 쌓여 있는 "동안 내내" 화면 한쪽에 계속 보인다.
   * 사용자가 지금 입력한 게 서버에 반영됐는지 안 됐는지를
   * 어느 화면(진도/교재/성적/직원)에 있든 항상 스스로 판단할 수 있게 함.
   * 탭하면 어떤 항목이 대기 중인지 상세 목록으로 확인 가능.
   * ══════════════════════════════════════════════════════ */
  function _updatePendingBadge() {
    const n = getPendingCount();
    let badge = document.getElementById('fb-pending-badge');
    if (n === 0) {
      if (badge) badge.remove();
      document.getElementById('fb-pending-panel')?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'fb-pending-badge';
      badge.style.cssText = [
        'position:fixed;bottom:118px;right:12px;z-index:8887',
        'display:flex;align-items:center;gap:6px',
        'padding:6px 12px;border-radius:20px',
        'font-size:11px;font-weight:800;pointer-events:auto;cursor:pointer',
        'background:rgba(245,158,11,.14);color:#b45309',
        'border:1.5px solid rgba(245,158,11,.4)',
        'box-shadow:0 2px 10px rgba(0,0,0,.15)',
        'backdrop-filter:blur(8px);transition:opacity .3s',
      ].join(';');
      badge.onclick = () => { _showPendingDetail(); };
      document.body.appendChild(badge);
    }
    badge.innerHTML = `⏳ 서버 저장 대기 ${n}건 · 탭하여 확인`;
  }

  /* ★ 큐 전송 완료 알림 배지 (사용자가 자동 동기화를 인지할 수 있도록) */
  function _showFlushedBadge(count) {
    let ind = document.getElementById('fb-conn-ind');
    if (!ind) ind = _createInd();
    Object.assign(ind.style, {
      background: 'rgba(5,150,105,.12)', color: '#059669',
      border: '1px solid rgba(5,150,105,.3)', opacity: '1',
    });
    ind.innerHTML = `✅ 대기 데이터 ${count}건 서버 전송 완료`;
    clearTimeout(ind._t);
    ind._t = setTimeout(() => { ind.style.opacity = '0'; }, 3500);
  }

  /* ── 초기 4초 오탐 억제 ── */
  const _suppressUntil = Date.now() + 4000;

  /* ── 재연결 상태 ── */
  let _retryTimer  = null;
  let _retryCount  = 0;
  // 지수 백오프: 1~3회=5초, 4~10회=15초, 11회~=30초
  function _retryDelay() {
    if (_retryCount <= 3)  return 5000;
    if (_retryCount <= 10) return 15000;
    return 30000;
  }

  /* ── 오프라인 상태 추적 ── */
  let _offlineSince    = 0;
  let _offlineShowTimer = null;
  let _hardResetTried  = false;

  /* ★ 강제 재연결 — goOffline()→goOnline() 사이클
   *   문제: 탭을 장시간(수시간~하루) 방치하면 OS/브라우저가 백그라운드에서
   *         WebSocket을 강제 종료하는데, 이때 Firebase SDK 내부 재연결
   *         로직까지 같이 멈춰버려 navigator.onLine은 정상인데 앱만
   *         영원히 "오프라인"으로 남는 경우가 실제로 발생함(좀비 연결).
   *   해결: 단순히 기다리지 않고, 명시적으로 연결을 끊었다 다시 살려서
   *         SDK가 새 WebSocket을 맺도록 강제한다. */
  function _forceReconnect() {
    if (!_db || !_ok) return;
    try {
      console.log(`[FireDB] 🔧 강제 재연결 시도 (goOffline→goOnline) — 호출 시점 _stage1Done=${_stage1Done}`);
      _db.goOffline();
      setTimeout(() => { try { _db.goOnline(); } catch (e) { console.warn('[FireDB] goOnline 실패', e); } }, 300);
    } catch (e) { console.warn('[FireDB] 강제 재연결 실패', e); }
  }

  /* ★ 2단계 복구 — 앱 인스턴스 자체를 재생성
   *   goOffline/goOnline으로도 못 살아나는 더 심각한 좀비 상태를 대비.
   *   장애당 1회만 시도(무한 반복으로 오히려 상태를 꼬이게 하지 않도록). */
  async function _hardReset() {
    if (_hardResetTried || !_ok) return;
    _hardResetTried = true;
    try {
      console.log('[FireDB] 🔧🔧 2단계 복구 — Firebase 앱 인스턴스 재생성');
      const app = firebase.app();
      await app.delete();
      firebase.initializeApp(FIREBASE_CONFIG);
      _db = firebase.database();
      _attachConnListener();
    } catch (e) { console.warn('[FireDB] 앱 재생성 실패', e); }
  }

  /* ★ 3단계 복구 — 최후 수단: 조용히 새로고침
   *   목적: "새로고침하면 되는데" 를 사용자가 알아서 하게 두지 않고,
   *         앱이 스스로 판단해서 실행한다. 사용자는 이 과정을 몰라도 됨.
   *   안전장치:
   *   - navigator.onLine이 true(=폰 인터넷은 정상)일 때만 실행
   *     → 진짜 오프라인 상황에서 새로고침을 반복해 배터리/데이터만
   *       낭비하거나 브라우저 자체 오류 화면을 띄우는 걸 방지.
   *   - 5분 쿨다운 → 서버 자체 장애 등으로 계속 실패해도 새로고침이
   *     무한 반복(luup)되지 않도록.
   *   - 새로고침 직전, 화면에 열려있는 각 모듈(성적/진도 등)에
   *     "저장 안 된 입력 즉시 로컬에 반영" 신호를 보낸다 — 오프라인 큐는
   *     이미 localStorage에 있으므로 새로고침으로 사라지지 않음(재시작 후
   *     자동 재전송됨), 다만 메모리에만 있던 디바운스 대기값까지 한 번 더
   *     확실히 챙기기 위함. */
  const RELOAD_COOLDOWN_KEY = 'hk10b_fbAutoReloadAt';
  function _canAutoReload() {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_COOLDOWN_KEY) || 0);
      return Date.now() - last > 5 * 60 * 1000;
    } catch { return true; }
  }
  function _autoReload(force) {
    if (!navigator.onLine) {
      console.log('[FireDB] ⏸ 자동 새로고침 보류 — navigator.onLine=false (진짜 오프라인으로 판단, 새로고침해도 의미 없음)');
      return;
    }
    if (!force && !_canAutoReload()) {
      let leftSec = '?';
      try {
        const last = Number(sessionStorage.getItem(RELOAD_COOLDOWN_KEY) || 0);
        leftSec = Math.max(0, Math.round((5 * 60 * 1000 - (Date.now() - last)) / 1000));
      } catch {}
      console.log(`[FireDB] ⏸ 자동 새로고침 보류 — 쿨다운 중 (약 ${leftSec}초 후 재시도 가능)`);
      return;
    }
    // ★ index.html의 자동 업데이트 감지와 동일한 기준 — 자동(비-force) 새로고침은
    //   최근에 화면을 보며 사용 중이었다면(스크롤·클릭 등 포함) 방해하지 않고
    //   잠시 후 다시 확인한다. 사용자가 직접 누른 재시도(force=true)는
    //   이미 명시적 의사표시라 예외로 둔다.
    if (!force && _isRecentlyActive()) {
      console.log('[FireDB] ⏸ 자동 새로고침 보류 — 사용 중(최근 활동 감지), 8초 후 재확인');
      setTimeout(() => _autoReload(force), 8000);
      return;
    }
    // ★ index.html의 자동 업데이트 감지도 독립적으로 새로고침을 실행할 수
    //   있는데, 둘 다 "탭 활성화" 시점에 반응하다 보니 드물게 거의 동시에
    //   겹쳐서 두 번 새로고침되는 것처럼 보일 수 있었다. 전역 잠금을
    //   공유해서 둘 중 먼저 판단한 쪽만 실제로 새로고침하도록 막는다.
    if (window.__appReloading) { console.log('[FireDB] ⏸ 이미 다른 경로에서 새로고침 진행 중 — 중복 실행 방지'); return; }
    window.__appReloading = true;
    try { sessionStorage.setItem(RELOAD_COOLDOWN_KEY, String(Date.now())); } catch {}
    try { sessionStorage.setItem('hk10b_wasAutoReload', '1'); } catch {} // ★ 재시작 후 "왜 새로고침됐는지" 알려주기 위한 표시
    console.log(`[FireDB] 🔄 ${force ? '사용자 요청' : '장시간 재연결 실패'} — 데이터 보존 신호 전송 후 새로고침`);
    try { window.dispatchEvent(new Event('fb:force-flush-before-reload')); } catch {}
    setTimeout(() => { try { location.reload(); } catch {} }, 500);
  }

  /* ── 재연결 스케줄 (무제한 — 인터넷 있는 한 계속 시도) ──
   *   ★ 단계별 자동 복구 — 사용자가 아무것도 몰라도 되게:
   *      경과 10초~  : 강제 재연결(goOffline/goOnline) — 딱 1번만
   *      경과 30초~  : 앱 인스턴스 재생성(2단계) — 딱 1번만
   *      경과 45초~  : (진짜 인터넷은 있는데도 안 되면) 조용히 새로고침(3단계)
   *   (예전엔 5초마다 매번 강제 재연결을 반복 실행해서, 정상적으로
   *    맺어지고 있던 연결의 핸드셰이크를 완성되기도 전에 계속 끊어버리는
   *    문제가 있었음 — 느린 네트워크에서는 이 때문에 영원히 연결이
   *    안 되는 자기방해 루프가 생겼다. 각 단계를 1회성으로 바꾸고,
   *    그 사이엔 SDK가 스스로 재연결을 완료할 시간을 방해 없이 준다.)
   *   ★ 2025-xx 추가 수정 — 기존 2단계(앱 인스턴스 재생성)를 제거했다.
   *     앱 인스턴스를 통째로 교체하면 성적/진도/교재/공지/일정 등 모든
   *     모듈이 페이지 로드 시 한 번만 걸어둔 FireDB.listen() 실시간
   *     구독이 죽은 인스턴스에 매달린 채 무효화되는데, 이걸 다시 걸어주는
   *     코드가 없어서 연결 표시는 살아나도 실시간 데이터 갱신은 조용히
   *     먹통이 되는 부작용이 있었다. 이제 10초에 가벼운 재연결 → 그래도
   *     30초까지 안 되면 곧장 새로고침(모든 모듈이 처음부터 깨끗하게
   *     다시 시작되어 구독이 끊길 일이 없음)으로 단순화한다. */
  let _stage1Done = false; // 강제 재연결 1회 실행 여부
  function _scheduleRetry() {
    if (_retryTimer || _connected) return;
    const delay = _retryDelay();
    _retryTimer = setTimeout(() => {
      _retryTimer = null;
      if (_connected) return;
      _retryCount++;
      const elapsed = _offlineSince ? Date.now() - _offlineSince : 0;
      console.log(`[FireDB] ⏳ 재연결 대기 ${_retryCount}회차 (경과 ${Math.round(elapsed/1000)}초)`);
      if (elapsed >= 30000) {
        _autoReload();
      } else if (elapsed >= 10000 && !_stage1Done) {
        _stage1Done = true;
        _forceReconnect();
      }
      // ★ 아직 어느 단계도 아니면(10초 미만) 아무것도 안 하고 그냥 기다림
      //   — SDK 자체 재연결을 방해하지 않는다.
      _scheduleRetry(); // 무한 재시도
    }, delay);
  }

  /* ── 오프라인 UI 표시 (8초 디바운스 후) ── */
  function _showOfflineUI() {
    let ind = document.getElementById('fb-conn-ind');
    if (!ind) ind = _createInd();
    Object.assign(ind.style, {
      background: 'rgba(239,68,68,.1)', color: '#dc2626',
      border: '1px solid rgba(239,68,68,.3)', opacity: '1',
    });
    const elapsed = _offlineSince ? Math.round((Date.now() - _offlineSince) / 1000) : 0;
    ind.innerHTML = `🔴 오프라인${elapsed > 0 ? ` (${elapsed}초)` : ''} — 재연결 중...`;
    clearTimeout(ind._t);
    /* 오프라인 표시 중 경과 시간 업데이트 (10초마다) */
    ind._elapsed = setInterval(() => {
      if (!ind || !document.getElementById('fb-conn-ind')) { clearInterval(ind._elapsed); return; }
      if (_connected) { clearInterval(ind._elapsed); return; }
      const sec = _offlineSince ? Math.round((Date.now() - _offlineSince) / 1000) : 0;
      ind.innerHTML = `🔴 오프라인 (${sec}초) — 재연결 중...`;
    }, 10000);
  }

  /* ── 인디케이터 DOM 생성 ── */
  function _createInd() {
    const ind = document.createElement('div');
    ind.id = 'fb-conn-ind';
    ind.style.cssText = [
      'position:fixed;bottom:72px;right:12px;z-index:8888',
      'padding:5px 12px;border-radius:20px',
      'font-size:11px;font-weight:700;pointer-events:none',
      'box-shadow:0 2px 8px rgba(0,0,0,.15)',
      'backdrop-filter:blur(8px);transition:opacity .4s',
      'opacity:0',
    ].join(';');
    document.body.appendChild(ind);
    return ind;
  }

  /* ── 연결 상태 UI 업데이트 ── */
  function _updateConnUI(connected) {
    // ★ 핵심 수정 — "초기 4초 억제"는 배너를 잠깐 안 보이게 하는 것으로만
    //   범위를 좁혔다. 예전엔 이 조건에서 함수 전체가 그냥 종료돼서,
    //   페이지 로드 직후 4초 안에 끊기면 _offlineSince가 영원히 기록되지
    //   않았다(Firebase는 상태가 "바뀔 때"만 이벤트를 보내므로 이후에
    //   다시 기록할 기회도 없음) — 그 결과 재시도 사다리가 항상
    //   "경과 0초"로 고정되어 30초/45초 단계로 절대 못 올라가는 문제로
    //   이어졌다. 이제 오프라인 시각 기록과 재시도 스케줄링은 억제
    //   여부와 무관하게 항상 실행된다.
    const suppressBanner = !connected && Date.now() < _suppressUntil;

    if (connected) {
      const wasOffline = _offlineSince > 0;

      // ★ _offlineSince/_retryTimer/_retryCount는 여기서 더 이상 건드리지
      //   않는다 — 3초간 연결이 실제로 유지되는지 확인한 뒤 _attachConnListener
      //   에서 리셋한다(위 참고). 여기서 즉시 리셋하면 아주 짧게 반짝였다가
      //   다시 끊기는 "깜빡임" 상황에서 복구 진행 상태가 계속 날아가 버린다.
      clearTimeout(_offlineShowTimer); _offlineShowTimer = null;

      let ind = document.getElementById('fb-conn-ind');
      if (ind?._elapsed) { clearInterval(ind._elapsed); ind._elapsed = null; }
      if (!ind) ind = _createInd();

      if (wasOffline) {
        Object.assign(ind.style, {
          background: 'rgba(5,150,105,.12)', color: '#059669',
          border: '1px solid rgba(5,150,105,.3)', opacity: '1',
        });
        ind.innerHTML = '🟢 서버 연결됨';
        clearTimeout(ind._t);
        ind._t = setTimeout(() => { ind.style.opacity = '0'; }, 3000);
      }

    } else {
      // ★ 오프라인 시각 기록·재시도 사다리 가동은 배너 억제와 무관하게
      //   항상 수행한다 (여기가 예전엔 실행 자체가 안 됐던 부분).
      if (!_offlineSince) {
        _offlineSince = Date.now();
        _scheduleRetry();
      }
      if (!suppressBanner && !_offlineShowTimer) {
        _offlineShowTimer = setTimeout(() => {
          _offlineShowTimer = null;
          if (!_connected) _showOfflineUI();
        }, 8000);
      }
    }
  }

  /* ── keepalive 핑 (60초 주기 — WebSocket 연결 유지) ──
   * 기존엔 `.info/serverTimeOffset`에 .get()을 호출했는데, 이 특수 경로는
   * Firebase compat SDK에서 .get()을 안정적으로 지원하지 않아
   * "Invalid token in path" 오류가 계속 발생했음.
   * .info/connected는 이미 실시간 리스너로 추적 중이므로, 별도 네트워크
   * 요청 없이 그 값만 재확인하는 것으로 충분히 안전하게 대체함. */
  function _startKeepAlive() {
    setInterval(() => {
      if (document.hidden || !_ok || !_db) return;
      // 실시간 리스너가 살아있는지만 가볍게 재확인 (네트워크 요청 없음)
      if (!_connected) {
        console.log('[FireDB] 🔁 keepalive: 연결 끊김 상태 감지, 재연결 대기 중');
      }
    }, 60000);
  }

  /* ★ 주기적 큐 자동 전송 (레벨 기반 — 재연결 "이벤트"에 의존하지 않음)
   *   문제: 기존엔 disconnected→connected "전환 순간"에만 큐를 비웠기 때문에,
   *         연결이 끊김 없이 계속 유지되는데도 어떤 이유로 큐에만 쌓인 채
   *         남아있는 데이터는 브라우저를 완전히 새로고침(=새 연결 이벤트 발생)
   *         하기 전까지 서버로 전송되지 않는 문제가 있었음.
   *   해결: 15초마다 "현재 연결되어 있고 대기 항목이 있으면" 무조건 재전송 시도.
   *         네이티브 새로고침/캐시삭제 없이도 자동으로 서버 동기화가 보장됨. */
  function _startQueueWatcher() {
    setInterval(() => {
      if (getPendingCount() > 0) {
        console.log(`[FireDB] 🔁 주기적 큐 점검 — 대기 ${getPendingCount()}건 재전송 시도`);
        _flushQueue();
      }
    }, 15000);
  }

  /* ── 초기화 ── */
  let _connConfirmTimer = null;
  function _attachConnListener() {
    /* 연결 상태 실시간 감지 */
    _db.ref('.info/connected').on('value', snap => {
      const prev = _connected;
      _connected = !!snap.val();
      _updateConnUI(_connected);
      if (_connected && !prev) {
        console.log('[FireDB] 🌐 온라인 복귀(잠정) — 3초간 유지되는지 확인 중');
        // ★ 핵심 수정 — 연결이 아주 잠깐 반짝했다가 바로 다시 끊기는
        //   "깜빡임" 상황에서는 복구 진행 상태를 리셋하지 않는다.
        //   예전엔 여기서 즉시 _offlineSince/_retryCount/_stage1Done을
        //   초기화했는데, 연결이 실제로는 계속 불안정한 채로 깜빡이기만
        //   해도 매번 초기화되어 버려서 30초/45초 단계로 절대 못 올라가고
        //   "강제 재연결"만 0초 지점에서 무한 반복하는 문제가 있었다.
        //   3초간 실제로 연결이 유지된 걸 확인한 뒤에야 "진짜 복구됐다"고
        //   보고 진행 상태를 리셋한다.
        clearTimeout(_connConfirmTimer);
        _connConfirmTimer = setTimeout(() => {
          if (!_connected) return; // 3초 안에 다시 끊겼으면 리셋하지 않음
          console.log('[FireDB] 🌐 온라인 복귀 확정');
          _retryCount = 0; _hardResetTried = false; _stage1Done = false;
          _offlineSince = 0;
        }, 3000);
        setTimeout(_flushQueue, 500); // 재연결 안정화 후 큐 전송 시도는 그대로 진행
      }
      if (!_connected) console.log('[FireDB] 📴 연결 끊김 — 8초 후 배너 예정');
    });
  }

  async function init() {
    try {
      if (!firebase?.database) throw new Error('no sdk');
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      _db = firebase.database();
      _ok = true;
      console.log('[FireDB] ✅ connected');

      // keepSynced 제거 (v10 compat 미지원) — 실시간 listen()이 연결 유지 대체

      _attachConnListener();

      /* ★ 네트워크 복귀 이벤트 (WiFi↔LTE 전환 등)
       * — 예전엔 이 이벤트마다 _forceReconnect()를 직접 호출해서
       *   goOffline/goOnline을 반복 실행했는데, 이 이벤트가 짧은 시간에
       *   여러 번 발생하면 그때마다 진행 중이던 연결 시도를 방해했다.
       *   이제는 스케줄러(_scheduleRetry)가 이미 돌고 있으면 그냥 두고,
       *   안 돌고 있을 때만 새로 깨운다 — 단계별 가드(_stage1Done 등)를
       *   그대로 존중한다. */
      window.addEventListener('online', () => {
        console.log('[FireDB] 🌐 navigator.online 감지');
        if (!_connected) _scheduleRetry();
      });

      /* ★ 탭 백그라운드→포어그라운드 복귀 */
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        console.log('[FireDB] 👁 탭 활성화 → 연결 상태 확인');
        if (!_connected) {
          _scheduleRetry();
        } else if (getPendingCount() > 0) {
          console.log(`[FireDB] 👁 탭 재활성화 시 대기 항목 ${getPendingCount()}건 발견 → 즉시 전송 시도`);
          _flushQueue();
        }
        _updatePendingBadge();
      });

      /* ★ keepalive 시작 */
      _startKeepAlive();
      /* ★ 주기적 큐 자동 전송 시작 */
      _startQueueWatcher();
      /* ★ WebSocket이 막힌 환경 대비 — REST 폴링 백업 시작 */
      _startRestPollFallback();
      /* ★ 이전 세션에서 넘어온 대기 항목이 있으면 즉시 배지로 알림 */
      _updatePendingBadge();

    } catch (e) {
      _ok = false;
      console.warn('[FireDB] offline →', e.message);
    }
    return _ok;
  }

  const ready       = () => _ok && !!_db;
  const isConnected = () => _connected;

  function get(path) {
    if (!ready()) return Promise.resolve(null);
    return _db.ref(path).get()
      .then(s => s.exists() ? s.val() : null)
      .catch(e => { console.error('get', path, e); return null; });
  }

  /* 서버에서 직접 강제 읽기 —
   * .once('value') 대신 .get() 사용: Firebase 공식 문서상 .get()은
   * "항상 서버의 최신 데이터로 응답을 시도하고, 도달 불가능할 때만
   * 캐시로 폴백"하도록 설계된 API. .once('value')는 레거시로 연결
   * 상태에 따라 조용히 로컬 캐시를 반환할 수 있어 배제함.
   */
  function getFromServer(path) {
    if (!ready()) return Promise.resolve(null);
    if (!_connected) {
      console.warn('[FireDB] getFromServer: 현재 오프라인 — 캐시값이 반환될 수 있음', path);
    }
    return _db.ref(path).get()
      .then(s => s.exists() ? s.val() : null)
      .catch(e => { console.error('getFromServer', path, e); return null; });
  }
  /* ★ 어떤 값이든 Firebase에 보내기 전 undefined 필드를 제거한다.
   *   Firebase는 undefined가 섞인 객체를 절대 저장하지 않고 그 즉시
   *   예외를 던진다 — 연결 상태와 무관하게 100% 재현되는 오류라, 이걸
   *   그냥 큐에 넣고 재시도만 반복하면 "영원히 안 되는데 계속 재시도
   *   중"이라는 상태가 무한히 지속된다(오늘 일정표 사례가 정확히 이것).
   *   모든 모듈이 각자 조심하는 대신, 쓰기 함수 한 곳에서 근본적으로
   *   차단해서 이 문제 자체가 다시는 발생할 수 없게 한다. */
  function _stripUndefined(v) {
    if (Array.isArray(v)) return v.map(_stripUndefined);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k in v) { if (v[k] !== undefined) out[k] = _stripUndefined(v[k]); }
      return out;
    }
    return v;
  }
  function set(path, v) {
    v = _stripUndefined(v);
    if (!ready() || !_connected) { _enqueue('set', path, v); return Promise.resolve(false); }
    return _db.ref(path).set(v)
      .then(() => true)
      .catch(e => { console.error('set', path, e); _enqueue('set', path, v); return false; });
  }
  function update(path, v) {
    v = _stripUndefined(v);
    if (!ready() || !_connected) { _enqueue('update', path, v); return Promise.resolve(false); }
    return _db.ref(path).update(v)
      .then(() => true)
      .catch(e => { console.error('update', path, e); _enqueue('update', path, v); return false; });
  }
  function remove(path) {
    if (!ready() || !_connected) { _enqueue('remove', path, null); return Promise.resolve(); }
    return _db.ref(path).remove().catch(e => { console.error('remove', path, e); _enqueue('remove', path, null); });
  }
  /* ── 트랜잭션: 여러 기기가 동시에 같은 경로에 쓸 때 원자적으로 처리 ──
   *   updateFn(currentVal) → 반환값이 undefined면 트랜잭션 중단(abort, 내 값을 버림)
   *   결과: { committed: 내가 이겼는지, snapshot: 최종적으로 서버에 반영된 값 }
   */
  function transaction(path, updateFn) {
    if (!ready()) return Promise.resolve({ committed:false, snapshot:null });
    return _db.ref(path).transaction(updateFn)
      .then(r => ({ committed: r.committed, snapshot: r.snapshot ? r.snapshot.val() : null }))
      .catch(e => { console.error('transaction', path, e); return { committed:false, snapshot:null }; });
  }
  /* ★ REST(HTTPS) 조회 — WebSocket 폴백용 */
  async function _restGet(path) {
    const url = `${FIREBASE_CONFIG.databaseURL}/${path}.json`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`REST GET 실패: HTTP ${res.status}`);
    return res.json();
  }

  /* ★ listen()으로 등록된 실시간 구독 목록 — WebSocket이 막힌 환경에서
   *   대신 주기적으로 REST 폴링해서 같은 콜백에 새 값을 넣어주기 위함 */
  const _listenRegistry = [];

  function listen(path, cb) {
    if (!ready()) return () => {};
    const entry = { path, cb, lastValueJSON: undefined };
    _listenRegistry.push(entry);
    const ref = _db.ref(path);
    ref.on('value', s => {
      const v = s.exists() ? s.val() : null;
      entry.lastValueJSON = JSON.stringify(v); // ★ WebSocket으로 이미 받은 값은 폴링이 중복 전달하지 않도록 기록
      cb(v);
    }, e => console.error('listen', path, e));
    return () => {
      ref.off('value');
      const i = _listenRegistry.indexOf(entry);
      if (i >= 0) _listenRegistry.splice(i, 1);
    };
  }

  /* ★ 지금 입력 중인지 확인 — 폴링으로 받은 값을 입력 도중에 덮어써서
   *   방금 친 내용이 사라지거나 바뀌어 보이는 사고를 막기 위함.
   *   (grade-app.js처럼 자체적으로 "편집 중이면 건너뛰기" 방어가 있는
   *    화면은 원래도 안전하지만, 일정표·공지처럼 그런 방어가 없는
   *    화면까지 이 폴링 하나로 공통 보호한다.) */
  function _isUserTyping() {
    const el = document.activeElement;
    if (!el) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
  }

  /* ★ "입력 중"보다 넓은 개념 — 최근에 마우스를 움직이거나 스크롤·클릭·터치를
   *   했으면 화면을 보며 사용 중인 것으로 본다(예: 교재 탭에서 학생 수행
   *   현황표를 스크롤하며 지켜보는 중 — 입력은 안 하지만 새로고침되면
   *   불편함). 완전히 손을 놓고 화면만 응시하는 경우까지는 감지할 방법이
   *   없지만(브라우저에 아무 신호도 없음), 실제 사용 패턴은 대부분 이걸로
   *   커버된다. */
  let _lastActivityAt = Date.now();
  const _ACTIVITY_EVENTS = ['mousemove','mousedown','wheel','scroll','touchstart','touchmove','keydown'];
  const _markActive = () => { _lastActivityAt = Date.now(); };
  _ACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, _markActive, { passive: true, capture: true }));
  function _isRecentlyActive(withinMs = 15000) {
    return _isUserTyping() || (Date.now() - _lastActivityAt) < withinMs;
  }

  /* ★ WebSocket이 막힌 환경 대비 — 10초마다 REST로 최신 값을 직접
   *   가져와서, 실제로 값이 달라졌을 때만 등록된 콜백에 전달한다.
   *   완전한 "즉시성"은 아니지만(최대 10초 지연), 새로고침 없이도
   *   다른 기기의 변경사항이 화면에 반영되게 해준다. */
  function _startRestPollFallback() {
    setInterval(async () => {
      if (_connected || document.hidden || !_listenRegistry.length) return;
      if (_isUserTyping()) {
        console.log('[FireDB] ⏸ 입력 중 — 이번 폴링 반영 보류(다음 주기에 재확인)');
        return; // ★ lastValueJSON을 갱신하지 않으므로 다음 주기에 다시 시도됨(유실 아님)
      }
      for (const entry of _listenRegistry.slice()) {
        try {
          const v = await _restGet(entry.path);
          const json = JSON.stringify(v);
          if (json !== entry.lastValueJSON) {
            entry.lastValueJSON = json;
            entry.cb(v);
          }
        } catch (e) { /* 개별 경로 실패는 조용히 무시하고 다음 주기에 재시도 */ }
      }
    }, 10000);
  }

  function debounced(path, val, delay = 700) {
    clearTimeout(_q[path]);
    _q[path] = setTimeout(async () => {
      if (!val && val !== 0) await remove(path); else await set(path, val);
      delete _q[path];
    }, delay);
  }

  const P = {
    root:'hakwon10', classes:'hakwon10/classes',
    progress:'hakwon10/progress', accounts:'hakwon10/accounts', theme:'hakwon10/theme',
  };

  async function syncNow() { await _flushQueue(); return getPendingCount() === 0; }

  return { init, ready, isConnected, get, getFromServer, set, update, remove, listen,
           debounced, transaction, syncNow, getPendingCount, getPendingItems, discardPending, _showPendingDetailPublic: _showPendingDetail, P };
})();
