/**
 * @file game-predictions.ts
 * @description KBO 경기별 승률 예측 상세 데이터를 가공·제공하는 Vercel Serverless API 엔드포인트입니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStandingsData, getTodayGamesData } from '../../src/lib/kbo/kboDataService';
import { calculateGamePrediction } from '../../src/lib/kbo/predictionEngine';
import { getKoreaTodayString, isValidDateString, toKboDate } from '../../src/lib/kbo/dateUtils';
import { PitcherStats } from '../../src/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { date, refresh } = req.query;
    console.log(`[api/kbo/game-predictions] [CALL] handler - date param: "${date}", refresh: "${refresh}"`);

    const todayStr = getKoreaTodayString();
    const targetDate = (date as string) || todayStr;

    // 1. 날짜형식 엄격성 검증
    if (!isValidDateString(targetDate)) {
      console.error(`[api/kbo/game-predictions] [ERROR] 유효하지 않은 날짜 형식 요청: "${targetDate}"`);
      return res.status(200).json({
        success: false,
        date: targetDate,
        kboDate: targetDate.replaceAll('-', ''),
        predictions: [],
        error: 'INVALID_DATE_FORMAT',
        message: '유효하지 않은 날짜 형식입니다. YYYY-MM-DD 포맷을 입력해주세요.',
        source: 'NONE',
        updatedAt: new Date().toISOString()
      });
    }

    const kboDateStr = toKboDate(targetDate);
    const forceRefresh = refresh === 'true';

    // A. 실시간 순위 정보 획득
    const standingsRes = await getStandingsData(false);
    const standingsList = standingsRes.success ? standingsRes.standings : [];

    // B. 실시간 당일 일정 및 선발투수 획득
    const gamesResult = await getTodayGamesData(targetDate, forceRefresh);

    if (!gamesResult.success) {
      console.warn(`[api/kbo/game-predictions] Schedule data collection returned success: false. Bypassing 500 error.`);
      return res.status(200).json({
        success: false,
        error: gamesResult.error || 'SCHEDULE_COLLECTION_FAILED',
        message: '경기 일정 정보가 없어 예측 데이터를 구성하지 못했습니다.',
        source: gamesResult.source || 'NONE',
        updatedAt: gamesResult.updatedAt || new Date().toISOString(),
        predictions: []
      });
    }

    // C. 각 경기마다 예측 승률 정보 계산 및 가공
    const predictions = gamesResult.games.map((g) => {
      let prediction = null;

      if (standingsList.length === 10) {
        const mapPitcher = (p: any, teamName: string): PitcherStats | undefined => {
          if (!p || !p.name) return undefined;
          const wins = p.wins || 0;
          const losses = p.losses || 0;
          const total = wins + losses;
          return {
            name: p.name,
            team: teamName,
            wins,
            losses,
            winningPct: total > 0 ? wins / total : 0.5,
            era: p.era || 4.50,
            innings: 50,
            whip: 1.35,
            strikeouts: 40,
            recentEra: p.era || 4.50,
            recentGames: 3
          };
        };

        const awayStarterMapped = mapPitcher(g.awayStarter, g.awayTeam);
        const homeStarterMapped = mapPitcher(g.homeStarter, g.homeTeam);

        try {
          prediction = calculateGamePrediction(
            g.awayTeam,
            g.homeTeam,
            g.stadium || '구장',
            standingsList as any,
            [],
            awayStarterMapped,
            homeStarterMapped
          );
        } catch (predErr) {
          console.warn(`[api/kbo/game-predictions] Non-blocking prediction warning for game ${g.gameId}`, predErr);
        }
      }

      return {
        gameId: g.gameId,
        date: g.date,
        time: g.time,
        stadium: g.stadium,
        awayTeam: g.awayTeam,
        homeTeam: g.homeTeam,
        status: g.status,
        prediction
      };
    });

    // s-maxage=600 (10분 캐시)
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

    console.log(`[api/kbo/game-predictions] [SUCCESS] Compiled ${predictions.length} predictions for ${targetDate}`);
    return res.status(200).json({
      success: true,
      source: gamesResult.source,
      sourceLabel: gamesResult.sourceLabel,
      fallbackUsed: gamesResult.fallbackUsed,
      asOfDate: targetDate,
      targetDate,
      kboDate: kboDateStr,
      fetchedAt: gamesResult.updatedAt,
      predictions
    });

  } catch (err: any) {
    console.error('[api/kbo/game-predictions] [CRITICAL] Unhandled Server Exception', err);
    return res.status(200).json({
      success: false,
      error: 'SERVER_EXCEPTION',
      message: '예측 데이터를 산출하는 과정에서 치명적인 서버 내부 예외가 발생했습니다.',
      details: err.message || String(err),
      source: 'NONE',
      updatedAt: new Date().toISOString(),
      predictions: []
    });
  }
}
