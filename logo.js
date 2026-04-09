/**
 * logo.js — 해피트리 영어학원 로고 (SVG inline)
 */
const LOGO = (() => {
  const mk = (w,h,body) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;
    const b64 = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${b64}`;
  };

  const body80 = `<defs>
    <radialGradient id="g1" cx="50%" cy="40%" r="55%"><stop offset="0%" stop-color="#6ee7b7"/><stop offset="100%" stop-color="#059669"/></radialGradient>
    <radialGradient id="g2" cx="50%" cy="30%" r="60%"><stop offset="0%" stop-color="#a7f3d0"/><stop offset="100%" stop-color="#047857"/></radialGradient>
    <radialGradient id="gb" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ecfdf5"/><stop offset="100%" stop-color="#d1fae5"/></radialGradient>
  </defs>
  <circle cx="40" cy="40" r="38" fill="url(#gb)" stroke="#6ee7b7" stroke-width="1.5"/>
  <rect x="37" y="54" width="6" height="12" rx="3" fill="#78350f"/>
  <rect x="35" y="60" width="10" height="3" rx="1.5" fill="#92400e"/>
  <polygon points="40,38 28,58 52,58" fill="url(#g1)" opacity=".85"/>
  <polygon points="40,26 29,46 51,46" fill="url(#g1)"/>
  <polygon points="40,14 31,34 49,34" fill="url(#g2)"/>
  <polygon points="40,10 41.5,14.5 46,14.5 42.5,17.5 43.8,22 40,19.2 36.2,22 37.5,17.5 34,14.5 38.5,14.5" fill="#fbbf24"/>
  <circle cx="32" cy="30" r="1.5" fill="#fff" opacity=".7"/>
  <circle cx="48" cy="38" r="1" fill="#fff" opacity=".6"/>`;

  const body120 = `<defs>
    <radialGradient id="lg1" cx="50%" cy="40%" r="55%"><stop offset="0%" stop-color="#6ee7b7"/><stop offset="100%" stop-color="#059669"/></radialGradient>
    <radialGradient id="lg2" cx="50%" cy="30%" r="60%"><stop offset="0%" stop-color="#a7f3d0"/><stop offset="100%" stop-color="#047857"/></radialGradient>
    <radialGradient id="lgb" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ecfdf5"/><stop offset="100%" stop-color="#bbf7d0"/></radialGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <circle cx="60" cy="60" r="57" fill="url(#lgb)" stroke="#6ee7b7" stroke-width="2"/>
  <rect x="56" y="81" width="8" height="18" rx="4" fill="#78350f"/>
  <rect x="52" y="92" width="16" height="4" rx="2" fill="#92400e"/>
  <polygon points="60,57 43,86 77,86" fill="url(#lg1)" opacity=".85"/>
  <polygon points="60,40 44,68 76,68" fill="url(#lg1)"/>
  <polygon points="60,22 46,50 74,50" fill="url(#lg2)"/>
  <polygon points="60,14 62.5,22 71,22 64,27 66.5,35 60,30.5 53.5,35 56,27 49,22 57.5,22" fill="#fbbf24" filter="url(#glow)"/>
  <circle cx="48" cy="45" r="2.5" fill="#fff" opacity=".7"/>
  <circle cx="72" cy="57" r="1.8" fill="#fff" opacity=".6"/>
  <circle cx="50" cy="66" r="1.5" fill="#fff" opacity=".5"/>`;

  return {
    small: mk(80, 80, body80),
    large: mk(120, 120, body120)
  };
})();
