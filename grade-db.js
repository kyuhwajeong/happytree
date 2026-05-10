/**
 * grade-db.js — v2.0
 * 성적 관리 데이터 모듈
 *
 * reportConfig 구조 (v2)
 * ─────────────────────────────
 * {
 *   word: { totalQ: 20 },
 *   reading: {
 *     enabled: false,
 *     totalQ: 15,
 *     reviews: [
 *       { name:'Review 1', enabled:true },
 *       { name:'Review 2', enabled:true },
 *       { name:'Review 3', enabled:false },
 *       { name:'Review 4', enabled:false },
 *       // + 버튼으로 추가 가능
 *     ]
 *   }
 * }
 *
 * Firebase: hakwon10/grades/{clsId}/{stuId}/{bookId}/{recordId}
 * LS: hk10b_grades
 */
const GradeDB = (() => {
  const LS_GRADES = 'hk10b_grades';
  const FB_GRADES = 'hakwon10/grades';

  const _lg  = k     => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const _ls  = (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const _nid = ()    => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const _now = ()    => new Date().toISOString();
  const _today = ()  => new Date().toISOString().slice(0,10);
  const _fb  = ()    => typeof FireDB !== 'undefined' && FireDB.ready();

  const _ev = {};
  function _fire(t) { (_ev[t]||[]).forEach(f=>{try{f();}catch(e){console.warn(e);}}); }
  function on(t,f)   { if(!_ev[t]) _ev[t]=[]; _ev[t].push(f); }

  let _grades = {};

  /* ══ INIT ══ */
  // Firebase 객체 구조 → 메모리 배열 구조 변환
  function _snapToGrades(snap) {
    const g = {};
    if (!snap || typeof snap !== 'object') return g;
    for (const [cid, byStudent] of Object.entries(snap)) {
      g[cid] = {};
      for (const [sid, byBook] of Object.entries(byStudent || {})) {
        g[cid][sid] = {};
        for (const [bid, recs] of Object.entries(byBook || {})) {
          if (Array.isArray(recs)) {
            // 이미 배열 (로컬스토리지 버전)
            g[cid][sid][bid] = recs;
          } else if (recs && typeof recs === 'object') {
            // Firebase 객체 {recId: rec} → 배열로 변환
            g[cid][sid][bid] = Object.values(recs).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||''));
          } else {
            g[cid][sid][bid] = [];
          }
        }
      }
    }
    return g;
  }

  async function init() {
    // 로컬스토리지는 이미 배열 구조
    _grades = _lg(LS_GRADES) || {};
    if (!_fb()) { console.log('[GradeDB] offline'); return; }
    try {
      const snap = await FireDB.get(FB_GRADES).catch(()=>null);
      if (snap) {
        // ★ Firebase 객체 구조를 배열 구조로 변환 후 저장
        _grades = _snapToGrades(snap);
        _ls(LS_GRADES, _grades);
      }
    } catch(e) { console.warn('[GradeDB] init', e); }
    console.log('[GradeDB] ✅ v2');
  }

  /* ══ 교재 리포트 설정 ══ */
  function defaultConfig() {
    return {
      word: { totalQ: 0 },
      reading: {
        enabled: false,
        totalQ:  0,
        reviews: [
          { name:'Review 1', enabled:true  },
          { name:'Review 2', enabled:true  },
          { name:'Review 3', enabled:false },
          { name:'Review 4', enabled:false },
        ],
      },
    };
  }

  function getReportConfig(bookId) {
    if (typeof BookLibDB === 'undefined') return defaultConfig();
    const book = BookLibDB.getBookById(bookId);
    if (!book?.reportConfig) return defaultConfig();
    // 하위호환: reviews 배열이 boolean 배열인 경우 변환
    const rc = book.reportConfig;
    if (rc.reading?.reviews && typeof rc.reading.reviews[0] === 'boolean') {
      rc.reading.reviews = rc.reading.reviews.map((on, i) =>
        ({ name:`Review ${i+1}`, enabled: on })
      );
    }
    // reviews 없으면 기본값
    if (!rc.reading?.reviews) {
      rc.reading = rc.reading || {};
      rc.reading.reviews = defaultConfig().reading.reviews;
    }
    return rc;
  }

  async function saveReportConfig(bookId, config) {
    if (typeof BookLibDB === 'undefined') return;
    await BookLibDB.updateBook(bookId, { reportConfig: config });
  }

  /* 활성화된 Review 목록 반환 */
  function getActiveReviews(bookId) {
    const config = getReportConfig(bookId);
    if (!config.reading?.enabled) return [];
    return (config.reading.reviews || [])
      .map((r, i) => ({ ...r, idx: i }))
      .filter(r => r.enabled);
  }

  /* ══ 성적 CRUD ══ */
  const getRecords = (cid, sid, bid) =>
    (_grades[cid]?.[sid]?.[bid] || []).slice().reverse();

  const getLatest = (cid, sid, bid) => {
    const list = _grades[cid]?.[sid]?.[bid] || [];
    return list.length ? list[list.length-1] : null;
  };

  async function saveRecord(record) {
    const { classId, studentId, bookId } = record;
    if (!classId || !studentId || !bookId) return null;

    if (!_grades[classId]) _grades[classId] = {};
    if (!_grades[classId][studentId]) _grades[classId][studentId] = {};
    if (!_grades[classId][studentId][bookId]) _grades[classId][studentId][bookId] = [];

    const list  = _grades[classId][studentId][bookId];
    const today = _today();
    const idx   = list.findIndex(r => r.date === today);

    let rec;
    if (idx >= 0) {
      rec = { ...list[idx], ...record, updatedAt:_now() };
      list[idx] = rec;
    } else {
      rec = { id:_nid(), ...record, date:today, createdAt:_now(), updatedAt:_now() };
      list.push(rec);
    }
    _ls(LS_GRADES, _grades);
    if (_fb()) {
      try {
        await FireDB.set(`${FB_GRADES}/${classId}/${studentId}/${bookId}/${rec.id}`, rec);
      } catch(e) {
        console.error('[GradeDB] saveRecord Firebase 오류:', e);
        // 로컬에는 저장됨, Firebase 실패 시 경고
      }
    }
    _fire('grades');
    return rec;
  }

  async function deleteRecord(cid, sid, bid, recordId) {
    const list = _grades[cid]?.[sid]?.[bid]; if (!list) return;
    const idx  = list.findIndex(r => r.id === recordId); if (idx<0) return;
    list.splice(idx, 1);
    _ls(LS_GRADES, _grades);
    if (_fb()) {
      try {
        await FireDB.remove(`${FB_GRADES}/${cid}/${sid}/${bid}/${recordId}`);
      } catch(e) {
        console.error('[GradeDB] deleteRecord Firebase 오류:', e);
      }
    }
    _fire('grades');
  }

  /* ══ 계산 ══ */
  const calcScore = (correct, total) => {
    if (!total || total <= 0) return 0;
    return Math.round(correct / total * 1000) / 10;
  };

  function calcAchievement(readingData, config) {
    if (!config?.reading?.enabled) return null;
    const reviews = config.reading.reviews || [];
    const active  = reviews.filter(r => r.enabled);
    if (!active.length) return null;
    const scores = active
      .map((r, i) => readingData?.[`R${i}`]?.score)
      .filter(s => s != null);
    if (!scores.length) return null;
    return Math.round(scores.reduce((a,b)=>a+b,0) / scores.length * 10) / 10;
  }

  function getClassSummary(cid, bid) {
    const cls = _grades[cid] || {};
    return Object.keys(cls).map(sid => getLatest(cid, sid, bid)).filter(Boolean);
  }

  async function deleteAllForBook(bookId){
    // 특정 교재의 성적 데이터 전체 삭제
    // 메모리에서 제거
    for(const cid of Object.keys(_grades)){
      for(const sid of Object.keys(_grades[cid]||{})){
        if(_grades[cid][sid][bookId]){
          delete _grades[cid][sid][bookId];
        }
      }
    }
    _ls(LS_GRADES, _grades);
    // Firebase에서 제거: hakwon10/grades/{cid}/{sid}/{bookId}
    if(_fb()){
      try{
        const allCls=await FireDB.get(FB_GRADES);
        if(allCls){
          for(const cid of Object.keys(allCls)){
            const clsData=allCls[cid];
            if(clsData){
              for(const sid of Object.keys(clsData)){
                if(clsData[sid]&&clsData[sid][bookId]){
                  await FireDB.remove(`${FB_GRADES}/${cid}/${sid}/${bookId}`).catch(console.warn);
                }
              }
            }
          }
        }
      }catch(e){console.warn('grade deleteAllForBook error',e);}
    }
  }

  return {
    init, on,
    defaultConfig, getReportConfig, saveReportConfig, getActiveReviews,
    getRecords, getLatest, saveRecord, deleteRecord,
    deleteAllForBook,
    calcScore, calcAchievement, getClassSummary,
  };
})();
