/**
 * @file snapshot.ts
 * @description KBO 리그의 가을야구 시뮬레이션용 최신 수집 데이터 스냅샷을 반환하는 Vercel Serverless API 엔드포인트입니다.
 * 브라우저가 정적 JSON 파일(/public/data/kbo-latest.json)을 직접 읽지 않도록 프록시/추상화 레이어를 제공하며,
 * 파일이 유실되었거나 읽을 수 없을 때는 서버 측에 내장된 fallback 데이터셋으로 안전하게 전환하여 중단 없는 서비스를 유지합니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import path from 'path';
import fs from 'fs';
import { fallbackKboData } from '../../src/data/fallbackKboData';

/**
 * @function handler
 * @description 가을야구 진출 확률 시뮬레이터에서 요구하는 정적 수집 스냅샷 데이터를 조회 및 가공하여 반환하는 메인 핸들러입니다.
 * @param {VercelRequest} req - Vercel Serverless 요청 객체
 * @param {VercelResponse} res - Vercel Serverless 응답 객체
 * @returns {Promise<void>}
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[api/kbo/snapshot] [CALL] KBO Simulation snapshot requested.');

  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'kbo-latest.json');
    console.log(`[api/kbo/snapshot] Attempting to load static snapshot from: "${filePath}"`);

    let snapshotData: any = null;
    let isFallback = false;

    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        snapshotData = JSON.parse(fileContent);
        console.log(`[api/kbo/snapshot] [SUCCESS] Successfully loaded and parsed "${filePath}". asOfDate: "${snapshotData.asOfDate}"`);
      } catch (parseErr: any) {
        console.error('[api/kbo/snapshot] [ERROR] Failed to parse kbo-latest.json. Falling back.', parseErr);
        snapshotData = fallbackKboData;
        isFallback = true;
      }
    } else {
      console.warn(`[api/kbo/snapshot] [WARNING] "${filePath}" does not exist. Using bundled fallback data.`);
      snapshotData = fallbackKboData;
      isFallback = true;
    }

    // s-maxage=1800 (30분 캐시 설정)
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=600');

    console.log(`[api/kbo/snapshot] [SUCCESS] Responding with snapshot data. asOfDate: "${snapshotData.asOfDate}", isFallback: ${isFallback}`);
    return res.status(200).json({
      success: true,
      asOfDate: snapshotData.asOfDate || '2026-07-03',
      updatedAt: snapshotData.fetchedAt || new Date().toISOString(),
      stale: true, // 정적 스냅샷이므로 무조건 stale: true 고정
      source: isFallback ? 'bundled-fallback' : 'static-snapshot',
      sourceLabel: isFallback ? '내장 백업 스냅샷' : '정적 백업 스냅샷',
      standings: snapshotData.standings || [],
      remainingGames: snapshotData.remainingGames || [],
      completedGames: snapshotData.completedGames || []
    });

  } catch (err: any) {
    console.error('[api/kbo/snapshot] [CRITICAL] Exception in snapshot handler:', err);
    return res.status(200).json({
      success: false,
      error: 'SNAPSHOT_LOAD_FAILED',
      message: '시뮬레이션 스냅샷 데이터를 구성하는 중 예외가 발생했습니다.',
      details: err.message || String(err),
      asOfDate: '2026-07-03',
      updatedAt: new Date().toISOString(),
      stale: true,
      source: 'bundled-fallback',
      sourceLabel: '내장 백업 스냅샷(에러복구)',
      standings: fallbackKboData.standings,
      remainingGames: fallbackKboData.remainingGames,
      completedGames: fallbackKboData.completedGames
    });
  }
}
