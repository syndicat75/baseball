/**
 * @file predictionEngine.ts
 * @description KBO 리그 당일 경기 승률 예측 알고리즘 및 규칙 기반 산출 엔진입니다.
 * 팀 전력, 선발투수, 타선, 불펜 소모 및 경기 환경(홈 어드밴티지) 등 5대 지표를 기반으로 스코어를 산출하고 승률을 귀납적 예측합니다.
 */

import { KBOGame, TeamStanding, GamePrediction, PitcherStats, BatterLineup } from '../../types';
import { KBO_TEAM_PROFILES, KBO_PREDICTION_WEIGHTS } from '../../kboConfig';
import { CONFIG } from '../../config';

/**
 * @function calculateLast10Wins
 * @description 해당 구단의 최근 10경기 전적 중 승수를 계산합니다.
 * @param team 구단 식별 코드 (예: "LG")
 * @param completedGames 지금까지 완료된 모든 경기 목록
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
 * @function generatePrediction
 * @description 양 팀의 세부 스탯 및 가중치를 비교 분석하여 경기 예측 정보(승률, 신뢰도, 강점 요인, 누락 사유)를 반환합니다.
 * @param awayTeam 원정 팀 코드
 * @param homeTeam 홈 팀 코드
 * @param stadium 경기 구장 명칭
 * @param standings 현재 기준 구단 전체 순위 리스트
 * @param completedGames 지금까지 완료된 경기 리스트
 * @returns {GamePrediction} 승률 예측 및 세부 근거 객체
 */
