/**
 * @file validateKboData.ts
 * @description 수집 및 가공된 KBO 구단 순위 데이터의 무결성과 수학적 합치성을 전수 검사하는 유효성 검증 모듈입니다.
 */

import { OfficialTeamStanding } from './parseOfficialStandings';

/**
 * @function validateStandingsData
 * @description KBO 순위표 데이터가 비즈니스 정합성 규격을 완전히 충족하는지 엄격히 검증합니다.
 * @param {OfficialTeamStanding[]} standings - 검증할 순위 데이터 배열
 * @returns {boolean} 검증 통과 여부 (통과 시 true, 실패 시 false 또는 throw)
 */
export function validateStandingsData(standings: OfficialTeamStanding[]): boolean {
  console.log(`[validateKboData] [CALL] validateStandingsData - Target teams: ${standings.length}`);
  
  // 1. 구단 개수 검증 (반드시 10개 구단 체제여야 함)
  if (standings.length !== 10) {
    console.error(`[validateKboData] [ERROR] Team count is not 10. Found: ${standings.length}`);
    throw new Error(`순위표 무결성 검증 실패: 총 구단 개수가 ${standings.length}개입니다 (10개 필수).`);
  }

  // 2. 대표 인기 구단인 LG 트윈스 존재 유무 검사
  const hasLg = standings.some(t => t.teamName === 'LG');
  if (!hasLg) {
    console.error('[validateKboData] [ERROR] LG Twins information is missing in the parsed standings.');
    throw new Error('순위표 무결성 검증 실패: LG 트윈스 구단이 목록에 존재하지 않습니다.');
  }

  // 3. 구단별 수학적 정합성 공식 검증 (games = wins + losses + draws)
  for (const team of standings) {
    const expectedSum = team.wins + team.losses + team.draws;
    if (team.games !== expectedSum) {
      console.error(`[validateKboData] [ERROR] Mathematical integrity mismatch for team "${team.teamName}": games(${team.games}) !== wins(${team.wins}) + losses(${team.losses}) + draws(${team.draws})`);
      throw new Error(`순위표 무결성 검증 실패: ${team.teamName} 구단의 누적 경기수(${team.games})와 [승(${team.wins}) + 패(${team.losses}) + 무(${team.draws})] 합계(${expectedSum})가 수학적으로 합치하지 않습니다.`);
    }

    if (isNaN(team.winningPct)) {
      console.error(`[validateKboData] [ERROR] Winning percent of "${team.teamName}" is NaN.`);
      throw new Error(`순위표 무결성 검증 실패: ${team.teamName} 구단의 승률이 올바른 숫자 타입이 아닙니다.`);
    }

    // 4. 인공적 보정(Synthetic) 데이터 함유 유무 체크
    // 비정상적으로 경기가 늘어나거나 하드코딩된 가짜 값이 묻어있는지 판정합니다.
    if (team.games > 144) {
      console.error(`[validateKboData] [ERROR] Synthetic/Over-simulated game count detected for team "${team.teamName}": games(${team.games}) > 144`);
      throw new Error(`순위표 무결성 검증 실패: ${team.teamName} 구단의 소화 경기수가 정규 시즌 한도인 144경기를 초과하는 비정상 데이터가 감지되었습니다.`);
    }
  }

  console.log('[validateKboData] [SUCCESS] validateStandingsData - All integrity tests passed.');
  return true;
}

/**
 * @function detectDataDegradation
 * @description 새로 수집한 데이터가 기존에 캐시되어 있던 유효 데이터보다 오히려 과거로 퇴화했는지 검출합니다 (총 경기수 역전 방지).
 * @param {OfficialTeamStanding[]} newStandings - 새로 파싱 완료한 순위 데이터
 * @param {OfficialTeamStanding[]} cachedStandings - 기존 캐시 메모리에 저장되어 있던 순위 데이터
 * @returns {boolean} 데이터 퇴화 발생 여부 (퇴화 발생 시 true, 정상 수집 시 false)
 */
export function detectDataDegradation(newStandings: OfficialTeamStanding[], cachedStandings: OfficialTeamStanding[]): boolean {
  console.log('[validateKboData] [CALL] detectDataDegradation');
  
  const newTotalGames = newStandings.reduce((sum, t) => sum + t.games, 0);
  const cachedTotalGames = cachedStandings.reduce((sum, t) => sum + t.games, 0);
  
  console.log(`[validateKboData] Total games comparison -> New: ${newTotalGames}, Cached: ${cachedTotalGames}`);
  
  if (newTotalGames < cachedTotalGames) {
    console.warn(`[validateKboData] [WARN] Data degradation detected! Parsed total games (${newTotalGames}) is less than current cached total games (${cachedTotalGames}). Returning true.`);
    return true;
  }
  
  return false;
}
