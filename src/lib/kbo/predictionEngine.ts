/**
 * @file predictionEngine.ts
 * @description KBO 리그 당일 경기 승률 예측 알고리즘 및 규칙 기반 산출 엔진입니다.
 * 팀 기본 전력, 최근 흐름, 선발투수, 타선, 불펜, Elo Rating 및 홈 어드밴티지를 반영하여 정밀하게 승률을 예측합니다.
 * 본 엔진은 모든 핵심 함수에 docstring을 포함하고 호출 시마다 상세 로그를 출력합니다.
 */

import { KBOGame, TeamStanding, GamePrediction, PitcherStats, BatterLineup } from '../../types';
import { KBO_TEAM_PROFILES } from '../../kboConfig';
import { CONFIG } from '../../config';

/**
 * @function getKoreaToday
 * @description 한국 표준시(KST, UTC+9) 기준의 오늘 날짜를 "YYYY-MM-DD" 문자열로 반환하는 유틸리티 함수입니다.
 * 자정이 지나면 자동으로 변경되도록 오프셋을 계산합니다.
 * @returns {string} KST 기준 YYYY-MM-DD 날짜 문자열
 */
export function getKoreaToday(): string {
  console.log('[predictionEngine] [CALL] getKoreaToday - Calculating KST Date.');
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(utc + kstOffset);
  const yyyy = kstDate.getFullYear();
  const mm = String(kstDate.getMonth() + 1).padStart(2, '0');
  const dd = String(kstDate.getDate()).padStart(2, '0');
  const result = `${yyyy}-${mm}-${dd}`;
  console.log(`[predictionEngine] [RESULT] getKoreaToday: ${result}`);
  return result;
}

/**
 * @function normalizeHigherIsBetter
 * @description 값이 클수록 좋은 지표를 0에서 1 사이의 값으로 정규화합니다.
 * @param {number} value 정규화할 원본 값
 * @param {number} min 최소 기준선
 * @param {number} max 최대 기준선
 * @returns {number} 0 ~ 1 범위 내 정규화 점수
 */
export function normalizeHigherIsBetter(value: number, min: number, max: number): number {
  console.log(`[predictionEngine] [CALL] normalizeHigherIsBetter - value: ${value}, min: ${min}, max: ${max}`);
  if (max === min) return 0.5;
  const normalized = (value - min) / (max - min);
  const result = Math.max(0, Math.min(1, normalized));
  console.log(`[predictionEngine] [RESULT] normalizeHigherIsBetter: ${result}`);
  return result;
}

/**
 * @function normalizeLowerIsBetter
 * @description 값이 작을수록 좋은 지표(예: ERA, WHIP 등)를 0에서 1 사이의 값으로 정규화합니다.
 * @param {number} value 정규화할 원본 값
 * @param {number} min 최소 기준선 (가장 좋은 성적)
 * @param {number} max 최대 기준선 (가장 저조한 성적)
 * @returns {number} 0 ~ 1 범위 내 정규화 점수
 */
export function normalizeLowerIsBetter(value: number, min: number, max: number): number {
  console.log(`[predictionEngine] [CALL] normalizeLowerIsBetter - value: ${value}, min: ${min}, max: ${max}`);
  if (max === min) return 0.5;
  const normalized = (max - value) / (max - min);
  const result = Math.max(0, Math.min(1, normalized));
  console.log(`[predictionEngine] [RESULT] normalizeLowerIsBetter: ${result}`);
  return result;
}

/**
 * @function calculatePythagoreanWinPct
 * @description 구단의 득점과 실점을 바탕으로 피타고리안 승률을 산출합니다.
 * 승률 = runs^1.83 / (runs^1.83 + runsAllowed^1.83)
 * @param {number} runs 시즌 총 득점
 * @param {number} runsAllowed 시즌 총 실점
 * @returns {number} 피타고리안 기대 승률
 */
export function calculatePythagoreanWinPct(runs: number, runsAllowed: number): number {
  console.log(`[predictionEngine] [CALL] calculatePythagoreanWinPct - runs: ${runs}, runsAllowed: ${runsAllowed}`);
  if (runs <= 0 && runsAllowed <= 0) return 0.5;
  try {
    const runsPow = Math.pow(runs, 1.83);
    const runsAllowedPow = Math.pow(runsAllowed, 1.83);
    const sum = runsPow + runsAllowedPow;
    const pct = sum > 0 ? runsPow / sum : 0.5;
    console.log(`[predictionEngine] [RESULT] calculatePythagoreanWinPct: ${pct.toFixed(4)}`);
    return pct;
  } catch (err) {
    console.error('[predictionEngine] calculatePythagoreanWinPct error:', err);
    return 0.5;
  }
}

