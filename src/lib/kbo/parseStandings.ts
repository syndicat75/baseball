/**
 * @file parseStandings.ts
 * @description Fetches and parses the official KBO team rankings table. Dynamically maps columns using header labels for maximum resilience.
 */

import * as cheerio from 'cheerio';
import { normalizeTeamName } from './normalizeTeamName';
import { CONFIG } from '../../config';
import { StandingsTeam, KBOStandingsResult } from '../../types';

/**
 * Returns realistic fallback/sample standings for testing or emergency recovery if KBO is down.
 */
export function getFallbackStandings(dateStr: string): KBOStandingsResult {
  console.log(`[parseStandings] Generating fallback standings for date: ${dateStr}`);
  const teams: StandingsTeam[] = [
    { team: 'KIA', nameKo: 'KIA', games: 80, wins: 48, losses: 30, draws: 2, winRate: 0.615, rank: 1 },
    { team: 'SAMSUNG', nameKo: '삼성', games: 80, wins: 46, losses: 32, draws: 2, winRate: 0.590, rank: 2 },
    { team: 'LG', nameKo: 'LG', games: 81, wins: 45, losses: 34, draws: 2, winRate: 0.570, rank: 3 },
    { team: 'DOOSAN', nameKo: '두산', games: 82, wins: 44, losses: 36, draws: 2, winRate: 0.550, rank: 4 },
    { team: 'SSG', nameKo: 'SSG', games: 80, wins: 41, losses: 38, draws: 1, winRate: 0.519, rank: 5 },
    { team: 'KT', nameKo: 'KT', games: 81, wins: 38, losses: 41, draws: 2, winRate: 0.481, rank: 6 },
    { team: 'HANWHA', nameKo: '한화', games: 79, wins: 36, losses: 41, draws: 2, winRate: 0.468, rank: 7 },
    { team: 'LOTTE', nameKo: '롯데', games: 78, wins: 34, losses: 41, draws: 3, winRate: 0.453, rank: 8 },
    { team: 'NC', nameKo: 'NC', games: 80, wins: 35, losses: 43, draws: 2, winRate: 0.449, rank: 9 },
    { team: 'KIWOOM', nameKo: '키움', games: 79, wins: 31, losses: 48, draws: 0, winRate: 0.392, rank: 10 },
  ];

  // Initialize realistic head-to-head records
  const headToHead: Record<string, Record<string, { wins: number; losses: number; draws: number }>> = {};
  const teamCodes = Object.keys(CONFIG.TEAMS);
  
  for (const t1 of teamCodes) {
    headToHead[t1] = {};
    for (const t2 of teamCodes) {
      if (t1 === t2) continue;
      // Generate some dummy head to head matches (around 7-9 games played per pair so far)
      const gamesPlayed = 8;
      const t1Wins = Math.floor(Math.random() * (gamesPlayed + 1));
      const t1Losses = gamesPlayed - t1Wins;
      headToHead[t1][t2] = {
        wins: t1Wins,
        losses: t1Losses,
        draws: 0
      };
    }
  }

  return {
    asOfDate: dateStr,
    source: 'fallback-sample',
    teams,
    headToHead,
  };
}

/**
 * Fetches and parses KBO standings from the official page.
 * Uses adaptive header mapping for robustness.
 * 
 * @param dateStr - Target date in YYYY-MM-DD format
 * @returns KBOStandingsResult containing standings and head-to-head records.
 */
