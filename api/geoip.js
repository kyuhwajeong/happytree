/**
 * api/geoip.js — Vercel Serverless Function
 *
 * ■ 역할
 *   브라우저는 HTTPS → HTTP 혼합 콘텐츠 차단으로 ip-api.com 직접 호출 불가
 *   이 API Route가 서버사이드에서 ip-api.com 을 호출하고 한국어 결과를 반환
 *
 * ■ 호출 방법
 *   GET /api/geoip          → 접속자 본인 IP 조회
 *   GET /api/geoip?ip=x.x.x.x → 특정 IP 조회
 *
 * ■ 응답 예시
 *   { ip:"211.x.x.x", city:"수원시", region:"경기도",
 *     country:"대한민국", isp:"SK브로드밴드", lat:37.26, lon:127.0 }
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* 조회할 IP — 파라미터 없으면 접속자 본인 IP 자동 감지 */
  const targetIp = req.query.ip || '';

  /* ip-api.com 서버사이드 호출 (HTTP 허용, 한국어, 무료 분당 45회) */
  const url = targetIp
    ? `http://ip-api.com/json/${targetIp}?lang=ko&fields=status,message,country,regionName,city,isp,query,lat,lon`
    : `http://ip-api.com/json/?lang=ko&fields=status,message,country,regionName,city,isp,query,lat,lon`;

  try {
    const r = await fetch(url);
    const d = await r.json();

    if (d.status !== 'success') {
      return res.status(200).json({
        ip: targetIp || '알 수 없음',
        city:'', region:'', country:'', isp:'', lat:0, lon:0,
      });
    }

    return res.status(200).json({
      ip:     d.query      || targetIp || '알 수 없음',
      city:   d.city       || '',
      region: d.regionName || '',
      country:d.country    || '',
      isp:    d.isp        || '',
      lat:    d.lat        || 0,
      lon:    d.lon        || 0,
    });
  } catch(err) {
    console.error('[geoip] 오류:', err);
    return res.status(200).json({
      ip: targetIp || '알 수 없음',
      city:'', region:'', country:'', isp:'', lat:0, lon:0,
    });
  }
}
