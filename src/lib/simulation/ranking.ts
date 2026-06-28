/**
 * @file ranking.ts
 * @description Standardizes KBO regular season ranking calculations and tie-breaking mechanics.
 * Handles equal win rate splits for postseason entries and average rank projections.
 */

export interface SimTeamSeasonRecord {
  team: string;
  wins: number;
  losses: number;
  draws: number;
}

export interface ResolvedRank {
  team: string;
  rank: number;             // Standard joint competition rank (e.g., joint 3rd)
  averageRankVal: number;   // Fractional rank (e.g., 3.5) for precise averaging
  playoffScore: number;     // Postseason entry credit: 1.0 (made it), 0.0 (missed), or fraction (tied across boundary)
  winRate: number;
}

/**
 * Ranks teams based on their season win/loss records and computes tie-break distributions.
 * 
 * If teams are tied on win rate:
 * - They share the same joint rank.
 * - If the tie spans across the 5th place boundary (the playoff threshold),
 *   the available playoff slots are split equally among the tied teams.
 * 
 * @param records - List of teams with their simulated final wins, losses, and draws.
 * @returns Map of team codes to their resolved rankings and postseason credits.
 */
export function resolveFinalStandings(records: SimTeamSeasonRecord[]): Record<string, ResolvedRank> {
  // 1. Calculate win rate and map
  const teamsWithWinRates = records.map(r => {
    const denom = r.wins + r.losses;
    const winRate = denom > 0 ? r.wins / denom : 0;
    return {
      team: r.team,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      winRate: Math.round(winRate * 10000) / 10000, // 4 decimal places for sorting
    };
  });

  // 2. Sort by KBO rules:
  // - Primary: Win Rate (descending)
  // - Secondary: Wins (descending)
  // (We can extend with head-to-head records here for the 2nd stage if needed)
  teamsWithWinRates.sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.wins - a.wins;
  });

  // 3. Group and resolve ties
  const results: Record<string, ResolvedRank> = {};
  let idx = 0;
  const numTeams = teamsWithWinRates.length;

  while (idx < numTeams) {
    const currentTeam = teamsWithWinRates[idx];
    
    // Find all teams tied with current team
    const tiedGroup = [currentTeam];
    let scanIdx = idx + 1;
    while (scanIdx < numTeams) {
      const scanTeam = teamsWithWinRates[scanIdx];
      if (scanTeam.winRate === currentTeam.winRate && scanTeam.wins === currentTeam.wins) {
        tiedGroup.push(scanTeam);
        scanIdx++;
      } else {
        break;
      }
    }

    const numTied = tiedGroup.length;
    const startIndex = idx; // 0-indexed start
    const endIndex = idx + numTied - 1; // 0-indexed end

    // Calculate how many playoff slots are covered by this tied group.
    // Playoff slots are indices 0, 1, 2, 3, 4 (Top 5 teams).
    let playoffSlotsWon = 0;
    for (let slot = startIndex; slot <= endIndex; slot++) {
      if (slot < 5) {
        playoffSlotsWon++;
      }
    }

    // Playoff credit per team in the tied group
    const playoffScore = playoffSlotsWon / numTied;

    // Rank calculations
    const jointRank = startIndex + 1; // Standard rank (e.g. if 2 tied for 1st, both are rank 1)
    // Average rank for precise averaging across iterations (e.g. if indices are 2, 3, 4, avg is 3)
    const averageRankVal = (startIndex + endIndex) / 2 + 1;

    // Store results
    tiedGroup.forEach(t => {
      results[t.team] = {
        team: t.team,
        rank: jointRank,
        averageRankVal,
        playoffScore,
        winRate: t.winRate,
      };
    });

    // Advance loop
    idx += numTied;
  }

  return results;
}
