/**
 * @file refresh.ts
 * @description KBO 리그 원격 크롤링 데이터 및 내부 캐시 수동 갱신을 수행하는 Vercel Serverless API 엔드포인트입니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStandingsData, getTodayGamesData } from '../../src/lib/kbo/kboDataService';
import { getKoreaTodayString, isValidDateString } from '../../src/lib/kbo/dateUtils';

// 메모리 기반 전역 Rate-Limit 추적 객체 (컨테이너 라이프사이클 내에서 유지)
let lastRefreshTime = 0;
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000; // 5분

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { date } = req.query;
    console.log(`[api/kbo/refresh] [CALL] handler - KBO Data Manual Refresh Triggered for date: "${date}"`);
    
    const now = Date.now();
    const timeElapsed = now - lastRefreshTime;

    // 1. Rate-Limit 검증 (동일 사용자/봇의 디도스 방어)
    if (timeElapsed < REFRESH_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((REFRESH_COOLDOWN_MS - timeElapsed) / 1000);
      console.warn(`[api/kbo/refresh] Rate-Limit Blocked. ${remainingSeconds}s remaining.`);
      return res.status(200).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: '너무 빈번한 새로고침 요청입니다. 잠시 후 다시 시도해주세요.',
        cooldownSeconds: remainingSeconds,
        updatedAt: new Date().toISOString()
      });
    }

    const todayStr = getKoreaTodayString();
    const targetDate = (date as string) || todayStr;

    // 2. 날짜 유효성 검사
    if (!isValidDateString(targetDate)) {
      console.error(`[api/kbo/refresh] [ERROR] 유효하지 않은 날짜 형식 요청: "${targetDate}"`);
      return res.status(200).json({
        success: false,
        error: 'INVALID_DATE_FORMAT',
        message: '유효하지 않은 날짜 형식입니다. YYYY-MM-DD 포맷을 입력해주세요.',
        source: 'NONE',
        updatedAt: new Date().toISOString()
      });
    }

    const startTime = Date.now();

    console.log(`[api/kbo/refresh] Invoking force refresh for standings and schedule for date: "${targetDate}"`);
    
    // 순위와 일정을 캐시 무효화 상태로 강제 다시 긁어옵니다.
    const [standingsRes, gamesRes] = await Promise.all([
      getStandingsData(true),
      getTodayGamesData(targetDate, true)
    ]);

    // 둘 다 수집 성공했거나, 최소한 순위표라도 가져왔으면 성공으로 인정
    if (standingsRes.success || gamesRes.success) {
      lastRefreshTime = Date.now();
      const durationMs = lastRefreshTime - startTime;

      console.log(`[api/kbo/refresh] [SUCCESS] Manual refresh completed in ${durationMs}ms.`);
      return res.status(200).json({
        success: true,
        message: `${targetDate} 기준 KBO 리그 데이터가 성공적으로 갱신되었습니다.`,
        refreshedAt: new Date().toISOString(),
        durationMs,
        standingsSource: standingsRes.source,
        scheduleSource: gamesRes.source,
        standingsFallback: standingsRes.fallbackUsed,
        scheduleFallback: gamesRes.fallbackUsed,
        warnings: [...(standingsRes.warnings || []), ...(gamesRes.warnings || [])]
      });
    } else {
      throw new Error(`순위 및 일정 수집 과정이 모두 에러를 반환했습니다. (순위오류: ${standingsRes.error}, 일정오류: ${gamesRes.error})`);
    }

  } catch (err: any) {
    console.error('[api/kbo/refresh] [ERROR] 수동 갱신 중 예외 발생:', err);
    return res.status(200).json({
      success: false,
      error: 'REFRESH_FAILED',
      message: '최신 정보를 크롤링하여 수집하는 과정에서 에러가 발생했거나, 새로 수집한 데이터 검증이 기각되었습니다.',
      details: err.message || String(err),
      source: 'NONE',
      updatedAt: new Date().toISOString()
    });
  }
}

