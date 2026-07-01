/**
 * @file standings.ts
 * @description KBO 리그 팀 순위표 정보 제공 Vercel Serverless API 엔드포인트입니다.
 * 득점, 실점, 연승/연패, 최근 10경기 및 게임차 등 확장된 세부 통계(TeamStanding[])를 계산하여 캐싱한 뒤 반환합니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'fs';
import * as path from 'path';
import { fallbackSource } from '../../src/lib/kbo/sources/fallbackSource';
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
    let safeDirname = '';
    try {
      safeDirname = __dirname;
    } catch {
      safeDirname = process.cwd();
    }

    const findDataPath = (fileName: string): string | null => {
      console.log(`[api/kbo/standings] [CALL] findDataPath for: "${fileName}"`);
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
          console.log(`[api/kbo/standings] Found file at: ${p}`);
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

    if (dataPath && fs.existsSync(dataPath)) {
      const rawData = fs.readFileSync(dataPath, 'utf-8');
      kboData = JSON.parse(rawData);
    } else {
      console.warn('[api/kbo/standings] JSON 파일 누락. 로컬 예비 데이터 생성.');
      const fallbackStandings = await fallbackSource.getStandings();
      const fallbackSchedule = await fallbackSource.getSchedule();
      kboData = {
        asOfDate: todayStr,
        primarySource: 'bundled-fallback',
        sourceLabel: '번들 로컬 예비 데이터',
        standings: fallbackStandings,
        completedGames: fallbackSchedule.completedGames || [],
        remainingGames: fallbackSchedule.remainingGames || [],
      };
    }

    const rawStandings = kboData.standings || [];
    const completedGames = kboData.completedGames || [];
    const fetchedAt = kboData.fetchedAt || new Date().toISOString();

    if (!rawStandings || rawStandings.length === 0) {
      throw new Error('수집된 순위 데이터가 비어 있습니다.');
    }

    const detailedStandings = calculateDetailedStandings(rawStandings, completedGames, fetchedAt);

    // 성공한 경우에만 30분 캐시 (s-maxage=1800)
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=600');

    const response = {
      success: true,
      date: targetDate,
      kboDate: kboDateStr,
      source: kboData.primarySource || 'static-json',
      sourceLabel: kboData.sourceLabel || '예약 수집 JSON 데이터',
      asOfDate: kboData.asOfDate || todayStr,
      updatedAt: fetchedAt,
      standings: detailedStandings,
    };

    console.log(`[api/kbo/standings] [SUCCESS] Mapped ${detailedStandings.length} standings for ${targetDate}`);
    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[api/kbo/standings] [ERROR] 순위표 데이터 구축 실패:', err);
    // 실패 시 브라우저 및 프록시 캐시 금지 지정
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

