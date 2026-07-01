/**
 * @file statsCalculator.ts
 * @description KBO 경기 결과 데이터를 분석하여 정밀한 구단별 통계(연속 기록, 최근 10경기, 득점/실점, 게임차 등)를 실시간 산출하는 유틸리티입니다.
 */

import { KBOGame, TeamStanding } from '../../types';
import { KBO_TEAM_PROFILES } from '../../kboConfig';
import { CONFIG } from '../../config';

/**
 * @function calculateDetailedStandings
 * @description 완료된 경기 리스트와 기본 구단 순위 리스트를 바탕으로 상세한 KBO 순위 통계 데이터셋을 계산합니다.
 * @param basicStandings 구단 순위 기본 데이터 (wins, losses, draws, rank 등)
 * @param completedGames 지금까지 치러진 경기 결과 리스트
 * @param updatedAt 최신 갱신 일자 시간 정보
 * @returns {TeamStanding[]} 세부 통계가 추가 완료된 팀 순위 리스트
 */
export function calculateDetailedStandings(
  basicStandings: any[],
  completedGames: KBOGame[],
  updatedAt: string
): TeamStanding[] {
  console.log('[statsCalculator] [CALL] calculateDetailedStandings - Calculating advanced metrics from KBO raw data.');

  // 1. 구단별 누적 데이터 객체 초기화
  const teamStats: Record<string, {
    runs: number;
    runsAllowed: number;
    streak: string;
    last10: string;
  }> = {};

  // 초기화
  basicStandings.forEach(s => {
    teamStats[s.team] = {
      runs: 0,
      runsAllowed: 0,
      streak: '0승',
      last10: '0승 0패',
    };
  });

  // 2. 득점 및 실점 계산
  completedGames.forEach(g => {
    const away = g.away;
    const home = g.home;
    const awayScore = g.awayScore ?? 0;
    const homeScore = g.homeScore ?? 0;

    if (teamStats[away]) {
      teamStats[away].runs += awayScore;
      teamStats[away].runsAllowed += homeScore;
    }
    if (teamStats[home]) {
      teamStats[home].runs += homeScore;
      teamStats[home].runsAllowed += awayScore;
    }
  });

  // 3. 구단별로 날짜 정렬된 완료 경기 목록 추출하여 최근 10경기 전적 및 연승/연패 계산
  basicStandings.forEach(s => {
    const team = s.team;
    const teamGames = completedGames
      .filter(g => g.away === team || g.home === team)
      .sort((a, b) => b.date.localeCompare(a.date)); // 최신순

    // 3a. 최근 10경기 계산
    const last10Games = teamGames.slice(0, 10);
    let lWins = 0;
    let lLosses = 0;
    let lDraws = 0;

    last10Games.forEach(g => {
      const isAway = g.away === team;
      const awayScore = g.awayScore ?? 0;
      const homeScore = g.homeScore ?? 0;

      if (awayScore === homeScore) {
        lDraws++;
      } else if ((isAway && awayScore > homeScore) || (!isAway && homeScore > awayScore)) {
        lWins++;
      } else {
        lLosses++;
      }
    });
    const last10Str = lDraws > 0 ? `${lWins}승 ${lDraws}무 ${lLosses}패` : `${lWins}승 ${lLosses}패`;

    // 3b. 연승 / 연패(Streak) 계산
    let streakStr = '-';
    if (teamGames.length > 0) {
      const firstGame = teamGames[0];
      const isFirstAway = firstGame.away === team;
      const fAwayScore = firstGame.awayScore ?? 0;
      const fHomeScore = firstGame.homeScore ?? 0;

      let isWin = false;
      let isDraw = false;

      if (fAwayScore === fHomeScore) {
        isDraw = true;
      } else if ((isFirstAway && fAwayScore > fHomeScore) || (!isFirstAway && fHomeScore > fAwayScore)) {
        isWin = true;
      }

      let streakCount = 1;
      for (let i = 1; i < teamGames.length; i++) {
        const game = teamGames[i];
        const isAway = game.away === team;
        const awayScore = game.awayScore ?? 0;
        const homeScore = game.homeScore ?? 0;

        let curWin = false;
        let curDraw = false;

        if (awayScore === homeScore) {
          curDraw = true;
        } else if ((isAway && awayScore > homeScore) || (!isAway && homeScore > awayScore)) {
          curWin = true;
        }

        if (isDraw && curDraw) {
          streakCount++;
        } else if (isWin && curWin && !isDraw) {
          streakCount++;
        } else if (!isWin && !curWin && !isDraw && !curDraw) {
          streakCount++;
        } else {
          break;
        }
      }

      streakStr = isDraw ? `${streakCount}무` : (isWin ? `${streakCount}연승` : `${streakCount}연패`);
    }

    if (teamStats[team]) {
      teamStats[team].last10 = last10Str;
      teamStats[team].streak = streakStr;
    }
  });

  // 4. 게임차(Games Behind) 계산 (1위 기준 상대값 산출)
  // 기본 순위 리스트는 wins, losses가 정렬되어 있음
  const sortedStandings = [...basicStandings].sort((a, b) => {
    const aRate = a.winRate || a.winningPct || 0;
    const bRate = b.winRate || b.winningPct || 0;
    if (bRate !== aRate) return bRate - aRate;
    return b.wins - a.wins; // 승률 같으면 다승 순
  });

  const leader = sortedStandings[0];
  const leaderWins = leader ? leader.wins : 0;
  const leaderLosses = leader ? leader.losses : 0;

  // 5. 전체 상세 객체 매핑
  const detailedList: TeamStanding[] = sortedStandings.map((s, index) => {
    const team = s.team;
    const stats = teamStats[team] || { runs: 0, runsAllowed: 0, streak: '-', last10: '0승 0패' };
    const profile = KBO_TEAM_PROFILES[team];

    // 게임차 계산 공식: ((1위승 - 내승) + (내패 - 1위패)) / 2
    const gamesBehind = ((leaderWins - s.wins) + (s.losses - leaderLosses)) / 2;

    return {
      rank: index + 1,
      teamName: s.displayName || CONFIG.TEAMS[team]?.nameKo || team,
      games: s.games,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws ?? 0,
      winningPct: s.winRate || s.winningPct || (s.games > 0 ? s.wins / s.games : 0),
      gamesBehind: Math.max(0, gamesBehind),
      streak: stats.streak,
      last10: stats.last10,
      battingAvg: profile?.battingAvg ?? 0.270,
      era: profile?.era ?? 4.5,
      runs: stats.runs,
      runsAllowed: stats.runsAllowed,
      updatedAt,
    };
  });

  return detailedList;
}
