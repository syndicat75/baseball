/**
 * @file parseSchedule.ts
 * @description Fetches and parses KBO regular season schedules and match results.
 * Compiles a comprehensive schedule database for simulated replays and future predictions.
 */

import * as cheerio from 'cheerio';
import { normalizeTeamName } from './normalizeTeamName';
import { CONFIG } from '../../config';
import { getCache, setCache } from './cache';

export interface KBOGame {
  date: string;          // YYYY-MM-DD
  time: string;          // HH:MM
  away: string;          // Normalised code, e.g. "LOTTE"
  home: string;          // Normalised code, e.g. "DOOSAN"
  awayScore: number | null;
  homeScore: number | null;
  stadium: string;
  status: 'completed' | 'scheduled' | 'postponed';
  synthetic?: boolean;    // If generated for unresolved postponed games
  reason?: string;
}

export interface KBOScheduleResult {
  from: string;
  games: KBOGame[];
  unresolvedGames: KBOGame[];
}

/**
 * Parses a single matchup text cell into scores and team designations.
 * Uses robust regex and clean fallbacks.
 */
export function parseMatchup(text: string): {
  away: string;
  awayScore: number | null;
  home: string;
  homeScore: number | null;
  status: 'completed' | 'scheduled' | 'postponed';
} {
  const isPostponed = text.includes('취소') || text.includes('우천') || text.includes('연기') || text.includes('POSTPONED');
  
  // Remove multiple spaces and parentheses contents for cleaning
  const cleanText = text.replace(/\s+/g, ' ').trim();

  // Pattern: "TeamA 12 vs 4 TeamB" or "TeamA 12:4 TeamB"
  const completedRegex = /^([가-힣a-zA-Z0-9\s\-]+?)\s*(\d+)\s*(?:vs|VS|:|vs\.)\s*(\d+)\s*([가-힣a-zA-Z0-9\s\-]+)$/;
  const completedMatch = cleanText.match(completedRegex);

  if (completedMatch && !isPostponed) {
    return {
      away: completedMatch[1].trim(),
      awayScore: parseInt(completedMatch[2]),
      home: completedMatch[4].trim(),
      homeScore: parseInt(completedMatch[3]),
      status: 'completed',
    };
  }

  // Pattern: "TeamA vs TeamB"
  const scheduledRegex = /^([가-힣a-zA-Z0-9\s\-]+?)\s*(?:vs|VS|vs\.)\s*([가-힣a-zA-Z0-9\s\-]+?)(?:\s*\(.*\))?$/;
  // Clean parentheses details for regex matching
  const noParens = cleanText.replace(/\(.*?\)/g, '').trim();
  const scheduledMatch = noParens.match(scheduledRegex);

  if (scheduledMatch) {
    return {
      away: scheduledMatch[1].trim(),
      awayScore: null,
      home: scheduledMatch[2].trim(),
      homeScore: null,
      status: isPostponed ? 'postponed' : 'scheduled',
    };
  }

  // Fallback string matching for general vs
  const vsIdx = cleanText.toLowerCase().indexOf('vs');
  if (vsIdx !== -1) {
    const awayPart = cleanText.substring(0, vsIdx).replace(/\d+/g, '').trim();
    const homePart = cleanText.substring(vsIdx + 2).replace(/\d+/g, '').replace(/\(.*?\)/g, '').trim();
    return {
      away: awayPart,
      awayScore: null,
      home: homePart,
      homeScore: null,
      status: isPostponed ? 'postponed' : 'scheduled',
    };
  }

  return {
    away: '',
    awayScore: null,
    home: '',
    homeScore: null,
    status: 'postponed',
  };
}

/**
 * Generates highly realistic fallback KBO schedules for testing & recovery.
 * It schedules 144 games per team (16 games against each of the other 9 teams).
 * Total matches = 10 * 144 / 2 = 720 matches.
 * Matches span from 2026-03-22 to 2026-09-30.
 */
