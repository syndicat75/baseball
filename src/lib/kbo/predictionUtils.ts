/**
 * @file predictionUtils.ts
 * @description KBO 경기 승률 예측을 위한 다양한 통계 수치 정규화 및 수식 보조 계산 함수 모음입니다.
 */

/**
 * @function clamp
 * @description 값이 지정된 범위를 벗어나지 않도록 고정합니다.
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * @function normalizeHigherIsBetter
 * @description 높을수록 좋은 지표(승률, 타율 등)를 0 ~ 1 사이로 정규화합니다.
 */
export function normalizeHigherIsBetter(val: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  const normalized = (val - min) / (max - min);
  return clamp(normalized, 0, 1);
}

/**
 * @function normalizeLowerIsBetter
 * @description 낮을수록 좋은 지표(ERA, 실점 등)를 역정규화하여 0 ~ 1 사이로 만듭니다. (낮을수록 1에 가까움)
 */
export function normalizeLowerIsBetter(val: number, min: number, max: number): number {
  if (max <= min) return 0.5;
  const normalized = (max - val) / (max - min);
  return clamp(normalized, 0, 1);
}

/**
 * @function calculatePythagoreanWinPct
 * @description 피타고리안 승률을 계산합니다: runs^1.83 / (runs^1.83 + runsAllowed^1.83)
 */
export function calculatePythagoreanWinPct(runs: number, runsAllowed: number): number {
  if (runs <= 0 && runsAllowed <= 0) return 0.5;
  const exponent = 1.83;
  const runsExp = Math.pow(runs, exponent);
  const runsAllowedExp = Math.pow(runsAllowed, exponent);
  const denom = runsExp + runsAllowedExp;
  if (denom === 0) return 0.5;
  return clamp(runsExp / denom, 0.1, 0.9);
}

/**
 * @function roundProbabilityPair
 * @description 두 소수점 승률 쌍을 소수점 반올림하여 합이 정확히 100%가 되는 정수 퍼센트 쌍으로 변환합니다.
 */
export function roundProbabilityPair(awayProb: number, homeProb: number): { awayWinProbability: number; homeWinProbability: number } {
  const awayPercent = Math.round(awayProb * 100);
  const homePercent = 100 - awayPercent;
  return {
    awayWinProbability: awayPercent,
    homeWinProbability: homePercent
  };
}
