/**
 * api/notify.js — Vercel Serverless Function
 *
 * ■ 역할
 *   FCM 서버 키(Server Key)를 Vercel 환경변수에 안전하게 보관하고
 *   클라이언트 요청 시 FCM Legacy HTTP API로 푸시를 전송합니다.
 *
 * ■ 환경변수 설정 (Vercel Dashboard → Settings → Environment Variables)
 *   FCM_SERVER_KEY = <Firebase Console → 프로젝트 설정 → 클라우드 메시징 → 서버 키>
 *
 * ■ 호출 방법 (monitor-fcm.js 에서 자동 호출)
 *   POST /api/notify
 *   Body: { tokens: [...], title: "...", body: "...", data: {...} }
 */
export default async function handler(req, res) {
  /* CORS — 같은 도메인에서만 허용 */
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method Not Allowed' });

  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) {
    console.error('[notify] FCM_SERVER_KEY 환경변수가 설정되지 않음');
    return res.status(500).json({ error: 'FCM_SERVER_KEY not configured' });
  }

  const { tokens, title, body, data } = req.body || {};
  if (!tokens?.length) return res.status(400).json({ error: 'tokens required' });

  /* ── FCM Legacy HTTP API 호출 ── */
  try {
    const fcmRes = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${serverKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        registration_ids: tokens.slice(0, 500), // FCM 최대 500개/요청
        notification: {
          title: title || '해피트리 모니터링',
          body:  body  || '새 접속이 감지됐습니다',
        },
        data: data || {},
        priority: 'high',
        android: { priority: 'high' },
        apns:    { headers: { 'apns-priority': '10' } },
      }),
    });

    const result = await fcmRes.json();

    /* 만료된 토큰 자동 정리 정보 반환 */
    const invalidTokens = [];
    if (result.results) {
      result.results.forEach((r, i) => {
        if (r.error === 'NotRegistered' || r.error === 'InvalidRegistration') {
          invalidTokens.push(tokens[i]);
        }
      });
    }

    console.log(`[notify] FCM 전송: ${result.success || 0}성공 / ${result.failure || 0}실패`);
    return res.status(200).json({ ok: true, result, invalidTokens });

  } catch (err) {
    console.error('[notify] FCM 호출 오류:', err);
    return res.status(500).json({ error: err.message });
  }
}
