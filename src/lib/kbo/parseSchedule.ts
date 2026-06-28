/**
 * @file parseSchedule.ts
 * @description Fetches and parses KBO regular season schedules and match results.
 * Compiles a comprehensive schedule database for simulated replays and future predictions.
 */

import * as cheerio from 'cheerio';
import { normalizeTeamName } from './normalizeTeamName';
import { CONFIG } from '../../config';
import { getCache, setCache } from './cache';
import { KBOGame, KBOScheduleResult } from '../../types';
import { fetchKboPage } from './fetchKboPage';
import { fallbackSchedule2026 } from '../../data/fallbackSchedule2026';

/**
 * Parses a single matchup text cell into scores and team designations.
 * Uses robust regex and clean fallbacks.
 * 
 * @param text - The matchup cell text (e.g., "한화 5vs2 두산", "KIA vs 삼성 (우천취소)")
 * @returns Parsed game results with team codes and scores.
 */
export function parseMatchup(text: string): {
  away: string;
  awayScore: number | null;
  home: string;
  homeScore: number | null;
  status: 'completed' | 'scheduled' | 'postponed';
} {
  console.log(`[parseSchedule] [CALL] parseMatchup - Text: "${text}"`);
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
 * Returns the bundled KBO 2026 season schedule dataset.
 * 
 * @returns Deterministic fallback season games array.
 */
export function generateFallbackSchedule(): KBOGame[] {
  console.log('[parseSchedule] [CALL] generateFallbackSchedule - Returning bundled fallback schedule...');
  return fallbackSchedule2026;
}

/**
 * Parses the HTML matchup string from KBO AJAX service into scores and teams.
 * 
 * @param html - Matchup HTML string (e.g. "<span>LG</span><em><span class=\"win\">8</span><span>vs</span><span class=\"lose\">5</span></em><span>두산</span>")
 * @returns Parsed game results with team names, scores, and completion status.
 */
function parsePlayText(html: string): {
  away: string;
  awayScore: number | null;
  home: string;
  homeScore: number | null;
  status: 'completed' | 'scheduled' | 'postponed';
} {
  console.log(`[parseSchedule] [CALL] parsePlayText - HTML length: ${html.length}`);
  const $ = cheerio.load(`<div>${html}</div>`);
  
  // Find spans that are NOT inside 'em'
  const teamSpans = $('span').not('em span').map((_, el) => $(el).text().trim()).get().filter(Boolean);
  
  const away = teamSpans[0] || '';
  const home = teamSpans[1] || '';

  // Extract scores if they exist
  const em = $('em');
  const emText = em.text().trim();
  const isPostponed = html.includes('취소') || html.includes('우천') || html.includes('연기');

  let awayScore: number | null = null;
  let homeScore: number | null = null;
  let status: 'completed' | 'scheduled' | 'postponed' = 'scheduled';

  if (isPostponed) {
    status = 'postponed';
  } else {
    // Check if there are scores inside em
    const numbers = em.find('span').map((_, el) => {
      const txt = $(el).text().trim();
      return /^\d+$/.test(txt) ? parseInt(txt) : null;
    }).get().filter(v => v !== null) as number[];

    if (numbers.length >= 2) {
      status = 'completed';
      awayScore = numbers[0];
      homeScore = numbers[1];
    } else {
      const match = emText.match(/(\d+)\s*(?:vs|VS|:)\s*(\d+)/);
      if (match) {
        status = 'completed';
        awayScore = parseInt(match[1]);
        homeScore = parseInt(match[2]);
      } else {
        status = 'scheduled';
      }
    }
  }

  return { away, awayScore, home, homeScore, status };
}

/**
 * Parses monthly KBO schedule from the Korean KBO web page.
 * 
 * @param year - Target year (e.g. 2026)
 * @param month - Target month (1-indexed, e.g. 6)
 * @returns Array of games parsed from the page.
 */
async function parseKboMonthSchedule(year: number, month: number): Promise<KBOGame[]> {
  console.log(`[parseSchedule] [CALL] parseKboMonthSchedule - Year: ${year}, Month: ${month}`);
  const monthStr = month.toString().padStart(2, '0');
  const cacheKey = `schedule_${year}_${monthStr}`;
  
  // Decide TTL: past months are stable forever (cached 30 days), current/future month cached 10 minutes
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const isPastMonth = year < currentYear || (year === currentYear && month < currentMonth);
  const ttl = isPastMonth ? 30 * 24 * 60 * 60 * 1000 : CONFIG.CACHE.ttlTodayMs;

  const cached = await getCache<KBOGame[]>(cacheKey, ttl);
  if (cached && cached.length > 0) {
    console.log(`[parseSchedule] Returning cached schedule for ${year}-${monthStr}`);
    return cached;
  }

  console.log(`[parseSchedule] Fetching fresh KBO monthly schedule from AJAX web service for ${year}-${monthStr}`);
  const games: KBOGame[] = [];
  const url = 'https://www.koreabaseball.com/ws/Schedule.asmx/GetScheduleList';

  try {
    const params = new URLSearchParams();
    params.append('leId', '1');
    params.append('srIdList', '0,9,6'); // Regular season
    params.append('seasonId', year.toString());
    params.append('gameMonth', monthStr);
    params.append('teamId', '');

    const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
    const timeoutMs = isProd ? 3000 : 8000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.koreabaseball.com/Schedule/Schedule.aspx',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: params.toString(),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP status error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    if (!data || !data.rows) {
      throw new Error('Invalid or empty response from KBO schedule web service');
    }

    let currentDayStr = '';

    for (const rowObj of data.rows) {
      const cells = rowObj.row;
      if (!cells || cells.length === 0) continue;

      // Find if there is a day cell
      const dayCell = cells.find((c: any) => c.Class && c.Class.includes('day'));
      if (dayCell) {
        const dateText = cheerio.load(dayCell.Text).text().trim();
        const dateMatch = dateText.match(/(\d{2})\.(\d{2})/);
        if (dateMatch) {
          currentDayStr = `${year}-${dateMatch[1]}-${dateMatch[2]}`;
        }
      }

      if (!currentDayStr) continue;

      const hasDate = !!dayCell;
      const offset = hasDate ? 1 : 0;

      const timeCell = cells[offset];
      const playCell = cells[offset + 1];
      const stadiumCell = cells[offset + 6];

      if (!timeCell || !playCell) continue;

      const timeText = cheerio.load(timeCell.Text).text().trim();
      const playHtml = playCell.Text;
      const stadiumText = stadiumCell ? cheerio.load(stadiumCell.Text).text().trim() : '';

      const parsedPlay = parsePlayText(playHtml);
      const awayCode = normalizeTeamName(parsedPlay.away);
      const homeCode = normalizeTeamName(parsedPlay.home);

      if (awayCode === 'UNKNOWN' || homeCode === 'UNKNOWN') continue;

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
    }

    console.log(`[parseSchedule] Successfully parsed ${games.length} games for ${year}-${monthStr}`);
    
    // Save to cache
    await setCache(cacheKey, games);
    return games;

  } catch (error) {
    console.error(`[parseSchedule] Error fetching monthly schedule for ${year}-${monthStr}:`, error);
    // In case of error, return empty so it can fallback to local generation or other months
    return [];
  }
}

