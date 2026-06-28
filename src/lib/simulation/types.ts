/**
 * @file types.ts
 * @description Defines TypeScript types and interfaces used throughout the Monte Carlo season simulation engine.
 */

export type ProbabilityModelType = 'basic' | 'winRate' | 'hybrid';

export interface SimulationOptions {
  date: string;               // Snapshot date YYYY-MM-DD
  iterations: number;         // 10000 | 50000 | 100000
  model: ProbabilityModelType; // 'basic' | 'winRate' | 'hybrid'
  seed?: number;              // Seed for reproducible random results
}

export interface TeamSimulationStats {
  team: string;               // E.g. "LG"
  playoffProbability: number; // Percentage (0-100) of entering top 5
  averageFinalRank: number;   // Average sorted rank (1-10)
  rankDistribution: Record<number, number>; // Percentage of times team finished in rank 1..10
  averageFinalWins: number;   // Average wins at end of season
  currentRank: number;        // Active rank at snapshot date
  currentWins: number;        // Wins at snapshot date
  currentLosses: number;      // Losses at snapshot date
  currentDraws: number;       // Draws at snapshot date
}

export interface SimulationResponse {
  date: string;
  iterations: number;
  model: ProbabilityModelType;
  results: TeamSimulationStats[];
}
