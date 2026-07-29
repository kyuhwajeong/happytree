/**
 * archive-worker.js — 해피트리 자료실용 Cloudflare Worker
 * ─────────────────────────────────────────────────────────
 * 역할: 브라우저 ↔ R2 사이의 "문지기". 업로드/삭제는 비밀 토큰이
 *       있어야만 허용하고(R2 접근 키를 브라우저에 절대 노출 안 함),
 *       조회(다운로드/미리보기)는 누구나 가능하게 열어둔다
 *       (학원 내부용 자료실이라 별도 인증 없이 링크로 바로 보이게).
 *
 * ── 배포 방법 (Cloudflare 대시보드에서) ──
 * 1. Cloudflare 계정 생성(무료) → R2 → 버킷 하나 생성 (예: hakwon-archive)
 * 2. Workers & Pages → Create → 이 파일 내용을 그대로 붙여넣기
 * 3. Worker 설정 → Settings → Variables:
 *    - R2 버킷 바인딩: 변수명 ARCHIVE_BUCKET → 방금 만든 버킷 연결
 *    - 환경 변수(Secret): UPLOAD_TOKEN → 아무 긴 임의의 문자열(비밀번호처럼)
 * 4. 배포하면 https://xxx.yyy.workers.dev 같은 주소가 생김
 *    → 이 주소를 archive-db.js 맨 위 WORKER_BASE 에 넣으면 됨
 *    → UPLOAD_TOKEN과 같은 값을 archive-db.js의 UPLOAD_TOKEN에도 넣으면 됨
 */

const ALLOWED_ORIGINS = [
  'https://happytree.vercel.app',
  'https://kyuhwajeong.github.io',
  'http://localhost:3000', // 로컬 테스트용 — 필요 없으면 지워도 됨
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    // ── 프리플라이트(OPTIONS) 요청 처리 ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    // 경로 형식: /file/{key}  (key에 하위 폴더 구분자 '/'가 포함될 수 있음)
    const m = url.pathname.match(/^\/file\/(.+)$/);
    if (!m) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid path' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    const key = decodeURIComponent(m[1]);

    try {
      // ── 업로드 ──
      if (request.method === 'PUT') {
        if (!_checkAuth(request, env)) return _unauthorized(cors);
        const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
        await env.ARCHIVE_BUCKET.put(key, request.body, {
          httpMetadata: { contentType },
        });
        return new Response(JSON.stringify({ ok: true, key }), {
          status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      // ── 삭제 ──
      if (request.method === 'DELETE') {
        if (!_checkAuth(request, env)) return _unauthorized(cors);
        await env.ARCHIVE_BUCKET.delete(key);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      // ── 조회(다운로드/미리보기) — 인증 없이 누구나 접근 가능 ──
      if (request.method === 'GET') {
        const obj = await env.ARCHIVE_BUCKET.get(key);
        if (!obj) {
          return new Response(JSON.stringify({ ok: false, error: 'not found' }), {
            status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
          });
        }
        const headers = new Headers(cors);
        obj.writeHttpMetadata(headers);
        headers.set('etag', obj.httpEtag);
        headers.set('Cache-Control', 'public, max-age=3600');
        return new Response(obj.body, { headers });
      }

      return new Response(JSON.stringify({ ok: false, error: 'method not allowed' }), {
        status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message || String(e) }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  },
};

function _checkAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  return !!env.UPLOAD_TOKEN && token === env.UPLOAD_TOKEN;
}
function _unauthorized(cors) {
  return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
    status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
