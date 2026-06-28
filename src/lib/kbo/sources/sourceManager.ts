/**
 * @file sourceManager.ts
 * @description KBO 데이터 수집을 위한 다중 데이터 소스 통합 관리자(Source Manager)입니다.
 * 우선순위에 따라 각 데이터 소스(KBO 공식 영문, MyKBOStats, AiScore, 내장 백업)를 순차 호출하며,
 * 최대 5초의 타임아웃을 적용해 무중단 가동을 보장합니다.
 */

import { KBOStandingsResult, KBOScheduleResult, KBOGame, StandingsTeam } from '../../../types';
import { KboDataSource, KBOStanding } from './index';
import { officialKboEnglishSource } from './officialKboEnglishSource';
import { myKboStatsSource } from './myKboStatsSource';
import { aiScoreSource } from './aiScoreSource';
import { fallbackSource } from './fallbackSource';
import { CONFIG } from '../../../config';

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
 * 우선순위에 따라 정렬된 데이터 소스 목록입니다.
 * 1순위: KBO 공식 영문, 2순위: MyKBOStats, 3순위: AiScore, 4순위: 내장 백업
 */
export const SOURCES: KboDataSource[] = [
  officialKboEnglishSource,
  myKboStatsSource,
  aiScoreSource,
  fallbackSource,
].sort((a, b) => a.priority - b.priority);

/**
 * @function getEstimatedHeadToHead
 * @description 수집된 팀 정보와 승률을 기반으로 상대 전적 기록을 결정론적으로 추정합니다.
 */
export function getEstimatedHeadToHead(teams: KBOStanding[]): Record<string, Record<string, { wins: number; losses: number; draws: number }>> {
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

/**
 * @function getBestAvailableStandings
 * @description 등록된 순위 데이터 소스들을 우선순위 순서대로 시도하여 성공한 즉시 결과를 반환합니다.
 * @param {string} [date] - 수집 기준 일자 (생략 시 KST 기준 오늘 날짜)
 * @returns {Promise<SourceManagerStandingsResult>} 수집 완료된 순위 데이터 및 메타데이터
 */
export async function getBestAvailableStandings(date?: string): Promise<SourceManagerStandingsResult> {
  const targetDate = date || new Date().toISOString().split('T')[0];
  console.log(`[SourceManager] [CALL] getBestAvailableStandings(date: "${targetDate}")`);
  
  const failedSources: FailedSourceAttempt[] = [];
  const warnings: string[] = [];

  for (const source of SOURCES) {
    console.log(`[SourceManager] Standings 시도 중 -> [${source.id}] (우선순위: ${source.priority})`);
    
    // 5초 타임아웃 약속 생성
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('5000ms 시간 초과')), 5000);
    });

    try {
      const parsedTeams = await Promise.race([
        source.getStandings(),
        timeoutPromise
      ]);

      if (parsedTeams && parsedTeams.length === 10) {
        console.log(`[SourceManager] Standings 수집 성공! 소스 ID: "${source.id}"`);
        
        if (source.id !== 'official-kbo-en') {
          warnings.push(`기본 소스(KBO 공식 영문) 수집 실패로 인해 보조 소스(${source.label})로 대체 연동되었습니다.`);
        }

        const formattedTeams: StandingsTeam[] = parsedTeams.map(t => ({
          team: t.team,
          nameKo: t.nameKo || CONFIG.TEAMS[t.team]?.nameKo || t.team,
          games: t.games,
          wins: t.wins,
          losses: t.losses,
          draws: t.draws,
          winRate: t.winRate,
          rank: t.rank,
        }));

        const headToHead = getEstimatedHeadToHead(parsedTeams);

        return {
          asOfDate: targetDate,
          source: source.id,
          sourceLabel: source.label,
          fetchedAt: new Date().toISOString(),
          teams: formattedTeams,
          headToHead,
          warnings: warnings.length > 0 ? warnings : undefined,
          failedSources: failedSources.length > 0 ? failedSources : undefined,
        };
      } else {
        throw new Error(`데이터 규격 위반 (수집된 팀 수: ${parsedTeams?.length || 0}개)`);
      }
    } catch (err: any) {
      const reason = err.message || String(err);
      console.warn(`[SourceManager] Standings 소스 "${source.id}" 장애 감지: ${reason}`);
      failedSources.push({
        source: source.id,
        reason,
      });
    }
  }

  // 모든 수립 수단 실패 시 마지막 예비 방어막 기동
  console.error('[SourceManager] 모든 Standings 소스 수집 실패! 로컬 백업 긴급 기동.');
  const backupTeams = await fallbackSource.getStandings();
  const formattedBackup = backupTeams.map(t => ({
    team: t.team,
    nameKo: t.nameKo || CONFIG.TEAMS[t.team]?.nameKo || t.team,
    games: t.games,
    wins: t.wins,
    losses: t.losses,
    draws: t.draws,
    winRate: t.winRate,
    rank: t.rank,
  }));
  const backupHeadToHead = getEstimatedHeadToHead(backupTeams);

  return {
    asOfDate: targetDate,
    source: 'bundled-fallback',
    sourceLabel: fallbackSource.label,
    fetchedAt: new Date().toISOString(),
    teams: formattedBackup,
    headToHead: backupHeadToHead,
    warnings: ['모든 원격 데이터 수집 장치가 일시적으로 중단되어, 내장 예비 시뮬레이션 데이터를 사용해 확률을 연산합니다.'],
    failedSources,
  };
}

