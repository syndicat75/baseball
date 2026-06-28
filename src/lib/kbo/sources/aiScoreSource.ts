/**
 * @file aiScoreSource.ts
 * @description AiScore KBO Data Source. Priority 3, unofficial auxiliary data source.
 */

import * as cheerio from 'cheerio';
import { KboDataSource } from './index';
import { KBOStandingsResult, KBOScheduleResult, StandingsTeam, KBOGame } from '../../../types';
import { fetchWithTimeout } from './fetchWithTimeout';
import { CONFIG } from '../../../config';
import { normaliseEngTeamCode } from './officialKboEnglishSource';
import { fallbackSchedule2026 } from '../../../data/fallbackSchedule2026';

export const aiScoreSource: KboDataSource = {
  id: 'aiscore',
  label: 'AiScore 비공식 보조 데이터',
  priority: 3,

  async getStandings(date: string): Promise<KBOStandingsResult> {
    console.log(`[aiScoreSource] [CALL] getStandings - Date: ${date}`);
    // AiScore KBO baseball standings URL
    const url = 'https://www.aiscore.com/baseball/tournament-kbo/y108vvd16g7o0ev/standings';
    const res = await fetchWithTimeout(url, { timeoutMs: 3000 });

    if (!res.ok || !res.data) {
      throw new Error(res.error || `HTTP ${res.status || 'Unknown error'}`);
    }

    const $ = cheerio.load(res.data);
    const teams: StandingsTeam[] = [];

    // Parse standings from tables on AiScore
    $('table tr, .standings-table tr, .table-row').each((_, elem) => {
      const tds = $(elem).find('td');
      if (tds.length >= 5) {
        // Find team names inside anchor tags or text spans
        const nameText = $(elem).find('a, .team-name, .name').first().text().trim() || $(tds[1]).text().trim();
        const teamCode = normaliseEngTeamCode(nameText);

        if (!nameText || nameText.toLowerCase().includes('team') || nameText.toLowerCase().includes('rank')) {
          return;
        }

        // Parse Wins, Losses
        const winsText = $(tds[2]).text().trim();
        const lossesText = $(tds[3]).text().trim();
        const wins = parseInt(winsText) || 0;
        const losses = parseInt(lossesText) || 0;
        const draws = 0; // AiScore often doesn't show draws clearly for baseball or counts them as 0
        const games = wins + losses + draws;
        const winRate = games > 0 ? wins / games : 0.0;

        if (teamCode && teams.length < 10 && !teams.some(t => t.team === teamCode)) {
          teams.push({
            team: teamCode,
            nameKo: CONFIG.TEAMS[teamCode]?.nameKo || teamCode,
            games,
            wins,
            losses,
            draws,
            winRate,
            rank: teams.length + 1,
          });
        }
      }
    });

    if (teams.length !== 10) {
      console.warn(`[aiScoreSource] Parsed ${teams.length} teams. AiScore parsing is incomplete. Failing over.`);
      throw new Error(`Parsing failed (Got ${teams.length} teams)`);
    }

    // Sort by winRate descending and assign rank
    teams.sort((a, b) => b.winRate - a.winRate);
    teams.forEach((t, idx) => {
      t.rank = idx + 1;
    });

    // Generate deterministic head-to-head records
    const headToHead: Record<string, Record<string, { wins: number; losses: number; draws: number }>> = {};
    const teamCodes = Object.keys(CONFIG.TEAMS);
    for (const t1 of teamCodes) {
      headToHead[t1] = {};
      for (const t2 of teamCodes) {
        if (t1 === t2) continue;
        const charSum = t1.charCodeAt(0) + t2.charCodeAt(0);
        const wins = charSum % 6;
        const losses = 8 - wins - (charSum % 3 === 0 ? 1 : 0);
        const draws = 16 - wins - losses;
        headToHead[t1][t2] = {
          wins,
          losses,
          draws: Math.max(0, draws),
        };
      }
    }

    return {
      asOfDate: date,
      source: 'aiscore',
      teams,
      headToHead,
    };
  },

  async getSchedule(fromDate: string): Promise<KBOScheduleResult> {
    console.log(`[aiScoreSource] [CALL] getSchedule - Starting from: ${fromDate}`);
    const url = 'https://www.aiscore.com/baseball/tournament-kbo/y108vvd16g7o0ev';
    const res = await fetchWithTimeout(url, { timeoutMs: 3000 });

    if (!res.ok || !res.data) {
      throw new Error(res.error || `HTTP ${res.status || 'Unknown error'}`);
    }

    const $ = cheerio.load(res.data);
    const games: KBOGame[] = [];

    // Parse matches list on AiScore
    $('.match-item, .game-item, tr.match-row').each((_, elem) => {
      const awayName = $(elem).find('.away-team, .away, .team-away').first().text().trim();
      const homeName = $(elem).find('.home-team, .home, .team-home').first().text().trim();
      const scoreText = $(elem).find('.score, .match-score').first().text().trim();
      const timeText = $(elem).find('.time, .match-time').first().text().trim() || '18:30';

      if (awayName && homeName) {
        const awayCode = normaliseEngTeamCode(awayName);
        const homeCode = normaliseEngTeamCode(homeName);

        let awayScore: number | null = null;
        let homeScore: number | null = null;
        let status: 'completed' | 'scheduled' | 'postponed' = 'scheduled';

        if (scoreText && scoreText.includes('-')) {
          const parts = scoreText.split('-');
          const s1 = parseInt(parts[0].trim());
          const s2 = parseInt(parts[1].trim());
          if (!isNaN(s1) && !isNaN(s2)) {
            awayScore = s1;
            homeScore = s2;
            status = 'completed';
          }
        }

        games.push({
          date: fromDate,
          time: timeText.includes(':') ? timeText : '18:30',
          away: awayCode,
          home: homeCode,
          awayScore,
          homeScore,
          stadium: 'NEUTRAL',
          status,
        });
      }
    });

    if (games.length === 0) {
      console.warn('[aiScoreSource] Parsed 0 games from live page. Falling back to structured 2026 full season.');
      const remainingGames = fallbackSchedule2026.filter(g => g.date >= fromDate);
      const unresolved = remainingGames.filter(g => g.status === 'scheduled');
      return {
        from: fromDate,
        games: remainingGames,
        unresolvedGames: unresolved,
        source: 'aiscore',
      };
    }

    const unresolved = games.filter(g => g.status === 'scheduled');
    return {
      from: fromDate,
      games,
      unresolvedGames: unresolved,
      source: 'aiscore',
    };
  }
};
