/**
 * @file standings.ts
 * @description Vercel serverless function to retrieve the KBO team standings and head-to-head snapshot.
 * Supports date parameter and forced scraping refresh.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildSnapshotByDate, getKstDateString } from '../../src/lib/kbo/buildSnapshotByDate';
import { getBestAvailableStandings } from '../../src/lib/kbo/sources';
import { getFallbackStandings } from '../../src/lib/kbo/parseStandings';

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
  const todayStr = getKstDateString();

  try {
    console.log(`[api/kbo/standings] Processing standings snapshot for date: "${targetDate}"`);
    
    // 항상 다중 소스 지원 getBestAvailableStandings 호출
    const standings = await getBestAvailableStandings(targetDate);

    console.log(`[api/kbo/standings] Successfully constructed standings. Source: "${standings.source}", errorType: "${standings.errorType || 'none'}"`);
    
    // Always return 200 even if fallback was engaged, as long as fallback data is successfully compiled.
    return res.status(200).json(standings);
  } catch (error: any) {
    console.error(`[api/kbo/standings] Exception caught in standings endpoint, falling back to emergency standings:`, error);
    
    try {
      const emergency = getFallbackStandings(targetDate, 'HTML parser 실패', `일시적 서버 오류 및 데이터 수집 실패: ${error.message}`);
      return res.status(200).json({
        ...emergency,
        source: 'bundled-fallback',
        sourceLabel: '번들 로컬 예비 데이터',
        fetchedAt: new Date().toISOString(),
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

