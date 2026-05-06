/**
 * students-db.js — v1.0
 *
 * ★ 기존 DB / FireDB 모듈을 일절 수정하지 않는 완전 독립 모듈
 * ★ Firebase 경로: hakwon10/students  (기존 데이터와 분리)
 * ★ LocalStorage 키: hk10b_students   (기존 키와 분리)
 * ★ FireDB가 준비되지 않아도 로컬 스토리지 기반으로 정상 동작
 *
 * 수업 → 반 변환 규칙
 *   "Happy 1"   → "H1"
 *   "Flower 2"  → "F2"
 *   "Rainbow 1" → "R1"
 *   "Tree 2"    → "T2"
 *   "Special"   → "S"
 *   규칙: 첫 단어 첫 글자(대문자) + 뒤따라오는 숫자(있으면)
 *
 * 재원 상태 판별 (엑셀 2중 플래그)
 *   재원여부='O' & 휴원여부!='O' → '재원'
 *   재원여부='O' & 휴원여부='O'  → '휴원'
 *   그 외                         → '퇴원'
 */
const StudentDB = (() => {
  /* ══ 상수 ══ */
  const LS_KEY  = 'hk10b_students';
  const FB_PATH = 'hakwon10/students';

  /* ══ 내부 유틸 ══ */
  const _lg  = k      => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const _ls  = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const _nid = ()     => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const _now = ()     => new Date().toISOString();

  /** null / undefined / 'NaN' / 'undefined' → 빈 문자열로 정제 */
  function _str(v) {
    const s = String(v ?? '').trim();
    return (s === 'NaN' || s === 'undefined' || s === 'null') ? '' : s;
  }

  /* ══ 이벤트 에미터 ══ */
  const _ev = {};
  function _fire(t) { (_ev[t] || []).forEach(f => { try { f(); } catch {} }); }
  function on(t, f) { if (!_ev[t]) _ev[t] = []; _ev[t].push(f); }

  /* ══ 내부 상태 ══ */
  let _students = [];

  /* ════════════════════════════════════════════
   * 수업명 → 반 코드 변환
   * "Happy 1" → "H1",  "Special" → "S"
   * ════════════════════════════════════════════ */
  function courseToClass(courseName) {
    if (!courseName) return '';
    const s     = String(courseName).trim();
    const first = s.match(/^([A-Za-z가-힣])/);   // 첫 글자
    const num   = s.match(/(\d+)\s*$/);            // 끝 숫자
    return (first ? first[1].toUpperCase() : '') + (num ? num[1] : '');
  }

  /* ════════════════════════════════════════════
   * 엑셀 행 → 학생 레코드
   * ════════════════════════════════════════════ */
  function parseRow(row) {
    const enrolled   = String(row['재원여부'] || '').trim().toUpperCase();
    const paused     = String(row['휴원여부'] || '').trim().toUpperCase();
    const courseName = _str(row['수업']);

    let status;
    if (enrolled === 'O' && paused === 'O') status = '휴원';
    else if (enrolled === 'O')              status = '재원';
    else                                    status = '퇴원';

    return {
      name:          _str(row['이름']),
      gender:        _str(row['성별']),
      attendanceNo:  _str(row['출결번호']),
      school:        _str(row['학교']),
      grade:         _str(row['학년']),
      courseName,
      classCode:     courseToClass(courseName),
      phone:         _str(row['원생연락처']),
      homePhone:     _str(row['집전화']),
      parentPhone:   _str(row['보호자연락처']),
      parentType:    _str(row['보호자구분']),
      parentName:    _str(row['보호자이름']),
      nickname:      _str(row['닉네임']),
      birthday:      _str(row['생일']),
      enrollDate:    _str(row['입학일']),
      status,
      leaveDate:     _str(row['퇴원일']),
      leaveReason:   _str(row['퇴원사유']),
      pauseReason:   _str(row['휴원사유']),
      teacher:       _str(row['담임강사']),
      memo:          _str(row['메모']),
      originalId:    _str(row['원생고유번호']),
      importedAt:    _now(),
    };
  }

  /* ════════════════════════════════════════════
   * INIT
   * DB.init() 이후에 호출해야 FireDB.ready() 가 확정됨
   * ════════════════════════════════════════════ */
  async function init() {
    _students = _lg(LS_KEY) || [];

    if (typeof FireDB === 'undefined' || !FireDB.ready()) {
      console.log('[StudentDB] offline mode – LocalStorage only');
      return;
    }

    // Firebase 초기 로드
    try {
      const snap = await FireDB.get(FB_PATH);
      if (snap) {
        _students = Object.values(snap);
        _ls(LS_KEY, _students);
      }
    } catch (e) {
      console.warn('[StudentDB] init FB error', e);
    }

    // 실시간 리스너
    FireDB.listen(FB_PATH, v => {
      const nd = v ? Object.values(v) : [];
      // 변경이 있을 때만 업데이트
      if (JSON.stringify(nd) !== JSON.stringify(_students)) {
        _students = nd;
        _ls(LS_KEY, _students);
        _fire('students');
      }
    });

    console.log('[StudentDB] ✅ ready, students:', _students.length);
  }

  /* ════════════════════════════════════════════
   * READ
   * ════════════════════════════════════════════ */
  const getAll = () => _students.slice();

  /**
   * 복합 필터
   * @param {object} opts
   * @param {string} opts.q         - 이름 / 닉네임 / 전화번호 검색어
   * @param {string} opts.status    - '재원' | '휴원' | '퇴원' | ''
   * @param {string} opts.grade     - '초2' 등 | ''
   * @param {string} opts.school    - 학교명 | ''
   * @param {string} opts.classCode - 반 코드 | ''
   */
  function getFiltered({ q = '', status = '', grade = '', school = '', classCode = '' } = {}) {
    let list = _students.slice();

    if (q) {
      const lq = q.toLowerCase().replace(/-/g, '');
      list = list.filter(s =>
        (s.name        || '').toLowerCase().includes(lq) ||
        (s.nickname    || '').toLowerCase().includes(lq) ||
        (s.phone       || '').replace(/-/g, '').includes(lq) ||
        (s.parentPhone || '').replace(/-/g, '').includes(lq)
      );
    }
    if (status)    list = list.filter(s => s.status    === status);
    if (grade)     list = list.filter(s => s.grade     === grade);
    if (school)    list = list.filter(s => s.school    === school);
    if (classCode) list = list.filter(s => s.classCode === classCode);

    return list;
  }

  /** 통계 요약 */
  function getStats() {
    const total    = _students.length;
    const enrolled = _students.filter(s => s.status === '재원').length;
    const paused   = _students.filter(s => s.status === '휴원').length;
    const left     = _students.filter(s => s.status === '퇴원').length;

    // 재원 학생 기준 반별 인원
    const byClass = {};
    _students
      .filter(s => s.status === '재원')
      .forEach(s => {
        if (s.classCode) byClass[s.classCode] = (byClass[s.classCode] || 0) + 1;
      });

    return { total, enrolled, paused, left, byClass };
  }

  /** 필터 드롭다운용 고유값 목록 */
  const getGrades  = () => [...new Set(_students.map(s => s.grade).filter(Boolean))].sort();
  const getSchools = () => [...new Set(_students.map(s => s.school).filter(Boolean))].sort();
  const getClasses = () => [...new Set(_students.map(s => s.classCode).filter(Boolean))].sort();

  /* ════════════════════════════════════════════
   * WRITE
   * ════════════════════════════════════════════ */

  /**
   * 단건 upsert
   * 반(classCode) + 이름이 같으면 덮어쓰기, 다르면 신규 추가
   */
  async function upsert(student) {
    const idx = _students.findIndex(s =>
      s.name === student.name && s.classCode === student.classCode
    );

    let rec;
    if (idx >= 0) {
      rec = { ..._students[idx], ...student, updatedAt: _now() };
      _students[idx] = rec;
    } else {
      rec = { id: _nid(), ...student, updatedAt: _now() };
      _students.push(rec);
    }

    _ls(LS_KEY, _students);

    if (typeof FireDB !== 'undefined' && FireDB.ready()) {
      await FireDB.set(`${FB_PATH}/${rec.id}`, rec).catch(e =>
        console.warn('[StudentDB] upsert FB error', e)
      );
    }
    return rec;
  }

  /**
   * 엑셀 전체 행 일괄 가져오기
   * @returns {{ added:number, updated:number, skipped:number }}
   */
  async function importFromRows(rows) {
    let added = 0, updated = 0, skipped = 0;

    for (const row of rows) {
      const student = parseRow(row);
      if (!student.name) { skipped++; continue; }

      const isUpdate = _students.some(
        s => s.name === student.name && s.classCode === student.classCode
      );
      await upsert(student);
      isUpdate ? updated++ : added++;
    }

    _ls(LS_KEY, _students);
    _fire('students');
    return { added, updated, skipped, total: rows.length };
  }

  /** 특정 학생 필드 업데이트 */
  async function updateStudent(id, data) {
    const idx = _students.findIndex(s => s.id === id);
    if (idx < 0) return null;

    _students[idx] = { ..._students[idx], ...data, updatedAt: _now() };
    _ls(LS_KEY, _students);

    if (typeof FireDB !== 'undefined' && FireDB.ready()) {
      await FireDB.set(`${FB_PATH}/${id}`, _students[idx]).catch(e =>
        console.warn('[StudentDB] update FB error', e)
      );
    }
    _fire('students');
    return _students[idx];
  }

  /** 학생 삭제 */
  async function deleteStudent(id) {
    _students = _students.filter(s => s.id !== id);
    _ls(LS_KEY, _students);

    if (typeof FireDB !== 'undefined' && FireDB.ready()) {
      await FireDB.remove(`${FB_PATH}/${id}`).catch(e =>
        console.warn('[StudentDB] delete FB error', e)
      );
    }
    _fire('students');
  }

  /* ════════════════════════════════════════════
   * PUBLIC API
   * ════════════════════════════════════════════ */
  return {
    init, on,
    getAll, getFiltered, getStats,
    getGrades, getSchools, getClasses,
    upsert, importFromRows, updateStudent, deleteStudent,
    parseRow, courseToClass,
  };
})();
