/**
 * @file buildSnapshotByDate.ts
 * @description Constructs a snapshot of team standings and head-to-head records as of any selected date.
 * For today, it prefers live official KBO standings; for past dates, it rolls up schedule match results.
 */

import { CONFIG } from '../../config';
import { parseStandings, getFallbackStandings } from './parseStandings';
import { getFullSeasonSchedule } from './parseSchedule';
import { KBOStandingsResult, StandingsTeam, KBOGame } from '../../types';
import { fallbackStandings2026 } from '../../data/fallbackStandings2026';

/**
 * Returns the current date string in Asia/Seoul timezone (Korea Standard Time) in YYYY-MM-DD format.
 * Used for precise date boundaries regardless of server container local clock.
 * 
 * @returns Date string formatted as YYYY-MM-DD.
 */
export function getKstDateString(): string {
  const kstTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' });
  const d = new Date(kstTime);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const result = `${year}-${month}-${day}`;
  console.log(`[buildSnapshotByDate] [CALL] getKstDateString - Resolved KST: "${result}"`);
  return result;
}

/**
 * Rebuilds team standings and head-to-head records from scratch by accumulating game results from the schedule.
 * 
 * @param dateStr - The snapshot date in YYYY-MM-DD format
 * @param allGames - The full list of games for the season
 * @returns KBOStandingsResult containing standings and head-to-head records up to the snapshot date
 */
export function reconstructStandingsFromSchedule(dateStr: string, allGames: KBOGame[]): KBOStandingsResult {
  console.log(`[buildSnapshotByDate] [CALL] reconstructStandingsFromSchedule - Date: "${dateStr}" using ${allGames.length} season games`);

  const teamCodes = Object.keys(CONFIG.TEAMS);
  
  // Initialize standings records
  const stats: Record<string, { wins: number; losses: number; draws: number; games: number }> = {};
  for (const team of teamCodes) {
    stats[team] = { wins: 0, losses: 0, draws: 0, games: 0 };
  }

  // Initialize head-to-head records
  const headToHead: Record<string, Record<string, { wins: number; losses: number; draws: number }>> = {};
  for (const t1 of teamCodes) {
    headToHead[t1] = {};
    for (const t2 of teamCodes) {
      if (t1 !== t2) {
        headToHead[t1][t2] = { wins: 0, losses: 0, draws: 0 };
      }
    }
  }

  // Filter games played on or before the snapshot date that are completed
  const playedGames = allGames.filter(g => g.date <= dateStr && g.status === 'completed');
  console.log(`[buildSnapshotByDate] Reconstructed: Found ${playedGames.length} completed games played on or before ${dateStr}`);

  playedGames.forEach(g => {
    const { away, home, awayScore, homeScore } = g;
    if (!stats[away] || !stats[home]) return; // Skip unknown teams

    stats[away].games += 1;
    stats[home].games += 1;

    if (awayScore === null || homeScore === null) {
      // Treat as draw if completed but scores missing (rare anomaly)
      stats[away].draws += 1;
      stats[home].draws += 1;
      if (headToHead[away] && headToHead[away][home]) headToHead[away][home].draws += 1;
      if (headToHead[home] && headToHead[home][away]) headToHead[home][away].draws += 1;
    } else if (awayScore === homeScore) {
      // Draw
      stats[away].draws += 1;
      stats[home].draws += 1;
      if (headToHead[away] && headToHead[away][home]) headToHead[away][home].draws += 1;
      if (headToHead[home] && headToHead[home][away]) headToHead[home][away].draws += 1;
    } else if (awayScore > homeScore) {
      // Away win
      stats[away].wins += 1;
      stats[home].losses += 1;
      if (headToHead[away] && headToHead[away][home]) headToHead[away][home].wins += 1;
      if (headToHead[home] && headToHead[home][away]) headToHead[home][away].losses += 1;
    } else {
      // Home win
      stats[home].wins += 1;
      stats[away].losses += 1;
      if (headToHead[home] && headToHead[home][away]) headToHead[home][away].wins += 1;
      if (headToHead[away] && headToHead[away][home]) headToHead[away][home].losses += 1;
    }
  });

  // Calculate win rate: wins / (wins + losses). If wins + losses === 0, winRate is 0.
  const teamsList: StandingsTeam[] = teamCodes.map(team => {
    const { wins, losses, draws, games } = stats[team];
    const winRateDenom = wins + losses;
    const winRate = winRateDenom > 0 ? wins / winRateDenom : 0;

    return {
      team,
      nameKo: CONFIG.TEAMS[team]?.nameKo || team,
      games,
      wins,
      losses,
      draws,
      winRate: Math.round(winRate * 1000) / 1000,
      rank: 1, // Will be sorted and updated below
    };
  });

  // Sort teams by KBO ranking criteria:
  // 1. Win Rate (descending)
  // 2. Wins (descending)
  // 3. Alphabetical fallback
  teamsList.sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.team.localeCompare(b.team);
  });

  // Assign ranks (handles ties gracefully)
  for (let idx = 0; idx < teamsList.length; idx++) {
    if (idx > 0) {
      const prev = teamsList[idx - 1];
      const curr = teamsList[idx];
      // KBO ranking rules: if winRate and wins are identical, they share the same rank
      if (curr.winRate === prev.winRate && curr.wins === prev.wins) {
        curr.rank = prev.rank;
      } else {
        curr.rank = idx + 1;
      }
    } else {
      teamsList[idx].rank = 1;
    }
  }

  return {
    asOfDate: dateStr,
    source: 'official-kbo', // Compiled from official schedule records
    teams: teamsList,
    headToHead,
  };
}

/**
 * Builds a standings snapshot for the selected date.
 * If the date is today, it attempts to fetch current standings. If it fails or is a past date,
 * it falls back to rolling up games from the cached season schedule.
 * 
 * @param dateStr - The selected date in YYYY-MM-DD format
 * @param forceRefresh - If true, clears caches and does a full reload.
 * @returns Standings and head-to-head records
 */
export async function buildSnapshotByDate(dateStr: string, forceRefresh = false): Promise<KBOStandingsResult> {
  console.log(`[buildSnapshotByDate] [CALL] buildSnapshotByDate - Date: "${dateStr}", Force Refresh: ${forceRefresh}`);

  const todayStr = getKstDateString();

  // If selecting today (or future), try to parse official standings first
  if (dateStr >= todayStr) {
    console.log(`[buildSnapshotByDate] Requested date is today or future ("${dateStr}"). Running standings compiler...`);
    const standings = await parseStandings(dateStr);
    console.log(`[buildSnapshotByDate] Standings compiler finished (source: "${standings.source}"). Returning immediately.`);
    return standings;
  }

  // Load the complete schedule (completed + scheduled) to reconstruct standings
  try {
    const year = parseInt(dateStr.split('-')[0]) || 2026;
    console.log(`[buildSnapshotByDate] Reconstructing standings for past date "${dateStr}" using full season schedule for year ${year}...`);
    
    const fullSeasonGames = await getFullSeasonSchedule(year, forceRefresh);
    const snapshot = reconstructStandingsFromSchedule(dateStr, fullSeasonGames);
    return snapshot;
  } catch (error: any) {
    console.error(`[buildSnapshotByDate] Failed to build snapshot from schedule:`, error);
    // Ultimate fallback is realistic dummy standings
    return getFallbackStandings(dateStr, 'HTML parser 실패', `과거 날짜 순위 재구성 오류: ${error.message}`);
  }
}
