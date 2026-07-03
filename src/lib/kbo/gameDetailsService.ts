/**
 * @file gameDetailsService.ts
 * @description 오늘 경기 목록을 기반으로 각 경기의 비공식 선발투수 세부 정보를 병렬로 안전하게 수집 및 통합하는 서비스 모듈입니다.
 */

import { getTodayGamesData } from './kboDataService';
import { parseMyKboGameDetails, ParsedGameDetail } from './sources/parseMyKboGameDetails';
import { getCache, setCache } from './cache';

export interface GameDetailsResult {
  success: boolean;
  date: string;
  source: string;
  updatedAt: string;
  details: Array<{
    gameId: string;
    awayTeam: string;
    homeTeam: string;
    awayStarter: any | null;
    homeStarter: any | null;
    missingData: string[];
  }>;
  error?: string;
  message?: string;
}

/**
 * @function getGameDetailsData
 * @description 지정된 날짜의 경기 선발투수 상세 정보를 수집하여 안전하게 반환합니다.
 * @param {string} dateStr - 조회 대상 날짜 (YYYY-MM-DD)
 * @param {boolean} [forceRefresh=false] - 캐시 강제 무효화 여부
 */
export async function getGameDetailsData(dateStr: string, forceRefresh = false): Promise<GameDetailsResult> {
  console.log(`[gameDetailsService] [CALL] getGameDetailsData - dateStr: "${dateStr}", forceRefresh: ${forceRefresh}`);
  const cacheKey = `kbo:game-details-full:${dateStr}`;

  if (!forceRefresh) {
    const cached = await getCache<GameDetailsResult>(cacheKey, 10 * 60 * 1000); // 10분 캐시
    if (cached && cached.success) {
      console.log(`[gameDetailsService] [SUCCESS] Details cache hit! Key: "${cacheKey}"`);
      return cached;
    }
  }

  const nowStr = new Date().toISOString();

  // 1. 경기 일정만 가져옵니다. (includeDetails=false로 성능 확보 및 관심사 분리)
  const scheduleResult = await getTodayGamesData(dateStr, forceRefresh, false);

  if (!scheduleResult.success) {
    console.error(`[gameDetailsService] Schedule fetch failed: ${scheduleResult.error}`);
    return {
      success: false,
      date: dateStr,
      source: "MYKBO_UNOFFICIAL",
      details: [],
      error: "GAME_DETAILS_FETCH_FAILED",
      message: "경기 일정을 가져올 수 없어 세부 수집을 진행할 수 없습니다.",
      updatedAt: nowStr
    };
  }

  const games = scheduleResult.games || [];

  if (games.length === 0) {
    console.log(`[gameDetailsService] No games scheduled for "${dateStr}". Returning NO_GAMES_FOR_DETAILS`);
    return {
      success: false,
      date: dateStr,
      source: "MYKBO_UNOFFICIAL",
      details: [],
      error: "NO_GAMES_FOR_DETAILS",
      message: "해당 날짜에 예정된 경기가 없습니다.",
      updatedAt: nowStr
    };
  }

  // 2. 각 경기에 대해 Promise.allSettled 병렬 수집
  const detailsPromises = games.map(async (g) => {
    const detailUrl = g.sourceUrl || g.detailUrl || (g.source === 'MYKBO_UNOFFICIAL' ? g.sourceUrl : null);
    
    // 기본 플레이스홀더 구성
    const fallbackDetail: ParsedGameDetail = {
      awayStarter: null,
      homeStarter: null,
      missingData: ["선발투수 미발표"]
    };

    if (g.detailUrl) {
      try {
        const detailCacheKey = `kbo:game-detail:v2:${g.gameId}`;
        let detail = await getCache<ParsedGameDetail>(detailCacheKey, 10 * 60 * 1000);
        
        if (!detail || forceRefresh) {
          detail = await parseMyKboGameDetails(g.detailUrl, g.awayTeam, g.homeTeam);
          await setCache(detailCacheKey, detail);
        }
        return {
          gameId: g.gameId,
          awayTeam: g.awayTeam,
          homeTeam: g.homeTeam,
          ...detail
        };
      } catch (err: any) {
        console.warn(`[gameDetailsService] Failed parsing for game ${g.gameId}:`, err.message || err);
        return {
          gameId: g.gameId,
          awayTeam: g.awayTeam,
          homeTeam: g.homeTeam,
          awayStarter: null,
          homeStarter: null,
          missingData: ["선발투수 수집 실패"]
        };
      }
    } else {
      // 상세 수집 URL 자체가 제공되지 않은 경우, 데이터 소스 파싱 한계로 판단해 미발표 처리
      return {
        gameId: g.gameId,
        awayTeam: g.awayTeam,
        homeTeam: g.homeTeam,
        awayStarter: null,
        homeStarter: null,
        missingData: ["선발투수 미발표"]
      };
    }
  });

  const settledResults = await Promise.allSettled(detailsPromises);

  const detailsList = settledResults.map((res, index) => {
    const g = games[index];
    if (res.status === 'fulfilled') {
      return res.value;
    } else {
      // 심각한 비정상 거부 시의 비상 복구
      return {
        gameId: g.gameId,
        awayTeam: g.awayTeam,
        homeTeam: g.homeTeam,
        awayStarter: null,
        homeStarter: null,
        missingData: ["선발투수 수집 실패"]
      };
    }
  });

  const finalResponse: GameDetailsResult = {
    success: true,
    date: dateStr,
    source: "MYKBO_UNOFFICIAL",
    updatedAt: nowStr,
    details: detailsList
  };

  await setCache(cacheKey, finalResponse);
  console.log(`[gameDetailsService] [SUCCESS] Completed game details aggregation. Total: ${detailsList.length} games.`);
  return finalResponse;
}
