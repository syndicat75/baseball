/**
 * @file schedule.ts
 * @description KBO 리그 전체 일정(완료 경기, 잔여 경기 등)을 분석·반환하는 Vercel Serverless API 엔드포인트입니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getTodayGamesData } from '../../src/lib/kbo/kboDataService';
import { getKoreaTodayString } from '../../src/lib/kbo/dateUtils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { from, refresh } = req.query;
    console.log(`[api/kbo/schedule] [CALL] handler - from param: "${from}", refresh: "${refresh}"`);

    const todayStr = getKoreaTodayString();
    const targetDate = (from as string) || todayStr;
    const forceRefresh = refresh === 'true';

    const gamesResult = await getTodayGamesData(targetDate, forceRefresh);

    if (!gamesResult.success) {
      console.warn(`[api/kbo/schedule] Schedule data collection returned success: false. Bypassing 500 error.`);
      return res.status(200).json({
        success: false,
        error: gamesResult.error || 'SCHEDULE_COLLECTION_FAILED',
        message: '경기 일정 정보를 조회하지 못했습니다.',
        source: gamesResult.source || 'NONE',
        updatedAt: gamesResult.updatedAt || new Date().toISOString(),
        completedGames: [],
        remainingGames: [],
        unresolvedGames: [],
        games: []
      });
    }

    const allGames = gamesResult.games || [];
    const completedGames = allGames.filter((g: any) => g.status === '종료');
    const remainingGames = allGames.filter((g: any) => g.status !== '종료');
    const unresolvedGames = allGames.filter((g: any) => g.status === '예정');

    // 10분 s-maxage 설정
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

    const response = {
      success: true,
      source: gamesResult.source,
      sourceLabel: gamesResult.sourceLabel,
      originalSource: gamesResult.source,
      originalSourceLabel: gamesResult.sourceLabel,
      stale: false,
      fallbackUsed: gamesResult.fallbackUsed,
      completedGames,
      remainingGames,
      unresolvedGames,
      games: allGames,
      asOfDate: targetDate,
      fetchedAt: gamesResult.updatedAt,
    };

    console.log(`[api/kbo/schedule] [SUCCESS] Returned ${allGames.length} total games for ${targetDate}`);
    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[api/kbo/schedule] [CRITICAL] Unhandled Server Exception', err);
    return res.status(200).json({
      success: false,
      error: 'SERVER_EXCEPTION',
      message: '일정을 조회하는 과정에서 치명적인 서버 내부 예외가 발생했습니다.',
      details: err.message || String(err),
      source: 'NONE',
      updatedAt: new Date().toISOString(),
      completedGames: [],
      remainingGames: [],
      unresolvedGames: [],
      games: []
    });
  }
}
