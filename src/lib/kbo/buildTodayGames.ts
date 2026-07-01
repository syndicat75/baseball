/**
 * @file buildTodayGames.ts
 * @description KBO 당일 경기 일정 데이터를 구단별 디폴트 프로필(선발투수 정보, 타선 라인업 등)과 연결하고,
 * 규칙 기반 예측 모델을 가동하여 완전한 형태 of TodayGame 구조체 목록을 생산해내는 가공 엔진입니다.
 */

import { KBOGame, TodayGame, PitcherStats, BatterLineup, GamePrediction } from '../../types';
import { KBO_TEAM_PROFILES } from '../../kboConfig';
import { generatePrediction } from './predictionEngine';
import { getKoreaTodayString } from './dateUtils';

/**
 * @function buildTodayGames
 * @description 주어진 원시 경기 리스트와 순위 데이터를 기반으로 특정 일자의 경기 일정, 선발투수, 라인업, 예측을 결합한 KBO 당일 경기 상세 정보를 빌드합니다.
 * @param {any} kboData 수집된 전체 KBO 스냅샷 데이터
 * @param {string} [targetDate] 특정 대상 날짜 (생략 시 오늘 KST 기준)
 * @returns {TodayGame[]} 상세 정보가 채워진 당일 경기 구조체 목록
 */
export function buildTodayGames(kboData: any, targetDate?: string): TodayGame[] {
  console.log(`[buildTodayGames] [CALL] buildTodayGames - date: "${targetDate || 'KST Today'}"`);
  
  const todayStr = targetDate || getKoreaTodayString();
  const completed = kboData.completedGames || [];
  const remaining = kboData.remainingGames || [];
  const standings = kboData.standings || [];
  const updatedAt = kboData.fetchedAt || new Date().toISOString();

  const allGames: KBOGame[] = [...completed, ...remaining];
  
  // 지정된 날짜의 경기 필터링
  const rawTodayGames = allGames.filter(g => g.date === todayStr);
  console.log(`[buildTodayGames] Found ${rawTodayGames.length} games for date: ${todayStr}`);


  const todayGamesList: TodayGame[] = rawTodayGames.map((g, index) => {
    const gameId = `kbo-game-${todayStr}-${g.away}-${g.home}`;
    const away = g.away;
    const home = g.home;
    const stadium = g.stadium || '구장 미정';
    const statusMap: Record<string, '예정' | '진행중' | '종료' | '우천취소' | '취소' | '지연'> = {
      'scheduled': '예정',
      'ongoing': '진행중',
      'completed': '종료',
      'postponed': '우천취소',
      'cancelled': '취소',
      'delayed': '지연'
    };
    const status = statusMap[g.status] || '예정';

    const awayProfile = KBO_TEAM_PROFILES[away];
    const homeProfile = KBO_TEAM_PROFILES[home];

    // 1. 선발투수 스탯 추출 (날짜 기반 순환 선정 또는 프로필 1선발)
    const dateNum = parseInt(todayStr.replace(/-/g, '')) || 0;
    
    // Away Starter
    let awayStarter: PitcherStats | null = null;
    if (awayProfile && awayProfile.starters && awayProfile.starters.length > 0) {
      const idx = dateNum % awayProfile.starters.length;
      const starter = awayProfile.starters[idx];
      awayStarter = {
        name: starter.name,
        team: away,
        wins: starter.wins,
        losses: starter.losses,
        winningPct: starter.wins + starter.losses > 0 ? starter.wins / (starter.wins + starter.losses) : 0.5,
        era: starter.era,
        innings: starter.innings,
        whip: starter.whip,
        strikeouts: starter.strikeouts,
        recentEra: Math.max(1.5, parseFloat((starter.era * 0.9).toFixed(2))), // 최근 3경기 가상 ERA 보정
        recentGames: 3
      };
    }

    // Home Starter
    let homeStarter: PitcherStats | null = null;
    if (homeProfile && homeProfile.starters && homeProfile.starters.length > 0) {
      const idx = (dateNum + 1) % homeProfile.starters.length; // 홈 원정 선발 다변화
      const starter = homeProfile.starters[idx];
      homeStarter = {
        name: starter.name,
        team: home,
        wins: starter.wins,
        losses: starter.losses,
        winningPct: starter.wins + starter.losses > 0 ? starter.wins / (starter.wins + starter.losses) : 0.5,
        era: starter.era,
        innings: starter.innings,
        whip: starter.whip,
        strikeouts: starter.strikeouts,
        recentEra: Math.max(1.5, parseFloat((starter.era * 0.95).toFixed(2))),
        recentGames: 3
      };
    }

    // 2. 라인업 추출 (프로필에 정의된 9명 타자 매핑)
    const awayLineup: BatterLineup[] = [];
    if (awayProfile && awayProfile.batters) {
      awayProfile.batters.forEach((b, i) => {
        awayLineup.push({
          battingOrder: i + 1,
          position: b.position,
          name: b.name,
          battingAvg: b.battingAvg,
          obp: b.obp,
          slg: b.slg,
          ops: b.ops,
          isConfirmed: false // 아직 라인업 공식 발표 전이므로 예상 라인업
        });
      });
    }

    const homeLineup: BatterLineup[] = [];
    if (homeProfile && homeProfile.batters) {
      homeProfile.batters.forEach((b, i) => {
        homeLineup.push({
          battingOrder: i + 1,
          position: b.position,
          name: b.name,
          battingAvg: b.battingAvg,
          obp: b.obp,
          slg: b.slg,
          ops: b.ops,
          isConfirmed: false
        });
      });
    }

    // 3. 예측 승률 산출
    let prediction: GamePrediction | null = null;
    if (status !== '우천취소' && status !== '취소') {
      prediction = generatePrediction(
        away,
        home,
        stadium,
        standings,
        completed,
        awayStarter || undefined,
        homeStarter || undefined,
        awayLineup,
        homeLineup
      );
    }

    return {
      gameId,
      date: g.date,
      time: g.time || '18:30',
      stadium,
      awayTeam: away,
      homeTeam: home,
      status,
      awayStarter,
      homeStarter,
      awayLineup,
      homeLineup,
      prediction,
      updatedAt
    };
  });

  return todayGamesList;
}
