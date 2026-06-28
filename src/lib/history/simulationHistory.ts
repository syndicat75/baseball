/**
 * @file simulationHistory.ts
 * @description KBO 시뮬레이션 결과를 로컬 스토리지 또는 정적 파일 경로에서 불러와 전일 대비 진출 확률의 증가/감소 변화율을 산출하는 히스토리 엔진입니다.
 */

import { SimulationResponse, ProbabilityChangeItem } from '../../types';

/**
 * @function getPreviousDateString
 * @description YYYY-MM-DD 형식의 문자열에서 정확히 하루 전 날짜 문자열을 구합니다.
 * @param {string} dateStr 기준일자 문자열 (YYYY-MM-DD)
 * @returns {string} 하루 전 날짜 문자열 (YYYY-MM-DD)
 */
export function getPreviousDateString(dateStr: string): string {
  console.log(`[simulationHistory] [CALL] getPreviousDateString - input: ${dateStr}`);
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      return '';
    }
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch (err) {
    console.error('[simulationHistory] Failed to compute previous date:', err);
    return '';
  }
}

/**
 * @function saveSimulationResult
 * @description 현재 시뮬레이션 성공 결과를 브라우저 로컬 저장소에 영구 보존합니다.
 * @param {string} dateStr 날짜 키 (YYYY-MM-DD)
 * @param {SimulationResponse} result 포스트시즌 시뮬레이션 결과 객체
 */
export function saveSimulationResult(dateStr: string, result: SimulationResponse): void {
  console.log(`[simulationHistory] [CALL] saveSimulationResult for date: ${dateStr}`);
  if (typeof window === 'undefined') return;
  try {
    const key = `kbo-simulation-result-${dateStr}`;
    localStorage.setItem(key, JSON.stringify(result));
    console.log(`[simulationHistory] Saved result successfully to localStorage under key: ${key}`);
  } catch (err) {
    console.error('[simulationHistory] Error writing simulation to localStorage:', err);
  }
}

/**
 * @function loadSimulationResult
 * @description 로컬 저장소 또는 퍼블릭 정적 리소스 폴더 (/data/history/)에서 특정 날짜의 이전 계산 결과를 비동기적으로 조회합니다.
 * @param {string} dateStr 조회하고 싶은 날짜 문자열 (YYYY-MM-DD)
 * @returns {Promise<SimulationResponse | null>} 조회 성공한 시뮬레이션 스냅샷 데이터 또는 null
 */
export async function loadSimulationResult(dateStr: string): Promise<SimulationResponse | null> {
  console.log(`[simulationHistory] [CALL] loadSimulationResult for date: ${dateStr}`);
  if (typeof window === 'undefined') return null;

  const localKey = `kbo-simulation-result-${dateStr}`;
  
  // 1. Local Storage 우선 탐색
  try {
    const localVal = localStorage.getItem(localKey);
    if (localVal) {
      console.log(`[simulationHistory] Found historical snapshot in localStorage under key: ${localKey}`);
      return JSON.parse(localVal);
    }
  } catch (err) {
    console.warn('[simulationHistory] Error reading from localStorage:', err);
  }

  // 2. Public Static Folder Fallback 탐색 (개발자 프리셋 지원용)
  try {
    const targetUrl = `/data/history/simulation-${dateStr}.json`;
    console.log(`[simulationHistory] Local snapshot not found. Attempting static fetch from: ${targetUrl}`);
    const response = await fetch(targetUrl);
    if (response.ok) {
      const data = await response.json();
      console.log(`[simulationHistory] Loaded historical snapshot from static fetch successfully.`);
      return data;
    }
  } catch (err) {
    console.log('[simulationHistory] Static history file fallback unavailable.');
  }

  return null;
}

/**
 * @function calculateProbabilityChanges
 * @description 오늘 결과와 어제 혹은 이전 시점의 결과를 비교해 가을야구 진출 확률 변화량을 집계합니다.
 * @param {SimulationResponse} current 현재 일자 연산 결과
 * @param {SimulationResponse | null} previous 전일 연산 결과 (없을 경우 빈 처리 대응)
 * @returns {object} 계산 성공 유무와 비교 분석된 구단별 확률 변화 목록
 */
export function calculateProbabilityChanges(
  current: SimulationResponse,
  previous: SimulationResponse | null
): {
  hasPrevData: boolean;
  prevDate?: string;
  items: ProbabilityChangeItem[];
} {
  console.log(`[simulationHistory] [CALL] calculateProbabilityChanges invocation. hasPrev: ${previous !== null}`);

  if (!previous || !previous.results) {
    return {
      hasPrevData: false,
      items: []
    };
  }

  const items: ProbabilityChangeItem[] = [];

  current.results.forEach(currTeam => {
    const prevTeam = previous.results.find(p => p.team === currTeam.team);
    const currProb = currTeam.playoffProbability;
    const prevProb = prevTeam ? prevTeam.playoffProbability : currProb;
    
    const change = Math.round((currProb - prevProb) * 10) / 10;
    let direction: 'up' | 'down' | 'same' = 'same';
    if (change > 0.05) direction = 'up';
    else if (change < -0.05) direction = 'down';

    items.push({
      team: currTeam.team,
      displayName: currTeam.displayName || currTeam.team,
      currentProb: currProb,
      prevProb,
      change,
      direction
    });
  });

  // 변화폭이 큰 팀 TOP 5를 쉽게 정렬하여 가시성을 보장하기 위해
  // UI에서는 정렬해 쓸 수 있도록 그대로 반환합니다.
  return {
    hasPrevData: true,
    prevDate: previous.date,
    items
  };
}
