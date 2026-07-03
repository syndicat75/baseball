/**
 * @file predictionModel.ts
 * @description KBO 경기 승률 예측을 위한 규칙 기반(Rule-based-v1) 예측 알고리즘 모델입니다.
 */

import { TeamStanding, PitcherStats, GamePrediction } from '../../types';
import {
  normalizeHigherIsBetter,
  normalizeLowerIsBetter,
  calculatePythagoreanWinPct,
  clamp,
  roundProbabilityPair
} from './predictionUtils';

/**
 * @interface ModelInput
 * @description 예측 계산을 위해 필요한 단일 경기 데이터 세트입니다.
 */
export interface ModelInput {
  gameId: string;
  awayTeamCode: string;
  awayTeamName: string;
  homeTeamCode: string;
  homeTeamName: string;
  awayStanding: TeamStanding | null;
  homeStanding: TeamStanding | null;
  awayStarter: PitcherStats | null;
  homeStarter: PitcherStats | null;
  isPostponedOrCanceled: boolean;
}

/**
 * @function parseLast10WinPct
 * @description "6승4패" 같은 last10 문자열에서 최근 10경기 승률을 계산합니다.
 */
function parseLast10WinPct(last10Str?: string): number | null {
  if (!last10Str) return null;
  try {
    // "6승4패", "5승5패1무" 등에서 숫자 추출
    const match = last10Str.match(/(\d+)승\s*(\d+)패/);
    if (match) {
      const wins = parseInt(match[1], 10);
      const losses = parseInt(match[2], 10);
      const total = wins + losses;
      if (total > 0) {
        return wins / total;
      }
    }
  } catch (err) {
    console.warn(`[predictionModel] Failed to parse last10: "${last10Str}"`, err);
  }
  return null;
}

/**
 * @function calculateGamePrediction
 * @description 단일 KBO 경기에 대한 규칙 기반 승률 및 신뢰도, 근거 요인을 계산합니다.
 */
