/**
 * bg-theme.js — v1.0
 * 트렌디 배경 이미지 시스템 (무료 이미지 연동 재사용)
 * ────────────────────────────────────────────────────────────────
 * · edu-video-app.js에 이미 등록된 Unsplash Access Key를 그대로 재사용(무료, 추가 계약 불필요)
 * · 무드(계절감/미니멀/우드톤/파스텔) 기반으로 검색어를 골라 사진 1장을 선택,
 *   현재 팔레트의 --bg 색으로 스크림(반투명 덧칠)을 얹어 body 배경으로만 적용한다.
 * · 카드(--card)·표면(--surf)은 전부 불투명이라 실제 데이터 화면 가독성에는 영향 없음.
 * · 설정은 hakwon10/theme.bg 에 함께 저장되어(테마 저장과 동일 경로) 전 기기에 동기화된다.
 * · admin 세션이 켜져 있고, 설정된 교체 주기가 지났을 때만 새 이미지를 자동으로 뽑아온다
 *   (일반 계정은 절대 API를 직접 호출하지 않음 — 무료 API 호출량 보호).
 * · 네트워크/키 문제 시에는 조용히 기존 단색 배경(--bg)으로 폴백 — 화면이 깨지지 않는다.
 *
 * theme.bg 구조:
 * {
 *   enabled: false,
 *   mood: 'season' | 'minimal' | 'wood' | 'pastel',
 *   strength: 'soft' | 'normal' | 'vivid',   // 클수록 사진이 진하게 보임
 *   rotateDays: 7,                            // 자동 교체 주기(일)
 *   url: '', query: '', credit: { name, link },
 *   updatedAt: 'ISO'
 * }
 */
