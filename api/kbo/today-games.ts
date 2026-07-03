/**
 * @file today-games.ts
 * @description KBO 리그 당일 경기 일정 정보를 제공하는 Vercel Serverless API 엔드포인트입니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getKoreaTodayString, isValidDateString } from '../../src/lib/kbo/dateUtils';
import { getTodayGamesOnly } from '../../src/lib/kbo/getTodayGamesOnly';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const date =
      typeof req.query.date === "string"
        ? req.query.date
        : getKoreaTodayString();

    if (!isValidDateString(date)) {
      return res.status(200).json({
        success: false,
        date,
        games: [],
        emptyReason: "FETCH_OR_PARSE_FAILED",
        error: "INVALID_DATE",
        message: "날짜 형식은 YYYY-MM-DD여야 합니다."
      });
    }

    const result = await getTodayGamesOnly(date);

    // 성공 시 브라우저 및 CDN 캐시 헤더 부여 (5분 캐시)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');

    return res.status(200).json(result);
  } catch (error) {
    return res.status(200).json({
      success: false,
      games: [],
      emptyReason: "FETCH_OR_PARSE_FAILED",
      error: "SERVER_EXCEPTION",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: new Date().toISOString()
    });
  }
}


