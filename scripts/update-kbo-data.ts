/**
 * @file update-kbo-data.ts
 * @description KBO 순위 및 일정 데이터를 수집하여 public/data/ 폴더에 정적 JSON 파일로 저장하는 스크립트입니다.
 * 이 스크립트는 GitHub Actions 또는 로컬 명령어를 통해 예약된 주기에 실행됩니다.
 * 수집 실패 시 이전의 성공 데이터 캐시를 재활용하여 Vercel App의 무중단 가동을 보장합니다.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getBestAvailableStandings, getBestAvailableSchedule } from '../src/lib/kbo/sources/sourceManager';
import { KBOGame } from '../src/types';
import { CONFIG } from '../src/config';
import { generateRemainingGamesFromStandings } from '../src/lib/simulation/generateRemainingGamesFromStandings';

/**
 * 한국 시간(KST) 기준 YYYY-MM-DD 날짜 반환
 */
function getKstDateString(): string {
  const d = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(d.getTime() + kstOffset);
  return kstDate.toISOString().split('T')[0];
}

/**
 * 한국 시간(KST) 기준 ISO 문자열 반환
 */
function getKstIsoString(): string {
  const d = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(d.getTime() + kstOffset);
  return kstDate.toISOString();
}

/**
 * @function normalizeKboSnapshot
 * @description 수집되거나 로드된 KBO 데이터를 정규화하여 정합성을 보장하고, 정합성이 맞지 않는 경우 순위표 기반 경기 보정기를 실행합니다.
 */
function normalizeKboSnapshot(rawData: any, fetchedAt: string): any {
  console.log('[update-kbo-data] [CALL] normalizeKboSnapshot - Normalizing KBO snapshot.');
  const standings = rawData.standings || [];
  
  // Calculate completed games from standings
  const totalTeamGames = standings.reduce((sum: number, t: any) => sum + (t.wins + t.losses + t.draws), 0);
  const standingsCompletedGames = totalTeamGames / 2;
  
  // Calculate expected remaining games by standings
  const expectedRemainingTeamGames = standings.reduce((sum: number, t: any) => sum + Math.max(0, 144 - (t.wins + t.losses + t.draws)), 0);
  const expectedRemainingGamesByStandings = expectedRemainingTeamGames / 2;
  
  const completedGames = rawData.completedGames || [];
  let remainingGames = rawData.remainingGames || [];
  const scheduleCompletedGames = completedGames.length;
  
  // Calculate team remaining counts
  const teamRemainingCounts: Record<string, number> = {};
  standings.forEach((t: any) => {
    teamRemainingCounts[t.team] = 0;
  });
  remainingGames.forEach((g: any) => {
    if (teamRemainingCounts[g.away] !== undefined) teamRemainingCounts[g.away]++;
    if (teamRemainingCounts[g.home] !== undefined) teamRemainingCounts[g.home]++;
  });

  let maxDiscrepancy = 0;
  standings.forEach((t: any) => {
    const expected = Math.max(0, 144 - (t.wins + t.losses + t.draws));
    const actual = teamRemainingCounts[t.team] || 0;
    const diff = Math.abs(expected - actual);
    if (diff > maxDiscrepancy) {
      maxDiscrepancy = diff;
    }
  });

  const isScheduleConsistentWithStandings = 
    Math.abs(scheduleCompletedGames - standingsCompletedGames) <= 2 && 
    maxDiscrepancy <= 1;

  let scheduleSource = rawData.scheduleSource || 'bundled-fallback';
  let scheduleSourceLabel = rawData.scheduleSourceLabel || '번들 로컬 예비 일정';
  let warnings = [...(rawData.warnings || [])];

  // If the schedule is not consistent, regenerate remaining games using the standings-based generator!
  if (!isScheduleConsistentWithStandings) {
    console.log('[update-kbo-data] 정합성 불일치 감지. generateRemainingGamesFromStandings를 사용해 보정 일정을 생성합니다.');
    const generatedRemaining = generateRemainingGamesFromStandings(standings, rawData.asOfDate || getKstDateString());
    remainingGames = generatedRemaining;
    scheduleSource = 'generated-from-standings';
    scheduleSourceLabel = '순위표 기준 144경기 보정 일정';
    if (!warnings.includes('일정 데이터 정합성 불일치로 인해 순위표 기준 144경기 자동 보정 일정을 생성하여 적용했습니다.')) {
      warnings.push('일정 데이터 정합성 불일치로 인해 순위표 기준 144경기 자동 보정 일정을 생성하여 적용했습니다.');
    }
  }

  const scheduleRemainingGames = remainingGames.length;
  const syntheticGameCount = remainingGames.filter((g: any) => g.synthetic).length;

  return {
    asOfDate: rawData.asOfDate || getKstDateString(),
    fetchedAt,
    standingsSource: rawData.standingsSource || rawData.primarySource || 'official-kbo-en',
    standingsSourceLabel: rawData.standingsSourceLabel || rawData.sourceLabel || 'KBO 공식 영문 순위 데이터',
    scheduleSource,
    scheduleSourceLabel,
    primarySource: 'static-json',
    sourceLabel: '예약 수집 JSON 데이터',
    standings,
    remainingGames,
    completedGames,
    failedSources: rawData.failedSources || [],
    warnings,
    dataQuality: {
      standingsCompletedGames,
      scheduleCompletedGames,
      scheduleRemainingGames,
      expectedRemainingGamesByStandings,
      syntheticGameCount,
      isScheduleConsistentWithStandings,
    }
  };
}