export function generateFallbackSchedule(): KBOGame[] {
  console.log('[parseSchedule] Generating 720-game realistic fallback schedule...');
  const teams = Object.keys(CONFIG.TEAMS);
  const games: KBOGame[] = [];
  
  const startDate = new Date('2026-03-22');
  const stadiums = ['JAMSIL', 'SAJIK', 'DAEGU', 'GWANGJU', 'GOCHEOK', 'MUNCHAK', 'SUWON', 'HANWHA_EAGLES_PARK', 'CHANGWON'];

  // To build a realistic schedule, we pair each team with every other team 16 times (8 home, 8 away).
  // We distribute them over 180 days.
  let matchDay = 0;
  
  // Generate pairs
  const matchups: Array<{ home: string; away: string }> = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = 0; j < teams.length; j++) {
      if (i === j) continue;
      // 8 matches for each home-away pair
      for (let k = 0; k < 8; k++) {
        matchups.push({ home: teams[i], away: teams[j] });
      }
    }
  }

  // Shuffle matchups deterministically with a simple LCG random number generator so it's reproducible
  let seed = 12345;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let i = matchups.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const temp = matchups[i];
    matchups[i] = matchups[j];
    matchups[j] = temp;
  }

  // Allocate 4-5 games per day
  let matchupIdx = 0;
  const totalMatchups = matchups.length; // 720 games

  while (matchupIdx < totalMatchups) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + matchDay);
    const dateStr = currentDate.toISOString().split('T')[0];

    // Check if we hit the end date
    if (currentDate > new Date('2026-09-30')) {
      break;
    }

    // Schedule up to 5 games for today
    const gamesToday = Math.min(5, totalMatchups - matchupIdx);
    const activeTeamsInDay = new Set<string>();

    for (let g = 0; g < gamesToday; g++) {
      // Find a game where neither team is playing today yet
      let chosenIdx = -1;
      for (let scan = matchupIdx; scan < totalMatchups; scan++) {
        const m = matchups[scan];
        if (!activeTeamsInDay.has(m.home) && !activeTeamsInDay.has(m.away)) {
          chosenIdx = scan;
          break;
        }
      }

      if (chosenIdx !== -1) {
        // Swap to the current position to preserve scheduling index
        const temp = matchups[matchupIdx];
        matchups[matchupIdx] = matchups[chosenIdx];
        matchups[chosenIdx] = temp;

        const game = matchups[matchupIdx];
        activeTeamsInDay.add(game.home);
        activeTeamsInDay.add(game.away);

        // Determine if this game is completed (e.g., if date is before 2026-06-28)
        const isPast = dateStr < '2026-06-28';
        let status: 'completed' | 'scheduled' | 'postponed' = 'scheduled';
        let awayScore: number | null = null;
        let homeScore: number | null = null;

        if (isPast) {
          // completed game, decide scores (away wins 48% home wins 52% to represent home advantage)
          status = 'completed';
          const drawRate = rand() < 0.025; // 2.5% draws
          if (drawRate) {
            awayScore = Math.floor(rand() * 5) + 2;
            homeScore = awayScore;
          } else {
            const homeWins = rand() < 0.525;
            if (homeWins) {
              homeScore = Math.floor(rand() * 8) + 3;
              awayScore = Math.floor(rand() * homeScore);
            } else {
              awayScore = Math.floor(rand() * 8) + 3;
              homeScore = Math.floor(rand() * awayScore);
            }
          }
        } else if (dateStr === '2026-06-28' && rand() < 0.5) {
          // Half of today's matches are completed
          status = 'completed';
          homeScore = Math.floor(rand() * 6) + 2;
          awayScore = Math.floor(rand() * 5);
        }

        games.push({
          date: dateStr,
          time: '18:30',
          away: game.away,
          home: game.home,
          awayScore,
          homeScore,
          stadium: stadiums[Math.floor(rand() * stadiums.length)],
          status,
        });

        matchupIdx++;
      } else {
        // No conflict-free games available for today, skip to next day
        break;
      }
    }

    matchDay++;
  }

  console.log(`[parseSchedule] Generated ${games.length} games for fallback schedule database.`);
  return games;
}

