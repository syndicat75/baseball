/**
 * @file standings.ts
 * @description Vercel serverless function to retrieve the KBO team standings and head-to-head snapshot.
 * Supports date parameter and forced scraping refresh.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildSnapshotByDate, getKstDateString } from '../../src/lib/kbo/buildSnapshotByDate';

/**
 * Handles GET /api/kbo/standings request to compile standings as of a date.
 * 
 * @param req - Incoming Vercel HTTP request
 * @param res - Outgoing Vercel HTTP response
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { date, refresh } = req.query;
  console.log(`[api/kbo/standings] [CALL] handler - date: "${date}", refresh: "${refresh}"`);

  // Default to Korea Standard Time today if no date is provided
  const targetDate = (date as string) || getKstDateString();
  const forceRefresh = refresh === 'true';

  let currentPhase = 'api.start';

  try {
    console.log(`[api/kbo/standings] Processing standings snapshot for date: "${targetDate}" (forceRefresh: ${forceRefresh})`);
    
    currentPhase = 'buildSnapshot.reconstruct';
    const standings = await buildSnapshotByDate(targetDate, forceRefresh);

    console.log(`[api/kbo/standings] Successfully constructed standings. Source: "${standings.source}", errorType: "${standings.errorType || 'none'}"`);
    
    // Always return 200 even if fallback was engaged, as long as fallback data is successfully compiled.
    return res.status(200).json(standings);
  } catch (error: any) {
    console.error(`[api/kbo/standings] Exception caught in standings endpoint:`, error);
    
    // Map phase based on error messages or target locations if possible
    let phase = currentPhase;
    const msg = error.message || '';
    if (msg.includes('fetchKboPage') || msg.includes('fetch')) {
      phase = 'parseStandings.fetch';
    } else if (msg.includes('cheerio') || msg.includes('table')) {
      phase = 'parseStandings.tableParser';
    } else if (msg.includes('regex') || msg.includes('text')) {
      phase = 'parseStandings.textParser';
    }

    return res.status(500).json({
      error: 'Failed to retrieve standings snapshot',
      details: error.message,
      errorMessage: error.message,
      errorType: 'HTML parser 실패',
      stackPreview: error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : '',
      phase,
    });
  }
}
