/**
 * @file standings.ts
 * @description Vercel serverless function to retrieve the KBO team standings and head-to-head snapshot.
 * Supports date parameter and forced scraping refresh.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildSnapshotByDate } from '../../src/lib/kbo/buildSnapshotByDate';

/**
 * Handles GET /api/kbo/standings request to compile standings as of a date.
 * 
 * @param req - Incoming Vercel HTTP request
 * @param res - Outgoing Vercel HTTP response
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { date, refresh } = req.query;
  console.log(`[api/kbo/standings] GET request received - date: "${date}", refresh: "${refresh}"`);

  // Default to today if no date is provided
  const targetDate = (date as string) || new Date().toISOString().split('T')[0];
  const forceRefresh = refresh === 'true';

  try {
    console.log(`[api/kbo/standings] Processing standings snapshot for date: "${targetDate}" (forceRefresh: ${forceRefresh})`);
    const standings = await buildSnapshotByDate(targetDate, forceRefresh);

    console.log(`[api/kbo/standings] Successfully constructed standings. Source: "${standings.source}", errorType: "${standings.errorType || 'none'}"`);
    return res.status(200).json(standings);
  } catch (error: any) {
    console.error(`[api/kbo/standings] Error executing standings function:`, error);
    return res.status(500).json({
      error: 'Failed to retrieve standings snapshot',
      details: error.message,
      errorType: 'HTML parser 실패', // fallback error indicator
    });
  }
}
