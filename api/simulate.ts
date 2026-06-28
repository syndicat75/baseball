/**
 * @file simulate.ts
 * @description KBO 가을야구 진출 확률을 연산하는 몬테카를로 시뮬레이션 엔드포인트입니다.
 * 실시간 크롤링을 완전히 배제하고, 예약 수집된 정적 로컬 JSON 데이터 파일만 읽어 고속 연산을 처리합니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'fs';
import * as path from 'path';
import { simulateSeason } from '../src/lib/simulation/simulateSeason';
import { ProbabilityModelType, KBOGame, KBOStandingsResult } from '../src/types';
import { getEstimatedHeadToHead } from '../src/lib/kbo/sources/sourceManager';
import { fallbackSource } from '../src/lib/kbo/sources/fallbackSource';

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
  const { date, iterations, model, seed } = req.query;
  console.log(`[api/simulate] [CALL] handler - date: "${date}", iterations: "${iterations}", model: "${model}", seed: "${seed}"`);

  const todayStr = getKstDateString();
  const targetDate = (date as string) || todayStr;

  let requestedIters = parseInt(iterations as string) || 10000;
  let iters = requestedIters;
  const warnings: string[] = [];

  // Vercel Serverless 안정성을 위해 루프 횟수 제한 적용
  if (iters > 10000) {
    iters = 10000;
    warnings.push(`안정성을 위해 ${requestedIters.toLocaleString()}회 시뮬레이션 요청이 10,000회 연산으로 조정되었습니다.`);
  }

  const modelType = (model as ProbabilityModelType) || 'winRate';
  const randSeed = seed ? parseInt(seed as string) : 42;

  try {
    // 1. JSON 파일 경로 판별
    const dataDir = path.join(process.cwd(), 'public', 'data');
    let dataPath = path.join(dataDir, `kbo-${targetDate}.json`);

    if (!fs.existsSync(dataPath)) {
      console.log(`[api/simulate] 지정 날짜 데이터 "${targetDate}" 없음. kbo-latest.json으로 우회합니다.`);
      dataPath = path.join(dataDir, 'kbo-latest.json');
    }

    let kboData: any;

    if (fs.existsSync(dataPath)) {
      console.log(`[api/simulate] 정적 JSON 파일 로드 성공: ${dataPath}`);
      const rawData = fs.readFileSync(dataPath, 'utf-8');
      kboData = JSON.parse(rawData);
    } else {
      // 2. 만약 어떠한 JSON 캐시 파일도 존재하지 않을 경우를 대비해 긴급 로컬 fallback 생성
      console.warn('[api/simulate] 어떠한 캐시 JSON 파일도 존재하지 않습니다! 긴급 로컬 Fallback을 가동합니다.');
      const fallbackStandings = await fallbackSource.getStandings();
      const fallbackSchedule = await fallbackSource.getSchedule();
      kboData = {
        asOfDate: todayStr,
        fetchedAt: new Date().toISOString(),
        primarySource: 'bundled-fallback',
        sourceLabel: '번들 로컬 예비 데이터 (긴급 비상 조치)',
        standings: fallbackStandings,
        remainingGames: fallbackSchedule.remainingGames,
        completedGames: fallbackSchedule.completedGames,
        failedSources: [{ source: 'local-cache-missing', reason: 'public/data/ 폴더에 캐시 파일이 생성되어 있지 않습니다.' }],
        warnings: ['시스템 초기 설치 상태이거나, 예약 수집 파일이 부재하여 시스템 임시 하드코딩 데이터를 탑재했습니다.'],
      };
    }

    // 3. 시뮬레이션용 데이터 구조 복원
    const headToHead = getEstimatedHeadToHead(kboData.standings);
    const standingsResult: KBOStandingsResult = {
      asOfDate: kboData.asOfDate,
      source: 'static-json', // 프론트 요구사항 8번에 따른 소스명 통일
      teams: kboData.standings.map((t: any) => ({
        team: t.team,
        nameKo: t.displayName || t.nameKo || t.team,
        games: t.games,
        wins: t.wins,
        losses: t.losses,
        draws: t.draws,
        winRate: t.winRate,
        rank: t.rank,
      })),
      headToHead,
    };

    const unresolvedGames = kboData.remainingGames.filter((g: KBOGame) => g.status === 'scheduled');
    const allGames = [...kboData.completedGames, ...kboData.remainingGames];

    // 4. 시뮬레이션 수행
    console.log(`[api/simulate] 몬테카를로 시뮬레이션 연산 작동 (반복: ${iters}회, 모델: ${modelType})`);
    const simResults = await simulateSeason(standingsResult, allGames, unresolvedGames, {
      date: kboData.asOfDate,
      iterations: iters,
      model: modelType,
      seed: randSeed,
    });

    const isFallback = kboData.primarySource === 'bundled-fallback';
    const finalSource = isFallback ? 'bundled-fallback' : kboData.primarySource;

    const responseBody = {
      ...simResults,
      unresolvedGames,
      source: 'static-json',
      sourceLabel: '예약 수집 JSON 데이터',
      originalSource: finalSource,
      originalSourceLabel: kboData.sourceLabel,
      fetchedAt: kboData.fetchedAt,
      errorType: isFallback ? '샘플 데이터 사용' : undefined,
      errorMessage: isFallback ? '로컬 예비 데이터를 기준으로 연산 완료되었습니다.' : undefined,
      warnings: [
        ...warnings,
        ...(kboData.warnings || [])
      ],
      failedSources: kboData.failedSources || []
    };

    console.log('[api/simulate] 시뮬레이션 완료. 응답을 정상 전달합니다.');
    return res.status(200).json(responseBody);
  } catch (error: any) {
    console.error('[api/simulate] 시뮬레이션 도중 치명적 에러 발생:', error);
    return res.status(500).json({
      error: 'Simulation critical failure',
      details: error.message,
      errorMessage: '시뮬레이션 가동 중 극심한 연산 장해가 감지되었습니다.',
    });
  }
}
