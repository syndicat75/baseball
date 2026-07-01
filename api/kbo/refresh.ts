/**
 * @file refresh.ts
 * @description KBO 리그 원격 크롤링 데이터 및 내부 캐시 수동 갱신을 수행하는 Vercel Serverless API 엔드포인트입니다.
 * 너무 잦은 외부 웹사이트 호출을 방지하기 위한 5분 Rate-Limit 보호 기작이 포함되어 있습니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBestAvailableStandings, getBestAvailableSchedule } from '../../src/lib/kbo/sources/sourceManager';
import { clearCache, setCache } from '../../src/lib/kbo/cache';
import { getKoreaTodayString, toKboDate, isValidDateString } from '../../src/lib/kbo/dateUtils';
import * as fs from 'fs';
import * as path from 'path';

// 메모리 기반의 초간단 전역 Rate-Limit 추적 객체 (컨테이너 라이프사이클 내에서 유지)
let lastRefreshTime = 0;
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000; // 5분

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { date } = req.query;
  console.log(`[api/kbo/refresh] [CALL] handler - KBO Data Manual Refresh Triggered for date: "${date}"`);
  
  const now = Date.now();
  const timeElapsed = now - lastRefreshTime;

  // 1. Rate-Limit 검증
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
  const kboDateStr = toKboDate(targetDate);

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
    // 3. 캐시 메모리 청소 (전체 캐시를 삭제해 오래된 항목 소거)
    await clearCache();
    console.log('[api/kbo/refresh] Purged active cache store.');

    // 4. 다중 데이터 소스 매니저를 통해 최신 순위 및 일정 수집 기동
    console.log(`[api/kbo/refresh] Re-harvesting data for date: "${targetDate}"`);

    const standingsResult = await getBestAvailableStandings(targetDate);
    const scheduleResult = await getBestAvailableSchedule(targetDate);

    const mergedData = {
      asOfDate: targetDate,
      fetchedAt: new Date().toISOString(),
      primarySource: standingsResult.source,
      sourceLabel: standingsResult.sourceLabel,
      standingsSource: standingsResult.source,
      standingsSourceLabel: standingsResult.sourceLabel,
      scheduleSource: scheduleResult.source,
      scheduleSourceLabel: scheduleResult.sourceLabel,
      standings: standingsResult.teams,
      completedGames: scheduleResult.games.filter((g: any) => g.status === 'completed'),
      remainingGames: scheduleResult.games.filter((g: any) => g.status !== 'completed'),
      warnings: [...(standingsResult.warnings || []), ...(scheduleResult.warnings || [])],
    };

    // 5. 로컬 디스크 및 인메모리 캐시 갱신
    // 특정 날짜 파일(kbo-YYYY-MM-DD.json)과 최신 파일(kbo-latest.json) 모두 저장
    const filesToSave = [
      `kbo-${targetDate}.json`,
      'kbo-latest.json'
    ];

    try {
      for (const fileName of filesToSave) {
        const candidates = [
          path.join(process.cwd(), 'public', 'data', fileName),
          path.join(process.cwd(), 'data', fileName),
          path.join('/tmp', fileName)
        ];
        for (const p of candidates) {
          const dir = path.dirname(p);
          if (fs.existsSync(dir)) {
            fs.writeFileSync(p, JSON.stringify(mergedData, null, 2), 'utf-8');
            console.log(`[api/kbo/refresh] Saved merged raw KBO data to path: ${p}`);
          }
        }
      }
    } catch (fsErr: any) {
      console.warn('[api/kbo/refresh] Filesystem write warning:', fsErr.message);
    }

    // 6. 요구사항 만족: 데이트를 포함한 캐시 키를 활용하여 개별 세트 캐싱 수행
    await setCache(`kbo:standings:${targetDate}`, mergedData.standings);
    await setCache(`kbo:schedule:${targetDate}`, scheduleResult.games);
    await setCache('kbo_latest_data', mergedData);

    // Rate Limit 시간 업데이트
    lastRefreshTime = Date.now();
    const durationMs = lastRefreshTime - startTime;

    console.log(`[api/kbo/refresh] [SUCCESS] Manual refresh finished successfully in ${durationMs}ms.`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    return res.status(200).json({
      success: true,
      message: `${targetDate} 기준 KBO 리그 데이터가 성공적으로 갱신되었습니다.`,
      refreshedAt: new Date(lastRefreshTime).toISOString(),
      durationMs,
      source: mergedData.primarySource,
      sourceLabel: mergedData.sourceLabel,
    });
  } catch (err: any) {
    console.error('[api/kbo/refresh] [ERROR] 수동 갱신 중 예외 발생:', err);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(500).json({
      success: false,
      error: 'Refresh process failed',
      details: err.message,
    });
  }
}

