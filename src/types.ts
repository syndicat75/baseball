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
  displayName: string;        // Ko name, e.g. "LG 트윈스"
  playoffProbability: number; // Percentage (0-100) of entering top 5
  averageFinalRank: number;   // Average sorted rank (1-10)
  mostLikelyFinalRank: number; // Rank with highest frequency in distribution
  rankDistribution: Record<number, number>; // Percentage of times team finished in rank 1..10
  averageFinalWins: number;   // Average wins at end of season
  averageFinalLosses: number; // Average final losses
  averageFinalDraws: number;  // Average final draws
  averageFinalGames: number;  // Average final games simulated (should be 144)
  expectedAdditionalWins: number; // Expected additional wins (averageFinalWins - currentWins)
  currentRank: number;        // Active rank at snapshot date
  currentWins: number;        // Wins at snapshot date
  currentLosses: number;      // Losses at snapshot date
  currentDraws: number;       // Draws at snapshot date
  currentGames: number;       // currentWins + currentLosses + currentDraws
  actualScheduledRemainingGames: number; // Actual remaining games unresolved/scheduled
  syntheticRemainingGames: number;       // Synthetic compensation games
  totalRemainingGamesUsed: number;       // actual + synthetic
  projectedFinalGames: number;           // currentGames + totalRemainingUsed (must be 144)
  cutoffGap: number;                     // averageFinalWins - averageFifthPlaceWins
}

export interface CutoffSummary {
  averageFifthPlaceWins: number;
  p25FifthPlaceWins: number;
  p50FifthPlaceWins: number;
  p75FifthPlaceWins: number;
  p90FifthPlaceWins: number;
  averageFifthPlaceWinRate: number;
}

export interface ProbabilityChangeItem {
  team: string;
  displayName: string;
  currentProb: number;
  prevProb: number;
  change: number;
  direction: 'up' | 'down' | 'same';
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
  warnings?: string[];
  syntheticGamesCount?: number;
  syntheticTeamCounts?: Record<string, number>;
  dataQuality?: {
    standingsCompletedGames: number;
    scheduleCompletedGames: number;
    scheduleRemainingGames: number;
    expectedRemainingGamesByStandings: number;
    syntheticGameCount: number;
    isScheduleConsistentWithStandings: boolean;
  };
  cutoffSummary?: CutoffSummary;
  probabilityChanges?: {
    hasPrevData: boolean;
    prevDate?: string;
    items: ProbabilityChangeItem[];
  };
  teamWinTargetProbabilities?: Record<string, Array<{ wins: number; playoffProbability: number }>>;
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
  clearly_synthetic?: boolean; // Flag to explicitly isolate synthetic games from real ones in UI/API
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

/**
 * @interface TeamStanding
 * @description KBO 리그 팀 순위표 표시를 위한 상세 구단 데이터 구조입니다.
 */
export interface TeamStanding {
  rank: number;
  teamName: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winningPct: number;
  gamesBehind: number;
  streak: string;
  last10: string;
  battingAvg: number;
  era: number;
  runs: number;
  runsAllowed: number;
  updatedAt: string;
}

/**
 * @interface PitcherStats
 * @description 투수의 시즌 및 최근 성적 정보를 담는 데이터 구조입니다.
 */
export interface PitcherStats {
  name: string;
  team: string;
  wins: number;
  losses: number;
  winningPct: number;
  era: number;
  innings: number;
  whip: number;
  strikeouts: number;
  recentEra: number;
  recentGames: number;
}

/**
 * @interface BatterLineup
 * @description 타순 및 타자 성적 정보를 담는 데이터 구조입니다.
 */
export interface BatterLineup {
  battingOrder: number;
  position: string;
  name: string;
  battingAvg: number;
  obp: number;
  slg: number;
  ops: number;
  isConfirmed: boolean;
}

/**
 * @interface GamePrediction
 * @description 경기별 양 팀 예측 승률 및 세부 분석 근거를 담는 데이터 구조입니다.
 */
export interface GamePrediction {
  gameId?: string;
  awayTeam?: string;
  homeTeam?: string;
  awayWinProbability: number;
  homeWinProbability: number;
  confidence: '낮음' | '보통' | '높음' | '예측 보류';
  summary: string;
  factors: string[];
  missingData: string[];
  modelVersion?: string;
  calculatedAt?: string;
}

/**
 * @interface TodayGame
 * @description 당일 경기 일정 및 해당 경기의 승률 예측 정보를 통합하는 데이터 구조입니다.
 */
export interface TodayGame {
  gameId: string;
  date: string;
  time: string;
  stadium: string;
  awayTeam: string;
  homeTeam: string;
  status: '예정' | '진행중' | '종료' | '우천취소' | '취소' | '지연';
  awayStarter: PitcherStats | null;
  homeStarter: PitcherStats | null;
  awayLineup: BatterLineup[];
  homeLineup: BatterLineup[];
  prediction: GamePrediction | null;
  updatedAt: string;
}

