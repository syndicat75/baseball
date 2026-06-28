/**
 * @file ScenarioModePanel.tsx
 * @description 구단의 잔여 성적을 가상으로 주입해 미래 가을야구 진출 확률의 등락을 관찰할 수 있는 인터랙티브 가상 시뮬레이터 제어 패널입니다.
 */

import React, { useState, useEffect } from 'react';
import { Sliders, RotateCcw, Play, Check, AlertTriangle, HelpCircle, ArrowRightLeft } from 'lucide-react';
import { CONFIG } from '../config';
import { ScenarioInput } from '../lib/scenario/applyScenario';
import { TeamSimulationStats } from '../types';

interface ScenarioModePanelProps {
  teams: Array<{ team: string; nameKo: string; remainingGames: number }>;
  activeScenario: ScenarioInput | null;
  onApplyScenario: (scenario: ScenarioInput) => void;
  onClearScenario: () => void;
  originalProbabilities?: Record<string, number>; // team -> probability
  currentProbabilities?: Record<string, number>;  // team -> probability after scenario
}

/**
 * @function ScenarioModePanel
 * @description 가상 조건 설정을 위한 구단 선택 슬라이더, 승-패-무 카운터 제어 장치 및 시나리오 적용 시 전후 전력 등락 마진 분석을 렌더링합니다.
 * @param {ScenarioModePanelProps} props 구단별 남은 경기 현황, 활성화 스토어, 제어 콜백 및 전후 전적 맵
 */