const BgTheme = (() => {
  // ★ edu-video-app.js와 동일한 Unsplash 무료 Access Key 재사용 (별도 계약/키 추가 불필요)
  const UNSPLASH_ACCESS_KEY = 'yUhFiyfYIWr_g3X0J7n1922oC28OfyQHz7RiZ-CDTMA';

  // 강도별 스크림 불투명도 — 값이 낮을수록 사진이 더 선명하게 비침
  // ★ 가독성 최우선 요청 반영: 기본값을 전반적으로 더 은은하게(사진 노출도↓) 조정
  const STRENGTH_MAP = { soft: 0.96, normal: 0.92, vivid: 0.87 };

  // ★ 숫자 입력이 빽빽한 "작업 화면"에서는 배경 노출도를 한 번 더 낮춘다
  //   (성적 엑셀뷰, 진도 입력 화면 — 시인성이 무엇보다 중요한 화면)
  const DENSE_PAGES = ['grade', 'operate'];
  const DENSE_EXTRA_SCRIM = 0.07; // 위 화면에서 스크림에 추가로 더하는 불투명도

  let _currentPage = null;
  let _lastTheme = null;

  const MOOD_QUERIES = {
    minimal: ['minimal workspace', 'clean white desk', 'soft neutral texture', 'simple architecture light'],
    wood:    ['warm wood desk', 'wood grain texture', 'cozy wooden interior', 'natural wood texture'],
    pastel:  ['pastel gradient', 'soft pastel sky', 'pastel abstract background', 'soft color gradient'],
  };
  // 월(1~12) 기준 계절감 검색어 풀
  const SEASON_QUERIES = {
    1: ['snow winter morning', 'frost texture minimal'],
    2: ['snow winter morning', 'soft winter light'],
    3: ['cherry blossom spring', 'fresh spring green'],
    4: ['cherry blossom spring', 'spring flowers pastel'],
    5: ['fresh green leaves', 'spring garden light'],
    6: ['blue sky summer', 'ocean breeze light minimal'],
    7: ['blue sky summer', 'tropical light minimal'],
    8: ['blue sky summer', 'summer clouds soft'],
    9: ['autumn leaves warm', 'golden hour autumn'],
    10:['autumn leaves warm', 'maple leaves texture'],
    11:['autumn leaves warm', 'cozy autumn desk'],
    12:['snow winter morning', 'warm winter light cozy'],
  };

  let _creditEl = null;

  function _esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function _hex2rgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function _pickQuery(mood) {
    if (mood === 'season') {
      const m = new Date().getMonth() + 1;
      const pool = SEASON_QUERIES[m] || SEASON_QUERIES[1];
      return pool[Math.floor(Math.random() * pool.length)];
    }
    const pool = MOOD_QUERIES[mood] || MOOD_QUERIES.minimal;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* ★ Unsplash 검색 API 호출 — 상위 결과 중 무작위 1장 선택 (매번 같은 사진 반복 방지) */
  async function _fetchPhoto(query) {
    if (!query || UNSPLASH_ACCESS_KEY.includes('YOUR-UNSPLASH')) return null;
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape&content_filter=high&client_id=${UNSPLASH_ACCESS_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Unsplash API 오류: HTTP ' + res.status);
    const data = await res.json();
    const results = (data?.results || []).filter(p => p?.urls?.regular);
    if (!results.length) return null;
    const pick = results[Math.floor(Math.random() * results.length)];
    const base = pick.urls.regular;
    return {
      url: base + (base.includes('?') ? '&' : '?') + 'w=1600&q=55&auto=format',
      credit: {
        name: pick.user?.name || 'Unsplash',
        link: (pick.user?.links?.html || 'https://unsplash.com') + '?utm_source=happytree_academy&utm_medium=referral',
      },
      query,
    };
  }

  /* 외부(테마 화면 "지금 새 배경 미리보기" 버튼)에서 호출 — 저장은 하지 않고 사진 정보만 반환 */
  async function fetchOne(mood) {
    return _fetchPhoto(_pickQuery(mood || 'season'));
  }

  function _ensureCreditEl() {
    if (_creditEl) return _creditEl;
    _creditEl = document.createElement('div');
    _creditEl.id = 'bg-theme-credit';
    _creditEl.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:5;font-size:9px;'
      + 'color:rgba(255,255,255,.85);background:rgba(0,0,0,.28);backdrop-filter:blur(2px);'
      + 'padding:2px 7px;border-radius:6px;pointer-events:auto;opacity:.75;display:none;'
      + 'font-family:sans-serif;line-height:1.6;white-space:nowrap';
    document.body.appendChild(_creditEl);
    return _creditEl;
  }

  /* ★ 핵심 렌더링 — theme(팔레트 포함) 하나만 넘기면 현재 --bg 색 기준으로 스크림을 계산해 적용 */
  function render(theme) {
    if (typeof document === 'undefined') return;
    _lastTheme = theme;
    const creditEl = _ensureCreditEl();
    const bg = theme?.bg;
    if (!bg?.enabled || !bg?.url) {
      document.body.style.backgroundImage = '';
      creditEl.style.display = 'none';
      return;
    }
    const hex = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f8f9fc';
    const rgb = _hex2rgb(hex) || { r: 248, g: 249, b: 252 };
    let scrim = STRENGTH_MAP[bg.strength] ?? STRENGTH_MAP.soft;
    // ★ 성적/진도 입력 화면에서는 시인성을 위해 스크림을 한 번 더 진하게(=사진은 더 옅게)
    if (DENSE_PAGES.includes(_currentPage)) scrim = Math.min(0.99, scrim + DENSE_EXTRA_SCRIM);
    document.body.style.backgroundImage =
      `linear-gradient(rgba(${rgb.r},${rgb.g},${rgb.b},${scrim}), rgba(${rgb.r},${rgb.g},${rgb.b},${scrim})), url("${bg.url}")`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
    if (bg.credit?.name) {
      creditEl.innerHTML = `📷 <a href="${bg.credit.link || '#'}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">${_esc(bg.credit.name)}</a> on <a href="https://unsplash.com/?utm_source=happytree_academy&utm_medium=referral" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">Unsplash</a>`;
      creditEl.style.display = '';
    } else {
      creditEl.style.display = 'none';
    }
  }

  /* ★ app.js의 go(page) 라우팅에서 호출 — 화면이 바뀔 때마다 밀도에 맞춰 스크림을 재계산 */
  function setPage(page) {
    _currentPage = page;
    if (_lastTheme) render(_lastTheme);
  }

  /* ★ 부팅 시 1회 — 캐시된(=Firebase에 저장된) 배경을 즉시 반영 + admin 세션이면 교체 주기 확인 후 자동 로테이션 */
  async function init() {
    if (typeof DB === 'undefined') return;
    const t = DB.getTheme();
    render(t);
    try {
      if (typeof DB.isAdmin === 'function' && DB.isAdmin() && t?.bg?.enabled) {
        const days = t.bg.rotateDays || 7;
        const last = t.bg.updatedAt ? new Date(t.bg.updatedAt).getTime() : 0;
        if (!last || (Date.now() - last) >= days * 86400000) {
          const fresh = await _fetchPhoto(_pickQuery(t.bg.mood || 'season'));
          if (fresh) {
            const latest = DB.getTheme(); // ★ 저장 직전 최신값을 다시 읽어 그 사이 다른 설정 변경을 덮어쓰지 않도록 함
            const nt = { ...latest, bg: { ...(latest.bg || {}), url: fresh.url, credit: fresh.credit, query: fresh.query, updatedAt: new Date().toISOString() } };
            await DB.saveTheme(nt);
            render(nt);
            console.log('[BgTheme] 🔄 배경 자동 교체 완료:', fresh.query);
          }
        }
      }
    } catch (e) {
      console.warn('[BgTheme] 자동 로테이션 실패(다음 세션에 재시도):', e.message);
    }
  }

  return { init, render, fetchOne, setPage };
})();
