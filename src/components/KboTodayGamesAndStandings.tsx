/**
 * @file KboTodayGamesAndStandings.tsx
 * @description KBO 리그의 "실시간 팀 순위표"와 "당일 경기 일정 및 승률 예측"을 탭 기반 단일 화면에 모은 핵심 UI 컴포넌트입니다.
 * 하드코딩되지 않은 한국시간(KST) 오늘 날짜를 기준으로 동작하며, 수동 새로고침, 캘린더 날짜 제어,
 * 선발투수 스탯 바 비교, 선발 라인업 상세 조회, 경기 분석 근거(Prediction Factor) 등을 수려한 디자인과 부드러운 애니메이션으로 제공합니다.
 */

import { useState, useEffect } from 'react';
import { CONFIG } from '../config';
import { TeamStanding, TodayGame } from '../types';
import { getKoreaTodayString, isValidDateString } from '../lib/kbo/dateUtils';
import { 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  Info, 
  RefreshCw, 
  TrendingUp, 
  User, 
  Users, 
  Activity, 
  MapPin, 
  Clock, 
  AlertCircle,
  BarChart4,
  CheckCircle2
} from 'lucide-react';

export function KboTodayGamesAndStandings() {
  console.log('[KboTodayGamesAndStandings] [CALL] Render component');

  const todayKst = getKoreaTodayString();

  // 상태값 설정
  const [targetDate, setTargetDate] = useState<string>(todayKst);
  const [activeTab, setActiveTab] = useState<'games' | 'standings'>('games');
  
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [games, setGames] = useState<TodayGame[]>([]);
  
  const [isStandingsLoading, setIsStandingsLoading] = useState<boolean>(false);
  const [isGamesLoading, setIsGamesLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  
  // 격리된 에러 상태 관리 (부분 실패 처리를 위한 장치)
  const [errorMsg, setErrorMsg] = useState<string | null>(null); // 글로벌 에러 (수동 갱신 등)
  const [standingsError, setStandingsError] = useState<string | null>(null); // 순위표 전용 에러
  const [gamesError, setGamesError] = useState<string | null>(null); // 경기일정 전용 에러

  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  
  // 아코디언 상태 추적 (gameId -> boolean)
  const [expandedGames, setExpandedGames] = useState<Record<string, boolean>>({});

  /**
   * @function fetchStandingsData
   * @description 백엔드 API인 /api/kbo/standings?date=... 로부터 실시간 팀 순위표를 가져와 설정합니다.
   */
  const fetchStandingsData = async (dateStr: string) => {
    console.log(`[KboTodayGamesAndStandings] [CALL] fetchStandingsData - date: "${dateStr}"`);
    setIsStandingsLoading(true);
    setStandingsError(null);
    try {
      const res = await fetch(`/api/kbo/standings?date=${dateStr}`);
      const data = await res.json();
      
      if (!res.ok || data.success === false) {
        throw new Error(data.error || `서버 응답 오류 (상태: ${res.status})`);
      }
      
      if (data && data.standings) {
        setStandings(data.standings);
        console.log(`[KboTodayGamesAndStandings] [SUCCESS] fetchStandingsData - Mapped ${data.standings.length} standings.`);
      }
    } catch (err: any) {
      console.error('[KboTodayGamesAndStandings] fetchStandingsData 실패:', err);
      setStandingsError(`순위표 데이터를 수집하지 못했습니다: ${err.message}`);
    } finally {
      setIsStandingsLoading(false);
    }
  };

  /**
   * @function fetchTodayGamesData
   * @description 백엔드 API인 /api/kbo/today-games?date=... 로부터 경기 일정 및 승률 예측 데이터를 가져옵니다.
   */
  const fetchTodayGamesData = async (dateStr: string) => {
    console.log(`[KboTodayGamesAndStandings] [CALL] fetchTodayGamesData - date: "${dateStr}"`);
    setIsGamesLoading(true);
    setGamesError(null);
    try {
      const res = await fetch(`/api/kbo/today-games?date=${dateStr}`);
      const data = await res.json();
      
      if (!res.ok || data.success === false) {
        throw new Error(data.error || `서버 응답 오류 (상태: ${res.status})`);
      }

      if (data && data.games) {
        setGames(data.games);
        console.log(`[KboTodayGamesAndStandings] [SUCCESS] fetchTodayGamesData - Mapped ${data.games.length} games.`);
        
        // 새로 불러왔을 때 모든 경기는 기본적으로 닫아두되 첫 경기만 열어둠
        const initialExpanded: Record<string, boolean> = {};
        data.games.forEach((g: TodayGame, index: number) => {
          initialExpanded[g.gameId] = index === 0;
        });
        setExpandedGames(initialExpanded);
      }
    } catch (err: any) {
      console.error('[KboTodayGamesAndStandings] fetchTodayGamesData 실패:', err);
      setGamesError(`경기 일정 데이터를 수집하지 못했습니다: ${err.message}`);
    } finally {
      setIsGamesLoading(false);
    }
  };

  /**
   * @function handleManualRefresh
   * @description 실시간 수집기인 /api/kbo/refresh?date=... 를 직접 격발하여 최신 데이터를 크롤링하고 수집합니다.
   */
  const handleManualRefresh = async () => {
    console.log(`[KboTodayGamesAndStandings] [CALL] handleManualRefresh - Requesting server crawl for date: "${targetDate}"`);
    if (isRefreshing || cooldownRemaining > 0) return;
    
    setIsRefreshing(true);
    setErrorMsg(null);
    setStandingsError(null);
    setGamesError(null);
    setRefreshMessage(null);

    try {
      const res = await fetch(`/api/kbo/refresh?date=${targetDate}`);
      const data = await res.json();
      
      if (res.status === 429) {
        // Rate limit hit
        console.warn(`[KboTodayGamesAndStandings] Rate limit hit. Cooldown remaining: ${data.cooldownSeconds}s`);
        setCooldownRemaining(data.cooldownSeconds || 300);
        setErrorMsg(`수동 새로고침 요청이 제한되었습니다. ${data.cooldownSeconds}초만 기다려주세요.`);
        return;
      }

      if (!res.ok || data.success === false) {
        throw new Error(data.message || data.error || '수동 갱신 실행 중 오류 발생');
      }

      console.log('[KboTodayGamesAndStandings] Server re-crawled successfully.');
      setRefreshMessage(`KBO 공식 실시간 데이터 수집 성공! (갱신 소요: ${data.durationMs}ms)`);
      
      // 최신 데이터 가져오기 재수행
      await Promise.all([
        fetchStandingsData(targetDate),
        fetchTodayGamesData(targetDate)
      ]);
    } catch (err: any) {
      console.error('[KboTodayGamesAndStandings] handleManualRefresh 실패:', err);
      setErrorMsg(`실시간 데이터 크롤링 수집에 실패했습니다: ${err.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Cooldown Countdown Timer
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const interval = setInterval(() => {
      setCooldownRemaining(prev => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  // Load date changes
  useEffect(() => {
    fetchStandingsData(targetDate);
    fetchTodayGamesData(targetDate);
  }, [targetDate]);

  /**
   * @function toggleExpandGame
   * @description 특정 경기의 상세 영역(선발진비교, 라인업, 분석원인) 가시성을 반전시킵니다.
   * @param {string} gameId 경기 식별자
   */
  const toggleExpandGame = (gameId: string) => {
    console.log(`[KboTodayGamesAndStandings] [CALL] toggleExpandGame - gameId: "${gameId}"`);
    setExpandedGames(prev => ({
      ...prev,
      [gameId]: !prev[gameId]
    }));
  };

  /**
   * @function getTeamColor
   * @description CONFIG 구단 정보를 참고해 팀 컬러 클래스를 반환합니다.
   * @param {string} teamCode 구단 식별코드
   */
  const getTeamColor = (teamCode: string): string => {
    return CONFIG.TEAMS[teamCode]?.color || 'bg-slate-500';
  };

  /**
   * @function getTeamNameKo
   * @description CONFIG 구단 정보를 참고해 한국어 구단 명칭을 반환합니다.
   * @param {string} teamCode 구단 식별코드
   */
  const getTeamNameKo = (teamCode: string): string => {
    return CONFIG.TEAMS[teamCode]?.nameKo || teamCode;
  };

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-fade-in" id="kbo-live-standings-games-widget">
      
      {/* Widget Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-950 to-blue-950 p-6 text-white border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Live Sync & Predictor</span>
          </div>
          <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
            ⚾ KBO 실시간 순위 & 당일 경기 승률 분석
          </h2>
          <p className="text-xs text-slate-400 font-medium">
            한국시간(Asia/Seoul) 기준 실시간 수집된 당일 구단 순위표와 경기별 매치업 승률 분석 정보를 시각화하여 보여줍니다.
          </p>
        </div>

        {/* Action Controls & Date pickers */}
        <div className="flex flex-wrap items-center gap-2.5">
          
          {/* Refresh Buttons */}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing || cooldownRemaining > 0}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 border shrink-0 ${
              cooldownRemaining > 0
                ? 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-500 cursor-pointer'
            }`}
            title="KBO 공식 웹사이트 실시간 크롤러 직접 가동"
            id="crawl-refresh-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing 
              ? '수집 크롤러 가동중...' 
              : cooldownRemaining > 0 
                ? `대기 (${cooldownRemaining}초)` 
                : '최신 정보 크롤링 수집'
            }
          </button>

          {/* Date Selector */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 flex items-center gap-1.5 shadow-inner">
            <Calendar className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
            <input 
              type="date" 
              value={targetDate}
              onChange={(e) => {
                if (e.target.value) {
                  console.log(`[KboTodayGamesAndStandings] Selected date via calendar: ${e.target.value}`);
                  setTargetDate(e.target.value);
                }
              }}
              className="bg-transparent text-white text-xs font-bold focus:outline-none pr-1 cursor-pointer"
              id="kbo-widget-date-picker"
            />
            {targetDate !== todayKst && (
              <button 
                onClick={() => setTargetDate(todayKst)}
                className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded text-[9px] font-black cursor-pointer uppercase tracking-tight"
              >
                오늘
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Navigation Sub Tabs */}
      <div className="bg-slate-50 border-b border-slate-100 px-4 flex items-center justify-between gap-4">
        <div className="flex gap-1.5 pt-3">
          <button
            onClick={() => setActiveTab('games')}
            className={`px-4.5 py-2.5 font-bold text-xs rounded-t-xl transition-all flex items-center gap-2 relative ${
              activeTab === 'games'
                ? 'bg-white border-t border-x border-slate-200 text-blue-600 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            id="tab-games-btn"
          >
            <Clock className="w-3.5 h-3.5" />
            당일 경기 일정 및 승률 예측 ({games.length}경기)
            {activeTab === 'games' && <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-white z-10" />}
          </button>
          
          <button
            onClick={() => setActiveTab('standings')}
            className={`px-4.5 py-2.5 font-bold text-xs rounded-t-xl transition-all flex items-center gap-2 relative ${
              activeTab === 'standings'
                ? 'bg-white border-t border-x border-slate-200 text-blue-600 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            id="tab-standings-btn"
          >
            <BarChart4 className="w-3.5 h-3.5" />
            실시간 현재 팀 순위표
            {activeTab === 'standings' && <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-white z-10" />}
          </button>
        </div>

        {/* Disclaimer Trigger Notice */}
        <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5 pb-2.5 md:pb-0">
          <Info className="w-3.5 h-3.5 text-slate-300" />
          <span>승률 예측은 도박 목적이 아닌 단순 분석·시뮬레이션 정보용입니다.</span>
        </div>
      </div>

      {/* Status messages block */}
      {refreshMessage && (
        <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-2.5 text-xs text-emerald-800 font-bold flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{refreshMessage}</span>
        </div>
      )}
      {errorMsg && (
        <div className="bg-rose-50 border-b border-rose-100 px-6 py-2.5 text-xs text-rose-800 font-bold flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Widget Content Space */}
      <div className="p-6">
        
        {/* Loading Indicator */}
        {((activeTab === 'standings' && isStandingsLoading) || (activeTab === 'games' && isGamesLoading)) && (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-xs text-slate-400 font-bold">KBO 리그 데이터 파싱 및 조립 연산 중...</p>
          </div>
        )}

        {/* Tab 1: 당일 경기 일정 및 승률 예측 */}
        {activeTab === 'games' && !isGamesLoading && (
          <div className="space-y-4">
            
            {gamesError ? (
              <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
                <div className="flex items-start gap-3 text-rose-800">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold">경기 일정 데이터를 불러오지 못했습니다.</p>
                    <p className="text-xs text-rose-600 font-semibold leading-relaxed">{gamesError}</p>
                  </div>
                </div>
                <div className="pt-1 flex items-center gap-2">
                  <button 
                    onClick={() => fetchTodayGamesData(targetDate)}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-extrabold rounded-lg shadow-sm transition-all cursor-pointer"
                  >
                    일정 다시 불러오기
                  </button>
                  <button 
                    onClick={handleManualRefresh}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-950 text-white text-[11px] font-extrabold rounded-lg shadow-sm transition-all cursor-pointer"
                  >
                    KBO 공식 사이트 실시간 크롤링 시도
                  </button>
                </div>
              </div>
            ) : games.length === 0 ? (
              <div className="py-12 text-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl space-y-1">
                <Calendar className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-bold text-slate-600">선택하신 날짜({targetDate})에는 예정된 KBO 경기가 존재하지 않습니다.</p>
                <p className="text-[11px] text-slate-400 font-medium">프로야구 미편성 기간이거나 월요일(휴식일) 혹은 우천 취소된 일정일 수 있습니다.</p>
              </div>
            ) : (
              <div className="space-y-4">
                
                {games.map((g) => {
                  const isExpanded = !!expandedGames[g.gameId];
                  const awayWinPct = g.prediction ? Math.round(g.prediction.awayWinProbability * 100) : 50;
                  const homeWinPct = g.prediction ? Math.round(g.prediction.homeWinProbability * 100) : 50;

                  return (
                    <div 
                      key={g.gameId}
                      className={`border rounded-xl transition-all duration-300 overflow-hidden shadow-sm hover:shadow-md ${
                        isExpanded ? 'border-slate-300 bg-slate-50/20' : 'border-slate-150 bg-white'
                      }`}
                    >
                      {/* Accordion Summary Row */}
                      <div 
                        onClick={() => toggleExpandGame(g.gameId)}
                        className="p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 cursor-pointer select-none transition-colors hover:bg-slate-50/50"
                      >
                        {/* Game Meta & Status */}
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          <div className="p-2 bg-slate-100 rounded-lg text-center min-w-[50px] shrink-0">
                            <span className="text-[10px] font-black font-mono text-slate-500 block">TIME</span>
                            <span className="text-xs font-black font-mono text-slate-800">{g.time}</span>
                          </div>
                          
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
                              <MapPin className="w-3.5 h-3.5" />
                              <span>{g.stadium} 구장</span>
                            </div>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                              g.status === '종료' ? 'bg-slate-200 text-slate-700' :
                              g.status === '진행중' ? 'bg-emerald-100 text-emerald-800 animate-pulse' :
                              g.status === '우천취소' ? 'bg-rose-100 text-rose-800' :
                              'bg-blue-50 text-blue-700'
                            }`}>
                              {g.status}
                            </span>
                          </div>
                        </div>

                        {/* Versus Matchup Visual Block */}
                        <div className="flex items-center justify-center gap-4 md:gap-8 flex-1">
                          
                          {/* Away Team */}
                          <div className="flex items-center gap-2.5 w-24 sm:w-32 justify-end text-right">
                            <span className="text-sm font-black text-slate-800">{getTeamNameKo(g.awayTeam)}</span>
                            <span className={`w-7 h-7 rounded-full text-white font-black text-xs flex items-center justify-center shrink-0 ${getTeamColor(g.awayTeam)}`}>
                              {CONFIG.TEAMS[g.awayTeam]?.logoChar || g.awayTeam[0]}
                            </span>
                          </div>

                          {/* Prediction probability slider */}
                          <div className="flex flex-col items-center flex-1 max-w-[160px] md:max-w-[200px] gap-1.5">
                            <div className="w-full h-2 rounded-full bg-slate-100 flex overflow-hidden border border-slate-200">
                              <div 
                                className={`${getTeamColor(g.awayTeam)} h-full transition-all duration-500`}
                                style={{ width: `${awayWinPct}%` }}
                              />
                              <div 
                                className={`${getTeamColor(g.homeTeam)} h-full transition-all duration-500`}
                                style={{ width: `${homeWinPct}%` }}
                              />
                            </div>
                            <div className="w-full flex items-center justify-between text-[11px] font-extrabold text-slate-600 font-mono">
                              <span className={awayWinPct > homeWinPct ? 'text-rose-600 font-black' : ''}>{awayWinPct}%</span>
                              <span className="text-[10px] font-black text-slate-400">vs</span>
                              <span className={homeWinPct > awayWinPct ? 'text-blue-600 font-black' : ''}>{homeWinPct}%</span>
                            </div>
                          </div>

                          {/* Home Team */}
                          <div className="flex items-center gap-2.5 w-24 sm:w-32 justify-start text-left">
                            <span className={`w-7 h-7 rounded-full text-white font-black text-xs flex items-center justify-center shrink-0 ${getTeamColor(g.homeTeam)}`}>
                              {CONFIG.TEAMS[g.homeTeam]?.logoChar || g.homeTeam[0]}
                            </span>
                            <span className="text-sm font-black text-slate-800">{getTeamNameKo(g.homeTeam)}</span>
                          </div>

                        </div>

                        {/* Expand Button */}
                        <div className="text-slate-400 hover:text-slate-600">
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </div>

                      {/* Accordion Detailed Content Grid */}
                      {isExpanded && (
                        <div className="border-t border-slate-150 p-5 bg-slate-50/40 space-y-5 animate-fade-in text-xs text-slate-700">
                          
                          {/* 1. Starter Pitcher Duel Grid */}
                          <div className="space-y-2">
                            <h4 className="font-extrabold text-slate-800 flex items-center gap-1.5 pb-1 border-b border-dashed border-slate-200">
                              <User className="w-4 h-4 text-blue-600" />
                              예상 선발투수 스탯 바 비교 (Starter Matchup)
                            </h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1.5">
                              {/* Left: Away Starter */}
                              <div className="bg-white p-3.5 rounded-lg border border-slate-150 space-y-2 shadow-sm">
                                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                  <span className="font-extrabold text-slate-800">{g.awayStarter?.name || '투수 정보 없음'}</span>
                                  <span className={`text-[10px] text-white font-bold px-2 py-0.5 rounded-full ${getTeamColor(g.awayTeam)}`}>
                                    {getTeamNameKo(g.awayTeam)} 선발
                                  </span>
                                </div>
                                
                                {g.awayStarter ? (
                                  <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-medium text-slate-600 font-mono">
                                    <div>
                                      <span className="block text-[10px] text-slate-400 font-bold mb-0.5">승-패</span>
                                      <strong className="text-slate-800 font-extrabold">{g.awayStarter.wins}승 {g.awayStarter.losses}패</strong>
                                    </div>
                                    <div>
                                      <span className="block text-[10px] text-slate-400 font-bold mb-0.5">시즌 ERA</span>
                                      <strong className="text-rose-600 font-black">{g.awayStarter.era.toFixed(2)}</strong>
                                    </div>
                                    <div>
                                      <span className="block text-[10px] text-slate-400 font-bold mb-0.5">WHIP / 삼진</span>
                                      <strong className="text-slate-800 font-bold">{g.awayStarter.whip.toFixed(2)} / {g.awayStarter.strikeouts}K</strong>
                                    </div>
                                    <div className="col-span-3 pt-1 border-t border-slate-50 text-[10px] text-left text-slate-500 font-sans flex items-center gap-1">
                                      <Activity className="w-3.5 h-3.5 text-slate-400" />
                                      <span>최근 3경기 가상 가중 ERA: <strong>{g.awayStarter.recentEra.toFixed(2)}</strong></span>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-slate-400 text-center py-2">등록된 선발 스탯이 부재하여 구단 평균 지표가 활용됩니다.</p>
                                )}
                              </div>

                              {/* Right: Home Starter */}
                              <div className="bg-white p-3.5 rounded-lg border border-slate-150 space-y-2 shadow-sm">
                                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                  <span className={`text-[10px] text-white font-bold px-2 py-0.5 rounded-full ${getTeamColor(g.homeTeam)}`}>
                                    {getTeamNameKo(g.homeTeam)} 선발
                                  </span>
                                  <span className="font-extrabold text-slate-800">{g.homeStarter?.name || '투수 정보 없음'}</span>
                                </div>

                                {g.homeStarter ? (
                                  <div className="grid grid-cols-3 gap-2 text-center text-[11px] font-medium text-slate-600 font-mono">
                                    <div>
                                      <span className="block text-[10px] text-slate-400 font-bold mb-0.5">승-패</span>
                                      <strong className="text-slate-800 font-extrabold">{g.homeStarter.wins}승 {g.homeStarter.losses}패</strong>
                                    </div>
                                    <div>
                                      <span className="block text-[10px] text-slate-400 font-bold mb-0.5">시즌 ERA</span>
                                      <strong className="text-rose-600 font-black">{g.homeStarter.era.toFixed(2)}</strong>
                                    </div>
                                    <div>
                                      <span className="block text-[10px] text-slate-400 font-bold mb-0.5">WHIP / 삼진</span>
                                      <strong className="text-slate-800 font-bold">{g.homeStarter.whip.toFixed(2)} / {g.homeStarter.strikeouts}K</strong>
                                    </div>
                                    <div className="col-span-3 pt-1 border-t border-slate-50 text-[10px] text-left text-slate-500 font-sans flex items-center gap-1">
                                      <Activity className="w-3.5 h-3.5 text-slate-400" />
                                      <span>최근 3경기 가상 가중 ERA: <strong>{g.homeStarter.recentEra.toFixed(2)}</strong></span>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-slate-400 text-center py-2">등록된 선발 스탯이 부재하여 구단 평균 지표가 활용됩니다.</p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 2. Expected Lineup Comparison Grid */}
                          <div className="space-y-2">
                            <h4 className="font-extrabold text-slate-800 flex items-center gap-1.5 pb-1 border-b border-dashed border-slate-200">
                              <Users className="w-4 h-4 text-indigo-600" />
                              예상 타자 라인업 비교 (Lineup Matchup)
                            </h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1.5">
                              {/* Away Lineup Table */}
                              <div className="bg-white rounded-lg border border-slate-150 overflow-hidden shadow-sm">
                                <div className={`px-3 py-2 text-white font-extrabold text-[11px] flex justify-between ${getTeamColor(g.awayTeam)}`}>
                                  <span>{getTeamNameKo(g.awayTeam)} 타선 라인업</span>
                                  <span className="text-[10px] opacity-80">예상 라인업</span>
                                </div>
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-slate-50 text-slate-400 font-black text-[9px] border-b border-slate-100 font-sans">
                                      <th className="p-2 text-center w-8">타순</th>
                                      <th className="p-2 w-10">포지션</th>
                                      <th className="p-2">선수명</th>
                                      <th className="p-2 text-center w-14 font-mono">타율</th>
                                      <th className="p-2 text-center w-14 font-mono">OPS</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {g.awayLineup && g.awayLineup.length > 0 ? (
                                      g.awayLineup.map((bat) => (
                                        <tr key={bat.battingOrder} className="border-b border-slate-50 text-[11px] font-semibold text-slate-600 hover:bg-slate-50/50">
                                          <td className="p-1.5 text-center font-bold text-slate-400 font-mono">{bat.battingOrder}</td>
                                          <td className="p-1.5 text-slate-400 font-bold">{bat.position}</td>
                                          <td className="p-1.5 text-slate-800 font-extrabold">{bat.name}</td>
                                          <td className="p-1.5 text-center font-mono">{bat.battingAvg.toFixed(3)}</td>
                                          <td className="p-1.5 text-center font-mono text-indigo-600 font-bold">{bat.ops.toFixed(3)}</td>
                                        </tr>
                                      ))
                                    ) : (
                                      <tr>
                                        <td colSpan={5} className="p-4 text-center text-slate-400">타선 정보가 부재합니다.</td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>

                              {/* Home Lineup Table */}
                              <div className="bg-white rounded-lg border border-slate-150 overflow-hidden shadow-sm">
                                <div className={`px-3 py-2 text-white font-extrabold text-[11px] flex justify-between ${getTeamColor(g.homeTeam)}`}>
                                  <span>{getTeamNameKo(g.homeTeam)} 타선 라인업</span>
                                  <span className="text-[10px] opacity-80">예상 라인업</span>
                                </div>
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-slate-50 text-slate-400 font-black text-[9px] border-b border-slate-100 font-sans">
                                      <th className="p-2 text-center w-8">타순</th>
                                      <th className="p-2 w-10">포지션</th>
                                      <th className="p-2">선수명</th>
                                      <th className="p-2 text-center w-14 font-mono">타율</th>
                                      <th className="p-2 text-center w-14 font-mono">OPS</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {g.homeLineup && g.homeLineup.length > 0 ? (
                                      g.homeLineup.map((bat) => (
                                        <tr key={bat.battingOrder} className="border-b border-slate-50 text-[11px] font-semibold text-slate-600 hover:bg-slate-50/50">
                                          <td className="p-1.5 text-center font-bold text-slate-400 font-mono">{bat.battingOrder}</td>
                                          <td className="p-1.5 text-slate-400 font-bold">{bat.position}</td>
                                          <td className="p-1.5 text-slate-800 font-extrabold">{bat.name}</td>
                                          <td className="p-1.5 text-center font-mono">{bat.battingAvg.toFixed(3)}</td>
                                          <td className="p-1.5 text-center font-mono text-indigo-600 font-bold">{bat.ops.toFixed(3)}</td>
                                        </tr>
                                      ))
                                    ) : (
                                      <tr>
                                        <td colSpan={5} className="p-4 text-center text-slate-400">타선 정보가 부재합니다.</td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>

                          {/* 3. Prediction Factors Analysis */}
                          {g.prediction && (
                            <div className="bg-blue-50/60 rounded-xl p-4.5 border border-blue-100 space-y-2.5 shadow-inner">
                              <div className="flex items-center justify-between">
                                <h5 className="font-extrabold text-blue-900 flex items-center gap-1.5 text-xs">
                                  <TrendingUp className="w-4 h-4" />
                                  구장/매치업 가중치 정밀 분석 리포트 (Prediction Factors)
                                </h5>
                                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${
                                  g.prediction.confidence === '높음' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                                  g.prediction.confidence === '보통' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                                  'bg-slate-100 text-slate-700 border-slate-200'
                                }`}>
                                  신뢰도: {g.prediction.confidence}
                                </span>
                              </div>

                              <p className="text-slate-700 leading-relaxed font-medium">
                                {g.prediction.summary}
                              </p>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1.5 text-[11px] font-medium text-slate-600 font-sans">
                                {g.prediction.factors.map((fac, idx) => (
                                  <div key={idx} className="flex items-start gap-1.5 bg-white p-2 rounded border border-slate-150">
                                    <span className="text-blue-600 mt-0.5 shrink-0 font-bold">•</span>
                                    <span>{fac}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  );
                })}

              </div>
            )}

          </div>
        )}

        {/* Tab 2: 실시간 현재 팀 순위표 */}
        {activeTab === 'standings' && !isStandingsLoading && (
          <div className="space-y-4">
            {standingsError ? (
              <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
                <div className="flex items-start gap-3 text-rose-800">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold">순위표 데이터를 불러오지 못했습니다.</p>
                    <p className="text-xs text-rose-600 font-semibold leading-relaxed">{standingsError}</p>
                  </div>
                </div>
                <div className="pt-1 flex items-center gap-2">
                  <button 
                    onClick={() => fetchStandingsData(targetDate)}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-extrabold rounded-lg shadow-sm transition-all cursor-pointer"
                  >
                    순위표 다시 불러오기
                  </button>
                  <button 
                    onClick={handleManualRefresh}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-950 text-white text-[11px] font-extrabold rounded-lg shadow-sm transition-all cursor-pointer"
                  >
                    KBO 공식 사이트 실시간 크롤링 시도
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-150 rounded-xl shadow-inner bg-white">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white font-extrabold text-[11px] uppercase tracking-wider font-sans border-b border-slate-800">
                      <th className="p-3.5 text-center w-12">순위</th>
                      <th className="p-3.5 w-24">구단명</th>
                      <th className="p-3.5 text-center w-16">경기수</th>
                      <th className="p-3.5 text-center w-14">승</th>
                      <th className="p-3.5 text-center w-14">패</th>
                      <th className="p-3.5 text-center w-14">무</th>
                      <th className="p-3.5 text-center w-18">승률</th>
                      <th className="p-3.5 text-center w-18">게임차</th>
                      <th className="p-3.5 text-center w-24">최근 10경기</th>
                      <th className="p-3.5 text-center w-18">연승/연패</th>
                      <th className="p-3.5 text-center w-24">득점/실점</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.length > 0 ? (
                      standings.map((team, idx) => {
                        const isTop5 = team.rank <= 5;
                        const code = team.teamName; // e.g. LG, SAMSUNG

                        return (
                          <tr 
                            key={idx}
                            className={`border-b border-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors ${
                              isTop5 ? 'bg-emerald-50/10 font-bold' : ''
                            }`}
                          >
                            {/* Rank */}
                            <td className="p-3.5 text-center">
                              <span className={`inline-flex items-center justify-center w-5.5 h-5.5 rounded-full text-xs font-black ${
                                team.rank === 1 ? 'bg-amber-500 text-white' :
                                team.rank === 2 ? 'bg-slate-400 text-white' :
                                team.rank === 3 ? 'bg-amber-700 text-white' :
                                isTop5 ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                'bg-slate-100 text-slate-500'
                              }`}>
                                {team.rank}
                              </span>
                            </td>

                            {/* Team Name Badge */}
                            <td className="p-3.5">
                              <div className="flex items-center gap-2">
                                <span className={`w-5 h-5 rounded-full text-white font-black text-[10px] flex items-center justify-center shrink-0 ${getTeamColor(code)}`}>
                                  {CONFIG.TEAMS[code]?.logoChar || code[0]}
                                </span>
                                <span className="text-slate-900 font-extrabold">{team.teamName}</span>
                              </div>
                            </td>

                            {/* Stats columns */}
                            <td className="p-3.5 text-center font-bold text-slate-500 font-mono">{team.games}</td>
                            <td className="p-3.5 text-center font-extrabold text-slate-800 font-mono">{team.wins}</td>
                            <td className="p-3.5 text-center font-extrabold text-slate-800 font-mono">{team.losses}</td>
                            <td className="p-3.5 text-center font-bold text-slate-400 font-mono">{team.draws}</td>
                            
                            <td className="p-3.5 text-center font-extrabold text-blue-600 font-mono">
                              {team.winningPct.toFixed(3)}
                            </td>

                            {/* Games behind */}
                            <td className="p-3.5 text-center font-bold text-slate-500 font-mono">
                              {team.gamesBehind === 0 ? '-' : team.gamesBehind.toFixed(1)}
                            </td>

                            {/* Last 10 games */}
                            <td className="p-3.5 text-center font-mono text-slate-600">{team.last10}</td>
                            
                            {/* Streak */}
                            <td className="p-3.5 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black ${
                                team.streak.startsWith('승') 
                                  ? 'bg-rose-100 text-rose-800' 
                                  : team.streak.startsWith('패') 
                                    ? 'bg-blue-100 text-blue-800' 
                                    : 'bg-slate-100 text-slate-600'
                              }`}>
                                {team.streak}
                              </span>
                            </td>

                            {/* Runs / RunsAllowed */}
                            <td className="p-3.5 text-center font-mono text-[11px] text-slate-500">
                              <span className="text-slate-800 font-bold">{team.runs}</span>
                              <span className="text-slate-300 mx-1">/</span>
                              <span>{team.runsAllowed}</span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-slate-400">순위표 데이터를 정상 수집하지 못했습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </section>
  );
}
