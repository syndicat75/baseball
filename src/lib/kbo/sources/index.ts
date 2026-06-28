/**
 * @file index.ts
 * @description KBO 데이터 소스 패키지의 메인 엔트리 포인트입니다.
 * 모든 소스 어댑터 및 통합 관리자(Source Manager)의 API를 외부로 재수출합니다.
 */

import { KBOGame } from '../../../types';

export interface KBOStanding {
  team: string;
  displayName: string;
  nameKo?: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  rank: number;
}

export interface KboDataSource {
  id: string;
  label: string;
  priority: number;
  getStandings(): Promise<KBOStanding[]>;
  getSchedule(): Promise<{ completedGames: KBOGame[]; remainingGames: KBOGame[] }>;
}

export { fetchWithTimeout } from './fetchWithTimeout';
export { myKboStatsSource } from './myKboStatsSource';
export { officialKboEnglishSource } from './officialKboEnglishSource';
export { aiScoreSource } from './aiScoreSource';
export { fallbackSource } from './fallbackSource';
export { getBestAvailableStandings, getBestAvailableSchedule } from './sourceManager';
