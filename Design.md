# ⚾ KBO 가을야구 진출 확률 계산기 설계 문서 (Design.md)

이 문서는 본 웹 애플리케이션의 아키텍처, 파일 구성, 다중 데이터 소스 연동 및 보정 체계, 몬테카를로 시뮬레이션 계산 모델에 대한 상세 기술 사양을 담고 있습니다.

---

## 1. 개요 및 시스템 목적
본 앱은 실시간 프로야구 순위 및 일정 데이터를 연동하여 잔여 시즌 동안 각 구단이 최종 5위 이내(포스트시즌 와일드카드 결정전 포함)에 진입할 확률을 정밀하게 통계적으로 연산하는 예측 시스템입니다. 
Vercel Serverless Function 환경에서 불규칙한 데이터 소스의 차단이나 응답 지연(Timeouts) 문제에 대응해, 다중 데이터 소스 자동 우회(Multi-Source Adaptive Adapter) 패턴을 핵심으로 설계되었습니다.

---

## 2. 파일 및 폴더 구조 (Directory Tree)

기능별 응집도를 높이고 관리 효율을 극대화하기 위해 코드가 고도로 모듈화되어 분리되어 있습니다.

```
/
├── api/                             # Vercel Serverless HTTP Endpoints
│   ├── health.ts                    # 서버 헬스체크 및 자가진단 엔드포인트
│   ├── simulate.ts                  # 몬테카를로 시즌 시뮬레이션 계산
│   └── kbo/
│       ├── standings.ts             # 당일/과거 KBO 구단별 순위 데이터 조회
│       └── schedule.ts              # 잔여 일정 및 우천 취소 순연 경기 조회
│
├── src/
│   ├── App.tsx                      # 메인 대시보드 UI 및 프론트엔드 연동 상태 관리
│   ├── main.tsx                     # React 엔트리 포인트
│   ├── index.css                    # Tailwind CSS 및 스타일링
│   ├── types.ts                     # 전역 공통 TypeScript 타입/인터페이스 정의
│   ├── config.ts                    # 글로벌 상수 및 팀 메타데이터 설정
│   │
│   ├── components/                  # UI 컴포넌트 분리
│   │   ├── DateControl.tsx          # 날짜 선택 및 수집 트리거 컨트롤러
│   │   ├── SimulationControls.tsx   # 시뮬레이션 파라미터 (횟수, 시드, 모델) 제어
│   │   ├── ProbabilityCards.tsx     # 구단별 진출 확률 상단 요약 카드
│   │   ├── ProbabilityTable.tsx     # 구단별 상세 기록 분석 데이터 테이블
│   │   ├── RankDistribution.tsx     # 최종 예상 순위 분포 히트맵 시각화
│   │   └── DataQualityNotice.tsx    # 미확정 경기 및 품질 가이드 경고
│   │
│   └── lib/
│       ├── kbo/
│       │   ├── buildSnapshotByDate.ts # 과거 시점 순위표 역산/재구성 모듈
│       │   ├── parseStandings.ts      # KBO standings 기본 인터페이스 및 긴급 데이터 생성
│       │   ├── parseSchedule.ts       # KBO schedule 기본 분석 모델
│       │   │
│       │   └── sources/               # [NEW] 다중 데이터 소스 어댑터 레이어
│       │       ├── index.ts           # Source Manager (우선순위 스케줄러)
│       │       ├── fetchWithTimeout.ts# 타임아웃(3초) 방지 브라우저-프록시 fetch 유틸
│       │       ├── officialKboEnglishSource.ts # [P1] KBO 영문 공식 웹사이트 스크래퍼
│       │       ├── myKboStatsSource.ts# [P2] MyKBOStats 비공식 보조 소스 스크래퍼
│       │       ├── aiScoreSource.ts   # [P3] AiScore 글로벌 일정/결과 비공식 보조 스크래퍼
│       │       ├── officialKboSource.ts # [P4] KBO 국문 AJAX 기반 스크래퍼
│       │       └── fallbackSource.ts  # [P5] 2026 시즌 내장 예비 오프라인 백업 데이터
│       │
│       └── simulation/
│           ├── simulateSeason.ts      # 몬테카를로 엔진 핵심 구동 로직
│           └── pseudoRandom.ts        # 난수 결정성 유지를 위한 LCG pseudo-random 생성기
```

---

## 3. 다중 데이터 소스 관리 및 예외 극복 (Multi-Source Strategy)

### 3.1 어댑터 인터페이스 (KboDataSource)
모든 데이터 스크래퍼 및 백업 소스는 동일한 인터페이스 규격을 준수하여, 소스 매니저가 유연하게 인터페이스를 순회할 수 있도록 설계되었습니다.

