/**
 * api/notify.js — v2.0 (FCM V1 API)
 *
 * ■ Legacy API(서버 키 방식) → FCM V1 API(서비스 계정 방식)으로 전환
 *   이유: Google이 Legacy API를 2024년 6월에 완전 종료함
 *
 * ■ 필요한 Vercel 환경변수
 *   FCM_SERVICE_ACCOUNT = Firebase 서비스 계정 JSON 파일 내용 전체
 *   (Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성)
 *
 * ■ 동작 방식
 *   서비스 계정 JSON → JWT 생성 → Google OAuth2 토큰 교환
 *   → FCM V1 API로 푸시 전송
 *   (외부 npm 패키지 없이 Node.js 내장 crypto 모듈만 사용)
 */
import crypto from 'crypto';

/* ══════════════════════════════════════════════════════
 * 서비스 계정으로 Google OAuth2 액세스 토큰 발급
 * ══════════════════════════════════════════════════════ */
async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);

  /* JWT Claim */
  const header  = _b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = _b64u(JSON.stringify({
    iss:  sa.client_email,
    scope:'https://www.googleapis.com/auth/firebase.messaging',
    aud:  'https://oauth2.googleapis.com/token',
    iat:  now,
    exp:  now + 3600,
  }));

  /* JWT 서명 (RS256) */
  const toSign  = `${header}.${payload}`;
  const signer  = crypto.createSign('RSA-SHA256');
  signer.update(toSign);
  const sig     = signer.sign(sa.private_key, 'base64url');
  const jwt     = `${toSign}.${sig}`;

  /* OAuth2 토큰 교환 */
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  const d = await r.json();
  if (!d.access_token) throw new Error(`토큰 발급 실패: ${JSON.stringify(d)}`);
  return d.access_token;
}

function _b64u(str) {
  return Buffer.from(str).toString('base64url');
}

/* ══════════════════════════════════════════════════════
 * FCM V1 API로 단일 토큰에 푸시 전송
 * ══════════════════════════════════════════════════════ */
async function sendOne(projectId, accessToken, token, title, body, data) {
  const r = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: Object.fromEntries(
            Object.entries(data || {}).map(([k, v]) => [k, String(v)])
          ),
          android: { priority: 'high' },
          apns:    { headers: { 'apns-priority': '10' } },
          webpush: {
            headers:     { Urgency: 'high' },
            notification: {
              title, body,
              requireInteraction: true,
              vibrate: [200, 100, 200],
            },
          },
        },
      }),
    }
  );

  const result = await r.json();
  return { token: token.slice(0, 20) + '...', ok: !!result.name, result };
}

/* ══════════════════════════════════════════════════════
 * Vercel Serverless Handler
 * ══════════════════════════════════════════════════════ */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  /* 환경변수 확인 */
  const saRaw = process.env.FCM_SERVICE_ACCOUNT;
  if (!saRaw) {
    console.error('[notify] FCM_SERVICE_ACCOUNT 환경변수 없음');
    return res.status(500).json({ error: 'FCM_SERVICE_ACCOUNT not configured' });
  }

  let sa;
  try {
    sa = JSON.parse(saRaw);
  } catch(e) {
    return res.status(500).json({ error: 'FCM_SERVICE_ACCOUNT JSON 파싱 실패' });
  }

  const { tokens, title, body, data } = req.body || {};
  if (!tokens?.length) return res.status(400).json({ error: 'tokens required' });

  try {
    /* OAuth2 액세스 토큰 발급 */
    const accessToken = await getAccessToken(sa);
    const projectId   = sa.project_id;

    /* 모든 토큰에 병렬 전송 (최대 500개) */
    const results = await Promise.allSettled(
      tokens.slice(0, 500).map(t =>
        sendOne(projectId, accessToken, t,
          title || '해피트리 모니터링',
          body  || '새 접속이 감지됐습니다',
          data  || {})
      )
    );

    const success = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
    const failure = results.length - success;

    console.log(`[notify] FCM V1 전송: ${success}성공 / ${failure}실패`);
    return res.status(200).json({ ok: true, success, failure, total: tokens.length });

  } catch(err) {
    console.error('[notify] FCM 오류:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