/**
 * @function getBestAvailableSchedule
 * @description 등록된 일정 데이터 소스들을 우선순위 순서대로 시도하여 성공한 즉시 결과를 반환합니다.
 * @param {string} [fromDate] - 일정 수집 시작 일자 (생략 시 KST 기준 오늘 날짜)
 * @returns {Promise<SourceManagerScheduleResult>} 수집 완료된 일정 데이터 및 메타데이터
 */
export async function getBestAvailableSchedule(fromDate?: string): Promise<SourceManagerScheduleResult> {
  const targetDate = fromDate || new Date().toISOString().split('T')[0];
  console.log(`[SourceManager] [CALL] getBestAvailableSchedule(fromDate: "${targetDate}")`);
  const failedSources: FailedSourceAttempt[] = [];
  const warnings: string[] = [];

  for (const source of SOURCES) {
    console.log(`[SourceManager] Schedule 시도 중 -> [${source.id}] (우선순위: ${source.priority})`);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('5000ms 시간 초과')), 5000);
    });

    try {
      const result = await Promise.race([
        source.getSchedule(),
        timeoutPromise
      ]);

      if (result && (result.completedGames.length > 0 || result.remainingGames.length > 0)) {
        console.log(`[SourceManager] Schedule 수집 성공! 소스 ID: "${source.id}" (남은 경기 수: ${result.remainingGames.length})`);
        
        if (source.id !== 'official-kbo-en') {
          warnings.push(`기본 소스(KBO 공식 영문) 일정 수집 실패로 인해 보조 소스(${source.label})로 대체 연동되었습니다.`);
        }

        // 전체 일정을 하나의 리스트로 합치고, 그 중 unresolved(scheduled) 경기를 가려냅니다.
        const allGames = [...result.completedGames, ...result.remainingGames];
        const unresolvedGames = result.remainingGames.filter(g => g.status === 'scheduled');

        return {
          from: targetDate,
          games: allGames,
          unresolvedGames,
          source: source.id,
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
      console.warn(`[SourceManager] Schedule 소스 "${source.id}" 장애 감지: ${reason}`);
      failedSources.push({
        source: source.id,
        reason,
      });
    }
  }

  console.error('[SourceManager] 모든 Schedule 소스 수집 실패! 로컬 백업 긴급 기동.');
  const emergency = await fallbackSource.getSchedule();
  const allEmergencyGames = [...emergency.completedGames, ...emergency.remainingGames];
  const unresolvedEmergency = emergency.remainingGames.filter(g => g.status === 'scheduled');

  return {
    from: targetDate,
    games: allEmergencyGames,
    unresolvedGames: unresolvedEmergency,
    source: 'bundled-fallback',
    sourceLabel: fallbackSource.label,
    fetchedAt: new Date().toISOString(),
    warnings: ['모든 원격 일정 수집 장치가 일시적으로 중단되어, 내장 예비 잔여 시즌 스케줄러를 적용해 연산합니다.'],
    failedSources,
  };
}
