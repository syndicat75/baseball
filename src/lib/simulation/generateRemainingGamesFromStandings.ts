/**
 * @file generateRemainingGamesFromStandings.ts
 * @description standings 정보를 바탕으로 각 구단의 최종 경기수가 완벽히 144경기가 되도록
 * 중립적인 잔여 일정(Neutral Remaining Schedule)을 생성하는 유틸리티입니다.
 */

import { KBOGame, StandingsTeam } from '../../types';
import { CONFIG } from '../../config';

/**
 * @function generateRemainingGamesFromStandings
 * @description 각 팀의 현재 경기수(wins + losses + draws)를 바탕으로 144경기를 채우기 위한 잔여 경기를 탐욕적으로 매칭 및 분산 생성합니다.
 * @param {StandingsTeam[]} standings 10개 구단 순위 정보 리스트
 * @param {string} startDate 시작 날짜 (YYYY-MM-DD)
 * @returns {KBOGame[]} 생성된 잔여 일정 리스트
 */
export function generateRemainingGamesFromStandings(standings: StandingsTeam[], startDate: string): KBOGame[] {
  console.log(`[generateRemainingGamesFromStandings] [CALL] generateRemainingGamesFromStandings starting from date: "${startDate}"`);

  // 1. 각 구단별 남은 경기 슬롯 계산
  const teamSlots: Record<string, number> = {};
  standings.forEach(t => {
    const currentGames = t.wins + t.losses + t.draws;
    const remaining = Math.max(0, 144 - currentGames);
    teamSlots[t.team] = remaining;
    console.log(`[generateRemainingGamesFromStandings] Team: ${t.team} | Current Games: ${currentGames} | Remaining Slots needed: ${remaining}`);
  });

  const generatedGames: KBOGame[] = [];
  let currentDate = new Date(startDate);
  
  // 상대 전적 분산을 위해 최근에 매칭된 팀 조합을 추적
  const matchHistory: Record<string, number> = {};
  const getMatchKey = (t1: string, t2: string) => {
    const minTeam = t1 < t2 ? t1 : t2;
    const maxTeam = t1 < t2 ? t2 : t1;
    return `${minTeam}:${maxTeam}`;
  };

  // 2. 남은 경기수가 있는 구단들을 페어링하여 경기 생성 (Greedy Matchmaking)
  let loopCount = 0;
  const maxLoops = 10000; // 무한루프 방지 안전장치

  while (loopCount < maxLoops) {
    loopCount++;
    
    // 남은 슬롯이 있는 팀들만 추출
    const activeTeams = Object.keys(teamSlots)
      .filter(team => teamSlots[team] > 0)
      .sort((a, b) => teamSlots[b] - teamSlots[a]); // 남은 슬롯이 많은 팀이 우선

    if (activeTeams.length < 2) {
      break;
    }

    // 가장 슬롯이 많이 남은 팀 A
    const teamA = activeTeams[0];
    
    // 팀 A와 매칭할 파트너 팀 B 선정
    // 팀 B는 teamSlots[B] > 0 이어야 하고, A와 매칭 횟수가 적은 팀을 선호하여 분산시킴
    let bestPartner: string | null = null;
    let minPastMatches = Infinity;

    for (let i = 1; i < activeTeams.length; i++) {
      const teamCandidate = activeTeams[i];
      const matchKey = getMatchKey(teamA, teamCandidate);
      const pastMatches = matchHistory[matchKey] || 0;

      // 더 고른 분산을 위해 과거 매칭 횟수가 더 적거나, 매칭 횟수가 같으면 남은 슬롯이 더 많은 후보를 선정
      if (pastMatches < minPastMatches) {
        minPastMatches = pastMatches;
        bestPartner = teamCandidate;
      } else if (pastMatches === minPastMatches && bestPartner !== null) {
        if (teamSlots[teamCandidate] > teamSlots[bestPartner]) {
          bestPartner = teamCandidate;
        }
      }
    }

    if (!bestPartner) {
      // 매칭 불가능 상황 대비
      break;
    }

    // 경기 생성
    const teamB = bestPartner;
    teamSlots[teamA]--;
    teamSlots[teamB]--;

    const matchKey = getMatchKey(teamA, teamB);
    matchHistory[matchKey] = (matchHistory[matchKey] || 0) + 1;

    // 경기 날짜 계산 (하루에 최대 5경기 분산 배치)
    const gameIndex = generatedGames.length;
    if (gameIndex > 0 && gameIndex % 5 === 0) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    const dateStr = currentDate.toISOString().split('T')[0];

    generatedGames.push({
      date: dateStr,
      time: '18:30',
      away: teamA,
      home: teamB,
      awayScore: null,
      homeScore: null,
      stadium: (CONFIG.TEAMS[teamB as keyof typeof CONFIG.TEAMS] as any)?.stadium || 'NEUTRAL',
      status: 'scheduled',
      synthetic: true, // 보정 경기임을 표시
      reason: 'Generated from Standings to ensure 144 games',
    });
  }

  console.log(`[generateRemainingGamesFromStandings] [SUCCESS] Generated ${generatedGames.length} remaining games from standings.`);
  return generatedGames;
}
