/**
 * api/geoip.js — Vercel Serverless Function
 *
 * ■ 역할
 *   브라우저는 HTTPS → HTTP 혼합 콘텐츠 차단으로 ip-api.com 직접 호출 불가
 *   이 API Route가 서버사이드에서 ip-api.com 을 호출하고 한국어 결과를 반환
 *
 * ■ IP 판별 우선순위
 *   1. ?ip=xxx 파라미터 (명시적 지정)
 *   2. X-Forwarded-For 헤더 (Vercel이 접속자 실제 IP를 자동 기록)
 *   3. X-Real-IP 헤더 (대체 헤더)
 *   ※ 파라미터 없으면 Vercel 서버가 아닌 실제 접속자 IP를 사용
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* ★ 실제 접속자 IP 추출
   *   Vercel은 X-Forwarded-For 헤더에 원본 클라이언트 IP를 기록함
   *   (여러 IP가 쉼표로 연결될 경우 첫 번째가 실제 사용자 IP)
   */
  const clientIp =
    req.query.ip ||
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    '';

  const url = clientIp
    ? `http://ip-api.com/json/${clientIp}?lang=ko&fields=status,message,country,regionName,city,isp,query,lat,lon`
    : `http://ip-api.com/json/?lang=ko&fields=status,message,country,regionName,city,isp,query,lat,lon`;

  try {
    const r = await fetch(url);
    const d = await r.json();

    if (d.status !== 'success') {
      return res.status(200).json({
        ip: clientIp || '알 수 없음',
        city:'', region:'', country:'', isp:'', lat:0, lon:0,
      });
    }

    return res.status(200).json({
      ip:     d.query      || clientIp || '알 수 없음',
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
      ip: clientIp || '알 수 없음',
      city:'', region:'', country:'', isp:'', lat:0, lon:0,
    });
  }
}
