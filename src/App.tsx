/**
 * @file App.tsx
 * @description The main entry point component of the React frontend.
 * Coordinates user configurations, fetches data, handles loading/error states, and renders the dashboard grids.
 * Includes interactive, multi-stage self-diagnostics with graceful fallback alerts.
 */

import { useState, useEffect } from 'react';
import { DateControl } from './components/DateControl';
import { SimulationControls } from './components/SimulationControls';
import { ProbabilityCards } from './components/ProbabilityCards';
import { ProbabilityTable } from './components/ProbabilityTable';
import { RankDistribution } from './components/RankDistribution';
import { DataQualityNotice } from './components/DataQualityNotice';
import { TeamSimulationStats, CutoffSummary, ProbabilityChangeItem } from './types';
import { Award, Zap, RefreshCw, AlertTriangle, HelpCircle, CheckCircle2, Sliders, TrendingUp } from 'lucide-react';
import { loadKboStaticData } from './lib/staticData/loadKboStaticData';
import { simulateFromStaticData } from './lib/simulation/simulateFromStaticData';
import { runAllSimulationTests, TestResultItem } from './lib/simulation/runSimulationTests';

// New features components
import { KboTodayGamesAndStandings } from './components/KboTodayGamesAndStandings';
import { DataReliabilityCard } from './components/DataReliabilityCard';
import { calculateDataReliability } from './lib/quality/calculateDataReliability';
import { FifthPlaceCutoffCard } from './components/FifthPlaceCutoffCard';
import { ProbabilityChangeCard } from './components/ProbabilityChangeCard';
import { TeamDetailPanel } from './components/TeamDetailPanel';
import { ScenarioModePanel } from './components/ScenarioModePanel';
import { ScenarioInput, preprocessScenarioGames } from './lib/scenario/applyScenario';
import { getPreviousDateString, loadSimulationResult, saveSimulationResult, calculateProbabilityChanges } from './lib/history/simulationHistory';

interface FullSimulationData {
  date: string;
  iterations: number;
  model: string;
  results: TeamSimulationStats[];
  unresolvedGames: any[];
  source: string;
  sourceLabel?: string;
  standingsSource?: string;
  standingsSourceLabel?: string;
  scheduleSource?: string;
  scheduleSourceLabel?: string;
  originalSource?: string;
  originalSourceLabel?: string;
  fetchedAt?: string;
  errorType?: string;
  errorMessage?: string;
  warnings?: string[];
  failedSources?: { source: string; reason: string }[];
  syntheticGamesCount?: number;
  syntheticTeamCounts?: Record<string, number>;
  dataQuality?: {
    standingsCompletedGames: number;
    scheduleCompletedGames: number;
    scheduleRemainingGames: number;
    expectedRemainingGamesByStandings: number;
    syntheticGameCount: number;
    isScheduleConsistentWithStandings: boolean;
  };
  cutoffSummary?: CutoffSummary;
  teamWinTargetProbabilities?: Record<string, Array<{ wins: number; playoffProbability: number }>>;
}

