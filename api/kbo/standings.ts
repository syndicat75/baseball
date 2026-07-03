/**
 * @file standings.ts
 * @description KBO 리그 팀 순위표 정보 제공 Vercel Serverless API 엔드포인트입니다.
 * 
 * 주요 수정 사항:
 * 1. 로컬 정적 JSON 파일 로드 방식 대신 최신 `getUnifiedKboData` 연동 서비스 적용
 * 2. 1순위 KBO 공식 국문 순위 데이터 우선순위 보장
 * 3. 10분 캐싱 정책 적용 및 수집 상태(stale, source, fallbackUsed) 세부 반환
 * 4. 실패 또는 비정상 규격 데이터 원천 차단 및 무결성 검증 통과 데이터만 노출
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUnifiedKboData } from '../../src/lib/kbo/kboDataService';
import { calculateDetailedStandings } from '../../src/lib/kbo/statsCalculator';
import { getKoreaTodayString, toKboDate, isValidDateString } from '../../src/lib/kbo/dateUtils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { date } = req.query;
  console.log(`[api/kbo/standings] [CALL] handler - date param: "${date}"`);

  const todayStr = getKoreaTodayString();
  const targetDate = (date as string) || todayStr;
  const kboDateStr = toKboDate(targetDate);

  // 1. 날짜형식 엄격성 검증
  if (!isValidDateString(targetDate)) {
    console.error(`[api/kbo/standings] [ERROR] 유효하지 않은 날짜 형식 요청: "${targetDate}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(400).json({
      success: false,
      date: targetDate,
      kboDate: kboDateStr,
      standings: [],
      error: '유효하지 않은 날짜 형식입니다. YYYY-MM-DD 포맷을 입력해주세요.',
      details: `Requested date: "${targetDate}"`
    });
  }

  try {
    // 통합 데이터 획득 (stale/fallback 자동 연동)
    const kboData = await getUnifiedKboData(targetDate, false);

    const rawStandings = kboData.standings || [];
    const completedGames = kboData.completedGames || [];
    const fetchedAt = kboData.updatedAt || new Date().toISOString();

    if (!rawStandings || rawStandings.length === 0) {
      throw new Error('수집된 순위 데이터가 비어 있습니다.');
    }

    // 득점, 실점, 최근 10경기, 연승/연패 및 게임차 등 확장된 세부 통계 계산
    const detailedStandings = calculateDetailedStandings(rawStandings, completedGames, fetchedAt);

    // 성공한 경우에만 10분 동안 캐시 (s-maxage=600)
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

    const response = {
      success: true,
      date: targetDate,
      kboDate: kboDateStr,
      source: kboData.source,
      sourceLabel: kboData.sourceLabel,
      asOfDate: kboData.asOfDate,
      updatedAt: fetchedAt,
      stale: kboData.stale,
      fallbackUsed: kboData.fallbackUsed,
      warnings: kboData.warnings,
      standings: detailedStandings,
    };

    console.log(`[api/kbo/standings] [SUCCESS] Compiled ${detailedStandings.length} detailed standings for ${targetDate}`);
    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[api/kbo/standings] [ERROR] 순위표 데이터 구축 실패:', err);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(500).json({
      success: false,
      date: targetDate,
      kboDate: kboDateStr,
      standings: [],
      error: '순위표 데이터를 수집하거나 가공하는 데 실패했습니다.',
      details: err.message,
    });
  }
}
