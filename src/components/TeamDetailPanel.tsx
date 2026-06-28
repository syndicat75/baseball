/**
 * @file TeamDetailPanel.tsx
 * @description 특정 구단을 클릭했을 때 가을야구 진출 조건, 잔여 경기 구성, 1~10위 확률 분포, 목표 승수별 확률을 세밀하게 분해해 보여주는 확장식 상세 대시보드 패널입니다.
 */

import React from 'react';
import { X, Calendar, BarChart3, Target, ShieldCheck, TrendingUp, Info } from 'lucide-react';
import { TeamSimulationStats } from '../types';
import { CONFIG } from '../config';

interface TeamDetailPanelProps {
  teamStats: TeamSimulationStats;
  targetProbs?: Array<{ wins: number; playoffProbability: number }>;
  cutoffWins: number;
  onClose: () => void;
}

/**
 * @function TeamDetailPanel
 * @description 구단의 세부 몬테카를로 분석 결과를 그리드 레이아웃과 수평 밀도 차트로 입체감 있게 구현합니다.
 * @param {TeamDetailPanelProps} props 선택 구단 지표, 목표 승수별 가중치, 커트라인 기준 및 닫기 콜백
 */
export const TeamDetailPanel: React.FC<TeamDetailPanelProps> = ({
  teamStats,
  targetProbs,
  cutoffWins,
  onClose,
}) => {
  console.log(`[TeamDetailPanel] [CALL] TeamDetailPanel rendered for: ${teamStats.team}`);

  const teamMeta = CONFIG.TEAMS[teamStats.team as keyof typeof CONFIG.TEAMS];
  const colorHex = teamMeta?.color || '#334155';
  const textColorHex = teamMeta?.textColor || '#ffffff';

  // 가장 가능성 높은 순위의 코멘트
  const getRankMessage = (rank: number) => {
    if (rank <= 1) return '🏆 정규시즌 우승 유력';
    if (rank <= 5) return ' postseason 가을야구 진출 안정권';
    return ' 정규시즌 하위권 탈출 목표';
  };

  return (
    <div id={`team-detail-panel-${teamStats.team}`} className="bg-slate-900 text-slate-100 rounded-xl border border-slate-800 p-6 shadow-xl space-y-6 transition-all duration-350 relative overflow-hidden">
      
      {/* Decorative Brand Accent */}
      <div 
        className="absolute top-0 left-0 w-2 h-full opacity-90"
        style={{ backgroundColor: colorHex }}
      />

      {/* Header section */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-lg flex items-center justify-center font-extrabold text-lg select-none"
            style={{ backgroundColor: colorHex, color: textColorHex }}
          >
            {teamMeta?.logoChar || teamStats.team.substring(0, 1)}
          </div>
          <div>
            <h3 className="text-lg font-extrabold flex items-center gap-2">
              <span>{teamStats.displayName}</span>
              <span className="text-xs text-slate-400 font-semibold">({teamStats.team})</span>
            </h3>
            <p className="text-xs text-slate-400 font-semibold flex items-center gap-1.5 mt-0.5">
              <span>현재 {teamStats.currentRank}위</span>
              <span className="w-1 h-1 rounded-full bg-slate-600" />
              <span>{teamStats.currentWins}승 {teamStats.currentLosses}패 {teamStats.currentDraws}무 (승률 {(teamStats.currentWins / ((teamStats.currentWins + teamStats.currentLosses) || 1)).toFixed(3)})</span>
            </p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          title="상세 분석 닫기"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 1. 핵심 진출 지표 Grid */}
        <div className="bg-slate-800/45 rounded-xl p-4.5 border border-slate-800 space-y-4">
          <h4 className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>가을야구 시뮬레이션 지표</span>
          </h4>

          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">포스트시즌 진출 확률</span>
              <span className="text-xl font-black font-mono text-emerald-400">{teamStats.playoffProbability.toFixed(1)}%</span>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800/60 pt-3">
              <span className="text-xs text-slate-400">평균 최종 순위</span>
              <span className="text-sm font-extrabold font-mono text-slate-200">{teamStats.averageFinalRank.toFixed(1)}위</span>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800/60 pt-3">
              <span className="text-xs text-slate-400">가장 유력한 최종 순위</span>
              <span className="text-sm font-extrabold font-mono text-slate-200">{teamStats.mostLikelyFinalRank}위</span>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800/60 pt-3">
              <span className="text-xs text-slate-400">커트라인({cutoffWins.toFixed(1)}승) 대비 마진</span>
              <span className={`text-sm font-black font-mono ${teamStats.cutoffGap >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>
                {teamStats.cutoffGap >= 0 ? `+${teamStats.cutoffGap.toFixed(1)}` : teamStats.cutoffGap.toFixed(1)}승
              </span>
            </div>
          </div>
        </div>

        {/* 2. 잔여 경기 분석 Grid */}
        <div className="bg-slate-800/45 rounded-xl p-4.5 border border-slate-800 space-y-4">
          <h4 className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <Calendar className="w-4 h-4 text-blue-400" />
            <span>잔여 및 최종 시뮬레이션 일정</span>
          </h4>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">실제 예약된 잔여 경기</span>
              <span className="font-bold font-mono text-slate-200">{teamStats.actualScheduledRemainingGames} 경기</span>
            </div>

            <div className="flex justify-between items-center text-xs border-t border-slate-800/40 pt-2.5">
              <span className="text-slate-400">가상 보정(Synthetic) 경기</span>
              <span className="font-bold font-mono text-amber-400">{teamStats.syntheticRemainingGames} 경기</span>
            </div>

            <div className="flex justify-between items-center text-xs border-t border-slate-800/40 pt-2.5">
              <span className="text-slate-400">시뮬레이션 반영 잔여합</span>
              <span className="font-bold font-mono text-slate-200">{teamStats.totalRemainingGamesUsed} 경기</span>
            </div>

            <div className="flex justify-between items-center text-xs border-t border-slate-800/40 pt-2.5">
              <span className="text-slate-400">예상 평균 최종 성적</span>
              <span className="font-bold font-mono text-slate-200">
                {teamStats.averageFinalWins.toFixed(1)}승 {teamStats.averageFinalLosses.toFixed(1)}패 {teamStats.averageFinalDraws.toFixed(1)}무
              </span>
            </div>

            <div className="flex justify-between items-center text-xs border-t border-slate-800/40 pt-2.5">
              <span className="text-slate-400">시뮬레이션 연산 경기수</span>
              <span className={`font-bold font-mono ${teamStats.projectedFinalGames === 144 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {teamStats.projectedFinalGames} 경기
              </span>
            </div>
          </div>
        </div>

        {/* 3. 목표 승수별 진출 확률 */}
        <div className="bg-slate-800/45 rounded-xl p-4.5 border border-slate-800 space-y-4">
          <h4 className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
            <Target className="w-4 h-4 text-orange-400" />
            <span>최종 승수 기준 진출 확률</span>
          </h4>

          <div className="space-y-3">
            {targetProbs && targetProbs.map((p, index) => (
              <div key={index} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-200 font-mono">최종 {p.wins}승 달성 시</span>
                  <span className={`${p.playoffProbability >= 90 ? 'text-emerald-400' : p.playoffProbability >= 50 ? 'text-blue-400' : 'text-slate-400'} font-mono`}>
                    진출 확률 {p.playoffProbability.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${p.playoffProbability >= 90 ? 'bg-emerald-400' : p.playoffProbability >= 50 ? 'bg-blue-400' : 'bg-slate-500'}`}
                    style={{ width: `${p.playoffProbability}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 4. 최종 순위 확률 분포 수평 밀도 차트 */}
      <div className="bg-slate-800/25 rounded-xl p-5 border border-slate-800 space-y-3.5">
        <h4 className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
          <BarChart3 className="w-4 h-4 text-purple-400" />
          <span>시뮬레이션 최종 순위 분포 (1위 ~ 10위)</span>
        </h4>

        <div className="grid grid-cols-5 sm:grid-cols-10 gap-3 pt-1">
          {Array.from({ length: 10 }, (_, i) => {
            const rankNum = i + 1;
            const percentage = teamStats.rankDistribution[rankNum] || 0;
            const isPlayoffZone = rankNum <= 5;
            
            return (
              <div key={rankNum} className="flex flex-col items-center bg-slate-800/40 border border-slate-800/80 rounded-lg p-2 relative group hover:bg-slate-800/90 transition-colors">
                <span className={`text-[10px] font-bold ${isPlayoffZone ? 'text-emerald-400' : 'text-slate-500'} mb-1`}>
                  {rankNum}위
                </span>
                
                {/* Vertical density indicator block */}
                <div className="w-full h-12 bg-slate-900/60 rounded flex items-end overflow-hidden p-0.5 border border-slate-800/30">
                  <div 
                    className={`w-full rounded-sm transition-all duration-500 ${isPlayoffZone ? 'bg-gradient-to-t from-emerald-500 to-teal-400' : 'bg-gradient-to-t from-slate-600 to-slate-400'}`}
                    style={{ height: `${Math.max(4, percentage)}%` }}
                  />
                </div>
                
                <span className="text-[10px] font-extrabold font-mono text-slate-300 mt-1.5">
                  {percentage.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
        
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 leading-normal mt-1 border-t border-slate-800/30 pt-2 font-medium">
          <Info className="w-3 h-3 text-slate-400 shrink-0" />
          <span>
            이 분포는 각 시나리오의 무작위 변동에서 구단이 도달한 최종 등수 비율입니다. 녹색 테두리(1~5위) 구역에 머물면 가을야구에 자동 승선합니다.
          </span>
        </div>
      </div>

    </div>
  );
};
