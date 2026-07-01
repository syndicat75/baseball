/**
 * @file refresh.ts
 * @description KBO 리그 원격 크롤링 데이터 및 내부 캐시 수동 갱신을 수행하는 Vercel Serverless API 엔드포인트입니다.
 * 너무 잦은 외부 웹사이트 호출을 방지하기 위한 5분 Rate-Limit 보호 기작이 포함되어 있습니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBestAvailableStandings, getBestAvailableSchedule } from '../../src/lib/kbo/sources/sourceManager';
import { clearCache, setCache } from '../../src/lib/kbo/cache';
import * as fs from 'fs';
import * as path from 'path';

// 메모리 기반의 초간단 전역 Rate-Limit 추적 객체 (컨테이너 라이프사이클 내에서 유지)
let lastRefreshTime = 0;
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000; // 5분

/**
 * @function getKstDateString
 * @description 현재 서버 시간을 바탕으로 한국 표준시(KST) YYYY-MM-DD 날짜 문자열을 반환합니다.
 */
function getKstDateString(): string {
  console.log('[api/kbo/refresh] [CALL] getKstDateString');
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(utc + kstOffset);
  const yyyy = kstDate.getFullYear();
  const mm = String(kstDate.getMonth() + 1).padStart(2, '0');
  const dd = String(kstDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[api/kbo/refresh] [CALL] handler - KBO Data Manual Refresh Triggered');
  
  const now = Date.now();
  const timeElapsed = now - lastRefreshTime;

  // 1. Rate-Limit 검증
  if (timeElapsed < REFRESH_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((REFRESH_COOLDOWN_MS - timeElapsed) / 1000);
    console.warn(`[api/kbo/refresh] Rate-Limit Blocked. ${remainingSeconds}s remaining.`);
    return res.status(429).json({
      error: 'Too Many Requests',
      message: '너무 빈번한 새로고침 요청입니다. 잠시 후 다시 시도해주세요.',
      cooldownSeconds: remainingSeconds,
    });
  }

  const startTime = Date.now();

  try {
    // 2. 캐시 메모리 청소
    await clearCache();
    console.log('[api/kbo/refresh] Purged active cache store.');

    // 3. 다중 데이터 소스 매니저를 통해 최신 순위 및 일정 수집 기동
    const todayStr = getKstDateString();
    console.log(`[api/kbo/refresh] Re-harvesting data for date: "${todayStr}"`);

    const standingsResult = await getBestAvailableStandings(todayStr);
    const scheduleResult = await getBestAvailableSchedule(todayStr);

    const mergedData = {
      asOfDate: todayStr,
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

    // 4. 로컬 디스크 및 인메모리 캐시 갱신
    // Vercel Serverless의 임시 /tmp 경로 등에 안전하게 보조 저장
    try {
      const candidates = [
        path.join(process.cwd(), 'public', 'data', 'kbo-latest.json'),
        path.join(process.cwd(), 'data', 'kbo-latest.json'),
        path.join('/tmp', 'kbo-latest.json')
      ];
      for (const p of candidates) {
        const dir = path.dirname(p);
        if (fs.existsSync(dir)) {
          fs.writeFileSync(p, JSON.stringify(mergedData, null, 2), 'utf-8');
          console.log(`[api/kbo/refresh] Saved merged raw KBO data to path: ${p}`);
        }
      }
    } catch (fsErr: any) {
      console.warn('[api/kbo/refresh] Filesystem write warning:', fsErr.message);
    }

    // cache 에도 최신화 저장
    await setCache('kbo_latest_data', mergedData);

    // Rate Limit 시간 업데이트
    lastRefreshTime = Date.now();
    const durationMs = lastRefreshTime - startTime;

    console.log(`[api/kbo/refresh] Manual refresh finished successfully in ${durationMs}ms.`);

    return res.status(200).json({
      success: true,
      message: 'KBO 리그 데이터가 성공적으로 갱신되었습니다.',
      refreshedAt: new Date(lastRefreshTime).toISOString(),
      durationMs,
      source: mergedData.primarySource,
      sourceLabel: mergedData.sourceLabel,
    });
  } catch (err: any) {
    console.error('[api/kbo/refresh] 수동 갱신 중 예외 발생:', err);
    return res.status(500).json({
      error: 'Refresh process failed',
      details: err.message,
    });
  }
}
