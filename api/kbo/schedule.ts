/**
 * @file schedule.ts
 * @description Vercel serverless function to retrieve KBO remaining matches and postponed games.
 * Supports starting date and forced refresh parameters.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBestAvailableSchedule } from '../../src/lib/kbo/sources';
import { fallbackSource } from '../../src/lib/kbo/sources/fallbackSource';
import { getKstDateString } from '../../src/lib/kbo/buildSnapshotByDate';

/**
 * Handles GET /api/kbo/schedule request to get upcoming and unresolved postponed games.
 * 
 * @param req - Incoming Vercel HTTP request
 * @param res - Outgoing Vercel HTTP response
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { from, refresh } = req.query;
  console.log(`[api/kbo/schedule] [CALL] handler - from: "${from}", refresh: "${refresh}"`);

  // Default to Korea Standard Time today if no from date is provided
  const targetDate = (from as string) || getKstDateString();

  try {
    console.log(`[api/kbo/schedule] Fetching schedule from date: "${targetDate}"`);
    
    const schedule = await getBestAvailableSchedule(targetDate);

    console.log(`[api/kbo/schedule] Successfully compiled schedule. Games found: ${schedule.games.length}, Unresolved: ${schedule.unresolvedGames.length}`);
    return res.status(200).json(schedule);
  } catch (error: any) {
    console.error(`[api/kbo/schedule] Error compiling schedule, falling back to local fallback:`, error);
    
    try {
      const fallbackRes = await fallbackSource.getSchedule(targetDate);
      return res.status(200).json({
        ...fallbackRes,
        source: 'bundled-fallback',
        sourceLabel: '번들 로컬 예비 데이터',
        fetchedAt: new Date().toISOString(),
        warnings: [`일정 수집 실패로 인해 예비 데이터를 사용합니다. (${error.message})`],
        failedSources: [{ source: 'all', reason: error.message }],
      });
    } catch (fallbackErr: any) {
      return res.status(500).json({
        error: 'Critical system failure',
        details: error.message,
        errorMessage: '코드 실행 자체가 불가능한 치명적인 시스템 오류가 발생했습니다.',
        errorType: 'HTML parser 실패',
      });
    }
  }
}