export async function parseStandings(dateStr: string): Promise<KBOStandingsResult> {
  console.log(`[parseStandings] Fetching standings for: ${dateStr}`);

  try {
    const response = await fetch(CONFIG.KBO_URLS.standings, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      }
    });

    if (!response.ok) {
      throw new Error(`KBO server returned status ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Let's find the main team standings table. It's usually inside `.tbl-type1` or `.tbl`
    let standingsTable: cheerio.Cheerio<any> | null = null;
    let mappedIndices: Record<string, number> = {};

    $('table').each((_i, elem) => {
      const headers: string[] = [];
      $(elem).find('thead th, thead td').each((_j, th) => {
        headers.push($(th).text().trim());
      });

      // Look for a table that has rank (순위), team name (팀명), games (경기)
      if (headers.includes('팀명') && headers.includes('승') && headers.includes('패')) {
        console.log(`[parseStandings] Found KBO standings table! Headers: ${JSON.stringify(headers)}`);
        standingsTable = $(elem);

        // Map header text to column index dynamically
        headers.forEach((header, idx) => {
          if (header.includes('순위') || header === '순') mappedIndices['rank'] = idx;
          else if (header.includes('팀명') || header === '팀') mappedIndices['team'] = idx;
          else if (header.includes('경기') || header === '경') mappedIndices['games'] = idx;
          else if (header === '승') mappedIndices['wins'] = idx;
          else if (header === '패') mappedIndices['losses'] = idx;
          else if (header === '무') mappedIndices['draws'] = idx;
          else if (header.includes('승률')) mappedIndices['winRate'] = idx;
        });
      }
    });

    if (!standingsTable || mappedIndices['team'] === undefined || mappedIndices['wins'] === undefined) {
      console.error(`[parseStandings] Standings table headers not found or incomplete.`);
      throw new Error('Could not identify standings table structure on KBO page');
    }

    const teams: StandingsTeam[] = [];

    // Parse standings rows
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

    console.log(`[parseStandings] Successfully parsed standings for ${teams.length} teams.`);

    // Next, look for the head-to-head grid ("팀간승패표") on the page.
    // It's often another table on the page. It has "팀명" in header, and columns are team names.
    const headToHead: Record<string, Record<string, { wins: number; losses: number; draws: number }>> = {};
    const teamCodes = Object.keys(CONFIG.TEAMS);
    
    // Initialize headToHead with empty records
    for (const t1 of teamCodes) {
      headToHead[t1] = {};
      for (const t2 of teamCodes) {
        if (t1 !== t2) {
          headToHead[t1][t2] = { wins: 0, losses: 0, draws: 0 };
        }
      }
    }

    let headToHeadTable: cheerio.Cheerio<any> | null = null;
    $('table').each((_i, elem) => {
      const headers: string[] = [];
      $(elem).find('thead th').each((_j, th) => {
        headers.push($(th).text().trim());
      });

      // A head-to-head table will have teams in headers (e.g. at least 5 of our normalized team names or display names)
      const matches = headers.filter(h => {
        const norm = normalizeTeamName(h);
        return norm !== 'UNKNOWN';
      });

      if (matches.length >= 5) {
        console.log(`[parseStandings] Found team vs team head-to-head table!`);
        headToHeadTable = $(elem);
      }
    });

    if (headToHeadTable) {
      // Parse the head-to-head grid
      // Rows typically have a team name in the first cell, and subsequent cells are wins-losses-draws (e.g. "7-5-1" or "7승5패" or "7-5")
      const headers: string[] = [];
      $(headToHeadTable).find('thead th, thead td').each((_j, th) => {
        headers.push($(th).text().trim());
      });

      $(headToHeadTable).find('tbody tr').each((_i, row) => {
        const cells = $(row).find('td, th');
        if (cells.length === 0) return;

        const rowTeamName = $(cells[0]).text().trim();
        const rowTeamCode = normalizeTeamName(rowTeamName);
        if (rowTeamCode === 'UNKNOWN') return;

        cells.each((cellIdx, cell) => {
          if (cellIdx === 0) return; // skip row header
          const colTeamName = headers[cellIdx];
          const colTeamCode = normalizeTeamName(colTeamName);
          if (colTeamCode === 'UNKNOWN' || colTeamCode === rowTeamCode) return;

          const text = $(cell).text().trim(); // typically "W-L-D" or "W-L" (e.g. "8-4" or "8-4-0")
          if (text && text !== '-' && text !== '0') {
            const parts = text.split(/[-–—/]/).map(p => parseInt(p.trim()) || 0);
            const wins = parts[0] || 0;
            const losses = parts[1] || 0;
            const draws = parts[2] || 0;

            headToHead[rowTeamCode][colTeamCode] = { wins, losses, draws };
          }
        });
      });
      console.log(`[parseStandings] Successfully parsed head-to-head table from page.`);
    } else {
      console.log(`[parseStandings] Head-to-head table not found on page. Falling back to default estimates.`);
      // Set default estimate from wins ratio
      for (const t1 of teamCodes) {
        const t1Wins = teams.find(t => t.team === t1)?.wins || 30;
        const t1Losses = teams.find(t => t.team === t1)?.losses || 30;
        const t1Rate = t1Wins / (t1Wins + t1Losses || 1);

        for (const t2 of teamCodes) {
          if (t1 === t2) continue;
          const t2Wins = teams.find(t => t.team === t2)?.wins || 30;
          const t2Losses = teams.find(t => t.team === t2)?.losses || 30;
          const t2Rate = t2Wins / (t2Wins + t2Losses || 1);

          // We estimate they played around 8 games
          const gamesPlayed = 8;
          const ratio = t1Rate / (t1Rate + t2Rate || 1);
          const wins = Math.round(gamesPlayed * ratio);
          const losses = gamesPlayed - wins;

          headToHead[t1][t2] = { wins, losses, draws: 0 };
        }
      }
    }

    return {
      asOfDate: dateStr,
      source: 'official-kbo',
      teams,
      headToHead,
    };

  } catch (error: any) {
    console.error(`[parseStandings] Parsing standings failed:`, error);
    const fallback = getFallbackStandings(dateStr);
    const msg = error?.message || String(error);
    const errorType = (msg.includes('status') || msg.includes('fetch') || msg.includes('network') || msg.includes('connect'))
      ? 'KBO fetch 실패'
      : 'HTML parser 실패';
    return {
      ...fallback,
      source: 'fallback-sample',
      errorType,
      errorMessage: msg,
    };
  }
}
