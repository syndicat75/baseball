/**
 * @file debug-scoreboard.ts
 * @description KBO 공식 영문 스코어보드 수집 상태 및 로우 데이터를 검증하는 디버그 전용 API입니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchHtml } from '../../src/lib/kbo/sources/fetchHtml';
import { parseOfficialScoreboard } from '../../src/lib/kbo/sources/parseOfficialScoreboard';
import { getKoreaTodayString } from '../../src/lib/kbo/dateUtils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { date } = req.query;
    const targetDate = typeof date === 'string' ? date : getKoreaTodayString();

    const url = `https://eng.koreabaseball.com/Schedule/Scoreboard.aspx?searchDate=${targetDate}`;
    console.log(`[api/kbo/debug-scoreboard] Fetching raw scoreboard from URL: ${url}`);

    const htmlRes = await fetchHtml(url);
    if (!htmlRes.ok) {
      return res.status(200).json({
        success: false,
        error: 'DEBUG_SCOREBOARD_FETCH_FAILED',
        message: `KBO 공식 사이트 연동 실패 (HTTP Status: ${htmlRes.status})`,
        sourceUrl: url,
        status: htmlRes.status,
        parsedGamesCount: 0,
        parsedGames: []
      });
    }

    let parsedGames: any[] = [];
    let parseError: string | null = null;

    try {
      parsedGames = await parseOfficialScoreboard(targetDate);
    } catch (err: any) {
      parseError = err.message || String(err);
    }

    const previewLength = 1500;
    const rawPreview = htmlRes.text 
      ? htmlRes.text.substring(0, previewLength) + (htmlRes.text.length > previewLength ? ' ... [TRUNCATED]' : '') 
      : '';

    return res.status(200).json({
      success: true,
      date: targetDate,
      sourceUrl: url,
      status: htmlRes.status,
      contentType: 'text/html',
      textLength: htmlRes.text?.length || 0,
      rawPreview,
      parsedGamesCount: parsedGames.length,
      parsedGames,
      parseError
    });
  } catch (error: any) {
    return res.status(200).json({
      success: false,
      error: 'SERVER_EXCEPTION',
      message: error.message || String(error),
      rawPreview: '',
      parsedGamesCount: 0,
      parsedGames: []
    });
  }
}