/**
 * @function runHarvester
 * @description 다중 소스 수집 엔진을 작동하고 수집 성과를 정적 JSON 저장소에 기록합니다.
 */
async function runHarvester() {
  console.log('[update-kbo-data] [CALL] runHarvester - KBO 정적 데이터 수집 시작.');
  const dataDir = path.join(process.cwd(), 'public', 'data');
  const latestJsonPath = path.join(dataDir, 'kbo-latest.json');
  const statusJsonPath = path.join(dataDir, 'kbo-source-status.json');

  // 디렉토리가 없다면 생성
  if (!fs.existsSync(dataDir)) {
    console.log(`[update-kbo-data] 데이터 폴더 생성 중: ${dataDir}`);
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const kstToday = getKstDateString();
  const fetchedAt = getKstIsoString();

  let standingsResult;
  let scheduleResult;

  try {
    // 1단계: 순위 데이터 수집
    console.log('[update-kbo-data] 1단계: KBO 순위 데이터 수집 시도...');
    standingsResult = await getBestAvailableStandings(kstToday);

    // 2단계: 일정 데이터 수집
    console.log('[update-kbo-data] 2단계: KBO 일정 데이터 수집 시도...');
    scheduleResult = await getBestAvailableSchedule(kstToday);
  } catch (err: any) {
    console.error(`[update-kbo-data] 데이터 수집 중 치명적 오류 발생: ${err.message}`);
  }

  // failedSources 수집
  const failedSources = [
    ...(standingsResult?.failedSources || []),
    ...(scheduleResult?.failedSources || []),
  ];
  // 중복 소스 ID 제거
  const uniqueFailed = failedSources.filter(
    (item, index, self) => self.findIndex(t => t.source === item.source) === index
  );

  const warnings: string[] = [];
  if (standingsResult?.warnings) warnings.push(...standingsResult.warnings);
  if (scheduleResult?.warnings) warnings.push(...scheduleResult.warnings);

  // 모든 외부 수집이 실패해서 bundled-fallback으로 떨어졌는지 판단
  const isStandingsFallback = !standingsResult || standingsResult.source === 'bundled-fallback';
  const isScheduleFallback = !scheduleResult || scheduleResult.source === 'bundled-fallback';
  const allRemoteFailed = isStandingsFallback && isScheduleFallback;

  // 기존 캐시 파일 존재 여부 확인
  const latestExists = fs.existsSync(latestJsonPath);

  let finalData: any = null;

  if (allRemoteFailed && latestExists) {
    // [4순위] 모든 외부 수집 실패 시 기존 kbo-latest.json 파일의 내용을 유지/재활용합니다.
    console.log('[update-kbo-data] [SAVE_PATH 4] 모든 외부 소스 수집 실패. 기존 kbo-latest.json 데이터를 보존합니다.');
    try {
      const existingRaw = fs.readFileSync(latestJsonPath, 'utf-8');
      const existingData = JSON.parse(existingRaw);
      
      const normalized = normalizeKboSnapshot(existingData, fetchedAt);
      normalized.warnings = [
        '새로운 실시간 원격 수집 시도가 실패하여, 직전에 성공적으로 수집되었던 로컬 캐시 데이터를 유지하고 있습니다.',
        ...(normalized.warnings || [])
      ];
      normalized.failedSources = uniqueFailed;
      
      finalData = normalized;
    } catch (parseErr) {
      console.error('[update-kbo-data] 기존 kbo-latest.json 파싱 실패:', parseErr);
    }
  }

  // 만약 수집이 정상 완료되었거나, 실패했으나 기존 kbo-latest.json이 없는 경우 신규 데이터셋 생성
  if (!finalData) {
    const standingsList = (standingsResult?.teams || []).map(t => {
      const wins = t.wins ?? 0;
      const losses = t.losses ?? 0;
      const draws = t.draws ?? 0;
      const games = wins + losses + draws;
      return {
        team: t.team,
        displayName: t.displayName || t.nameKo || CONFIG.TEAMS[t.team as keyof typeof CONFIG.TEAMS]?.nameKo || t.team,
        games,
        wins,
        losses,
        draws,
        winRate: t.winRate,
        rank: t.rank,
      };
    });

    const allGames: KBOGame[] = scheduleResult?.games || [];
    const completedGames = allGames.filter(g => g.status === 'completed');
    const remainingGames = allGames.filter(g => g.status !== 'completed');

    const freshRawData = {
      asOfDate: kstToday,
      fetchedAt,
      standingsSource: standingsResult?.source || 'bundled-fallback',
      standingsSourceLabel: standingsResult?.sourceLabel || '번들 로컬 예비 순위표',
      scheduleSource: scheduleResult?.source || 'bundled-fallback',
      scheduleSourceLabel: scheduleResult?.sourceLabel || '번들 로컬 예비 일정',
      primarySource: standingsResult?.source || 'bundled-fallback',
      sourceLabel: standingsResult?.sourceLabel || '번들 로컬 예비 순위표',
      standings: standingsList,
      remainingGames,
      completedGames,
      failedSources: uniqueFailed,
      warnings,
    };

    finalData = normalizeKboSnapshot(freshRawData, fetchedAt);
  }

  // 1. kbo-latest.json 저장
  console.log(`[update-kbo-data] kbo-latest.json 저장 중 -> ${latestJsonPath}`);
  fs.writeFileSync(latestJsonPath, JSON.stringify(finalData, null, 2), 'utf-8');

  // 2. kbo-YYYY-MM-DD.json 저장
  const dateJsonPath = path.join(dataDir, `kbo-${kstToday}.json`);
  console.log(`[update-kbo-data] 날짜별 백업 kbo-${kstToday}.json 저장 중 -> ${dateJsonPath}`);
  fs.writeFileSync(dateJsonPath, JSON.stringify(finalData, null, 2), 'utf-8');

  // 3. kbo-source-status.json 상태 보고 파일 저장
  const statusData = {
    lastUpdateAttempt: fetchedAt,
    lastSuccess: finalData.primarySource !== 'bundled-fallback' ? fetchedAt : (latestExists ? fetchedAt : null),
    status: finalData.primarySource === 'bundled-fallback' && !latestExists ? 'failed_fallback' : 'success',
    primarySource: finalData.primarySource,
    sourceLabel: finalData.sourceLabel,
    failedSources: uniqueFailed,
    warnings: finalData.warnings,
  };
  console.log(`[update-kbo-data] 상태 파일 kbo-source-status.json 저장 중 -> ${statusJsonPath}`);
  fs.writeFileSync(statusJsonPath, JSON.stringify(statusData, null, 2), 'utf-8');

  console.log('[update-kbo-data] 수집 작업 완료!');
}

runHarvester().catch(err => {
  console.error('[update-kbo-data] 수집 스크립트 도중 예외 발생:', err);
  // 전체 워크플로우를 강제 실패시키지 않고 경고만 남기기 위해 프로세스를 0(성공)으로 정상 마무리합니다.
  process.exit(0);
});