export function generatePrediction(
  awayTeam: string,
  homeTeam: string,
  stadium: string,
  standings: any[],
  completedGames: KBOGame[]
): GamePrediction {
  console.log(`[predictionEngine] [CALL] generatePrediction - ${awayTeam} vs ${homeTeam} at ${stadium}`);

  const awayStand = standings.find(s => s.team === awayTeam);
  const homeStand = standings.find(s => s.team === homeTeam);

  const awayProfile = KBO_TEAM_PROFILES[awayTeam];
  const homeProfile = KBO_TEAM_PROFILES[homeTeam];

  const factors: string[] = [];
  const missingData: string[] = [];

  // 1. 팀 기본 전력 (가중치 25%)
  const awayWinRate = awayStand ? (awayStand.winRate || awayStand.winningPct || 0.5) : 0.5;
  const homeWinRate = homeStand ? (homeStand.winRate || homeStand.winningPct || 0.5) : 0.5;

  let teamPowerAway = awayWinRate * 100;
  let teamPowerHome = homeWinRate * 100;

  // 홈 어드밴티지 반영 (홈팀 전력 점수에 보정치 적용)
  const homeAdvantage = 3.5;
  teamPowerHome += homeAdvantage;
  factors.push(`홈 경기 어드밴티지 반영 (+${homeAdvantage}점)`);

  // 2. 최근 10경기 흐름 (가중치 20%)
  const awayLast10Wins = calculateLast10Wins(awayTeam, completedGames);
  const homeLast10Wins = calculateLast10Wins(homeTeam, completedGames);
  const recentTrendAway = (awayLast10Wins / 10) * 100;
  const recentTrendHome = (homeLast10Wins / 10) * 100;

  if (awayLast10Wins > homeLast10Wins) {
    const awayName = CONFIG.TEAMS[awayTeam]?.nameKo || awayTeam;
    factors.push(`${awayName} 최근 10경기 흐름 우위 (${awayLast10Wins}승 vs ${homeLast10Wins}승)`);
  } else if (homeLast10Wins > awayLast10Wins) {
    const homeName = CONFIG.TEAMS[homeTeam]?.nameKo || homeTeam;
    factors.push(`${homeName} 최근 10경기 흐름 우위 (${homeLast10Wins}승 vs ${awayLast10Wins}승)`);
  }

  // 3. 선발투수 지표 (가중치 30%)
  // 실시간 선발투수 매치업 정보가 없을 때 프로필 1선발을 매핑하여 가상의 선발투수 스펙 활용
  const awayStarterProfile = awayProfile?.starters[0];
  const homeStarterProfile = homeProfile?.starters[0];

  let starterScoreAway = 50;
  let starterScoreHome = 50;

  if (awayStarterProfile && homeStarterProfile) {
    // ERA가 낮을수록 가점 (기준 ERA 4.5)
    starterScoreAway = Math.max(0, Math.min(100, 50 + (4.5 - awayStarterProfile.era) * 15));
    starterScoreHome = Math.max(0, Math.min(100, 50 + (4.5 - homeStarterProfile.era) * 15));

    // WHIP가 낮을수록 보정 (기준 WHIP 1.3)
    starterScoreAway += (1.3 - awayStarterProfile.whip) * 20;
    starterScoreHome += (1.3 - homeStarterProfile.whip) * 20;

    if (awayStarterProfile.era < homeStarterProfile.era) {
      factors.push(`선발투수 ERA 우위 (${awayStarterProfile.name} ERA ${awayStarterProfile.era} vs ${homeStarterProfile.name} ERA ${homeStarterProfile.era})`);
    } else if (homeStarterProfile.era < awayStarterProfile.era) {
      factors.push(`선발투수 ERA 우위 (${homeStarterProfile.name} ERA ${homeStarterProfile.era} vs ${awayStarterProfile.name} ERA ${awayStarterProfile.era})`);
    }
  } else {
    missingData.push('실시간 선발투수 공식 정보 부재로 구단 디폴트 프로필 투수 데이터가 반영되었습니다.');
  }

  // 4. 타선 지표 - OPS 기준 (가중치 15%)
  const awayOps = awayProfile ? awayProfile.ops : 0.750;
  const homeOps = homeProfile ? homeProfile.ops : 0.750;

  const lineupScoreAway = Math.max(0, Math.min(100, (awayOps / 0.8) * 50));
  const lineupScoreHome = Math.max(0, Math.min(100, (homeOps / 0.8) * 50));

  if (awayOps > homeOps) {
    const awayName = CONFIG.TEAMS[awayTeam]?.nameKo || awayTeam;
    factors.push(`${awayName} 팀 OPS 우세 (${awayOps.toFixed(3)} vs ${homeOps.toFixed(3)})`);
  } else if (homeOps > awayOps) {
    const homeName = CONFIG.TEAMS[homeTeam]?.nameKo || homeTeam;
    factors.push(`${homeName} 팀 OPS 우세 (${homeOps.toFixed(3)} vs ${awayOps.toFixed(3)})`);
  }
  missingData.push('실시간 타자 선발 명단 미발표로 예상 라인업 기준 통계가 사용되었습니다.');

  // 5. 투수진/불펜 지표 (가중치 10%)
  const awayBullpenEra = awayProfile ? awayProfile.bullpenEra : 4.5;
  const homeBullpenEra = homeProfile ? homeProfile.bullpenEra : 4.5;

  const bullpenScoreAway = Math.max(0, Math.min(100, 50 + (4.5 - awayBullpenEra) * 15));
  const bullpenScoreHome = Math.max(0, Math.min(100, 50 + (4.5 - homeBullpenEra) * 15));

  if (awayBullpenEra < homeBullpenEra) {
    const awayName = CONFIG.TEAMS[awayTeam]?.nameKo || awayTeam;
    factors.push(`${awayName} 불펜 평균자책점 우위`);
  } else if (homeBullpenEra < awayBullpenEra) {
    const homeName = CONFIG.TEAMS[homeTeam]?.nameKo || homeTeam;
    factors.push(`${homeName} 불펜 평균자책점 우위`);
  }

  // 최종 가중 합산 계산
  const w = KBO_PREDICTION_WEIGHTS;
  const finalAwayScore = 
    (teamPowerAway * w.teamPower) +
    (recentTrendAway * w.recentTrend) +
    (starterScoreAway * w.starter) +
    (lineupScoreAway * w.lineup) +
    (bullpenScoreAway * w.bullpen);

  const finalHomeScore = 
    (teamPowerHome * w.teamPower) +
    (recentTrendHome * w.recentTrend) +
    (starterScoreHome * w.starter) +
    (lineupScoreHome * w.lineup) +
    (bullpenScoreHome * w.bullpen);

  // Softmax 가중화 기법을 통한 승률 스케일링
  const rawSum = finalAwayScore + finalHomeScore;
  let awayProb = Math.round((finalAwayScore / rawSum) * 100);
  let homeProb = 100 - awayProb;

  // 50% 동률 시 1% 보정
  if (awayProb === 50 && homeProb === 50) {
    if (finalAwayScore > finalHomeScore) {
      awayProb = 51;
      homeProb = 49;
    } else {
      awayProb = 49;
      homeProb = 51;
    }
  }

  // 예측 신뢰도 판별
  let confidence: '낮음' | '보통' | '높음' = '보통';
  const diff = Math.abs(awayProb - homeProb);
  if (diff > 15) {
    confidence = '높음';
  } else if (diff < 6) {
    confidence = '낮음';
  }

  // 요약 코멘트 자동 생성
  const awayName = CONFIG.TEAMS[awayTeam]?.nameKo || awayTeam;
  const homeName = CONFIG.TEAMS[homeTeam]?.nameKo || homeTeam;
  const winnerName = awayProb > homeProb ? awayName : homeName;
  const winnerProb = Math.max(awayProb, homeProb);
  const loserName = awayProb > homeProb ? homeName : awayName;
  const levelStr = winnerProb >= 60 ? '강세' : winnerProb >= 54 ? '우세' : '근소 우세';

  const starterFactorText = awayStarterProfile && homeStarterProfile
    ? `선발투수(${awayStarterProfile.name} vs ${homeStarterProfile.name}) 매치업 분석 및 `
    : '';

  const summary = `${winnerName}이(가) ${winnerProb}%의 확률로 ${levelStr}가 예측됩니다. ${starterFactorText}최근 10경기 흐름을 종합했을 때 ${winnerName}이(가) 리드하는 경향을 보이나, ${loserName}의 경기 후반 집중력 및 구장 변수로 인해 신뢰도는 '${confidence}' 수준입니다.`;

  return {
    awayWinProbability: awayProb,
    homeWinProbability: homeProb,
    confidence,
    summary,
    factors: factors.slice(0, 4), // 최대 4개 요인 노출
    missingData,
  };
}