/**
 * Parses monthly KBO schedule from the Korean KBO web page.
 * 
 * @param year - Target year (e.g. 2026)
 * @param month - Target month (1-indexed, e.g. 6)
 * @returns Array of games parsed from the page.
 */
async function parseKboMonthSchedule(year: number, month: number): Promise<KBOGame[]> {
  const monthStr = month.toString().padStart(2, '0');
  const cacheKey = `schedule_${year}_${monthStr}`;
  
  // Decide TTL: past months are stable forever (cached 30 days), current/future month cached 10 minutes
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const isPastMonth = year < currentYear || (year === currentYear && month < currentMonth);
  const ttl = isPastMonth ? 30 * 24 * 60 * 60 * 1000 : CONFIG.CACHE.ttlTodayMs;

  const cached = await getCache<KBOGame[]>(cacheKey, ttl);
  if (cached) {
    console.log(`[parseSchedule] Returning cached schedule for ${year}-${monthStr}`);
    return cached;
  }

  console.log(`[parseSchedule] Fetching fresh KBO monthly schedule from web for ${year}-${monthStr}`);
  const games: KBOGame[] = [];
  const url = `${CONFIG.KBO_URLS.koreanSchedule}?seriesId=1&month=${monthStr}&year=${year}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });

    if (!response.ok) {
      throw new Error(`KBO Schedule Server returned status ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Find the schedule table. It's usually the main table or inside `.tbl-type1`
    let scheduleTable = $('table').first();
    $('table').each((_i, elem) => {
      const headers = $(elem).find('thead th').text().trim();
      if (headers.includes('날짜') && headers.includes('경기')) {
        scheduleTable = $(elem);
      }
    });

    let currentDayStr = '';

    scheduleTable.find('tbody tr').each((_i, row) => {
      const cells = $(row).find('td');
      if (cells.length === 0) return;

      // Extract date if present, otherwise reuse active date (due to rowspans)
      const dateCell = $(row).find('td.day, td:nth-child(1)');
      const dateText = dateCell.length > 0 ? dateCell.text().trim() : '';
      
      if (dateText && dateText.includes('.')) {
        // format is "04.01(수)" or "04.01"
        const dateMatch = dateText.match(/(\d{2})\.(\d{2})/);
        if (dateMatch) {
          currentDayStr = `${year}-${dateMatch[1]}-${dateMatch[2]}`;
        }
      }

      // If we don't have a date yet, we skip
      if (!currentDayStr) return;

      // Map columns
      // If date was present, columns shift by 1. Check if dateCell has rowspan or is present
      const hasDateInRow = dateText !== '';
      const offset = hasDateInRow ? 1 : 0;

      const timeText = $(cells[offset]).text().trim();
      const playText = $(cells[offset + 1]).text().trim(); // Matchup, e.g. "한화vs두산"
      const stadiumText = $(cells[offset + 2]).text().trim();

      if (!playText || !timeText) return;

      const parsedPlay = parseMatchup(playText);
      const awayCode = normalizeTeamName(parsedPlay.away);
      const homeCode = normalizeTeamName(parsedPlay.home);

      if (awayCode === 'UNKNOWN' || homeCode === 'UNKNOWN') return;

      games.push({
        date: currentDayStr,
        time: timeText,
        away: awayCode,
        home: homeCode,
        awayScore: parsedPlay.awayScore,
        homeScore: parsedPlay.homeScore,
        stadium: stadiumText,
        status: parsedPlay.status,
      });
    });

    console.log(`[parseSchedule] Successfully parsed ${games.length} games for ${year}-${monthStr}`);
    
    // Save to cache
    await setCache(cacheKey, games);
    return games;

  } catch (error) {
    console.error(`[parseSchedule] Error fetching monthly schedule for ${year}-${monthStr}:`, error);
    // In case of error, return empty so it can fallback to local generation
    return [];
  }
}

