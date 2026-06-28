/**
 * @file standings.ts
 * @description KBO 구단 순위 정보 엔드포인트입니다.
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
  const { date } = req.query;
  console.log(`[api/kbo/standings] [CALL] handler - date: "${date}"`);

  const todayStr = getKstDateString();
  const targetDate = (date as string) || todayStr;

  try {
    // 1. JSON 파일 경로 판별 (Vercel Serverless의 특수한 파일 적재 방식 완벽 대응)
    let safeDirname = '';
    try {
      safeDirname = __dirname;
    } catch {
      safeDirname = process.cwd();
    }

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
          console.log(`[api/kbo/standings] Found ${fileName} at: ${p}`);
          return p;
        }
      }
      return null;
    };

    let dataPath = findDataPath(`kbo-${targetDate}.json`);

    if (!dataPath) {
      console.log(`[api/kbo/standings] 지정 날짜 데이터 "kbo-${targetDate}.json" 없음. kbo-latest.json 검색을 시도합니다.`);
      dataPath = findDataPath('kbo-latest.json');
    }

    let kboData: any;

    if (fs.existsSync(dataPath)) {
      const rawData = fs.readFileSync(dataPath, 'utf-8');
      kboData = JSON.parse(rawData);
    } else {
      // 비상시 로컬 번들 데이터 반환
      console.warn('[api/kbo/standings] JSON 파일 누락. 로컬 예비 데이터 생성.');
      const fallbackStandings = await fallbackSource.getStandings();
      kboData = {
        asOfDate: todayStr,
        primarySource: 'bundled-fallback',
        sourceLabel: '번들 로컬 예비 데이터',
        standings: fallbackStandings,
      };
    }

    const response = {
      source: 'static-json',
      sourceLabel: '예약 수집 JSON 데이터',
      originalSource: kboData.primarySource,
      originalSourceLabel: kboData.sourceLabel,
      asOfDate: kboData.asOfDate,
      fetchedAt: kboData.fetchedAt,
      teams: kboData.standings,
    };

    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[api/kbo/standings] 순위 반환 실패:', err);
    return res.status(500).json({
      error: 'Standings load failure',
      details: err.message,
    });
  }
}
