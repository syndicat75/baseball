/**
 * @file simulateSeason.ts
 * @description Core Monte Carlo engine for KBO season simulation.
 * Precomputes match probabilities, runs highly optimized simulation loops, and aggregates outcomes.
 */

import { KBOGame, KBOStandingsResult, StandingsTeam, SimulationOptions, TeamSimulationStats, SimulationResponse } from '../../types';
import { calculateLeagueDrawRate, calculateMatchProbabilities, MatchProbabilities } from './probabilityModel';
import { resolveFinalStandings } from './ranking';
import { CONFIG } from '../../config';

/**
 * Deterministic Linear Congruential Generator (LCG) for reproducible simulation runs.
 */
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    // Standard LCG parameters (Numerical Recipes)
    this.state = seed > 0 ? seed : Math.floor(Math.random() * 233280);
  }

  /**
   * Generates a pseudo-random floating point number in [0, 1)
   */
  next(): number {
    this.state = (this.state * 9301 + 49297) % 233280;
    return this.state / 233280;
  }
}

/**
 * Executes a Monte Carlo simulation of the remaining KBO regular season.
 * 
 * @param standings - Current standings snapshot up to reference date
 * @param remainingSchedule - List of actual future regular season games
 * @param unresolvedGames - Unresolved postponed games for schedule correction
 * @param options - Simulation options (iterations, model, seed)
 * @returns Fully compiled simulation results and team probability statistics
 */
