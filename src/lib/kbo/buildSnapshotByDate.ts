/**
 * @file buildSnapshotByDate.ts
 * @description Constructs a snapshot of team standings and head-to-head records as of any selected date.
 * For today, it prefers live official KBO standings; for past dates, it rolls up schedule match results.
 */

import { CONFIG } from '../../config';
import { parseStandings, KBOStandingsResult, StandingsTeam } from './parseStandings';
import { getSchedule, KBOGame } from './parseSchedule';

/**
 * Rebuilds team standings and head-to-head records from scratch by accumulating game results from the schedule.
 * 
 * @param dateStr - The snapshot date in YYYY-MM-DD format
 * @param allGames - The full list of games for the season
 * @returns KBOStandingsResult containing standings and head-to-head records up to the snapshot date
 */
export function reconstructStandingsFromSchedule(dateStr: string, allGames: KBOGame[]): KBOStandingsResult {
  console.log(`[buildSnapshot] Reconstructing standings up to date: "${dateStr}" using ${allGames.length} season games`);

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
  console.log(`[buildSnapshot] Found ${playedGames.length} completed games played on or before ${dateStr}`);

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
  let currentRank = 1;
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
    currentRank = idx + 1;
  }

  return {
    asOfDate: dateStr,
    source: 'official-kbo', // Since we compiled from official schedule items
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
  console.log(`[buildSnapshot] buildSnapshotByDate called for date: "${dateStr}", Force Refresh: ${forceRefresh}`);

  const todayStr = new Date().toISOString().split('T')[0];

  // If selecting today, try to parse official standings first
  if (dateStr === todayStr && !forceRefresh) {
    try {
      console.log(`[buildSnapshot] Requested date is today. Attempting official KBO standings parse...`);
      const standings = await parseStandings(dateStr);
      if (standings.source === 'official-kbo') {
        console.log(`[buildSnapshot] Successfully fetched live official standings.`);
        return standings;
      }
    } catch (e) {
      console.warn(`[buildSnapshot] Failed to parse live standings. Falling back to schedule reconstruction...`, e);
    }
  }

  // Load the complete schedule (completed + scheduled) to reconstruct standings
  try {
    const scheduleResult = await getSchedule(dateStr, forceRefresh);
    // Note: getSchedule returns games starting from dateStr. We need the *full* schedule list
    // to build past standings. So we fetch with '2026-03-01' (start of season) to get ALL games!
    const startOfSeason = `${dateStr.substring(0, 4)}-03-01`;
    const fullSchedule = await getSchedule(startOfSeason, forceRefresh);
    
    const snapshot = reconstructStandingsFromSchedule(dateStr, fullSchedule.games);
    return snapshot;
  } catch (error) {
    console.error(`[buildSnapshot] Failed to build snapshot from schedule:`, error);
    // Ultimate fallback is realistic dummy standings
    return {
      asOfDate: dateStr,
      source: 'fallback-sample',
      teams: [
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
      ],
      headToHead: {},
    };
  }
}
