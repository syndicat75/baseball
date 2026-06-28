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
import { TeamSimulationStats } from './types';
import { Award, Zap, RefreshCw, AlertTriangle, HelpCircle, CheckCircle2 } from 'lucide-react';

interface FullSimulationData {
  date: string;
  iterations: number;
  model: string;
  results: TeamSimulationStats[];
  unresolvedGames: any[];
  source: 'official-kbo' | 'fallback-sample';
  errorType?: string;
  errorMessage?: string;
}

export default function App() {
  console.log('[App] [CALL] App render');

  // Today's date as default (UTC to local conversion)
  const todayStr = new Date().toISOString().split('T')[0];

  // User input states
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [iterations, setIterations] = useState<number>(50000);
  const [selectedModel, setSelectedModel] = useState<'basic' | 'winRate' | 'hybrid'>('winRate');
  const [seed, setSeed] = useState<number>(42);

  // Loading, error and data states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [simData, setSimData] = useState<FullSimulationData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isFallbackSample, setIsFallbackSample] = useState<boolean>(false);

  // Diagnostic state for step-by-step verification
  const [diagnostic, setDiagnostic] = useState<{
    status: 'idle' | 'running' | 'success' | 'failed';
    health: 'idle' | 'checking' | 'ok' | 'fail';
    standings: 'idle' | 'checking' | 'official-kbo' | 'cache' | 'fallback-sample' | 'fail';
    schedule: 'idle' | 'checking' | 'official-kbo' | 'cache' | 'fallback-sample' | 'fail';
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
   * Fetches simulation results and standings snapshots from the backend.
   * 
   * @param forceRefresh - If true, triggers a fresh scraper execution on the backend.
   */
  const fetchSimulationResults = async (forceRefresh = false) => {
    console.log(`[App] [CALL] fetchSimulationResults - Date: ${selectedDate}, Iterations: ${iterations}, Model: ${selectedModel}, Seed: ${seed}, Refresh: ${forceRefresh}`);
    setIsLoading(true);
    setError(null);

    try {
      const url = `/api/simulate?date=${selectedDate}&iterations=${iterations}&model=${selectedModel}&seed=${seed}&refresh=${forceRefresh}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Server returned status: ${response.status}`);
      }

      const data = await response.json() as FullSimulationData;
      console.log(`[App] Successfully received simulation data from server. Source: "${data.source}"`);
      
      setSimData(data);
      setIsFallbackSample(data.source === 'fallback-sample');
      
      const currentTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastUpdated(currentTime);
      setDiagnostic(prev => ({ ...prev, lastSuccessTime: currentTime }));
    } catch (err: any) {
      console.error(`[App] Error in fetchSimulationResults:`, err);
      setError('데이터 수집 또는 연산 실행 중 문제가 발생했습니다. 자가진단을 통해 정밀 원인을 확인해 주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Runs sequential diagnostics and retries data fetching.
   * Tests /api/health, /api/kbo/standings, /api/kbo/schedule, and /api/simulate in order.
   * Reports exactly where any failure occurs and maps statuses beautifully.
   */
  const runDiagnosticsAndRetry = async () => {
    console.log('[App] [CALL] runDiagnosticsAndRetry');
    setDiagnostic({
      status: 'running',
      health: 'checking',
      standings: 'idle',
      schedule: 'idle',
      simulate: 'idle',
      currentStep: '1단계: API 서버 상태 확인 (/api/health)...',
      errorDetails: null,
      lastSuccessTime: diagnostic.lastSuccessTime,
    });
    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Health Check
      const healthRes = await fetch('/api/health');
      if (!healthRes.ok) {
        throw new Error(`API 헬스체크 실패 (상태 코드: ${healthRes.status}). API route가 배포되지 않았거나 꺼져 있을 수 있습니다.`);
      }
      const healthData = await healthRes.json();
      if (!healthData.ok) {
        throw new Error('API 헬스체크 응답이 정상 범위(ok: true)를 벗어났습니다.');
      }

      setDiagnostic(prev => ({
        ...prev,
        health: 'ok',
        standings: 'checking',
        currentStep: '2단계: KBO 공식 standings 데이터 수집 검증 (/api/kbo/standings)...',
      }));

      // Step 2: Standings Check
      const standingsRes = await fetch(`/api/kbo/standings?date=${selectedDate}`);
      if (!standingsRes.ok) {
        throw new Error(`KBO 순위 수집 API 호출 실패 (상태 코드: ${standingsRes.status}). KBO fetch 실패 또는 HTML parser 실패.`);
      }
      const standingsData = await standingsRes.json();
      
      // Determine Standings source status
      let standingsStatus: 'official-kbo' | 'cache' | 'fallback-sample' = 'official-kbo';
      if (standingsData.source === 'fallback-sample') {
        standingsStatus = 'fallback-sample';
      } else if (standingsData.errorType === '캐시 데이터 사용') {
        standingsStatus = 'cache';
      }

      setDiagnostic(prev => ({
        ...prev,
        standings: standingsStatus,
        schedule: 'checking',
        currentStep: '3단계: KBO 일정 데이터 수집 검증 (/api/kbo/schedule)...',
      }));

      // Step 3: Schedule Check
      const scheduleRes = await fetch(`/api/kbo/schedule?from=${selectedDate}`);
      if (!scheduleRes.ok) {
        throw new Error(`KBO 일정 수집 API 호출 실패 (상태 코드: ${scheduleRes.status}). 일정 fetch 실패 또는 HTML parser 실패.`);
      }
      const scheduleData = await scheduleRes.json();

      let scheduleStatus: 'official-kbo' | 'cache' | 'fallback-sample' = 'official-kbo';
      if (scheduleData.source === 'fallback-sample') {
        scheduleStatus = 'fallback-sample';
      } else if (scheduleData.errorType === '캐시 데이터 사용') {
        scheduleStatus = 'cache';
      }

      setDiagnostic(prev => ({
        ...prev,
        schedule: scheduleStatus,
        simulate: 'checking',
        currentStep: '4단계: 전체 시즌 시뮬레이션 계산 검증 (/api/simulate)...',
      }));

      // Step 4: Simulation Check
      const simulateRes = await fetch(`/api/simulate?date=${selectedDate}&iterations=${iterations}&model=${selectedModel}&seed=${seed}`);
      if (!simulateRes.ok) {
        throw new Error(`시뮬레이션 API 호출 실패 (상태 코드: ${simulateRes.status}). 시뮬레이션 연산 중 오류 발생.`);
      }
      const simulateData = await simulateRes.json();
      
      setSimData(simulateData);
      setIsFallbackSample(simulateData.source === 'fallback-sample');
      
      const currentTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastUpdated(currentTime);

      setDiagnostic({
        status: 'success',
        health: 'ok',
        standings: standingsStatus,
        schedule: scheduleStatus,
        simulate: 'ok',
        currentStep: '자가진단 완료: 모든 API가 정상 작동 중입니다!',
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
          currentStep: '자가진단 결과 통신 장애 또는 예측 계산 실패',
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
  }, [selectedDate, iterations, selectedModel, seed]);

  // Extract contenders for bento highlights
  const locks = simData?.results.filter(r => r.playoffProbability >= 90) || [];
  const bubble = simData?.results.filter(r => r.playoffProbability > 10 && r.playoffProbability < 90) || [];

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
        
        {/* Row 1: Configuration & Controls */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DateControl
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onRefresh={() => fetchSimulationResults(true)}
            isLoading={isLoading}
            lastUpdated={lastUpdated}
          />
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
            <div className={`p-2 rounded border flex flex-col gap-1 ${
              diagnostic.health === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
              diagnostic.health === 'fail' ? 'bg-rose-50 border-rose-100 text-rose-800' :
              diagnostic.health === 'checking' ? 'bg-amber-50 border-amber-100 text-amber-800 animate-pulse' :
              'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <span className="font-medium text-slate-500">API 서버 헬스체크</span>
              <strong className="font-bold">
                {diagnostic.health === 'ok' ? '✓ OK' : diagnostic.health === 'fail' ? '✗ FAIL' : diagnostic.health === 'checking' ? '진행중...' : '대기'}
              </strong>
            </div>

            {/* 2. Standings */}
            <div className={`p-2 rounded border flex flex-col gap-1 ${
              diagnostic.standings === 'official-kbo' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
              diagnostic.standings === 'cache' ? 'bg-blue-50 border-blue-100 text-blue-800' :
              diagnostic.standings === 'fallback-sample' ? 'bg-amber-50 border-amber-100 text-amber-800' :
              diagnostic.standings === 'fail' ? 'bg-rose-50 border-rose-100 text-rose-800' :
              diagnostic.standings === 'checking' ? 'bg-amber-50 border-amber-100 text-amber-800 animate-pulse' :
              'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <span className="font-medium text-slate-500">순위 수집 (Standings)</span>
              <strong className="font-bold">
                {diagnostic.standings === 'official-kbo' ? '✓ KBO 공식' :
                 diagnostic.standings === 'cache' ? '✓ 캐시사용' :
                 diagnostic.standings === 'fallback-sample' ? '⚠ 샘플 데이터' :
                 diagnostic.standings === 'fail' ? '✗ 실패 (Fail)' :
                 diagnostic.standings === 'checking' ? '검증중...' : '대기'}
              </strong>
            </div>

            {/* 3. Schedule */}
            <div className={`p-2 rounded border flex flex-col gap-1 ${
              diagnostic.schedule === 'official-kbo' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
              diagnostic.schedule === 'cache' ? 'bg-blue-50 border-blue-100 text-blue-800' :
              diagnostic.schedule === 'fallback-sample' ? 'bg-amber-50 border-amber-100 text-amber-800' :
              diagnostic.schedule === 'fail' ? 'bg-rose-50 border-rose-100 text-rose-800' :
              diagnostic.schedule === 'checking' ? 'bg-amber-50 border-amber-100 text-amber-800 animate-pulse' :
              'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <span className="font-medium text-slate-500">일정 분석 (Schedule)</span>
              <strong className="font-bold">
                {diagnostic.schedule === 'official-kbo' ? '✓ KBO 공식' :
                 diagnostic.schedule === 'cache' ? '✓ 캐시사용' :
                 diagnostic.schedule === 'fallback-sample' ? '⚠ 샘플 데이터' :
                 diagnostic.schedule === 'fail' ? '✗ 실패 (Fail)' :
                 diagnostic.schedule === 'checking' ? '검증중...' : '대기'}
              </strong>
            </div>

            {/* 4. Simulation Engine */}
            <div className={`p-2 rounded border flex flex-col gap-1 ${
              diagnostic.simulate === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
              diagnostic.simulate === 'fail' ? 'bg-rose-50 border-rose-100 text-rose-800' :
              diagnostic.simulate === 'checking' ? 'bg-amber-50 border-amber-100 text-amber-800 animate-pulse' :
              'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <span className="font-medium text-slate-500">시뮬레이션 가동</span>
              <strong className="font-bold">
                {diagnostic.simulate === 'ok' ? '✓ 정상' : diagnostic.simulate === 'fail' ? '✗ 연산오류' : diagnostic.simulate === 'checking' ? '시뮬레이션중...' : '대기'}
              </strong>
            </div>
          </div>

          {diagnostic.currentStep && (
            <div className="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded border border-slate-100">
              <span className="text-slate-600 font-medium">{diagnostic.currentStep}</span>
              <button
                onClick={runDiagnosticsAndRetry}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded cursor-pointer transition-all flex items-center gap-1"
                id="run-diag-btn"
              >
                <RefreshCw className="w-3 h-3" />
                정밀 검사 구동
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
                    따라서 <strong>공식 KBO 데이터가 아닌 샘플/캐시 기반 결과</strong>로 시뮬레이션을 지속합니다. 
                    계산 결과는 정상이므로 서비스 탐색 및 가을야구 시나리오 분석은 즉시 가능합니다.
                  </p>
                </div>
              </div>
            )}

            {/* Warning notices if KBO matches are unresolved */}
            <DataQualityNotice unresolvedGames={simData.unresolvedGames || []} />

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
                  <p className="text-xl font-bold text-slate-800">
                    {simData.iterations.toLocaleString()}회 연산
                  </p>
                  <p className="text-[10px] text-slate-500 font-semibold">
                    예측 모델: <strong className="text-blue-600 font-bold">{selectedModel === 'winRate' ? '누적 승률 모델' : selectedModel === 'hybrid' ? '하이브리드 다면 모델' : '균등 확률 모델'}</strong> (시드: {seed})
                  </p>
                </div>
                <HelpCircle className="w-12 h-12 text-slate-100 flex-shrink-0" />
              </div>
            </section>

            {/* Probability Cards Grid */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold text-slate-800">구단별 포스트시즌 진출 확률</h2>
                <span className="text-xs font-semibold text-slate-500">동률 발생 시 확률 분할 처리 적용</span>
              </div>
              <ProbabilityCards results={simData.results} />
            </section>

            {/* Probability Detailed Table */}
            <section>
              <ProbabilityTable results={simData.results} />
            </section>

            {/* Rank Distribution Heatmap */}
            <section>
              <RankDistribution results={simData.results} />
            </section>

          </div>
        )}

        {/* 4. Disclaimer Footer Card */}
        <footer className="mt-12 bg-white border border-slate-100 rounded-xl p-5 text-center text-xs text-slate-400 space-y-1 shadow-inner">
          <p className="font-semibold text-slate-500">
            ⚠️ 시뮬레이션 계산 유의사항 및 안내
          </p>
          <p className="max-w-3xl mx-auto leading-relaxed">
            본 확률은 공식 KBO 순위/일정 데이터를 기반으로 한 통계적 시뮬레이션 결과이며, 실제 경기 결과·우천취소·부상·선발투수·구단 운영 변수에 따라 달라질 수 있습니다. 
            모든 팀의 잔여 경기수(144경기) 합산을 맞추기 위해 미지정 잔여 경기 및 순연 경기는 알고리즘에 따른 중립/상대전적 보정이 적용되었습니다.
          </p>
          <p className="text-[10px] text-slate-300 font-mono mt-3">
            Designed and built for KBO baseball fans. Powered by Monte Carlo Simulation Engine.
          </p>
        </footer>

      </main>
    </div>
  );
}
