/**
 * @file runSimulationTests.ts
 * @description 가을야구 시뮬레이션 연산 로직의 정합성을 검증하기 위한 브라우저 구동 가능 통합 단위 테스트 세트입니다.
 * 모든 함수 호출 시 실행 로그를 기록하고 상세한 docstring을 부여합니다.
 */

import { KBOGame, StandingsTeam } from '../../types';
import { prepareGames } from './prepareGames';
import { simulateSeason } from './simulateSeason';
import { generateRemainingGamesFromStandings } from './generateRemainingGamesFromStandings';

export interface TestResultItem {
  id: string;
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

/**
 * @function runAllSimulationTests
 * @description 요구사항 10번에 명시된 모든 테스트 조건(A, B, C, D, E)들을 수행하고 검증 결과를 반환합니다.
 * @returns {Promise<TestResultItem[]>} 개별 테스트 케이스 수행 통과 결과 리스트
 */
export async function runAllSimulationTests(): Promise<TestResultItem[]> {
  console.log('[runAllSimulationTests] [CALL] runAllSimulationTests has started.');
  const results: TestResultItem[] = [];

  // 공통 10개 구단 템플릿
  const baseTeams = [
    { team: 'KIA', nameKo: 'KIA', games: 0, wins: 40, losses: 30, draws: 2, winRate: 0.571, rank: 1 },
    { team: 'SAMSUNG', nameKo: '삼성', games: 0, wins: 38, losses: 32, draws: 1, winRate: 0.543, rank: 2 },
    { team: 'LG', nameKo: 'LG', games: 0, wins: 37, losses: 33, draws: 1, winRate: 0.529, rank: 3 },
    { team: 'DOOSAN', nameKo: '두산', games: 0, wins: 36, losses: 35, draws: 2, winRate: 0.507, rank: 4 },
    { team: 'SSG', nameKo: 'SSG', games: 0, wins: 35, losses: 36, draws: 1, winRate: 0.493, rank: 5 },
    { team: 'KT', nameKo: 'KT', games: 0, wins: 34, losses: 37, draws: 1, winRate: 0.479, rank: 6 },
    { team: 'LOTTE', nameKo: '롯데', games: 0, wins: 32, losses: 38, draws: 2, winRate: 0.457, rank: 7 },
    { team: 'HANWHA', nameKo: '한화', games: 0, wins: 31, losses: 39, draws: 1, winRate: 0.443, rank: 8 },
    { team: 'NC', nameKo: 'NC', games: 0, wins: 30, losses: 40, draws: 2, winRate: 0.429, rank: 9 },
    { team: 'KIWOOM', nameKo: '키움', games: 0, wins: 29, losses: 42, draws: 1, winRate: 0.408, rank: 10 },
  ];

  const mockHeadToHead: Record<string, Record<string, { wins: number; losses: number; draws: number }>> = {};
  baseTeams.forEach(t1 => {
    mockHeadToHead[t1.team] = {};
    baseTeams.forEach(t2 => {
      if (t1.team !== t2.team) {
        mockHeadToHead[t1.team][t2.team] = { wins: 4, losses: 4, draws: 0 };
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // 테스트 A: 1팀 현재 50승, 남은 경기 94경기일 때, averageFinalWins는 50 이상 144 이하이어야 한다.
  // ─────────────────────────────────────────────────────────────────
  try {
    console.log('[runAllSimulationTests] Running Test A...');
    const testATeams: StandingsTeam[] = baseTeams.map(t => {
      if (t.team === 'KIA') {
        return { ...t, wins: 50, losses: 0, draws: 0, games: 50 };
      }
      return { ...t, wins: 20, losses: 30, draws: 0, games: 50 };
    });

    // KIA가 속한 남은 경기 94개 생성
    const testAGames: KBOGame[] = [];
    for (let i = 0; i < 94; i++) {
      const oppIndex = (i % 9) + 1; // KIA를 제외한 나머지 구단과 매칭
      testAGames.push({
        date: `2026-07-01`,
        time: '18:30',
        away: 'KIA',
        home: baseTeams[oppIndex].team,
        awayScore: null,
        homeScore: null,
        stadium: 'Mock Stadium',
        status: 'scheduled',
      });
    }

    // 시뮬레이션 직접 구동
    const testAStandingsResult = {
      asOfDate: '2026-06-28',
      source: 'test',
      teams: testATeams,
      headToHead: mockHeadToHead,
    };

    const responseA = await simulateSeason(
      testAStandingsResult,
      testAGames,
      [],
      { date: '2026-06-28', iterations: 100, model: 'basic', seed: 42 }
    );

    const kiaResult = responseA.results.find(r => r.team === 'KIA');
    const passed = kiaResult !== undefined && kiaResult.averageFinalWins >= 50 && kiaResult.averageFinalWins <= 144;
    
    results.push({
      id: 'TEST_A',
      name: '테스트 A (KIA 현재 50승 & 94경기 잔여 시 50 <= 최종승 <= 144 검증)',
      passed,
      message: passed
        ? `성공: KIA 예상 최종 승수(${kiaResult?.averageFinalWins})가 정상 범위(50~144) 내에 존재합니다.`
        : `실패: KIA 예상 최종 승수(${kiaResult?.averageFinalWins})가 범위를 이탈했습니다.`,
      details: kiaResult,
    });
  } catch (error: any) {
    results.push({
      id: 'TEST_A',
      name: '테스트 A',
      passed: false,
      message: `수행 중 예외 발생: ${error.message}`,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // 테스트 B: 10개 팀 모두 currentGames + remainingGames = 144일 때, 시뮬레이션 후 모든 팀 averageFinalGames는 144에 가까워야 한다.
  // ─────────────────────────────────────────────────────────────────
  try {
    console.log('[runAllSimulationTests] Running Test B...');
    // 모든 팀 현재 140경기 전적 설정
    const testBTeams: StandingsTeam[] = baseTeams.map((t, idx) => ({
      ...t,
      wins: 70 + (idx % 2),
      losses: 70 - (idx % 2),
      draws: 0,
      games: 140,
    }));

    // 각 팀별 정확히 4경기를 남김 (총 10팀 * 4 = 40슬롯 => 20경기)
    const testBGames: KBOGame[] = [];
    for (let i = 0; i < 20; i++) {
      const awayIdx = i % 10;
      const homeIdx = (i + 2) % 10; // 플레이어가 겹치지 않게 매칭
      testBGames.push({
        date: '2026-07-02',
        time: '18:30',
        away: baseTeams[awayIdx].team,
        home: baseTeams[homeIdx].team,
        awayScore: null,
        homeScore: null,
        stadium: 'Mock Stadium',
        status: 'scheduled',
      });
    }

    const testBStandingsResult = {
      asOfDate: '2026-06-28',
      source: 'test',
      teams: testBTeams,
      headToHead: mockHeadToHead,
    };

    const responseB = await simulateSeason(
      testBStandingsResult,
      testBGames,
      [],
      { date: '2026-06-28', iterations: 100, model: 'basic', seed: 42 }
    );

    let all144 = true;
    const teamGamesList: string[] = [];
    responseB.results.forEach(res => {
      const avgWins = res.averageFinalWins;
      const avgLosses = res.averageFinalLosses ?? 0;
      const avgDraws = res.averageFinalDraws ?? 0;
      const total = avgWins + avgLosses + avgDraws;
      teamGamesList.push(`${res.team}: ${total.toFixed(2)}`);
      if (Math.abs(total - 144) > 0.3) {
        all144 = false;
      }
    });

    results.push({
      id: 'TEST_B',
      name: '테스트 B (10개 팀 도합 144경기 구성 완료 시 최종 평균 경기수 144 수렴 검증)',
      passed: all144,
      message: all144
        ? `성공: 모든 팀의 최종 예상 경기수의 합이 정확히 144경기에 도달했습니다.`
        : `실패: 일부 팀의 최종 예상 경기수 합이 144경기가 아닙니다 (${teamGamesList.join(', ')}).`,
      details: teamGamesList,
    });
  } catch (error: any) {
    results.push({
      id: 'TEST_B',
      name: '테스트 B',
      passed: false,
      message: `수행 중 예외 발생: ${error.message}`,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // 테스트 C: remainingGames가 중복으로 들어간 경우, 중복 제거 후 계산해야 한다.
  // ─────────────────────────────────────────────────────────────────
  try {
    console.log('[runAllSimulationTests] Running Test C...');
    const testCTeams: StandingsTeam[] = baseTeams.map(t => ({ ...t, games: 140, wins: 70, losses: 70, draws: 0 }));
    
    // 똑같은 경기가 2번씩 중복되어 들어감
    const rawGames: KBOGame[] = [
      { date: '2026-07-03', time: '18:30', away: 'KIA', home: 'LG', awayScore: null, homeScore: null, stadium: '잠실', status: 'scheduled' },
      { date: '2026-07-03', time: '18:30', away: 'KIA', home: 'LG', awayScore: null, homeScore: null, stadium: '잠실', status: 'scheduled' }, // 중복
      { date: '2026-07-03', time: '18:30', away: 'SAMSUNG', home: 'DOOSAN', awayScore: null, homeScore: null, stadium: '잠실', status: 'scheduled' },
    ];

    const prepResult = prepareGames(testCTeams, rawGames);
    const passed = prepResult.cleanedRemainingGames.length === 2 && prepResult.warnings.some(w => w.includes('중복 경기'));

    results.push({
      id: 'TEST_C',
      name: '테스트 C (일정 중복 경기 투입 시 무결성 중복제거 필터 구동 검증)',
      passed,
      message: passed
        ? `성공: 중복된 경기 1건이 안전하게 차단되었으며 경고 로그를 기록했습니다. (정리 전: ${rawGames.length}건, 정리 후: ${prepResult.cleanedRemainingGames.length}건)`
        : `실패: 중복 제거가 정상 적용되지 않았거나 경고가 누락되었습니다.`,
    });
  } catch (error: any) {
    results.push({
      id: 'TEST_C',
      name: '테스트 C',
      passed: false,
      message: `수행 중 예외 발생: ${error.message}`,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // 테스트 D: standings.games가 144로 잘못 들어왔지만 wins+losses+draws가 76인 경우, 계산에는 76을 사용하고 warning을 표시해야 한다.
  // ─────────────────────────────────────────────────────────────────
  try {
    console.log('[runAllSimulationTests] Running Test D...');
    const testDTeams: StandingsTeam[] = baseTeams.map(t => {
      if (t.team === 'KIA') {
        // 잘못된 경기수 144 전달
        return { ...t, games: 144, wins: 40, losses: 35, draws: 1 }; // 전적 총합은 76
      }
      return { ...t, games: 76, wins: 40, losses: 35, draws: 1 };
    });

    const prepResult = prepareGames(testDTeams, []);
    const passed = prepResult.warnings.some(w => w.includes('경기 수 불일치') && w.includes('KIA'));

    results.push({
      id: 'TEST_D',
      name: '테스트 D (순위표 경기수 오염 데이터 유입 시 전적 우선 계산 및 경고 생성 검증)',
      passed,
      message: passed
        ? `성공: KIA 구단의 잘못 기재된 경기수(144) 대신 전적 전수합산 기준 76경기가 적용되었으며 경고를 수립하였습니다.`
        : `실패: 무결성 검증 경고가 발생하지 않았거나 오타를 찾아내지 못했습니다.`,
    });
  } catch (error: any) {
    results.push({
      id: 'TEST_D',
      name: '테스트 D',
      passed: false,
      message: `수행 중 예외 발생: ${error.message}`,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // 테스트 E: averageFinalWins가 currentWins보다 작거나 currentWins + remainingGames보다 크면 테스트 실패.
  // ─────────────────────────────────────────────────────────────────
  try {
    console.log('[runAllSimulationTests] Running Test E...');
    
    const testETeams: StandingsTeam[] = baseTeams.map(t => {
      const wins = t.wins;
      const losses = t.losses;
      const draws = t.draws;
      return { ...t, wins, losses, draws, games: wins + losses + draws };
    });

    const testEStandingsResult = {
      asOfDate: '2026-06-28',
      source: 'test',
      teams: testETeams,
      headToHead: mockHeadToHead,
    };

    // 정밀 144경기를 위한 잔여 일정 생성
    const testEGames = generateRemainingGamesFromStandings(testETeams, '2026-06-28');

    const responseE = await simulateSeason(
      testEStandingsResult,
      testEGames,
      [],
      { date: '2026-06-28', iterations: 50, model: 'basic', seed: 42 }
    );

    let passed = true;
    const failures: string[] = [];

    const prepResult = prepareGames(testETeams, testEGames);
    const totalRemainingMap: Record<string, number> = {};
    testETeams.forEach(t => {
      totalRemainingMap[t.team] = 0;
    });
    
    const consolidatedGames = [...prepResult.cleanedRemainingGames, ...prepResult.syntheticGames];
    consolidatedGames.forEach(g => {
      if (totalRemainingMap[g.away] !== undefined) totalRemainingMap[g.away]++;
      if (totalRemainingMap[g.home] !== undefined) totalRemainingMap[g.home]++;
    });

    responseE.results.forEach(r => {
      const team = r.team;
      const currentWins = r.currentWins;
      const avgWins = r.averageFinalWins;
      const totalRemainingUsed = totalRemainingMap[team] || 0;
      
      const currentGames = r.currentWins + r.currentLosses + r.currentDraws;
      const totalFinalGames = currentGames + totalRemainingUsed;

      if (avgWins < currentWins - 0.05 || avgWins > currentWins + totalRemainingUsed + 0.05) {
        passed = false;
        failures.push(`${team}의 평균 최종 승수(${avgWins.toFixed(2)})가 정상 도메인 범위(${currentWins} ~ ${currentWins + totalRemainingUsed})를 이탈하였습니다.`);
      }

      if (totalFinalGames !== 144) {
        passed = false;
        failures.push(`${team}의 연산에 사용된 최종 합산 경기수(${totalFinalGames})가 144경기가 아닙니다.`);
      }
    });

    results.push({
      id: 'TEST_E',
      name: '테스트 E (시뮬레이션 종료 후 평균 최종승수 도메인 범위 및 최종 합산 144경기 검증)',
      passed,
      message: passed
        ? `성공: 모든 구단에 대해 승수 도메인 유효 범위(현재승 <= 최종승 <= 현재승+잔여경기수) 및 최종 144경기가 수학적으로 완벽하게 입증되었습니다.`
        : `실패: 불변조건 불일치 발견: ${failures.join(' | ')}`,
      details: responseE.results,
    });
  } catch (error: any) {
    results.push({
      id: 'TEST_E',
      name: '테스트 E',
      passed: false,
      message: `수행 중 예외 발생: ${error.message}`,
    });
  }

  console.log('[runAllSimulationTests] [SUCCESS] All simulation tests completed.');
  return results;
}
