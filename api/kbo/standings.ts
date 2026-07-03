/**
 * @file standings.ts
 * @description KBO 리그 팀 순위표 정보 제공 Vercel Serverless API 엔드포인트입니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStandingsData } from '../../src/lib/kbo/kboDataService';
import { getKoreaTodayString, isValidDateString, toKboDate } from '../../src/lib/kbo/dateUtils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { date, refresh } = req.query;
    console.log(`[api/kbo/standings] [CALL] handler - date param: "${date}", refresh: "${refresh}"`);

    const todayStr = getKoreaTodayString();
    const targetDate = (date as string) || todayStr;

    // 1. 날짜 형식 엄격성 검증
    if (!isValidDateString(targetDate)) {
      console.error(`[api/kbo/standings] [ERROR] 유효하지 않은 날짜 형식 요청: "${targetDate}"`);
      return res.status(200).json({
        success: false,
        error: 'INVALID_DATE_FORMAT',
        message: '유효하지 않은 날짜 형식입니다. YYYY-MM-DD 포맷을 입력해주세요.',
        details: `Requested date: "${targetDate}"`,
        source: 'NONE',
        updatedAt: new Date().toISOString()
      });
    }

    const kboDateStr = toKboDate(targetDate);
    const forceRefresh = refresh === 'true';

    // getStandingsData를 통해 수집 및 캐싱된 데이터 획득
    const standingsResult = await getStandingsData(forceRefresh);

    if (!standingsResult.success) {
      console.warn(`[api/kbo/standings] Standings data collection returned success: false. Bypassing 500 error.`);
      return res.status(200).json({
        success: false,
        error: standingsResult.error || 'STANDINGS_COLLECTION_FAILED',
        message: standingsResult.message || '순위 데이터를 조회하지 못했습니다.',
        source: standingsResult.source || 'NONE',
        updatedAt: standingsResult.updatedAt || new Date().toISOString(),
        standings: []
      });
    }

    // 성공한 경우 브라우저 및 CDN 캐시 헤더 부여 (10분)
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

    console.log(`[api/kbo/standings] [SUCCESS] Responding with ${standingsResult.standings.length} team standings.`);
    return res.status(200).json({
      success: true,
      date: targetDate,
      kboDate: kboDateStr,
      source: "KBO_OFFICIAL_EN_STANDINGS",
      sourceLabel: standingsResult.sourceLabel,
      asOfDate: standingsResult.asOfDate,
      updatedAt: standingsResult.updatedAt,
      stale: standingsResult.stale,
      fallbackUsed: standingsResult.fallbackUsed,
      warnings: standingsResult.warnings,
      data: standingsResult.standings,
      standings: standingsResult.standings // 하위 호환성 유지용
    });

  } catch (err: any) {
    console.error('[api/kbo/standings] [CRITICAL] Unhandled Server Exception', err);
    return res.status(200).json({
      success: false,
      error: 'SERVER_EXCEPTION',
      message: '순위표 조회 과정에서 치명적인 서버 내부 예외가 발생했습니다.',
      details: err.message || String(err),
      source: 'NONE',
      updatedAt: new Date().toISOString()
    });
  }
}

