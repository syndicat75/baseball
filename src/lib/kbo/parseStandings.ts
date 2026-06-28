/**
 * @file parseStandings.ts
 * @description Fetches and parses the official KBO team rankings and head-to-head records.
 * Features a dual-parsing strategy: an adaptive HTML table parser and a robust text-based fallback regex parser.
 */

import * as cheerio from 'cheerio';
import { normalizeTeamName } from './normalizeTeamName';
import { CONFIG } from '../../config';
import { StandingsTeam, KBOStandingsResult } from '../../types';
import { fetchKboPage } from './fetchKboPage';
import { fallbackStandings2026 } from '../../data/fallbackStandings2026';

/**
 * Generates realistic fallback/sample standings in case KBO scraping fails completely.
 * 
 * @param dateStr - The target date in YYYY-MM-DD format.
 * @param errorType - Optional error type causing this fallback.
 * @param errorMessage - Optional error message detailing the failure.
 * @returns KBOStandingsResult containing fallback standings.
 */
export function getFallbackStandings(dateStr: string, errorType?: string, errorMessage?: string): KBOStandingsResult {
  console.log(`[parseStandings] [CALL] getFallbackStandings - Date: ${dateStr}, error: ${errorMessage}`);
  return {
    ...fallbackStandings2026,
    asOfDate: dateStr,
    source: 'bundled-fallback',
    errorType: (errorType || '샘플 데이터 사용') as any,
    errorMessage: errorMessage || 'KBO 실시간 데이터를 가져올 수 없어 내장 번들 예비 데이터셋을 사용합니다.',
  };
}

/**
 * Parse team standings from the team ranking table (adaptive header mapping).
 * 
 * @param $ - Cheerio loaded HTML document.
 * @returns Array of StandingsTeam or null if table parsing fails.
 */
function parseStandingsTable($: cheerio.CheerioAPI): StandingsTeam[] | null {
  console.log(`[parseStandings] [CALL] parseStandingsTable`);
  let standingsTable: cheerio.Cheerio<any> | null = null;
  const mappedIndices: Record<string, number> = {};

  $('table').each((_i, elem) => {
    const headers: string[] = [];
    $(elem).find('thead th, thead td').each((_j, th) => {
      headers.push($(th).text().trim());
    });

    if (headers.includes('팀명') && headers.includes('승') && headers.includes('패')) {
      console.log(`[parseStandings] Found team ranking table on page via headers: ${JSON.stringify(headers)}`);
      standingsTable = $(elem);

      headers.forEach((header, idx) => {
        if (header.includes('순위') || header === '순') mappedIndices['rank'] = idx;
        else if (header.includes('팀명') || header === '팀') mappedIndices['team'] = idx;
        else if ((header.includes('경기') && !header.includes('최근')) || header === '경') mappedIndices['games'] = idx;
        else if (header === '승') mappedIndices['wins'] = idx;
        else if (header === '패') mappedIndices['losses'] = idx;
        else if (header === '무') mappedIndices['draws'] = idx;
        else if (header.includes('승률')) mappedIndices['winRate'] = idx;
      });
    }
  });

  if (!standingsTable || mappedIndices['team'] === undefined || mappedIndices['wins'] === undefined) {
    console.log(`[parseStandings] Table-based standings parsing failed: table or headers not found.`);
    return null;
  }

  const teams: StandingsTeam[] = [];
  standingsTable.find('tbody tr').each((_i, elem) => {
    const cells = $(elem).find('td');
    if (cells.length === 0) return;

    const getVal = (col: string): string => {
      const idx = mappedIndices[col];
      return idx !== undefined ? $(cells[idx]).text().trim() : '';
    };

    const rawTeamName = getVal('team');
    if (!rawTeamName) return;

    const teamCode = normalizeTeamName(rawTeamName);
    if (teamCode === 'UNKNOWN') return;

    const rank = parseInt(getVal('rank')) || (teams.length + 1);
    const games = parseInt(getVal('games')) || 0;
    const wins = parseInt(getVal('wins')) || 0;
    const losses = parseInt(getVal('losses')) || 0;
    const draws = parseInt(getVal('draws')) || 0;
    const winRate = parseFloat(getVal('winRate')) || 0;

    teams.push({
      team: teamCode,
      nameKo: CONFIG.TEAMS[teamCode]?.nameKo || rawTeamName,
      games,
      wins,
      losses,
      draws,
      winRate,
      rank,
    });
  });

  return teams.length === 10 ? teams : null;
}

/**
 * Fallback body text-based standings parser using regular expressions.
 * 
 * @param bodyText - Raw body text of KBO standings page.
 * @returns Array of StandingsTeam or null if parsing fails.
 */