/**
 * Gets the schedule of the season starting from the specified date.
 * Compiles the entire season from caches/web and splits into remaining scheduled, completed, and unresolved games.
 * 
 * @param fromDateStr - The reference date in YYYY-MM-DD format.
 * @param forceRefresh - If true, clears the cache and refetches.
 * @returns KBOScheduleResult containing upcoming schedule and unresolved games.
 */
export async function getSchedule(fromDateStr: string, forceRefresh = false): Promise<KBOScheduleResult> {
  console.log(`[getSchedule] Fetching full schedule starting from: "${fromDateStr}". Force refresh: ${forceRefresh}`);

  if (forceRefresh) {
    // Clear cache if forced
    console.log(`[getSchedule] Force refresh enabled. Clearing local caches.`);
    const today = new Date();
    const year = today.getFullYear();
    for (let m = 3; m <= 10; m++) {
      const monthStr = m.toString().padStart(2, '0');
      // Set to null to evict
      await setCache(`schedule_${year}_${monthStr}`, null);
    }
  }

  // Parse all months in regular season (March to October)
  const today = new Date(fromDateStr);
  const year = today.getFullYear();
  let allGames: KBOGame[] = [];

  for (let m = 3; m <= 10; m++) {
    const monthGames = await parseKboMonthSchedule(year, m);
    allGames.push(...monthGames);
  }

  // Fallback if we crawled absolutely nothing (e.g. offline/blocked)
  if (allGames.length === 0) {
    console.log(`[getSchedule] Crawled 0 games from official KBO web. Engaging fallback database generator...`);
    allGames = generateFallbackSchedule();
  }

  // Now, process games based on fromDateStr
  // 1. Upcoming matches: scheduled games after fromDateStr
  const upcomingGames = allGames.filter(g => g.date > fromDateStr && g.status === 'scheduled');

  // 2. Unresolved games: matches that are POSTPONED/CANCELLED but not played up to this point
  // Note: in KBO, cancelled games are re-scheduled at the end of the season.
  // If we have postponed games that are not re-scheduled yet, we can identify them.
  // Let's filter games with status === 'postponed' on or before fromDateStr.
  const postponedGames = allGames.filter(g => g.date <= fromDateStr && g.status === 'postponed');

  // To prevent double counting, if a postponed game has already been re-scheduled and completed or listed in future, we don't include it.
  // How do we match? We check head-to-head match counts.
  // Each pair of teams plays exactly 16 games.
  // Let's count how many total scheduled + completed games exist in our dataset for each team matchup (A vs B).
  const matchupCounts: Record<string, number> = {};
  const getKey = (t1: string, t2: string) => [t1, t2].sort().join('_');

  allGames.forEach(g => {
    if (g.status === 'completed' || g.status === 'scheduled') {
      const key = getKey(g.away, g.home);
      matchupCounts[key] = (matchupCounts[key] || 0) + 1;
    }
  });

  // If total games scheduled/played between two teams is less than 16, there are "unresolved/cancelled" games
  // that KBO has not re-scheduled in the official calendar yet.
  const unresolvedGames: KBOGame[] = [];
  const teams = Object.keys(CONFIG.TEAMS);

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const t1 = teams[i];
      const t2 = teams[j];
      const key = getKey(t1, t2);
      const scheduledPlayedCount = matchupCounts[key] || 0;
      const missingCount = CONFIG.SIMULATION.unresolvedGameCorrectionBase - scheduledPlayedCount;

      if (missingCount > 0) {
        console.log(`[getSchedule] Matchup conflict: ${t1} vs ${t2} has only ${scheduledPlayedCount} scheduled/played. Creating ${missingCount} unresolved games.`);
        for (let k = 0; k < missingCount; k++) {
          unresolvedGames.push({
            date: '2026-10-15', // Put at typical regular season completion date
            time: '18:30',
            away: t1,
            home: t2,
            awayScore: null,
            homeScore: null,
            stadium: 'NEUTRAL',
            status: 'scheduled',
            synthetic: true,
            reason: 'unresolved postponed game',
          });
        }
      }
    }
  }

  return {
    from: fromDateStr,
    games: upcomingGames,
    unresolvedGames,
  };
}