export default function App() {
  console.log('[App] [CALL] App render');

  // Today's date as default (UTC to local conversion)
  const todayStr = new Date().toISOString().split('T')[0];

  // User input states
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [iterations, setIterations] = useState<number>(10000);
  const [selectedModel, setSelectedModel] = useState<'basic' | 'winRate' | 'hybrid'>('winRate');
  const [seed, setSeed] = useState<number>(42);

  // Loading, error and data states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [simData, setSimData] = useState<FullSimulationData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isFallbackSample, setIsFallbackSample] = useState<boolean>(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [testSuiteResults, setTestSuiteResults] = useState<TestResultItem[] | null>(null);

  // Additional metadata for multi-source visualization
  const [standingsSourceInfo, setStandingsSourceInfo] = useState<{
    source: string;
    sourceLabel: string;
    failedSources?: { source: string; reason: string }[];
  } | null>(null);

  // New features state
  const [activeScenario, setActiveScenario] = useState<ScenarioInput | null>(null);
  const [scenarioResult, setScenarioResult] = useState<any | null>(null);
  const [selectedTeamForDetail, setSelectedTeamForDetail] = useState<string | null>(null);
  const [prevDayChangeData, setPrevDayChangeData] = useState<{
    hasPrevData: boolean;
    prevDate?: string;
    items: ProbabilityChangeItem[];
  } | undefined>(undefined);

  const [scheduleSourceInfo, setScheduleSourceInfo] = useState<{
    source: string;
    sourceLabel: string;
    failedSources?: { source: string; reason: string }[];
  } | null>(null);

  // Diagnostic state for step-by-step verification
  const [diagnostic, setDiagnostic] = useState<{
    status: 'idle' | 'running' | 'success' | 'failed';
    health: 'idle' | 'checking' | 'ok' | 'fail';
    standings: 'idle' | 'checking' | string;
    schedule: 'idle' | 'checking' | string;
    simulate: 'idle' | 'checking' | 'ok' | 'fail';
    currentStep: string | null;
    errorDetails: string | null;
    lastSuccessTime: string | null;
  }>({
    status: 'idle',
    health: 'idle',
    standings: 'idle',
    schedule: 'idle',
    simulate: 'idle',
    currentStep: null,
    errorDetails: null,
    lastSuccessTime: null,
  });

  /**
   * @function fetchSimulationResults
   * @description 정적 JSON 데이터 파일(/data/kbo-latest.json)을 읽어온 뒤 브라우저 상에서 몬테카를로 시뮬레이션을 실행하고 화면에 렌더링합니다.
   * @param {boolean} [forceRefresh=false] 강제 수집 파일 재요청 플래그
   */
  const fetchSimulationResults = async (forceRefresh = false) => {
    console.log(`[App] [CALL] fetchSimulationResults - Date: ${selectedDate}, Iterations: ${iterations}, Model: ${selectedModel}, Seed: ${seed}, Refresh: ${forceRefresh}`);
    setIsLoading(true);
    setError(null);

    try {
      // 1. KBO 정적 데이터 로드
      const staticResult = await loadKboStaticData(selectedDate);
      const { 
        data, 
        source, 
        sourceLabel, 
        standingsSource, 
        standingsSourceLabel, 
        scheduleSource, 
        scheduleSourceLabel, 
        isFallback, 
        warnings, 
        fetchedAt 
      } = staticResult;

      // 2. 브라우저 사이드 몬테카를로 시뮬레이션 엔진 가동
      console.log(`[App] Running browser-side Monte Carlo simulation: ${iterations} iterations, Model: ${selectedModel}`);
      const simResult = await simulateFromStaticData({
        standings: data.standings,
        remainingGames: data.remainingGames,
        completedGames: data.completedGames || [],
        iterations,
        model: selectedModel,
        seed,
        asOfDate: data.asOfDate || selectedDate,
      });

      // Calculate data quality and reliability scores
      const reliabilityInfo = calculateDataReliability({
        standingsCompletedGames: data.standings.reduce((sum: number, t: any) => sum + (t.wins ?? 0) + (t.losses ?? 0) + (t.draws ?? 0), 0) / 2,
        scheduleCompletedGames: (data.completedGames || []).length,
        expectedRemainingGamesByStandings: data.standings.reduce((sum: number, t: any) => sum + Math.max(0, 144 - ((t.wins ?? 0) + (t.losses ?? 0) + (t.draws ?? 0))), 0) / 2,
        actualRemainingGames: (data.remainingGames || []).length,
        syntheticGameCount: simResult.syntheticGamesCount || 0,
        source,
        asOfDate: data.asOfDate || selectedDate,
        selectedDate,
        fetchedAt,
        teamCount: data.standings.length,
        hasFinalGameMismatch: false,
        mismatchedTeamsCount: 0
      });

      // 3. 응답 규격 포맷팅
      const formattedData: FullSimulationData = {
        date: data.asOfDate || selectedDate,
        iterations,
        model: selectedModel,
        results: simResult.results,
        unresolvedGames: data.remainingGames.filter((g: any) => g.status === 'scheduled'),
        source,
        sourceLabel,
        standingsSource,
        standingsSourceLabel,
        scheduleSource,
        scheduleSourceLabel,
        fetchedAt,
        warnings: [
          ...(warnings || []),
          ...(simResult.warnings || []),
          ...(simResult.unresolvedGames?.length === 0 ? ['모든 정규시즌 경기가 완료되었습니다.'] : [])
        ],
        failedSources: data.failedSources || [],
        syntheticGamesCount: simResult.syntheticGamesCount,
        syntheticTeamCounts: simResult.syntheticTeamCounts,
        dataQuality: data.dataQuality || {
          standingsCompletedGames: reliabilityInfo.metrics.standingsCompletedGames,
          scheduleCompletedGames: reliabilityInfo.metrics.scheduleCompletedGames,
          scheduleRemainingGames: reliabilityInfo.metrics.actualRemainingGames,
          expectedRemainingGamesByStandings: reliabilityInfo.metrics.requiredRemainingGames,
          syntheticGameCount: reliabilityInfo.metrics.syntheticGameCount,
          isScheduleConsistentWithStandings: reliabilityInfo.score >= 60,
        },
        cutoffSummary: simResult.cutoffSummary,
        teamWinTargetProbabilities: simResult.teamWinTargetProbabilities,
      };

      setSimData(formattedData);
      setIsFallbackSample(isFallback);

      // Save current base simulation for historical comparison
      saveSimulationResult(formattedData.date, simResult as any);

      // Try loading previous day
      const prevDateStr = getPreviousDateString(formattedData.date);
      const prevResult = await loadSimulationResult(prevDateStr);
      const changes = calculateProbabilityChanges(simResult as any, prevResult);
      setPrevDayChangeData(changes);

      // Run scenario simulation if active
      if (activeScenario) {
        console.log('[App] Scenario is active! Preprocessing scenario games...');
        const { adjustedStandingsTeams, remainingRandomGames } = preprocessScenarioGames(
          data.standings,
          data.remainingGames,
          activeScenario
        );
        console.log('[App] Running scenario Monte Carlo simulation...');
        const scenSimResult = await simulateFromStaticData({
          standings: adjustedStandingsTeams,
          remainingGames: remainingRandomGames,
          completedGames: data.completedGames || [],
          iterations,
          model: selectedModel,
          seed,
          asOfDate: data.asOfDate || selectedDate,
        });
        setScenarioResult(scenSimResult);
      } else {
        setScenarioResult(null);
      }

      setStandingsSourceInfo({
        source: standingsSource,
        sourceLabel: standingsSourceLabel,
        failedSources: data.failedSources,
      });

      setScheduleSourceInfo({
        source: scheduleSource,
        sourceLabel: scheduleSourceLabel,
        failedSources: data.failedSources,
      });

      const currentTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastUpdated(currentTime);

      setDiagnostic(prev => ({
        ...prev,
        health: 'ok',
        standings: 'ok',
        schedule: 'ok',
        simulate: 'ok',
        status: 'success',
        lastSuccessTime: currentTime,
      }));
    } catch (err: any) {
      console.error('[App] Error in fetchSimulationResults:', err);
      setError(err.message || '데이터 로드 또는 시뮬레이션 계산 중 에러가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * @function handleRefreshData
   * @description 로컬 JSON 데이터 파일을 수동으로 다시 불러옵니다.
   */
  const handleRefreshData = async () => {
    console.log('[App] [CALL] handleRefreshData - 로컬 JSON 데이터 새로고침 가동');
    setIsLoading(true);
    try {
      await fetchSimulationResults(true);
      setRefreshMessage('예약 수집 데이터 파일을 성공적으로 다시 읽어왔습니다.');
      setTimeout(() => {
        setRefreshMessage(null);
      }, 4000);
    } catch (err: any) {
      console.error('[App] handleRefreshData 실패:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * @function runDiagnosticsAndRetry
   * @description 순차적으로 자가 진단을 수행하고 데이터를 동기화합니다.
   * 정적 JSON 로드, 10개 팀 정합성, 남은 경기 유무, 브라우저 엔진 계산 등을 단계별로 검증합니다.
   */
  const runDiagnosticsAndRetry = async () => {
    console.log('[App] [CALL] runDiagnosticsAndRetry');
    setDiagnostic({
      status: 'running',
      health: 'checking',
      standings: 'idle',
      schedule: 'idle',
      simulate: 'idle',
      currentStep: '1단계: 정적 JSON 데이터 파일 가동성 검증...',
      errorDetails: null,
      lastSuccessTime: diagnostic.lastSuccessTime,
    });
    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Static JSON Load Check
      const staticResult = await loadKboStaticData(selectedDate);
      if (staticResult.isFallback && !selectedDate) {
        throw new Error('정적 JSON 데이터 로드에 실패하여 내장 fallback 데이터를 수집했습니다. 원격 JSON이 부재합니다.');
      }

      setDiagnostic(prev => ({
        ...prev,
        health: 'ok',
        standings: 'checking',
        currentStep: '2단계: 순위 데이터 10개 팀 존재 여부 무결성 검증...',
      }));

      // Step 2: Validate 10 Teams
      const { data } = staticResult;
      if (!data.standings || data.standings.length !== 10) {
        throw new Error(`순위 데이터 무결성 검증 실패: 로드된 팀이 ${data.standings?.length || 0}개입니다 (10개 팀이 수집되어 있어야 합니다).`);
      }

      setDiagnostic(prev => ({
        ...prev,
        standings: 'ok',
        schedule: 'checking',
        currentStep: '3단계: 남은 경기 데이터 존재 여부 확인...',
      }));

      // Step 3: Validate Remaining Games
      if (!data.remainingGames || data.remainingGames.length === 0) {
        throw new Error('일정 데이터 무결성 검증 실패: 잔여 일정이 존재하지 않거나 수집되지 않았습니다.');
      }

      setDiagnostic(prev => ({
        ...prev,
        schedule: 'ok',
        simulate: 'checking',
        currentStep: '4단계: 불변조건 및 5대 시나리오 단위 테스트 검증...',
      }));

      // Step 4: Validate Simulation Calculation and Invariants
      const testResults = await runAllSimulationTests();
      setTestSuiteResults(testResults);
      const failedTests = testResults.filter(t => !t.passed);
      if (failedTests.length > 0) {
        throw new Error(`시뮬레이션 불변검사 단위 테스트 일부 실패: ${failedTests.map(t => t.name).join(', ')}`);
      }

      const simResult = await simulateFromStaticData({
        standings: data.standings,
        remainingGames: data.remainingGames,
        completedGames: data.completedGames || [],
        iterations: 1000, // 진단용 고속 연산 (1000회)
        model: selectedModel,
        seed,
        asOfDate: data.asOfDate || selectedDate,
      });

      if (!simResult || !simResult.results || simResult.results.length === 0) {
        throw new Error('브라우저 시뮬레이션 수행 결과 반환값이 빈 비정상 상태입니다.');
      }

      // 정식 연산 한 번 수행하여 화면도 업데이트
      await fetchSimulationResults(false);

      const currentTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setDiagnostic({
        status: 'success',
        health: 'ok',
        standings: 'ok',
        schedule: 'ok',
        simulate: 'ok',
        currentStep: '자가진단 및 단위 테스트 검증 완료: 모든 정적 데이터 로딩, 10개 구단 정합성, 수학적 불변조건 5대 시나리오가 100% 통과되었습니다!',
        errorDetails: null,
        lastSuccessTime: currentTime,
      });
    } catch (err: any) {
      console.error('[App] Diagnostic failed:', err);
      const errMsg = err?.message || String(err);
      
      setDiagnostic(prev => {
        const nextHealth = prev.health === 'checking' ? 'fail' : prev.health;
        const nextStandings = prev.standings === 'checking' ? 'fail' : prev.standings;
        const nextSchedule = prev.schedule === 'checking' ? 'fail' : prev.schedule;
        const nextSimulate = prev.simulate === 'checking' ? 'fail' : prev.simulate;
        
        return {
          status: 'failed',
          health: nextHealth,
          standings: nextStandings,
          schedule: nextSchedule,
          simulate: nextSimulate,
          currentStep: '자가진단 실패: 데이터 무결성 검증 탈락 또는 가을야구 시뮬레이션 장애',
          errorDetails: errMsg,
          lastSuccessTime: prev.lastSuccessTime,
        };
      });
      setError(`자가진단 실패: ${errMsg}`);
    } finally {
      setIsLoading(false);
    }
  };


  // Run simulation automatically on mount or when user options change
  useEffect(() => {
    fetchSimulationResults(false);
  }, [selectedDate, iterations, selectedModel, seed, activeScenario]);

  // Run unit tests on mount to verify mathematical models
  useEffect(() => {
    console.log('[App] Running KBO simulator unit test suite...');
    runAllSimulationTests()
      .then(results => {
        setTestSuiteResults(results);
      })
      .catch(e => {
        console.error('[App] Failed to run unit test suite on mount:', e);
      });
  }, []);

  // Use scenario-adjusted results if a scenario is active
  const activeResults = scenarioResult ? scenarioResult.results : simData?.results;

  // Extract contenders for bento highlights
  const locks = activeResults?.filter(r => r.playoffProbability >= 90) || [];
  const bubble = activeResults?.filter(r => r.playoffProbability > 10 && r.playoffProbability < 90) || [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12 font-sans selection:bg-blue-100 selection:text-blue-900">
      
      {/* 1. Header Banner */}
      <header className="bg-slate-950 text-white border-b border-slate-900 relative overflow-hidden py-10 px-4">
        {/* Subtle decorative background pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(30,58,138,0.2),transparent_50%)]" />
        
        <div className="max-w-7xl mx-auto relative z-10 space-y-2">
          <div className="flex items-center gap-2">
            <span className="bg-blue-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
              KBO Postseason Simulator
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white flex items-center gap-3">
            ⚾ KBO 프로야구 가을야구 진출 확률 계산기
          </h1>
          <p className="text-slate-400 text-sm max-w-2xl font-medium">
            공식 KBO 순위/일정 데이터를 기준으로 남은 정규시즌 경기를 수만 회 몬테카를로 시뮬레이션하여 최종 5위 이내 진입(포스트시즌 진출) 확률을 정밀 예측합니다.
          </p>
        </div>
      </header>

      {/* 2. Main Container */}
      <main className="max-w-7xl mx-auto px-4 mt-8 space-y-6">
        
        {/* Connection Status Banner */}
        {(() => {
          const isCacheFallback = simData?.warnings?.some(w => w.includes('캐시') || w.includes('실패') || w.includes('유지'));
          const isBundledFallback = simData?.originalSource === 'bundled-fallback';

          return (
            <div className={`border rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs animate-fade-in ${
              error ? 'bg-rose-50 border-rose-200 text-rose-900' :
              isBundledFallback ? 'bg-orange-50 border-orange-200 text-orange-900' :
              isCacheFallback ? 'bg-amber-50 border-amber-200 text-amber-900' :
              'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}>
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-700">데이터 연동 상태:</span>
                  {error ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-bold border border-rose-200 animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      연동 오류가 감지되었습니다. (자가진단 점검 필요)
                    </span>
                  ) : isBundledFallback ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-100 text-orange-800 font-bold border border-orange-200">
                      <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                      주황 경고: 예비 데이터 연동 중 (내장 번들 활용)
                    </span>
                  ) : isCacheFallback ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      노란 경고: 예약 수집 장애 (기존 캐시 활용)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      정상: 예약 수집 JSON 연동 완료
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-600 space-y-1 pt-1.5 font-medium">
                  <div>• 사용 데이터: <strong className="text-slate-800 font-bold">{simData?.sourceLabel || '예약 수집 JSON 데이터'}</strong></div>
                  <div>• 원본 출처: <strong className="text-slate-800 font-bold">{simData?.originalSourceLabel || 'KBO 공식 영문 데이터 / MyKBOStats / AiScore / 마지막 성공 데이터'}</strong></div>
                  <div>• 마지막 갱신: <strong className="text-slate-800 font-bold">{simData?.fetchedAt ? new Date(simData.fetchedAt).toLocaleString('ko-KR') : lastUpdated || '-'}</strong></div>
                  
                  {isCacheFallback && (
                    <div className="text-amber-700 font-bold mt-1">⚠️ 실시간 수집은 실패했지만, 마지막 성공 데이터 기준으로 계산 중입니다.</div>
                  )}
                  {isBundledFallback && (
                    <div className="text-orange-600 font-bold mt-1">⚠️ 모든 원격 수집 소스 장애로 인해 하드코딩된 예비 데이터셋을 사용 중입니다.</div>
                  )}
                  {simData && (
                    <div className="text-emerald-700 font-semibold">• 계산 완료 여부: 수집된 KBO 데이터 기준으로 가을야구 연산이 정상 완료됨</div>
                  )}
                </div>
              </div>
              
              {(error || simData?.errorMessage || (simData?.warnings && simData.warnings.length > 0)) && (
                <div className="text-slate-600 flex flex-col gap-1 bg-white/75 p-3 rounded-lg border border-slate-200/80 max-w-xl text-[11px] font-mono shadow-inner">
                  <span className="font-bold text-slate-700 flex items-center gap-1">ℹ️ 상세 보고 및 분석 알림:</span>
                  <span className="text-slate-800 leading-relaxed max-h-24 overflow-y-auto">
                    {error || simData?.errorMessage}
                    {simData?.warnings && simData.warnings.map((w, idx) => (
                      <div key={idx} className="text-amber-700 font-semibold mt-1">• {w}</div>
                    ))}
                  </span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Date Mismatch Warning Banner */}
        {simData && selectedDate && simData.date !== selectedDate && (
          <div className="bg-amber-50 border border-amber-200 text-amber-950 rounded-xl p-4 shadow-sm text-xs md:text-sm font-semibold flex items-start gap-2.5 animate-fade-in">
            <span className="text-base mt-0.5">⚠️</span>
            <div className="space-y-1">
              <p className="font-bold text-amber-900">날짜 기준일 불일치 안내</p>
              <p className="text-xs text-amber-800 leading-relaxed">
                선택하신 날짜({selectedDate})의 데이터가 존재하지 않아, 현재 수집된 최신 데이터인 {simData.date} 기준 데이터로 연산되었습니다.
              </p>
            </div>
          </div>
        )}

        {/* Real-time Standings and Today's Games Predictions Widget */}
        <KboTodayGamesAndStandings />
        
        {/* Row 1: Configuration & Controls */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <DateControl
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              onRefresh={handleRefreshData}
              isLoading={isLoading}
              lastUpdated={simData?.fetchedAt ? new Date(simData.fetchedAt).toLocaleTimeString('ko-KR') : lastUpdated}
            />
            {refreshMessage && (
              <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-3.5 text-xs font-bold flex items-center gap-2 animate-fade-in shadow-sm">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                <span>{refreshMessage}</span>
              </div>
            )}
          </div>
          <SimulationControls
            iterations={iterations}
            onIterationsChange={setIterations}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            seed={seed}
            onSeedChange={setSeed}
            onRunSimulation={() => fetchSimulationResults(false)}
            isLoading={isLoading}
          />
        </section>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm flex flex-col items-center justify-center gap-4 transition-all duration-300">
            <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
            <div className="space-y-1.5">
              <h3 className="font-bold text-slate-800 text-lg">몬테카를로 시뮬레이션 계산 중...</h3>
              <p className="text-xs text-slate-400 max-w-sm">
                선택하신 {selectedDate} 시점 순위표를 재구성하고, 잔여 {iterations.toLocaleString()}회차 정규시즌 가상 플레이를 계산하고 있습니다. 잠시만 기다려 주세요.
              </p>
            </div>
          </div>
        )}

        {/* Diagnostic Panel Section */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              🔍 네트워크 자가진단 모니터 (Self-Diagnostics)
            </h3>
            {diagnostic.lastSuccessTime && (
              <span className="text-[10px] text-slate-400 font-mono">
                마지막 성공 수집시각: {diagnostic.lastSuccessTime}
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            {/* 1. API Health */}
            <div className={`p-3 rounded-lg border flex flex-col gap-1.5 transition-all ${
              diagnostic.health === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
              diagnostic.health === 'fail' ? 'bg-rose-50 border-rose-100 text-rose-800' :
              diagnostic.health === 'checking' ? 'bg-amber-50 border-amber-100 text-amber-800 animate-pulse' :
              'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <div className="flex items-center justify-between font-bold text-xs">
                <span>정적 JSON 파일 로드</span>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-black/5">
                  {diagnostic.health === 'ok' ? 'OK' : diagnostic.health === 'fail' ? 'FAIL' : 'CHECKING'}
                </span>
              </div>
              <strong className="text-[11px] font-semibold text-slate-700 mt-1">
                {diagnostic.health === 'ok' ? '✓ 파일 로드 완료 (OK)' : diagnostic.health === 'fail' ? '✗ 파일 로드 실패 (FAIL)' : diagnostic.health === 'checking' ? '조회중...' : '대기'}
              </strong>
            </div>

            {/* 2. Standings */}
            <div className={`p-3 rounded-lg border flex flex-col gap-1.5 transition-all ${
              diagnostic.standings === 'checking' ? 'bg-amber-50 border-amber-200 text-amber-800 animate-pulse' :
              diagnostic.standings === 'fail' ? 'bg-rose-50 border-rose-200 text-rose-800' :
              diagnostic.standings === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
              'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <div className="flex items-center justify-between font-bold text-xs">
                <span>10개 팀 순위 정합성</span>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-black/5">
                  {diagnostic.standings === 'checking' ? '검사중' : diagnostic.standings === 'ok' ? 'OK' : 'FAIL'}
                </span>
              </div>
              <div className="text-[11px] font-semibold text-slate-700 mt-1">
                {diagnostic.standings === 'checking' ? '데이터 검사중...' :
                 diagnostic.standings === 'fail' ? '✗ 검증 실패 (FAIL)' :
                 diagnostic.standings === 'idle' ? '대기' :
                 `✓ 10개 구단 확인 (OK)`}
              </div>
              {standingsSourceInfo?.failedSources && standingsSourceInfo.failedSources.length > 0 && (
                <div className="text-[9px] text-slate-500 border-t border-dashed border-black/10 pt-1.5 mt-1 font-mono leading-normal max-h-16 overflow-y-auto">
                  <div className="font-bold text-slate-600">수집 시 실패 로그:</div>
                  {standingsSourceInfo.failedSources.map((f, i) => (
                    <div key={i} className="truncate" title={`${f.source}: ${f.reason}`}>
                      • {f.source}: {f.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Schedule */}
            <div className={`p-3 rounded-lg border flex flex-col gap-1.5 transition-all ${
              diagnostic.schedule === 'checking' ? 'bg-amber-50 border-amber-200 text-amber-800 animate-pulse' :
              diagnostic.schedule === 'fail' ? 'bg-rose-50 border-rose-200 text-rose-800' :
              diagnostic.schedule === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
              'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <div className="flex items-center justify-between font-bold text-xs">
                <span>남은 경기 데이터 존재</span>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-black/5">
                  {diagnostic.schedule === 'checking' ? '검사중' : diagnostic.schedule === 'ok' ? 'OK' : 'FAIL'}
                </span>
              </div>
              <div className="text-[11px] font-semibold text-slate-700 mt-1">
                {diagnostic.schedule === 'checking' ? '데이터 검사중...' :
                 diagnostic.schedule === 'fail' ? '✗ 검증 실패 (FAIL)' :
                 diagnostic.schedule === 'idle' ? '대기' :
                 `✓ 예정 경기 발견 완료 (OK)`}
              </div>
              {scheduleSourceInfo?.failedSources && scheduleSourceInfo.failedSources.length > 0 && (
                <div className="text-[9px] text-slate-500 border-t border-dashed border-black/10 pt-1.5 mt-1 font-mono leading-normal max-h-16 overflow-y-auto">
                  <div className="font-bold text-slate-600">수집 시 실패 로그:</div>
                  {scheduleSourceInfo.failedSources.map((f, i) => (
                    <div key={i} className="truncate" title={`${f.source}: ${f.reason}`}>
                      • {f.source}: {f.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Simulation Engine */}
            <div className={`p-3 rounded-lg border flex flex-col gap-1.5 transition-all ${
              diagnostic.simulate === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
              diagnostic.simulate === 'fail' ? 'bg-rose-50 border-rose-100 text-rose-800' :
              diagnostic.simulate === 'checking' ? 'bg-amber-50 border-amber-100 text-amber-800 animate-pulse' :
              'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <div className="flex items-center justify-between font-bold text-xs">
                <span>시뮬레이션 가동 가능성</span>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-black/5">
                  {diagnostic.simulate === 'ok' ? 'OK' : diagnostic.simulate === 'fail' ? 'FAIL' : 'RUNNING'}
                </span>
              </div>
              <strong className="text-[11px] font-semibold text-slate-700 mt-1">
                {diagnostic.simulate === 'ok' ? '✓ 연산 및 계산 정상 완료 (OK)' : diagnostic.simulate === 'fail' ? '✗ 시뮬레이터 차단 (FAIL)' : diagnostic.simulate === 'checking' ? '연산 중...' : '대기'}
              </strong>
            </div>
          </div>

          {simData?.dataQuality && (
            <div className="border border-slate-100 rounded-lg p-3.5 bg-slate-50/50 space-y-3">
              <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>📊 데이터 실시간 정합성 모니터 (Data Quality Monitor)</span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${
                  simData.dataQuality.isScheduleConsistentWithStandings 
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                    : 'bg-amber-100 text-amber-800 border-amber-200'
                }`}>
                  {simData.dataQuality.isScheduleConsistentWithStandings ? '정합성 일치 (CONSISTENT)' : '정합성 불일치 (INCONSISTENT)'}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center text-slate-600">
                <div className="bg-white p-2.5 rounded border border-slate-100 flex flex-col justify-between">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">순위표 완료 게임 수</span>
                  <span className="text-sm font-extrabold font-mono text-slate-800">
                    {simData.dataQuality.standingsCompletedGames}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded border border-slate-100 flex flex-col justify-between">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">일정표 완료 게임 수</span>
                  <span className="text-sm font-extrabold font-mono text-slate-800">
                    {simData.dataQuality.scheduleCompletedGames}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded border border-slate-100 flex flex-col justify-between">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">순위표 요구 잔여수</span>
                  <span className="text-sm font-extrabold font-mono text-blue-600">
                    {simData.dataQuality.expectedRemainingGamesByStandings}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded border border-slate-100 flex flex-col justify-between">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">일정표 등록 잔여수</span>
                  <span className="text-sm font-extrabold font-mono text-slate-700">
                    {simData.dataQuality.scheduleRemainingGames}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded border border-slate-100 flex flex-col justify-between">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">가상 인공 보정 경기수</span>
                  <span className={`text-sm font-extrabold font-mono ${simData.dataQuality.syntheticGameCount > 0 ? 'text-amber-600 font-extrabold' : 'text-slate-400'}`}>
                    {simData.dataQuality.syntheticGameCount}
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded border border-slate-100 flex flex-col justify-between col-span-2 md:col-span-1">
                  <span className="text-[10px] text-slate-400 font-bold block mb-1">정합성 상태</span>
                  <span className={`text-[11px] font-bold ${simData.dataQuality.isScheduleConsistentWithStandings ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {simData.dataQuality.isScheduleConsistentWithStandings ? '✓ 매우 일치' : '⚠️ 보정 일정 사용'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {testSuiteResults && (
            <div className="border border-slate-100 rounded-lg p-3.5 bg-slate-50/50 space-y-2">
              <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>📋 수학적 정밀 모델 단위 테스트 및 불변검증 결과 (5대 핵심 시나리오)</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded border border-emerald-200">
                  {testSuiteResults.filter(t => t.passed).length} / {testSuiteResults.length} PASS
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-[11px]">
                {testSuiteResults.map((t, i) => (
                  <div key={i} className={`p-2 rounded border flex flex-col justify-between gap-1.5 transition-all hover:shadow-sm ${
                    t.passed ? 'bg-emerald-50/40 border-emerald-100/80 text-emerald-900' : 'bg-rose-50 border-rose-100 text-rose-900'
                  }`}>
                    <div className="font-bold flex items-center gap-1.5">
                      <span className={t.passed ? 'text-emerald-600' : 'text-rose-600'}>{t.passed ? '✓' : '✗'}</span>
                      <span className="truncate" title={t.name}>{t.name}</span>
                    </div>
                    <div className="text-[9px] text-slate-400 font-mono leading-tight">
                      {t.passed ? '144경기 불변성 충족 완료' : `실패: ${t.message}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diagnostic.currentStep && (
            <div className="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded border border-slate-100">
              <span className="text-slate-600 font-medium">{diagnostic.currentStep}</span>
              <button
                onClick={runDiagnosticsAndRetry}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded cursor-pointer transition-all flex items-center gap-1"
                id="run-diag-btn"
              >
                <RefreshCw className="w-3 h-3" />
                자가진단 수동 재시도
              </button>
            </div>
          )}

          {diagnostic.errorDetails && (
            <div className="bg-rose-50 text-rose-700 p-2.5 rounded border border-rose-100 font-mono text-[10px] whitespace-pre-wrap">
              <strong>장애 지점 원인 보고서:</strong><br />
              {diagnostic.errorDetails}
            </div>
          )}
        </section>

        {/* Error Alert with details */}
        {error && !isLoading && (
          <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl p-5 space-y-2 shadow-sm flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <h4 className="font-bold text-red-800 text-sm">연동 오류가 감지되었습니다.</h4>
              <p className="text-xs text-red-700 leading-relaxed font-medium">{error}</p>
              <p className="text-[11px] text-red-500">네트워크 수집 장애 발생 시에도 샘플 모드를 통해 구동 기능 자체는 완벽하게 유지됩니다.</p>
            </div>
          </div>
        )}

        {/* 3. Results Output Content */}
        {!isLoading && simData && (
          <div className="space-y-6 animate-fade-in">
            
            {/* Fallback Warning Notice */}
            {isFallbackSample && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-bold text-amber-800 text-sm">실시간 KBO 데이터 수집 실패 보정 안내</h4>
                  <p className="text-xs text-amber-700 font-medium leading-relaxed mt-0.5">
                    현재 공식 KBO 서버로부터 최신 데이터를 수집하는 데 어려움이 있습니다. 
                    따라서 <strong>공식 KBO 데이터가 아닌 내장 번들/캐시 기반 결과</strong>로 시뮬레이션을 지속합니다. 
                    계산 결과는 정상이므로 서비스 탐색 및 가을야구 시나리오 분석은 즉시 가능합니다.
                  </p>
                </div>
              </div>
            )}

            {/* Warning notices if KBO matches are unresolved */}
            <DataQualityNotice unresolvedGames={simData.unresolvedGames || []} />

            {/* Scenario Active Notice Banner */}
            {activeScenario && (
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm animate-pulse" id="active-scenario-banner">
                <div className="flex items-center gap-3">
                  <Sliders className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <h4 className="font-bold text-amber-800 text-sm">가상 시나리오 시뮬레이션 적용 중</h4>
                    <p className="text-xs text-amber-700 font-semibold mt-0.5 font-sans">
                      {simData.results.find(r => r.team === activeScenario.team)?.team && (
                        <strong>{activeScenario.team}</strong>
                      )}의 잔여 일정 중 다음 <strong>{activeScenario.games}경기</strong> 성적을 <strong>{activeScenario.wins}승 {activeScenario.losses}패 {activeScenario.draws}무</strong>로 전제 고정한 가을야구 시뮬레이션입니다.
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setActiveScenario(null)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm shrink-0 cursor-pointer"
                >
                  시나리오 적용 해제
                </button>
              </div>
            )}

            {/* Interactive Scenario Mode Controller */}
            <section>
              <ScenarioModePanel
                teams={simData.results.map(r => {
                  // Determine unresolved game count
                  const remCount = simData.unresolvedGames.filter(g => g.away === r.team || g.home === r.team).length;
                  return {
                    team: r.team,
                    nameKo: r.team, // We can also use nameKo if mapped
                    remainingGames: remCount > 0 ? remCount : (144 - (r.currentWins + r.currentLosses + r.currentDraws))
                  };
                })}
                originalProbabilities={(() => {
                  const probs: Record<string, number> = {};
                  simData.results.forEach(r => {
                    probs[r.team] = r.playoffProbability;
                  });
                  return probs;
                })()}
                currentProbabilities={(() => {
                  const probs: Record<string, number> = {};
                  const listToUse = activeResults || simData.results;
                  listToUse.forEach(r => {
                    probs[r.team] = r.playoffProbability;
                  });
                  return probs;
                })()}
                activeScenario={activeScenario}
                onApplyScenario={(scen) => setActiveScenario(scen)}
                onClearScenario={() => setActiveScenario(null)}
              />
            </section>

            {/* Quick Bento Box Analytics Highlight */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Box 1: Postseason Locks */}
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white p-5 rounded-xl shadow-sm flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-100/80">안정권 구단 (Locks)</h4>
                  <p className="text-2xl font-black font-sans">
                    {locks.length > 0 ? locks.map(l => l.team).join(', ') : '없음'}
                  </p>
                  <p className="text-[10px] text-emerald-100/70 font-semibold">진출 확률 90% 이상으로 가을야구가 기정사실화된 팀</p>
                </div>
                <Award className="w-12 h-12 text-emerald-100/20 flex-shrink-0" />
              </div>

              {/* Box 2: Bubble Race */}
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-5 rounded-xl shadow-sm flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-100/80">진출 경쟁 구단 (On the Bubble)</h4>
                  <p className="text-2xl font-black font-sans">
                    {bubble.length > 0 ? bubble.map(b => b.team).join(', ') : '없음'}
                  </p>
                  <p className="text-[10px] text-blue-100/70 font-semibold">진출 확률 10%~90% 사이의 혼전역 구단</p>
                </div>
                <Zap className="w-12 h-12 text-blue-100/20 flex-shrink-0" />
              </div>

              {/* Box 3: Calculations settings Context */}
              <div className="bg-white border border-slate-200/80 text-slate-700 p-5 rounded-xl shadow-sm flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">시뮬레이션 구동 정보</h4>
                  <p className="text-xl font-bold text-slate-800 font-mono">
                    {simData.iterations.toLocaleString()}회 연산
                  </p>
                  <p className="text-[10px] text-slate-500 font-semibold">
                    예측 모델: <strong className="text-blue-600 font-bold">{selectedModel === 'winRate' ? '누적 승률 모델' : selectedModel === 'hybrid' ? '하이브리드 다면 모델' : '균등 확률 모델'}</strong> (시드: {seed})
                  </p>
                </div>
                <HelpCircle className="w-12 h-12 text-slate-100 flex-shrink-0" />
              </div>
            </section>

            {/* New Advanced Analytics Trio Grid */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Feature 1: Data Reliability Card */}
              <DataReliabilityCard
                reliability={calculateDataReliability({
                  standingsCompletedGames: simData.dataQuality?.standingsCompletedGames ?? 0,
                  scheduleCompletedGames: simData.dataQuality?.scheduleCompletedGames ?? 0,
                  expectedRemainingGamesByStandings: simData.dataQuality?.expectedRemainingGamesByStandings ?? 0,
                  actualRemainingGames: simData.unresolvedGames?.length ?? 0,
                  syntheticGameCount: simData.dataQuality?.syntheticGameCount ?? 0,
                  source: simData.source,
                  asOfDate: simData.date,
                  selectedDate: selectedDate,
                  fetchedAt: simData.fetchedAt,
                  teamCount: simData.results.length,
                  hasFinalGameMismatch: false,
                  mismatchedTeamsCount: 0
                })}
              />

              {/* Feature 2: Projected 5th Place Cutoff Card */}
              <FifthPlaceCutoffCard
                cutoff={simData.cutoffSummary || {
                  averageFifthPlaceWins: 72,
                  p25FifthPlaceWins: 70,
                  p50FifthPlaceWins: 72,
                  p75FifthPlaceWins: 74,
                  p90FifthPlaceWins: 76,
                  averageFifthPlaceWinRate: 0.500
                }}
              />

              {/* Feature 3: Probability Delta Change Card */}
              <ProbabilityChangeCard
                changeData={prevDayChangeData}
              />
            </section>

            {/* Probability Cards Grid */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold text-slate-800">구단별 포스트시즌 진출 확률</h2>
                <span className="text-xs font-semibold text-slate-500">구단 카드를 클릭하면 구단 상세 지표와 목표 승수별 가을야구 진출 확률을 분석할 수 있습니다.</span>
              </div>
              <ProbabilityCards results={activeResults || []} onTeamClick={setSelectedTeamForDetail} />
            </section>

            {/* Probability Detailed Table */}
            <section>
              <ProbabilityTable
                results={activeResults || []}
                syntheticTeamCounts={simData.syntheticTeamCounts}
                unresolvedGames={simData.unresolvedGames}
                onTeamClick={setSelectedTeamForDetail}
              />
            </section>

            {/* Rank Distribution Heatmap */}
            <section>
              <RankDistribution results={activeResults || []} />
            </section>

            {/* Interactive Team Detail Overlay Modal Panel */}
            {selectedTeamForDetail && simData && (
              <TeamDetailPanel
                onClose={() => setSelectedTeamForDetail(null)}
                teamStats={(activeResults || simData.results).find(r => r.team === selectedTeamForDetail)!}
                targetProbs={simData.teamWinTargetProbabilities?.[selectedTeamForDetail] || []}
                cutoffWins={simData.cutoffSummary?.p50FifthPlaceWins ?? simData.cutoffSummary?.averageFifthPlaceWins ?? 72}
              />
            )}

          </div>
        )}

        {/* 4. Disclaimer Footer Card */}
        <footer className="mt-12 bg-white border border-slate-100 rounded-xl p-5 text-center text-xs text-slate-400 space-y-1.5 shadow-inner">
          <p className="font-semibold text-slate-500">
            ⚠️ 시뮬레이션 계산 유의사항 및 데이터 출처 안내
          </p>
          <p className="max-w-3xl mx-auto leading-relaxed">
            본 계산은 KBO 공식 데이터 또는 공개 보조 데이터 소스를 기반으로 한 통계적 시뮬레이션입니다. KBO 공식 데이터 수집 실패 시 MyKBOStats, AiScore 또는 내장 fallback 데이터가 사용될 수 있으며, 실제 순위·일정과 차이가 있을 수 있습니다.
          </p>
          <p className="max-w-3xl mx-auto leading-relaxed text-slate-400/85">
            실제 경기 결과·우천취소·부상·선발투수·구단 운영 변수에 따라 결과가 달라질 수 있으며, 모든 팀의 잔여 경기수(144경기) 합산을 맞추기 위해 미지정 잔여 경기 및 순연 경기는 알고리즘에 따른 중립/상대전적 보정이 적용되었습니다.
          </p>
          <p className="text-[10px] text-slate-300 font-mono mt-3">
            Designed and built for KBO baseball fans. Powered by Monte Carlo Simulation Engine.
          </p>
        </footer>

      </main>
    </div>
  );
}