export async function simulateSeason(
  standings: KBOStandingsResult,
  remainingSchedule: KBOGame[],
  unresolvedGames: KBOGame[],
  options: SimulationOptions
): Promise<SimulationResponse> {
  const { date, iterations, model, seed } = options;
  console.log(`[simulateSeason] Initializing simulation: ${iterations} iterations, Model: "${model}", Date: ${date}, Seed: ${seed}`);

  const startTime = Date.now();
  const rng = new SeededRandom(seed || 42); // Use default seed if not provided for stable displays

  // 1. Combine all games to simulate
  const gamesToSimulate = [...remainingSchedule, ...unresolvedGames];
  console.log(`[simulateSeason] Total games to simulate: ${gamesToSimulate.length} (${remainingSchedule.length} scheduled, ${unresolvedGames.length} unresolved)`);

  // 2. Pre-calculate league-wide draw rate up to this date
  const completedGames = standings.teams.length > 0 ? [] : []; // We would pass all completed games if we had them.
  // We can derive completed games count from standings or just pass an empty array, which falls back to the stable 2.5% KBO default.
  const drawRate = 0.025; // 2.5% is the standard league average in KBO

  // 3. Pre-calculate win/loss/draw probabilities for every single matchup to speed up the loop
  const precomputedProbs: Array<{
    away: string;
    home: string;
    probs: MatchProbabilities;
  }> = [];

  gamesToSimulate.forEach(g => {
    const probs = calculateMatchProbabilities(
      g.away,
      g.home,
      date,
      standings.teams,
      standings.headToHead,
      [], // We don't need raw game lists unless performing advanced hybrid form
      model,
      drawRate
    );
    precomputedProbs.push({
      away: g.away,
      home: g.home,
      probs,
    });
  });

  console.log(`[simulateSeason] Completed matchup probability pre-computation.`);

  // 4. Initialize simulation counters for each team
  const teams = standings.teams.map(t => t.team);
  const totalWins: Record<string, number> = {};
  const totalLosses: Record<string, number> = {};
  const totalDraws: Record<string, number> = {};
  const totalPlayoffScores: Record<string, number> = {};
  const totalRanks: Record<string, number> = {};
  const rankDistributions: Record<string, Record<number, number>> = {};
  const finalWinsPlayoffCounts: Record<string, Record<number, { total: number; playoff: number }>> = {};

  teams.forEach(team => {
    totalWins[team] = 0;
    totalLosses[team] = 0;
    totalDraws[team] = 0;
    totalPlayoffScores[team] = 0;
    totalRanks[team] = 0;
    rankDistributions[team] = {};
    finalWinsPlayoffCounts[team] = {};
    for (let r = 1; r <= 10; r++) {
      rankDistributions[team][r] = 0;
    }
  });

  const teamGameCounts: Record<string, { actual: number; synthetic: number }> = {};
  teams.forEach(t => {
    teamGameCounts[t] = { actual: 0, synthetic: 0 };
  });
  gamesToSimulate.forEach(g => {
    const isSynthetic = g.synthetic === true;
    if (teamGameCounts[g.away] !== undefined) {
      if (isSynthetic) teamGameCounts[g.away].synthetic++;
      else teamGameCounts[g.away].actual++;
    }
    if (teamGameCounts[g.home] !== undefined) {
      if (isSynthetic) teamGameCounts[g.home].synthetic++;
      else teamGameCounts[g.home].actual++;
    }
  });

  const fifthPlaceWinsSamples: number[] = [];
  const fifthPlaceWinRateSamples: number[] = [];

  // 5. Run Monte Carlo Loop
  // We allocate arrays outside the loop to reduce GC pressure
  const tempRecords = teams.map(t => {
    const s = standings.teams.find(st => st.team === t)!;
    return {
      team: t,
      wins: s ? s.wins : 0,
      losses: s ? s.losses : 0,
      draws: s ? s.draws : 0,
    };
  });

  console.log(`[simulateSeason] Starting main Monte Carlo loop...`);

  for (let iter = 0; iter < iterations; iter++) {
    // Reset records to snapshot values
    for (let i = 0; i < tempRecords.length; i++) {
      const s = standings.teams.find(st => st.team === tempRecords[i].team)!;
      tempRecords[i].wins = s.wins;
      tempRecords[i].losses = s.losses;
      tempRecords[i].draws = s.draws;
    }

    // Simulate each game
    for (let g = 0; g < precomputedProbs.length; g++) {
      const match = precomputedProbs[g];
      const r = rng.next();
      const { awayWin, homeWin } = match.probs;

      // Find indices in tempRecords
      const awayRecord = tempRecords.find(tr => tr.team === match.away)!;
      const homeRecord = tempRecords.find(tr => tr.team === match.home)!;

      if (r < awayWin) {
        awayRecord.wins += 1;
        homeRecord.losses += 1;
      } else if (r < awayWin + homeWin) {
        homeRecord.wins += 1;
        awayRecord.losses += 1;
      } else {
        // Draw
        awayRecord.draws += 1;
        homeRecord.draws += 1;
      }
    }

    // Resolve rankings for this iteration
    const standingsResolved = resolveFinalStandings(tempRecords);

    // Track 5th place in sorted records
    const sortedTempRecords = [...tempRecords].map(tr => {
      const denom = tr.wins + tr.losses;
      const winRate = denom > 0 ? tr.wins / denom : 0;
      return { team: tr.team, wins: tr.wins, winRate };
    }).sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.wins - a.wins;
    });

    const fifthWins = sortedTempRecords[4].wins;
    const fifthWinRate = sortedTempRecords[4].winRate;
    fifthPlaceWinsSamples.push(fifthWins);
    fifthPlaceWinRateSamples.push(fifthWinRate);

    // Accumulate stats
    for (let i = 0; i < tempRecords.length; i++) {
      const team = tempRecords[i].team;
      const resolved = standingsResolved[team];
      const winsSim = tempRecords[i].wins;

      totalWins[team] += winsSim;
      totalLosses[team] += tempRecords[i].losses;
      totalDraws[team] += tempRecords[i].draws;
      totalPlayoffScores[team] += resolved.playoffScore;
      totalRanks[team] += resolved.averageRankVal;
      rankDistributions[team][resolved.rank] += 1;

      if (!finalWinsPlayoffCounts[team][winsSim]) {
        finalWinsPlayoffCounts[team][winsSim] = { total: 0, playoff: 0 };
      }
      finalWinsPlayoffCounts[team][winsSim].total += 1;
      finalWinsPlayoffCounts[team][winsSim].playoff += resolved.playoffScore;
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`[simulateSeason] Monte Carlo simulation complete! Duration: ${durationMs}ms`);

  // Compute Cutoff Summary Percentiles
  fifthPlaceWinsSamples.sort((a, b) => a - b);
  const averageFifthPlaceWins = fifthPlaceWinsSamples.reduce((sum, val) => sum + val, 0) / iterations;
  const p25FifthPlaceWins = fifthPlaceWinsSamples[Math.floor(iterations * 0.25)];
  const p50FifthPlaceWins = fifthPlaceWinsSamples[Math.floor(iterations * 0.50)];
  const p75FifthPlaceWins = fifthPlaceWinsSamples[Math.floor(iterations * 0.75)];
  const p90FifthPlaceWins = fifthPlaceWinsSamples[Math.floor(iterations * 0.90)];
  const averageFifthPlaceWinRate = fifthPlaceWinRateSamples.reduce((sum, val) => sum + val, 0) / iterations;

  const cutoffSummary = {
    averageFifthPlaceWins: Math.round(averageFifthPlaceWins * 10) / 10,
    p25FifthPlaceWins: Math.round(p25FifthPlaceWins),
    p50FifthPlaceWins: Math.round(p50FifthPlaceWins),
    p75FifthPlaceWins: Math.round(p75FifthPlaceWins),
    p90FifthPlaceWins: Math.round(p90FifthPlaceWins),
    averageFifthPlaceWinRate: Math.round(averageFifthPlaceWinRate * 1000) / 1000
  };

  // Compute Target Win Probabilities
  const teamWinTargetProbabilities: Record<string, Array<{ wins: number; playoffProbability: number }>> = {};
  standings.teams.forEach(s => {
    const team = s.team;
    const targetWins = [70, 72, 74, 76];
    const avgWins = totalWins[team] / iterations;
    const overallPlayoff = (totalPlayoffScores[team] / iterations) * 100;
    
    const probs = targetWins.map(w => {
      const stats = finalWinsPlayoffCounts[team][w];
      if (stats && stats.total >= 5) {
        return { wins: w, playoffProbability: Math.round((stats.playoff / stats.total) * 1000) / 10 };
      } else {
        // smoothing local window
        let winCount = 0;
        let playoffCount = 0;
        for (let offset = -1; offset <= 1; offset++) {
          const s2 = finalWinsPlayoffCounts[team][w + offset];
          if (s2) {
            winCount += s2.total;
            playoffCount += s2.playoff;
          }
        }
        if (winCount >= 5) {
          return { wins: w, playoffProbability: Math.round((playoffCount / winCount) * 1000) / 10 };
        }
        // extrapolation
        if (w < avgWins - 4) return { wins: w, playoffProbability: 0 };
        if (w > avgWins + 4) return { wins: w, playoffProbability: 100 };
        return { wins: w, playoffProbability: Math.round(overallPlayoff * 10) / 10 };
      }
    });
    teamWinTargetProbabilities[team] = probs;
  });

  // 6. Format team statistics
  const results: TeamSimulationStats[] = standings.teams.map(s => {
    const team = s.team;
    const teamConf = CONFIG.TEAMS[team as keyof typeof CONFIG.TEAMS];
    const displayName = teamConf?.nameKo || team;
    
    // Average ranks & wins/losses/draws
    const averageFinalWins = Math.round((totalWins[team] / iterations) * 10) / 10;
    const averageFinalLosses = Math.round((totalLosses[team] / iterations) * 10) / 10;
    const averageFinalDraws = Math.round((totalDraws[team] / iterations) * 10) / 10;
    
    const expectedAdditionalWins = Math.max(0, Math.round((averageFinalWins - s.wins) * 10) / 10);
    const averageFinalRank = Math.round((totalRanks[team] / iterations) * 10) / 10;
    const playoffProbability = Math.round((totalPlayoffScores[team] / iterations) * 1000) / 10; // e.g. 52.3%

    // Rank distribution percentages
    const rankDist: Record<number, number> = {};
    for (let r = 1; r <= 10; r++) {
      const count = rankDistributions[team][r] || 0;
      rankDist[r] = Math.round((count / iterations) * 1000) / 10; // e.g. 15.4%
    }

    let mostLikelyFinalRank = 1;
    let maxProb = -1;
    for (let r = 1; r <= 10; r++) {
      if (rankDist[r] > maxProb) {
        maxProb = rankDist[r];
        mostLikelyFinalRank = r;
      }
    }

    const currentGames = s.wins + s.losses + s.draws;
    const counts = teamGameCounts[team] || { actual: 0, synthetic: 0 };
    const actualScheduledRemainingGames = counts.actual;
    const syntheticRemainingGames = counts.synthetic;
    const totalRemainingGamesUsed = actualScheduledRemainingGames + syntheticRemainingGames;
    const projectedFinalGames = currentGames + totalRemainingGamesUsed;
    const averageFinalGames = Math.round((averageFinalWins + averageFinalLosses + averageFinalDraws) * 10) / 10;

    const cutoffGap = Math.round((averageFinalWins - averageFifthPlaceWins) * 10) / 10;

    return {
      team,
      displayName,
      playoffProbability,
      averageFinalRank,
      mostLikelyFinalRank,
      rankDistribution: rankDist,
      averageFinalWins,
      averageFinalLosses,
      averageFinalDraws,
      averageFinalGames,
      expectedAdditionalWins,
      currentRank: s.rank,
      currentWins: s.wins,
      currentLosses: s.losses,
      currentDraws: s.draws,
      currentGames,
      actualScheduledRemainingGames,
      syntheticRemainingGames,
      totalRemainingGamesUsed,
      projectedFinalGames,
      cutoffGap,
    };
  });

  // Sort results by playoff probability (descending) so the view gets them ordered nicely
  results.sort((a, b) => b.playoffProbability - a.playoffProbability);

  return {
    date,
    iterations,
    model,
    results,
    cutoffSummary,
    teamWinTargetProbabilities,
  };
}
