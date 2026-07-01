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
*   **Exhaustive Telemetry Logs**: Function executions, database state modifications, and user interactive actions are comprehensively logged to the console to enable easy debugging.
*   **Robust Date Normalization & Partial Failure Isolation**:
    *   **Centralized KST Date Utilities (`/src/lib/kbo/dateUtils.ts`)**: Implements strict `Asia/Seoul` timezone normalization using `Intl.DateTimeFormat`. Eliminates client-server UTC offset drift and ensures that KBO dates are consistently formatted as `YYYY-MM-DD` and converted to `YYYYMMDD` without shifting.
    *   **Isolated API Error Boundaries**: Isolates the frontend fetching state for Team Standings and Today's Games. An API failure or data parsing glitch in the standings feed is contained within the standings tab view, preventing a total app crash and keeping the daily game scheduling/prediction board completely operational.
    *   **Cache Eviction on Failure**: API handlers explicitly configure `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate` for any failed operations (`success: false`). Genuine game-less days are safely cached with a standard TTL, while temporary serverless crawl hiccups are cleared instantly on reload.


---

## 5. Advanced Rule-Based Prediction Engine (`/src/lib/kbo/predictionEngine.ts`)

To ensure robust and highly analytical game outcomes without relying on unstable offline ML networks or paid APIs, we implement a **Multi-Factor Rule-Based Deterministic Scoring Model** combining 5 key dimension metrics:

### A. Team Base Strength (25% Weight)
*   **Formula**:
    $$\text{teamBaseScore} = \text{seasonWinPct} \times 0.55 + \text{pythagoreanWinPct} \times 0.35 + \text{normalizedRunDiff} \times 0.10$$
*   **Pythagorean Win Rate**:
    $$\text{pythagoreanWinPct} = \frac{\text{runs}^{1.83}}{\text{runs}^{1.83} + \text{runsAllowed}^{1.83}}$$
*   **Run Differential Normalization**: Normalizes season runs differential ($\text{runs} - \text{runsAllowed}$) within a KBO-realistic window of $[-150, 150]$ to a standard $[0, 1]$ scale.

### B. Recent 10-Game Trend (15% Weight)
*   Extracts the team's true recent form based on actual completed match histories ($P(\text{Win}) = \frac{\text{last10Wins}}{10}$).
*   Fallback: If 10-game history is missing, defaults gracefully to the season win rate with a telemetry alert and down-grades prediction confidence.

### C. Starting Pitcher Matchup (30% Weight)
*   **Formula**:
    $$\text{pitcherScore} = \text{normEra} \times 0.40 + \text{normWhip} \times 0.25 + \text{pitcherWinPct} \times 0.20 + \text{normInnings} \times 0.15$$
*   **Era Normalization (Lower is Better)**: Standardized between $2.00$ (best) and $7.00$ (worst).
*   **Whip Normalization (Lower is Better)**: Standardized between $1.00$ and $1.80$.
*   **Innings Normalization (Higher is Better)**: Standardized between $40$ and $180$.
*   **Recent Form**: If `recentEra` (last 3 matches) is available, it overrides the career season average to represent live momentum.

### D. Lineup 화력 (15% Weight)
*   Evaluated via a 4-tier fallback model:
    1.  **Tier 1**: Cumulative average OPS of the 9-man confirmed/expected active batting lineup.
    2.  **Tier 2**: Cumulative Season Team OPS.
    3.  **Tier 3**: Cumulative Season Team Batting Average.
    4.  **Tier 4**: Neutral KBO standard average ($0.500$).

### E. Bullpen Stability (5% Weight)
*   Calculated based on the bullpen-specific ERA normalized against the league standard $[2.50, 6.50]$.
*   *Note: Includes a TODO anchor for a dynamic pitch-count fatigue load index in subsequent minor releases.*

### F. Elo Rating & Home Advantage (10% Weight)
*   **Elo Formula**:
    $$\text{teamElo} = 1500 + (\text{seasonWinPct} - 0.5) \times 400$$
    *   *Home team receives a standard $+25$ point advantage booster to their Elo rating prior to match simulation.*
*   **Elo Winning Expectation**:
    $$P_{\text{Elo}} = \frac{1}{1 + 10^{\frac{\text{opponentElo} - \text{teamElo}}{400}}}$$
*   **Final Home Advantage**: Direct $+0.03$ addition to the home team's overall combined score prior to percentage scaling.

---

## 6. Full-Stack Production Container Router (`/server.ts`)

In contrast to pure static SPAs or standard Vite setups that produce 404s when attempting serverless execution inside a standard Cloud Run container, our workspace leverages an **Express + Vite unified full-stack architecture**:

*   **Integrated API Layer**: Integrates all `/api/kbo/*` serverless files inside Express router endpoints using a custom Vercel adapter middleware (`adaptHandler`).
*   **Zero-Overhead Bundling**: During the production build pipeline (`npm run build`), the server entry point `/server.ts` is compiled into a single, optimized CJS bundle at `/dist/server.cjs` via `esbuild`.
*   **Dual Mode Asset Serving**:
    *   *Development*: Vite middleware processes asset pipeline and fast HMR routing.
    *   *Production*: Node directly serves optimized assets from `/dist/` and runs SPA fallback routing for any non-API address requests.

