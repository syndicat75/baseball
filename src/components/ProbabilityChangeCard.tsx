/**
 * @file ProbabilityChangeCard.tsx
 * @description 어제 계산한 포스트시즌 확률과 오늘 계산된 실시간 확률을 매칭하여 구단별 확률 등락(변동폭)을 대시보드 형태로 구성한 카드 컴포넌트입니다.
 */

import React from 'react';
import { RefreshCw, ArrowUpRight, ArrowDownRight, Minus, Sparkles, HelpCircle, AlertCircle } from 'lucide-react';
import { ProbabilityChangeItem } from '../types';

interface ProbabilityChangeCardProps {
  changeData?: {
    hasPrevData: boolean;
    prevDate?: string;
    items: ProbabilityChangeItem[];
  };
}

/**
 * @function ProbabilityChangeCard
 * @description 등락 폭이 가장 큰 TOP 5 구단 하이라이트 및 10개 구단 전체 변동률 보드를 탭/그리드 형태로 간소화해 시각화합니다.
 * @param {ProbabilityChangeCardProps} props 전일 대비 변동폭 상태값
 */
export const ProbabilityChangeCard: React.FC<ProbabilityChangeCardProps> = ({ changeData }) => {
  console.log('[ProbabilityChangeCard] [CALL] ProbabilityChangeCard rendered.');

  if (!changeData || !changeData.hasPrevData || changeData.items.length === 0) {
    return (
      <div id="probability-change-card" className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center text-slate-400 font-semibold flex flex-col items-center justify-center gap-2 h-full min-h-[180px]">
        <AlertCircle className="w-6 h-6 text-slate-350" />
        <span className="text-slate-500 font-bold text-sm">전일 비교 데이터 없음</span>
        <p className="text-[10px] text-slate-400 font-medium max-w-[220px] leading-relaxed">
          오늘 시뮬레이션 결과가 저장되면, 다음 갱신 또는 기준일 변경 시부터 등락 비교가 활성화됩니다.
        </p>
      </div>
    );
  }

  // 등락 절댓값 순으로 정렬하여 탑 5 선별
  const topChanges = [...changeData.items]
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 5);

  return (
    <div id="probability-change-card" className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full">
      <div className="space-y-4">
        {/* Title */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600 animate-pulse" />
            <span className="font-bold text-slate-850 text-sm">어제 대비 확률 변동분 분석</span>
          </div>
          <span className="text-[10px] bg-purple-50 text-purple-800 font-bold px-2 py-0.5 rounded border border-purple-100">
            기준일: {changeData.prevDate}
          </span>
        </div>

        {/* Top Changes list */}
        <div className="space-y-2">
          <span className="text-[11px] text-slate-400 font-bold block">주요 변동 구단 (TOP 5)</span>
          <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
            {topChanges.map((t, idx) => {
              const isUp = t.change > 0;
              const isDown = t.change < 0;
              
              return (
                <div key={idx} className="flex items-center justify-between bg-slate-50/50 hover:bg-slate-50 rounded-lg p-2 border border-slate-100/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">{t.displayName}</span>
                    <span className="text-[9px] font-semibold text-slate-400 font-mono">({t.prevProb.toFixed(1)}% → {t.currentProb.toFixed(1)}%)</span>
                  </div>
                  <div className="flex items-center gap-1 font-extrabold font-mono text-xs">
                    {isUp ? (
                      <span className="text-emerald-600 flex items-center">
                        <ArrowUpRight className="w-3.5 h-3.5 mr-0.5 shrink-0" />
                        +{t.change.toFixed(1)}%p
                      </span>
                    ) : isDown ? (
                      <span className="text-rose-600 flex items-center">
                        <ArrowDownRight className="w-3.5 h-3.5 mr-0.5 shrink-0" />
                        {t.change.toFixed(1)}%p
                      </span>
                    ) : (
                      <span className="text-slate-400 flex items-center">
                        <Minus className="w-3.5 h-3.5 mr-0.5 shrink-0" />
                        0.0%p
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1 text-[9px] text-slate-400 border-t border-slate-100 pt-2 font-medium">
        <HelpCircle className="w-3 h-3 text-slate-350" />
        <span>무작위 종자(Seed) 고정 상태에서 순수한 잔여 일정 확률 변화의 절대치를 측정했습니다.</span>
      </div>
    </div>
  );
};
