/**
 * @file schedule.ts
 * @description KBO 경기 일정 정보 엔드포인트입니다.
 * 외부 사이트를 직접 크롤링하지 않고 예약 수집된 로컬 JSON 캐시를 그대로 반환합니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'fs';
import * as path from 'path';
import { fallbackSource } from '../../src/lib/kbo/sources/fallbackSource';

/**
 * 한국 시간(KST) 기준 YYYY-MM-DD 날짜 반환
 */
function getKstDateString(): string {
  const d = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(d.getTime() + kstOffset);
  return kstDate.toISOString().split('T')[0];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { from } = req.query;
  console.log(`[api/kbo/schedule] [CALL] handler - from: "${from}"`);

  const todayStr = getKstDateString();
  const targetDate = (from as string) || todayStr;

  try {
    // 1. JSON 파일 경로 판별 (Vercel Serverless의 특수한 파일 적재 방식 완벽 대응)
    let safeDirname = '';
    try {
      safeDirname = __dirname;
    } catch {
      safeDirname = process.cwd();
    }

    /**
     * Vercel Serverless 실행 환경 및 로컬 환경에서 지정된 JSON 데이터 파일의 물리적 경로를 탐색하여 반환합니다.
     * @param fileName 탐색할 JSON 파일명 (예: kbo-latest.json)
     * @returns 파일이 존재하는 경로 문자열 또는 null
     */
    const findDataPath = (fileName: string): string | null => {
      const candidates = [
        path.join(process.cwd(), 'public', 'data', fileName),
        path.join(process.cwd(), 'data', fileName),
        path.join(safeDirname, '..', 'public', 'data', fileName),
        path.join(safeDirname, '..', '..', 'public', 'data', fileName),
        path.join(safeDirname, '..', '..', '..', 'public', 'data', fileName),
        path.join(safeDirname, 'public', 'data', fileName),
        path.join(safeDirname, 'data', fileName),
        path.join('/var/task', 'public', 'data', fileName),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          console.log(`[api/kbo/schedule] Found ${fileName} at: ${p}`);
          return p;
        }
      }
      return null;
    };

    let dataPath = findDataPath(`kbo-${targetDate}.json`);

    if (!dataPath) {
      console.log(`[api/kbo/schedule] 지정 날짜 데이터 "kbo-${targetDate}.json" 없음. kbo-latest.json 검색을 시도합니다.`);
      dataPath = findDataPath('kbo-latest.json');
    }

    let kboData: any;

    if (fs.existsSync(dataPath)) {
      const rawData = fs.readFileSync(dataPath, 'utf-8');
      kboData = JSON.parse(rawData);
    } else {
      // 비상시 로컬 번들 데이터 반환
      console.warn('[api/kbo/schedule] JSON 파일 누락. 로컬 예비 데이터 생성.');
      const fallbackSchedule = await fallbackSource.getSchedule();
      kboData = {
        asOfDate: todayStr,
        primarySource: 'bundled-fallback',
        sourceLabel: '번들 로컬 예비 데이터',
        remainingGames: fallbackSchedule.remainingGames,
        completedGames: fallbackSchedule.completedGames,
      };
    }

    const completedGames = kboData.completedGames || [];
    const remainingGames = kboData.remainingGames || [];
    const unresolvedGames = remainingGames.filter((g: any) => g.status === 'scheduled');
    const allGames = [...completedGames, ...remainingGames];

    const response = {
      source: 'static-json',
      sourceLabel: '예약 수집 JSON 데이터',
      originalSource: kboData.primarySource,
      originalSourceLabel: kboData.sourceLabel,
      completedGames,
      remainingGames,
      unresolvedGames,
      games: allGames,
      asOfDate: kboData.asOfDate,
      fetchedAt: kboData.fetchedAt,
    };

    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[api/kbo/schedule] 일정 반환 실패:', err);
    return res.status(500).json({
      error: 'Schedule load failure',
      details: err.message,
    });
  }
}
