/**
 * booklib-db.js — v3.1
 *
 * 교재 라이브러리 + 챕터 체크 + 세부미수행 + 진도 스탬프
 *
 * 챕터 타입 판별 규칙 (v3.1)
 *   1. [단어] 대괄호 있으면 → word
 *   2. [문장] 대괄호 있으면 → sentence
 *   3. 대괄호 없이 '단어' 포함 → word
 *   4. 대괄호 없이 '문장' 포함 → sentence
 *   5. 그 외 → none
 *
 * 세부미수행 옵션
 *   word:     암기/리콜/스펠/스피킹/매칭/테스트
 *   sentence: 암기/리콜/스펠/스피킹/스크램블/테스트
 *
 * 체크값: "YYYY-MM-DD[:task1,task2]"
 * 스탬프: "YYYY-MM-DD HH:MM"
 */
const BookLibDB = (() => {
  const LS_BOOKS  = 'hk10b_booklib';
  const LS_CHECKS = 'hk10b_bookcheck';
  const LS_STAMPS = 'hk10b_bookstamps';
  const FB_BOOKS  = 'hakwon10/booklib';
  const FB_CHECKS = 'hakwon10/bookcheck';
  const FB_STAMPS = 'hakwon10/bookstamps';

  const _lg  = k     => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const _ls  = (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const _nid = ()    => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const _now = ()    => new Date().toISOString();
  const _today = ()  => new Date().toISOString().slice(0,10);
  const _fb  = ()    => typeof FireDB !== 'undefined' && FireDB.ready();

  const _ev = {};
  function _fire(t) { (_ev[t]||[]).forEach(f=>{try{f();}catch(e){console.warn('[BookLibDB]',e);}}); }
  function on(t,f)   { if(!_ev[t]) _ev[t]=[]; _ev[t].push(f); }

  let _books  = [];
  let _checks = {};
  let _stamps = {};
  let _mlsn   = {};
  let _slsn   = {};

  /* ── 세부미수행 옵션 ── */
  const SUBTASKS = {
    word:     ['암기','리콜','스펠','스피킹','매칭','테스트'],
    sentence: ['암기','리콜','스펠','스피킹','스크램블','테스트'],
    none:     [],
  };

  /**
   * 챕터 타입 판별
   * 우선순위: [단어]/[문장] 대괄호 → '단어'/'문장' 포함
   */
  function detectChapterType(title) {
    if (!title) return 'none';
    if (/\[단어\]/.test(title))  return 'word';
    if (/\[문장\]/.test(title))  return 'sentence';
    if (/단어/.test(title))      return 'word';
    if (/문장/.test(title))      return 'sentence';
    return 'none';
  }

  function getSubtaskOptions(title) {
    return SUBTASKS[detectChapterType(title)] || [];
  }

  /* ── 체크값 파싱/직렬화 ── */
  function _parseCheck(raw) {
    if (!raw) return { date:'', tasks:[] };
    const [date, taskStr=''] = String(raw).split(':');
    return { date, tasks: taskStr ? taskStr.split(',').filter(Boolean) : [] };
  }
  function _serCheck(date, tasks) {
    if (!tasks || !tasks.length) return date || _today();
    return `${date||_today()}:${tasks.join(',')}`;
  }

  /* ══ INIT ══ */
  async function init() {
    _books  = _lg(LS_BOOKS)  || [];
    _checks = _lg(LS_CHECKS) || {};
    _stamps = _lg(LS_STAMPS) || {};
    if (!_fb()) { console.log('[BookLibDB] offline'); return; }
    try {
      const [bS,cS,sS] = await Promise.all([
        FireDB.get(FB_BOOKS).catch(()=>null),
        FireDB.get(FB_CHECKS).catch(()=>null),
        FireDB.get(FB_STAMPS).catch(()=>null),
      ]);
      if (bS) { _books = Object.values(bS); _ls(LS_BOOKS,_books); }
      if (cS) { _checks = cS; _ls(LS_CHECKS,_checks); }
      if (sS) { _stamps = sS; _ls(LS_STAMPS,_stamps); }
    } catch(e) { console.warn('[BookLibDB] init',e); }
    FireDB.listen(FB_BOOKS, v => {
      const nd = v ? Object.values(v) : [];
      if (JSON.stringify(nd) !== JSON.stringify(_books)) {
        _books = nd; _ls(LS_BOOKS,_books); _fire('books');
      }
    });
    console.log('[BookLibDB] ✅ v3.1, books:', _books.length);
  }

  /* ══ BOOKS ══ */
  const getBooks         = () => _books.filter(b=>!b.archived).sort((a,b)=>(a.sortOrder??9999)-(b.sortOrder??9999));
  const getAllBooks       = () => _books.slice();
  const getArchivedBooks = () => _books.filter(b=>b.archived).sort((a,b)=>(b.archivedAt||'').localeCompare(a.archivedAt||''));
  const getBookById = id => _books.find(b=>b.id===id) || null;

  async function addBook(name) {
    const b = { id:_nid(), name:name.trim(), chapters:[], classIds:[], createdAt:_now() };
    _books.push(b); _ls(LS_BOOKS,_books);
    if (_fb()) await FireDB.set(`${FB_BOOKS}/${b.id}`,b).catch(console.warn);
    _fire('books'); return b;
  }

  async function updateBook(id, data) {
    const i = _books.findIndex(b=>b.id===id); if(i<0) return null;
    _books[i] = {..._books[i], ...data, updatedAt:_now()};
    _ls(LS_BOOKS,_books);
    if (_fb()) await FireDB.set(`${FB_BOOKS}/${id}`,_books[i]).catch(console.warn);
    _fire('books'); return _books[i];
  }

  async function deleteBook(id) {
    _books = _books.filter(b=>b.id!==id); _ls(LS_BOOKS,_books);
    if (_fb()) await FireDB.remove(`${FB_BOOKS}/${id}`).catch(console.warn);
    const ks = Object.keys(_checks).filter(k=>k.includes(`__${id}`));
    ks.forEach(k=>{ delete _checks[k]; delete _stamps[k]; });
    _ls(LS_CHECKS,_checks); _ls(LS_STAMPS,_stamps);
    if (_fb()) for(const k of ks) {
      await FireDB.remove(`${FB_CHECKS}/${k}`).catch(console.warn);
      await FireDB.remove(`${FB_STAMPS}/${k}`).catch(console.warn);
    }
    _fire('books');
  }

  /* ══ CHAPTERS ══ */
  async function reorderBooks(ids) {
    ids.forEach((id,i)=>{ const b=_books.find(x=>x.id===id); if(b) b.sortOrder=i; });
    _ls(LS_BOOKS, _books);
    if(_fb()) ids.forEach((id,i)=>FireDB.update(`${FB_BOOKS}/${id}`,{sortOrder:i}).catch(()=>{}));
  }

  async function archiveBook(id) {
    const b=_books.find(x=>x.id===id); if(!b) return;
    b.archived=true; b.archivedAt=_now();
    _ls(LS_BOOKS, _books);
    if(_fb()) FireDB.update(`${FB_BOOKS}/${id}`,{archived:true,archivedAt:b.archivedAt}).catch(()=>{});
    _fire('books');
  }

  async function unarchiveBook(id) {
    const b=_books.find(x=>x.id===id); if(!b) return;
    b.archived=false; delete b.archivedAt;
    _ls(LS_BOOKS, _books);
    if(_fb()) FireDB.update(`${FB_BOOKS}/${id}`,{archived:false,archivedAt:null}).catch(()=>{});
    _fire('books');
  }

  async function copyBook(id) {
    const src=_books.find(x=>x.id===id); if(!src) return null;
    const copy={
      ...JSON.parse(JSON.stringify(src)),
      id:_nid(), name:src.name+' (복사)', createdAt:_now(),
      archived:false, archivedAt:undefined, sortOrder:(_books.length)
    };
    delete copy.archivedAt;
    _books.push(copy); _ls(LS_BOOKS, _books);
    if(_fb()) FireDB.set(`${FB_BOOKS}/${copy.id}`, copy).catch(()=>{});
    _fire('books'); return copy;
  }

  function assignStudents(bookId, studentIds) {
    const b=_books.find(x=>x.id===bookId); if(!b) return;
    b.studentIds = studentIds;
    _ls(LS_BOOKS, _books);
    if(_fb()) FireDB.update(`${FB_BOOKS}/${bookId}`,{studentIds:studentIds}).catch(()=>{});
    _fire('books');
  }
  async function addStudentToBook(bookId, studentId){
    const b=getBookById(bookId); if(!b) return;
    const ids=[...new Set([...(b.studentIds||[]),(studentId)])];
    return updateBook(bookId,{studentIds:ids});
  }
  async function batchAddStudents(bookId, studentIds){
    const b=getBookById(bookId); if(!b) return;
    const newIds=[...new Set([...(b.studentIds||[]),...studentIds])];
    return updateBook(bookId,{studentIds:newIds});
  }
  async function removeStudentFromBook(bookId, studentId){
    const b=getBookById(bookId); if(!b) return;
    const ids=(b.studentIds||[]).filter(id=>id!==studentId);
    return updateBook(bookId,{studentIds:ids});
  }

  async function setChapters(bookId, chapters, mode='replace') {
    const book = getBookById(bookId); if (!book) return null;
    const norm = (items, start=0) => items
      .map(c => typeof c==='string' ? {title:c.trim()} : c)
      .filter(c => String(c.title||'').trim())
      .map((c,i) => ({
        id:       c.id||_nid(),
        title:    String(c.title).trim(),
        order:    start+i,
        ...(c.fromXlsx ? {fromXlsx:true} : {}),  // ★ 신규 챕터 플래그 보존
      }));
    const newChs = mode==='append'
      ? [...book.chapters, ...norm(chapters, book.chapters.length)]
      : norm(chapters);
    return updateBook(bookId, { chapters: newChs });
  }

  async function deleteChapter(bookId, chId) {
    const book = getBookById(bookId); if (!book) return;
    return updateBook(bookId, {
      chapters: book.chapters.filter(c=>c.id!==chId).map((c,i)=>({...c,order:i}))
    });
  }

  /* ══ CLASS ↔ BOOK ══ */
  const getBooksForClass = cid => _books.filter(b=>(b.classIds||[]).includes(cid));
  const isBookInClass    = (bid,cid) => (getBookById(bid)?.classIds||[]).includes(cid);

  async function assignBook(bookId, classId) {
    const book = getBookById(bookId); if (!book) return;
    return updateBook(bookId, { classIds:[...new Set([...(book.classIds||[]),classId])] });
  }
  async function unassignBook(bookId, classId) {
    const book = getBookById(bookId); if (!book) return;
    return updateBook(bookId, { classIds:(book.classIds||[]).filter(id=>id!==classId) });
  }

  /* ══ CHECKS ══ */
  const _ck = (cid,bid)  => `${cid}__${bid}`;
  const _sk = (sid,chid) => `${sid}__${chid}`;

  const getMatrixChecks = (cid,bid)          => _checks[_ck(cid,bid)] || {};
  const getRawCheck     = (cid,bid,sid,chid) => _checks[_ck(cid,bid)]?.[_sk(sid,chid)] || null;
  const isChecked       = (cid,bid,sid,chid) => !!getRawCheck(cid,bid,sid,chid);
  const getCheckParsed  = (cid,bid,sid,chid) => _parseCheck(getRawCheck(cid,bid,sid,chid));
  const getSubTasks     = (cid,bid,sid,chid) => getCheckParsed(cid,bid,sid,chid).tasks;

  async function setCheck(classId, bookId, studentId, chapterId, checked, tasks) {
    const ck=_ck(classId,bookId), sk=_sk(studentId,chapterId);
    if (!_checks[ck]) _checks[ck]={};
    if (checked) _checks[ck][sk] = _serCheck(_today(), tasks||[]);
    else         delete _checks[ck][sk];
    _ls(LS_CHECKS,_checks);
    const path = `${FB_CHECKS}/${ck}/${sk}`;
    if (_fb()) {
      if (checked) FireDB.set(path, _checks[ck][sk]).catch(console.warn);
      else         FireDB.remove(path).catch(console.warn);
    }
  }

  async function setSubTasks(classId, bookId, studentId, chapterId, tasks) {
    const ck=_ck(classId,bookId), sk=_sk(studentId,chapterId);
    if (!_checks[ck]?.[sk]) return;
    const existing = _parseCheck(_checks[ck][sk]);
    _checks[ck][sk] = _serCheck(existing.date || _today(), tasks);
    _ls(LS_CHECKS,_checks);
    if (_fb()) FireDB.set(`${FB_CHECKS}/${ck}/${sk}`, _checks[ck][sk]).catch(console.warn);
  }

  function listenMatrix(classId, bookId, cb) {
    const ck = _ck(classId,bookId);
    if (_mlsn[ck]) { _mlsn[ck](); delete _mlsn[ck]; }
    if (!_fb()) return ()=>{};
    _mlsn[ck] = FireDB.listen(`${FB_CHECKS}/${ck}`, v=>{
      _checks[ck]=v||{}; _ls(LS_CHECKS,_checks); cb(_checks[ck]);
    });
    return ()=>{ if(_mlsn[ck]){_mlsn[ck]();delete _mlsn[ck];} };
  }

  /* ══ STAMPS ("YYYY-MM-DD HH:MM") ══ */
  const getStamps = (cid,bid) => _stamps[_ck(cid,bid)] || {};

  async function setStamp(classId, bookId, chapterId, ts) {
    const ck = _ck(classId,bookId);
    if (!_stamps[ck]) _stamps[ck]={};
    _stamps[ck][chapterId] = ts;
    _ls(LS_STAMPS,_stamps);
    if (_fb()) await FireDB.set(`${FB_STAMPS}/${ck}/${chapterId}`,ts).catch(console.warn);
  }

  async function removeStamp(classId, bookId, chapterId) {
    const ck = _ck(classId,bookId);
    if (_stamps[ck]) { delete _stamps[ck][chapterId]; _ls(LS_STAMPS,_stamps); }
    if (_fb()) await FireDB.remove(`${FB_STAMPS}/${ck}/${chapterId}`).catch(console.warn);
  }

  function listenStamps(classId, bookId, cb) {
    const ck = _ck(classId,bookId);
    if (_slsn[ck]) { _slsn[ck](); delete _slsn[ck]; }
    if (!_fb()) return ()=>{};
    _slsn[ck] = FireDB.listen(`${FB_STAMPS}/${ck}`, v=>{
      _stamps[ck]=v||{}; _ls(LS_STAMPS,_stamps); cb(_stamps[ck]);
    });
    return ()=>{ if(_slsn[ck]){_slsn[ck]();delete _slsn[ck];} };
  }


  // ★ 면제 학생 저장/로드 (localStorage, classId 기준)
  const _EXEMPT_KEY = classId => 'bl_class_exempt_' + classId;
  async function saveClassExempts(classId, exempts) {
    try { localStorage.setItem(_EXEMPT_KEY(classId), JSON.stringify(exempts)); } catch(e) {}
    try {
      if(typeof FireDB!=='undefined'&&FireDB.ready())
        await FireDB.set('hakwon10/exempts/'+classId, exempts);
    } catch(e) {}
  }
  async function loadClassExempts(classId) {
    try {
      if(typeof FireDB!=='undefined'&&FireDB.ready()){
        const data = await FireDB.get('hakwon10/exempts/'+classId);
        if(data){ localStorage.setItem(_EXEMPT_KEY(classId), JSON.stringify(data)); return data; }
      }
    } catch(e) {}
    try { return JSON.parse(localStorage.getItem(_EXEMPT_KEY(classId)) || '{}'); } catch(e) { return {}; }
  }

  // ★ 메모 DB 저장 (Firebase + localStorage 이중 저장)
  async function saveMemo(classId, bookId, data){
    const key=classId+'_'+bookId;
    const payload={...data, updatedAt:new Date().toISOString()};
    try{
      if(typeof FireDB!=='undefined'&&FireDB.ready()){
        await FireDB.set('hakwon10/memos/'+key, payload);
      }
      localStorage.setItem('bl_memo_db_'+key, JSON.stringify(payload));
    }catch(e){ localStorage.setItem('bl_memo_db_'+key, JSON.stringify(payload)); }
  }
  async function loadMemo(classId, bookId){
    const key=classId+'_'+bookId;
    try{
      if(typeof FireDB!=='undefined'&&FireDB.ready()){
        const data=await FireDB.get('hakwon10/memos/'+key);
        if(data){ localStorage.setItem('bl_memo_db_'+key, JSON.stringify(data)); return data; }
      }
    }catch(e){}
    const local=localStorage.getItem('bl_memo_db_'+key);
    return local?JSON.parse(local):null;
  }
  async function saveMemoCheck(classId, bookId, checked){
    await saveMemo(classId, bookId, {checked});
  }

  return {
    init, on,
    getBooks, getAllBooks, getArchivedBooks, getBookById,
    addBook, updateBook, deleteBook,
    reorderBooks, archiveBook, unarchiveBook, copyBook, assignStudents, addStudentToBook, batchAddStudents, removeStudentFromBook,
    setChapters, deleteChapter,
    getBooksForClass, isBookInClass, assignBook, unassignBook,
    getMatrixChecks, getRawCheck, isChecked, getCheckParsed, getSubTasks,
    setCheck, setSubTasks, listenMatrix,
    getStamps, setStamp, removeStamp, listenStamps,
    detectChapterType, getSubtaskOptions, SUBTASKS,
    _parseCheck, _serCheck,
    saveClassExempts, loadClassExempts,
    saveMemo, loadMemo,
  };
})();
