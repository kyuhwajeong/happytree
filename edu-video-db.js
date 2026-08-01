/**
 * edu-video-db.js — 영문 교육자료(유튜브 영상 + 대본 + AI 추출 단어) 데이터 계층
 * 파일 업로드가 없는 항목이라 ArchiveDB와 분리된 별도 저장소를 쓴다.
 * 저장 방식(로컬 캐시 + 실시간 리스너 + undefined 방어)은 동일 패턴.
 */
const EduVideoDB = (() => {
  const LS_KEY = 'hk10b_eduvideo';
  const FB_PATH = 'hakwon10/eduVideos';

  const _lg = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const _ls = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const _nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const _now = () => new Date().toISOString();

  const _ev = {};
  function _fire(t) { (_ev[t] || []).forEach(f => { try { f(); } catch (e) { console.warn('[EduVideoDB]', e); } }); }
  function on(t, f) { if (!_ev[t]) _ev[t] = []; _ev[t].push(f); }

  let _list = [];
  const DEFAULT_TOPICS = ['여행', '가구', '학교', '과일', '동물', '음식', '날씨', '가족'];
  const LS_TOPICS = 'hk10b_eduvideo_topics';
  let _topics = _lg(LS_TOPICS) || DEFAULT_TOPICS.slice();

  function getTopics() { return _topics.slice(); }
  async function addTopic(name) {
    name = (name || '').trim();
    if (!name || _topics.includes(name)) return _topics.slice();
    _topics.push(name);
    _ls(LS_TOPICS, _topics);
    if (typeof FireDB !== 'undefined') await FireDB.set('hakwon10/eduVideoTopics', _topics).catch(() => {});
    _fire('topics');
    return _topics.slice();
  }

  function _saveLS() { _ls(LS_KEY, _list); }

  async function init() {
    _list = _lg(LS_KEY) || [];
    if (typeof FireDB === 'undefined') { console.warn('[EduVideoDB] FireDB 없음 — 초기화 중단'); return; }
    try {
      const data = await FireDB.get(FB_PATH);
      if (data) { _list = Object.values(data); _saveLS(); }
      const topicData = await FireDB.get('hakwon10/eduVideoTopics');
      if (Array.isArray(topicData) && topicData.length) { _topics = topicData; _ls(LS_TOPICS, _topics); }
    } catch (e) { console.warn('[EduVideoDB] init', e); }

    FireDB.listen(FB_PATH, v => {
      const nd = v ? Object.values(v) : [];
      if (JSON.stringify(nd) !== JSON.stringify(_list)) { _list = nd; _saveLS(); _fire('videos'); }
    });
    FireDB.listen('hakwon10/eduVideoTopics', v => {
      if (Array.isArray(v) && JSON.stringify(v) !== JSON.stringify(_topics)) { _topics = v; _ls(LS_TOPICS, _topics); _fire('topics'); }
    });
    console.log(`[EduVideoDB] ✅ ready, videos: ${_list.length}, topics: ${_topics.length}`);
  }

  function getAll() { return _list.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')); }
  function getById(id) { return _list.find(x => x.id === id) || null; }
  function getByTopic(topic) { return getAll().filter(x => x.topic === topic); }

  /* ── 권한(작성자/공개설정) — ArchiveDB와 동일한 정책 ── */
  function _currentUsername() {
    return (typeof DB !== 'undefined' && DB.getSession) ? (DB.getSession()?.username || '') : '';
  }
  function _isCurrentAdmin() {
    return typeof DB !== 'undefined' && DB.isAdmin && DB.isAdmin();
  }
  function isOwner(video) {
    const u = _currentUsername();
    return !!u && video?.createdBy === u;
  }
  // ★ admin은 전부 다 보임(비공개 포함). 그 외 계정은 "공개"이거나
  //   "내가 올린 것"만 보인다 — 남이 올린 비공개 영상은 목록에서부터 안 보임.
  function getVisibleVideos() {
    if (_isCurrentAdmin()) return getAll();
    return getAll().filter(v => v.visibility !== 'private' || isOwner(v));
  }
  function getVisibleByTopic(topic) { return getVisibleVideos().filter(x => x.topic === topic); }

  function _extractYoutubeId(url) {
    const m = (url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
    return m ? m[1] : null;
  }

  // Create
  async function addVideo({ title, youtubeUrl, topic, script, createdBy, visibility }) {
    const youtubeId = _extractYoutubeId(youtubeUrl);
    if (!youtubeId) throw new Error('올바른 유튜브 링크가 아닙니다');
    const id = _nid();
    const rec = {
      id, youtubeId, youtubeUrl,
      title: (title || '').trim() || '(제목 없음)',
      topic: topic || '기타',
      script: (script || '').trim(),
      words: [], // AI로 추출한 단어 목록 — extractWords()로 채워짐
      visibility: visibility === 'private' ? 'private' : 'public', // ★ 기본은 공개(ArchiveDB와 동일 정책)
      createdAt: _now(), updatedAt: _now(), createdBy: createdBy || '',
    };
    _list.push(rec);
    _saveLS(); _fire('videos');
    let savedToServer = false;
    if (typeof FireDB !== 'undefined') {
      savedToServer = await FireDB.set(`${FB_PATH}/${id}`, rec).catch(() => false);
    }
    return { ...rec, savedToServer: savedToServer === true };
  }

  // Update (스크립트 수정, 추출된 단어 저장 등)
  async function updateVideo(id, patch) {
    const idx = _list.findIndex(x => x.id === id);
    if (idx < 0) return null;
    const cleanPatch = {};
    for (const k in patch) { if (patch[k] !== undefined) cleanPatch[k] = patch[k]; }
    const rec = { ..._list[idx], ...cleanPatch, updatedAt: _now() };
    _list[idx] = rec;
    _saveLS(); _fire('videos');
    let savedToServer = false;
    if (typeof FireDB !== 'undefined') {
      savedToServer = await FireDB.set(`${FB_PATH}/${id}`, rec).catch(() => false);
    }
    return { ...rec, savedToServer: savedToServer === true };
  }

  // Delete
  async function deleteVideo(id) {
    _list = _list.filter(x => x.id !== id);
    _saveLS(); _fire('videos');
    if (typeof FireDB !== 'undefined') {
      await FireDB.remove(`${FB_PATH}/${id}`).catch(e => console.warn('[EduVideoDB] 삭제 실패', e));
    }
    return { ok: true };
  }

  return {
    init, on,
    getAll, getById, getByTopic, getTopics, addTopic,
    addVideo, updateVideo, deleteVideo,
    isOwner, getVisibleVideos, getVisibleByTopic,
  };
})();