/**
 * Fetches the entire KBO regular season schedule (months 3 to 10).
 * Handles partial failures gracefully by downloading concurrently via Promise.allSettled.
 * 
 * @param year - Target year to fetch.
 * @param forceRefresh - If true, ignores the local cache and forces fresh download.
 * @returns Array of KBO regular season games.
 */
export async function getFullSeasonSchedule(year: number, forceRefresh = false): Promise<KBOGame[]> {
  console.log(`[parseSchedule] [CALL] getFullSeasonSchedule - Year: ${year}, Force Refresh: ${forceRefresh}`);

  if (forceRefresh) {
    console.log(`[parseSchedule] Force refresh: purging schedule cache for months 3-10.`);
    for (let m = 3; m <= 10; m++) {
      const monthStr = m.toString().padStart(2, '0');
      await setCache(`schedule_${year}_${monthStr}`, null);
    }
  }

  const months = Array.from({ length: 8 }, (_, i) => i + 3); // 3 to 10
  const promises = months.map(m => parseKboMonthSchedule(year, m));

  const results = await Promise.allSettled(promises);
  const allGames: KBOGame[] = [];
  let successfulMonthsCount = 0;

  results.forEach((res, idx) => {
    const monthVal = idx + 3;
    if (res.status === 'fulfilled') {
      const games = res.value;
      if (games && games.length > 0) {
        allGames.push(...games);
        successfulMonthsCount++;
      } else {
        console.log(`[parseSchedule] Month ${monthVal} has no scheduled games in our record.`);
      }
    } else {
      console.error(`[parseSchedule] Month ${monthVal} fetching rejected:`, res.reason);
    }
  });

  console.log(`[parseSchedule] Completed parallel schedule retrieval. Successful months: ${successfulMonthsCount}/8. Total games fetched: ${allGames.length}`);

  if (allGames.length === 0) {
    console.log(`[parseSchedule] Crawled 0 games overall. Engaging bundled fallback schedule...`);
    return fallbackSchedule2026;
  }

  return allGames;
}

