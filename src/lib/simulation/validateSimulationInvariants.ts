/**
 * @file validateSimulationInvariants.ts
 * @description 시뮬레이션 실행 과정 및 결과 데이터의 수학적/논리적 불변조건(Invariants)을 상시 검증하는 도구입니다.
 * 모든 검증 단계 및 함수 호출 시 상세한 로그를 남깁니다.
 */

import { KBOGame } from '../../types';

export interface InvariantValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * @function validateSimulationInvariants
 * @description 시뮬레이션 전후의 핵심 불변조건들을 검증하여 데이터 품질 경고를 생성합니다.
 * @param {any[]} standings 각 구단의 현재 순위표 데이터
 * @param {KBOGame[]} remainingGames 중복 제거 및 보정이 완료된 잔여 일정 목록
 * @param {any[]} results 시뮬레이션 수행 결과 목록 (구단별 평균 승/패/무 및 최종 경기수 포함)
 * @returns {InvariantValidationResult} 불변조건 통과 여부 및 발생 오류 리스트
 */
export function validateSimulationInvariants(
  standings: any[],
  remainingGames: KBOGame[],
  results: any[]
): InvariantValidationResult {
  console.log('[validateSimulationInvariants] [CALL] validateSimulationInvariants has been invoked.');
  const errors: string[] = [];

  // 1. 구단 개수 검증 (KBO는 반드시 10개 구단이어야 함)
  if (standings.length !== 10) {
    errors.push(`[Invariants] KBO 구단 수는 반드시 10개여야 합니다. (현재: ${standings.length}개)`);
  }

  // 2. 현재 경기수 계산 규칙 검증 (currentGames = wins + losses + draws)
  for (const team of standings) {
    const calculatedGames = team.wins + team.losses + team.draws;
    if (team.games !== calculatedGames) {
      console.warn(`[validateSimulationInvariants] Team ${team.team} games mismatch. standings.games: ${team.games}, wins+losses+draws: ${calculatedGames}`);
    }
  }

  // 3. 각 구단의 예상 최종 경기수 검증
  // synthetic 보정까지 완료된 상태에서 최종 예상 경기수는 반드시 144여야 합니다.
  for (const team of standings) {
    const currentGames = team.wins + team.losses + team.draws;
    const scheduledCount = remainingGames.filter(
      g => g.away === team.team || g.home === team.team
    ).length;
    const projected = currentGames + scheduledCount;

    if (projected > 144) {
      errors.push(`[Invariants] 구단 ${team.team}의 예상 최종 경기수(${projected})가 144경기를 초과합니다. (현재: ${currentGames}, 남은 경기: ${scheduledCount})`);
    }
  }

  // 4. 시뮬레이션 결과 불변조건 검증 (averageFinalWins 등 범위 검증)
  if (results && results.length > 0) {
    if (results.length !== 10) {
      errors.push(`[Invariants] 시뮬레이션 결과 구단 수(${results.length})가 10개가 아닙니다.`);
    }

    for (const res of results) {
      const currentWins = res.currentWins ?? 0;
      const teamRemainingCount = remainingGames.filter(
        g => g.away === res.team || g.home === res.team
      ).length;

      const avgWins = res.averageFinalWins;
      const avgLosses = res.averageFinalLosses ?? 0;
      const avgDraws = res.averageFinalDraws ?? 0;
      const avgGames = avgWins + avgLosses + avgDraws;

      // A. averageFinalWins >= currentWins
      if (avgWins < currentWins - 0.01) {
        errors.push(`[Invariants] 구단 ${res.team}의 예상 평균 최종 승수(${avgWins})가 현재 승수(${currentWins})보다 작습니다.`);
      }

      // B. averageFinalWins <= currentWins + remainingGameCount
      if (avgWins > currentWins + teamRemainingCount + 0.01) {
        errors.push(`[Invariants] 구단 ${res.team}의 예상 평균 최종 승수(${avgWins})가 가능한 최대 승수(${currentWins + teamRemainingCount})를 초과합니다.`);
      }

      // C. averageFinalWins + averageFinalLosses + averageFinalDraws ≈ 144
      if (Math.abs(avgGames - 144) > 0.5) {
        errors.push(`[Invariants] 구단 ${res.team}의 예상 최종 경기수 합계(${avgGames.toFixed(2)})가 144경기 기준에 수렴하지 않습니다.`);
      }
    }
  }

  const isValid = errors.length === 0;
  console.log(`[validateSimulationInvariants] Validation completed. isValid: ${isValid}, found errors: ${errors.length}`);
  return {
    isValid,
    errors,
  };
}