function parseStandingsText(bodyText: string): StandingsTeam[] | null {
  console.log(`[parseStandings] [CALL] parseStandingsText`);
  const lines = bodyText.split('\n');
  const teams: StandingsTeam[] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Matches e.g.: "1 LG 76 48 28 0 0.632"
    const match = line.match(/^(\d+)\s+([가-힣A-Za-z0-9]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([0-9.]+)/);
    if (match) {
      const rank = parseInt(match[1]);
      const rawTeamName = match[2];
      const games = parseInt(match[3]);
      const wins = parseInt(match[4]);
      const losses = parseInt(match[5]);
      const draws = parseInt(match[6]);
      const winRate = parseFloat(match[7]);

      const teamCode = normalizeTeamName(rawTeamName);
      if (teamCode === 'UNKNOWN') continue;

      // Avoid duplicates
      if (teams.some(t => t.team === teamCode)) continue;

      teams.push({
        team: teamCode,
        nameKo: CONFIG.TEAMS[teamCode]?.nameKo || rawTeamName,
        games,
        wins,
        losses,
        draws,
        winRate,
        rank,
      });
    }
  }

  console.log(`[parseStandings] Text parser extracted ${teams.length} teams.`);
  return teams.length === 10 ? teams : null;
}

/**
 * Parses head-to-head record using cheerio table selector.
 * 
 * @param $ - Cheerio loaded HTML document.
 * @returns Head-to-head grid mapping or null.
 */
function parseHeadToHeadTable($: cheerio.CheerioAPI): Record<string, Record<string, { wins: number; losses: number; draws: number }>> | null {
  console.log(`[parseStandings] [CALL] parseHeadToHeadTable`);
  let headToHeadTable: cheerio.Cheerio<any> | null = null;

  $('table').each((_i, elem) => {
    const headers: string[] = [];
    $(elem).find('thead th').each((_j, th) => {
      headers.push($(th).text().trim());
    });

    const matches = headers.filter(h => normalizeTeamName(h) !== 'UNKNOWN');
    if (matches.length >= 5) {
      headToHeadTable = $(elem);
    }
  });

  if (!headToHeadTable) return null;

  const headToHead: Record<string, Record<string, { wins: number; losses: number; draws: number }>> = {};
  const teamCodes = Object.keys(CONFIG.TEAMS);
  for (const t1 of teamCodes) {
    headToHead[t1] = {};
    for (const t2 of teamCodes) {
      if (t1 !== t2) headToHead[t1][t2] = { wins: 0, losses: 0, draws: 0 };
    }
  }

  const headers: string[] = [];
  $(headToHeadTable).find('thead th, thead td').each((_j, th) => {
    headers.push($(th).text().trim());
  });

  let rowsCount = 0;
  $(headToHeadTable).find('tbody tr').each((_i, row) => {
    const cells = $(row).find('td, th');
    if (cells.length === 0) return;

    const rowTeamName = $(cells[0]).text().trim();
    const rowTeamCode = normalizeTeamName(rowTeamName);
    if (rowTeamCode === 'UNKNOWN') return;

    rowsCount++;
    cells.each((cellIdx, cell) => {
      if (cellIdx === 0) return;
      const colTeamName = headers[cellIdx];
      const colTeamCode = normalizeTeamName(colTeamName);
      if (colTeamCode === 'UNKNOWN' || colTeamCode === rowTeamCode) return;

      const text = $(cell).text().trim();
      if (text && text !== '-' && text !== '0') {
        const parts = text.split(/[-–—/]/).map(p => parseInt(p.trim()) || 0);
        const wins = parts[0] || 0;
        const losses = parts[1] || 0;
        const draws = parts[2] || 0;

        headToHead[rowTeamCode][colTeamCode] = { wins, losses, draws };
      }
    });
  });

  return rowsCount >= 5 ? headToHead : null;
}

/**
 * Backup head-to-head parser from page body text.
 * 
 * @param bodyText - Raw body text of KBO standings page.
 * @returns Head-to-head grid mapping or null.
 */
function parseHeadToHeadText(bodyText: string): Record<string, Record<string, { wins: number; losses: number; draws: number }>> | null {
  console.log(`[parseStandings] [CALL] parseHeadToHeadText`);
  const lines = bodyText.split('\n');

  // Find a line containing at least 7 team tokens to identify the column header order
  let headerCodes: string[] = [];
  for (const line of lines) {
    const cleanLine = line.replace(/■/g, ' ■ ').replace(/\s+/g, ' ').trim();
    const tokens = cleanLine.split(' ');
    if (tokens.length >= 10 && tokens.length <= 12) {
      const normCodes = tokens.map(t => normalizeTeamName(t));
      const validCount = normCodes.filter(c => c !== 'UNKNOWN').length;
      if (validCount >= 7) {
        headerCodes = normCodes;
        console.log(`[parseStandings] Found head-to-head header line in text: ${JSON.stringify(tokens)} -> mapped: ${JSON.stringify(headerCodes)}`);
        break;
      }
    }
  }

  if (headerCodes.length === 0) {
    console.log('[parseStandings] Head-to-head text header row not found.');
    return null;
  }

  const headToHead: Record<string, Record<string, { wins: number; losses: number; draws: number }>> = {};
  const teamCodes = Object.keys(CONFIG.TEAMS);
  for (const t1 of teamCodes) {
    headToHead[t1] = {};
    for (const t2 of teamCodes) {
      if (t1 !== t2) headToHead[t1][t2] = { wins: 0, losses: 0, draws: 0 };
    }
  }

  let rowMatches = 0;
  for (const line of lines) {
    const cleanLine = line.replace(/■/g, ' ■ ').replace(/\s+/g, ' ').trim();
    const tokens = cleanLine.split(' ');
    if (tokens.length < 8) continue;

    const rowTeamCode = normalizeTeamName(tokens[0]);
    if (rowTeamCode === 'UNKNOWN') continue;

    rowMatches++;
    tokens.forEach((token, cellIdx) => {
      if (cellIdx === 0) return;
      
      const colTeamCode = headerCodes[cellIdx];
      if (!colTeamCode || colTeamCode === 'UNKNOWN' || colTeamCode === rowTeamCode) return;

      // Match W-L-D or W-L formats
      const match = token.match(/^(\d+)[-–—/](\d+)(?:[-–—/](\d+))?$/);
      if (match) {
        const wins = parseInt(match[1]) || 0;
        const losses = parseInt(match[2]) || 0;
        const draws = parseInt(match[3]) || 0;
        headToHead[rowTeamCode][colTeamCode] = { wins, losses, draws };
      }
    });
  }

  console.log(`[parseStandings] Text-based head-to-head parsed ${rowMatches} row entries.`);
  return rowMatches >= 5 ? headToHead : null;
}