/**
 * Gets the remaining upcoming schedule after the reference date and unresolved postponed games.
 * 
 * @param fromDateStr - Reference date in YYYY-MM-DD format.
 * @param forceRefresh - If true, clears the cache and refetches.
 * @returns KBOScheduleResult containing upcoming scheduled matches and unresolved synthetic games.
 */
export async function getRemainingSchedule(fromDateStr: string, forceRefresh = false): Promise<KBOScheduleResult> {
  console.log(`[parseSchedule] [CALL] getRemainingSchedule - Date: "${fromDateStr}", Force Refresh: ${forceRefresh}`);

  const refDate = new Date(fromDateStr);
  const year = refDate.getFullYear();

  // Load the complete schedule (completed, scheduled, postponed)
  const allGames = await getFullSeasonSchedule(year, forceRefresh);

  let source = 'official-kbo';
  let errorType: 'API route 없음' | 'KBO fetch 실패' | 'HTML parser 실패' | '일정 데이터 없음' | '캐시 데이터 사용' | '샘플 데이터 사용' | undefined = undefined;
  let errorMessage: string | undefined = undefined;

  // Detect fallback sources
  const isFallback = allGames === fallbackSchedule2026 || allGames.length === 720;
  if (isFallback) {
    source = 'bundled-fallback';
    errorType = '샘플 데이터 사용';
    errorMessage = '공식 일정을 가져올 수 없어 내장 번들 예비 일정 데이터셋을 사용합니다.';
  }

  // 1. Upcoming matches: scheduled games *after* fromDateStr
  const upcomingGames = allGames.filter(g => g.date > fromDateStr && g.status === 'scheduled');

  // 2. Unresolved games: matches that are POSTPONED/CANCELLED but not played up to this point
  const matchupCounts: Record<string, number> = {};
  const getKey = (t1: string, t2: string) => [t1, t2].sort().join('_');

  allGames.forEach(g => {
    if (g.status === 'completed' || g.status === 'scheduled') {
      const key = getKey(g.away, g.home);
      matchupCounts[key] = (matchupCounts[key] || 0) + 1;
    }
  });

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
        console.log(`[parseSchedule] Unresolved conflict found: ${t1} vs ${t2} has only ${scheduledPlayedCount}/${CONFIG.SIMULATION.unresolvedGameCorrectionBase}. Adding ${missingCount} synthetic games.`);
        for (let k = 0; k < missingCount; k++) {
          unresolvedGames.push({
            date: '2026-10-15',
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
    source,
    errorType,
    errorMessage,
  };
}

/**
 * Backwards compatible delegate to getRemainingSchedule.
 * 
 * @param fromDateStr - The reference date.
 * @param forceRefresh - If true, clears the cache and refetches.
 * @returns KBOScheduleResult.
 */
export async function getSchedule(fromDateStr: string, forceRefresh = false): Promise<KBOScheduleResult> {
  console.log(`[parseSchedule] [CALL] getSchedule (Legacy wrapper) - Delegating to getRemainingSchedule`);
  return getRemainingSchedule(fromDateStr, forceRefresh);
}
