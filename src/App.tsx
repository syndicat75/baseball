/**
 * @file App.tsx
 * @description The main entry point component of the React frontend.
 * Coordinates user configurations, fetches data, handles loading/error states, and renders the dashboard grids.
 */

import { useState, useEffect } from 'react';
import { DateControl } from './components/DateControl';
import { SimulationControls } from './components/SimulationControls';
import { ProbabilityCards } from './components/ProbabilityCards';
import { ProbabilityTable } from './components/ProbabilityTable';
import { RankDistribution } from './components/RankDistribution';
import { DataQualityNotice } from './components/DataQualityNotice';
import { TeamSimulationStats } from './types';
import { Award, Zap, RefreshCw, AlertTriangle, HelpCircle } from 'lucide-react';

interface FullSimulationData {
  date: string;
  iterations: number;
  model: string;
  results: TeamSimulationStats[];
  unresolvedGames: any[];
}

export default function App() {
  console.log('[App] Rendered App component');

  // Today's date as default
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

  /**
   * Fetches simulation results and standings snapshots from the backend.
   * 
   * @param forceRefresh - If true, triggers a fresh scraper execution on the backend.
   */
  const fetchSimulationResults = async (forceRefresh = false) => {
    console.log(`[App] fetchSimulationResults called. Date: ${selectedDate}, Iterations: ${iterations}, Model: ${selectedModel}, Seed: ${seed}, Refresh: ${forceRefresh}`);
    setIsLoading(true);
    setError(null);

    try {
      const url = `/api/simulate?date=${selectedDate}&iterations=${iterations}&model=${selectedModel}&seed=${seed}&refresh=${forceRefresh}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Server returned status: ${response.status}`);
      }

      const data = await response.json() as FullSimulationData;
      console.log(`[App] Successfully received simulation data from server.`);
      
      setSimData(data);
      setLastUpdated(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err: any) {
      console.error(`[App] Error in fetchSimulationResults:`, err);
      setError('공식 KBO 데이터 수집에 실패했습니다. 잠시 후 다시 시도하거나 캐시된 데이터를 사용하세요.');
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

        {/* Error Alert with fallback option */}
        {error && !isLoading && (
          <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl p-5 space-y-3 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="space-y-1.5 flex-1">
                <h4 className="font-bold text-red-800 text-sm">데이터 연동 및 파싱 오류 안내</h4>
                <p className="text-xs leading-relaxed text-red-700 font-medium">
                  {error}
                </p>
                <p className="text-[11px] text-red-600">
                  KBO 공식 서버 점검 혹은 사이트 개편 시 크롤러가 정상 작동하지 않을 수 있습니다. 앱은 지속 작동을 위해 내장 샘플 데이터베이스 스냅샷으로 자동 복구 전환되었습니다.
                </p>
              </div>
            </div>
            <div className="pl-8">
              <button
                onClick={() => fetchSimulationResults(false)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow-sm border border-red-700 cursor-pointer transition-all"
                id="retry-fetch-btn"
              >
                네트워크 통신 재시도
              </button>
            </div>
          </div>
        )}

        {/* 3. Results Output Content */}
        {!isLoading && simData && (
          <div className="space-y-6 animate-fade-in">
            
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
