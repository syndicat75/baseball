/**
 * @file simulate.ts
 * @description KBO 가을야구 진출 확률을 연산하는 몬테카를로 시뮬레이션 엔드포인트입니다.
 * 정적 JSON 파일뿐만 아니라, 실시간 API 수집 데이터를 활용하여 완벽한 실시간 가을야구 진출 확률을 연산합니다.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { simulateSeason } from '../src/lib/simulation/simulateSeason';
import { getStandingsData, getTodayGamesData } from '../src/lib/kbo/kboDataService';
import { ProbabilityModelType, KBOGame, KBOStandingsResult } from '../src/types';
import { getKoreaTodayString } from '../src/lib/kbo/dateUtils';
import { getEstimatedHeadToHead } from '../src/lib/kbo/sources/sourceManager';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { date, iterations, model, seed } = req.query;
  console.log(`[api/simulate] [CALL] handler - date: "${date}", iterations: "${iterations}", model: "${model}", seed: "${seed}"`);

  const todayStr = getKoreaTodayString();
  const targetDate = (date as string) || todayStr;

  let requestedIters = parseInt(iterations as string) || 10000;
  let iters = requestedIters;
  const warnings: string[] = [];

  // Vercel Serverless 안정성을 위해 루프 횟수 제한 적용
  if (iters > 10000) {
    iters = 10000;
    warnings.push(`안정성을 위해 ${requestedIters.toLocaleString()}회 시뮬레이션 요청이 10,000회 연산으로 조정되었습니다.`);
  }

  const modelType = (model as ProbabilityModelType) || 'winRate';
  const randSeed = seed ? parseInt(seed as string) : 42;

  try {
    // 1. 실시간 최신 순위 정보 수집
    const standingsRes = await getStandingsData(false);
    if (!standingsRes.success || !standingsRes.standings || standingsRes.standings.length !== 10) {
      throw new Error(`순위표 데이터를 확보할 수 없습니다 (이유: ${standingsRes.message || '데이터 규격 미달'}).`);
    }

    // 2. 실시간 최신 경기 일정 및 결과 수집
    const gamesRes = await getTodayGamesData(targetDate, false);
    if (!gamesRes.success) {
      throw new Error(`경기 일정표를 불러오지 못했습니다 (이유: ${gamesRes.error || '일정 수집 차단'}).`);
    }

    const allGames = gamesRes.games || [];
    const unresolvedGames = allGames.filter((g: any) => g.status === '예정');

    // 3. 시뮬레이션용 데이터 구조 복원
    // standings 데이터를 KBOTeam standings 양식에 매치시킵니다.
    const mappedTeams = standingsRes.standings.map((t: any) => ({
      team: t.team,
      nameKo: t.nameKo || t.team,
      games: t.games,
      wins: t.wins,
      losses: t.losses,
      draws: t.draws,
      winRate: t.winningPct,
      rank: t.rank,
    }));

    const headToHead = getEstimatedHeadToHead(standingsRes.standings as any);
    
    const standingsResult: KBOStandingsResult = {
      asOfDate: targetDate,
      source: standingsRes.source,
      teams: mappedTeams,
      headToHead,
    };

    // 4. 시뮬레이션 수행
    console.log(`[api/simulate] 몬테카를로 시뮬레이션 연산 작동 (반복: ${iters}회, 모델: ${modelType})`);
    
    // KBOGame 포맷으로 복원
    const kboGamesMapped: any[] = allGames.map((g: any) => ({
      id: g.gameId,
      date: g.date,
      time: g.time,
      away: g.awayTeam,
      home: g.homeTeam,
      awayScore: g.awayScore,
      homeScore: g.homeScore,
      status: g.status === '종료' ? 'completed' : g.status === '우천취소' ? 'postponed' : 'scheduled',
      stadium: g.stadium
    }));

    const simResults = await simulateSeason(
      standingsResult,
      kboGamesMapped as KBOGame[],
      (kboGamesMapped as KBOGame[]).filter((g: any) => g.status === 'scheduled'),
      {
        date: targetDate,
        iterations: iters,
        model: modelType,
        seed: randSeed,
      }
    );

    const responseBody = {
      ...simResults,
      unresolvedGames: kboGamesMapped.filter((g: any) => g.status === 'scheduled'),
      source: 'static-json',
      sourceLabel: '실시간 분석 시뮬레이션 데이터',
      originalSource: standingsRes.source,
      originalSourceLabel: standingsRes.sourceLabel,
      fetchedAt: standingsRes.updatedAt,
      warnings,
    };

    console.log('[api/simulate] 시뮬레이션 완료. 응답을 정상 전달합니다.');
    return res.status(200).json(responseBody);

  } catch (error: any) {
    console.error('[api/simulate] 시뮬레이션 도중 치명적 에러 발생:', error);
    return res.status(200).json({
      success: false,
      error: 'SIMULATION_FAILED',
      message: '실시간 데이터를 바탕으로 몬테카를로 가을야구 시뮬레이션을 가동하는 과정에서 오류가 발생했습니다.',
      details: error.message || String(error),
      updatedAt: new Date().toISOString()
    });
  }
}