/**
 * @function calculateTemporaryElo
 * @description 구단의 시즌 승률을 기반으로 간이 Elo 레이팅을 산출합니다.
 * teamElo = 1500 + ((seasonWinPct - 0.5) * 400)
 * @param {number} seasonWinPct 시즌 승률
 * @returns {number} 간이 Elo 레이팅
 */
export function calculateTemporaryElo(seasonWinPct: number): number {
  console.log(`[predictionEngine] [CALL] calculateTemporaryElo - seasonWinPct: ${seasonWinPct}`);
  const elo = 1500 + ((seasonWinPct - 0.5) * 400);
  console.log(`[predictionEngine] [RESULT] calculateTemporaryElo: ${elo}`);
  return elo;
}

/**
 * @function calculateEloProbability
 * @description 양 팀의 Elo 레이팅을 기반으로 Elo 기대 승률을 계산합니다.
 * eloProb = 1 / (1 + 10^((opponentElo - teamElo) / 400))
 * @param {number} teamElo 자팀 Elo 레이팅
 * @param {number} opponentElo 상대팀 Elo 레이팅
 * @returns {number} Elo 기반 승리 확률 (0 ~ 1)
 */
export function calculateEloProbability(teamElo: number, opponentElo: number): number {
  console.log(`[predictionEngine] [CALL] calculateEloProbability - teamElo: ${teamElo}, opponentElo: ${opponentElo}`);
  try {
    const exponent = (opponentElo - teamElo) / 400;
    const prob = 1 / (1 + Math.pow(10, exponent));
    console.log(`[predictionEngine] [RESULT] calculateEloProbability: ${prob.toFixed(4)}`);
    return prob;
  } catch (err) {
    console.error('[predictionEngine] calculateEloProbability error:', err);
    return 0.5;
  }
}

/**
 * @function calculatePitcherScore
 * @description 선발투수의 세부 스탯(ERA, WHIP, 승률, 이닝, 최근 3경기 ERA)을 종합하여 투수 평점을 산출합니다.
 * pitcherScore = InverseERA*0.40 + InverseWHIP*0.25 + WinPct*0.20 + Innings*0.15
 * @param {PitcherStats} [pitcher] 선발투수 스탯 정보
 * @returns {number} 0 ~ 1 범위 내 투수 최종 점수
 */
export function calculatePitcherScore(pitcher?: PitcherStats): number {
  console.log(`[predictionEngine] [CALL] calculatePitcherScore - pitcher: ${pitcher?.name || 'Undefined'}`);
  if (!pitcher) {
    console.log('[predictionEngine] [RESULT] calculatePitcherScore - No pitcher provided, defaulting to 0.5');
    return 0.5;
  }

  const era = pitcher.recentEra !== undefined ? pitcher.recentEra : (pitcher.era ?? 4.5);
  const whip = pitcher.whip ?? 1.35;
  const winPct = pitcher.winningPct ?? 0.5;
  const innings = pitcher.innings ?? 100;

  // 정규화 경계선 설정 (KBO 리그 투수 기준치)
  // ERA: 최상 2.00, 최하 7.00
  // WHIP: 최상 1.00, 최하 1.80
  // 이닝: 최상 180, 최하 40
  const normEra = normalizeLowerIsBetter(era, 2.0, 7.0);
  const normWhip = normalizeLowerIsBetter(whip, 1.0, 1.8);
  const normInnings = normalizeHigherIsBetter(innings, 40, 180);

  const pitcherScore = (normEra * 0.40) + (normWhip * 0.25) + (winPct * 0.20) + (normInnings * 0.15);
  console.log(`[predictionEngine] [RESULT] calculatePitcherScore for ${pitcher.name}: ${pitcherScore.toFixed(4)}`);
  return pitcherScore;
}

