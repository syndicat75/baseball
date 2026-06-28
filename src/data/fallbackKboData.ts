/**
 * @file fallbackKboData.ts
 * @description 이 파일은 예약 수집된 JSON 파일(/data/kbo-latest.json)을 로드하는 데 실패했을 경우를 위한 내장 fallback 데이터셋을 정의합니다.
 * 모든 기능 호출마다 로그를 기록하고, 각 함수와 필드에 적절한 docstring을 부여합니다.
 */

import { fallbackTeams2026 } from './fallbackStandings2026';
import { fallbackSchedule2026 } from './fallbackSchedule2026';
import { KBOGame, StandingsTeam } from '../types';

export interface FallbackKboData {
  asOfDate: string;
  fetchedAt: string;
  primarySource: string;
  sourceLabel: string;
  standings: StandingsTeam[];
  remainingGames: KBOGame[];
  completedGames: KBOGame[];
}

/**
 * @constant fallbackKboData
 * @description 예약 수집 파일(/data/kbo-latest.json) 로드 실패 시 무조건 실행되어야 하는 KBO fallback 데이터셋입니다.
 * 10개 팀의 standings 정보와 remainingGames 최소 샘플을 포함하고 있습니다.
 */
export const fallbackKboData: FallbackKboData = {
  asOfDate: '2026-06-28',
  fetchedAt: '2026-06-28T14:28:35.801Z',
  primarySource: 'bundled-fallback',
  sourceLabel: '내장 fallback 데이터',
  standings: fallbackTeams2026.map(t => ({
    team: t.team,
    nameKo: t.nameKo,
    games: t.games,
    wins: t.wins,
    losses: t.losses,
    draws: t.draws,
    winRate: t.winRate,
    rank: t.rank,
  })),
  remainingGames: fallbackSchedule2026.filter((g: KBOGame) => g.status === 'scheduled'),
  completedGames: fallbackSchedule2026.filter((g: KBOGame) => g.status === 'completed'),
};

console.log('[fallbackKboData] [INIT] fallbackKboData has been constructed from fallbackStandings and fallbackSchedule.');
