/**
 * dashboard-app.js — v3
 * ─────────────────────────────────────────────────────────────
 * 첫 화면(홈) 대시보드
 *
 * 구성 (헤더의 ≡ 버튼으로 섹션 순서를 자유롭게 변경 가능, 기기별 저장):
 *  1. 일정표 — 방학/공휴일/일반 일정 + 직원 급여일 + 공지 알림 + 오늘의 수업(우측 패널)을
 *     한 캘린더 위젯에서 한눈에 확인 (ScheduleApp에 렌더링 위임)
 *  2. 교재 학습 현황 — 반/교재별 미수행 학생과 미수행 챕터 개수 요약,
 *     탭하면 해당 반·교재의 학습 현황(매트릭스) 화면으로 바로 이동
 *
 * ★ v3: "오늘의 수업"/"이번 달 급여 현황"/"공지 알림" 독립 섹션을 제거하고,
 *        전부 일정표(ScheduleApp) 캘린더 하나로 통합함 — 오늘의 수업은 캘린더
 *        우측 패널로, 급여일·공지 알림은 날짜별 표시 + 상세 시트로 흡수됨.
 * ★ v2: 하단 탭으로 각 화면 이동이 이미 가능하므로 "빠른 이동" 섹션은 제거하고,
 *        대신 남은 섹션들의 표시 순서를 사용자가 직접 정할 수 있게 함.
 *
 * 독립 모듈: 다른 모듈(DB/BookLibDB/StudentDB/ScheduleApp)이 이미
 *            로드해둔 데이터를 "조회"만 하고 직접 쓰지 않으므로, 오류가 나도 기존 기능에 영향 없음.
 */
