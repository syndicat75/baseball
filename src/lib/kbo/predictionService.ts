/**
 * @file predictionService.ts
 * @description 오늘 경기 일정, 실시간 순위표 및 선발투수 정보를 유기적으로 병합하여 경기별 승률예측을 수집/제공하는 서비스 모듈입니다.
 */

import { getTodayGamesData, getStandingsData, StandingsResult, TodayGamesResult } from './kboDataService';
import { getGameDetailsData, GameDetailsResult } from './gameDetailsService';
import { calculateGamePrediction, ModelInput } from './predictionModel';
import { getCache, setCache } from './cache';
import { GamePrediction, TeamStanding } from '../../types';

export interface PredictionsResult {
  success: boolean;
  date: string;
  modelVersion: string;
  updatedAt: string;
  predictions: GamePrediction[];
  error?: string;
  message?: string;
}

/**
 * @function getPredictionsData
 * @description 지정된 날짜의 KBO 경기별 승률 예측 목록을 구성하여 반환합니다.
 * @param {string} dateStr - 대상 날짜 (YYYY-MM-DD)
 * @param {boolean} [forceRefresh=false] - 캐시 무효화 및 강제 실시간 갱신 여부
 */
export async function getPredictionsData(dateStr: string, forceRefresh = false): Promise<PredictionsResult> {
  console.log(`[predictionService] [CALL] getPredictionsData - dateStr: "${dateStr}", forceRefresh: ${forceRefresh}`);
  const cacheKey = `kbo:predictions:v1:${dateStr}`;

  if (!forceRefresh) {
    const cached = await getCache<PredictionsResult>(cacheKey, 5 * 60 * 1000); // 기본 5분 캐시
    if (cached && cached.success) {
      console.log(`[predictionService] [SUCCESS] Predictions cache hit! Key: "${cacheKey}"`);
      return cached;
    }
  }

  const nowStr = new Date().toISOString();

  // 1. 경기 일정 가져오기
  const schedulePromise = getTodayGamesData(dateStr, forceRefresh, false);

  // 2. 순위표 데이터 가져오기
  const standingsPromise = getStandingsData(forceRefresh);

  // 3. 선발투수/경기상세 정보 가져오기 (이미 gameDetailsService에서 캐시 관리 및 병렬 파싱 수행함)
  const detailsPromise = getGameDetailsData(dateStr, forceRefresh);

  // 세 가지 소스 데이터를 병렬로 로드
  const [scheduleResult, standingsResult, detailsResult] = await Promise.all([
    schedulePromise,
    standingsPromise,
    detailsPromise
  ]);

  if (!scheduleResult.success) {
    console.error(`[predictionService] Schedule fetch failed for prediction. Error: ${scheduleResult.error}`);
    return {
      success: false,
      date: dateStr,
      modelVersion: "rule-based-v1",
      predictions: [],
      error: "SCHEDULE_FETCH_FAILED",
      message: "경기 일정을 불러올 수 없어 승률예측을 생성하지 못했습니다.",
      updatedAt: nowStr
    };
  }

  const games = scheduleResult.games || [];

  if (games.length === 0) {
    console.log(`[predictionService] No scheduled games on "${dateStr}". Returning empty predictions.`);
    return {
      success: true,
      date: dateStr,
      modelVersion: "rule-based-v1",
      predictions: [],
      updatedAt: nowStr
    };
  }

  // 순위표 캐스팅 및 맵 전환
  const standingsList: TeamStanding[] = (standingsResult.standings || []).map((s: any) => ({
    rank: s.rank,
    teamName: s.teamName, // 영문 대문자 코드 (예: "LG")
    games: s.games,
    wins: s.wins,
    losses: s.losses,
    draws: s.draws,
    winningPct: s.winningPct,
    gamesBehind: typeof s.gamesBehind === 'string' ? parseFloat(s.gamesBehind) || 0 : s.gamesBehind || 0,
    streak: s.streak,
    last10: s.last10 || "",
    battingAvg: s.battingAvg,
    era: s.era,
    runs: s.runs,
    runsAllowed: s.runsAllowed,
    updatedAt: s.updatedAt || nowStr
  }));

  const standingsMap = new Map<string, TeamStanding>();
  standingsList.forEach((s) => {
    standingsMap.set(s.teamName.toUpperCase(), s);
  });

  // 선발투수 상세 맵 구성
  const detailsList = detailsResult.details || [];
  const detailsMap = new Map<string, typeof detailsList[0]>();
  detailsList.forEach((d) => {
    detailsMap.set(d.gameId, d);
  });

  const teamNameKoMap: Record<string, string> = {
    "KIA": "KIA",
    "SAMSUNG": "삼성",
    "LG": "LG",
    "DOOSAN": "두산",
    "SSG": "SSG",
    "LOTTE": "롯데",
    "HANWHA": "한화",
    "KT": "KT",
    "NC": "NC",
    "KIWOOM": "키움"
  };

  // 4. 각 경기별 승률예측 생성
  const predictions: GamePrediction[] = games.map((g) => {
    const awayCode = g.awayTeam.toUpperCase();
    const homeCode = g.homeTeam.toUpperCase();
    
    const awayNameKo = teamNameKoMap[awayCode] || g.awayTeam;
    const homeNameKo = teamNameKoMap[homeCode] || g.homeTeam;

    const awayStanding = standingsMap.get(awayCode) || null;
    const homeStanding = standingsMap.get(homeCode) || null;

    const gameDetail = detailsMap.get(g.gameId) || null;
    const awayStarter = gameDetail ? gameDetail.awayStarter : null;
    const homeStarter = gameDetail ? gameDetail.homeStarter : null;

    // 경기 취소 또는 우천취소 판정
    const isPostponedOrCanceled = g.status === '우천취소' || g.status === '취소';

    const modelInput: ModelInput = {
      gameId: g.gameId,
      awayTeamCode: awayCode,
      awayTeamName: awayNameKo,
      homeTeamCode: homeCode,
      homeTeamName: homeNameKo,
      awayStanding,
      homeStanding,
      awayStarter,
      homeStarter,
      isPostponedOrCanceled
    };

    try {
      const pred = calculateGamePrediction(modelInput, standingsList);
      return {
        ...pred,
        calculatedAt: nowStr
      };
    } catch (err: any) {
      console.error(`[predictionService] Prediction computation crash for game ${g.gameId}:`, err);
      return {
        gameId: g.gameId,
        awayTeam: awayNameKo,
        homeTeam: homeNameKo,
        awayWinProbability: 50,
        homeWinProbability: 50,
        confidence: '낮음',
        summary: '승률 예측 모델 연산 중 예상치 못한 에러가 발생해 임시 중간값을 제공합니다.',
        factors: ['승률 연산 모듈에 기술적인 문제가 발생했습니다.'],
        missingData: ['시스템 계산 오류'],
        modelVersion: 'rule-based-v1',
        calculatedAt: nowStr
      };
    }
  });

  const finalResult: PredictionsResult = {
    success: true,
    date: dateStr,
    modelVersion: "rule-based-v1",
    updatedAt: nowStr,
    predictions
  };

  // 5. 캐싱 여부 결정 및 캐시 세팅
  const containsSynthetic = games.some((g: any) => g.synthetic || g.clearly_synthetic);
  const allPostponedOrPending = predictions.every(p => p.confidence === '예측 보류');

  // Synthetic 경기 또는 전부 "예측 보류"인 경우 캐시를 하지 않거나 아주 짧게 처리하여 실시간 데이터 유연성 제공
  if (!containsSynthetic && !allPostponedOrPending) {
    // 예정 또는 진행 중인 경기가 하나라도 있는 경우 -> 5분 TTL
    // 모든 경기가 끝났거나 취소인 경우 -> 30분 TTL
    const hasActiveGames = games.some((g: any) => g.status === '예정' || g.status === '진행중');
    const ttlMs = hasActiveGames ? 5 * 60 * 1000 : 30 * 60 * 1000;
    
    await setCache(cacheKey, finalResult);
    console.log(`[predictionService] [SUCCESS] Saved prediction aggregation to cache. TTL: ${ttlMs / 60000}m`);
  } else {
    console.log(`[predictionService] Skipping long-term cache due to: containsSynthetic=${containsSynthetic}, allPostponedOrPending=${allPostponedOrPending}`);
  }

  return finalResult;
}
