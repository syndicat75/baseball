/**
 * @file today-games.ts
 * @description KBO 리그 당일 경기 일정 및 선발 명단 정보를 제공하는 Vercel Serverless API 엔드포인트입니다.
 * 
 * 주요 수정 사항:
 * 1. 로컬 정적 JSON 대신 `getUnifiedKboData`를 호출하여 최신 실시간 순위와 일정에 입각해 경기 예측 모델 구축
 * 2. 캐싱 효율성 극대화 및 날짜 포맷 엄격 검증
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUnifiedKboData } from '../../src/lib/kbo/kboDataService';
import { buildTodayGames } from '../../src/lib/kbo/buildTodayGames';
import { getKoreaTodayString, toKboDate, isValidDateString } from '../../src/lib/kbo/dateUtils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { date } = req.query;
  console.log(`[api/kbo/today-games] [CALL] handler - date param: "${date}"`);

  const todayStr = getKoreaTodayString();
  const targetDate = (date as string) || todayStr;
  const kboDateStr = toKboDate(targetDate);

  // 1. 날짜형식 엄격성 검증
  if (!isValidDateString(targetDate)) {
    console.error(`[api/kbo/today-games] [ERROR] 유효하지 않은 날짜 형식 요청: "${targetDate}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(400).json({
      success: false,
      date: targetDate,
      kboDate: kboDateStr,
      games: [],
      emptyReason: 'FETCH_OR_PARSE_FAILED',
      error: '유효하지 않은 날짜 형식입니다. YYYY-MM-DD 포맷을 입력해주세요.',
    });
  }

  try {
    // 통합 데이터 획득
    const kboData = await getUnifiedKboData(targetDate, false);

    // 당일 경기 매칭 및 선발 투수 정보, 예측 승률 분석 수치 가공
    const todayGames = buildTodayGames(kboData, targetDate);

    // 실시간 일정 갱신을 위해 10분 s-maxage 설정
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

    const hasGames = todayGames.length > 0;
    const response = {
      success: true,
      date: targetDate,
      kboDate: kboDateStr,
      updatedAt: kboData.updatedAt || new Date().toISOString(),
      source: kboData.source,
      sourceLabel: kboData.sourceLabel,
      stale: kboData.stale,
      fallbackUsed: kboData.fallbackUsed,
      games: todayGames,
      emptyReason: hasGames ? null : 'NO_SCHEDULED_GAMES',
    };

    console.log(`[api/kbo/today-games] [SUCCESS] Compiled ${todayGames.length} games for ${targetDate}`);
    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[api/kbo/today-games] [ERROR] 당일 경기 목록 구축 실패:', err);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(500).json({
      success: false,
      date: targetDate,
      kboDate: kboDateStr,
      games: [],
      emptyReason: 'FETCH_OR_PARSE_FAILED',
      error: '경기 일정 데이터를 가공하거나 로드하는 데 실패했습니다.',
      details: err.message,
    });
  }
}