/**
 * @function calculateLineupScore
 * @description 타자 라인업의 OPS 지표 또는 구단 기본 OPS/타율 지표를 바탕으로 타선 평점을 산출합니다.
 * @param {BatterLineup[]} [lineup] 경기 선발 라인업 리스트
 * @param {number} [teamOps] 구단 전체 OPS
 * @param {number} [teamAvg] 구단 전체 타율
 * @returns {number} 0 ~ 1 범위 내 타선 점수
 */
export function calculateLineupScore(lineup?: BatterLineup[], teamOps?: number, teamAvg?: number): number {
  console.log('[predictionEngine] [CALL] calculateLineupScore');
  
  // 1순위: 확정/예상 라인업 선수들의 평균 OPS
  if (lineup && lineup.length > 0) {
    let sumOps = 0;
    let count = 0;
    lineup.forEach(b => {
      if (b.ops !== undefined && b.ops > 0) {
        sumOps += b.ops;
        count++;
      }
    });
    if (count > 0) {
      const avgLineupOps = sumOps / count;
      // OPS 0.500 ~ 1.000 정규화
      const score = normalizeHigherIsBetter(avgLineupOps, 0.500, 1.000);
      console.log(`[predictionEngine] [RESULT] calculateLineupScore (Lineup Avg OPS: ${avgLineupOps.toFixed(3)}) => ${score.toFixed(4)}`);
      return score;
    }
  }

  // 2순위: 팀 OPS
  if (teamOps !== undefined && teamOps > 0) {
    const score = normalizeHigherIsBetter(teamOps, 0.600, 0.900);
    console.log(`[predictionEngine] [RESULT] calculateLineupScore (Team OPS: ${teamOps.toFixed(3)}) => ${score.toFixed(4)}`);
    return score;
  }

  // 3순위: 팀 타율
  if (teamAvg !== undefined && teamAvg > 0) {
    const score = normalizeHigherIsBetter(teamAvg, 0.220, 0.310);
    console.log(`[predictionEngine] [RESULT] calculateLineupScore (Team BA: ${teamAvg.toFixed(3)}) => ${score.toFixed(4)}`);
    return score;
  }

  // 4순위: 시즌 평균값 0.5
  console.log('[predictionEngine] [RESULT] calculateLineupScore - No data available, defaulting to 0.5');
  return 0.5;
}

/**
 * @function calculateBullpenScore
 * @description 구단 불펜 투수진의 평균자책점(Bullpen ERA) 또는 구단 평균자책점을 바탕으로 불펜 평점을 산출합니다.
 * @param {number} [bullpenEra] 불펜 전용 평균자책점
 * @param {number} [teamEra] 구단 전체 평균자책점
 * @returns {number} 0 ~ 1 범위 내 불펜 최종 점수
 */
export function calculateBullpenScore(bullpenEra?: number, teamEra?: number): number {
  console.log(`[predictionEngine] [CALL] calculateBullpenScore - bullpenEra: ${bullpenEra}, teamEra: ${teamEra}`);
  
  // TODO: 전날 투구 수 소모 데이터 기반 불펜 부하 가속 보정 기능 추후 릴리즈 시 개발 반영 예정
  
  const eraToUse = bullpenEra !== undefined ? bullpenEra : (teamEra !== undefined ? teamEra : 4.5);
  // ERA 2.50 ~ 6.50 정규화 (낮을수록 좋음)
  const score = normalizeLowerIsBetter(eraToUse, 2.50, 6.50);
  console.log(`[predictionEngine] [RESULT] calculateBullpenScore: ${score.toFixed(4)}`);
  return score;
}

/**
 * @function calculatePredictionConfidence
 * @description 데이터의 충실도와 가용 상태에 따라 최종 예측 결과의 신뢰도를 판별합니다.
 * @param {boolean} hasPitchers 선발투수 정보 존재 여부
 * @param {boolean} hasLineups 라인업 정보 존재 여부
 * @param {boolean} hasStandings 순위표 지표 존재 여부
 * @param {number} probabilityDifference 양 팀 승률 점수차
 * @returns {'높음' | '보통' | '낮음' | '예측 보류'} 예측 신뢰도 단계
 */
