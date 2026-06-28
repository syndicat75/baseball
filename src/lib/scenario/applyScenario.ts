/**
 * @file applyScenario.ts
 * @description 사용자가 특정 구단의 미래 N경기 성적을 가정하는 시나리오 모드를 전처리하는 모듈입니다.
 * 지정 구단의 다가오는 일정을 선점 고정하여 연산 시작 스탠딩을 정밀하게 가공합니다.
 */

import { KBOGame, StandingsTeam } from '../../types';

export interface ScenarioInput {
  type: 'team-record';
  team: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface ScenarioResult {
  fixedGames: KBOGame[];
  remainingRandomGames: KBOGame[];
  warnings: string[];
  adjustedStandingsTeams: StandingsTeam[];
}

/**
 * @function preprocessScenarioGames
 * @description 전체 잔여 일정 중 특정 구단이 개입된 첫 N경기를 지정한 승-패-무 가치로 고정(Freeze)하여 스탠딩 및 일정 시나리오 세트를 반환합니다.
 * @param {StandingsTeam[]} baseTeams 원본 순위표 구단 목록
 * @param {KBOGame[]} remainingGames 원본 시뮬레이션 대상 잔여 일정 목록
 * @param {ScenarioInput} scenario 가정 조건 입력 구조체
 * @returns {ScenarioResult} 고정된 일정, 남은 무작위 일정, 조정된 시작 순위표 세트
 */
export function preprocessScenarioGames(
  baseTeams: StandingsTeam[],
  remainingGames: KBOGame[],
  scenario: ScenarioInput
): ScenarioResult {
  console.log('[applyScenario] [CALL] preprocessScenarioGames has been invoked for:', JSON.stringify(scenario));
  
  const warnings: string[] = [];
  const targetTeam = scenario.team;
  const targetTotal = scenario.games;

  // 유효성 기본 검증
  if (scenario.wins + scenario.losses + scenario.draws !== targetTotal) {
    throw new Error(`시나리오 입력 오류: 가정 성적의 합(${scenario.wins}승 ${scenario.losses}패 ${scenario.draws}무 = ${scenario.wins + scenario.losses + scenario.draws})이 설정한 경기 수(${targetTotal})와 다릅니다.`);
  }

  // 대상 팀의 잔여 경기 필터링 및 시간순 정렬
  const teamGames = remainingGames
    .filter(g => g.away === targetTeam || g.home === targetTeam)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });

  if (teamGames.length < targetTotal) {
    throw new Error(`시나리오 입력 오류: 해당 팀(${targetTeam})의 전체 남은 경기 수(${teamGames.length}경기)보다 큰 경기 수(${targetTotal}경기)를 입력하였습니다.`);
  }

  // 선택된 첫 N경기 추출
  const selectedGamesToFreeze = teamGames.slice(0, targetTotal);
  
  const getGameKey = (g: KBOGame) => `${g.date}_${g.time}_${g.away}_${g.home}_${g.stadium || ''}`;
  
  const selectedGameIds = new Set(selectedGamesToFreeze.map(getGameKey));

  // 남은 무작위 게임들
  const remainingRandomGames = remainingGames.filter(g => !selectedGameIds.has(getGameKey(g)));

  // 순위표 복제 (조정 적용 예정)
  const adjustedTeamsMap: Record<string, StandingsTeam> = {};
  baseTeams.forEach(t => {
    adjustedTeamsMap[t.team] = { ...t };
  });

  // 성적 분배를 위한 카드 풀 구축
  // Wins -> Losses -> Draws 순서대로 할당합니다.
  const outcomePool: Array<'win' | 'loss' | 'draw'> = [];
  for (let i = 0; i < scenario.wins; i++) outcomePool.push('win');
  for (let i = 0; i < scenario.losses; i++) outcomePool.push('loss');
  for (let i = 0; i < scenario.draws; i++) outcomePool.push('draw');

  const fixedGames: KBOGame[] = selectedGamesToFreeze.map((game, idx) => {
    const outcome = outcomePool[idx];
    const isTargetHome = game.home === targetTeam;
    const opponent = isTargetHome ? game.away : game.home;

    let awayScore = 0;
    let homeScore = 0;

    if (outcome === 'win') {
      // 대상 팀 승리
      if (isTargetHome) {
        homeScore = 5;
        awayScore = 3;
      } else {
        awayScore = 5;
        homeScore = 3;
      }
      
      // 스탠딩 갱신
      if (adjustedTeamsMap[targetTeam]) {
        adjustedTeamsMap[targetTeam].wins++;
        adjustedTeamsMap[targetTeam].games++;
      }
      if (adjustedTeamsMap[opponent]) {
        adjustedTeamsMap[opponent].losses++;
        adjustedTeamsMap[opponent].games++;
      }
    } else if (outcome === 'loss') {
      // 대상 팀 패배
      if (isTargetHome) {
        homeScore = 3;
        awayScore = 5;
      } else {
        awayScore = 3;
        homeScore = 5;
      }

      // 스탠딩 갱신
      if (adjustedTeamsMap[targetTeam]) {
        adjustedTeamsMap[targetTeam].losses++;
        adjustedTeamsMap[targetTeam].games++;
      }
      if (adjustedTeamsMap[opponent]) {
        adjustedTeamsMap[opponent].wins++;
        adjustedTeamsMap[opponent].games++;
      }
    } else {
      // 무승부
      awayScore = 3;
      homeScore = 3;

      // 스탠딩 갱신
      if (adjustedTeamsMap[targetTeam]) {
        adjustedTeamsMap[targetTeam].draws++;
        adjustedTeamsMap[targetTeam].games++;
      }
      if (adjustedTeamsMap[opponent]) {
        adjustedTeamsMap[opponent].draws++;
        adjustedTeamsMap[opponent].games++;
      }
    }

    return {
      ...game,
      awayScore,
      homeScore,
      status: 'completed',
      reason: `Scenario frozen: ${targetTeam} expected to ${outcome}`
    };
  });

  // 순위표 내 승률 재계산 및 정렬 순위 리맵핑
  const adjustedStandingsTeams = Object.values(adjustedTeamsMap).map(t => {
    const denom = t.wins + t.losses;
    const winRate = denom > 0 ? t.wins / denom : 0;
    return {
      ...t,
      winRate: Math.round(winRate * 1000) / 1000
    };
  });

  // 재계산된 승률 기준으로 임시 순위 부여
  adjustedStandingsTeams.sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.wins - a.wins;
  });

  adjustedStandingsTeams.forEach((t, index) => {
    t.rank = index + 1;
  });

  warnings.push(`시나리오 적용 상태: ${targetTeam}의 잔여 일정 첫 ${targetTotal}경기를 ${scenario.wins}승 ${scenario.losses}패 ${scenario.draws}무 결과로 선반영 및 시뮬레이션을 수행했습니다.`);

  console.log('[applyScenario] Scenario preprocessing completed successfully. Adjusted teams count: 10.');
  return {
    fixedGames,
    remainingRandomGames,
    warnings,
    adjustedStandingsTeams
  };
}
