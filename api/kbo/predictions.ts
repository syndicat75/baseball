/**
 * @file predictions.ts
 * @description KBO 경기별 승률 예측 및 세부 분석 데이터를 제공하는 Vercel Serverless API 엔드포인트입니다.
 * GET /api/kbo/predictions?date=YYYY-MM-DD
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'fs';
import * as path from 'path';
import { fallbackSource } from '../../src/lib/kbo/sources/fallbackSource';
import { buildTodayGames } from '../../src/lib/kbo/buildTodayGames';
import { getKoreaTodayString, toKboDate, isValidDateString } from '../../src/lib/kbo/dateUtils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { date } = req.query;
  console.log(`[api/kbo/predictions] [CALL] handler - date param: "${date}"`);

  const todayStr = getKoreaTodayString();
  const targetDate = (date as string) || todayStr;
  const kboDateStr = toKboDate(targetDate);

  // 1. 날짜형식 엄격성 검증
  if (!isValidDateString(targetDate)) {
    console.error(`[api/kbo/predictions] [ERROR] 유효하지 않은 날짜 형식 요청: "${targetDate}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(400).json({
      success: false,
      date: targetDate,
      kboDate: kboDateStr,
      predictions: [],
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
      console.log(`[api/kbo/predictions] [CALL] findDataPath for: "${fileName}"`);
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
          console.log(`[api/kbo/predictions] Found file at: ${p}`);
          return p;
        }
      }
      return null;
    };

    let dataPath = findDataPath(`kbo-${targetDate}.json`);

    if (!dataPath) {
      console.log(`[api/kbo/predictions] 지정 날짜 데이터 "kbo-${targetDate}.json" 없음. kbo-latest.json 검색을 시도합니다.`);
      dataPath = findDataPath('kbo-latest.json');
    }

    let kboData: any;

    if (dataPath && fs.existsSync(dataPath)) {
      const rawData = fs.readFileSync(dataPath, 'utf-8');
      kboData = JSON.parse(rawData);
    } else {
      console.warn('[api/kbo/predictions] JSON 파일 누락. 로컬 예비 데이터 생성.');
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

    // 각 경기의 prediction 정보만 모아서 리스트업
    const predictions = todayGames.map(g => ({
      gameId: g.gameId,
      date: g.date,
      time: g.time,
      stadium: g.stadium,
      awayTeam: g.awayTeam,
      homeTeam: g.homeTeam,
      status: g.status,
      prediction: g.prediction,
    }));

    // s-maxage=600 (10분 캐시)
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

    const response = {
      success: true,
      source: 'prediction-engine',
      sourceLabel: '경기 승률 분석 예측 모델',
      asOfDate: kboData.asOfDate || todayStr,
      targetDate,
      kboDate: kboDateStr,
      fetchedAt: kboData.fetchedAt || new Date().toISOString(),
      predictions,
    };

    console.log(`[api/kbo/predictions] [SUCCESS] Compiled ${predictions.length} predictions for ${targetDate}`);
    return res.status(200).json(response);
  } catch (err: any) {
    console.error('[api/kbo/predictions] [ERROR] 예측 정보 산출 실패:', err);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(500).json({
      success: false,
      date: targetDate,
      kboDate: kboDateStr,
      predictions: [],
      error: '경기 승률 예측 데이터를 로드하거나 연산하는 데 실패했습니다.',
      details: err.message,
    });
  }
}

