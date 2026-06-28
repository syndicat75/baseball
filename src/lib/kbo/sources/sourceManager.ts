/**
 * @file sourceManager.ts
 * @description KBO 데이터 수집을 위한 다중 데이터 소스 통합 관리자(Source Manager)입니다.
 * 우선순위에 따라 각 데이터 소스(MyKBOStats, KBO 공식 영문, TheSportsDB, 내장 백업)를 순차 호출하며,
 * 최대 3초의 타임아웃을 적용해 무중단 가동을 보장합니다.
 */

import { KBOStandingsResult, KBOScheduleResult } from '../../../types';
import { myKboStatsSource } from './myKboStatsSource';
import { officialKboEnglishSource } from './officialKboEnglishSource';
import { theSportsDbSource } from './theSportsDbSource';
import { fallbackSource } from './fallbackSource';

/**
 * @interface KboDataSource
 * @description 개별 데이터 수집 엔진이 준수해야 하는 공통 규격입니다.
 */
export interface KboDataSource {
  id: string;
  label: string;
  priority: number;
  getStandings(date: string): Promise<KBOStandingsResult>;
  getSchedule(fromDate: string): Promise<KBOScheduleResult>;
}

/**
 * @interface FailedSourceAttempt
 * @description 수집에 실패한 소스의 식별자와 에러 사유를 기록합니다.
 */
export interface FailedSourceAttempt {
  source: string;
  reason: string;
}

/**
 * @interface SourceManagerStandingsResult
 * @description 소스 관리자를 거쳐 최종 반환되는 순위 데이터 구조체입니다.
 */
export interface SourceManagerStandingsResult extends KBOStandingsResult {
  sourceLabel: string;
  fetchedAt: string;
  warnings?: string[];
  failedSources?: FailedSourceAttempt[];
}

/**
 * @interface SourceManagerScheduleResult
 * @description 소스 관리자를 거쳐 최종 반환되는 일정 데이터 구조체입니다.
 */
export interface SourceManagerScheduleResult extends KBOScheduleResult {
  sourceLabel: string;
  fetchedAt: string;
  warnings?: string[];
  failedSources?: FailedSourceAttempt[];
}

/**
 * @description 우선순위에 따라 정렬된 데이터 소스 목록입니다.
 * 1순위: MyKBOStats, 2순위: KBO 공식 영문, 3순위: TheSportsDB, 4순위: 내장 백업
 */
export const SOURCES: KboDataSource[] = [
  myKboStatsSource,
  officialKboEnglishSource,
  theSportsDbSource,
  fallbackSource,
].sort((a, b) => a.priority - b.priority);

/**
 * @function getBestAvailableStandings
 * @description 등록된 순위 데이터 소스들을 우선순위 순서대로 시도하여 성공한 즉시 결과를 반환합니다.
 * @param {string} date - 수집 기준 일자 (YYYY-MM-DD)
 * @returns {Promise<SourceManagerStandingsResult>} 수집 완료된 순위 데이터 및 메타데이터
 */
