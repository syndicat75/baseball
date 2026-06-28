/**
 * @file myKboStatsSource.ts
 * @description MyKBOStats Data Source. Priority 2, unofficial auxiliary data source.
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

export const myKboStatsSource: KboDataSource = {
  id: 'mykbostats',
  label: 'MyKBOStats 비공식 보조 데이터',
  priority: 2,

  async getStandings(): Promise<KBOStanding[]> {
    console.log('[myKboStatsSource] [CALL] getStandings');
    const url = 'https://mykbostats.com/';
    const res = await fetchWithTimeout(url, { timeoutMs: 5000 });

    if (!res.ok || !res.data) {
      throw new Error(res.error || `HTTP ${res.status || 'Unknown error'}`);
    }

    const $ = cheerio.load(res.data);
    const teams: KBOStanding[] = [];

    // Parse standings from tables on mykbostats.com
    $('table tr').each((_, elem) => {
      const tds = $(elem).find('td, th');
      if (tds.length >= 6) {
        const nameText = $(tds[0]).text().trim() || $(tds[1]).text().trim();
        const teamCode = normaliseEngTeamCode(nameText);
        
        if (!nameText || nameText.toLowerCase().includes('team') || nameText.toLowerCase().includes('rank')) {
          return;
        }

        const games = parseInt($(tds[1]).text().trim()) || 0;
        const wins = parseInt($(tds[2]).text().trim()) || 0;
        const losses = parseInt($(tds[3]).text().trim()) || 0;
        const draws = parseInt($(tds[4]).text().trim()) || 0;
        const winRate = parseFloat($(tds[5]).text().trim()) || 0.0;

        if (teamCode && teams.length < 10 && !teams.some(t => t.team === teamCode)) {
          teams.push({
            team: teamCode,
            displayName: CONFIG.TEAMS[teamCode]?.nameKo || teamCode,
            nameKo: CONFIG.TEAMS[teamCode]?.nameKo || teamCode,
            games,
            wins,
            losses,
            draws,
            winRate: winRate > 1 ? winRate / 100 : winRate,
            rank: teams.length + 1,
          });
        }
      }
    });

    if (teams.length !== 10) {
      console.warn(`[myKboStatsSource] Standard table parse got ${teams.length} teams. Trying backup parser.`);
      teams.length = 0;
      $('.standings table tbody tr, .table-condensed tbody tr').each((idx, elem) => {
        const tds = $(elem).find('td');
        if (tds.length >= 5) {
          const nameText = $(tds[0]).text().trim();
          const teamCode = normaliseEngTeamCode(nameText);
          const wins = parseInt($(tds[1]).text().trim()) || 0;
          const losses = parseInt($(tds[2]).text().trim()) || 0;
          const draws = parseInt($(tds[3]).text().trim()) || 0;
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
              rank: idx + 1,
            });
          }
        }
      });
    }

    if (teams.length !== 10) {
      console.warn(`[myKboStatsSource] Parsing failed. Teams found: ${teams.length}`);
      throw new Error(`Parsing failed (Got ${teams.length} teams)`);
    }

    // Assign rank based on winRate descending
    teams.sort((a, b) => b.winRate - a.winRate);
    teams.forEach((t, index) => {
      t.rank = index + 1;
    });

    return teams;
  },

  async getSchedule(): Promise<{ completedGames: KBOGame[]; remainingGames: KBOGame[] }> {
    console.log('[myKboStatsSource] [CALL] getSchedule');
    throw new Error('MyKBOStats does not provide full season schedule data.');
  }
};
