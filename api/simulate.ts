/**
 * @file simulate.ts
 * @description Vercel serverless function to run Monte Carlo simulations for KBO postseason entry probabilities.
 * Gathers current standings snapshot and future schedule to simulate thousands of iterations.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildSnapshotByDate } from '../src/lib/kbo/buildSnapshotByDate';
import { getSchedule } from '../src/lib/kbo/parseSchedule';
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
  console.log(`[api/simulate] GET request received - date: "${date}", iterations: "${iterations}", model: "${model}", seed: "${seed}", refresh: "${refresh}"`);

  const targetDate = (date as string) || new Date().toISOString().split('T')[0];
  const iters = parseInt(iterations as string) || 50000;
  const modelType = (model as ProbabilityModelType) || 'winRate';
  const randSeed = seed ? parseInt(seed as string) : 42;
  const forceRefresh = refresh === 'true';

  try {
    // 1. Gather the historical/current standings snapshot for the date
    console.log(`[api/simulate] Step 1: Compiling standings snapshot as of "${targetDate}"...`);
    const standings = await buildSnapshotByDate(targetDate, forceRefresh);

    // 2. Gather remaining schedule starting from the day after the snapshot date
    console.log(`[api/simulate] Step 2: Compiling schedule and postponed games after "${targetDate}"...`);
    const schedule = await getSchedule(targetDate, forceRefresh);

    // 3. Run Monte Carlo simulation on the future schedule
    console.log(`[api/simulate] Step 3: Running Monte Carlo loops (Count: ${iters}, Model: ${modelType})...`);
    const simResults = await simulateSeason(standings, schedule.games, schedule.unresolvedGames, {
      date: targetDate,
      iterations: iters,
      model: modelType,
      seed: randSeed,
    });

    const responseBody = {
      ...simResults,
      unresolvedGames: schedule.unresolvedGames,
      source: standings.source === 'fallback-sample' || schedule.source === 'fallback-sample' ? 'fallback-sample' : 'official-kbo',
      errorType: standings.errorType || schedule.errorType,
      errorMessage: standings.errorMessage || schedule.errorMessage,
    };

    console.log(`[api/simulate] Successfully completed simulation. Sending JSON response.`);
    return res.status(200).json(responseBody);
  } catch (error: any) {
    console.error(`[api/simulate] Simulation execution failed:`, error);
    return res.status(500).json({
      error: 'Simulation execution failed',
      details: error.message,
      errorType: 'HTML parser 실패',
    });
  }
}