export const ScenarioModePanel: React.FC<ScenarioModePanelProps> = ({
  teams,
  activeScenario,
  onApplyScenario,
  onClearScenario,
  originalProbabilities,
  currentProbabilities,
}) => {
  console.log('[ScenarioModePanel] [CALL] ScenarioModePanel rendered.');

  const [isOpen, setIsOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(teams[0]?.team || 'LOTTE');
  const [games, setGames] = useState(10);
  const [wins, setWins] = useState(7);
  const [losses, setLosses] = useState(3);
  const [draws, setDraws] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const activeTeamInfo = teams.find(t => t.team === selectedTeam);
  const maxRemaining = activeTeamInfo ? activeTeamInfo.remainingGames : 144;

  // 선택 팀 변경 시, 디폴트 경기수 조절
  useEffect(() => {
    if (activeTeamInfo) {
      const defaultG = Math.min(10, activeTeamInfo.remainingGames);
      setGames(defaultG);
      // 대략 60~70% 승률로 초깃값 세팅
      const w = Math.ceil(defaultG * 0.6);
      setWins(w);
      setLosses(defaultG - w);
      setDraws(0);
    }
  }, [selectedTeam]);

  // 성적 합계가 총 경기 수와 일치하는지 모니터링
  useEffect(() => {
    const sum = wins + losses + draws;
    if (sum !== games) {
      setError(`합계 불일치: 입력한 승패무의 합(${sum}경기)이 가정한 경기 수(${games}경기)와 일치해야 합니다.`);
    } else if (games > maxRemaining) {
      setError(`경기 수 초과: ${selectedTeam}의 남은 경기 수는 ${maxRemaining}경기입니다. 더 작게 설정하세요.`);
    } else {
      setError(null);
    }
  }, [games, wins, losses, draws, selectedTeam, maxRemaining]);

  const handleApply = () => {
    if (error) return;
    onApplyScenario({
      type: 'team-record',
      team: selectedTeam,
      games,
      wins,
      losses,
      draws
    });
  };

  const handleClear = () => {
    onClearScenario();
    // Reset values to defaults
    if (activeTeamInfo) {
      const defaultG = Math.min(10, activeTeamInfo.remainingGames);
      setGames(defaultG);
      const w = Math.ceil(defaultG * 0.6);
      setWins(w);
      setLosses(defaultG - w);
      setDraws(0);
    }
    setError(null);
  };

  // 등락 분석을 보여주기 위한 롯데 등 선택 팀 비교
  const teamCode = activeScenario ? activeScenario.team : selectedTeam;
  const teamKo = CONFIG.TEAMS[teamCode as keyof typeof CONFIG.TEAMS]?.nameKo || teamCode;
  const origP = originalProbabilities ? originalProbabilities[teamCode] ?? 0 : 0;
  const currP = currentProbabilities ? currentProbabilities[teamCode] ?? 0 : 0;
  const diffP = Math.round((currP - origP) * 10) / 10;

  return (
    <div id="scenario-mode-panel" className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm transition-all duration-300">
      
      {/* Collapsible Header */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 bg-slate-50/70 hover:bg-slate-50 transition-colors font-bold text-slate-800 text-sm"
      >
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-slate-600" />
          <span>🎯 만약에? 시나리오 분석 모드 (Scenario Mode)</span>
          {activeScenario && (
            <span className="text-[9px] bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded border border-amber-200 animate-pulse">
              가상 시나리오 적용 중
            </span>
          )}
        </div>
        <span className="text-xs text-blue-600 font-extrabold">
          {isOpen ? '닫기 ▲' : '가상 분석기 열기 ▼'}
        </span>
      </button>

      {isOpen && (
        <div className="p-5 space-y-5 border-t border-slate-100">
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
            
            {/* Left Control Input Panel */}
            <div className="md:col-span-8 space-y-4">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* 1. 구단 선택 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 block">대상 구단 선택</label>
                  <select 
                    value={selectedTeam}
                    onChange={(e) => setSelectedTeam(e.target.value)}
                    className="w-full text-xs font-semibold rounded-lg border border-slate-250 p-2 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    disabled={activeScenario !== null}
                  >
                    {teams.map((t) => (
                      <option key={t.team} value={t.team}>
                        {t.nameKo} (남은 일정: {t.remainingGames}경기)
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. 가정 경기수 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600 block">가정할 경기 수 (최대 {maxRemaining}경기)</label>
                  <input 
                    type="number"
                    min={1}
                    max={maxRemaining}
                    value={games}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      setGames(Math.min(maxRemaining, val));
                    }}
                    className="w-full text-xs font-bold font-mono rounded-lg border border-slate-250 p-2 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    disabled={activeScenario !== null}
                  />
                </div>

              </div>

              {/* 3. 승패무 조정 버튼군 */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-600 block">가상 예상 성적 배분</span>
                
                <div className="grid grid-cols-3 gap-3">
                  
                  <div className="bg-emerald-50/30 border border-emerald-100 rounded-lg p-2.5 text-center space-y-1">
                    <span className="text-[10px] text-emerald-800 font-bold block">승리</span>
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => setWins(Math.max(0, wins - 1))}
                        className="w-5 h-5 rounded bg-white border border-emerald-200 text-xs text-emerald-800 font-bold hover:bg-emerald-100 disabled:opacity-40"
                        disabled={activeScenario !== null || wins <= 0}
                      >-</button>
                      <span className="text-sm font-extrabold font-mono text-emerald-700">{wins}</span>
                      <button 
                        onClick={() => setWins(Math.min(games, wins + 1))}
                        className="w-5 h-5 rounded bg-white border border-emerald-200 text-xs text-emerald-800 font-bold hover:bg-emerald-100 disabled:opacity-40"
                        disabled={activeScenario !== null || wins >= games}
                      >+</button>
                    </div>
                  </div>

                  <div className="bg-rose-50/30 border border-rose-100 rounded-lg p-2.5 text-center space-y-1">
                    <span className="text-[10px] text-rose-800 font-bold block">패배</span>
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => setLosses(Math.max(0, losses - 1))}
                        className="w-5 h-5 rounded bg-white border border-rose-200 text-xs text-rose-800 font-bold hover:bg-rose-100 disabled:opacity-40"
                        disabled={activeScenario !== null || losses <= 0}
                      >-</button>
                      <span className="text-sm font-extrabold font-mono text-rose-700">{losses}</span>
                      <button 
                        onClick={() => setLosses(Math.min(games, losses + 1))}
                        className="w-5 h-5 rounded bg-white border border-rose-200 text-xs text-rose-800 font-bold hover:bg-rose-100 disabled:opacity-40"
                        disabled={activeScenario !== null || losses >= games}
                      >+</button>
                    </div>
                  </div>

                  <div className="bg-slate-50/30 border border-slate-100 rounded-lg p-2.5 text-center space-y-1">
                    <span className="text-[10px] text-slate-800 font-bold block">무승부</span>
                    <div className="flex items-center justify-center gap-2">
                      <button 
                        onClick={() => setDraws(Math.max(0, draws - 1))}
                        className="w-5 h-5 rounded bg-white border border-slate-200 text-xs text-slate-800 font-bold hover:bg-slate-100 disabled:opacity-40"
                        disabled={activeScenario !== null || draws <= 0}
                      >-</button>
                      <span className="text-sm font-extrabold font-mono text-slate-700">{draws}</span>
                      <button 
                        onClick={() => setDraws(Math.min(games, draws + 1))}
                        className="w-5 h-5 rounded bg-white border border-slate-200 text-xs text-slate-800 font-bold hover:bg-slate-100 disabled:opacity-40"
                        disabled={activeScenario !== null || draws >= games}
                      >+</button>
                    </div>
                  </div>

                </div>
              </div>

              {/* Error Panel */}
              {error && (
                <div className="flex items-center gap-1.5 text-rose-600 bg-rose-50/50 p-2 rounded-lg border border-rose-100 text-[11px] font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Apply / Cancel Button Actions */}
              <div className="flex items-center gap-3 pt-1">
                {activeScenario ? (
                  <button 
                    onClick={handleClear}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>시나리오 초기화</span>
                  </button>
                ) : (
                  <button 
                    onClick={handleApply}
                    disabled={error !== null}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm disabled:opacity-45"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>가상 시나리오 적용 계산</span>
                  </button>
                )}
              </div>

            </div>

            {/* Right Quick Preview Delta Result Panel */}
            <div className="md:col-span-4 bg-slate-50 border border-slate-100 rounded-xl p-4.5 space-y-3.5 h-full">
              <h4 className="text-xs font-extrabold text-slate-700">시나리오 결과 마진 요약</h4>
              
              <div className="space-y-3 text-center">
                <div className="text-xs font-bold text-slate-500">
                  {teamKo} 미래 <span className="font-mono text-blue-600">{games}</span>경기 {wins}승 {losses}패 {draws}무 가정 시
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="bg-white p-2 rounded border border-slate-150">
                    <span className="text-[9px] text-slate-400 font-bold block mb-0.5">기존 확률</span>
                    <span className="text-xs font-extrabold font-mono text-slate-600">
                      {origP.toFixed(1)}%
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded border border-slate-150">
                    <span className="text-[9px] text-slate-400 font-bold block mb-0.5">시나리오 후</span>
                    <span className="text-xs font-extrabold font-mono text-blue-600">
                      {currP.toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-200/60 pt-2 text-center">
                  <span className="text-[10px] text-slate-400 font-bold block mb-0.5">포스트시즌 마진 변화율</span>
                  <span className={`text-lg font-black font-mono ${diffP >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {diffP >= 0 ? `+${diffP.toFixed(1)}` : diffP.toFixed(1)}%p
                  </span>
                </div>
              </div>

            </div>

          </div>

          <div className="flex items-start gap-1.5 bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-[9px] text-slate-400 leading-normal">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <div>
              시나리오가 가동되면, 해당 구단이 맞닥뜨릴 첫 N경기의 상대 구단들의 전력도 패배 또는 무승부 등으로 연쇄 차감 계산됩니다. 이는 리그 전반의 고정밀 보정 효과를 온전히 보장합니다.
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
