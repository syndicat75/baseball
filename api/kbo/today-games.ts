/**
 * @file today-games.ts
 * @description KBO 리그 당일 경기 일정 및 선발 명단 정보를 제공하는 Vercel Serverless API 엔드포인트입니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStandingsData, getTodayGamesData } from '../../src/lib/kbo/kboDataService';
import { calculateGamePrediction } from '../../src/lib/kbo/predictionEngine';
import { getKoreaTodayString, isValidDateString, toKboDate } from '../../src/lib/kbo/dateUtils';
import { PitcherStats } from '../../src/types';

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

    const kboDateStr = toKboDate(targetDate);
    const forceRefresh = refresh === 'true';

    // A. 실시간 순위 정보 획득 (예측 엔진에 주입)
    const standingsRes = await getStandingsData(false); // 순위는 굳이 매 일정 조회마다 강제 새로고침할 필요는 없음
    const standingsList = standingsRes.success ? standingsRes.standings : [];

    // B. 실시간 당일 일정 및 선발투수 획득
    const gamesResult = await getTodayGamesData(targetDate, forceRefresh);

    if (!gamesResult.success) {
      console.warn(`[api/kbo/today-games] Schedule data collection returned success: false. Bypassing 500 error.`);
      return res.status(200).json({
        success: false,
        error: gamesResult.error || 'SCHEDULE_COLLECTION_FAILED',
        message: '경기 일정 정보를 조회하지 못했습니다.',
        source: gamesResult.source || 'NONE',
        updatedAt: gamesResult.updatedAt || new Date().toISOString(),
        games: [],
        emptyReason: 'FETCH_OR_PARSE_FAILED'
      });
    }

    // C. 각 경기마다 예측 승률 정보 계산 및 주입
    const finalGames = gamesResult.games.map((g) => {
      let prediction = null;

      if (standingsList.length === 10) {
        // PitcherStats 형식 맵핑 헬퍼
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
            [], // completedGames는 Elorating 계산 등의 부가적 요소로 생략 가능
            awayStarterMapped,
            homeStarterMapped
          );
        } catch (predErr) {
          console.warn(`[api/kbo/today-games] Non-blocking warning: Failed to calculate prediction for game ${g.gameId}`, predErr);
        }
      }

      return {
        ...g,
        prediction
      };
    });

    // 성공 시 브라우저 및 CDN 캐시 헤더 부여 (종료된 경기 목록이 있으면 30분, 예정 경기가 섞여 있으면 5분)
    const hasUnfinishedGames = finalGames.some(g => g.status === '예정' || g.status === '진행중');
    const cacheTtlSeconds = hasUnfinishedGames ? 300 : 1800;
    res.setHeader('Cache-Control', `s-maxage=${cacheTtlSeconds}, stale-while-revalidate=300`);

    console.log(`[api/kbo/today-games] [SUCCESS] Responding with ${finalGames.length} games and computed predictions.`);
    return res.status(200).json({
      success: true,
      date: targetDate,
      kboDate: kboDateStr,
      source: gamesResult.source,
      sourceLabel: gamesResult.sourceLabel,
      fallbackUsed: gamesResult.fallbackUsed,
      updatedAt: gamesResult.updatedAt,
      games: finalGames,
      emptyReason: gamesResult.emptyReason
    });

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

