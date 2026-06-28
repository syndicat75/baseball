/**
 * @file simulate.ts
 * @description Vercel serverless function to run Monte Carlo simulations for KBO postseason entry probabilities.
 * Gathers current standings snapshot and future schedule to simulate thousands of iterations.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildSnapshotByDate, getKstDateString } from '../src/lib/kbo/buildSnapshotByDate';
import { getSchedule, generateFallbackSchedule } from '../src/lib/kbo/parseSchedule';
import { simulateSeason } from '../src/lib/simulation/simulateSeason';
import { ProbabilityModelType } from '../src/types';

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
  const iters = parseInt(iterations as string) || 50000;
  const modelType = (model as ProbabilityModelType) || 'winRate';
  const randSeed = seed ? parseInt(seed as string) : 42;
  const forceRefresh = refresh === 'true';

  let currentPhase = 'api.start';

  try {
    // 1. Gather the historical/current standings snapshot for the date
    console.log(`[api/simulate] Step 1: Compiling standings snapshot as of "${targetDate}"...`);
    currentPhase = 'buildSnapshot.reconstruct';
    const standings = await buildSnapshotByDate(targetDate, forceRefresh);

    // 2. Gather remaining schedule starting from the day after the snapshot date
    console.log(`[api/simulate] Step 2: Compiling schedule and postponed games after "${targetDate}"...`);
    let schedule;
    try {
      currentPhase = 'schedule.fullSeason';
      schedule = await getSchedule(targetDate, forceRefresh);
    } catch (schedError: any) {
      console.warn(`[api/simulate] Schedule compilation failed. Engaging local backup schedule...`, schedError);
      
      const fallbackGames = generateFallbackSchedule();
      const upcomingGames = fallbackGames.filter(g => g.date > targetDate && g.status === 'scheduled');
      
      schedule = {
        from: targetDate,
        games: upcomingGames,
        unresolvedGames: [],
        source: 'fallback-sample',
        errorType: '샘플 데이터 사용' as const,
        errorMessage: `KBO 공식 일정을 수집할 수 없어 내장 샘플 일정을 사용하여 보정합니다. (상세: ${schedError.message})`,
      };
    }

    // 3. Run Monte Carlo simulation on the future schedule
    console.log(`[api/simulate] Step 3: Running Monte Carlo loops (Count: ${iters}, Model: ${modelType})...`);
    currentPhase = 'simulation.run';
    const simResults = await simulateSeason(standings, schedule.games, schedule.unresolvedGames, {
      date: targetDate,
      iterations: iters,
      model: modelType,
      seed: randSeed,
    });

    const isFallback = standings.source === 'fallback-sample' || schedule.source === 'fallback-sample';
    const responseBody = {
      ...simResults,
      unresolvedGames: schedule.unresolvedGames,
      source: isFallback ? 'fallback-sample' : 'official-kbo',
      errorType: standings.errorType || schedule.errorType,
      errorMessage: standings.errorMessage || schedule.errorMessage,
    };

    console.log(`[api/simulate] Successfully completed simulation. Sending JSON response. Source: "${responseBody.source}"`);
    return res.status(200).json(responseBody);
  } catch (error: any) {
    console.error(`[api/simulate] Simulation execution failed:`, error);
    
    let phase = currentPhase;
    const msg = error.message || '';
    if (msg.includes('fetchKboPage') || msg.includes('fetch')) {
      phase = 'parseStandings.fetch';
    } else if (msg.includes('cheerio') || msg.includes('table')) {
      phase = 'parseStandings.tableParser';
    } else if (msg.includes('regex') || msg.includes('text')) {
      phase = 'parseStandings.textParser';
    } else if (msg.includes('month')) {
      phase = 'schedule.fetchMonth';
    }

    return res.status(500).json({
      error: 'Simulation execution failed',
      details: error.message,
      errorMessage: error.message,
      errorType: 'HTML parser 실패',
      stackPreview: error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : '',
      phase,
    });
  }
}
