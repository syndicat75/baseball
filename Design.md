# KBO Postseason Probability Calculator - Design Document

This document outlines the overall software architecture, core components, data pipelines, simulation models, and robust error-handling/normalization strategies implemented in the **KBO 가을야구 진출 확률 계산기 (KBO Postseason Probability Calculator)**.

---

## 1. System Architecture Overview

The system is designed as a **Full-Stack, Static-First Client-Side Web Application with Serverless API Proxy Services**. The core calculations are computed in the user's browser using a highly optimized Monte Carlo simulation, while the data is gathered, parsed, and normalized on a schedule via a scheduled background harvester script (`update-kbo-data.ts`).

To offer live standings, scheduled daily matches, and match predictions without client-side scraping, serverless API endpoints are deployed to proxy requests securely and compute advanced prediction logic.

```
+------------------ Scheduled Background (GitHub Actions) -------------------+
|                                                                            |
|  [Official KBO Website]     [MyKBOStats (Unofficial)]     [AiScore (Aux)]  |
|           |                            |                         |         |
|           +----------------------------+-------------------------+         |
|                                        |                                   |
|                                        v                                   |
|                          [Source Manager (sourceManager.ts)]               |
|                                        |                                   |
|                                        v                                   |
|                    [Snapshot Normalizer (normalizeKboSnapshot)]            |
|                                        | (Reconcile / Align 144G Scale)    |
|                                        v                                   |
|                   [Standings-Based Remaining Game Generator]                |
|                                        |                                   |
|                                        v                                   |
|                             [public/data/kbo-latest.json]                  |
|                                        |                                   |
+----------------------------------------|-----------------------------------+
                                         |
                                         +-----------------------------------------+
                                         |                                         | (HTTP GET Fetch)
                                         v                                         v
+------------------ Vercel Serverless API Proxy Layer ----------------+  +-- Browser Runtime UI Layer --+
|                                                                     |  |                              |
|  [GET /api/kbo/standings]     [GET /api/kbo/today-games]            |  |    [loadKboStaticData.ts]    |
|           |                                 |                       |  |              |               |
|  (Detailed Standings stats)   (pitchers, lineups, predictions)      |  |              v               |
|           \                                 /                       |  |    [App (Main Coordinator)]  |
|            \---+---------------------------/                        |  |              |               |
|                |                                                    |  |              v               |
|                v                                                    |  |  [KboTodayGamesAndStandings] |
|     [GET /api/kbo/refresh] (manual scrape trigger with 5m RateLimit)|  |  (Daily Predictions Widget)  |
|                                                                     |  +------------------------------+
+---------------------------------------------------------------------+
```

---

## 2. Core Functional Modules

### A. Data Harvester & Normalizer (`/scripts/update-kbo-data.ts`)
*   **Purpose**: Runs periodically to scrape the latest KBO team standings and schedule.
*   **Fallback Mechanism**: If the remote servers are down or unresponsive, it falls back to the previous successful cached file (`kbo-latest.json`) or uses a bundled local asset dataset.
*   **Snapshot Normalization (`normalizeKboSnapshot`)**: Ensures completed and remaining games match perfectly. If the parsed schedule is inconsistent with the official standings, it invokes the **Standings-Based Remaining Game Generator** to reconstruct unbiased neutral remaining slots for every team up to the 144-game scale.

### B. Neutral Remaining Game Generator (`/src/lib/simulation/generateRemainingGamesFromStandings.ts`)
*   **Purpose**: Dynamically maps each team's remaining game slots ($144 - \text{playedGames}$) and uses a greedy matching algorithm to balance pairings, ensuring no bias toward any team, resulting in a perfect 144-game projection for every simulated path.

### C. Browser Monte Carlo Engine (`/src/lib/simulation/simulateFromStaticData.ts`)
*   **Purpose**: Performs 10,000 to 100,000 season iterations inside a browser-safe, non-blocking asynchronous environment.
*   **Probability Models**: Supports multiple prediction weight models (Basic Equal Chance, Cumulative Current Win Rate, and Hybrid Multi-Dimensional).
*   **Scenario Mode Preprocessing (`/src/lib/scenario/applyScenario.ts`)**: Allows users to freeze a specific team's next $N$ games to a fixed record (e.g., 5 Wins, 3 Losses) and runs comparative simulations to display probability delta changes.

### D. Serverless APIs & Prediction Processing (`/api/kbo/*`, `/src/lib/kbo/buildTodayGames.ts`)
*   **`GET /api/kbo/standings`**: Formats and returns advanced standings statistics (including run differentials, streak details, and last-10 records).
*   **`GET /api/kbo/today-games`**: Assembles today's games list, matches them with expected starters and lineups from configuration presets, and runs the rule-based prediction analyzer.
*   **`GET /api/kbo/refresh`**: Triggers a manual real-time re-crawl of standings and schedules across all prioritized sources, protected by a 5-minute memory-based Rate Limiter (status 429).

---

## 3. Visual & Component Hierarchy

The UI is built with desktop-first precision using **React 19**, styled with custom **Tailwind CSS**, and features smooth visual micro-interactions using **motion/react**:

1.  **Header Indicator Area**: Displays the current calculation parameters, selected model, seed, and real-time execution statistics.
2.  **Live Standings & Match Predictor (`KboTodayGamesAndStandings.tsx`)**:
    *   **Interactive Tabs**: Swappable views for "당일 경기 일정 및 승률 예측" and "실시간 현재 팀 순위표".
    *   **Accordion Cards**: Collapsible match items showing a comparison of pitcher statistics, team rosters/lineups, and prediction parameters.
    *   **Manual Re-crawler Button**: Provides real-time sync with rate-limiting indicators.
    *   **Gambling Disclaimer**: Highlights that calculations are for informational and analysis purposes only.
3.  **Advanced Analytics Grid (Bento Boxes)**:
    *   **Data Reliability Card (`DataReliabilityCard.tsx`)**: Displays a percentage confidence index based on data source freshness and schedule-to-standings integrity.
    *   **5th Place Cutoff Card (`FifthPlaceCutoffCard.tsx`)**: Displays percentile scenarios (25%, 50%, 75%, 90%) for the wins required to secure 5th place.
    *   **Probability Delta Card (`ProbabilityChangeCard.tsx`)**: Reflects daily changes comparing the active snapshot with the previous day's results.
4.  **Scenario Mode Controller (`ScenarioModePanel.tsx`)**: Interactive interface to construct hypothetical records and analyze post-scenario chances.
5.  **Team Probability Matrix (`ProbabilityCards.tsx` / `ProbabilityTable.tsx`)**: Renders team logos, current stats, remaining game counts, and postseason probability bars. Clicking a team opens the **Team Detail Panel Overlay**.
6.  **Team Detail Overlay Panel (`TeamDetailPanel.tsx`)**: Shows the team's rank distribution heatmap, remaining matchups, target win probabilities, and postseason likelihood at specific win targets.
7.  **Historical Rank Heatmap (`RankDistribution.tsx`)**: A fully realized color-coded matrix displaying the probability of every team finishing in positions 1st through 10th.

---

## 4. Key Design and Code Quality Standards

*   **Type Safety**: Every shared interface, enum, and class payload is defined in `/src/types.ts` to ensure strict contract mapping.
*   **Lazy Initialization & Fault-Tolerance**: All web scraper selectors are wrapped in try-catch structures, and division operations are guarded against division-by-zero errors.
*   **Exhaustive Telemetry Logs**: Function executions, database state modifications, and user interactive actions are comprehensively logged to the console to enable easy debugging.enable easy debugging.
