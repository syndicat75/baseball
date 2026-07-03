/**
 * @file game-predictions.ts
 * @description KBO 경기별 승률 예측 상세 데이터를 가공·제공하는 Vercel Serverless API 엔드포인트입니다.
 * 
 * 주요 수정 사항:
 * 1. 로컬 정적 JSON 직접 읽기 대신 `getUnifiedKboData` 공용 서비스 연동 적용
 * 2. 날짜 포맷 엄격 검증 및 캐싱
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUnifiedKboData } from '../../src/lib/kbo/kboDataService';
import { buildTodayGames } from '../../src/lib/kbo/buildTodayGames';
import { getKoreaTodayString, toKboDate, isValidDateString } from '../../src/lib/kbo/dateUtils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { date } = req.query;
  console.log(`[api/kbo/game-predictions] [CALL] handler - date param: "${date}"`);

  const todayStr = getKoreaTodayString();
  const targetDate = (date as string) || todayStr;
  const kboDateStr = toKboDate(targetDate);

  // 1. 날짜형식 엄격성 검증
  if (!isValidDateString(targetDate)) {
    console.error(`[api/kbo/game-predictions] [ERROR] 유효하지 않은 날짜 형식 요청: "${targetDate}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(400).json({
      success: false,
      date: targetDate,
      kboDate: kboDateStr,
      predictions: [],
      error: '유효하지 않은 날짜 형식입니다. YYYY-MM-DD 포맷을 입력해주세요.',
    });
  }

  try {
    // 통합 데이터 획득
    const kboData = await getUnifiedKboData(targetDate, false);

    // 당일 경기 매칭 및 승률 예측 수치 산출
    const todayGames = buildTodayGames(kboData, targetDate);

    // 각 경기의 prediction 정보만 모아서 리스트업
    const predictions = todayGames.map(g => ({
      gameId: g.gameId,
      date: g.date,
      time: g.time,
      stadium: g.stadium,
      awayTeam: g.awayTeam,
      homeTeam: g.homeTeam,
      status: g.status,
      prediction: g.prediction,
    }));

    // s-maxage=600 (10분 캐시)
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

    const response = {
      success: true,
      source: kboData.source,
      sourceLabel: kboData.sourceLabel,
      stale: kboData.stale,
      fallbackUsed: kboData.fallbackUsed,
      asOfDate: kboData.asOfDate || todayStr,
      targetDate,
      kboDate: kboDateStr,
      fetchedAt: kboData.updatedAt || new Date().toISOString(),
      predictions,
    };

    console.log(`[api/kbo/game-predictions] [SUCCESS] Compiled ${predictions.length} predictions for ${targetDate}`);
    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[api/kbo/game-predictions] [ERROR] 예측 정보 산출 실패:', err);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(500).json({
      success: false,
      date: targetDate,
      kboDate: kboDateStr,
      predictions: [],
      error: '경기 승률 예측 데이터를 로드하거나 연산하는 데 실패했습니다.',
      details: err.message,
    });
  }
}
