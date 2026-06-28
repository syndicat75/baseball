/**
 * @file schedule.ts
 * @description Vercel serverless function to retrieve KBO remaining matches and postponed games.
 * Supports starting date and forced refresh parameters.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSchedule } from '../../src/lib/kbo/parseSchedule';

/**
 * Handles GET /api/kbo/schedule request to get upcoming and unresolved postponed games.
 * 
 * @param req - Incoming Vercel HTTP request
 * @param res - Outgoing Vercel HTTP response
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { from, refresh } = req.query;
  console.log(`[api/kbo/schedule] GET request received - from: "${from}", refresh: "${refresh}"`);

  const targetDate = (from as string) || new Date().toISOString().split('T')[0];
  const forceRefresh = refresh === 'true';

  try {
    console.log(`[api/kbo/schedule] Fetching schedule from date: "${targetDate}" (forceRefresh: ${forceRefresh})`);
    const schedule = await getSchedule(targetDate, forceRefresh);

    console.log(`[api/kbo/schedule] Successfully compiled schedule. Games found: ${schedule.games.length}, Unresolved: ${schedule.unresolvedGames.length}`);
    return res.status(200).json(schedule);
  } catch (error: any) {
    console.error(`[api/kbo/schedule] Error compiling schedule:`, error);
    return res.status(500).json({
      error: 'Failed to retrieve schedule database',
      details: error.message,
      errorType: 'HTML parser 실패',
    });
  }
}