export function calculatePredictionConfidence(
  hasPitchers: boolean,
  hasLineups: boolean,
  hasStandings: boolean,
  probabilityDifference: number
): '높음' | '보통' | '낮음' | '예측 보류' {
  console.log(`[predictionEngine] [CALL] calculatePredictionConfidence - Pitcher: ${hasPitchers}, Lineup: ${hasLineups}, Standings: ${hasStandings}, ProbDiff: ${probabilityDifference}`);
  
  if (!hasStandings) {
    console.log('[predictionEngine] [RESULT] calculatePredictionConfidence - Missing standings, return 예측 보류');
    return '예측 보류';
  }

  if (!hasPitchers) {
    console.log('[predictionEngine] [RESULT] calculatePredictionConfidence - Missing pitchers, return 낮음');
    return '낮음';
  }

  if (hasPitchers && hasLineups && hasStandings) {
    if (probabilityDifference >= 12) {
      console.log('[predictionEngine] [RESULT] calculatePredictionConfidence - All data exists and high probability difference, return 높음');
      return '높음';
    }
    console.log('[predictionEngine] [RESULT] calculatePredictionConfidence - All data exists, return 보통');
    return '보통';
  }

  console.log('[predictionEngine] [RESULT] calculatePredictionConfidence - Partial missing data, return 보통');
  return '보통';
}

/**
 * @function generatePredictionFactors
 * @description 가산/감산 및 지표 우위 비교를 통해 사람이 가독할 수 있는 분석적 판단 근거 리스트를 동적으로 조립해 줍니다.
 * @returns {string[]} 주요 경기 영향 분석 요인 문자열 목록
 */
export function generatePredictionFactors(
  awayTeam: string,
  homeTeam: string,
  awayBaseScore: number,
  homeBaseScore: number,
  awayLast10WinPct: number,
  homeLast10WinPct: number,
  awayPitcherScore: number,
  homePitcherScore: number,
  awayLineupScore: number,
  homeLineupScore: number,
  awayBullpenScore: number,
  homeBullpenScore: number,
  hasLineups: boolean,
  hasPitchers: boolean
): string[] {
  console.log(`[predictionEngine] [CALL] generatePredictionFactors for ${awayTeam} vs ${homeTeam}`);
  const factors: string[] = [];
  const awayName = CONFIG.TEAMS[awayTeam]?.nameKo || awayTeam;
  const homeName = CONFIG.TEAMS[homeTeam]?.nameKo || homeTeam;

  // 1. 홈팀 그라운드 이점
  factors.push(`${homeName} 구장의 홈 어드밴티지 및 관중 응원 버프 효과 반영 (+3% 가산)`);

  // 2. 기본 전력 비교
  if (Math.abs(awayBaseScore - homeBaseScore) >= 0.05) {
    if (awayBaseScore > homeBaseScore) {
      factors.push(`${awayName}은(는) 시즌 승률 및 피타고리안 득실차 전력 지표에서 우위에 있습니다.`);
    } else {
      factors.push(`${homeName}은(는) 시즌 승률 및 피타고리안 득실차 전력 지표에서 우위에 있습니다.`);
    }
  } else {
    factors.push('시즌 승률과 피타고리안 기대승률 기준 양 팀의 전력 수준은 호각지세입니다.');
  }

  // 3. 최근 흐름 비교
  if (Math.abs(awayLast10WinPct - homeLast10WinPct) >= 0.1) {
    if (awayLast10WinPct > homeLast10WinPct) {
      factors.push(`최근 10경기 흐름은 ${awayName}이(가) 승률 ${Math.round(awayLast10WinPct * 100)}%로 확실히 상승세입니다.`);
    } else {
      factors.push(`최근 10경기 흐름은 ${homeName}이(가) 승률 ${Math.round(homeLast10WinPct * 100)}%로 확실히 상승세입니다.`);
    }
  } else {
    factors.push('양 팀 최근 10경기 전적 및 분위기는 매우 팽팽하게 조율되어 있습니다.');
  }

  // 4. 선발투수 비교
  if (hasPitchers) {
    if (Math.abs(awayPitcherScore - homePitcherScore) >= 0.08) {
      if (awayPitcherScore > homePitcherScore) {
        factors.push(`${awayName}의 선발투수가 ERA 및 이닝 소화력 성향에서 상대적으로 안정적입니다.`);
      } else {
        factors.push(`${homeName}의 선발투수가 ERA 및 이닝 소화력 성향에서 상대적으로 안정적입니다.`);
      }
    } else {
      factors.push('선발 투수 매치업은 양 선수의 시즌 누적 클래스와 탈삼진 수치 상 비등비등합니다.');
    }
  } else {
    factors.push('당일 매치업 공식 선발 투수가 아직 공시되지 않아 구단 평균 지표가 투영되었습니다.');
  }

  // 5. 타선 라인업 상태
  if (!hasLineups) {
    factors.push('타선 평가는 라인업 미발표 상태이므로, 구단의 시즌 평균 OPS 누적값으로 대체 평가되었습니다.');
  } else {
    if (Math.abs(awayLineupScore - homeLineupScore) >= 0.05) {
      if (awayLineupScore > homeLineupScore) {
        factors.push(`${awayName}의 당일 라인업 평균 OPS 타격 화력이 더 위협적입니다.`);
      } else {
        factors.push(`${homeName}의 당일 라인업 평균 OPS 타격 화력이 더 위협적입니다.`);
      }
    }
  }

  console.log(`[predictionEngine] [RESULT] generatePredictionFactors: ${factors.length} factors created.`);
  return factors.slice(0, 4); // 최대 4개 노출
}

