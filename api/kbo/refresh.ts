/**
 * @file refresh.ts
 * @description KBO 리그 원격 크롤링 데이터 및 내부 캐시 수동 갱신을 수행하는 Vercel Serverless API 엔드포인트입니다.
 * 
 * 주요 특징:
 * 1. 5분 Rate-Limit 보호 기작 유지
 * 2. `getUnifiedKboData`에 `forceRefresh = true` 파라미터를 넘겨 캐시 강제 삭제 및 최신 크롤링 수집 기동
 * 3. 수집 과정에서 검증(games = wins + losses + draws 및 major team 과소 검사)과 동일 시즌 경기수 감소 비허용 규칙을 엄격히 적용
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUnifiedKboData } from '../../src/lib/kbo/kboDataService';
import { getKoreaTodayString, toKboDate, isValidDateString } from '../../src/lib/kbo/dateUtils';

// 메모리 기반 전역 Rate-Limit 추적 객체 (컨테이너 라이프사이클 내에서 유지)
let lastRefreshTime = 0;
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000; // 5분

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { date } = req.query;
  console.log(`[api/kbo/refresh] [CALL] handler - KBO Data Manual Refresh Triggered for date: "${date}"`);
  
  const now = Date.now();
  const timeElapsed = now - lastRefreshTime;

  // 1. Rate-Limit 검증 (동일 사용자/봇의 디도스 방어)
  if (timeElapsed < REFRESH_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((REFRESH_COOLDOWN_MS - timeElapsed) / 1000);
    console.warn(`[api/kbo/refresh] Rate-Limit Blocked. ${remainingSeconds}s remaining.`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(429).json({
      success: false,
      error: 'Too Many Requests',
      message: '너무 빈번한 새로고침 요청입니다. 잠시 후 다시 시도해주세요.',
      cooldownSeconds: remainingSeconds,
    });
  }

  const todayStr = getKoreaTodayString();
  const targetDate = (date as string) || todayStr;

  // 2. 날짜 유효성 검사
  if (!isValidDateString(targetDate)) {
    console.error(`[api/kbo/refresh] [ERROR] 유효하지 않은 날짜 형식 요청: "${targetDate}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: '유효하지 않은 날짜 형식입니다. YYYY-MM-DD 포맷을 입력해주세요.',
    });
  }

  const startTime = Date.now();

  try {
    // 3. 통합 데이터 레이어를 forceRefresh = true 로 호출하여 전체 캐시 삭제 및 강제 재크롤링 기동
    console.log(`[api/kbo/refresh] Invoking forceRefresh for date: "${targetDate}"`);
    const kboData = await getUnifiedKboData(targetDate, true);

    // Rate Limit 시간 업데이트
    lastRefreshTime = Date.now();
    const durationMs = lastRefreshTime - startTime;

    console.log(`[api/kbo/refresh] [SUCCESS] Manual refresh finished successfully in ${durationMs}ms.`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    return res.status(200).json({
      success: true,
      message: `${targetDate} 기준 KBO 리그 데이터가 성공적으로 갱신되었습니다.`,
      refreshedAt: kboData.updatedAt,
      durationMs,
      source: kboData.source,
      sourceLabel: kboData.sourceLabel,
      stale: kboData.stale,
      fallbackUsed: kboData.fallbackUsed,
      warnings: kboData.warnings,
      lgGames: kboData.lgGames
    });
  } catch (err: any) {
    console.error('[api/kbo/refresh] [ERROR] 수동 갱신 중 예외 발생:', err);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(500).json({
      success: false,
      error: 'Refresh process failed',
      message: '최신 정보를 크롤링하여 수집하는 과정에서 에러가 발생했거나, 새로 수집한 데이터가 stale/invalid 상태여서 안전하게 수동 갱신을 차단했습니다.',
      details: err.message,
    });
  }
}
