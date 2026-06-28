/**
 * @file SimulationControls.tsx
 * @description Renders control inputs for iterations, models, seed numbers, and triggers simulation calculations.
 */

import React from 'react';
import { Play, ShieldAlert, Cpu } from 'lucide-react';
import { ProbabilityModelType } from '../types';

interface SimulationControlsProps {
  iterations: number;
  onIterationsChange: (count: number) => void;
  selectedModel: ProbabilityModelType;
  onModelChange: (model: ProbabilityModelType) => void;
  seed: number;
  onSeedChange: (seed: number) => void;
  onRunSimulation: () => void;
  isLoading: boolean;
}

/**
 * Control panel card containing iterations, probability models, seed, and the run simulation button.
 */
export const SimulationControls: React.FC<SimulationControlsProps> = ({
  iterations,
  onIterationsChange,
  selectedModel,
  onModelChange,
  seed,
  onSeedChange,
  onRunSimulation,
  isLoading,
}) => {
  console.log(`[SimulationControls] Rendered iterations: ${iterations}, model: "${selectedModel}", seed: ${seed}, isLoading: ${isLoading}`);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 transition-all duration-200 hover:shadow-md">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* 1. Monte Carlo Iterations Selector */}
        <div className="space-y-2">
          <label htmlFor="iteration-select" className="block text-sm font-semibold text-slate-700">시뮬레이션 반복 횟수 (Iterations)</label>
          <div className="grid grid-cols-3 gap-2">
            {[10000, 50000, 100000].map(count => (
              <button
                key={count}
                type="button"
                onClick={() => {
                  console.log(`[SimulationControls] User selected iteration count: ${count}`);
                  onIterationsChange(count);
                }}
                className={`py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  iterations === count
                    ? 'bg-blue-50 border-blue-500 text-blue-600 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
                id={`iter-btn-${count}`}
              >
                {count.toLocaleString()}회
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400">
            반복 횟수가 늘어날수록 통계적 변동성이 줄어들어 더 정교한 확률 수렴이 가능합니다.
          </p>
        </div>

        {/* 2. Probability Prediction Model Selector */}
        <div className="space-y-2">
          <label htmlFor="model-select" className="block text-sm font-semibold text-slate-700">경기 승리확률 예측 모델</label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(e) => {
              const val = e.target.value as ProbabilityModelType;
              console.log(`[SimulationControls] User changed model to: "${val}"`);
              onModelChange(val);
            }}
            className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 rounded-lg text-xs font-medium text-slate-700 outline-none cursor-pointer transition-all"
          >
            <option value="winRate">현재 승률 기반 모델 (winRate - 기본값)</option>
            <option value="hybrid">하이브리드 결합 모델 (hybrid - 승률/상대/최근10)</option>
            <option value="basic">균등 확률 모델 (basic - 양 팀 50:50)</option>
          </select>

          {/* Model explainers */}
          <div className="p-2 bg-slate-50 border border-slate-100 rounded-md text-[10px] text-slate-500">
            {selectedModel === 'winRate' && (
              <span>
                <strong>승률 기반</strong>: 각 팀의 현재 정규시즌 누적 승률을 바탕으로 우열을 정하고, <strong>홈팀에 +2.5%p의 가중치</strong>를 가산하여 승률을 예측합니다.
              </span>
            )}
            {selectedModel === 'hybrid' && (
              <span>
                <strong>하이브리드</strong>: <strong>현재 누적 승률(60%) + 상대전적(25%) + 최근 10경기 승률(15%)</strong>을 복합 산정하고, 홈팀에 +2.5%p 보정을 추가합니다.
              </span>
            )}
            {selectedModel === 'basic' && (
              <span>
                <strong>균등 확률</strong>: 전력 차이를 완전 배제하고 홈팀과 원정팀의 기본 승리 확률을 50:50으로 계산합니다 (무승부 기본 비율 2.5% 적용).
              </span>
            )}
          </div>
        </div>

        {/* 3. Reproducible Seed & Action Button */}
        <div className="flex flex-col justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="seed-input" className="block text-sm font-semibold text-slate-700">난수 시드 설정 (Seed)</label>
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Cpu className="w-3 h-3" />
                결과 재현용
              </div>
            </div>
            <input
              id="seed-input"
              type="number"
              value={seed}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 42;
                console.log(`[SimulationControls] User changed seed value to: ${val}`);
                onSeedChange(val);
              }}
              placeholder="예: 42"
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-medium text-slate-700 outline-none transition-all focus:bg-white focus:border-blue-500"
            />
          </div>

          <button
            onClick={() => {
              console.log('[SimulationControls] Run simulation clicked!');
              onRunSimulation();
            }}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white font-bold text-sm rounded-xl border border-blue-700 shadow-sm hover:shadow active:shadow-none cursor-pointer transition-all"
            id="run-simulation-btn"
          >
            <Play className={`w-4 h-4 fill-current ${isLoading ? 'animate-pulse' : ''}`} />
            {isLoading ? '시뮬레이션 실행 중...' : '가을야구 진출 확률 계산 시작'}
          </button>
        </div>

      </div>
    </div>
  );
};