/**
 * @function calculateLast10Wins
 * @description 해당 구단의 최근 10경기 전적 중 승수를 계산합니다.
 * @param {string} team 구단 식별 코드 (예: "LG")
 * @param {KBOGame[]} completedGames 지금까지 완료된 모든 경기 목록
 * @returns {number} 최근 10경기 중 승리한 횟수
 */
export function calculateLast10Wins(team: string, completedGames: KBOGame[]): number {
  console.log(`[predictionEngine] [CALL] calculateLast10Wins - Team: ${team}`);
  const teamGames = completedGames
    .filter(g => g.away === team || g.home === team)
    .sort((a, b) => b.date.localeCompare(a.date)); // 최신순 정렬

  const last10 = teamGames.slice(0, 10);
  if (last10.length === 0) return 5; // 경기 이력이 없을 경우 기본 50% 승률

  let wins = 0;
  last10.forEach(g => {
    const isAway = g.away === team;
    const awayScore = g.awayScore ?? 0;
    const homeScore = g.homeScore ?? 0;

    if (isAway && awayScore > homeScore) wins++;
    if (!isAway && homeScore > awayScore) wins++;
  });

  return wins;
}

/**
 * @function calculateGamePrediction
 * @description 양 팀의 세부 스탯 및 가중치를 비교 분석하여 경기 예측 정보(승률, 신뢰도, 강점 요인, 누락 사유)를 반환합니다.
 * @param {string} awayTeam 원정 팀 코드 (예: "LG")
 * @param {string} homeTeam 홈 팀 코드 (예: "SAMSUNG")
 * @param {string} stadium 구장 명칭 (예: "잠실")
 * @param {TeamStanding[]} standings 현재 팀 전체 순위 리스트
 * @param {KBOGame[]} completedGames 완료된 경기 리스트
 * @param {PitcherStats} [awayStarter] 원정 선발투수 정보
 * @param {PitcherStats} [homeStarter] 홈 선발투수 정보
 * @param {BatterLineup[]} [awayLineup] 원정 라인업 정보
 * @param {BatterLineup[]} [homeLineup] 홈 라인업 정보
 * @returns {GamePrediction} 최종 승률 예측 객체
 */
