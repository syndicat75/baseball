/**
 * @file today-games.ts
 * @description KBO 리그 당일 경기 일정 및 선발 명단 정보를 제공하는 Vercel Serverless API 엔드포인트입니다.
 * 한국시간 기준 오늘 날짜의 경기 리스트(TodayGame[])를 반환합니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'fs';
import * as path from 'path';
import { fallbackSource } from '../../src/lib/kbo/sources/fallbackSource';
import { buildTodayGames } from '../../src/lib/kbo/buildTodayGames';
import { getKoreaTodayString, toKboDate, isValidDateString } from '../../src/lib/kbo/dateUtils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { date } = req.query;
  console.log(`[api/kbo/today-games] [CALL] handler - date param: "${date}"`);

  const todayStr = getKoreaTodayString();
  const targetDate = (date as string) || todayStr;
  const kboDateStr = toKboDate(targetDate);

  // 1. 날짜형식 엄격성 검증
  if (!isValidDateString(targetDate)) {
    console.error(`[api/kbo/today-games] [ERROR] 유효하지 않은 날짜 형식 요청: "${targetDate}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(400).json({
      success: false,
      date: targetDate,
      kboDate: kboDateStr,
      games: [],
      emptyReason: 'FETCH_OR_PARSE_FAILED',
      error: '유효하지 않은 날짜 형식입니다. YYYY-MM-DD 포맷을 입력해주세요.',
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
      console.log(`[api/kbo/today-games] [CALL] findDataPath for: "${fileName}"`);
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
          console.log(`[api/kbo/today-games] Found file at: ${p}`);
          return p;
        }
      }
      return null;
    };

    let dataPath = findDataPath(`kbo-${targetDate}.json`);

    if (!dataPath) {
      console.log(`[api/kbo/today-games] 지정 날짜 데이터 "kbo-${targetDate}.json" 없음. kbo-latest.json 검색을 시도합니다.`);
      dataPath = findDataPath('kbo-latest.json');
    }

    let kboData: any;

    if (dataPath && fs.existsSync(dataPath)) {
      const rawData = fs.readFileSync(dataPath, 'utf-8');
      kboData = JSON.parse(rawData);
    } else {
      console.warn('[api/kbo/today-games] JSON 파일 누락. 로컬 예비 데이터 생성.');
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

    const todayGames = buildTodayGames(kboData, targetDate);

    // 실제 무경기일 때만 캐싱 허용 (s-maxage=600)
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

    const hasGames = todayGames.length > 0;
    const response = {
      success: true,
      date: targetDate,
      kboDate: kboDateStr,
      updatedAt: kboData.fetchedAt || new Date().toISOString(),
      source: kboData.primarySource || 'static-json',
      sourceLabel: kboData.sourceLabel || '예약 수집 JSON 데이터',
      games: todayGames,
      emptyReason: hasGames ? null : 'NO_SCHEDULED_GAMES',
    };

    console.log(`[api/kbo/today-games] [SUCCESS] Compiled ${todayGames.length} games for ${targetDate}`);
    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[api/kbo/today-games] [ERROR] 당일 경기 목록 구축 실패:', err);
    // 실패 시 브라우저 및 프록시 캐시 금지 지정
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(500).json({
      success: false,
      date: targetDate,
      kboDate: kboDateStr,
      games: [],
      emptyReason: 'FETCH_OR_PARSE_FAILED',
      error: '경기 일정 데이터를 가공하거나 로드하는 데 실패했습니다.',
      details: err.message,
    });
  }
}

