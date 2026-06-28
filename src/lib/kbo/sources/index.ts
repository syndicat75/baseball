/**
 * @file index.ts
 * @description Central KBO Data Source Manager. Orchestrates priority-based fallback logic across multiple providers.
 */

import { KBOStandingsResult, KBOScheduleResult } from '../../../types';
import { officialKboEnglishSource } from './officialKboEnglishSource';
import { myKboStatsSource } from './myKboStatsSource';
import { aiScoreSource } from './aiScoreSource';
import { officialKboSource } from './officialKboSource';
import { fallbackSource } from './fallbackSource';

/**
 * Common interface for all KBO data providers.
 */
export interface KboDataSource {
  id: string;
  label: string;
  priority: number; // Lower is higher priority (e.g., 1 is first choice)
  getStandings(date: string): Promise<KBOStandingsResult>;
  getSchedule(fromDate: string): Promise<KBOScheduleResult>;
}

/**
 * List of available sources sorted by priority ascending.
 */
export const SOURCES: KboDataSource[] = [
  officialKboEnglishSource,
  myKboStatsSource,
  aiScoreSource,
  officialKboSource, // Korean AJAX source
  fallbackSource,     // Hardcoded fallback data
].sort((a, b) => a.priority - b.priority);

/**
 * Diagnostics/log entry structure for failed source attempts.
 */
export interface FailedSourceAttempt {
  source: string;
  reason: string;
}

/**
 * Wrapper result including metadata on which source was selected.
 */
export interface SourceManagerStandingsResult extends KBOStandingsResult {
  sourceLabel: string;
  fetchedAt: string;
  warnings?: string[];
  failedSources?: FailedSourceAttempt[];
}

export interface SourceManagerScheduleResult extends KBOScheduleResult {
  sourceLabel: string;
  fetchedAt: string;
  warnings?: string[];
  failedSources?: FailedSourceAttempt[];
}

/**
 * Query each data source in priority order for Standings.
 * Enforces a strict timeout per source.
 * 
 * @param date The snapshot date (YYYY-MM-DD)
 * @returns Best available standings result with detailed source metadata.
 */
export async function getBestAvailableStandings(date: string): Promise<SourceManagerStandingsResult> {
  console.log(`[SourceManager] [CALL] getBestAvailableStandings - Date: ${date}`);
  const failedSources: FailedSourceAttempt[] = [];
  const warnings: string[] = [];
  
  for (const source of SOURCES) {
    console.log(`[SourceManager] Trying standings from source: "${source.id}" (${source.label})`);
    
    // Create a promise that rejects after 3 seconds to enforce the timeout constraint
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), 3000);
    });

    try {
      // Execute with timeout race
      const result = await Promise.race([
        source.getStandings(date),
        timeoutPromise
      ]);

      // Validate result structure to ensure we actually got 10 teams
      if (result && result.teams && result.teams.length === 10) {
        console.log(`[SourceManager] Successfully resolved standings using: "${source.id}"`);
        
        // If a lower priority source was used, add a warning
        if (source.id !== 'official-kbo-en') {
          warnings.push(`KBO official English failed, ${source.label} used instead.`);
        }

        return {
          ...result,
          source: result.source || source.id,
          sourceLabel: source.label,
          fetchedAt: new Date().toISOString(),
          warnings: warnings.length > 0 ? warnings : undefined,
          failedSources: failedSources.length > 0 ? failedSources : undefined,
        };
      } else {
        throw new Error(`Invalid data shape or missing teams (got ${result?.teams?.length || 0} teams)`);
      }
    } catch (err: any) {
      const reason = err.message || String(err);
      console.warn(`[SourceManager] Source "${source.id}" failed: ${reason}`);
      failedSources.push({
        source: source.id,
        reason,
      });
    }
  }

  // Absolute fallback should be handled by fallbackSource and never fail, but if it somehow does:
  console.error('[SourceManager] All standings sources failed! Invoking emergency fallback.');
  const emergency = await fallbackSource.getStandings(date);
  return {
    ...emergency,
    source: 'bundled-fallback',
    sourceLabel: fallbackSource.label,
    fetchedAt: new Date().toISOString(),
    warnings: ['All external sources and normal fallback wrapper failed! Emergency local backup used.'],
    failedSources,
  };
}

/**
 * Query each data source in priority order for Schedules.
 * Enforces a strict timeout per source.
 * 
 * @param fromDate The starting date (YYYY-MM-DD)
 * @returns Best available schedule result with detailed source metadata.
 */
export async function getBestAvailableSchedule(fromDate: string): Promise<SourceManagerScheduleResult> {
  console.log(`[SourceManager] [CALL] getBestAvailableSchedule - Date: ${fromDate}`);
  const failedSources: FailedSourceAttempt[] = [];
  const warnings: string[] = [];

  for (const source of SOURCES) {
    console.log(`[SourceManager] Trying schedule from source: "${source.id}" (${source.label})`);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), 3000);
    });

    try {
      const result = await Promise.race([
        source.getSchedule(fromDate),
        timeoutPromise
      ]);

      if (result && result.games && result.games.length > 0) {
        console.log(`[SourceManager] Successfully resolved schedule using: "${source.id}" (Games count: ${result.games.length})`);
        
        if (source.id !== 'official-kbo-en') {
          warnings.push(`KBO official English failed, ${source.label} used instead.`);
        }

        return {
          ...result,
          source: result.source || source.id,
          sourceLabel: source.label,
          fetchedAt: new Date().toISOString(),
          warnings: warnings.length > 0 ? warnings : undefined,
          failedSources: failedSources.length > 0 ? failedSources : undefined,
        };
      } else {
        throw new Error('No games parsed from source');
      }
    } catch (err: any) {
      const reason = err.message || String(err);
      console.warn(`[SourceManager] Source "${source.id}" failed: ${reason}`);
      failedSources.push({
        source: source.id,
        reason,
      });
    }
  }

  // Absolute fallback should be handled by fallbackSource and never fail, but if it does:
  console.error('[SourceManager] All schedule sources failed! Invoking emergency fallback.');
  const emergency = await fallbackSource.getSchedule(fromDate);
  return {
    ...emergency,
    source: 'bundled-fallback',
    sourceLabel: fallbackSource.label,
    fetchedAt: new Date().toISOString(),
    warnings: ['All external sources and normal fallback wrapper failed! Emergency local backup used.'],
    failedSources,
  };
}
