/**
 * @file calculateDataReliability.ts
 * @description KBO 데이터셋의 신뢰성과 정합성을 실시간 진단하고 감점 모델을 통해 0~100점 사이의 품질 점수를 계산하는 유틸리티 파일입니다.
 */

interface ReliabilityInput {
  standingsCompletedGames: number;
  scheduleCompletedGames: number;
  expectedRemainingGamesByStandings: number;
  actualRemainingGames: number;
  syntheticGameCount: number;
  source: string;
  asOfDate: string;
  selectedDate: string;
  fetchedAt?: string;
  teamCount: number;
  hasFinalGameMismatch: boolean;
  mismatchedTeamsCount: number;
}

export interface ReliabilityResult {
  score: number;
  level: 'very_good' | 'good' | 'warning' | 'low' | 'poor';
  label: string;
  uiLabel: string;
  warnings: string[];
  metrics: {
    standingsCompletedGames: number;
    scheduleCompletedGames: number;
    requiredRemainingGames: number;
    actualRemainingGames: number;
    syntheticGameCount: number;
    source: string;
    asOfDate: string;
    selectedDate: string;
    fetchedAt: string;
  };
}

/**
 * @function calculateDataReliability
 * @description 주어진 정합성 매트릭을 바탕으로 KBO 데이터의 신뢰도 점수를 감점방식으로 도출합니다.
 * @param {ReliabilityInput} input 데이터 신뢰도 연산을 위한 원본 품질 지표들
 * @returns {ReliabilityResult} 산출된 최종 점수, 등급, UI 라벨 및 상세 경고 리스트
 */
export function calculateDataReliability(input: ReliabilityInput): ReliabilityResult {
  console.log('[calculateDataReliability] [CALL] calculateDataReliability invoked with:', JSON.stringify(input));

  let score = 100;
  const warnings: string[] = [];

  // 1. 순위표-일정표 완료 경기 수 불일치 감점
  const completedDiff = Math.abs(input.standingsCompletedGames - input.scheduleCompletedGames);
  if (completedDiff > 0.5) {
    const penalty = Math.min(25, Math.ceil(completedDiff * 3));
    score -= penalty;
    warnings.push(`순위표상 경기 수와 일정상 완료 경기 수에 불일치(약 ${completedDiff.toFixed(1)}경기)가 있습니다. (-${penalty}점)`);
  }

  // 2. 순위표 필요 잔여 경기 수 대비 실제 등록 일정 부족 감점
  const remainingDiff = input.expectedRemainingGamesByStandings - input.actualRemainingGames;
  if (remainingDiff > 0.5) {
    const penalty = Math.min(25, Math.ceil(remainingDiff * 3));
    score -= penalty;
    warnings.push(`순위표 기반 요구 잔여 경기 수에 비해 실제 등록된 일정이 부족합니다. (약 ${remainingDiff.toFixed(1)}경기 부족, -${penalty}점)`);
  }

  // 3. 인공 보정 경기 수(Synthetic Games) 감점
  if (input.syntheticGameCount > 0) {
    const penalty = Math.min(20, Math.ceil(input.syntheticGameCount * 1.5));
    score -= penalty;
    warnings.push(`144경기 완성을 위해 인공 보정 경기(${input.syntheticGameCount}경기)를 생성해 연산했습니다. (-${penalty}점)`);
  }

  // 4. 번들 폴백(Fallback) 소스 사용 감점
  const lowerSource = input.source.toLowerCase();
  if (lowerSource.includes('fallback') || lowerSource.includes('sample') || lowerSource.includes('bundled')) {
    score -= 35;
    warnings.push('실시간 최신 데이터 획득 실패로 예비 로컬 데이터를 활용하고 있습니다. (-35점)');
  }

  // 5. 날짜 기준일 불일치 감점
  if (input.selectedDate && input.asOfDate !== input.selectedDate) {
    score -= 15;
    warnings.push(`선택한 기준일(${input.selectedDate})에 실제 KBO 스냅샷(${input.asOfDate}) 데이터가 존재하지 않아 보정 적용되었습니다. (-15점)`);
  }

  // 6. 구단 개수 불완전 감점
  if (input.teamCount !== 10) {
    score -= 50;
    warnings.push(`KBO 구단 수(${input.teamCount}개)가 10개가 아닙니다. 심각한 무결성 훼손이 의심됩니다. (-50점)`);
  }

  // 7. 최종 144경기 불일치 구단 발생 감점
  if (input.hasFinalGameMismatch) {
    const penalty = Math.min(40, input.mismatchedTeamsCount * 10);
    score -= penalty;
    warnings.push(`연산 종료 기준 최종 144경기가 충족되지 않는 구단(${input.mismatchedTeamsCount}개)이 확인되었습니다. (-${penalty}점)`);
  }

  // 범위 제한 [0, 100]
  score = Math.max(0, Math.min(100, score));

  // 점수 구간 등급 부여
  let level: 'very_good' | 'good' | 'warning' | 'low' | 'poor' = 'poor';
  let label = '신뢰 낮음';
  let uiLabel = '데이터 보정 비중 높음';

  if (score >= 90) {
    level = 'very_good';
    label = '매우 양호';
    uiLabel = '데이터 신뢰도 양호';
  } else if (score >= 75) {
    level = 'good';
    label = '양호';
    uiLabel = '일부 보정 포함';
  } else if (score >= 60) {
    level = 'warning';
    label = '주의';
    uiLabel = '일부 보정 포함';
  } else if (score >= 40) {
    level = 'low';
    label = '낮음';
    uiLabel = '데이터 보정 비중 높음';
  } else {
    level = 'poor';
    label = '신뢰 낮음';
    uiLabel = '데이터 보정 비중 높음';
  }

  return {
    score,
    level,
    label,
    uiLabel,
    warnings,
    metrics: {
      standingsCompletedGames: input.standingsCompletedGames,
      scheduleCompletedGames: input.scheduleCompletedGames,
      requiredRemainingGames: input.expectedRemainingGamesByStandings,
      actualRemainingGames: input.actualRemainingGames,
      syntheticGameCount: input.syntheticGameCount,
      source: input.source,
      asOfDate: input.asOfDate,
      selectedDate: input.selectedDate,
      fetchedAt: input.fetchedAt || new Date().toISOString()
    }
  };
}
