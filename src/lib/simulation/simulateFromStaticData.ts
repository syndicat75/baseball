/**
 * @file simulateFromStaticData.ts
 * @description 브라우저에서 실행 가능한 순수 몬테카를로 시뮬레이션 진입점입니다.
 * DOM, fs, process 등 서버 API에 의존하지 않고 클라이언트 브라우저 환경에서 100% 순수하게 동작합니다.
 * 로그는 모든 함수 호출마다 남기며, 각 함수에는 javadoc 스타일의 docstring을 추가합니다.
 */

import { simulateSeason } from './simulateSeason';
import { KBOGame, KBOStandingsResult, StandingsTeam, SimulationResponse, ProbabilityModelType } from '../../types';
import { CONFIG } from '../../config';
import { prepareGames } from './prepareGames';
import { validateSimulationInvariants } from './validateSimulationInvariants';

/**
 * @function getEstimatedHeadToHead
 * @description 수집된 팀 정보와 승률을 기반으로 상대 전적 기록을 결정론적으로 추정합니다.
 * @param {any[]} teams standings의 팀 목록
 * @returns {Record<string, Record<string, { wins: number; losses: number; draws: number }>>} 추정된 상대 전적 맵
 */
function getEstimatedHeadToHead(teams: any[]): Record<string, Record<string, { wins: number; losses: number; draws: number }>> {
  console.log('[simulateFromStaticData] [CALL] getEstimatedHeadToHead is calculating head-to-head matrix.');
  const headToHead: Record<string, Record<string, { wins: number; losses: number; draws: number }>> = {};
  const teamCodes = Object.keys(CONFIG.TEAMS);

  for (const t1 of teamCodes) {
    headToHead[t1] = {};
    const t1Data = teams.find(t => t.team === t1);
    const t1Wins = t1Data?.wins ?? 30;
    const t1Losses = t1Data?.losses ?? 30;
    const t1Rate = t1Wins / (t1Wins + t1Losses || 1);

    for (const t2 of teamCodes) {
      if (t1 === t2) continue;
      const t2Data = teams.find(t => t.team === t2);
      const t2Wins = t2Data?.wins ?? 30;
      const t2Losses = t2Data?.losses ?? 30;
      const t2Rate = t2Wins / (t2Wins + t2Losses || 1);

      const gamesPlayed = 8; // 추정 경기 수
      const ratio = t1Rate / (t1Rate + t2Rate || 1);
      const wins = Math.round(gamesPlayed * ratio);
      const losses = gamesPlayed - wins;

      headToHead[t1][t2] = { wins, losses, draws: 0 };
    }
  }
  return headToHead;
}

export interface SimulateFromStaticDataInput {
  standings: any[];
  remainingGames: KBOGame[];
  completedGames?: KBOGame[];
  iterations: number;
  model: ProbabilityModelType;
  seed?: number;
  asOfDate: string;
}

/**
 * @function simulateFromStaticData
 * @description 클라이언트 정적 데이터와 옵션을 전달받아 몬테카를로 시즌 시뮬레이션을 브라우저에서 가동합니다.
 * @param {SimulateFromStaticDataInput} input 시뮬레이션 필요한 입력 데이터 구조체
 * @returns {Promise<SimulationResponse>} 시뮬레이션 결과 데이터 객체
 */
export async function simulateFromStaticData(input: SimulateFromStaticDataInput): Promise<SimulationResponse> {
  console.log(`[simulateFromStaticData] [CALL] simulateFromStaticData has been invoked with iterations: ${input.iterations}, model: "${input.model}"`);
  
  const headToHead = getEstimatedHeadToHead(input.standings);
  
  // Standings 형식 일치시키기
  // currentGames는 wins + losses + draws 계산 기준으로 우선 보정
  const formattedTeams: StandingsTeam[] = input.standings.map((t: any) => {
    const wins = t.wins ?? 0;
    const losses = t.losses ?? 0;
    const draws = t.draws ?? 0;
    const computedGames = wins + losses + draws;
    return {
      team: t.team,
      nameKo: t.displayName || t.nameKo || CONFIG.TEAMS[t.team as keyof typeof CONFIG.TEAMS]?.nameKo || t.team,
      games: computedGames, // wins + losses + draws를 우선 적용
      wins,
      losses,
      draws,
      winRate: t.winRate || (wins / (wins + losses || 1)),
      rank: t.rank || 1,
    };
  });
  
  const standingsResult: KBOStandingsResult = {
    asOfDate: input.asOfDate,
    source: 'static-json',
    teams: formattedTeams,
    headToHead,
  };
  
  // 중복 제거 및 가상 보정 경기 생성 처리
  const prepResult = prepareGames(formattedTeams, input.remainingGames || []);
  const consolidatedRemainingGames = [...prepResult.cleanedRemainingGames, ...prepResult.syntheticGames];
  
  // 순수 simulateSeason 함수 실행
  // 시뮬레이션에서는 remainingGames만 처리해야 하므로 가상 경기 포함된 consolidatedRemainingGames만 주입합니다.
  const response = await simulateSeason(
    standingsResult,
    consolidatedRemainingGames,
    [],
    {
      date: input.asOfDate,
      iterations: input.iterations,
      model: input.model,
      seed: input.seed || 42,
    }
  );
  
  // 시뮬레이션 불변조건 수학적 검증 수행
  const validationResult = validateSimulationInvariants(formattedTeams, consolidatedRemainingGames, response.results);
  
  // 검증 결과 및 중복 제거 로그 취합
  const combinedWarnings = [
    ...(prepResult.warnings || []),
    ...(validationResult.errors || [])
  ];
  
  response.warnings = combinedWarnings;
  response.syntheticGamesCount = prepResult.syntheticGames.length;
  response.syntheticTeamCounts = prepResult.syntheticTeamCounts;
  
  console.log('[simulateFromStaticData] Monte Carlo simulation and invariant validation completed successfully inside client browser.');
  return response;
}
