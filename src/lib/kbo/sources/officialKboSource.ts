/**
 * @file officialKboSource.ts
 * @description Wrapper for the legacy/existing KBO Official Korean AJAX and HTML scraping logic.
 */

import { KboDataSource } from './index';
import { KBOStandingsResult, KBOScheduleResult } from '../../../types';
import { parseStandings } from '../parseStandings';
import { getRemainingSchedule } from '../parseSchedule';

export const officialKboSource: KboDataSource = {
  id: 'official-kbo-ko',
  label: 'KBO 공식 한국어 사이트',
  priority: 4,

  async getStandings(date: string): Promise<KBOStandingsResult> {
    console.log(`[officialKboSource] Fetching standings for date: ${date}`);
    const res = await parseStandings(date);
    return {
      ...res,
      source: 'official-kbo-ko',
    };
  },

  async getSchedule(fromDate: string): Promise<KBOScheduleResult> {
    console.log(`[officialKboSource] Fetching schedule starting from: ${fromDate}`);
    const res = await getRemainingSchedule(fromDate);
    return {
      ...res,
      source: 'official-kbo-ko',
    };
  }
};