```typescript
export interface KboDataSource {
  id: string;        // 고유 식별자 (예: 'official-kbo-en', 'mykbostats')
  label: string;     // UI에 표시될 이름 (예: 'MyKBOStats 비공식 보조 데이터')
  priority: number;  // 실행 우선순위 (낮을수록 먼저 시도)
  getStandings(date: string): Promise<KBOStandingsResult>;
  getSchedule(fromDate: string): Promise<KBOScheduleResult>;
}
```

### 3.2 수집 우선순위 모델 (Priority Queue)
공식 사이트의 속도 및 서버리스 차단 여부에 따라 다음과 같이 동적 우선순위가 정의됩니다.

1. **우선순위 1 (MyKBOStats):** 가장 안정적인 호스팅과 신속한 파싱 구조를 가진 해외 특화 비공식 보조 데이터 소스. 최우선적으로 조회가 진행됩니다.
2. **우선순위 2 (KBO 공식 영문 사이트):** Vercel IP 대역 차단이 덜하고 경량 테이블 구조를 가짐.
3. **우선순위 3 (TheSportsDB API):** KBO League ID: 4830 데이터를 제공하는 안정적인 글로벌 스포츠 API 소스.
4. **우선순위 4 (로컬 번들 데이터):** 네트워크 자체가 완전 단절되거나 외부 채널 전체 차단 시 즉시 활성화되는 오프라인 백업.

### 3.3 타임아웃 및 샌드박싱 (Sandboxed Fetch)
- 각 데이터 소스를 개별 조회할 때 `Promise.race`를 사용하여 **최대 3초** 이내에 응답이 오지 않으면 자동으로 타임아웃 처리합니다.
- 특정 단계의 소스 연동 실패 시 에러 사유 및 소스명을 `failedSources` 목록에 기록하고, 다음 우선순위 소스로 자동 연쇄 이양(Cascading)됩니다.
- API 레벨(`simulate`, `standings`, `schedule`)은 외부 네트워크 장애 시에 500 오류를 발생시키지 않고, 백업 데이터를 이용하여 무조건 **HTTP 200**으로 결과를 반환하도록 설계되었습니다.

---

## 4. 몬테카를로 시뮬레이션 연산 설계

- **과거 순위 역산:** 사용자가 과거 특정 날짜를 선택하면, 시스템은 선택된 날짜까지의 경기 데이터만 추려 순위를 재구성(`buildSnapshotByDate`)합니다.
- **잔여 경기 가상 매치:** 지정 날짜 이후의 예정 경기(우천 취소 등으로 미확정된 경기 포함)에 대해 몬테카를로 루프를 가동합니다.
- **결정적 난수 생성:** 시뮬레이션 계산 시 일관된 결과를 유도하기 위해 자바스크립트의 비결정적 `Math.random` 대신 Seed 값이 주입되는 Linear Congruential Generator(LCG) 알고리즘을 사용합니다.
- **확률 예측 모델:**
  - `equal` (균등 확률 모델): 각 구단의 전력과 무관하게 홈/원정 각각 50%의 확률 적용.
  - `winRate` (누적 승률 모델): 시뮬레이션 시점의 누적 승률에 따라 가중 확률 계산.
  - `hybrid` (하이브리드 다면 모델): 누적 승률과 홈/원정 가중치 및 최근 10경기 추세를 종합 가중치로 합산 연산.
- **Vercel 실행 제한 방어:** 서버리스 실행 한계 극복을 위해 50,000회 및 100,000회 구동 요청은 내부적으로 최대 **10,000회**로 자동 제한 조절하고 사용자에게 세부 보고 경고(Warning Notice)를 표시합니다.

---

## 5. UI 및 자가진단 대시보드 흐름

### 5.1 데이터 연동 상태 카드
사용하는 소스에 맞추어 색상 연동 체계를 세분화하였습니다.
- KBO 공식 계열 소스: **초록색** ("정상 수집 완료")
- 비공식 보조 소스(MyKBOStats, AiScore): **노란색** ("보조 데이터 연동 중")
- 내장 번들 데이터: **주황색** ("예비 데이터 연동 중")
- API 연산 불능 상태: **빨간색** ("연동 에러 발생")

### 5.2 자가진단 모니터 (Self-Diagnostics Monitor)
각 단계(/api/health ➜ /api/kbo/standings ➜ /api/kbo/schedule ➜ /api/simulate)에 대해 실시간 OK/WARNING/FAIL 상태를 동적으로 추적하고, 검사 과정에서 탈락한 실패 소스 목록(`failedSources`)과 그 이유를 카드에 친절하게 덤프하여 투명하게 운영 상태를 보여줍니다.
