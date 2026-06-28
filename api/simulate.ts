/**
 * @file simulate.ts
 * @description Vercel serverless function to run Monte Carlo simulations for KBO postseason entry probabilities.
 * Gathers current standings snapshot and future schedule to simulate thousands of iterations.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildSnapshotByDate, getKstDateString } from '../src/lib/kbo/buildSnapshotByDate';
import { getBestAvailableStandings, getBestAvailableSchedule } from '../src/lib/kbo/sources';
import { simulateSeason } from '../src/lib/simulation/simulateSeason';
import { ProbabilityModelType } from '../src/types';
import { getFallbackStandings } from '../src/lib/kbo/parseStandings';
import { fallbackSource } from '../src/lib/kbo/sources/fallbackSource';

/**
 * Handles GET /api/simulate to run postseason entry probability simulations.
 * 
 * @param req - Incoming Vercel HTTP request
 * @param res - Outgoing Vercel HTTP response
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { date, iterations, model, seed, refresh } = req.query;
  console.log(`[api/simulate] [CALL] handler - date: "${date}", iterations: "${iterations}", model: "${model}", seed: "${seed}", refresh: "${refresh}"`);

  // Default to Korea Standard Time today if no date is provided
  const targetDate = (date as string) || getKstDateString();
  const todayStr = getKstDateString();

  let requestedIters = parseInt(iterations as string) || 10000;
  let iters = requestedIters;
  const warnings: string[] = [];

  // Cap at 10000 for serverless safety to ensure execution times strictly below 2 seconds (well within 9 seconds)
  if (iters > 10000) {
    iters = 10000;
    warnings.push(`Vercel 서버리스 안정성을 위해 ${requestedIters.toLocaleString()}회 시뮬레이션 요청이 내부적으로 10,000회 연산으로 자동 조절되었습니다.`);
  }

  const modelType = (model as ProbabilityModelType) || 'winRate';
  const randSeed = seed ? parseInt(seed as string) : 42;

  try {
    // 1. Gather the historical/current standings snapshot for the date
    console.log(`[api/simulate] Step 1: Compiling standings snapshot as of "${targetDate}"...`);
    let standings;
    if (targetDate >= todayStr) {
      standings = await getBestAvailableStandings(targetDate);
    } else {
      standings = await buildSnapshotByDate(targetDate);
    }

    // 2. Gather remaining schedule starting from the day after the snapshot date
    console.log(`[api/simulate] Step 2: Compiling schedule and postponed games after "${targetDate}"...`);
    const schedule = await getBestAvailableSchedule(targetDate);

    // 3. Run Monte Carlo simulation on the future schedule
    console.log(`[api/simulate] Step 3: Running Monte Carlo loops (Count: ${iters}, Model: ${modelType})...`);
    const simResults = await simulateSeason(standings, schedule.games, schedule.unresolvedGames, {
      date: targetDate,
      iterations: iters,
      model: modelType,
      seed: randSeed,
    });

    const isFallback = standings.source === 'bundled-fallback' || schedule.source === 'bundled-fallback';
    const finalSource = isFallback ? 'bundled-fallback' : (standings.source || 'official-kbo');

    const responseBody = {
      ...simResults,
      unresolvedGames: schedule.unresolvedGames,
      source: finalSource,
      sourceLabel: standings.sourceLabel || standings.source,
      scheduleSource: schedule.source,
      scheduleSourceLabel: schedule.sourceLabel || schedule.source,
      errorType: standings.errorType || schedule.errorType,
      errorMessage: standings.errorMessage || schedule.errorMessage,
      warnings: [
        ...warnings,
        ...(standings.warnings || []),
        ...(schedule.warnings || [])
      ],
      failedSources: [
        ...(standings.failedSources || []),
        ...(schedule.failedSources || [])
      ]
    };

    console.log(`[api/simulate] Successfully completed simulation. Sending JSON response. Source: "${responseBody.source}"`);
    return res.status(200).json(responseBody);
  } catch (error: any) {
    console.error(`[api/simulate] Simulation execution failed, trying local emergency fallback:`, error);
    
    try {
      // Emergency absolute fallback
      const targetDate = getKstDateString();
      const emStandings = getFallbackStandings(targetDate, 'HTML parser 실패', `시뮬레이션 중 오류 복구: ${error.message}`);
      const emSchedule = await fallbackSource.getSchedule(targetDate);

      const simResults = await simulateSeason(emStandings, emSchedule.games, emSchedule.unresolvedGames, {
        date: targetDate,
        iterations: 10000,
        model: modelType,
        seed: randSeed,
      });

      return res.status(200).json({
        ...simResults,
        unresolvedGames: emSchedule.unresolvedGames,
        source: 'bundled-fallback',
        sourceLabel: '번들 로컬 예비 데이터',
        scheduleSource: 'bundled-fallback',
        scheduleSourceLabel: '번들 로컬 예비 데이터',
        errorType: '샘플 데이터 사용',
        errorMessage: `데이터 수집 실패로 인해 예비 데이터로 연산했습니다. (${error.message})`,
        warnings: [`시뮬레이션 도중 복구 불가능한 시스템 예외가 발생하여, 내장 번들 데이터 기준으로 결과를 재생성하였습니다.`],
        failedSources: [{ source: 'all', reason: error.message }]
      });
    } catch (fallbackErr: any) {
      return res.status(500).json({
        error: 'Simulation critical failure',
        details: error.message,
        errorMessage: '코드 실행 자체가 불가능한 치명적인 시스템 오류가 발생했습니다.',
        errorType: 'HTML parser 실패',
      });
    }
  }
}