export function calculateGamePrediction(
  input: ModelInput,
  allStandings: TeamStanding[]
): GamePrediction {
  const {
    gameId,
    awayTeamName,
    homeTeamName,
    awayStanding,
    homeStanding,
    awayStarter,
    homeStarter,
    isPostponedOrCanceled
  } = input;

  const calculatedAtStr = new Date().toISOString();

  // 1. 경기 취소 또는 우천 취소인 경우 -> 예측 제외
  if (isPostponedOrCanceled) {
    return {
      gameId,
      awayTeam: awayTeamName,
      homeTeam: homeTeamName,
      awayWinProbability: 0,
      homeWinProbability: 0,
      confidence: '예측 보류',
      summary: '경기 취소/우천취소로 인해 승률예측 대상에서 제외되었습니다.',
      factors: ['경기 일정이 취소되었거나 우천 취소 상태입니다.'],
      missingData: [],
      modelVersion: 'rule-based-v1',
      calculatedAt: calculatedAtStr
    };
  }

  // 2. 중요 데이터 부재로 예측 보류 처리해야 하는 경우
  const missingData: string[] = [];
  const factors: string[] = [];

  if (!awayStanding || !homeStanding) {
    if (!awayStanding) missingData.push(`${awayTeamName} 순위표 데이터 부재`);
    if (!homeStanding) missingData.push(`${homeTeamName} 순위표 데이터 부재`);
    return {
      gameId,
      awayTeam: awayTeamName,
      homeTeam: homeTeamName,
      awayWinProbability: 50,
      homeWinProbability: 50,
      confidence: '예측 보류',
      summary: '팀 순위 데이터가 없거나 팀명 매칭에 실패하여 승률예측을 보류합니다.',
      factors: ['팀의 시즌 성적(순위표) 데이터를 불러올 수 없습니다.'],
      missingData,
      modelVersion: 'rule-based-v1',
      calculatedAt: calculatedAtStr
    };
  }

  // 리그 전체 Standings min/max 계산 (정규화용)
  const allEras = allStandings.map(s => s.era).filter(val => typeof val === 'number');
  const allRunDiffs = allStandings.map(s => s.runs - s.runsAllowed);

  const eraMin = allEras.length > 0 ? Math.min(...allEras) : 3.0;
  const eraMax = allEras.length > 0 ? Math.max(...allEras) : 6.5;

  const rdMin = allRunDiffs.length > 0 ? Math.min(...allRunDiffs) : -150;
  const rdMax = allRunDiffs.length > 0 ? Math.max(...allRunDiffs) : 150;

  // ==========================================
  // A. 팀 기본 전력 점수 계산 (teamBaseScore)
  // ==========================================
  const calcTeamBaseScore = (standing: TeamStanding): { score: number; pyth: number } => {
    const seasonWinPct = standing.winningPct || 0.5;
    const pythWinPct = calculatePythagoreanWinPct(standing.runs || 0, standing.runsAllowed || 0);
    const runDiff = (standing.runs || 0) - (standing.runsAllowed || 0);
    
    const normalizedRunDiff = normalizeHigherIsBetter(runDiff, rdMin, rdMax);
    const normalizedInverseTeamEra = normalizeLowerIsBetter(standing.era || 4.5, eraMin, eraMax);

    const score = (
      seasonWinPct * 0.45 +
      pythWinPct * 0.30 +
      normalizedRunDiff * 0.15 +
      normalizedInverseTeamEra * 0.10
    );

    return { score, pyth: pythWinPct };
  };

  const awayBaseRes = calcTeamBaseScore(awayStanding);
  const homeBaseRes = calcTeamBaseScore(homeStanding);

  const awayBaseScore = awayBaseRes.score;
  const homeBaseScore = homeBaseRes.score;

  // factors 추가
  if (awayStanding.winningPct > homeStanding.winningPct) {
    factors.push(`${awayTeamName}이(가) 시즌 승률(${awayStanding.winningPct.toFixed(3)})에서 우위입니다.`);
  } else if (homeStanding.winningPct > awayStanding.winningPct) {
    factors.push(`${homeTeamName}이(가) 시즌 승률(${homeStanding.winningPct.toFixed(3)})에서 우위입니다.`);
  }

  if (awayStanding.era < homeStanding.era) {
    factors.push(`${awayTeamName}이(가) 팀 평균자책점(${awayStanding.era.toFixed(2)})에서 우세합니다.`);
  } else if (homeStanding.era < awayStanding.era) {
    factors.push(`${homeTeamName}이(가) 팀 평균자책점(${homeStanding.era.toFixed(2)})에서 우세합니다.`);
  }

  // ==========================================
  // B. 선발투수 점수 계산 (pitcherScore)
  // ==========================================
  const calcPitcherScore = (starter: PitcherStats | null, isAway: boolean): number => {
    if (!starter) {
      return 0.5; // 정보 부재 시 중간값 부여
    }

    // 선발투수 정규화를 위한 표준 한계치 설정 (Standard bounds)
    const pEraMin = 1.8;
    const pEraMax = 7.5;
    const pWhipMin = 0.9;
    const pWhipMax = 2.1;
    const pInningsMin = 10;
    const pInningsMax = 180;

    let totalWeight = 0;
    let weightedScore = 0;

    // 1. 시즌 ERA (원래 가중치 0.50)
    if (starter.era !== null && starter.era !== undefined && starter.era > 0) {
      const normEra = normalizeLowerIsBetter(starter.era, pEraMin, pEraMax);
      weightedScore += normEra * 0.50;
      totalWeight += 0.50;
    }

    // 2. 시즌 승률 (원래 가중치 0.30)
    if (starter.winningPct !== null && starter.winningPct !== undefined) {
      weightedScore += starter.winningPct * 0.30;
      totalWeight += 0.30;
    } else if (starter.wins !== undefined && starter.losses !== undefined) {
      const totalDecisions = starter.wins + starter.losses;
      const winRate = totalDecisions > 0 ? starter.wins / totalDecisions : 0.5;
      weightedScore += winRate * 0.30;
      totalWeight += 0.30;
    }

    // 3. WHIP (원래 가중치 0.10)
    if (starter.whip !== null && starter.whip !== undefined && starter.whip > 0) {
      const normWhip = normalizeLowerIsBetter(starter.whip, pWhipMin, pWhipMax);
      weightedScore += normWhip * 0.10;
      totalWeight += 0.10;
    }

    // 4. 이닝 수 (원래 가중치 0.10)
    if (starter.innings !== null && starter.innings !== undefined && starter.innings > 0) {
      const normInnings = normalizeHigherIsBetter(starter.innings, pInningsMin, pInningsMax);
      weightedScore += normInnings * 0.10;
      totalWeight += 0.10;
    }

    if (totalWeight === 0) {
      return 0.5;
    }

    return weightedScore / totalWeight; // 가중치 재분배 반영
  };

  const awayPitcherScore = calcPitcherScore(awayStarter, true);
  const homePitcherScore = calcPitcherScore(homeStarter, false);

  if (!awayStarter || !homeStarter) {
    missingData.push("선발투수 정보 부족");
    if (!awayStarter) factors.push(`${awayTeamName} 선발투수 세부 정보가 부족하여 팀 성적으로 대체 계산합니다.`);
    if (!homeStarter) factors.push(`${homeTeamName} 선발투수 세부 정보가 부족하여 팀 성적으로 대체 계산합니다.`);
  } else {
    if (awayStarter.era < homeStarter.era) {
      factors.push(`${awayTeamName} 선발 ${awayStarter.name}(ERA ${awayStarter.era.toFixed(2)})이 상대 선발(ERA ${homeStarter.era.toFixed(2)}) 대비 지표상 우위입니다.`);
    } else if (homeStarter.era < awayStarter.era) {
      factors.push(`${homeTeamName} 선발 ${homeStarter.name}(ERA ${homeStarter.era.toFixed(2)})이 상대 선발(ERA ${awayStarter.era.toFixed(2)}) 대비 지표상 우위입니다.`);
    }
  }

  // ==========================================
  // C. Elo 간이 점수 계산 (eloProbability)
  // ==========================================
  const awayElo = 1500 + ((awayStanding.winningPct - 0.5) * 400);
  const homeElo = 1500 + ((homeStanding.winningPct - 0.5) * 400) + 25; // 홈 어드밴티지 +25 Elo 보정

  const awayEloProb = 1 / (1 + Math.pow(10, (homeElo - awayElo) / 400));
  const homeEloProb = 1 - awayEloProb;

  // ==========================================
  // D. 홈 어드밴티지 보정 (homeAdvantage)
  // ==========================================
  const homeAdvantage = 0.025;

  // ==========================================
  // E. 최근 흐름 및 불펜 대체 점수 계산 (recent, bullpen)
  // ==========================================
  // 최근 10경기 흐름
  const awayLast10WinPct = parseLast10WinPct(awayStanding.last10);
  const homeLast10WinPct = parseLast10WinPct(homeStanding.last10);

  let awayRecentScore = awayStanding.winningPct;
  let homeRecentScore = homeStanding.winningPct;

  if (awayLast10WinPct === null || homeLast10WinPct === null) {
    missingData.push("최근 흐름 데이터 부족");
    factors.push("양 팀의 최근 10경기 세부 흐름 데이터가 부족하여 시즌 승률로 대체 적용했습니다.");
  } else {
    awayRecentScore = awayLast10WinPct;
    homeRecentScore = homeLast10WinPct;
    if (awayLast10WinPct > homeLast10WinPct) {
      factors.push(`${awayTeamName}이(가) 최근 10경기 승률(${awayStanding.last10})에서 흐름이 더 좋습니다.`);
    } else if (homeLast10WinPct > awayLast10WinPct) {
      factors.push(`${homeTeamName}이(가) 최근 10경기 승률(${homeStanding.last10})에서 흐름이 더 좋습니다.`);
    }
  }

  // 불펜 ERA (순위표에 따로 없으므로 팀전체 ERA로 대체 적용 및 factors 기록)
  const awayBullpenScore = normalizeLowerIsBetter(awayStanding.era || 4.5, eraMin, eraMax);
  const homeBullpenScore = normalizeLowerIsBetter(homeStanding.era || 4.5, eraMin, eraMax);

  // ==========================================
  // 최종 점수 가중치 병합
  // ==========================================
  // teamBaseScore * 0.35 + pitcherScore * 0.30 + eloProbability * 0.20 + recentOrFallbackScore * 0.10 + bullpenOrTeamEraScore * 0.05
  const awayRawScore = (
    awayBaseScore * 0.35 +
    awayPitcherScore * 0.30 +
    awayEloProb * 0.20 +
    awayRecentScore * 0.10 +
    awayBullpenScore * 0.05
  );

  const homeRawScore = (
    homeBaseScore * 0.35 +
    homePitcherScore * 0.30 +
    homeEloProb * 0.20 +
    homeRecentScore * 0.10 +
    homeBullpenScore * 0.05
  ) + homeAdvantage; // 홈 어드밴티지 가산

  factors.push(`홈팀 ${homeTeamName}에 소폭의 홈 구장 어드밴티지(+2.5%)를 부여했습니다.`);

  // ==========================================
  // F. 최종 승률 정규화 (Normalization)
  // ==========================================
  const totalRaw = awayRawScore + homeRawScore;
  const awayProb = totalRaw > 0 ? awayRawScore / totalRaw : 0.5;
  const homeProb = totalRaw > 0 ? homeRawScore / totalRaw : 0.5;

  const { awayWinProbability, homeWinProbability } = roundProbabilityPair(awayProb, homeProb);

  // ==========================================
  // G. 신뢰도 계산 (Confidence)
  // ==========================================
  let confidence: '낮음' | '보통' | '높음' | '예측 보류' = '높음';

  const hasBothStarters = awayStarter && homeStarter;
  const hasStandingsData = awayStanding && homeStanding;
  const hasRecentData = awayLast10WinPct !== null && homeLast10WinPct !== null;

  if (!hasStandingsData) {
    confidence = '예측 보류';
  } else if (!hasBothStarters || !hasRecentData) {
    if (!hasBothStarters && !hasRecentData) {
      confidence = '낮음';
    } else {
      confidence = '보통';
    }
  }

  // ==========================================
  // H. 요약 설명 생성 (Summary)
  // ==========================================
  let summary = '';
  if (awayWinProbability > homeWinProbability) {
    summary = `${awayTeamName}이(가) ${awayWinProbability}%의 확률로 우세할 것으로 예측됩니다. `;
    if (confidence === '높음') {
      summary += `시즌 승률과 선발 매치업, 최근 팀 흐름 모두에서 ${awayTeamName}의 지표 우위가 고르게 작용하고 있어 예측 신뢰도는 높음입니다.`;
    } else if (confidence === '보통') {
      summary += `시즌 전반의 성적 지표는 ${awayTeamName}이 우세하지만, 일부 선발 혹은 최근 흐름 데이터의 부재로 인해 신뢰도는 보통 수준입니다.`;
    } else {
      summary += `데이터가 제한적이지만 기본 팀 역량에 기반해 ${awayTeamName} 우세로 계산되었습니다. 선발투수 미발표 등으로 신뢰도는 낮음입니다.`;
    }
  } else {
    summary = `${homeTeamName}이(가) ${homeWinProbability}%의 확률로 우세할 것으로 예측됩니다. `;
    if (confidence === '높음') {
      summary += `홈 경기 이점과 함께 선발 투수 지표 및 전반적인 팀 전력 우세가 예상되어 높은 신뢰도를 보입니다.`;
    } else if (confidence === '보통') {
      summary += `홈 어드밴티지와 팀 기본 지표 상 ${homeTeamName}의 소폭 우세가 점쳐지나, 선발 매치업 변수 등으로 신뢰도는 보통입니다.`;
    } else {
      summary += `기본 팀 전력과 홈 경기 보정에 의해 ${homeTeamName} 우세로 계산되었으나, 선발 투수 데이터 등 주요 세부 정보 부족으로 신뢰도는 낮음입니다.`;
    }
  }

  return {
    gameId,
    awayTeam: awayTeamName,
    homeTeam: homeTeamName,
    awayWinProbability,
    homeWinProbability,
    confidence,
    summary,
    factors: Array.from(new Set(factors)), // 중복 방지
    missingData,
    modelVersion: 'rule-based-v1',
    calculatedAt: calculatedAtStr
  };
}
