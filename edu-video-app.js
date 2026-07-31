/**
 * edu-video-app.js — 영문 교육자료 화면
 * 유튜브 영상을 주제별로 등록/재생하고, 대본에서 AI로 단어를 추출해
 * 이미지가 포함된 학습 워크시트 PDF를 만들어준다.
 */
const EduVideoApp = (() => {
  const _q = id => document.getElementById(id);
  const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  // ★★★ Unsplash 가입 후(무료, 카드 불필요) 아래 값을 실제 Access Key로 바꿔주세요 ★★★
  // https://unsplash.com/developers → New Application → Access Key 복사
  const UNSPLASH_ACCESS_KEY = 'yUhFiyfYIWr_g3X0J7n1922oC28OfyQHz7RiZ-CDTMA';
  // ★★★ Google Cloud Console에서 YouTube Data API v3 활성화 후(무료, 카드 불필요) 실제 키로 바꿔주세요 ★★★
  const YOUTUBE_API_KEY = 'AIzaSyCbbS4jkWNUyyO83AdzCwagUKYQJJKtsKY';

  let _curTopic = null; // null = 전체
  let _cssInjected = false;

  function _css() {
    if (_cssInjected) return; _cssInjected = true;
    const s = document.createElement('style');
    s.textContent = `
.ev-cats-row{display:flex;align-items:center;gap:8px;padding:10px 14px;flex-shrink:0}
.ev-cats{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;flex:1;min-width:0}
.ev-cats::-webkit-scrollbar{display:none}
.ev-rec-btn{flex-shrink:0;white-space:nowrap}
.ev-cat-tab{flex-shrink:0;padding:7px 13px;border-radius:999px;border:1px solid var(--bdr);background:var(--card2);color:var(--tx2);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
.ev-cat-tab.on{background:var(--a);border-color:var(--a);color:#fff}
.ev-cat-tab.add{border-style:dashed}
.ev-body{flex:1;overflow-y:auto;padding:0 14px 90px}
.ev-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.ev-card{background:var(--card);border:1px solid var(--bdr);border-radius:14px;overflow:hidden;cursor:pointer;transition:transform .1s}
.ev-card:active{transform:scale(.97)}
.ev-card-thumb{width:100%;aspect-ratio:16/9;object-fit:cover;background:var(--surf2);display:block;position:relative}
.ev-card-body{padding:10px}
.ev-card-title{font-size:12.5px;font-weight:700;color:var(--tx);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.35;min-height:34px}
.ev-card-meta{display:flex;justify-content:space-between;align-items:center;margin-top:6px}
.ev-card-topic{font-size:9.5px;font-weight:700;color:var(--a);background:var(--a10);border-radius:6px;padding:2px 6px}
.ev-card-words{font-size:9.5px;color:var(--tx3)}
.ev-empty{text-align:center;padding:60px 20px;color:var(--tx3)}
.ev-empty-ico{font-size:44px;margin-bottom:10px;opacity:.6}
.ev-fab{position:fixed;right:18px;bottom:calc(var(--nav) + env(safe-area-inset-bottom, 0px) + 20px);width:54px;height:54px;border-radius:50%;background:var(--a);color:#fff;
  border:none;font-size:24px;box-shadow:0 6px 18px var(--a40);cursor:pointer;z-index:60;display:flex;align-items:center;justify-content:center}
.ev-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:200;display:flex;align-items:flex-end;justify-content:center}
@media (min-width:640px){ .ev-ov{align-items:center} }
.ev-sheet{background:var(--card);width:100%;max-width:560px;max-height:90vh;border-radius:20px 20px 0 0;overflow-y:auto;padding:18px}
@media (min-width:640px){ .ev-sheet{border-radius:20px} }
.ev-sheet-title{font-size:15px;font-weight:800;color:var(--tx);margin-bottom:14px}
.ev-field{margin-bottom:12px}
.ev-field label{display:block;font-size:11px;font-weight:700;color:var(--tx3);margin-bottom:5px}
.ev-field input,.ev-field textarea,.ev-field select{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--bdr);background:var(--surf);color:var(--tx);font-size:13px;font-family:inherit}
.ev-field textarea{resize:vertical;min-height:80px}
.ev-guide-box{background:var(--a10);border:1px solid var(--a20);border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:11.5px;color:var(--tx2);line-height:1.7}
.ev-guide-box b{color:var(--tx)}
.ev-yt-open-btn{display:inline-block;margin-top:6px;padding:5px 10px;border-radius:8px;background:#fff;border:1px solid var(--a40);color:var(--a);font-size:11px;font-weight:700;text-decoration:none}
.ev-btn-row{display:flex;gap:8px;margin-top:16px}
.ev-btn{flex:1;padding:11px;border-radius:12px;border:none;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap}
.ev-btn.primary{background:var(--a);color:#fff}
.ev-btn.ghost{background:var(--card2);color:var(--tx2);border:1px solid var(--bdr)}
.ev-btn.warn{background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff}
.ev-btn:disabled{opacity:.5;cursor:default}
.ev-play-wrap{position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:12px;overflow:hidden;margin-bottom:14px}
.ev-play-wrap iframe{width:100%;height:100%;border:none}
.ev-detail-topic{font-size:10.5px;font-weight:700;color:var(--a);background:var(--a10);border-radius:7px;padding:2px 8px;display:inline-block;margin-bottom:6px}
.ev-detail-title{font-size:15px;font-weight:800;color:var(--tx);margin-bottom:12px}
.ev-script-box{background:var(--surf2);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--tx2);line-height:1.6;max-height:140px;overflow-y:auto;white-space:pre-wrap;margin-bottom:12px}
.ev-word-list{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
.ev-img-chk-row{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--tx2);margin-bottom:10px;cursor:pointer}
.ev-img-chk-row input{width:15px;height:15px;flex-shrink:0;cursor:pointer}
.ev-word-item{display:flex;align-items:baseline;gap:8px;background:var(--surf2);border-radius:9px;padding:8px 10px}
.ev-word-en{font-weight:800;color:var(--tx);font-size:13px}
.ev-word-pos{font-size:10px;color:var(--tx3)}
.ev-word-kr{font-size:12px;color:var(--tx2);flex:1}
.ev-progress{font-size:12px;color:var(--a);text-align:center;margin-top:8px}
.ev-rec-card{display:flex;gap:10px;background:var(--surf2);border-radius:12px;padding:10px;margin-bottom:8px;cursor:pointer}
.ev-rec-thumb{width:100px;aspect-ratio:16/9;object-fit:cover;border-radius:8px;flex-shrink:0}
.ev-rec-body{min-width:0}
.ev-rec-title{font-size:12.5px;font-weight:700;color:var(--tx);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3}
.ev-rec-channel{font-size:10.5px;color:var(--tx3);margin-top:2px}
.ev-rec-cc{color:#059669;font-weight:700}
.ev-rec-nocc{color:#f59e0b;font-weight:700}
.ev-rec-warn{font-size:10px;color:#f59e0b;margin-top:3px;line-height:1.4}
.ev-rec-reason{font-size:10.5px;color:var(--a);margin-top:4px;line-height:1.4}
.ev-rec-add-btn{margin-top:6px;padding:4px 10px;border-radius:8px;border:none;background:var(--a);color:#fff;font-size:10.5px;font-weight:700;cursor:pointer}`;
    document.head.appendChild(s);
  }

  function _shellHtml() {
    const topics = EduVideoDB.getTopics();
    return `
      <div class="ev-cats-row">
        <div class="ev-cats">
          <button class="ev-cat-tab${_curTopic===null?' on':''}" onclick="EduVideoApp._selectTopic(null)">전체</button>
          ${topics.map(t => `<button class="ev-cat-tab${_curTopic===t?' on':''}" onclick="EduVideoApp._selectTopic('${_esc(t)}')">${_esc(t)}</button>`).join('')}
          <button class="ev-cat-tab add" onclick="EduVideoApp._promptNewTopic()">＋ 주제</button>
        </div>
        <button class="db-mini-btn ev-rec-btn" onclick="EduVideoApp.openRecommend()">🤖 AI 추천</button>
      </div>
      <div class="ev-body" id="ev-body">${_gridHtml()}</div>
      <button class="ev-fab" onclick="EduVideoApp.openAdd()" title="영상 추가">＋</button>`;
  }

  function _gridHtml() {
    const items = _curTopic === null ? EduVideoDB.getAll() : EduVideoDB.getByTopic(_curTopic);
    if (!items.length) {
      return `<div class="ev-empty"><div class="ev-empty-ico">🎬</div>등록된 영상이 없습니다<br>오른쪽 아래 + 버튼으로 유튜브 링크를 추가해보세요</div>`;
    }
    return `<div class="ev-grid">${items.map(v => `
      <div class="ev-card" onclick="EduVideoApp.openDetail('${v.id}')">
        <img class="ev-card-thumb" src="https://img.youtube.com/vi/${v.youtubeId}/hqdefault.jpg" alt="">
        <div class="ev-card-body">
          <div class="ev-card-title">${_esc(v.title)}</div>
          <div class="ev-card-meta">
            <span class="ev-card-topic">${_esc(v.topic)}</span>
            ${v.words?.length ? `<span class="ev-card-words">단어 ${v.words.length}개</span>` : ''}
          </div>
        </div>
      </div>`).join('')}</div>`;
  }

  let _mountId = 'page-eduvideo'; // ★ render()가 마지막으로 그렸던 위치를 기억 — 내부 재렌더링 때 이걸 재사용
  function render(containerId) {
    _mountId = containerId || _mountId;
    _css();
    const pg = _q(_mountId); if (!pg) return;
    pg.innerHTML = _shellHtml();
  }
  function _refreshGrid() { const b = _q('ev-body'); if (b) b.innerHTML = _gridHtml(); }
  function _selectTopic(t) { _curTopic = t; render(_mountId); }
  async function _promptNewTopic() {
    const name = prompt('새 주제 이름을 입력하세요 (예: 동물, 음식)');
    if (!name?.trim()) return;
    await EduVideoDB.addTopic(name.trim());
    render(_mountId);
  }

  /* ═══════════════ AI 추천 (유튜브 실제 검색 + Gemini 큐레이션) ═══════════════ */
  async function _searchYoutubeRaw(query) {
    if (YOUTUBE_API_KEY.includes('YOUR-YOUTUBE')) throw new Error('유튜브 API 키가 설정되지 않았습니다');
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&safeSearch=strict&relevanceLanguage=en&order=relevance&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`유튜브 검색 실패 (HTTP ${res.status}) ${t.slice(0, 100)}`); }
    const data = await res.json();
    return (data.items || []).map(it => ({
      youtubeId: it.id.videoId,
      title: it.snippet.title,
      channelTitle: it.snippet.channelTitle,
      description: it.snippet.description,
      thumbnail: it.snippet.thumbnails?.medium?.url || it.snippet.thumbnails?.default?.url,
    }));
  }
  async function _searchYoutube(query) {
    return await _filterCaptioned(await _searchYoutubeRaw(query));
  }
  // ★ 후보들을 자막 있음/없음으로 나눠서 각각 돌려준다(둘 다 필요할 때 씀)
  async function _splitByCaption(candidates) {
    if (!candidates.length) return { captioned: [], uncaptioned: [] };
    const captionedList = await _filterCaptioned(candidates);
    const captionedIds = new Set(captionedList.map(c => c.youtubeId));
    return { captioned: captionedList, uncaptioned: candidates.filter(c => !captionedIds.has(c.youtubeId)) };
  }
  async function _filterCaptioned(candidates) {
    if (!candidates.length) return candidates;
    const ids = candidates.map(c => c.youtubeId).join(',');
    try {
      const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${YOUTUBE_API_KEY}`;
      const res = await fetch(url);
      if (!res.ok) return candidates; // ★ 확인 자체가 실패하면 필터링 없이 그대로 통과(추천이 아예 끊기지 않도록)
      const data = await res.json();
      const captioned = new Set((data.items || []).filter(it => it.contentDetails?.caption === 'true').map(it => it.id));
      return candidates.filter(c => captioned.has(c.youtubeId));
    } catch (e) {
      return candidates; // 확인 실패 시에도 추천 자체는 계속 진행
    }
  }

  function openRecommend() {
    const topics = EduVideoDB.getTopics();
    const ov = document.createElement('div');
    ov.className = 'ev-ov'; ov.id = 'ev-rec-ov';
    ov.innerHTML = `<div class="ev-sheet">
      <div class="ev-sheet-title">🤖 AI 영상 추천</div>
      <div class="ev-field"><label>주제</label>
        <select id="ev-rec-topic">${topics.map(t => `<option value="${_esc(t)}"${t===_curTopic?' selected':''}>${_esc(t)}</option>`).join('')}</select>
      </div>
      <div id="ev-rec-progress"></div>
      <div id="ev-rec-results"></div>
      <div class="ev-btn-row">
        <button class="ev-btn ghost" onclick="document.getElementById('ev-rec-ov').remove()">닫기</button>
        <button class="ev-btn primary" id="ev-rec-search-btn" onclick="EduVideoApp._runRecommend()">🔍 추천 받기</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
  }
  let _recUncaptionedPool = []; // ★ "더보기"를 누르기 전까지 대기시켜두는 자막 없는 후보들
  let _recTopic = '';

  async function _runRecommend() {
    const topic = _q('ev-rec-topic')?.value;
    _recTopic = topic;
    const btn = _q('ev-rec-search-btn'), prog = _q('ev-rec-progress'), results = _q('ev-rec-results');
    if (results) results.innerHTML = '';
    btn.disabled = true;
    if (typeof GeminiAI === 'undefined') { if (prog) prog.innerHTML = `<div class="ev-progress" style="color:#ef4444">⚠️ AI 기능을 불러오지 못했습니다</div>`; btn.disabled = false; return; }
    try {
      prog.innerHTML = `<div class="ev-progress">🤖 검색어를 만드는 중...</div>`;
      const queries = await GeminiAI.generateSearchQueries(topic);
      prog.innerHTML = `<div class="ev-progress">🔍 유튜브에서 검색 중...</div>`;
      let allCandidates = [];
      for (const q of queries) {
        const found = await _searchYoutubeRaw(q);
        allCandidates = allCandidates.concat(found);
      }
      // ★ 중복 제거
      const seen = new Set();
      allCandidates = allCandidates.filter(c => { if (seen.has(c.youtubeId)) return false; seen.add(c.youtubeId); return true; });
      if (!allCandidates.length) { prog.innerHTML = `<div class="ev-progress" style="color:#ef4444">⚠️ 검색 결과가 없습니다 — 다른 주제로 시도해보세요</div>`; btn.disabled = false; return; }

      prog.innerHTML = `<div class="ev-progress">📝 자막 여부 확인 중...</div>`;
      const { captioned, uncaptioned } = await _splitByCaption(allCandidates);
      _recUncaptionedPool = uncaptioned; // ★ 나중에 "더보기" 누르면 여기서 꺼내 씀

      if (!captioned.length) {
        prog.innerHTML = `<div class="ev-progress" style="color:#f59e0b">⚠️ 자막 있는 영상이 없어서, 자막 없는 영상 위주로 보여드립니다</div>`;
        await _appendMoreResults(true); // ★ 처음부터 자막없음으로 대체
        btn.disabled = false;
        return;
      }
      prog.innerHTML = `<div class="ev-progress">🤖 AI가 ${captioned.length}개 중에서 고르는 중...</div>`;
      const curated = await GeminiAI.curateVideos(topic, captioned);
      if (!curated.length) { prog.innerHTML = `<div class="ev-progress" style="color:#ef4444">⚠️ 적합한 영상을 찾지 못했습니다 — 다른 주제로 시도해보세요</div>`; btn.disabled = false; return; }
      prog.innerHTML = `<div class="ev-progress">✅ ${curated.length}개 추천 (자막 있음 우선)</div>`;
      results.innerHTML = curated.map(v => _recCardHtml(v, true)).join('') + _moreBtnHtml();
    } catch (e) {
      prog.innerHTML = `<div class="ev-progress" style="color:#ef4444">⚠️ ${_esc(e.message || '알 수 없는 오류')}</div>`;
    }
    btn.disabled = false;
  }
  function _recCardHtml(v, hasCaption) {
    return `<div class="ev-rec-card">
      <img class="ev-rec-thumb" src="${v.thumbnail}" alt="">
      <div class="ev-rec-body">
        <div class="ev-rec-title">${_esc(v.title)}</div>
        <div class="ev-rec-channel">${_esc(v.channelTitle)} · <span class="${hasCaption ? 'ev-rec-cc' : 'ev-rec-nocc'}">${hasCaption ? '✅ 자막 있음' : '⚠️ 자막 없음'}</span></div>
        <div class="ev-rec-reason">💡 ${_esc(v.reason || '')}</div>
        ${!hasCaption ? `<div class="ev-rec-warn">자막이 없어서 AI 단어 추출·PDF 워크시트는 자동으로 안 돼요. 영상 재생용으로만 등록됩니다.</div>` : ''}
        <button class="ev-rec-add-btn" data-yid="${_esc(v.youtubeId)}" data-title="${_esc(v.title)}" data-topic="${_esc(_recTopic)}" onclick="EduVideoApp._addFromRecommend(this)">이 영상으로 등록</button>
      </div>
    </div>`;
  }
  function _moreBtnHtml() {
    if (!_recUncaptionedPool.length) return '';
    return `<button class="ev-btn ghost" id="ev-more-btn" style="width:100%;margin-top:6px" onclick="EduVideoApp._loadMoreRecommend()">더보기 (자막 없는 영상도 보기)</button>`;
  }
  async function _loadMoreRecommend() {
    const moreBtn = _q('ev-more-btn');
    if (moreBtn) { moreBtn.disabled = true; moreBtn.textContent = '⏳ 불러오는 중...'; }
    await _appendMoreResults(false);
  }
  // ★ 자막 없는 풀에서 AI 큐레이션해서 결과 목록 뒤에 이어붙인다
  async function _appendMoreResults(replaceAll) {
    const results = _q('ev-rec-results');
    const pool = _recUncaptionedPool;
    _recUncaptionedPool = []; // ★ 한 번 쓰면 비움(같은 걸 두 번 더보기 하지 않게)
    if (!pool.length) { _q('ev-more-btn')?.remove(); return; }
    try {
      const curated = await GeminiAI.curateVideos(_recTopic, pool);
      const html = curated.map(v => _recCardHtml(v, false)).join('');
      if (replaceAll) { results.innerHTML = html; }
      else { _q('ev-more-btn')?.remove(); results.insertAdjacentHTML('beforeend', html); }
    } catch (e) {
      _q('ev-more-btn')?.remove();
      if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ 추가 추천 실패: ' + (e.message || ''));
    }
  }
  function _addFromRecommend(btn) {
    const { yid, title, topic } = btn.dataset;
    _q('ev-rec-ov')?.remove();
    openAdd();
    setTimeout(() => {
      if (_q('ev-title-inp')) _q('ev-title-inp').value = title;
      if (_q('ev-url-inp')) _q('ev-url-inp').value = `https://www.youtube.com/watch?v=${yid}`;
      if (_q('ev-topic-inp')) _q('ev-topic-inp').value = topic;
    }, 0);
  }

  // ★ 자막 파일(.srt/.vtt) 파싱 — 공식적으로 다운로드 제공되는 자막 파일을
  //   올리면 시간코드·번호를 다 걷어내고 순수 텍스트만 뽑아준다.
  //   (유튜브에서 긁어오는 게 아니라, 사용자가 합법적으로 받은 파일을 읽는 것뿐)
  function _parseSubtitleFile(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const out = [];
    const timeLine = /\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}/;
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (line === 'WEBVTT') continue;
      if (/^\d+$/.test(line)) continue; // SRT 순번
      if (timeLine.test(line)) continue; // 시간코드
      if (/^NOTE\b/.test(line)) continue; // VTT 주석
      line = line.replace(/<[^>]+>/g, ''); // <i>, <00:00:01.000> 같은 인라인 태그 제거
      if (line) out.push(line);
    }
    // ★ 자동 생성 자막은 같은 줄이 겹쳐서 반복되는 경우가 많아 중복은 걸러냄
    const dedup = [];
    out.forEach(l => { if (dedup[dedup.length - 1] !== l) dedup.push(l); });
    return dedup.join(' ');
  }
  function _bindSubtitleUpload(inputId, textareaId) {
    const inp = _q(inputId);
    if (!inp) return;
    inp.addEventListener('change', async () => {
      const file = inp.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = _parseSubtitleFile(text);
        if (!parsed) { if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ 자막 내용을 읽지 못했습니다'); return; }
        const ta = _q(textareaId);
        if (ta) ta.value = parsed;
        if (typeof App !== 'undefined' && App._toast) App._toast('✅ 자막 파일에서 대본을 자동으로 채웠습니다');
      } catch (e) {
        if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ 자막 파일을 읽지 못했습니다: ' + (e.message || ''));
      }
    });
  }

  /* ═══════════════ 영상 추가(직접 입력) ═══════════════ */
  function openAdd() {
    const topics = EduVideoDB.getTopics();
    const ov = document.createElement('div');
    ov.className = 'ev-ov'; ov.id = 'ev-add-ov';
    ov.innerHTML = `<div class="ev-sheet">
      <div class="ev-sheet-title">🎬 교육 영상 추가</div>
      <div class="ev-field"><label>제목</label><input type="text" id="ev-title-inp" placeholder="예: My Furniture at Home"></div>
      <div class="ev-field"><label>유튜브 링크</label><input type="text" id="ev-url-inp" placeholder="https://www.youtube.com/watch?v=..."></div>
      <div class="ev-field"><label>주제</label>
        <select id="ev-topic-inp">${topics.map(t => `<option value="${_esc(t)}">${_esc(t)}</option>`).join('')}</select>
      </div>
      <div class="ev-field">
        <label>대본/스크립트 (선택 — 넣으면 AI 단어 추출 및 PDF 워크시트 생성 가능)</label>
        <div class="ev-guide-box">
          <b>📝 대본 가져오는 방법 1 — 직접 복사</b>
          ① 아래 링크 눌러 유튜브 영상 열기 → ② 영상 아래 <b>"···"</b> 클릭 → ③ <b>"스크립트 표시"</b> 클릭 → ④ 텍스트 전체 복사(Ctrl+A → Ctrl+C) → ⑤ 여기 붙여넣기
          <div id="ev-yt-open-wrap"></div>
        </div>
        <div class="ev-guide-box">
          <b>📎 대본 가져오는 방법 2 — 자막 파일 업로드</b>
          공식적으로 자막 파일(.srt, .vtt)을 무료 제공하는 교육 사이트/채널이라면, 그 파일을 그대로 올려주세요 — 시간코드를 자동으로 걷어내고 대본만 채워드립니다.
          <div><input type="file" id="ev-sub-file-inp" accept=".srt,.vtt" style="margin-top:6px;font-size:11px"></div>
        </div>
        <textarea id="ev-script-inp" placeholder="여기에 대본을 붙여넣으세요 (시간 표시가 같이 복사돼도 AI가 알아서 걸러냅니다)"></textarea>
      </div>
      <div id="ev-add-progress"></div>
      <div class="ev-btn-row">
        <button class="ev-btn ghost" onclick="EduVideoApp._closeAdd()">취소</button>
        <button class="ev-btn primary" id="ev-add-submit" onclick="EduVideoApp._submitAdd()">추가</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    _bindSubtitleUpload('ev-sub-file-inp', 'ev-script-inp');
    // ★ 링크 입력이 끝나면(blur 시점) "유튜브에서 열기" 버튼을 바로 보여줌 —
    //   매번 새 탭에서 유튜브 검색해서 다시 찾아가는 수고를 덜어줌
    _q('ev-url-inp')?.addEventListener('blur', () => {
      const url = _q('ev-url-inp')?.value?.trim();
      const wrap = _q('ev-yt-open-wrap');
      if (wrap) wrap.innerHTML = url ? `<a href="${_esc(url)}" target="_blank" rel="noopener" class="ev-yt-open-btn">▶ 이 영상 유튜브에서 열기</a>` : '';
    });
    ov.onclick = e => { if (e.target === ov) _closeAdd(); };
  }
  function _closeAdd() { _q('ev-add-ov')?.remove(); }
  async function _submitAdd() {
    const url = _q('ev-url-inp')?.value?.trim();
    const btn = _q('ev-add-submit');
    const prog = _q('ev-add-progress');
    if (!url) { alert('유튜브 링크를 입력해 주세요'); return; }
    btn.disabled = true; btn.textContent = '추가 중...';
    try {
      const result = await EduVideoDB.addVideo({
        title: _q('ev-title-inp')?.value?.trim(),
        youtubeUrl: url,
        topic: _q('ev-topic-inp')?.value,
        script: _q('ev-script-inp')?.value,
        createdBy: (typeof DB !== 'undefined' && DB.getSession) ? (DB.getSession()?.username || '') : '',
      });
      _closeAdd();
      _refreshGrid();
      if (typeof App !== 'undefined' && App._toast) App._toast(result.savedToServer ? '✅ 추가 완료' : '⏳ 추가됨 · 서버 반영 대기 중');
    } catch (e) {
      btn.disabled = false; btn.textContent = '추가';
      if (prog) prog.innerHTML = `<div class="ev-progress" style="color:#ef4444">⚠️ ${_esc(e.message || '알 수 없는 오류')}</div>`;
    }
  }

  /* ═══════════════ 상세(재생 + 단어 추출) ═══════════════ */
  function openDetail(id) {
    const v = EduVideoDB.getById(id);
    if (!v) return;
    const ov = document.createElement('div');
    ov.className = 'ev-ov'; ov.id = 'ev-detail-ov';
    ov.innerHTML = `<div class="ev-sheet" style="max-width:640px">
      <div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:8px">
        <button class="ev-btn ghost" style="flex:0 0 auto;padding:6px 10px" onclick="EduVideoApp._confirmDeleteVideo('${id}')" title="삭제">🗑️</button>
        <button class="ev-btn ghost" style="flex:0 0 auto;padding:6px 10px" onclick="document.getElementById('ev-detail-ov').remove()">✕</button>
      </div>
      <div class="ev-play-wrap"><iframe src="https://www.youtube.com/embed/${v.youtubeId}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
      <span class="ev-detail-topic">${_esc(v.topic)}</span>
      <div class="ev-detail-title">${_esc(v.title)}</div>
      ${v.script ? `<div class="ev-field"><label>대본</label><div class="ev-script-box">${_esc(v.script)}</div></div>` : `<div class="ev-progress" style="color:var(--tx3)">대본이 없어서 단어 추출·PDF 생성은 이용할 수 없어요. 수정에서 대본을 추가해보세요.</div>`}
      <div id="ev-words-area">${_wordsAreaHtml(v)}</div>
      ${v.words?.length ? `<label class="ev-img-chk-row">
        <input type="checkbox" id="ev-pdf-img-chk" checked> 워크시트에 단어별 관련 이미지 포함하기 (무료 이미지 사이트에서 가져옴)
      </label>` : ''}
      <div class="ev-btn-row">
        <button class="ev-btn ghost" onclick="EduVideoApp.openEditScript('${id}')">✏️ 대본 수정</button>
        <button class="ev-btn warn" id="ev-extract-video-btn" onclick="EduVideoApp._extractWordsFromVideo('${id}')">🎬 영상에서 바로 추출 (대본 필요없음)</button>
        ${v.script ? `<button class="ev-btn warn" id="ev-extract-btn" onclick="EduVideoApp._extractWords('${id}')">🤖 대본에서 단어 추출</button>` : ''}
        ${v.words?.length ? `<button class="ev-btn primary" onclick="EduVideoApp._makePdf('${id}')">📄 PDF 워크시트</button>` : ''}
      </div>
      <div id="ev-detail-progress"></div>
    </div>`;
    document.body.appendChild(ov);
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
  }
  function _wordsAreaHtml(v) {
    if (!v.words?.length) return '';
    return `<div class="ev-word-list">${v.words.map(w => `
      <div class="ev-word-item">
        <span class="ev-word-en">${_esc(w.word)}</span>
        <span class="ev-word-pos">${_esc(w.pos || '')}</span>
        <span class="ev-word-kr">${_esc(w.meaning)}</span>
      </div>`).join('')}</div>`;
  }

  async function _extractWords(id) {
    const v = EduVideoDB.getById(id);
    if (!v?.script) return;
    if (typeof GeminiAI === 'undefined' || !GeminiAI.extractVocabulary) {
      if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ AI 기능을 불러오지 못했습니다'); return;
    }
    const btn = _q('ev-extract-btn'), prog = _q('ev-detail-progress');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 추출 중...'; }
    if (prog) prog.innerHTML = `<div class="ev-progress">🤖 AI가 대본에서 단어를 뽑고 있어요...</div>`;
    try {
      const words = await GeminiAI.extractVocabulary(v.script, v.topic);
      await _onWordsExtracted(id, words, prog);
      if (btn) btn.remove();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '🤖 대본에서 단어 추출'; }
      if (prog) prog.innerHTML = `<div class="ev-progress" style="color:#ef4444">⚠️ 추출 실패: ${_esc(e.message || '알 수 없는 오류')}</div>`;
    }
  }

  // ★ 대본 없이, 유튜브 링크만으로 Gemini가 영상(음성+화면)을 직접 분석해서
  //   단어를 뽑는다 — 구글 공식 지원 기능(현재 프리뷰, 무료)을 사용.
  //   영상 전체를 처리하다 보니 대본 방식보다 시간이 좀 더 걸릴 수 있다.
  async function _extractWordsFromVideo(id) {
    const v = EduVideoDB.getById(id);
    if (!v) return;
    if (typeof GeminiAI === 'undefined' || !GeminiAI.extractVocabularyFromYoutubeVideo) {
      if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ AI 기능을 불러오지 못했습니다'); return;
    }
    const btn = _q('ev-extract-video-btn'), prog = _q('ev-detail-progress');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 영상 분석 중... (시간이 조금 걸려요)'; }
    if (prog) prog.innerHTML = `<div class="ev-progress">🎬 AI가 영상을 직접 보고 듣는 중이에요...</div>`;
    try {
      const words = await GeminiAI.extractVocabularyFromYoutubeVideo(v.youtubeUrl, v.topic);
      await _onWordsExtracted(id, words, prog);
      if (btn) btn.remove();
      _q('ev-extract-btn')?.remove(); // ★ 이미 단어를 얻었으니 대본 기반 버튼도 정리
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '🎬 영상에서 바로 추출 (대본 필요없음)'; }
      if (prog) prog.innerHTML = `<div class="ev-progress" style="color:#ef4444">⚠️ 추출 실패: ${_esc(e.message || '알 수 없는 오류')}</div>`;
    }
  }
  // ★ 두 추출 방식(대본/영상) 공통 — 결과를 저장하고 화면(단어 목록 · PDF 버튼)을 갱신
  async function _onWordsExtracted(id, words, prog) {
    const result = await EduVideoDB.updateVideo(id, { words });
    const area = _q('ev-words-area');
    if (area) area.innerHTML = _wordsAreaHtml(result);
    if (prog) prog.innerHTML = `<div class="ev-progress">✅ ${words.length}개 단어 추출 완료</div>`;
    // ★ PDF 버튼이 없었다면 새로 보여준다(단어가 이번에 처음 생겼을 수 있으므로)
    if (!document.querySelector('.ev-btn-row .ev-btn.primary')) {
      const row = document.querySelector('.ev-btn-row');
      if (row) {
        if (!_q('ev-pdf-img-chk')) {
          row.insertAdjacentHTML('beforebegin', `<label class="ev-img-chk-row">
            <input type="checkbox" id="ev-pdf-img-chk" checked> 워크시트에 단어별 관련 이미지 포함하기 (무료 이미지 사이트에서 가져옴)
          </label>`);
        }
        row.insertAdjacentHTML('beforeend', `<button class="ev-btn primary" onclick="EduVideoApp._makePdf('${id}')">📄 PDF 워크시트</button>`);
      }
    }
  }

  /* ═══════════════ 대본 수정 ═══════════════ */
  function openEditScript(id) {
    const v = EduVideoDB.getById(id);
    if (!v) return;
    _q('ev-detail-ov')?.remove();
    const ov = document.createElement('div');
    ov.className = 'ev-ov'; ov.id = 'ev-edit-ov';
    ov.innerHTML = `<div class="ev-sheet">
      <div class="ev-sheet-title">✏️ 정보 수정</div>
      <div class="ev-field"><label>제목</label><input type="text" id="ev-edit-title" value="${_esc(v.title)}"></div>
      <div class="ev-field"><label>주제</label>
        <select id="ev-edit-topic">${EduVideoDB.getTopics().map(t => `<option value="${_esc(t)}"${t===v.topic?' selected':''}>${_esc(t)}</option>`).join('')}</select>
      </div>
      <div class="ev-field">
        <label>대본</label>
        <div class="ev-guide-box">
          <b>📝 방법 1 — 직접 복사</b>
          ① <a href="${_esc(v.youtubeUrl)}" target="_blank" rel="noopener" class="ev-yt-open-btn">▶ 이 영상 유튜브에서 열기</a> → ② 영상 아래 <b>"···"</b> 클릭 → ③ <b>"스크립트 표시"</b> 클릭 → ④ 텍스트 전체 복사 → ⑤ 아래에 붙여넣기
        </div>
        <div class="ev-guide-box">
          <b>📎 방법 2 — 자막 파일 업로드</b>
          .srt 또는 .vtt 자막 파일이 있으면 올려주세요 — 자동으로 대본을 채워드립니다.
          <div><input type="file" id="ev-sub-file-inp-edit" accept=".srt,.vtt" style="margin-top:6px;font-size:11px"></div>
        </div>
        <textarea id="ev-edit-script" style="min-height:160px">${_esc(v.script || '')}</textarea>
      </div>
      <div class="ev-btn-row">
        <button class="ev-btn ghost" onclick="document.getElementById('ev-edit-ov').remove()">취소</button>
        <button class="ev-btn primary" onclick="EduVideoApp._submitEditScript('${id}')">저장</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    _bindSubtitleUpload('ev-sub-file-inp-edit', 'ev-edit-script');
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
  }
  async function _submitEditScript(id) {
    const newScript = _q('ev-edit-script')?.value?.trim();
    const oldV = EduVideoDB.getById(id);
    const scriptChanged = oldV && newScript !== oldV.script;
    await EduVideoDB.updateVideo(id, {
      title: _q('ev-edit-title')?.value?.trim(),
      topic: _q('ev-edit-topic')?.value,
      script: newScript,
      // ★ 대본이 바뀌면 예전 단어 목록은 더 이상 안 맞을 수 있으니 초기화
      ...(scriptChanged ? { words: [] } : {}),
    });
    _q('ev-edit-ov')?.remove();
    _refreshGrid();
    if (typeof App !== 'undefined' && App._toast) App._toast('✅ 저장 완료' + (scriptChanged ? ' · 단어를 다시 추출해주세요' : ''));
  }

  /* ═══════════════ 삭제 ═══════════════ */
  function _confirmDeleteVideo(id) {
    const v = EduVideoDB.getById(id);
    if (!v) return;
    if (!confirm(`"${v.title}"을(를) 삭제할까요?`)) return;
    EduVideoDB.deleteVideo(id).then(() => {
      _q('ev-detail-ov')?.remove();
      _refreshGrid();
    });
  }

  /* ═══════════════ PDF 워크시트 생성 (단어 + 이미지 + 뜻 + 예문 + 문제) ═══════════════ */
  async function _fetchUnsplashImage(query) {
    if (UNSPLASH_ACCESS_KEY.includes('YOUR-UNSPLASH')) return null;
    try {
      // ★ /photos/random은 "검색어와 대충 관련된 것 중 무작위"라 정확도가 낮았음.
      //   /search/photos + 관련도순 정렬로 바꿔서 가장 매칭되는 사진을 우선 사용.
      const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=3&orientation=squarish&order_by=relevant&content_filter=high&client_id=${UNSPLASH_ACCESS_KEY}`);
      if (!res.ok) return null;
      const data = await res.json();
      const imgUrl = data?.results?.[0]?.urls?.small;
      if (!imgUrl) return null;
      const imgRes = await fetch(imgUrl);
      const blob = await imgRes.blob();
      return await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) { return null; }
  }

  // ★ jsPDF 기본 폰트는 한글을 지원하지 않아 깨진 글자로 나온다(알려진 제약).
  //   나눔고딕 폰트를 한 번만 받아서(세션 중 캐시) PDF에 심어 넣는다.
  // ★ 나눔고딕 폰트를 사이트 자체 파일(nanum-gothic-base64.js)에서 직접 가져온다.
  //   외부 CDN(GitHub, jsDelivr)이 일부 네트워크 환경에서 차단되는 것을
  //   확인해서, 아예 외부 요청이 필요 없도록 폰트를 사이트에 내장했다.
  async function _ensureKoreanFont(pdf) {
    if (typeof NANUM_GOTHIC_BASE64 === 'undefined') {
      throw new Error('폰트 파일(nanum-gothic-base64.js)이 로드되지 않았습니다');
    }
    pdf.addFileToVFS('NanumGothic.ttf', NANUM_GOTHIC_BASE64);
    pdf.addFont('NanumGothic.ttf', 'NanumGothic', 'normal');
    pdf.setFont('NanumGothic'); // ★ 이후 모든 텍스트(영어 단어 포함)에 이 폰트 적용 — 나눔고딕은 영문도 지원해서 따로 안 바꿔도 됨
  }

  async function _makePdf(id) {
    const v = EduVideoDB.getById(id);
    if (!v?.words?.length) return;
    if (typeof window.jspdf === 'undefined') {
      if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ PDF 라이브러리를 불러오지 못했습니다'); return;
    }
    const prog = _q('ev-detail-progress');
    const wantsImages = _q('ev-pdf-img-chk')?.checked !== false; // 체크박스가 없으면(과거 문서 등) 기본은 포함
    const hasUnsplash = wantsImages && !UNSPLASH_ACCESS_KEY.includes('YOUR-UNSPLASH');
    if (prog) prog.innerHTML = `<div class="ev-progress">📄 한글 폰트 준비 중...</div>`;

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    let koreanOk = true;
    try {
      await _ensureKoreanFont(pdf);
    } catch (e) {
      koreanOk = false;
      console.error('[EduVideoApp] 한글 폰트 로드 실패 — 기본 폰트로 계속 진행', e);
      if (typeof App !== 'undefined' && App._toast) App._toast('⚠️ 한글 폰트를 못 불러와서 영문 폰트로 만듭니다(한글이 깨질 수 있어요)', '', 5000);
    }
    if (prog) prog.innerHTML = `<div class="ev-progress">📄 워크시트 준비 중... (0/${v.words.length})</div>`;

    const pageW = 595, margin = 40;
    let y = margin;

    pdf.setFontSize(18);
    pdf.text(v.title, margin, y); y += 22;
    pdf.setFontSize(10);
    pdf.setTextColor(120);
    pdf.text(`주제: ${v.topic}  ·  ${new Date().toLocaleDateString('ko-KR')}`, margin, y);
    pdf.setTextColor(0);
    y += 26;

    const cardW = (pageW - margin * 2 - 16) / 2, cardH = 118, imgSize = 56;
    let col = 0;
    for (let i = 0; i < v.words.length; i++) {
      const w = v.words[i];
      if (prog) prog.innerHTML = `<div class="ev-progress">📄 워크시트 준비 중... (${i + 1}/${v.words.length})</div>`;
      if (y + cardH > 800) { pdf.addPage(); y = margin; col = 0; }
      const x = margin + col * (cardW + 16);

      pdf.setDrawColor(220); pdf.roundedRect(x, y, cardW, cardH, 6, 6);
      const img = hasUnsplash ? await _fetchUnsplashImage(w.word) : null;
      if (img) { try { pdf.addImage(img, 'JPEG', x + 8, y + 8, imgSize, imgSize); } catch (e) {} }
      const textX = x + (img ? imgSize + 16 : 12);
      // ★ 굵게(bold) 스타일은 따로 안 심어서 못 씀 — 크기 차이로 시각적 강조를 대신함
      pdf.setFontSize(14);
      pdf.text(w.word, textX, y + 22);
      pdf.setFontSize(9); pdf.setTextColor(140);
      pdf.text(w.pos || '', textX, y + 34);
      pdf.setTextColor(0);
      pdf.setFontSize(11);
      pdf.text(w.meaning, textX, y + 50);
      pdf.setFontSize(8.5); pdf.setTextColor(90);
      const exLines = pdf.splitTextToSize(w.example || '', cardW - (img ? imgSize + 24 : 24));
      pdf.text(exLines.slice(0, 3), textX, y + 66);
      pdf.setTextColor(0);

      col++;
      if (col >= 2) { col = 0; y += cardH + 12; }
    }
    if (col === 1) y += cardH + 12;

    // ★ 빈칸 채우기 문제 페이지 — 예문에서 단어를 지우고 채워보게
    pdf.addPage(); y = margin;
    pdf.setFontSize(15); pdf.text('📝 빈칸 채우기 (Fill in the blank)', margin, y); y += 24;
    pdf.setFontSize(11);
    v.words.forEach((w, i) => {
      if (!w.example) return;
      if (y > 780) { pdf.addPage(); y = margin; }
      const blanked = w.example.replace(new RegExp(w.word, 'gi'), '_______');
      const lines = pdf.splitTextToSize(`${i + 1}. ${blanked}`, pageW - margin * 2);
      pdf.text(lines, margin, y);
      y += lines.length * 16 + 10;
    });

    // ★ 단어-뜻 매칭 문제 페이지
    pdf.addPage(); y = margin;
    pdf.setFontSize(15); pdf.text('🔗 단어-뜻 연결하기 (Matching)', margin, y); y += 24;
    pdf.setFontSize(11);
    const shuffledMeanings = [...v.words].sort(() => Math.random() - 0.5);
    v.words.forEach((w, i) => {
      pdf.text(`${i + 1}. ${w.word}`, margin, y + i * 22);
      pdf.text(`${String.fromCharCode(97 + i)}. ${shuffledMeanings[i].meaning}`, margin + 260, y + i * 22);
    });

    pdf.save(`${v.title.replace(/[^\w가-힣 ]/g, '')}_워크시트.pdf`);
    const noImgReason = !wantsImages ? ' (이미지 미포함 선택)' : !hasUnsplash ? ' (이미지 API 미설정 — 이미지 없이 생성됨)' : '';
    if (prog) prog.innerHTML = `<div class="ev-progress">✅ PDF가 다운로드되었습니다${noImgReason}</div>`;
  }

  return {
    init: async () => { if (typeof EduVideoDB !== 'undefined') await EduVideoDB.init(); },
    render, _selectTopic, _promptNewTopic,
    openRecommend, _runRecommend, _addFromRecommend, _loadMoreRecommend,
    openAdd, _closeAdd, _submitAdd,
    openDetail, _extractWords, _extractWordsFromVideo, openEditScript, _submitEditScript, _confirmDeleteVideo,
    _makePdf,
  };
})();
