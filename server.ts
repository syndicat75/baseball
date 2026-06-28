/**
 * @file server.ts
 * @description Full-Stack Express backend for the KBO Postseason entry probability calculator.
 * Exposes scraping APIs, simulation routes, and serves the Vite frontend.
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { buildSnapshotByDate } from './src/lib/kbo/buildSnapshotByDate';
import { getSchedule } from './src/lib/kbo/parseSchedule';
import { simulateSeason } from './src/lib/simulation/simulateSeason';
import { ProbabilityModelType } from './src/lib/simulation/types';

async function startServer() {
  console.log('[server] Initializing Express full-stack server...');
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json());

  // Log all incoming requests
  app.use((req, res, next) => {
    console.log(`[server] [REQUEST] ${req.method} ${req.url} - IP: ${req.ip} - At: ${new Date().toISOString()}`);
    next();
  });

  // ==========================================
  // KBO API Routes
  // ==========================================

  /**
   * GET /api/kbo/standings
   * Returns KBO team standings and head-to-head records up to the specified date.
   */
  app.get('/api/kbo/standings', async (req, res) => {
    const { date, refresh } = req.query;
    console.log(`[server] GET /api/kbo/standings - date: ${date}, refresh: ${refresh}`);
    
    // Default to today if no date is provided
    const targetDate = (date as string) || new Date().toISOString().split('T')[0];
    const forceRefresh = refresh === 'true';

    try {
      const standings = await buildSnapshotByDate(targetDate, forceRefresh);
      res.json(standings);
    } catch (error: any) {
      console.error(`[server] Error compiling standings snapshot:`, error);
      res.status(500).json({
        error: 'Failed to retrieve standings snapshot',
        details: error.message,
      });
    }
  });

  /**
   * GET /api/kbo/schedule
   * Returns remaining matches and unresolved postponements starting from the specified date.
   */
  app.get('/api/kbo/schedule', async (req, res) => {
    const { from, refresh } = req.query;
    console.log(`[server] GET /api/kbo/schedule - from: ${from}, refresh: ${refresh}`);

    const targetDate = (from as string) || new Date().toISOString().split('T')[0];
    const forceRefresh = refresh === 'true';

    try {
      const schedule = await getSchedule(targetDate, forceRefresh);
      res.json(schedule);
    } catch (error: any) {
      console.error(`[server] Error compiling schedule:`, error);
      res.status(500).json({
        error: 'Failed to retrieve schedule database',
        details: error.message,
      });
    }
  });

  /**
   * GET /api/simulate
   * Computes Postseason Entry Probability using Monte Carlo Simulation.
   */
  app.get('/api/simulate', async (req, res) => {
    const { date, iterations, model, seed, refresh } = req.query;
    console.log(`[server] GET /api/simulate - date: ${date}, iterations: ${iterations}, model: ${model}, seed: ${seed}, refresh: ${refresh}`);

    const targetDate = (date as string) || new Date().toISOString().split('T')[0];
    const iters = parseInt(iterations as string) || 50000;
    const modelType = (model as ProbabilityModelType) || 'winRate';
    const randSeed = seed ? parseInt(seed as string) : 42;
    const forceRefresh = refresh === 'true';

    try {
      // 1. Gather the historical/current standings snapshot for the date
      console.log(`[server] Simulation step 1: Compiling standings snapshot as of ${targetDate}...`);
      const standings = await buildSnapshotByDate(targetDate, forceRefresh);

      // 2. Gather remaining schedule starting from the day after the snapshot date
      console.log(`[server] Simulation step 2: Compiling schedule and postponed games after ${targetDate}...`);
      const schedule = await getSchedule(targetDate, forceRefresh);

      // 3. Run Monte Carlo simulation on the future schedule
      console.log(`[server] Simulation step 3: Running Monte Carlo loops (Count: ${iters}, Model: ${modelType})...`);
      const simResults = await simulateSeason(standings, schedule.games, schedule.unresolvedGames, {
        date: targetDate,
        iterations: iters,
        model: modelType,
        seed: randSeed,
      });

      res.json({
        ...simResults,
        unresolvedGames: schedule.unresolvedGames,
      });
    } catch (error: any) {
      console.error(`[server] Simulation calculation error:`, error);
      res.status(500).json({
        error: 'Simulation execution failed',
        details: error.message,
      });
    }
  });

  // ==========================================
  // Vite Middleware & SPA serving
  // ==========================================

  if (process.env.NODE_ENV !== 'production') {
    console.log('[server] Development mode detected. Booting Vite dev server middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('[server] Production mode detected. Serving static assets...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start listening
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] Full-stack KBO App running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[server] Fatal startup crash:', err);
  process.exit(1);
});
