/**
 * @file game-details.ts
 * @description KBO 리그 당일 경기 선발투수 세부 정보를 비동기식으로 안전하게 제공하는 Vercel Serverless API 엔드포인트입니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getKoreaTodayString, isValidDateString } from '../../src/lib/kbo/dateUtils';
import { getGameDetailsData } from '../../src/lib/kbo/gameDetailsService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const date =
      typeof req.query.date === "string"
        ? req.query.date
        : getKoreaTodayString();

    const forceRefresh = req.query.refresh === "true";

    if (!isValidDateString(date)) {
      return res.status(200).json({
        success: false,
        date,
        details: [],
        error: "INVALID_DATE",
        message: "날짜 형식은 YYYY-MM-DD여야 합니다.",
        updatedAt: new Date().toISOString()
      });
    }

    const result = await getGameDetailsData(date, forceRefresh);

    if (!result.success) {
      return res.status(200).json({
        success: false,
        date: result.date || date,
        details: [],
        error: result.error || "GAME_DETAILS_FETCH_FAILED",
        message: result.message || "선발투수 정보를 수집하지 못했습니다.",
        updatedAt: result.updatedAt || new Date().toISOString()
      });
    }

    // s-maxage 부여 (5분)
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=120');

    return res.status(200).json(result);
  } catch (error) {
    return res.status(200).json({
      success: false,
      date: typeof req.query.date === "string" ? req.query.date : getKoreaTodayString(),
      details: [],
      error: "GAME_DETAILS_FETCH_FAILED",
      message: error instanceof Error ? error.message : String(error),
      updatedAt: new Date().toISOString()
    });
  }
}
