/**
 * @file prepareGames.ts
 * @description 잔여 경기 데이터의 중복 제거 및 144경기 정합성을 채우기 위한 
 * synthetic (가상 보정) 경기 생성 처리를 전담하는 모듈입니다.
 * 모든 함수 호출 시 실행 로그를 남기고 상세한 docstring을 보유합니다.
 */

import { KBOGame, StandingsTeam } from '../../types';

export interface PrepareGamesResult {
  cleanedRemainingGames: KBOGame[];
  syntheticGames: KBOGame[];
  syntheticTeamCounts: Record<string, number>;
  warnings: string[];
}

/**
 * @function prepareGames
 * @description 입력받은 잔여 경기 리스트에서 중복을 제거하고, 부족한 경기 수만큼 가상 경기(Synthetic Games)를 구성하여 반환합니다.
 * @param {StandingsTeam[]} standings 현재 순위표 팀 정보 리스트
 * @param {KBOGame[]} rawRemainingGames 데이터 수집 등을 통해 획득한 원본 잔여 경기 목록
 * @returns {PrepareGamesResult} 중복 제거 후 가상 보정된 경기 리스트와 생성된 가상 경기 목록, 그리고 경고 정보
 */
export function prepareGames(
  standings: StandingsTeam[],
  rawRemainingGames: KBOGame[]
): PrepareGamesResult {
  console.log('[prepareGames] [CALL] prepareGames has been invoked.');
  const warnings: string[] = [];

  // 1. 중복 경기 제거 (gameKey = `${g.date}-${g.away}-${g.home}-${g.stadium || ''}`)
  const seenKeys = new Set<string>();
  const cleanedRemainingGames: KBOGame[] = [];

  rawRemainingGames.forEach(g => {
    const gameKey = `${g.date}-${g.away}-${g.home}-${g.stadium || ''}`;
    if (seenKeys.has(gameKey)) {
      const warningMsg = `[중복 경기 감지] 날짜: ${g.date}, 원정: ${g.away}, 홈: ${g.home} 경기가 중복 검출되어 1회만 반영하도록 중복 제거되었습니다.`;
      console.warn(`[prepareGames] ${warningMsg}`);
      if (!warnings.includes(warningMsg)) {
        warnings.push(warningMsg);
      }
    } else {
      seenKeys.add(gameKey);
      cleanedRemainingGames.push(g);
    }
  });

  console.log(`[prepareGames] Duplicate removal done. Original count: ${rawRemainingGames.length}, Cleaned count: ${cleanedRemainingGames.length}`);

  // 2. 구단별 현재 경기수 및 필요 남은 경기수 계산
  // currentGames = wins + losses + draws
  const teamSlotPool: { team: string; missingCount: number }[] = [];
  const syntheticTeamCounts: Record<string, number> = {};

  standings.forEach(t => {
    const currentGames = t.wins + t.losses + t.draws;
    syntheticTeamCounts[t.team] = 0;
    
    // standings.games 정합성 체크
    if (t.games !== currentGames) {
      const warningMsg = `[경기 수 불일치] ${t.nameKo || t.team} 구단의 순위표 경기수(${t.games})가 실제 전적 합계(승:${t.wins} + 패:${t.losses} + 무:${t.draws} = ${currentGames})와 불일치합니다. 연산에는 실제 전적 합계(${currentGames}경기)를 사용합니다.`;
      console.warn(`[prepareGames] ${warningMsg}`);
      warnings.push(warningMsg);
    }

    // scheduledRemainingGamesByTeam = 이 팀이 home 또는 away로 등장하는 횟수
    const scheduledRemainingCount = cleanedRemainingGames.filter(
      g => g.away === t.team || g.home === t.team
    ).length;

    const targetRemainingGames = Math.max(0, 144 - currentGames);
    const missingRemainingGames = targetRemainingGames - scheduledRemainingCount;

    if (missingRemainingGames < 0) {
      const warningMsg = `[일정 초과] ${t.nameKo || t.team} 구단이 예정된 잔여 경기(${scheduledRemainingCount})를 모두 치르면 최종 경기수(${currentGames + scheduledRemainingCount})가 144경기를 초과합니다.`;
      console.warn(`[prepareGames] ${warningMsg}`);
      warnings.push(warningMsg);
    }

    teamSlotPool.push({
      team: t.team,
      missingCount: Math.max(0, missingRemainingGames)
    });
  });

  console.log('[prepareGames] Computed missing game counts per team:', JSON.stringify(teamSlotPool));

  // 3. 골고루 분산된 페어링 알고리즘을 사용한 가상 경기(Synthetic Games) 생성
  const syntheticGames: KBOGame[] = [];
  const matchHistory: Record<string, number> = {};
  const getMatchKey = (t1: string, t2: string) => {
    const minTeam = t1 < t2 ? t1 : t2;
    const maxTeam = t1 < t2 ? t2 : t1;
    return `${minTeam}:${maxTeam}`;
  };
  
  while (true) {
    // missingCount가 큰 순으로 정렬
    teamSlotPool.sort((a, b) => b.missingCount - a.missingCount);

    // 가장 슬롯이 많이 부족한 팀
    if (teamSlotPool.length < 2 || teamSlotPool[0].missingCount <= 0) {
      break;
    }

    const t1 = teamSlotPool[0];

    // t1과 매칭할 파트너 찾기 (missingCount > 0 인 다른 팀 중 t1과의 가상 경기 매칭 이력이 가장 적은 팀 선택)
    let bestPartnerIndex = -1;
    let minPastMatches = Infinity;

    for (let i = 1; i < teamSlotPool.length; i++) {
      const candidate = teamSlotPool[i];
      if (candidate.missingCount <= 0) continue;

      const matchKey = getMatchKey(t1.team, candidate.team);
      const pastMatches = matchHistory[matchKey] || 0;

      if (pastMatches < minPastMatches) {
        minPastMatches = pastMatches;
        bestPartnerIndex = i;
      } else if (pastMatches === minPastMatches && bestPartnerIndex !== -1) {
        // 이력이 같으면 슬롯이 더 많이 남은 후보 선호
        if (candidate.missingCount > teamSlotPool[bestPartnerIndex].missingCount) {
          bestPartnerIndex = i;
        }
      }
    }

    if (bestPartnerIndex === -1) {
      break;
    }

    const t2 = teamSlotPool[bestPartnerIndex];

    const matchKey = getMatchKey(t1.team, t2.team);
    matchHistory[matchKey] = (matchHistory[matchKey] || 0) + 1;

    console.log(`[prepareGames] Creating synthetic game between ${t1.team} and ${t2.team}`);
    
    syntheticGames.push({
      date: 'SYNTHETIC',
      time: '18:30',
      away: t1.team,
      home: t2.team,
      awayScore: null,
      homeScore: null,
      stadium: 'SYNTHETIC_STADIUM',
      status: 'scheduled',
      synthetic: true,
      clearly_synthetic: true,
      reason: 'fill-to-144'
    });

    syntheticTeamCounts[t1.team] = (syntheticTeamCounts[t1.team] || 0) + 1;
    syntheticTeamCounts[t2.team] = (syntheticTeamCounts[t2.team] || 0) + 1;

    t1.missingCount -= 1;
    t2.missingCount -= 1;
  }

  // 매칭 후 남은 홀수 슬롯 체크 및 경고 생성
  const remainingSlots = teamSlotPool.reduce((acc, t) => acc + t.missingCount, 0);
  if (remainingSlots > 0) {
    const unmappedTeams = teamSlotPool.filter(t => t.missingCount > 0).map(t => `${t.team}(${t.missingCount}경기)`);
    const warningMsg = `[일정 불균형] 구단별 잔여 경기 스케줄 불균형으로 인해 ${unmappedTeams.join(', ')}의 일부 경기 슬롯을 가상 매칭하지 못했습니다.`;
    console.warn(`[prepareGames] ${warningMsg}`);
    warnings.push(warningMsg);
  } else {
    console.log('[prepareGames] All missing game slots successfully paired with synthetic games.');
  }

  // 4. 가상 경기가 전체 잔여 경기의 10%를 초과하는지 체크
  const totalRemainingGamesCount = cleanedRemainingGames.length + syntheticGames.length;
  if (totalRemainingGamesCount > 0) {
    const syntheticRatio = syntheticGames.length / totalRemainingGamesCount;
    if (syntheticRatio > 0.1) {
      const strongWarning = `일정 데이터의 유실 혹은 누락이 감지되어, 구단별 144경기를 채우기 위해 인공 보정 경기(Synthetic Games)가 ${syntheticGames.length}경기 대거 투입되었습니다. 경기력 분석 시 유의해 주시기 바랍니다.`;
      console.warn(`[prepareGames] Strong warning: ${strongWarning}`);
      warnings.push(strongWarning);
    }
  }

  return {
    cleanedRemainingGames,
    syntheticGames,
    syntheticTeamCounts,
    warnings
  };
}
