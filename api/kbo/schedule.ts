/**
 * @file schedule.ts
 * @description Vercel serverless function to retrieve KBO remaining matches and postponed games.
 * Supports starting date and forced refresh parameters.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSchedule } from '../../src/lib/kbo/parseSchedule';
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
  const forceRefresh = refresh === 'true';

  let currentPhase = 'api.start';

  try {
    console.log(`[api/kbo/schedule] Fetching schedule from date: "${targetDate}" (forceRefresh: ${forceRefresh})`);
    
    currentPhase = 'schedule.fullSeason';
    const schedule = await getSchedule(targetDate, forceRefresh);

    console.log(`[api/kbo/schedule] Successfully compiled schedule. Games found: ${schedule.games.length}, Unresolved: ${schedule.unresolvedGames.length}`);
    return res.status(200).json(schedule);
  } catch (error: any) {
    console.error(`[api/kbo/schedule] Error compiling schedule:`, error);
    
    let phase = currentPhase;
    const msg = error.message || '';
    if (msg.includes('fetch') || msg.includes('month')) {
      phase = 'schedule.fetchMonth';
    }

    return res.status(500).json({
      error: 'Failed to retrieve schedule database',
      details: error.message,
      errorMessage: error.message,
      errorType: 'HTML parser 실패',
      stackPreview: error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : '',
      phase,
    });
  }
}
