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

  /** 생일/연락처/닉네임 정보가 상충하면(둘 다 값이 있는데 다르면) 다른 사람으로 판단 */
  function _identityConflicts(a, b) {
    if (a.birthday && b.birthday && a.birthday !== b.birthday) return true;
    if (a.nickname && b.nickname && _bpNorm(a.nickname) !== _bpNorm(b.nickname)) return true;
    if (a.phone && b.phone && a.phone !== b.phone &&
        a.parentPhone && b.parentPhone && a.parentPhone !== b.parentPhone) return true;
    return false;
  }
  function _bpNorm(s) { return (s || '').toString().trim().toLowerCase(); }

  /**
   * 엑셀 재가져오기 시 기존 학생과 동일인인지 판단
   * 우선순위: ① 원생고유번호 일치 → ② 이름 일치 후보 중 생일/닉네임/연락처가 상충하지 않는 유일 후보
   *          → ③ 후보가 여럿이면 생일/닉네임/연락처가 실제 일치하는 사람 → ④ 그래도 구분 안 되면 반코드까지 일치해야 매칭
   * ※ 퇴원 처리된 학생은 엑셀의 '수업' 값이 비거나 달라져 classCode가 변할 수 있어
   *   반코드만으로 매칭하면 동일인을 놓쳐 중복 레코드가 생기는 문제가 있었음.
   *   단, 생일/닉네임 등 상충하는 정보가 있으면(진짜 동명이인) 절대 합치지 않는다.
   *   ※ 닉네임은 엑셀 원본에 항상 채워져 있는 값이라 생일/연락처가 비어있어도
   *     동명이인을 구분하는 안전망 역할을 한다.
   */
  function _findMatchIndex(student) {
    if (student.originalId) {
      const i = _students.findIndex(s => s.originalId && s.originalId === student.originalId);
      if (i >= 0) return i;
    }

    const nameMatches = _students
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.name === student.name);
    if (!nameMatches.length) return -1;

    // 생일/닉네임/연락처가 상충하는 후보(=명백히 다른 사람)는 제외
    const consistent = nameMatches.filter(({ s }) => !_identityConflicts(s, student));
    if (!consistent.length) return -1; // 이름만 같고 신원 정보가 다 다름 → 별도 인물

    if (consistent.length === 1) return consistent[0].i;

    // 후보가 여러 명(동명이인 가능성) → 생일/닉네임/연락처가 실제로 일치하는 사람 우선
    const strong = consistent.find(({ s }) =>
      (student.birthday    && s.birthday    && s.birthday    === student.birthday) ||
      (student.nickname    && s.nickname    && _bpNorm(s.nickname) === _bpNorm(student.nickname)) ||
      (student.phone       && s.phone       && s.phone       === student.phone) ||
      (student.parentPhone && s.parentPhone && s.parentPhone === student.parentPhone)
    );
    if (strong) return strong.i;

    // 그래도 구분 안 되면(정보 부족) 기존 방식대로 반코드까지 일치해야 매칭 (안전한 기본 동작)
    const exact = consistent.find(({ s }) => s.classCode === student.classCode);
    return exact ? exact.i : -1;
  }

  /**
   * 단건 upsert
   * ※ 매칭 기준은 _findMatchIndex 참고 (반+이름 단순매칭에서 개선됨)
   */
  async function upsert(student) {
    const idx = _findMatchIndex(student);

    let rec;
    if (idx >= 0) {
      rec = { ..._students[idx], ...student, updatedAt: _now() };
      _students[idx] = rec;
    } else {
      rec = { id: _nid(), ...student, updatedAt: _now() };
      _students.push(rec);
    }

    _ls(LS_KEY, _students);

    // ★ 연결 여부와 무관하게 항상 저장 시도 — 오프라인이면 FireDB.set이 자체 큐잉(데이터 유실 방지)
    if (typeof FireDB !== 'undefined') {
      await FireDB.set(`${FB_PATH}/${rec.id}`, rec).catch(e =>
        console.warn('[StudentDB] upsert FB error', e)
      );
    }
    return rec;
  }

  /**
   * 엑셀 전체 행 일괄 가져오기
   * @returns {{ added:number, updated:number, skipped:number, total:number,
   *             enrolledInExcel:number, enrolledInDb:number, possibleDuplicates:Array }}
   */
  async function importFromRows(rows) {
    let added = 0, updated = 0, skipped = 0, enrolledInExcel = 0;

    for (const row of rows) {
      const student = parseRow(row);
      if (!student.name) { skipped++; continue; }
      if (student.status === '재원') enrolledInExcel++;

      const isUpdate = _findMatchIndex(student) >= 0;
      await upsert(student);
      isUpdate ? updated++ : added++;
    }

    _ls(LS_KEY, _students);
    _fire('students');

    const enrolledInDb = _students.filter(s => s.status === '재원').length;
    return {
      added, updated, skipped, total: rows.length,
      enrolledInExcel, enrolledInDb,
      possibleDuplicates: findPossibleDuplicates(),
    };
  }

  /**
   * 이름은 같은데 생일/연락처로 서로 다른 사람인지 구분할 정보가 부족해
   * (즉, 진짜 동일인인지 동명이인인지 판단 불가한) 잠재적 중복 레코드를 찾아 반환.
   * 가져오기 직후 관리자가 눈으로 검토할 수 있도록 안내하는 용도.
   * @returns {Array<{name:string, students:Array}>}
   */
  function findPossibleDuplicates() {
    const byName = {};
    _students.forEach(s => { if (s.name) (byName[s.name] = byName[s.name] || []).push(s); });

    const suspects = [];
    Object.entries(byName).forEach(([name, list]) => {
      if (list.length < 2) return;
      // 서로 상충하는 생일/연락처가 없는 쌍이 하나라도 있으면 "구분 불가"로 의심
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (!_identityConflicts(list[i], list[j])) {
            suspects.push({ name, students: list });
            return; // 이 이름은 한 번만 등록
          }
        }
      }
    });
    return suspects;
  }

  /** 특정 학생 필드 업데이트 */
  async function updateStudent(id, data) {
    const idx = _students.findIndex(s => s.id === id);
    if (idx < 0) return null;

    _students[idx] = { ..._students[idx], ...data, updatedAt: _now() };
    _ls(LS_KEY, _students);

    // ★ 연결 여부와 무관하게 항상 저장 시도 — 오프라인이면 FireDB.set이 자체 큐잉(데이터 유실 방지)
    let savedToServer = false;
    if (typeof FireDB !== 'undefined') {
      savedToServer = await FireDB.set(`${FB_PATH}/${id}`, _students[idx]).catch(e => {
        console.warn('[StudentDB] update FB error', e);
        return false;
      });
    }
    _fire('students');
    // ★ 기존 호출부는 그대로 레코드 객체를 쓸 수 있고(하위 호환),
    //   새로 확인이 필요한 곳은 .savedToServer로 실제 서버 반영 여부를 알 수 있다.
    return { ..._students[idx], savedToServer: savedToServer === true };
  }

  /** 학생 삭제 */
  async function deleteStudent(id) {
    _students = _students.filter(s => s.id !== id);
    _ls(LS_KEY, _students);

    // ★ 연결 여부와 무관하게 항상 삭제 시도 — 오프라인이면 FireDB.remove가 자체 큐잉
    if (typeof FireDB !== 'undefined') {
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
    parseRow, courseToClass, findPossibleDuplicates,
  };
})();
