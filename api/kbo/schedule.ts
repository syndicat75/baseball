/**
 * @file schedule.ts
 * @description KBO 리그 전체 일정(완료 경기, 잔여 경기 등)을 분석·반환하는 Vercel Serverless API 엔드포인트입니다.
 * 
 * 주요 수정 사항:
 * 1. 정적 JSON 직접 읽기 대신 `getUnifiedKboData` 공용 서비스 연동 적용
 * 2. 한국 표준시(KST) 및 날짜별 온전한 데이터 수집 보장
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUnifiedKboData } from '../../src/lib/kbo/kboDataService';
import { getKoreaTodayString, toKboDate } from '../../src/lib/kbo/dateUtils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { from } = req.query;
  console.log(`[api/kbo/schedule] [CALL] handler - from param: "${from}"`);

  const todayStr = getKoreaTodayString();
  const targetDate = (from as string) || todayStr;

  try {
    // 통합 데이터 획득
    const kboData = await getUnifiedKboData(targetDate, false);

    const completedGames = kboData.completedGames || [];
    const remainingGames = kboData.remainingGames || [];
    const unresolvedGames = remainingGames.filter((g: any) => g.status === 'scheduled');
    const allGames = [...completedGames, ...remainingGames];

    // 10분 s-maxage 설정
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

    const response = {
      source: kboData.source,
      sourceLabel: kboData.sourceLabel,
      originalSource: kboData.source,
      originalSourceLabel: kboData.sourceLabel,
      stale: kboData.stale,
      fallbackUsed: kboData.fallbackUsed,
      completedGames,
      remainingGames,
      unresolvedGames,
      games: allGames,
      asOfDate: kboData.asOfDate,
      fetchedAt: kboData.updatedAt,
    };

    console.log(`[api/kbo/schedule] [SUCCESS] Returned ${allGames.length} total games for ${targetDate}`);
    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[api/kbo/schedule] 일정 반환 실패:', err);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(500).json({
      error: 'Schedule load failure',
      details: err.message,
    });
  }
}