export async function getBestAvailableStandings(date: string): Promise<SourceManagerStandingsResult> {
  console.log(`[SourceManager] [CALL] getBestAvailableStandings(date: "${date}")호출됨.`);
  const failedSources: FailedSourceAttempt[] = [];
  const warnings: string[] = [];

  for (const source of SOURCES) {
    console.log(`[SourceManager] standings 시도 중 -> [${source.id}] (우선순위: ${source.priority})`);
    
    // 3초 타임아웃 약속 생성
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('3000ms 시간 초과')), 3000);
    });

    try {
      // 해당 소스로부터 데이터 로딩 및 타임아웃 레이스 실행
      const result = await Promise.race([
        source.getStandings(date),
        timeoutPromise
      ]);

      if (result && result.teams && result.teams.length === 10) {
        console.log(`[SourceManager] standings 수집 성공! 소스 ID: "${source.id}"`);
        
        // 1순위 이외의 소스를 사용한 경우 유저 경고 알림 문구 작성
        if (source.id !== 'mykbostats') {
          warnings.push(`기본 소스(MyKBOStats) 수집 실패로 인해 보조 소스(${source.label})로 대체 연동되었습니다.`);
        }

        return {
          ...result,
          source: result.source || source.id,
          sourceLabel: source.label,
          fetchedAt: new Date().toISOString(),
          warnings: warnings.length > 0 ? warnings : undefined,
          failedSources: failedSources.length > 0 ? failedSources : undefined,
        };
      } else {
        throw new Error(`데이터 규격 위반 (수집된 팀 수: ${result?.teams?.length || 0}개)`);
      }
    } catch (err: any) {
      const reason = err.message || String(err);
      console.warn(`[SourceManager] standings 소스 "${source.id}" 장애 감지: ${reason}`);
      failedSources.push({
        source: source.id,
        reason,
      });
    }
  }

  // 만약 모든 소스가 기적적으로 실패했을 경우 마지막 방어막으로 내장 백업 강제 기동
  console.error('[SourceManager] 모든 standings 소스 수집 실패! 로컬 백업 긴급 기동.');
  const emergency = await fallbackSource.getStandings(date);
  return {
    ...emergency,
    source: 'bundled-fallback',
    sourceLabel: fallbackSource.label,
    fetchedAt: new Date().toISOString(),
    warnings: ['모든 원격 데이터 수집 장치가 일시적으로 중단되어, 내장 예비 시뮬레이션 데이터베이스를 사용해 확률을 연산합니다.'],
    failedSources,
  };
}

/**
 * @function getBestAvailableSchedule
 * @description 등록된 일정 데이터 소스들을 우선순위 순서대로 시도하여 성공한 즉시 결과를 반환합니다.
 * @param {string} fromDate - 일정 수집 시작 일자 (YYYY-MM-DD)
 * @returns {Promise<SourceManagerScheduleResult>} 수집 완료된 일정 데이터 및 메타데이터
 */
export async function getBestAvailableSchedule(fromDate: string): Promise<SourceManagerScheduleResult> {
  console.log(`[SourceManager] [CALL] getBestAvailableSchedule(fromDate: "${fromDate}")호출됨.`);
  const failedSources: FailedSourceAttempt[] = [];
  const warnings: string[] = [];

  for (const source of SOURCES) {
    console.log(`[SourceManager] schedule 시도 중 -> [${source.id}] (우선순위: ${source.priority})`);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('3000ms 시간 초과')), 3000);
    });

    try {
      const result = await Promise.race([
        source.getSchedule(fromDate),
        timeoutPromise
      ]);

      if (result && result.games && result.games.length > 0) {
        console.log(`[SourceManager] schedule 수집 성공! 소스 ID: "${source.id}" (경기 수: ${result.games.length})`);
        
        if (source.id !== 'mykbostats') {
          warnings.push(`기본 소스(MyKBOStats) 일정 수집 실패로 인해 보조 소스(${source.label})로 대체 연동되었습니다.`);
        }

        return {
          ...result,
          source: result.source || source.id,
          sourceLabel: source.label,
          fetchedAt: new Date().toISOString(),
          warnings: warnings.length > 0 ? warnings : undefined,
          failedSources: failedSources.length > 0 ? failedSources : undefined,
        };
      } else {
        throw new Error('수집된 경기 데이터가 존재하지 않습니다.');
      }
    } catch (err: any) {
      const reason = err.message || String(err);
      console.warn(`[SourceManager] schedule 소스 "${source.id}" 장애 감지: ${reason}`);
      failedSources.push({
        source: source.id,
        reason,
      });
    }
  }

  console.error('[SourceManager] 모든 schedule 소스 수집 실패! 로컬 백업 긴급 기동.');
  const emergency = await fallbackSource.getSchedule(fromDate);
  return {
    ...emergency,
    source: 'bundled-fallback',
    sourceLabel: fallbackSource.label,
    fetchedAt: new Date().toISOString(),
    warnings: ['모든 원격 일정 수집 장치가 일시적으로 중단되어, 내장 예비 잔여 시즌 스케줄러를 적용해 연산합니다.'],
    failedSources,
  };
}