const DashboardApp = (() => {
  // ★ 대시보드 섹션 구성 — 순서는 사용자가 자유롭게 변경 가능 (기기별 localStorage 저장)
  const SECTION_DEFS = [
    { key: 'schedule',  ico: '🗓️', lbl: '일정표' },
    { key: 'books',     ico: '📊', lbl: '교재 학습 현황' },
    { key: 'favorites', ico: '⭐', lbl: '즐겨찾기 콘텐츠' },
  ];
  const LS_ORDER = 'hk10b_dashboardOrder';
  function _getSectionOrder() {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_ORDER));
      if (Array.isArray(saved) && saved.length === SECTION_DEFS.length && saved.every(k => SECTION_DEFS.find(d => d.key === k))) return saved;
    } catch (e) {}
    return SECTION_DEFS.map(d => d.key);
  }
  function _saveSectionOrder(order) { try { localStorage.setItem(LS_ORDER, JSON.stringify(order)); } catch (e) {} }
  // ★ 함수 선언은 호이스팅되므로 아래에서 정의될 함수들을 미리 참조해도 안전함
  const _SECTION_HTML = {
    schedule:  () => _scheduleSectionHtml(),
    books:     () => _bookStatusSectionHtml(),
    favorites: () => _favoritesSectionHtml(),
  };
  const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

  /* ═══════════════════════════════════════════════════════════
   * 오늘의 명언 — 학생들에게 힘이 되는 짧은 격언을 매일 하나씩 보여준다.
   * 외부 API 없이 자체 목록에서 날짜 기준으로 고정 선택(같은 날엔 항상
   * 같은 문구, 자정 지나면 다음 문구)하므로 네트워크 의존이 없다.
   * ═══════════════════════════════════════════════════════════ */
  const QUOTES = [
    { q: '시작이 반이다.', a: '아리스토텔레스', en: 'Well begun is half done.' },
    { q: '오늘 할 수 있는 일에 최선을 다하라. 그러면 내일은 더 나아져 있을 것이다.', a: '헬렌 켈러', en: 'Do the best you can today, and tomorrow will be better.' },
    { q: '실패는 성공의 어머니다.', a: '토마스 에디슨', en: 'Failure is the mother of success.' },
    { q: '나는 실패한 적이 없다. 단지 작동하지 않는 방법을 만 가지 발견했을 뿐이다.', a: '토마스 에디슨', en: "I have not failed. I've just found 10,000 ways that won't work." },
    { q: '어제로부터 배우고, 오늘을 살고, 내일을 희망하라.', a: '아인슈타인', en: 'Learn from yesterday, live for today, hope for tomorrow.' },
    { q: '가장 큰 위험은 위험 없는 삶이다.', a: '헬렌 켈러', en: 'Life is either a daring adventure or nothing at all.' },
    { q: '할 수 있다고 믿든 할 수 없다고 믿든, 믿는 대로 될 것이다.', a: '헨리 포드', en: "Whether you think you can, or you think you can't – you're right." },
    { q: '천 리 길도 한 걸음부터.', a: '노자', en: 'A journey of a thousand miles begins with a single step.' },
    { q: '배우고 때때로 익히면 또한 기쁘지 아니한가.', a: '공자', en: 'Is it not a joy to learn and practice what one has learned?' },
    { q: '중요한 것은 멈추지 않는 것이다.', a: '아인슈타인', en: 'The important thing is not to stop questioning.' },
    { q: '오늘 걷지 않으면 내일은 뛰어야 한다.', a: '작자 미상', en: 'If you don\u2019t walk today, you\u2019ll have to run tomorrow.' },
    { q: '작은 발걸음이라도 앞으로 나아가는 것이 중요하다.', a: '마틴 루터 킹', en: 'If you can\u2019t fly, run. If you can\u2019t run, walk. But whatever you do, keep moving forward.' },
    { q: '피할 수 없다면 즐겨라.', a: '로버트 엘리엇', en: "If you can't fight it, join it and enjoy it." },
    { q: '노력하는 사람은 즐기는 사람을 이길 수 없다.', a: '공자', en: 'Those who enjoy it will always surpass those who merely work hard.' },
    { q: '어려움 속에 기회가 있다.', a: '아인슈타인', en: 'In the middle of difficulty lies opportunity.' },
    { q: '자신을 믿어라. 그러면 무엇을 해야 할지 알게 될 것이다.', a: '괴테', en: 'Trust yourself and you will know how to live.' },
    { q: '오늘 하루도 최선을 다한 나에게 박수를.', a: '작자 미상', en: 'A round of applause for myself for doing my best today.' },
    { q: '느리더라도 멈추지만 않는다면 괜찮다.', a: '공자', en: 'It does not matter how slowly you go, as long as you do not stop.' },
    { q: '꿈을 이루는 방법은 그것을 향해 걷는 것뿐이다.', a: '월트 디즈니', en: 'The way to get started is to quit talking and begin doing.' },
    { q: '진짜 실패는 시도하지 않는 것이다.', a: '조지 버나드 쇼', en: 'A life spent making mistakes is more useful than a life spent doing nothing.' },
    { q: '포기하지 않는 한 진 것이 아니다.', a: '작자 미상', en: "It's not over until you give up." },
    { q: '지금 이 순간을 최선을 다해 살아라.', a: '틱낫한', en: 'The present moment is the only moment available to us.' },
    { q: '남과 비교하지 말고 어제의 나와 비교하라.', a: '작자 미상', en: 'Don\u2019t compare yourself to others, compare yourself to who you were yesterday.' },
    { q: '작은 습관이 큰 결과를 만든다.', a: '제임스 클리어', en: 'Small habits make a big difference.' },
    { q: '너 자신이 되어라, 다른 사람은 이미 있다.', a: '오스카 와일드', en: 'Be yourself; everyone else is already taken.' },
    { q: '높이 나는 새가 멀리 본다.', a: '리처드 바크', en: 'The bird that flies highest sees the farthest.' },
    { q: '준비된 자에게 기회가 온다.', a: '루이 파스퇴르', en: 'Chance favors the prepared mind.' },
  ];
  const QUOTE_API = 'https://korean-advice-open-api.vercel.app/api/advice';
  const QUOTE_CACHE_KEY = 'db_live_quote';
  const QUOTE_REFRESH_MS = 4 * 60 * 60 * 1000; // ★ 4시간마다 자동으로 새 명언(그 사이엔 캐시 재사용)

  // ★ 오프라인이거나 API 응답이 없을 때만 쓰는 최소한의 대비용 목록 —
  //   온라인일 땐 실시간으로 계속 새 명언을 가져오므로 이 목록 크기와
  //   무관하게 사실상 무한히 다양한 명언이 표시된다.
  function _localFallbackQuote() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - start) / 86400000);
    const item = QUOTES[dayOfYear % QUOTES.length];
    return { q: item.q, a: item.a, en: item.en };
  }
  function _getCachedLiveQuote() {
    try {
      const c = JSON.parse(sessionStorage.getItem(QUOTE_CACHE_KEY) || 'null');
      if (c && c.ts && Date.now() - c.ts < QUOTE_REFRESH_MS) return c;
    } catch (e) {}
    return null;
  }
  function _saveLiveQuoteCache(item) {
    try { sessionStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(item)); } catch (e) {}
  }
  async function _fetchLiveQuote() {
    try {
      const res = await fetch(QUOTE_API, { cache: 'no-store' });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      if (!data?.message) throw new Error('bad payload');
      const item = { q: data.message, a: data.author || '작자 미상', ts: Date.now() };
      _saveLiveQuoteCache(item);
      return item;
    } catch (e) { return null; } // ★ 오프라인 등으로 실패해도 조용히 넘어가고 로컬 대비 목록을 그대로 보여줌
  }
  // ★ 영어가 아직 없으면(주로 실시간 명언) GeminiAI로 번역해서 채운다 —
  //   로컬 27개는 이미 영어 원문이 있어 AI 호출 자체가 안 일어난다.
  //   번역 성공 시 캐시에도 같이 저장해서 같은 명언을 다시 번역하지 않는다.
  async function _ensureEnglish(item) {
    if (!item || item.en) return item;
    if (typeof GeminiAI === 'undefined' || !GeminiAI.translateToEnglish) return item;
    try {
      const en = await GeminiAI.translateToEnglish(item.q);
      if (en) { item.en = en; if (item.ts) _saveLiveQuoteCache(item); }
    } catch (e) { /* 번역 실패해도 한글은 이미 떠 있으니 조용히 넘어감 */ }
    return item;
  }
  function _renderQuoteInto(item) {
    const el = _q('db-quote-banner');
    if (!el || !item) return;
    const t = el.querySelector('.db-quote-text'), au = el.querySelector('.db-quote-author'), en = el.querySelector('.db-quote-en');
    if (t) t.textContent = item.q;
    if (au) au.textContent = '— ' + item.a;
    if (en) { en.textContent = item.en || ''; en.style.display = item.en ? '' : 'none'; }
    el.dataset.quoteAuthor = item.a; el.dataset.quoteText = item.q;
  }
  function _quoteBannerHtml() {
    const initial = _getCachedLiveQuote() || _localFallbackQuote();
    return `<div class="db-quote-inline" id="db-quote-banner"
        data-quote-author="${_esc(initial.a)}" data-quote-text="${_esc(initial.q)}">
      <div class="db-quote-kr"><span class="db-quote-text">${_esc(initial.q)}</span><span class="db-quote-author"> — ${_esc(initial.a)}</span></div>
      <div class="db-quote-en" style="${initial.en ? '' : 'display:none'}">${_esc(initial.en || '')}</div>
    </div>`;
  }
  // ★ 화면엔 일단(캐시 또는 오프라인 대비 문구로) 즉시 표시하고, 실시간
  //   명언을 백그라운드에서 가져와 준비되면 그 자리에서 자연스럽게
  //   교체한다 — 렌더링이 네트워크 응답을 기다리며 멈추지 않는다.
  async function _initQuote() {
    let item = _getCachedLiveQuote();
    if (!item) {
      item = await _fetchLiveQuote();
      if (item) _renderQuoteInto(item);
    }
    // ★ 영어가 아직 없으면(주로 실시간 명언) 번역 시도 — 다 되면 그 자리에서 채워짐
    const withEn = await _ensureEnglish(item || _localFallbackQuote());
    _renderQuoteInto(withEn);
  }
  function _refreshQuote() {
    const el = _q('db-quote-banner');
    el?.classList.add('loading');
    _fetchLiveQuote().then(async live => {
      const item = live || _localFallbackQuote();
      el?.classList.remove('loading');
      _renderQuoteInto(item);
      _renderQuoteInto(await _ensureEnglish(item));
    });
  }

  function _esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function _q(id) { return document.getElementById(id); }
  function _isActive() { return !!_q('page-dashboard')?.classList.contains('on'); }

  /* ═══════════════════════════════════════════════════════════
   * 스타일 주입
   * ═══════════════════════════════════════════════════════════ */
  let _cssInjected = false;
  function _css() {
    if (_cssInjected) return; _cssInjected = true;
    const s = document.createElement('style');
    s.textContent = `
.db-ar-thumbs{display:flex;gap:10px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.db-ar-thumbs::-webkit-scrollbar{display:none}
.db-ar-thumb{flex-shrink:0;width:84px;cursor:pointer}
.db-ar-thumb img{width:84px;height:84px;object-fit:cover;border-radius:12px;border:1px solid var(--bdr);display:block}
.db-ar-thumb-ico{width:84px;height:84px;border-radius:12px;border:1px solid var(--bdr);background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:32px}
.db-ar-thumb-name{font-size:11.5px;font-weight:600;color:var(--tx2);margin-top:5px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.db-fav-thumb{position:relative}
.db-fav-thumb.db-fav-hide{display:none}
.db-fav-badge{position:absolute;top:-5px;left:-5px;width:23px;height:23px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11.5px;box-shadow:0 2px 6px rgba(0,0,0,.28);border:2px solid var(--surf);z-index:1}
.db-fav-badge.type-archive{background:#3b82f6}
.db-fav-badge.type-video{background:#ef4444}
.db-fav-filter{display:flex;gap:6px;margin-bottom:10px}
.db-fav-filter-btn{padding:6px 12px;border-radius:9px;background:var(--card2);color:var(--tx2);border:1px solid var(--bdr2);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;transition:.15s}
.db-fav-filter-btn.on{background:var(--a);color:#fff;border-color:var(--a)}
.db-quote-inline{flex:1 1 auto;min-width:80px;margin:0 10px;text-align:right}
.db-quote-inline.loading{opacity:.4}
.db-quote-kr{white-space:normal;line-height:1.4}
.db-quote-kr::before{content:'"';font-family:Georgia,serif;color:var(--tx3);opacity:.6;margin-right:2px}
.db-quote-inline .db-quote-text{font-size:11.5px;font-style:italic;font-weight:500;color:var(--tx3)}
.db-quote-inline .db-quote-author{font-size:10.5px;font-style:italic;color:var(--tx3);opacity:.75}
.db-quote-en{white-space:normal;line-height:1.4;
  font-family:var(--font);font-size:11px;font-style:italic;font-weight:500;letter-spacing:.1px;color:var(--a);opacity:.75;margin-top:2px;padding-left:2px}
.db-body{flex:1;overflow-y:auto;padding:12px 14px 90px;display:flex;flex-direction:column;gap:14px}
.db-sec{background:var(--surf);border:1px solid var(--bdr);border-radius:16px;padding:14px}
.db-sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px}
.db-sec-title{font-size:15px;font-weight:800;color:var(--tx)}
.db-sec-acts{display:flex;gap:6px}
.db-mini-btn{padding:7px 13px;border-radius:10px;background:var(--a);color:#fff;border:none;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap}
.db-mini-btn.ghost{background:var(--card2);color:var(--tx2);border:1px solid var(--bdr2)}
.db-empty-mini{text-align:center;color:var(--tx3);font-size:12px;padding:16px 8px}

/* ══════════════════════════════════════════════════════════════
 * 대시보드 스타일 3종 — 관리 > 테마에서 admin이 선택 (색상 팔레트와 별개)
 * 참고: 미니멀=Notion/Linear의 여백 중심, 컴팩트=Linear/Vercel의 절제된
 *      데이터 밀집형, 히어로=Stripe/Attio의 단일 포커스형 히어로 배너
 * ══════════════════════════════════════════════════════════════ */
/* --- 컴팩트: 여백을 줄이고 테두리를 얇게, 장식 요소(명언 배너)는 숨겨 정보 밀도를 높임 --- */
.db-style-compact .db-body{gap:8px;padding:10px 12px 90px}
.db-style-compact .db-sec{border-radius:10px;padding:10px;box-shadow:none;border-color:var(--bdr2)}
.db-style-compact .db-sec-hdr{margin-bottom:7px}
.db-style-compact .db-sec-title{font-size:13px}
.db-style-compact .db-mini-btn{padding:5px 10px;border-radius:7px;font-size:11.5px}
.db-style-compact .ph{padding-bottom:10px}
.db-style-compact .ph-title{font-size:15px}
.db-style-compact .db-quote-inline{display:none}

/* --- 히어로: 상단을 그라디언트 배너로 강조하고, 섹션 제목엔 포인트 색 왼쪽 바를 둠 --- */
.db-style-hero .ph{background:linear-gradient(135deg,var(--a),#7c3aed);border-radius:0 0 26px 26px;padding:18px 16px 24px;margin-bottom:2px;box-shadow:0 8px 20px -8px var(--a40)}
.db-style-hero .ph-title{color:#fff;font-size:19px;font-weight:900}
.db-style-hero .ph-sub{color:rgba(255,255,255,.85)}
.db-style-hero .logo-badge{background:rgba(255,255,255,.18)}
.db-style-hero .db-reorder-btn,.db-style-hero #db-logout-btn{background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.32);color:#fff}
.db-style-hero .db-quote-inline .db-quote-text,.db-style-hero .db-quote-inline .db-quote-author{color:rgba(255,255,255,.92)}
.db-style-hero .db-quote-kr::before{color:rgba(255,255,255,.6)}
.db-style-hero .db-quote-en{color:rgba(255,255,255,.8)}
.db-style-hero .admin-badge{background:rgba(255,255,255,.25);color:#fff}
.db-style-hero .db-body{padding-top:16px}
.db-style-hero .db-sec{border-radius:20px}
.db-style-hero .db-sec-title{padding-left:10px;border-left:4px solid var(--a);font-size:16px}

/* --- 컴팩트: 즐겨찾기 썸네일·교재 카드도 더 작고 촘촘하게 --- */
.db-style-compact .db-ar-thumb,.db-style-compact .db-ar-thumb img,.db-style-compact .db-ar-thumb-ico{width:60px;height:60px}
.db-style-compact .db-ar-thumbs{gap:7px}
.db-style-compact .db-cls-group{padding:8px;border-radius:8px}
.db-style-compact .db-book-card{padding:6px 8px;border-radius:7px}
.db-style-compact .db-day-tab{padding:5px 10px;font-size:10.5px}

/* --- 히어로: 즐겨찾기 썸네일·교재 카드를 더 크고 존재감 있게 --- */
.db-style-hero .db-ar-thumb,.db-style-hero .db-ar-thumb img,.db-style-hero .db-ar-thumb-ico{width:108px;height:108px}
.db-style-hero .db-ar-thumb img,.db-style-hero .db-ar-thumb-ico{border-radius:16px}
.db-style-hero .db-ar-thumbs{gap:12px}
.db-style-hero .db-cls-group{border-radius:16px;padding:13px}
.db-style-hero .db-book-card{border-radius:12px}
.db-style-hero .db-day-tab.on{box-shadow:0 4px 10px -3px var(--a40)}

/* ★ 작은 폰 화면(≤400px) 전용 — 선택한 스타일과 무관하게 항상 적용.
   장식 요소(명언 배너)는 감추고 여백을 조여 한 화면에 더 많은 정보가 들어오게 한다.
   401px 이상(큰 폰·태블릿·PC)은 전혀 영향받지 않는다. */
@media (max-width:400px){
  .db-quote-inline{display:none}
  .db-body{padding:9px 10px 88px;gap:9px}
  .db-sec{padding:10px}
  .db-sec-title{font-size:13.5px}
  .db-mini-btn{padding:5px 10px;font-size:11px}
  .ph-title{max-width:170px}
}

/* 순서 변경 버튼/편집 시트 */
.db-reorder-btn{width:34px;height:34px;border-radius:9px;background:var(--a10);border:1px solid var(--a40);display:flex;align-items:center;justify-content:center;font-size:15px;cursor:pointer;color:var(--a);flex-shrink:0}
.db-reorder-row{display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--card2);border:1px solid var(--bdr);border-radius:10px;margin-bottom:6px}
.db-reorder-ico{font-size:17px;flex-shrink:0}
.db-reorder-lbl{flex:1;font-size:13px;font-weight:700;color:var(--tx)}
.db-reorder-btns{display:flex;gap:4px}
.db-reorder-arrow{width:28px;height:28px;border-radius:7px;border:1px solid var(--bdr2);background:var(--surf2);color:var(--tx2);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center}
.db-reorder-arrow:disabled{opacity:.35;pointer-events:none}

/* 교재 학습 현황 */
.db-day-tabs{display:flex;gap:6px;overflow-x:auto;margin-bottom:11px;scrollbar-width:none}
.db-day-tabs::-webkit-scrollbar{display:none}
.db-day-tab{flex-shrink:0;padding:6px 12px;border-radius:999px;border:1px solid var(--bdr);background:var(--card2);color:var(--tx2);font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap;transition:all .15s}
.db-day-tab.on{background:var(--a);border-color:var(--a);color:#fff}
/* ★ 반 그룹을 세로로 쌓지 않고 가로로 나란히 채워서(auto-fit) 스크롤 빈도를 줄인다 —
 *   auto-fill과 달리 auto-fit은 아이템 수가 적어도 남는 칸 없이 꽉 채운다 */
.db-cls-groups{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;align-items:start}
.db-cls-group{background:var(--card2);border:1px solid var(--bdr);border-radius:12px;padding:11px}
.db-cls-group-hdr{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.db-cls-group-name{font-size:12.5px;font-weight:800;color:var(--tx)}
.db-cls-group-name::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--a);margin-right:6px;vertical-align:middle}
.db-cls-group-time{font-size:10.5px;font-weight:600;color:var(--tx3)}
.db-book-list{display:flex;flex-direction:column;gap:7px}
.db-book-card{background:var(--surf);border:1px solid var(--bdr);border-radius:9px;padding:8px 10px;cursor:pointer;transition:all .15s}
.db-book-card:active{transform:scale(.98)}
.db-book-card-top{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px}
.db-book-name{font-size:12px;font-weight:700;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.db-book-badge{font-size:10.5px;font-weight:800;white-space:nowrap;border-radius:999px;padding:2px 8px;flex-shrink:0}
.db-book-badge.warn{color:#ef4444;background:rgba(239,68,68,.1)}
.db-book-badge.ok{color:#059669;background:rgba(5,150,105,.1)}
.db-stu-list{display:flex;flex-wrap:wrap;gap:5px}
.db-stu-badge{display:inline-flex;align-items:center;gap:3px;background:var(--surf2);border:1px solid var(--bdr);border-radius:999px;padding:3px 8px;font-size:10.5px;font-weight:600;color:var(--tx2)}
.db-stu-badge b{color:#ef4444;font-weight:800}
.db-stu-badge.more{color:var(--tx3)}
.db-book-sync{margin-top:7px;padding-top:6px;border-top:1px dashed var(--bdr);font-size:10px;font-weight:600;color:var(--tx3)}
.db-book-sync.none{opacity:.55;font-style:italic}
.db-more-note{text-align:center;font-size:10.5px;color:var(--tx3);margin-top:8px}
    `;
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════════
   * 초기화 — 관련 데이터 변경 시 대시보드가 열려있으면 자동 새로고침
   * ═══════════════════════════════════════════════════════════ */
  async function init() {
    _css();
    if (typeof DB !== 'undefined')       DB.on('classes', () => { if (_isActive()) render(); });
    if (typeof BookLibDB !== 'undefined') {
      BookLibDB.on('books',  () => { if (_isActive()) render(); });
      BookLibDB.on('checks', () => { if (_isActive()) render(); });
      BookLibDB.on('stamps', () => { if (_isActive()) render(); });
    }
    if (typeof StudentDB !== 'undefined') StudentDB.on('students', () => { if (_isActive()) render(); });
  }

  /* ═══════════════════════════════════════════════════════════
   * 권한 헬퍼
   * ═══════════════════════════════════════════════════════════ */
  function _canSee(pg) {
    if (typeof DB === 'undefined') return false;
    const isAdmin = DB.isAdmin();
    if (pg === 'operate') return true;
    if (isAdmin) return true;
    // ★ 교재·성적·학생·직원: admin이 계정별로 지정한 allowedMenus로 판단(강사·운용자 공통)
    if (['booklib', 'grade', 'students', 'staff'].includes(pg)) {
      return ((DB.getSession()?.allowedMenus) || []).includes(pg);
    }
    return false;
  }
  function _visibleClasses() {
    if (typeof DB === 'undefined') return [];
    let classes = DB.getActiveClasses();
    if (DB.getRole() === 'teacher') {
      const tcIds = DB.getTeacherClasses ? DB.getTeacherClasses() : [];
      if (tcIds.length) {
        const tcNames = tcIds.map(id => classes.find(c => c.id === id)?.name || id);
        classes = classes.filter(c => tcIds.includes(c.id) || tcNames.includes(c.name));
      } else classes = [];
    }
    return classes;
  }

  /* ═══════════════════════════════════════════════════════════
   * 렌더
   * ═══════════════════════════════════════════════════════════ */
  // ★ 대시보드 스타일(구도·톤) — admin이 관리 > 테마에서 3종 중 선택, 색상 팔레트와는 별개로 동작
  function _dashStyle() {
    const v = (typeof DB !== 'undefined' && DB.getTheme) ? DB.getTheme()?.dashboardStyle : null;
    return ['minimal', 'compact', 'hero'].includes(v) ? v : 'minimal';
  }
  function render() {
    const pg = _q('page-dashboard'); if (!pg) return;
    pg.classList.remove('db-style-minimal', 'db-style-compact', 'db-style-hero');
    pg.classList.add('db-style-' + _dashStyle());
    pg.innerHTML = _shell();
    if (typeof LOGO !== 'undefined') { const li = _q('db-logo'); if (li) li.src = LOGO.small; }
    _refreshBadges();
    _initQuote(); // ★ 백그라운드에서 실시간 명언 가져와서 자리 있으면 교체(렌더는 안 기다림)
    // ★ 일정표(캘린더)는 별도 모듈(ScheduleApp)이 렌더링 — 오류가 나도 대시보드 나머지는 정상 동작
    if (typeof ScheduleApp !== 'undefined' && _q('sch-mini-cal')) {
      try { ScheduleApp.renderMiniCalendar('sch-mini-cal'); } catch (e) { console.warn('[DashboardApp] ScheduleApp 렌더 실패', e); }
    }
  }
  function _refreshBadges() {
    if (typeof DB === 'undefined') return;
    const loggedIn = DB.isLoggedIn(), isAdmin = DB.isAdmin();
    _q('db-logout-btn')?.classList.toggle('hidden', !loggedIn);
    _q('db-admin-badge')?.classList.toggle('hidden', !isAdmin);
  }

  function _shell() {
    const today = new Date();
    const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일 (${DAYS_KO[today.getDay()]})`;
    const order = _getSectionOrder();
    const html = order.map(key => _SECTION_HTML[key] ? _SECTION_HTML[key]() : '').join('');
    return `
      <div class="ph">
        <div class="phl">
          <div class="logo-badge" onclick="DashboardApp.render()" title="새로고침" style="cursor:pointer"><img id="db-logo" src="" alt=""></div>
          <div style="min-width:0">
            <div class="ph-title">${_esc(_greeting())} <span id="db-admin-badge" class="admin-badge hidden">🔑 관리자</span></div>
            <div class="ph-sub">${dateStr}${_esc(_bgMoodCaption())}</div>
          </div>
        </div>
        ${_quoteBannerHtml()}
        <div class="phr">
          <button class="db-reorder-btn" onclick="DashboardApp.openReorder()" title="화면 구성 순서 변경">≡</button>
          <button id="db-logout-btn" class="ibtn red hidden" onclick="App.logout()" title="로그아웃">🚪</button>
        </div>
      </div>
      <div class="db-body">${html}</div>`;
  }

  /* ═══════════════════════════════════════════════════════════
   * 섹션 순서 변경 (기기별 저장)
   * ═══════════════════════════════════════════════════════════ */
  let _reorderTmp = null;
  function openReorder() {
    _q('db-reorder-ov')?.remove();
    _reorderTmp = _getSectionOrder().slice();
    const ov = document.createElement('div');
    ov.id = 'db-reorder-ov'; ov.className = 'ov';
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    ov.innerHTML = `<div class="sh">
      <div class="sh-handle"></div>
      <div class="sh-title">≡ 화면 구성 순서 변경</div>
      <div class="sh-sub" style="color:var(--tx3);font-size:11.5px;line-height:1.5;margin-bottom:10px">
        화살표로 순서를 바꾸면 홈 화면에 그 순서대로 표시됩니다. 이 기기에만 적용됩니다.
      </div>
      <div id="db-reorder-list"></div>
      <div class="sh-acts">
        <button class="btn-x" onclick="(()=>{localStorage.removeItem('${LS_ORDER}');DashboardApp.render();document.getElementById('db-reorder-ov')?.remove();App._toast&&App._toast('🔄 기본 순서로 초기화됨','success',2000);})()">초기화</button>
        <button class="btn-ok" onclick="DashboardApp._saveReorder()">💾 순서 저장</button>
      </div>
    </div>`;
    document.body.appendChild(ov);

    function renderList() {
      const list = _q('db-reorder-list');
      list.innerHTML = '';
      _reorderTmp.forEach((key, idx) => {
        const def = SECTION_DEFS.find(d => d.key === key); if (!def) return;
        const row = document.createElement('div');
        row.className = 'db-reorder-row';
        row.innerHTML = `
          <span class="db-reorder-ico">${def.ico}</span>
          <span class="db-reorder-lbl">${def.lbl}</span>
          <div class="db-reorder-btns">
            <button class="db-reorder-arrow" data-dir="up" ${idx === 0 ? 'disabled' : ''}>↑</button>
            <button class="db-reorder-arrow" data-dir="dn" ${idx === _reorderTmp.length - 1 ? 'disabled' : ''}>↓</button>
          </div>`;
        row.querySelectorAll('button[data-dir]').forEach(btn => {
          btn.onclick = () => {
            const dir = btn.dataset.dir, j = dir === 'up' ? idx - 1 : idx + 1;
            if (j < 0 || j >= _reorderTmp.length) return;
            [_reorderTmp[idx], _reorderTmp[j]] = [_reorderTmp[j], _reorderTmp[idx]];
            renderList();
          };
        });
        list.appendChild(row);
      });
    }
    renderList();
  }
  function _saveReorder() {
    if (_reorderTmp) _saveSectionOrder(_reorderTmp);
    _q('db-reorder-ov')?.remove();
    render();
    if (typeof App !== 'undefined' && App._toast) App._toast('✅ 순서가 저장되었습니다', 'success', 2000);
  }

  /* ★ 배경 이미지(BgTheme) 시너지 — 현재 적용 중인 무드를 대시보드 상단에 살짝 알려줌 */
  function _bgMoodCaption() {
    const bg = (typeof DB !== 'undefined' && DB.getTheme) ? DB.getTheme()?.bg : null;
    if (!bg?.enabled) return '';
    const MOOD_LABEL = { season: '🍁 계절 무드', minimal: '🤍 미니멀 무드', wood: '🪵 우드톤 무드', pastel: '🌸 파스텔 무드' };
    const label = MOOD_LABEL[bg.mood];
    return label ? ` · ${label} 배경 적용 중` : '';
  }

  function _greeting() {
    const h = new Date().getHours();
    const name = (typeof DB !== 'undefined' && DB.getSession) ? (DB.getSession()?.username || '') : '';
    const time = h < 12 ? '좋은 아침이에요' : h < 18 ? '오늘도 힘내세요' : '수고 많으셨어요';
    return name ? `${time}, ${name}님` : time;
  }

  /* ═══════════════════════════════════════════════════════════
   * 4. 교재 학습 현황 (반/교재별 미수행 요약)
   * ═══════════════════════════════════════════════════════════ */
  function _lastStamp(chs, stamps) {
    if (!stamps || !Object.keys(stamps).length) return null;
    let lo = -1, lchId = null;
    chs.forEach(ch => { if (stamps[ch.id] && ch.order > lo) { lo = ch.order; lchId = ch.id; } });
    return lchId ? { chId: lchId, order: lo } : null;
  }
  function _computeBookStatusForClasses(classes) {
    if (typeof BookLibDB === 'undefined' || typeof StudentDB === 'undefined') return [];
    const out = [];
    classes.forEach(cls => {
      const books = (BookLibDB.getBooksForClass(cls.id) || []).filter(b => !b.archived);
      books.forEach(book => {
        const chs = book.chapters || [];
        if (!chs.length) return;
        const students = StudentDB.getFiltered({ classCode: cls.name, status: '재원' });
        if (!students.length) return;
        const checks = BookLibDB.getMatrixChecks(cls.id, book.id) || {};
        const stamps = BookLibDB.getStamps(cls.id, book.id) || {};
        const lastStamp = _lastStamp(chs, stamps);
        const evalChs = lastStamp ? chs.filter(ch => ch.order <= lastStamp.order) : chs;
        let total = 0;
        const perStu = [];
        students.forEach(s => {
          let uc = 0;
          evalChs.forEach(ch => { if (checks[`${s.id}__${ch.id}`]) uc++; });
          if (uc > 0) perStu.push({ id: s.id, name: s.name, count: uc });
          total += uc;
        });
        perStu.sort((a, b) => b.count - a.count);
        // ★ 미수행 0건인 교재도 포함 — "오늘의 수업" 리뷰용 그리드라
        //   문제 있는 것만 골라 보여주는 게 아니라 그날 반의 교재 현황을 전부 보여준다.
        const lastSync = BookLibDB.getLastSync ? BookLibDB.getLastSync(cls.id, book.id) : null;
        out.push({ cls, book, total, perStu, lastSync });
      });
    });
    out.sort((a, b) => b.total - a.total);
    return out;
  }
  function _computeBookStatus() { return _computeBookStatusForClasses(_visibleClasses()); }

  /* ★ 오늘(offset 0)부터 앞으로 일주일 안에서, 실제로 수업이 있는 날짜만
   *   골라 탭 목록을 만든다. 수업이 없는 날은 탭 자체를 만들지 않는다. */
  function _pad2(n) { return String(n).padStart(2, '0'); }
  function _dateStrForOffset(offset) {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}`;
  }
  // ★ 일정표(ScheduleApp)에서 "이 기간 정규 수업 없음"으로 표시해둔 방학·임시휴강 기간인지 확인
  //   (schedule-app.js의 _todaySuppression()과 같은 suppressClasses 플래그를 그대로 재사용)
  function _isSuppressedDay(offset) {
    if (typeof ScheduleDB === 'undefined') return false;
    const ds = _dateStrForOffset(offset);
    return ScheduleDB.getAll().some(s => s.suppressClasses && s.startDate <= ds && (s.endDate || s.startDate) >= ds);
  }
  function _classesForDayOffset(offset) {
    if (_isSuppressedDay(offset)) return []; // ★ 방학·임시휴강 기간이면 요일이 맞아도 수업 없음으로 처리
    const d = new Date(); d.setDate(d.getDate() + offset);
    const dow = DAYS_KO[d.getDay()];
    return _visibleClasses().filter(c => (c.days || []).includes(dow));
  }
  function _bookDayTabs() {
    const tabs = [];
    for (let off = 0; off <= 6; off++) {
      const classes = _classesForDayOffset(off);
      if (!classes.length) continue;
      const d = new Date(); d.setDate(d.getDate() + off);
      const label = off === 0 ? '오늘' : off === 1 ? '내일' : `${d.getMonth() + 1}/${d.getDate()}(${DAYS_KO[d.getDay()]})`;
      tabs.push({ off, label });
    }
    return tabs;
  }
  let _bookDayOffset = 0;
  function _selectBookDay(off) {
    _bookDayOffset = off;
    const sec = _q('db-book-sec');
    if (sec) sec.outerHTML = _bookStatusSectionHtml();
  }
  /* ★ 확장 프로그램(htdev-extension) 연동용 — 지금 선택된 날짜 탭 기준으로
   *   업데이트가 필요한 {반, 교재} 목록을 정리해서 이벤트로 내보낸다.
   *   확장 프로그램이 이 이벤트를 받아서 ClassCard 페이지들을 순회하며
   *   BooklibApp._applyClassCardData(clsId, bkId, rows)를 각각 호출해주는
   *   쪽을 구현해야 실제로 "한 번에 전부 업데이트"가 완성된다 — 이 웹앱
   *   쪽에서는 "무엇을 업데이트해야 하는지" 목록을 만들어 신호를 보내는
   *   부분까지만 준비할 수 있다(ClassCard 스크래핑 자체는 확장 프로그램의
   *   역할이라 이 소스에서 직접 처리할 수 없음). */
  function _todayUpdateTargets() {
    if (typeof BookLibDB === 'undefined') return [];
    const classes = _classesForDayOffset(_bookDayOffset);
    const targets = [];
    classes.forEach(cls => {
      const books = (BookLibDB.getBooksForClass(cls.id) || []).filter(b => !b.archived);
      books.forEach(book => targets.push({ clsId: cls.id, clsName: cls.name, bookId: book.id, bookName: book.name }));
    });
    return targets;
  }
  function _requestBulkUpdate() {
    const targets = _todayUpdateTargets();
    if (!targets.length) {
      if (typeof App !== 'undefined' && App._toast) App._toast('업데이트할 교재가 없습니다');
      return;
    }
    try {
      window.dispatchEvent(new CustomEvent('htdev:bulkSyncRequest', { detail: { targets } }));
    } catch (e) {}
    if (typeof App !== 'undefined' && App._toast) App._toast(`📤 ${targets.length}건 업데이트 요청을 보냈습니다`, 'success');
  }
  function _bookStatusSectionHtml() {
    if (!_canSee('booklib')) return '';
    if (typeof BookLibDB === 'undefined' || typeof StudentDB === 'undefined') return '';
    // ★ 오늘 수업이 있을 때만 섹션을 노출한다(주말·방학·임시휴강은 자동으로 제외됨).
    //   오늘 수업이 있으면, 아래 탭에서 이번 주 예정된 다음 수업일들도 함께 보여준다.
    if (!_classesForDayOffset(0).length) return '';
    const tabs = _bookDayTabs();
    // ★ 앞으로 일주일간 예정된 수업이 아예 없으면 섹션 자체를 숨긴다
    if (!tabs.length) return '';
    if (!tabs.find(t => t.off === _bookDayOffset)) _bookDayOffset = tabs[0].off;
    const dow = DAYS_KO[(() => { const d = new Date(); d.setDate(d.getDate() + _bookDayOffset); return d.getDay(); })()];
    const rows = _computeBookStatusForClasses(_classesForDayOffset(_bookDayOffset));

    // ★ 반별로 그룹핑 — 반 순서는 그날 수업 시작 시간 순으로 정렬
    const groups = [];
    const idx = new Map();
    rows.forEach(r => {
      if (!idx.has(r.cls.id)) { idx.set(r.cls.id, groups.length); groups.push({ cls: r.cls, items: [] }); }
      groups[idx.get(r.cls.id)].items.push(r);
    });
    groups.forEach(g => {
      const dt = g.cls.dayTimes?.[dow];
      g.timeLabel = dt?.start ? (dt.end ? `${dt.start}~${dt.end}` : dt.start) : '';
      g.startMin = dt?.start ? (+dt.start.split(':')[0]) * 60 + (+dt.start.split(':')[1]) : 9999;
    });
    groups.sort((a, b) => a.startMin - b.startMin || a.cls.name.localeCompare(b.cls.name));

    return `<div class="db-sec" id="db-book-sec">
      <div class="db-sec-hdr"><div class="db-sec-title">📊 교재 학습 현황</div>
        <div style="display:flex;gap:6px">
          <button class="db-mini-btn" onclick="DashboardApp._requestBulkUpdate()" title="이 날짜의 모든 반을 한 번에 업데이트 요청">🔄 일괄 업데이트</button>
          <button class="db-mini-btn ghost" onclick="App.go('booklib')">전체보기</button>
        </div></div>
      <div class="db-day-tabs">${tabs.map(t => `<button class="db-day-tab${t.off === _bookDayOffset ? ' on' : ''}" onclick="DashboardApp._selectBookDay(${t.off})">${t.label}</button>`).join('')}</div>
      ${groups.length
        ? `<div class="db-cls-groups">${groups.map(g => `<div class="db-cls-group">
            <div class="db-cls-group-hdr">
              <span class="db-cls-group-name">${_esc(g.cls.name)}반</span>
              ${g.timeLabel ? `<span class="db-cls-group-time">🕐 ${g.timeLabel}</span>` : ''}
            </div>
            <div class="db-book-list">${g.items.map(r => _bookCardHtml(r)).join('')}</div>
          </div>`).join('')}</div>`
        : `<div class="db-empty-mini">🎉 미수행 항목이 없습니다</div>`}
    </div>`;
  }
  // ★ "3시간 전", "어제 14:20", "10/5 09:11" 식으로 언제 마지막 업데이트했는지 표시
  function _fmtSyncTime(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const isToday = d.toDateString() === now.toDateString();
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const isYesterday = d.toDateString() === y.toDateString();
    const hhmm = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    if (diffMin < 1) return '방금';
    if (diffMin < 60) return `${diffMin}분 전`;
    if (isToday) return `오늘 ${hhmm}`;
    if (isYesterday) return `어제 ${hhmm}`;
    return `${d.getMonth() + 1}/${d.getDate()} ${hhmm}`;
  }
  function _bookCardHtml(r) {
    const stuHtml = r.perStu.slice(0, 5).map(s => `<span class="db-stu-badge">${_esc(s.name)}<b>${s.count}</b></span>`).join('');
    const moreStu = r.perStu.length > 5 ? `<span class="db-stu-badge more">+${r.perStu.length - 5}명</span>` : '';
    const syncLabel = _fmtSyncTime(r.lastSync);
    return `<div class="db-book-card" onclick="DashboardApp.goMatrix('${r.cls.id}','${r.book.id}')">
      <div class="db-book-card-top">
        <span class="db-book-name">${_esc(r.book.name)}</span>
        ${r.total > 0 ? `<span class="db-book-badge warn">미수행 ${r.total}</span>` : `<span class="db-book-badge ok">✓ 완료</span>`}
      </div>
      <div class="db-stu-list">${stuHtml}${moreStu}</div>
      <div class="db-book-sync${syncLabel ? '' : ' none'}">🕐 ${syncLabel ? `${_esc(syncLabel)} 업데이트` : '업데이트 기록 없음'}</div>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════
   * 6. 일정표 (ScheduleApp에 렌더링 위임)
   * ═══════════════════════════════════════════════════════════ */
  function _scheduleSectionHtml() {
    if (typeof ScheduleApp === 'undefined') return '';
    const isCompact = _dashStyle() === 'compact';
    return `<div class="db-sec">
      <div class="db-sec-hdr">
        <div class="db-sec-title">🗓️ 일정표</div>
        <div class="sch-cal-navs">
          <span class="sch-cal-title" id="sch-month-label"></span>
          ${isCompact ? '' : `
          <button class="sch-nav-btn" onclick="ScheduleApp._navMonth(-1)" title="이전 달">‹</button>
          <button class="sch-nav-btn" onclick="ScheduleApp._navMonth(1)" title="다음 달">›</button>`}
        </div>
      </div>
      <div id="sch-mini-cal"></div>
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════
   * 즐겨찾기 콘텐츠 — 자료실 ⭐ 자료 + 영상 워크시트 ⭐ 영상을 한 섹션에 통합.
   * 두 종류가 섞이면 카드 왼쪽 위 작은 배지(📄/🎬)로만 구분하고,
   * 둘 다 있을 때만 상단에 전체·자료·영상 필터 칩을 보여준다.
   * ═══════════════════════════════════════════════════════════ */
  const _AR_IMG_EXT = ['png','jpg','jpeg','gif','webp'];
  function _archiveIconFor(ext) {
    const m = { pdf:'📕', xlsx:'📗', xls:'📗', csv:'📗', ppt:'📙', pptx:'📙', doc:'📘', docx:'📘',
      zip:'🗜️', txt:'📄', mp4:'🎬', avi:'🎬', mov:'🎬', mkv:'🎬', webm:'🎬', wmv:'🎬',
      mp3:'🎵', wav:'🎵', m4a:'🎵', ogg:'🎵', aac:'🎵', flac:'🎵' };
    return m[(ext || '').toLowerCase()] || '📄';
  }
  function _favoritesSectionHtml() {
    // ★ 버그 수정: getAll()은 비공개 항목까지 그대로 포함한 원본 목록이라,
    //   남이 비공개로 즐겨찾기한 자료·영상이 내 대시보드에도 노출되고 있었다.
    //   공개 여부를 반영하는 접근자로 교체.
    const arItems = (typeof ArchiveDB !== 'undefined') ? (ArchiveDB.getVisiblePosts ? ArchiveDB.getVisiblePosts() : ArchiveDB.getAll()).filter(f => f.pinned).map(f => ({ ...f, _type: 'archive' })) : [];
    const evItems = (typeof EduVideoDB !== 'undefined') ? (EduVideoDB.getVisibleVideos ? EduVideoDB.getVisibleVideos() : EduVideoDB.getAll()).filter(v => v.pinned).map(v => ({ ...v, _type: 'video' })) : [];
    if (!arItems.length && !evItems.length) return ''; // ★ 즐겨찾기가 하나도 없으면 섹션 자체를 숨김
    const items = [...arItems, ...evItems].sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
    const hasBoth = arItems.length > 0 && evItems.length > 0;
    const filterBar = hasBoth ? `
      <div class="db-fav-filter">
        <button class="db-fav-filter-btn on" data-filter="all" onclick="DashboardApp._filterFavorites('all')">전체 ${items.length}</button>
        <button class="db-fav-filter-btn" data-filter="archive" onclick="DashboardApp._filterFavorites('archive')">📄 자료 ${arItems.length}</button>
        <button class="db-fav-filter-btn" data-filter="video" onclick="DashboardApp._filterFavorites('video')">🎬 영상 ${evItems.length}</button>
      </div>` : '';
    return `<div class="db-sec">
      <div class="db-sec-hdr"><div class="db-sec-title">⭐ 즐겨찾기 콘텐츠</div>
        <button class="db-mini-btn ghost" onclick="App.go('archive')">전체보기</button></div>
      ${filterBar}
      <div class="db-ar-thumbs">${items.map(it => {
        if (it._type === 'archive') {
          const isImg = _AR_IMG_EXT.includes((it.ext || '').toLowerCase());
          const inner = isImg
            ? `<img src="${ArchiveDB.getFileUrl(it.r2Key)}" alt="${_esc(it.name)}">`
            : `<div class="db-ar-thumb-ico">${_archiveIconFor(it.ext)}</div>`;
          return `<div class="db-fav-thumb db-ar-thumb" data-type="archive" onclick="DashboardApp.goArchivePreview('${it.id}')" title="${_esc(it.name)}">
            <span class="db-fav-badge type-archive" title="자료">📄</span>
            ${inner}
            <div class="db-ar-thumb-name">${_esc(it.name)}</div>
          </div>`;
        }
        return `<div class="db-fav-thumb db-ar-thumb" data-type="video" onclick="DashboardApp.goEduVideo('${it.id}')" title="${_esc(it.title)}">
          <span class="db-fav-badge type-video" title="영상 워크시트">🎬</span>
          <img src="https://img.youtube.com/vi/${it.youtubeId}/hqdefault.jpg" alt="${_esc(it.title)}">
          <div class="db-ar-thumb-name">${_esc(it.title)}</div>
        </div>`;
      }).join('')}</div>
    </div>`;
  }
  function _filterFavorites(type) {
    document.querySelectorAll('.db-fav-thumb').forEach(el => {
      el.classList.toggle('db-fav-hide', !(type === 'all' || el.dataset.type === type));
    });
    document.querySelectorAll('.db-fav-filter-btn').forEach(b => b.classList.toggle('on', b.dataset.filter === type));
  }
  function goArchivePreview(id) {
    if (typeof App !== 'undefined' && App.go) App.go('archive');
    if (typeof ArchiveApp !== 'undefined' && ArchiveApp.openPreview) ArchiveApp.openPreview(id);
  }
  function goEduVideo(id) {
    if (typeof App !== 'undefined' && App.go) App.go('archive');
    // ★ 자료실 화면이 "영상 워크시트" 도구 탭으로 전환된 뒤에 상세 화면을 열어야 하므로 살짝 지연
    setTimeout(() => {
      if (typeof ArchiveApp !== 'undefined' && ArchiveApp._selectTool) ArchiveApp._selectTool('video-worksheet');
      setTimeout(() => { if (typeof EduVideoApp !== 'undefined' && EduVideoApp.openDetail) EduVideoApp.openDetail(id); }, 120);
    }, 80);
  }

  /* ═══════════════════════════════════════════════════════════
   * 이동 액션
   * ═══════════════════════════════════════════════════════════ */
  function goMatrix(clsId, bkId) {
    if (typeof BooklibApp !== 'undefined' && BooklibApp.goToMatrix) BooklibApp.goToMatrix(clsId, bkId);
  }

  return { init, render, goMatrix, goArchivePreview, goEduVideo, _filterFavorites, _refreshBadges, openReorder, _saveReorder, _selectBookDay, _requestBulkUpdate, _todayUpdateTargets, _refreshQuote, _dashStyle };
})();
