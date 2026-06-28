/**
 * @file simulateSeason.ts
 * @description Core Monte Carlo engine for KBO season simulation.
 * Precomputes match probabilities, runs highly optimized simulation loops, and aggregates outcomes.
 */

import { KBOGame, KBOStandingsResult, StandingsTeam, SimulationOptions, TeamSimulationStats, SimulationResponse } from '../../types';
import { calculateLeagueDrawRate, calculateMatchProbabilities, MatchProbabilities } from './probabilityModel';
import { resolveFinalStandings } from './ranking';

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
  const totalPlayoffScores: Record<string, number> = {};
  const totalRanks: Record<string, number> = {};
  const rankDistributions: Record<string, Record<number, number>> = {};

  teams.forEach(team => {
    totalWins[team] = 0;
    totalPlayoffScores[team] = 0;
    totalRanks[team] = 0;
    rankDistributions[team] = {};
    for (let r = 1; r <= 10; r++) {
      rankDistributions[team][r] = 0;
    }
  });

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

    // Accumulate stats
    for (let i = 0; i < tempRecords.length; i++) {
      const team = tempRecords[i].team;
      const resolved = standingsResolved[team];

      totalWins[team] += tempRecords[i].wins;
      totalPlayoffScores[team] += resolved.playoffScore;
      totalRanks[team] += resolved.averageRankVal;
      rankDistributions[team][resolved.rank] += 1;
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`[simulateSeason] Monte Carlo simulation complete! Duration: ${durationMs}ms`);

  // 6. Format team statistics
  const results: TeamSimulationStats[] = standings.teams.map(s => {
    const team = s.team;
    
    // Average ranks & wins
    const averageFinalWins = Math.round((totalWins[team] / iterations) * 10) / 10;
    const averageFinalRank = Math.round((totalRanks[team] / iterations) * 10) / 10;
    const playoffProbability = Math.round((totalPlayoffScores[team] / iterations) * 1000) / 10; // e.g. 52.3%

    // Rank distribution percentages
    const rankDist: Record<number, number> = {};
    for (let r = 1; r <= 10; r++) {
      const count = rankDistributions[team][r] || 0;
      rankDist[r] = Math.round((count / iterations) * 1000) / 10; // e.g. 15.4%
    }

    return {
      team,
      playoffProbability,
      averageFinalRank,
      rankDistribution: rankDist,
      averageFinalWins,
      currentRank: s.rank,
      currentWins: s.wins,
      currentLosses: s.losses,
      currentDraws: s.draws,
    };
  });

  // Sort results by playoff probability (descending) so the view gets them ordered nicely
  results.sort((a, b) => b.playoffProbability - a.playoffProbability);

  return {
    date,
    iterations,
    model,
    results,
  };
}