export function calculateGamePrediction(
  awayTeam: string,
  homeTeam: string,
  stadium: string,
  standings: TeamStanding[],
  completedGames: KBOGame[],
  awayStarter?: PitcherStats,
  homeStarter?: PitcherStats,
  awayLineup?: BatterLineup[],
  homeLineup?: BatterLineup[]
): GamePrediction {
  console.log(`[predictionEngine] [CALL] calculateGamePrediction - ${awayTeam} vs ${homeTeam} at ${stadium}`);

  const awayStand = standings.find(s => s.teamName === awayTeam);
  const homeStand = standings.find(s => s.teamName === homeTeam);

  const awayProfile = KBO_TEAM_PROFILES[awayTeam];
  const homeProfile = KBO_TEAM_PROFILES[homeTeam];

  const missingData: string[] = [];

  // A. 팀 기본 전력 점수 (가중치 25%)
  const awaySeasonWinPct = awayStand ? (awayStand.winningPct || 0.5) : 0.5;
  const homeSeasonWinPct = homeStand ? (homeStand.winningPct || 0.5) : 0.5;

  const awayRuns = awayStand ? (awayStand.runs || 500) : 500;
  const awayRunsAllowed = awayStand ? (awayStand.runsAllowed || 500) : 500;
  const homeRuns = homeStand ? (homeStand.runs || 500) : 500;
  const homeRunsAllowed = homeStand ? (homeStand.runsAllowed || 500) : 500;

  const awayPythagorean = calculatePythagoreanWinPct(awayRuns, awayRunsAllowed);
  const homePythagorean = calculatePythagoreanWinPct(homeRuns, homeRunsAllowed);

  // 득실차 정규화 (-150 ~ +150 범위를 0 ~ 1로 정규화)
  const awayRunDiff = awayRuns - awayRunsAllowed;
  const homeRunDiff = homeRuns - homeRunsAllowed;
  const normalizedAwayRunDiff = normalizeHigherIsBetter(awayRunDiff, -150, 150);
  const normalizedHomeRunDiff = normalizeHigherIsBetter(homeRunDiff, -150, 150);

  const awayBaseScore = (awaySeasonWinPct * 0.55) + (awayPythagorean * 0.35) + (normalizedAwayRunDiff * 0.10);
  const homeBaseScore = (homeSeasonWinPct * 0.55) + (homePythagorean * 0.35) + (normalizedHomeRunDiff * 0.10);

  // B. 최근 흐름 점수 (가중치 15%)
  let awayLast10WinPct = awaySeasonWinPct;
  let homeLast10WinPct = homeSeasonWinPct;
  let hasLast10 = false;

  if (completedGames && completedGames.length > 0) {
    const awayLast10Wins = calculateLast10Wins(awayTeam, completedGames);
    const homeLast10Wins = calculateLast10Wins(homeTeam, completedGames);
    awayLast10WinPct = awayLast10Wins / 10;
    homeLast10WinPct = homeLast10Wins / 10;
    hasLast10 = true;
  } else {
    missingData.push('최근 10경기 트렌드 데이터가 누락되어 시즌 평균 승률로 자동 대체되었습니다.');
  }
  const recentScoreAway = awayLast10WinPct;
  const recentScoreHome = homeLast10WinPct;

  // C. 선발투수 점수 (가중치 30%)
  const hasAwayStarter = !!awayStarter && awayStarter.name !== '';
  const hasHomeStarter = !!homeStarter && homeStarter.name !== '';
  const pitcherScoreAway = calculatePitcherScore(awayStarter);
  const pitcherScoreHome = calculatePitcherScore(homeStarter);

  if (!hasAwayStarter || !hasHomeStarter) {
    missingData.push('선발 투수 공식 예고 정보가 공시되지 않아 디폴트 로스터 평점이 산입되었습니다.');
  }

  // D. 타선 점수 (가중치 15%)
  const hasAwayLineup = !!awayLineup && awayLineup.length > 0;
  const hasHomeLineup = !!homeLineup && homeLineup.length > 0;
  const lineupScoreAway = calculateLineupScore(awayLineup, awayProfile?.ops, awayProfile?.battingAvg);
  const lineupScoreHome = calculateLineupScore(homeLineup, homeProfile?.ops, homeProfile?.battingAvg);

  if (!hasAwayLineup || !hasHomeLineup) {
    missingData.push('라인업 미발표 상태로, 팀 시즌 타율 및 OPS 성향에 근거하여 가중 처리되었습니다.');
  }

  // E. 불펜 점수 (가중치 5%)
  const bullpenScoreAway = calculateBullpenScore(awayProfile?.bullpenEra, awayProfile?.era);
  const bullpenScoreHome = calculateBullpenScore(homeProfile?.bullpenEra, homeProfile?.era);

  // G. Elo Rating 점수 (가중치 10%)
  const awayElo = calculateTemporaryElo(awaySeasonWinPct);
  // 홈팀은 Elo 계산 시 +25점 홈그라운드 보정 적용
  const homeElo = calculateTemporaryElo(homeSeasonWinPct) + 25;
  const eloProbAway = calculateEloProbability(awayElo, homeElo);
  const eloProbHome = calculateEloProbability(homeElo, awayElo);

  // H. 최종 점수 합산 계산
  let finalAwayScore = 
    (awayBaseScore * 0.25) +
    (recentScoreAway * 0.15) +
    (pitcherScoreAway * 0.30) +
    (lineupScoreAway * 0.15) +
    (bullpenScoreAway * 0.05) +
    (eloProbAway * 0.10);

  let finalHomeScore = 
    (homeBaseScore * 0.25) +
    (recentScoreHome * 0.15) +
    (pitcherScoreHome * 0.30) +
    (lineupScoreHome * 0.15) +
    (bullpenScoreHome * 0.05) +
    (eloProbHome * 0.10);

  // F. 홈팀 홈 어드밴티지 가산 (+0.03)
  const homeAdvantage = 0.03;
  finalHomeScore += homeAdvantage;

  // 양 팀 finalScore를 정규화하여 최종 백분율 승률 도출
  const scoreSum = finalAwayScore + finalHomeScore;
  let awayWinProbability = Math.round((finalAwayScore / scoreSum) * 100);
  
  // 반올림 누수 방지 및 100% 합계 보장
  if (awayWinProbability < 5) awayWinProbability = 5;
  if (awayWinProbability > 95) awayWinProbability = 95;
  const homeWinProbability = 100 - awayWinProbability;

  // 예측 신뢰도 판별
  const probDiff = Math.abs(awayWinProbability - homeWinProbability);
  const confidence = calculatePredictionConfidence(
    hasAwayStarter && hasHomeStarter,
    hasAwayLineup && hasHomeLineup,
    !!awayStand && !!homeStand,
    probDiff
  );

  // 분석 영향 요인 요약 생성
  const factors = generatePredictionFactors(
    awayTeam,
    homeTeam,
    awayBaseScore,
    homeBaseScore,
    awayLast10WinPct,
    homeLast10WinPct,
    pitcherScoreAway,
    pitcherScoreHome,
    lineupScoreAway,
    lineupScoreHome,
    bullpenScoreAway,
    bullpenScoreHome,
    hasAwayLineup && hasHomeLineup,
    hasAwayStarter && hasHomeStarter
  );

  // 요약 코멘트 작성 (베팅이나 사행성 어휘를 완전히 배제하고 정보적이고 분석적인 어휘 활용)
  const awayName = CONFIG.TEAMS[awayTeam]?.nameKo || awayTeam;
  const homeName = CONFIG.TEAMS[homeTeam]?.nameKo || homeTeam;
  const winnerName = awayWinProbability > homeWinProbability ? awayName : homeName;
  const loserName = awayWinProbability > homeWinProbability ? homeName : awayName;
  const maxProb = Math.max(awayWinProbability, homeWinProbability);
  const diffStr = maxProb >= 60 ? '강세' : maxProb >= 54 ? '우세' : '근소 우세';

  const starterSummary = hasAwayStarter && hasHomeStarter
    ? `선발 매치업(${awayStarter?.name} vs ${homeStarter?.name}) 분석 지수`
    : '시즌 전반기 축적 지표 및 구단 로스터';

  const summary = `${winnerName}이(가) ${maxProb}%로 ${diffStr}할 것으로 예상되는 매치업입니다. ${starterSummary}와 피타고리안 득실차 전력 지수를 조합한 다차원 평가 결과 ${winnerName}이(가) 객관적 지표면에서 다소 안정적인 밸런스를 구축하고 있으나, 당일 라인업 공시 및 야구장의 불펜 기용 타이밍에 따른 변수가 존립하여 최종 판단 신뢰도는 '${confidence}' 수준입니다.`;

  return {
    awayWinProbability,
    homeWinProbability,
    confidence,
    summary,
    factors,
    missingData,
  };
}

/**
 * @function generatePrediction
 * @description (하위 호환성 유지용) 양 팀의 세부 스탯 및 가중치를 비교 분석하여 경기 예측 정보를 반환합니다.
 */
export function generatePrediction(
  awayTeam: string,
  homeTeam: string,
  stadium: string,
  standings: any[],
  completedGames: KBOGame[],
  awayStarter?: PitcherStats,
  homeStarter?: PitcherStats,
  awayLineup?: BatterLineup[],
  homeLineup?: BatterLineup[]
): GamePrediction {
  console.log(`[predictionEngine] [CALL] generatePrediction (legacy router) - ${awayTeam} vs ${homeTeam}`);
  return calculateGamePrediction(
    awayTeam,
    homeTeam,
    stadium,
    standings as TeamStanding[],
    completedGames,
    awayStarter,
    homeStarter,
    awayLineup,
    homeLineup
  );
}
