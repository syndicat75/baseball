/**
 * @file FifthPlaceCutoffCard.tsx
 * @description 몬테카를로 시뮬레이션 결과를 기반으로 포스트시즌 진출 턱걸이인 '5위 커트라인'을 예측하여 분석해주는 카드 컴포넌트입니다.
 */

import React from 'react';
import { Target, HelpCircle, AlertCircle, TrendingUp, Info } from 'lucide-react';
import { CutoffSummary } from '../types';

interface FifthPlaceCutoffCardProps {
  cutoff?: CutoffSummary;
}

/**
 * @function FifthPlaceCutoffCard
 * @description 평균 승수, 승률 및 25% ~ 90% 분위수의 커트라인 시나리오를 가독성 높은 레이아웃으로 렌더링합니다.
 * @param {FifthPlaceCutoffCardProps} props 시뮬레이션에서 생성된 5위 커트라인 요약 통계
 */
export const FifthPlaceCutoffCard: React.FC<FifthPlaceCutoffCardProps> = ({ cutoff }) => {
  console.log('[FifthPlaceCutoffCard] [CALL] FifthPlaceCutoffCard rendered.');

  if (!cutoff) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center text-slate-400 font-semibold flex items-center justify-center gap-2 h-full min-h-[180px]">
        <HelpCircle className="w-5 h-5 text-slate-300 animate-pulse" />
        <span>커트라인 예측 데이터를 불러오는 중...</span>
      </div>
    );
  }

  return (
    <div id="fifth-place-cutoff-card" className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full">
      <div className="space-y-3">
        {/* Title */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600" />
            <span className="font-bold text-slate-850 text-sm">가을야구 진출(5위) 예상 커트라인</span>
          </div>
          <span className="text-[10px] bg-blue-50 text-blue-800 font-bold px-2 py-0.5 rounded border border-blue-100">
            실시간 예측
          </span>
        </div>

        {/* Main Win / Rate Indicator */}
        <div className="flex items-baseline justify-between py-1">
          <div>
            <span className="text-3xl font-extrabold font-mono tracking-tight text-blue-600">
              {cutoff.averageFifthPlaceWins.toFixed(1)}
            </span>
            <span className="text-blue-500 text-sm font-bold ml-0.5">승</span>
            <div className="text-[10px] text-slate-400 font-semibold mt-0.5">
              예상 평균 최종 승률: <span className="font-bold text-slate-600">{(cutoff.averageFifthPlaceWinRate).toFixed(3)}</span>
            </div>
          </div>
          <div className="text-right">
            <TrendingUp className="w-5 h-5 text-slate-300 ml-auto" />
            <span className="text-[11px] font-bold text-slate-500">KBO 144G 스케일</span>
          </div>
        </div>

        {/* Percentile Scenario Table */}
        <div className="border-t border-slate-100 pt-2.5 space-y-2">
          <span className="text-[11px] text-slate-400 font-bold block">분위수별 시나리오</span>
          <div className="grid grid-cols-4 gap-2 text-center">
            
            <div className="bg-slate-50/50 rounded p-1.5 border border-slate-100/50">
              <span className="text-[9px] text-slate-400 font-bold block mb-0.5">25% (낮음)</span>
              <span className="text-xs font-extrabold font-mono text-emerald-600">{cutoff.p25FifthPlaceWins}승</span>
            </div>

            <div className="bg-slate-50/50 rounded p-1.5 border border-slate-100/50">
              <span className="text-[9px] text-slate-400 font-bold block mb-0.5">50% (보통)</span>
              <span className="text-xs font-extrabold font-mono text-slate-700">{cutoff.p50FifthPlaceWins}승</span>
            </div>

            <div className="bg-slate-50/50 rounded p-1.5 border border-slate-100/50">
              <span className="text-[9px] text-slate-400 font-bold block mb-0.5">75% (높음)</span>
              <span className="text-xs font-extrabold font-mono text-orange-600">{cutoff.p75FifthPlaceWins}승</span>
            </div>

            <div className="bg-slate-50/50 rounded p-1.5 border border-slate-100/50">
              <span className="text-[9px] text-slate-400 font-bold block mb-0.5">90% (매우높음)</span>
              <span className="text-xs font-extrabold font-mono text-rose-600">{cutoff.p90FifthPlaceWins}승</span>
            </div>

          </div>
        </div>
      </div>

      {/* Info Footnote */}
      <div className="mt-4 flex items-start gap-1.5 bg-slate-50/70 border border-slate-100 rounded-lg p-2 text-[9px] text-slate-500 leading-normal">
        <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
        <div>
          승패가 동일할 경우 승률 및 동률 분할 처리(KBO 규칙 적용)로 포스트시즌 진출 확률을 소수점 수준까지 분할 시뮬레이션하였습니다.
        </div>
      </div>

    </div>
  );
};
