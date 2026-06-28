/**
 * @file aiScoreSource.ts
 * @description AiScore KBO Data Source. Priority 3, unofficial auxiliary data source.
 */

import * as cheerio from 'cheerio';
import { KboDataSource, KBOStanding } from './index';
import { KBOGame } from '../../../types';
import { fetchWithTimeout } from './fetchWithTimeout';
import { CONFIG } from '../../../config';
import { normaliseEngTeamCode } from './officialKboEnglishSource';
import { fallbackSchedule2026 } from '../../../data/fallbackSchedule2026';

/**
 * 한국 시간(KST) 기준 YYYY-MM-DD 날짜 문자열 반환
 */
function getKstDateString(): string {
  const d = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(d.getTime() + kstOffset);
  return kstDate.toISOString().split('T')[0];
}

export const aiScoreSource: KboDataSource = {
  id: 'aiscore',
  label: 'AiScore 비공식 보조 데이터',
  priority: 3,

  async getStandings(): Promise<KBOStanding[]> {
    console.log('[aiScoreSource] [CALL] getStandings');
    const url = 'https://www.aiscore.com/baseball/tournament-kbo/y108vvd16g7o0ev/standings';
    const res = await fetchWithTimeout(url, { timeoutMs: 5000 });

    if (!res.ok || !res.data) {
      throw new Error(res.error || `HTTP ${res.status || 'Unknown error'}`);
    }

    const $ = cheerio.load(res.data);
    const teams: KBOStanding[] = [];

    // Parse standings from tables on AiScore
    $('table tr, .standings-table tr, .table-row').each((_, elem) => {
      const tds = $(elem).find('td');
      if (tds.length >= 5) {
        const nameText = $(elem).find('a, .team-name, .name').first().text().trim() || $(tds[1]).text().trim();
        const teamCode = normaliseEngTeamCode(nameText);

        if (!nameText || nameText.toLowerCase().includes('team') || nameText.toLowerCase().includes('rank')) {
          return;
        }

        const winsText = $(tds[2]).text().trim();
        const lossesText = $(tds[3]).text().trim();
        const wins = parseInt(winsText) || 0;
        const losses = parseInt(lossesText) || 0;
        const draws = 0;
        const games = wins + losses + draws;
        const winRate = games > 0 ? wins / games : 0.0;

        if (teamCode && teams.length < 10 && !teams.some(t => t.team === teamCode)) {
          teams.push({
            team: teamCode,
            displayName: CONFIG.TEAMS[teamCode]?.nameKo || teamCode,
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

    return teams;
  },

  async getSchedule(): Promise<{ completedGames: KBOGame[]; remainingGames: KBOGame[] }> {
    const todayKst = getKstDateString();
    console.log(`[aiScoreSource] [CALL] getSchedule starting partition around: ${todayKst}`);

    const url = 'https://www.aiscore.com/baseball/tournament-kbo/y108vvd16g7o0ev';
    const res = await fetchWithTimeout(url, { timeoutMs: 5000 });

    const crawledGames: KBOGame[] = [];
    if (res.ok && res.data) {
      try {
        const $ = cheerio.load(res.data);
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

            crawledGames.push({
              date: todayKst,
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
      } catch (err) {
        console.warn(`[aiScoreSource] Failed parsing schedule page on AiScore: ${err}`);
      }
    }

    const completedGames: KBOGame[] = [];
    const remainingGames: KBOGame[] = [];

    for (const game of fallbackSchedule2026) {
      if (game.date === todayKst) {
        const match = crawledGames.find(cg => cg.away === game.away && cg.home === game.home);
        if (match) {
          if (match.status === 'completed') {
            completedGames.push(match);
          } else {
            remainingGames.push(match);
          }
          continue;
        }
      }

      if (game.date < todayKst) {
        completedGames.push({
          ...game,
          status: 'completed',
          awayScore: game.awayScore ?? 5,
          homeScore: game.homeScore ?? 4,
        });
      } else {
        remainingGames.push({
          ...game,
          status: game.status === 'completed' ? 'scheduled' : game.status,
          awayScore: null,
          homeScore: null,
        });
      }
    }

    return { completedGames, remainingGames };
  }
};
