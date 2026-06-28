/**
 * @file fallbackStandings2026.ts
 * @description Bundled fallback standings data for the 2026 season.
 * Ensures the app can function gracefully with offline/failover KBO data.
 */

import { KBOStandingsResult, StandingsTeam } from '../types';
import { CONFIG } from '../config';

console.log('[fallbackStandings2026] Bundled fallback standings loaded.');

/**
 * Static fallback standings representing mid-season 2026 standings.
 */
export const fallbackTeams2026: StandingsTeam[] = [
  { team: 'KIA', nameKo: 'KIA', games: 80, wins: 48, losses: 30, draws: 2, winRate: 0.615, rank: 1 },
  { team: 'SAMSUNG', nameKo: '삼성', games: 80, wins: 46, losses: 32, draws: 2, winRate: 0.590, rank: 2 },
  { team: 'LG', nameKo: 'LG', games: 81, wins: 45, losses: 34, draws: 2, winRate: 0.570, rank: 3 },
  { team: 'DOOSAN', nameKo: '두산', games: 82, wins: 44, losses: 36, draws: 2, winRate: 0.550, rank: 4 },
  { team: 'SSG', nameKo: 'SSG', games: 80, wins: 41, losses: 38, draws: 1, winRate: 0.519, rank: 5 },
  { team: 'KT', nameKo: 'KT', games: 81, wins: 38, losses: 41, draws: 2, winRate: 0.481, rank: 6 },
  { team: 'HANWHA', nameKo: '한화', games: 79, wins: 36, losses: 41, draws: 2, winRate: 0.468, rank: 7 },
  { team: 'LOTTE', nameKo: '롯데', games: 78, wins: 34, losses: 41, draws: 3, winRate: 0.453, rank: 8 },
  { team: 'NC', nameKo: 'NC', games: 80, wins: 35, losses: 43, draws: 2, winRate: 0.449, rank: 9 },
  { team: 'KIWOOM', nameKo: '키움', games: 79, wins: 31, losses: 48, draws: 0, winRate: 0.392, rank: 10 },
];

/**
 * Generates deterministic head-to-head records for the bundled fallback.
 */
function generateHeadToHead(): Record<string, Record<string, { wins: number; losses: number; draws: number }>> {
  console.log('[fallbackStandings2026] [CALL] generateHeadToHead');
  const headToHead: Record<string, Record<string, { wins: number; losses: number; draws: number }>> = {};
  const teamCodes = Object.keys(CONFIG.TEAMS);
  
  for (const t1 of teamCodes) {
    headToHead[t1] = {};
    for (const t2 of teamCodes) {
      if (t1 === t2) continue;
      const charSum = t1.charCodeAt(0) + t2.charCodeAt(0);
      const wins = charSum % 5;
      const losses = 8 - wins - (charSum % 2 === 0 ? 0 : 1);
      const draws = 8 - wins - losses;
      headToHead[t1][t2] = {
        wins,
        losses,
        draws: Math.max(0, draws)
      };
    }
  }
  return headToHead;
}

export const fallbackStandings2026: KBOStandingsResult = {
  asOfDate: '2026-06-28',
  source: 'bundled-fallback',
  teams: fallbackTeams2026,
  headToHead: generateHeadToHead(),
  errorType: '샘플 데이터 사용',
  errorMessage: '공식 데이터를 수집하지 못해 내장 번들 데이터셋을 사용합니다.',
};
