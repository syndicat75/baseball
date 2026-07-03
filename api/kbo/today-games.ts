/**
 * @file today-games.ts
 * @description KBO 리그 당일 경기 일정 및 선발 명단 정보를 제공하는 Vercel Serverless API 엔드포인트입니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getTodayGamesData } from '../../src/lib/kbo/kboDataService';
import { getKoreaTodayString, isValidDateString, toKboDate } from '../../src/lib/kbo/dateUtils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { date, refresh } = req.query;
    console.log(`[api/kbo/today-games] [CALL] handler - date param: "${date}", refresh: "${refresh}"`);

    const todayStr = getKoreaTodayString();
    const targetDate = (date as string) || todayStr;

    // 1. 날짜형식 엄격성 검증
    if (!isValidDateString(targetDate)) {
      console.error(`[api/kbo/today-games] [ERROR] 유효하지 않은 날짜 형식 요청: "${targetDate}"`);
      return res.status(200).json({
        success: false,
        date: targetDate,
        kboDate: targetDate.replaceAll('-', ''),
        games: [],
        emptyReason: 'FETCH_OR_PARSE_FAILED',
        error: '유효하지 않은 날짜 형식입니다. YYYY-MM-DD 포맷을 입력해주세요.',
        source: 'NONE',
        updatedAt: new Date().toISOString()
      });
    }

    const forceRefresh = refresh === 'true';

    // B. 실시간 당일 일정만 극도로 빠르게 획득 (includeDetails = false)
    const gamesResult = await getTodayGamesData(targetDate, forceRefresh, false);

    // 성공 시 브라우저 및 CDN 캐시 헤더 부여 (5분 캐시)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');

    console.log(`[api/kbo/today-games] [SUCCESS] Responding with ${gamesResult.games?.length || 0} games (schedule only).`);
    return res.status(200).json(gamesResult);

  } catch (err: any) {
    console.error('[api/kbo/today-games] [CRITICAL] Unhandled Server Exception', err);
    return res.status(200).json({
      success: false,
      error: 'SERVER_EXCEPTION',
      message: '일정표를 조회하는 과정에서 치명적인 서버 내부 예외가 발생했습니다.',
      details: err.message || String(err),
      source: 'NONE',
      updatedAt: new Date().toISOString(),
      games: [],
      emptyReason: 'FETCH_OR_PARSE_FAILED'
    });
  }
}

