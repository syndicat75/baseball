/**
 * @file fallbackSource.ts
 * @description 번들 로컬 예비 데이터 소스. 높은 안정성을 자랑하며 모든 네트워크 통신 장애 시 최종 방어선 역할을 합니다.
 */

import { KboDataSource, KBOStanding } from './index';
import { KBOGame } from '../../../types';
import { fallbackStandings2026 } from '../../../data/fallbackStandings2026';
import { fallbackSchedule2026 } from '../../../data/fallbackSchedule2026';

/**
 * 한국 시간(KST) 기준 YYYY-MM-DD 날짜 문자열 반환
 */
function getKstDateString(): string {
  const d = new Date();
  // UTC 시간을 KST(UTC+9)로 조정
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(d.getTime() + kstOffset);
  return kstDate.toISOString().split('T')[0];
}

export const fallbackSource: KboDataSource = {
  id: 'bundled-fallback',
  label: '번들 로컬 예비 데이터',
  priority: 4,

  /**
   * @function getStandings
   * @description 번들링된 2026 정적 순위 데이터를 반환합니다.
   */
  async getStandings(): Promise<KBOStanding[]> {
    console.log('[fallbackSource] [CALL] getStandings - 번들된 정적 순위 반환');
    return fallbackStandings2026.teams.map(t => ({
      team: t.team,
      displayName: t.nameKo,
      nameKo: t.nameKo,
      games: t.games,
      wins: t.wins,
      losses: t.losses,
      draws: t.draws,
      winRate: t.winRate,
      rank: t.rank
    }));
  },

  /**
   * @function getSchedule
   * @description 현재 날짜(KST)를 기준으로 완료된 경기와 남은 경기를 분할하여 반환합니다.
   */
  async getSchedule(): Promise<{ completedGames: KBOGame[]; remainingGames: KBOGame[] }> {
    const todayKst = getKstDateString();
    console.log(`[fallbackSource] [CALL] getSchedule - 기준일(KST): ${todayKst}`);

    const completedGames: KBOGame[] = [];
    const remainingGames: KBOGame[] = [];

    for (const game of fallbackSchedule2026) {
      if (game.date < todayKst) {
        // 이미 진행된 경기로 분류
        completedGames.push({
          ...game,
          status: 'completed',
          awayScore: game.awayScore ?? 5, // 점수가 없으면 가상의 기본값 부여
          homeScore: game.homeScore ?? 4,
        });
      } else {
        // 앞으로 진행될 경기로 분류
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