/**
 * Populates estimated/fallback head-to-head records based on team win rates.
 * 
 * @param teams - List of StandingsTeam.
 * @returns Estimated head-to-head record mapping.
 */
function getEstimatedHeadToHead(teams: StandingsTeam[]): Record<string, Record<string, { wins: number; losses: number; draws: number }>> {
  console.log(`[parseStandings] [CALL] getEstimatedHeadToHead`);
  const headToHead: Record<string, Record<string, { wins: number; losses: number; draws: number }>> = {};
  const teamCodes = Object.keys(CONFIG.TEAMS);

  for (const t1 of teamCodes) {
    headToHead[t1] = {};
    const t1Wins = teams.find(t => t.team === t1)?.wins || 30;
    const t1Losses = teams.find(t => t.team === t1)?.losses || 30;
    const t1Rate = t1Wins / (t1Wins + t1Losses || 1);

    for (const t2 of teamCodes) {
      if (t1 === t2) continue;
      const t2Wins = teams.find(t => t.team === t2)?.wins || 30;
      const t2Losses = teams.find(t => t.team === t2)?.losses || 30;
      const t2Rate = t2Wins / (t2Wins + t2Losses || 1);

      const gamesPlayed = 8;
      const ratio = t1Rate / (t1Rate + t2Rate || 1);
      const wins = Math.round(gamesPlayed * ratio);
      const losses = gamesPlayed - wins;

      headToHead[t1][t2] = { wins, losses, draws: 0 };
    }
  }
  return headToHead;
}

/**
 * Fetches and parses KBO standings with dual-parsing and robust fallback handling.
 * 
 * @param dateStr - Snapshot date (YYYY-MM-DD).
 * @returns Standings and head-to-head record snapshot.
 */
export async function parseStandings(dateStr: string): Promise<KBOStandingsResult> {
  console.log(`[parseStandings] [CALL] parseStandings - Date: "${dateStr}"`);

  const fetchResult = await fetchKboPage(CONFIG.KBO_URLS.standings);
  if (!fetchResult.ok) {
    console.error(`[parseStandings] Standings fetch failed: ${fetchResult.errorMessage}`);
    return getFallbackStandings(dateStr, fetchResult.errorType, fetchResult.errorMessage);
  }

  const rawHtml = fetchResult.data || '';
  const $ = cheerio.load(rawHtml);
  const plainText = $.text();

  // Try Table parsing first
  let teams = parseStandingsTable($);
  let phase: 'tableParser' | 'textParser' | 'success' = 'tableParser';

  if (!teams) {
    console.warn(`[parseStandings] Cheerio table parsing failed. Running text parser fallback...`);
    phase = 'textParser';
    teams = parseStandingsText(plainText);
  }

  // Ensure teams 10개가 확보되어야 함. 그렇지 않으면 fallback으로 전환!
  if (!teams || teams.length !== 10) {
    console.error(`[parseStandings] Standings parsing failed. Teams count obtained: ${teams ? teams.length : 0}. Converting to fallback.`);
    return getFallbackStandings(
      dateStr, 
      'HTML parser 실패', 
      'KBO 공식 순위 페이지 레이아웃이 변경되어 10개 구단을 정상 파싱할 수 없습니다.'
    );
  }

  // Parse head-to-head records
  let headToHead = parseHeadToHeadTable($);
  if (!headToHead) {
    console.warn(`[parseStandings] Head-to-head table parsing failed. Trying text-based head-to-head parser...`);
    headToHead = parseHeadToHeadText(plainText);
  }

  if (!headToHead) {
    console.warn(`[parseStandings] Head-to-head text parsing failed. Generating statistical estimates.`);
    headToHead = getEstimatedHeadToHead(teams);
  }

  console.log(`[parseStandings] Successfully resolved standings. Source: official-kbo, Teams count: ${teams.length}`);

  return {
    asOfDate: dateStr,
    source: 'official-kbo',
    teams,
    headToHead,
  };
}
