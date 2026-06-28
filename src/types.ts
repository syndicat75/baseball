/**
 * @file types.ts
 * @description Centralized, browser-safe TypeScript declarations and type definitions shared between client and server.
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
  unresolvedGames?: KBOGame[];
  source?: string;
  errorType?: 'API route 없음' | 'KBO fetch 실패' | 'HTML parser 실패' | '일정 데이터 없음' | '캐시 데이터 사용' | '샘플 데이터 사용';
  errorMessage?: string;
}

export interface KBOGame {
  date: string;          // YYYY-MM-DD
  time: string;          // HH:MM
  away: string;          // Normalised code, e.g. "LOTTE"
  home: string;          // Normalised code, e.g. "DOOSAN"
  awayScore: number | null;
  homeScore: number | null;
  stadium: string;
  status: 'completed' | 'scheduled' | 'postponed';
  synthetic?: boolean;    // If generated for unresolved postponed games
  reason?: string;
}

export interface KBOScheduleResult {
  from: string;
  games: KBOGame[];
  unresolvedGames: KBOGame[];
  source?: string;
  errorType?: 'API route 없음' | 'KBO fetch 실패' | 'HTML parser 실패' | '일정 데이터 없음' | '캐시 데이터 사용' | '샘플 데이터 사용';
  errorMessage?: string;
}

export interface StandingsTeam {
  team: string;
  nameKo: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  rank: number;
}

export interface KBOStandingsResult {
  asOfDate: string;
  source: string;
  teams: StandingsTeam[];
  headToHead: Record<string, Record<string, { wins: number; losses: number; draws: number }>>;
  errorType?: 'API route 없음' | 'KBO fetch 실패' | 'HTML parser 실패' | '일정 데이터 없음' | '캐시 데이터 사용' | '샘플 데이터 사용';
  errorMessage?: string;
}
