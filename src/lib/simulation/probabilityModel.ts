/**
 * @file probabilityModel.ts
 * @description Implements the win/loss/draw probability calculation models: 'basic', 'winRate', and 'hybrid'.
 * Uses historical records, recent form, head-to-head records, and home advantages to project match outcomes.
 */

import { KBOGame } from '../kbo/parseSchedule';
import { StandingsTeam } from '../kbo/parseStandings';
import { ProbabilityModelType } from './types';

export interface MatchProbabilities {
  awayWin: number;  // 0.0 - 1.0
  homeWin: number;  // 0.0 - 1.0
  draw: number;     // 0.0 - 1.0
}

/**
 * Calculates the overall league-wide draw probability from completed games up to the snapshot date.
 * Falls back to 2.5% (0.025) if sample size is insufficient.
 */
export function calculateLeagueDrawRate(completedGames: KBOGame[]): number {
  console.log(`[probabilityModel] calculateLeagueDrawRate called with ${completedGames.length} completed games`);
  if (completedGames.length < 20) {
    console.log(`[probabilityModel] Low sample size for draw rate calculation. Using default 2.5%`);
    return 0.025;
  }

  const draws = completedGames.filter(g => {
    if (g.awayScore !== null && g.homeScore !== null) {
      return g.awayScore === g.homeScore;
    }
    return g.status === 'completed' && g.awayScore === g.homeScore;
  }).length;

  const drawRate = draws / completedGames.length;
  console.log(`[probabilityModel] Calculated league draw rate: ${(drawRate * 100).toFixed(2)}% (${draws}/${completedGames.length} games)`);
  
  // Keep it within a realistic range [0.01, 0.06]
  return Math.max(0.01, Math.min(0.06, drawRate));
}

/**
 * Helper to compute the recent 10 games form (win rate) for a team from completed games list.
 * Searches completed games on or before the snapshot date.
 */
export function getTeamRecentForm(team: string, dateStr: string, completedGames: KBOGame[]): number {
  const teamGames = completedGames
    .filter(g => (g.away === team || g.home === team) && g.date <= dateStr)
    .sort((a, b) => b.date.localeCompare(a.date)) // Sort descending to get latest games first
    .slice(0, 10);

  if (teamGames.length === 0) return 0.5; // Neutral starting form

  let wins = 0;
  let losses = 0;

  teamGames.forEach(g => {
    const isAway = g.away === team;
    const isHome = g.home === team;
    if (g.awayScore !== null && g.homeScore !== null) {
      if (g.awayScore > g.homeScore && isAway) wins++;
      else if (g.homeScore > g.awayScore && isHome) wins++;
      else if (g.awayScore !== g.homeScore) losses++; // The other team won
    }
  });

  const winRate = wins / (wins + losses || 1);
  return winRate;
}

/**
 * Computes win/loss/draw probabilities for a specific future game based on the chosen model.
 * 
 * @param awayTeamCode - Standard code for away team
 * @param homeTeamCode - Standard code for home team
 * @param dateStr - Snapshot date for historical context
 * @param standingsTeams - Standings of teams as of the snapshot date
 * @param headToHead - Head-to-head record grid up to the snapshot date
 * @param completedGames - List of completed games up to snapshot date (used for hybrid form calculations)
 * @param modelType - Probability model to execute
 * @param defaultDrawRate - Precalculated default draw probability
 */
export function calculateMatchProbabilities(
  awayTeamCode: string,
  homeTeamCode: string,
  dateStr: string,
  standingsTeams: StandingsTeam[],
  headToHead: Record<string, Record<string, { wins: number; losses: number; draws: number }>>,
  completedGames: KBOGame[],
  modelType: ProbabilityModelType,
  defaultDrawRate: number
): MatchProbabilities {
  
  const draw = defaultDrawRate;
  const remaining = 1.0 - draw;

  // Find standings records for teams
  const awayStand = standingsTeams.find(t => t.team === awayTeamCode);
  const homeStand = standingsTeams.find(t => t.team === homeTeamCode);

  const awayWR = awayStand ? awayStand.winRate : 0.5;
  const homeWR = homeStand ? homeStand.winRate : 0.5;

  if (modelType === 'basic') {
    // 50:50 model
    return {
      awayWin: remaining / 2,
      homeWin: remaining / 2,
      draw
    };
  }

  // Common WinRate calculation
  let awayWinWR = 0.5;
  let homeWinWR = 0.5;
  if (awayWR > 0 || homeWR > 0) {
    awayWinWR = awayWR / (awayWR + homeWR);
    homeWinWR = homeWR / (awayWR + homeWR);
  }

  if (modelType === 'winRate') {
    // Base strengths on standings
    let awayBase = awayWinWR;
    let homeBase = homeWinWR;

    // Apply home advantage +2.5%p
    homeBase += 0.025;
    awayBase -= 0.025;

    // Clamp
    homeBase = Math.max(0.1, Math.min(0.9, homeBase));
    awayBase = Math.max(0.1, Math.min(0.9, awayBase));

    // Normalize to remaining probability
    const sum = awayBase + homeBase;
    return {
      awayWin: (awayBase / sum) * remaining,
      homeWin: (homeBase / sum) * remaining,
      draw
    };
  }

  if (modelType === 'hybrid') {
    // 1. Standings win rate component (60%)
    const wrAway = awayWinWR;
    const wrHome = homeWinWR;

    // 2. Head-to-head record component (25%)
    let h2hAway = wrAway; // default regress to general standings
    let h2hHome = wrHome;

    const h2hRecord = headToHead[awayTeamCode]?.[homeTeamCode];
    if (h2hRecord) {
      const h2hWins = h2hRecord.wins;
      const h2hLosses = h2hRecord.losses;
      const h2hGames = h2hWins + h2hLosses;

      // Only use H2H if they have played at least 3 games
      if (h2hGames >= 3) {
        h2hAway = h2hWins / h2hGames;
        h2hHome = h2hLosses / h2hGames;
      }
    }

    // 3. Recent 10 games form component (15%)
    const formAway = getTeamRecentForm(awayTeamCode, dateStr, completedGames);
    const formHome = getTeamRecentForm(homeTeamCode, dateStr, completedGames);

    let recentAway = 0.5;
    let recentHome = 0.5;
    if (formAway > 0 || formHome > 0) {
      recentAway = formAway / (formAway + formHome);
      recentHome = formHome / (formAway + formHome);
    }

    // Combine factors
    let awayBase = 0.60 * wrAway + 0.25 * h2hAway + 0.15 * recentAway;
    let homeBase = 0.60 * wrHome + 0.25 * h2hHome + 0.15 * recentHome;

    // Apply home advantage +2.5%p
    homeBase += 0.025;
    awayBase -= 0.025;

    // Clamp to prevent complete certainties (maintain [0.1, 0.9])
    homeBase = Math.max(0.1, Math.min(0.9, homeBase));
    awayBase = Math.max(0.1, Math.min(0.9, awayBase));

    // Normalize to remaining probability (sum should equal remaining)
    const sum = awayBase + homeBase;
    return {
      awayWin: (awayBase / sum) * remaining,
      homeWin: (homeBase / sum) * remaining,
      draw
    };
  }

  // Safety fallback
  return {
    awayWin: remaining / 2,
    homeWin: remaining / 2,
    draw
  };
}
