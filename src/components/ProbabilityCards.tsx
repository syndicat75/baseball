/**
 * @file ProbabilityCards.tsx
 * @description Displays postseason entry probabilities for each team using responsive, polished cards with color-coded status badges and progress circles.
 */

import React from 'react';
import { CONFIG } from '../config';
import { TeamSimulationStats } from '../types';
import { TrendingUp, Award, Zap, AlertCircle } from 'lucide-react';

interface ProbabilityCardsProps {
  results: TeamSimulationStats[];
  onTeamClick?: (teamCode: string) => void;
}

/**
 * Helper to determine probability category styling and labeling.
 */
export function getProbabilityZone(prob: number): {
  label: string;
  badgeClass: string;
  barColor: string;
  icon: React.ReactNode;
} {
  if (prob >= 90) {
    return {
      label: '안정권 (Safe)',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      barColor: 'bg-emerald-500',
      icon: <Award className="w-3.5 h-3.5 text-emerald-600" />,
    };
  }
  if (prob >= 50) {
    return {
      label: '경쟁권 (Contender)',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      barColor: 'bg-blue-500',
      icon: <TrendingUp className="w-3.5 h-3.5 text-blue-600" />,
    };
  }
  if (prob >= 10) {
    return {
      label: '추격권 (Chaser)',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      barColor: 'bg-amber-500',
      icon: <Zap className="w-3.5 h-3.5 text-amber-600" />,
    };
  }
  return {
    label: '탈락 위기 (Difficult)',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    barColor: 'bg-rose-500',
    icon: <AlertCircle className="w-3.5 h-3.5 text-rose-600" />,
  };
}

/**
 * Grid of beautifully styled cards representing each of the 10 KBO teams.
 */
export const ProbabilityCards: React.FC<ProbabilityCardsProps> = ({ results, onTeamClick }) => {
  console.log(`[ProbabilityCards] Rendered with ${results.length} team results`);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {results.map((r, index) => {
        const teamConf = CONFIG.TEAMS[r.team];
        const teamColor = teamConf?.color || 'bg-slate-500';
        const teamTextColor = teamConf?.textColor || 'text-slate-500';
        const teamBorderColor = teamConf?.borderColor || 'border-slate-300';
        const teamLogoChar = teamConf?.logoChar || 'T';
        const zone = getProbabilityZone(r.playoffProbability);

        return (
          <div
            key={r.team}
            onClick={() => onTeamClick?.(r.team)}
            className="bg-white border border-slate-100 rounded-xl p-5 relative overflow-hidden shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md hover:border-slate-350 cursor-pointer flex flex-col justify-between"
            id={`prob-card-${r.team}`}
          >
            {/* Visual accent top line representing team brand color */}
            <div className={`absolute top-0 left-0 right-0 h-1 ${teamColor}`} />

            {/* Header: Team name and Rank badge */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-full ${teamColor} text-white font-black text-sm flex items-center justify-center shadow-inner`}>
                    {teamLogoChar}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">{teamConf?.nameKo || r.team}</h3>
                    <p className="text-[10px] text-slate-400 font-medium">현재 {r.currentRank}위</p>
                  </div>
                </div>
                
                {/* Probability bubble percentage */}
                <div className="text-right">
                  <div className={`text-2xl font-black font-mono tracking-tight ${teamTextColor}`}>
                    {r.playoffProbability}%
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${zone.badgeClass}`}>
                {zone.icon}
                {zone.label}
              </div>

              {/* Custom styled progress bar */}
              <div className="space-y-1 pt-1">
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${zone.barColor}`}
                    style={{ width: `${r.playoffProbability}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-semibold font-mono">
                  <span>0%</span>
                  <span>5위 진출 확률</span>
                  <span>100%</span>
                </div>
              </div>
            </div>

            {/* Middle: Details stats */}
            <div className="grid grid-cols-2 gap-3 border-t border-slate-100/80 pt-4 mt-4 text-xs">
              <div className="space-y-1 bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                <div className="text-slate-400 font-semibold text-[10px]">현재 승-패-무</div>
                <div className="font-mono font-bold text-slate-700">
                  {r.currentWins}승 {r.currentLosses}패 {r.currentDraws}무
                </div>
              </div>
              <div className="space-y-1 bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                <div className="text-slate-400 font-semibold text-[10px]">예상 평균 승수</div>
                <div className="font-mono font-bold text-slate-700">
                  {r.averageFinalWins}승
                </div>
              </div>
            </div>

            {/* Footer: Average final rank */}
            <div className="mt-4 pt-3 border-t border-slate-100/50 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold">예상 평균 최종 순위</span>
              <span className="font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full font-mono">
                {r.averageFinalRank}위
              </span>
            </div>

          </div>
        );
      })}
    </div>
  );
};
