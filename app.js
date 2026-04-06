/**
 * app.js — 학원 진도 관리 메인 로직
 */

const App = (() => {

  /* ── 상태 ───────────────────────────────── */
  const DAY_ORDER = ['월', '화', '수', '목', '금'];
  const DAY_CLS   = { 월:'mon', 화:'tue', 수:'wed', 목:'thu', 금:'fri' };

  let state = {
    page:        'operate',
    selectedClass: null,   // class object
    currentMonday: null,   // Date
    editingId:   null,     // class id being edited
    unsaved:     false,
  };

  /* ── 초기화 ─────────────────────────────── */
  function init() {
    state.currentMonday = getMonday(new Date());

    // 샘플 데이터 (첫 실행시)
    if (DB.getClasses().length === 0) {
      DB.addClass({
        name: 'H1',
        days: ['월', '화', '목', '금'],
        mainBooks: ['수학의 정석(상)'],
        subBooks:  ['쎈 수학', '수학 올림피아드'],
      });
      DB.addClass({
        name: 'T1',
        days: ['월', '수', '금'],
        mainBooks: ['개념원리'],
        subBooks:  ['RPM'],
      });
    }

    // splash 후 앱 표시
    setTimeout(() => {
      document.getElementById('splash').style.display = 'none';
      document.getElementById('app').classList.remove('hidden');
      navigate('operate');
    }, 1400);
  }

  /* ── 페이지 네비게이션 ──────────────────── */
  function navigate(page) {
    state.page = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelector(`[data-page="${page}"]`).classList.add('active');

    if (page === 'operate') renderOperate();
    if (page === 'manage')  renderManage();
  }

  /* ═══════════════════════════════════════════
     운용 페이지
  ═══════════════════════════════════════════ */
  function renderOperate() {
    renderClassChips();
    renderWeekNav();
    renderDays();
  }

  function renderClassChips() {
    const classes = DB.getClasses();
    const container = document.getElementById('op-class-chips');
    container.innerHTML = '';

    if (classes.length === 0) {
      container.innerHTML = '<span style="font-size:12px;color:var(--text-dim)">관리 메뉴에서 반을 추가해주세요</span>';
      return;
    }

    // 선택된 반이 목록에 없으면 초기화
    if (state.selectedClass && !classes.find(c => c.id === state.selectedClass.id)) {
      state.selectedClass = null;
    }
    // 선택 없으면 첫 번째 선택
    if (!state.selectedClass && classes.length > 0) {
      state.selectedClass = classes[0];
    }

    classes.forEach(cls => {
      const chip = document.createElement('button');
      chip.className = 'class-chip' + (state.selectedClass?.id === cls.id ? ' active' : '');
      chip.textContent = cls.name;
      chip.onclick = () => {
        state.selectedClass = cls;
        renderOperate();
      };
      container.appendChild(chip);
    });
  }

  function renderWeekNav() {
    const monday = state.currentMonday;
    const friday = addDays(monday, 4);
    const weekKey = DB.toWeekKey(monday);

    // 주차 번호 (월 기준)
    const weekNum = getWeekOfMonth(monday);

    document.getElementById('op-week-num').textContent   = `${weekNum}주차`;
    document.getElementById('op-week-month').textContent =
      sameMonth(monday, friday)
        ? `${monday.getMonth()+1}월`
        : `${monday.getMonth()+1}월 ~ ${friday.getMonth()+1}월`;

    const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
    document.getElementById('op-week-range').textContent =
      `${fmt(monday)} – ${fmt(friday)}`;
  }

  function renderDays() {
    const container = document.getElementById('days-container');
    container.innerHTML = '';

    const cls = state.selectedClass;
    if (!cls) {
      container.innerHTML = '<div class="empty-state">반을 선택해주세요</div>';
      return;
    }

    const monday  = state.currentMonday;
    const weekKey = DB.toWeekKey(monday);
    const saved   = DB.getWeekProgress(cls.id, weekKey);

    const classDays = cls.days || [];

    // 수업 없는 주인지 확인
    const hasSomeDays = DAY_ORDER.some(d => classDays.includes(d));
    if (!hasSomeDays) {
      container.innerHTML = '<div class="empty-state">이 반에 설정된 수업 요일이 없습니다.<br>관리 메뉴에서 요일을 설정해주세요.</div>';
      return;
    }

    const today = new Date(); today.setHours(0,0,0,0);

    DAY_ORDER.forEach((dayName, i) => {
      if (!classDays.includes(dayName)) return; // 수업 없는 요일 skip

      const date    = addDays(monday, i);
      const dc      = DAY_CLS[dayName];
      const isToday = date.toDateString() === today.toDateString();

      const card = document.createElement('div');
      card.className = 'day-card';

      // Header
      const header = document.createElement('div');
      header.className = 'day-card-header';
      header.innerHTML = `
        <div class="day-stripe bg-${dc}"></div>
        <div>
          <div class="day-name-big col-${dc}">${dayName}요일</div>
          <div class="day-date-sm">${date.getMonth()+1}월 ${date.getDate()}일 (${dayName})</div>
        </div>
        ${isToday ? '<div class="today-badge">오늘</div>' : ''}
      `;
      card.appendChild(header);

      // Book rows
      const rowsWrap = document.createElement('div');
      rowsWrap.className = 'book-rows';

      const allBooks = [
        ...(cls.mainBooks || []).map(b => ({ name: b, type: 'main' })),
        ...(cls.subBooks  || []).map(b => ({ name: b, type: 'sub'  })),
      ];

      if (allBooks.length === 0) {
        rowsWrap.innerHTML = '<div class="no-class-row">등록된 교재가 없습니다</div>';
      } else {
        allBooks.forEach(({ name, type }) => {
          const savedKey = `${dayName}|${name}`;
          const val      = saved[savedKey] || '';

          const row = document.createElement('div');
          row.className = 'book-row';
          row.innerHTML = `
            <span class="book-tag ${type}">${type === 'main' ? '주' : '부'}</span>
            <span class="book-name-cell" title="${name}">${name}</span>
            <input
              class="progress-input ${val ? 'has-value' : ''}"
              placeholder="진도 범위"
              value="${escHtml(val)}"
              data-day="${dayName}"
              data-book="${escHtml(name)}"
              data-weekkey="${weekKey}"
              inputmode="text"
            >
          `;
          rowsWrap.appendChild(row);
        });
      }

      card.appendChild(rowsWrap);
      container.appendChild(card);
    });

    // 입력 변화 감지 → unsaved 표시
    container.querySelectorAll('.progress-input').forEach(inp => {
      inp.addEventListener('input', () => {
        inp.classList.toggle('has-value', inp.value.trim() !== '');
        markUnsaved();
      });
    });
  }

  function markUnsaved() {
    state.unsaved = true;
    const btn = document.getElementById('save-btn');
    btn.style.background = 'rgba(245,166,35,0.2)';
    btn.style.borderColor = 'rgba(245,166,35,0.5)';
  }

  function saveProgress() {
    const cls = state.selectedClass;
    if (!cls) { showToast('⚠️ 반을 선택해주세요'); return; }

    const inputs  = document.querySelectorAll('.progress-input');
    const entries = [];

    inputs.forEach(inp => {
      entries.push({
        classId:  cls.id,
        weekKey:  inp.dataset.weekkey,
        dayName:  inp.dataset.day,
        bookName: inp.dataset.book,
        value:    inp.value.trim(),
      });
    });

    DB.saveProgressBatch(entries);

    state.unsaved = false;
    const btn = document.getElementById('save-btn');
    btn.style.background = '';
    btn.style.borderColor = '';

    showToast('✅ 저장 완료!');
  }

  /* ── 주 이동 ─────────────────────────────── */
  function prevWeek() {
    if (state.unsaved) {
      if (!confirm('저장하지 않은 내용이 있습니다.\n이동하시겠습니까?')) return;
      state.unsaved = false;
    }
    state.currentMonday = addDays(state.currentMonday, -7);
    renderWeekNav();
    renderDays();
  }

  function nextWeek() {
    if (state.unsaved) {
      if (!confirm('저장하지 않은 내용이 있습니다.\n이동하시겠습니까?')) return;
      state.unsaved = false;
    }
    state.currentMonday = addDays(state.currentMonday, 7);
    renderWeekNav();
    renderDays();
  }

  /* ═══════════════════════════════════════════
     관리 페이지
  ═══════════════════════════════════════════ */
  function renderManage() {
    const classes   = DB.getClasses();
    const container = document.getElementById('manage-list');
    container.innerHTML = '';

    if (classes.length === 0) {
      container.innerHTML = '<div class="empty-state">등록된 반이 없습니다.<br>+ 반 추가 버튼을 눌러 시작하세요.</div>';
      return;
    }

    classes.forEach(cls => {
      const card = document.createElement('div');
      card.className = 'manage-card';

      const dayBadges = (cls.days || []).map(d =>
        `<span class="manage-day-badge badge-${DAY_CLS[d]}">${d}</span>`
      ).join('');

      const allBooks = [
        ...(cls.mainBooks || []).map(b => ({ name: b, type: '주교재' })),
        ...(cls.subBooks  || []).map(b => ({ name: b, type: '부교재' })),
      ];

      const bookRows = allBooks.map(({ name, type }) => `
        <div class="manage-book-item">
          <span class="book-tag ${type === '주교재' ? 'main' : 'sub'}">${type === '주교재' ? '주' : '부'}</span>
          <span style="font-size:13px">${escHtml(name)}</span>
        </div>
      `).join('') || '<div class="manage-book-item" style="color:var(--text-dim)">교재 없음</div>';

      card.innerHTML = `
        <div class="manage-card-header">
          <div class="manage-class-name">${escHtml(cls.name)}</div>
          <div class="manage-days">${dayBadges}</div>
        </div>
        <div class="manage-card-body">${bookRows}</div>
        <div class="manage-card-actions">
          <button class="manage-action-btn" onclick="App.openClassModal('${cls.id}')">✏️ 수정</button>
          <button class="manage-action-btn danger" onclick="App.deleteClass('${cls.id}')">🗑 삭제</button>
        </div>
      `;

      container.appendChild(card);
    });
  }

  /* ── 반 삭제 ─────────────────────────────── */
  function deleteClass(id) {
    const cls = DB.getClassById(id);
    if (!cls) return;
    if (!confirm(`"${cls.name}" 반을 삭제하시겠습니까?\n모든 진도 데이터도 함께 삭제됩니다.`)) return;
    DB.deleteClass(id);
    if (state.selectedClass?.id === id) state.selectedClass = null;
    showToast('🗑 삭제 완료');
    renderManage();
  }

  /* ═══════════════════════════════════════════
     Modal — 반 추가 / 수정
  ═══════════════════════════════════════════ */
  function openClassModal(id = null) {
    state.editingId = id;
    const cls = id ? DB.getClassById(id) : null;

    document.getElementById('modal-title').textContent = id ? '반 수정' : '반 추가';
    document.getElementById('f-class-name').value = cls?.name || '';

    // 요일 체크박스
    document.querySelectorAll('#f-days input').forEach(cb => {
      cb.checked = cls ? (cls.days || []).includes(cb.value) : false;
    });

    // 주교재
    const mainWrap = document.getElementById('f-main-books');
    mainWrap.innerHTML = '';
    (cls?.mainBooks || ['']).forEach(b => addBookFieldValue('main', b));

    // 부교재
    const subWrap = document.getElementById('f-sub-books');
    subWrap.innerHTML = '';
    (cls?.subBooks || ['']).forEach(b => addBookFieldValue('sub', b));

    document.getElementById('modal-overlay').classList.remove('hidden');
  }

  function closeModal(e) {
    if (e && e.target !== document.getElementById('modal-overlay')) return;
    document.getElementById('modal-overlay').classList.add('hidden');
  }

  function addBookField(type) {
    addBookFieldValue(type, '');
  }

  function addBookFieldValue(type, value) {
    const wrap = document.getElementById(`f-${type}-books`);
    const row  = document.createElement('div');
    row.className = 'book-form-row';
    row.innerHTML = `
      <input class="book-form-input" placeholder="${type === 'main' ? '주교재명' : '부교재명'}" value="${escHtml(value)}">
      <button class="remove-book-btn" onclick="this.parentElement.remove()">×</button>
    `;
    wrap.appendChild(row);
    // focus new empty field
    if (!value) setTimeout(() => row.querySelector('input').focus(), 50);
  }

  function saveClass() {
    const name = document.getElementById('f-class-name').value.trim();
    if (!name) { showToast('⚠️ 반 이름을 입력해주세요'); return; }

    const days = [...document.querySelectorAll('#f-days input:checked')].map(cb => cb.value);
    if (days.length === 0) { showToast('⚠️ 수업 요일을 하나 이상 선택해주세요'); return; }

    const mainBooks = [...document.querySelectorAll('#f-main-books .book-form-input')]
      .map(i => i.value.trim()).filter(Boolean);
    const subBooks  = [...document.querySelectorAll('#f-sub-books .book-form-input')]
      .map(i => i.value.trim()).filter(Boolean);

    const data = { name, days, mainBooks, subBooks };

    if (state.editingId) {
      DB.updateClass(state.editingId, data);
      // 운용 페이지에서 이 반 선택 중이면 갱신
      if (state.selectedClass?.id === state.editingId) {
        state.selectedClass = DB.getClassById(state.editingId);
      }
      showToast('✅ 수정 완료');
    } else {
      const created = DB.addClass(data);
      state.selectedClass = created;
      showToast('✅ 반 추가 완료');
    }

    document.getElementById('modal-overlay').classList.add('hidden');
    renderManage();
  }

  /* ═══════════════════════════════════════════
     유틸
  ═══════════════════════════════════════════ */
  function getMonday(date) {
    const d   = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0=Sun
    const diff = (day === 0) ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function sameMonth(a, b) {
    return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  }

  function getWeekOfMonth(monday) {
    // 해당 월의 첫 날이 속한 주차를 기준으로 계산
    const firstDay = new Date(monday.getFullYear(), monday.getMonth(), 1);
    const firstMonday = getMonday(firstDay);
    // 만약 firstMonday가 이전 달이면 한 주 추가
    const diff = Math.round((monday - firstMonday) / (7 * 86400000));
    return diff + 1;
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  /* ── 공개 API ───────────────────────────── */
  return {
    init,
    navigate,
    prevWeek,
    nextWeek,
    saveProgress,
    openClassModal,
    closeModal,
    addBookField,
    saveClass,
    deleteClass,
  };

})();

// 시작
document.addEventListener('DOMContentLoaded', App.init);
