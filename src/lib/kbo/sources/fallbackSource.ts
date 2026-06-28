/**
 * @file fallbackSource.ts
 * @description Bundled fallback data source. Highest reliability, lowest priority.
 */

import { KboDataSource } from './index';
import { KBOStandingsResult, KBOScheduleResult } from '../../../types';
import { fallbackStandings2026 } from '../../../data/fallbackStandings2026';
import { fallbackSchedule2026 } from '../../../data/fallbackSchedule2026';

/**
 * Fallback source returning bundled 2026 season data.
 */
export const fallbackSource: KboDataSource = {
  id: 'bundled-fallback',
  label: '번들 로컬 예비 데이터',
  priority: 5,

  async getStandings(date: string): Promise<KBOStandingsResult> {
    console.log(`[fallbackSource] Returning bundled fallback standings for date: ${date}`);
    return {
      ...fallbackStandings2026,
      asOfDate: date,
      source: 'bundled-fallback',
      errorType: '샘플 데이터 사용',
      errorMessage: 'KBO 실시간 데이터를 가져올 수 없어 내장 예비 데이터를 사용합니다.',
    };
  },

  async getSchedule(fromDate: string): Promise<KBOScheduleResult> {
    console.log(`[fallbackSource] Returning bundled fallback schedule starting from: ${fromDate}`);
    
    // Filter games scheduled on or after the requested date
    const remainingGames = fallbackSchedule2026.filter(g => g.date >= fromDate);
    const completedGames = fallbackSchedule2026.filter(g => g.date < fromDate);

    // Unresolved scheduled games are games with "scheduled" status on or after the date
    const unresolved = remainingGames.filter(g => g.status === 'scheduled');

    return {
      from: fromDate,
      games: remainingGames,
      unresolvedGames: unresolved,
      source: 'bundled-fallback',
      errorType: '샘플 데이터 사용',
      errorMessage: '공식 일정을 가져올 수 없어 내장 예비 일정을 사용합니다.',
    };
  }
};
