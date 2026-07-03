# KBO 데이터 분석 및 가을야구 시뮬레이션 시스템 설계서 (Design.md)

이 문서는 KBO 실시간 팀 순위표, 당일 경기 일정, 선발 투수 분석 및 몬테카를로 가을야구 진출 확률 시뮬레이터 백엔드와 프론트엔드 아키텍처를 상세히 기술합니다.

---

## 1. 아키텍처 개요 (Architecture Overview)

전체 시스템은 다음과 같은 정교한 계층 구조(Layered Architecture)를 기반으로 하여 견고하고 확장성 높게 구성되어 있습니다.

```
+--------------------------------------------------------+
|                      Client UI                         |
|   - Real-time Leaderboard                              |
|   - Today's Games (Pitcher Profile & Predictions)      |
|   - Monte-Carlo Playoff Probability Simulator          |
+--------------------------------------------------------+
                           |
                           v [Fetch / API call]
+--------------------------------------------------------+
|                     API Layer                          |
|   - /api/kbo/standings (팀 순위 데이터)                |
|   - /api/kbo/today-games (일정 및 선발 투수 분석)      |
|   - /api/kbo/refresh (수동 크롤링 캐시 퍼지 및 재수집)   |
|   - /api/kbo/predictions (경기별 승률 예측 및 세부 지표)|
|   - /api/kbo/schedule (KBO 경기 일정 이력 분석)        |
|   - /api/simulate (가을야구 시뮬레이션 연산)             |
+--------------------------------------------------------+
                           |
                           v [API Execution]
+--------------------------------------------------------+
|                 KBO Core Service Layer                 |
|   - kboDataService.ts                                  |
|     (수집 오케스트레이터, 캐싱 스토어 연동, 장애 복구) |
+--------------------------------------------------------+
       |                           |
       v [Caching & Store]         v [Real-time Scraping]
+-------------------------+     +---------------------------------------------------+
|     Caching Layer       |     |               Scraping Engine Layer               |
|  - cache.ts             |     |  - parseOfficialStandings.ts                      |
|    (Memory & FS cache)  |     |    (1순위: KBO 공식 영문 사이트 파싱)             |
|                         |     |  - parseOfficialScoreboard.ts                     |
|                         |     |    (1순위: KBO 공식 국문 Scoreboard 실시간 파싱)  |
|                         |     |  - parseMyKboSchedule.ts                          |
|                         |     |    (2순위 Fallback: MyKBOStats 주간 일정 파싱)    |
|                         |     |  - parseMyKboGameDetail.ts                        |
|                         |     |    (선발투수 시즌 누적 지표 수집 및 정합 가공)    |
+-------------------------+     +---------------------------------------------------+
                                                           |
                                                           v [HTML Fetching / Validation]
                                +---------------------------------------------------+
                                |            Core Scraping Helpers & Rules          |
                                |  - fetchHtml.ts (User-Agent 순환 및 재시도)       |
                                |  - validateKboData.ts (데이터 수학적 검증 수행)   |
                                |  - dateUtils.ts (KST 기준 날짜 데이터 가상 보장)  |
                                +---------------------------------------------------+
```

---

## 2. 데이터 흐름 및 폴백(Fallback) 기작

### A. KBO 팀 순위표 (Standings) 수집 흐름
1. **1순위 소스 (`parseOfficialStandings`)**: `https://eng.kbo.com/Standings/TeamStandings.aspx` (KBO 공식 영문 순위 페이지)를 긁어옵니다.
2. **검증 및 정합성 체크 (`validateKboData`)**:
   - 총 10개 구단이 온전히 존재하는가?
   - LG 트윈스가 반드시 포함되어 있는가?
   - 경기수(Games) = 승(Wins) + 패(Losses) + 무(Draws) 공식이 수학적으로 만족하는가?
3. **정합성 탈락 또는 수집 장애 시**:
   - 로컬 파일 시스템 또는 메모리 캐시에 이미 저장되어 있던 `latest_good_v2` (안정성이 검증된 마지막 최신 정상 순위표)를 강제로 반환하여 화면 붕괴를 예방합니다.
   - 데이터 노후화 경고(`stale: true`) 및 경고 리스트(`warnings`)를 응답 헤더와 JSON 바디에 동시 탑재합니다.

### B. 경기 일정 및 선발투수 (Schedule & Pitchers) 수집 흐름
1. **1순위 일정 소스 (`parseOfficialScoreboard`)**: KBO 공식 국문 Scoreboard(`https://www.kbo.com/schedule/scoreboard.aspx?date=YYYYMMDD`)를 우선 긁어옵니다.
2. **2순위 일정 Fallback (`parseMyKboSchedule`)**: 국문 Scoreboard 수집 실패 시, 안정적인 주간 일정을 제공하는 MyKBOStats 주간 페이지(`https://mykbostats.com/schedule/week_of/YYYY-MM-DD`)를 긁어와 당일 경기를 추출합니다.
3. **선발투수 상세 지표 수집 (`parseMyKboGameDetail`)**:
   - 일정에서 추출된 경기별 고유 분석 링크를 통해 투수 세부 페이지에 진입합니다.
   - 원정/홈 선발 투수명, 시즌 승-패, 시즌 평균자책점(ERA) 등을 정밀 추출합니다.
   - 만약 특정 경기의 투수 데이터 파싱에 실패하더라도, 전체 당일 경기 일정이 마비되지 않도록 예외 처리를 국소화하여 안정성을 확보했습니다.

---

## 3. 핵심 규칙 및 제약 사항 준수

1. **JSON 표준 안전 응답**:
   - 어떠한 크롤링/파싱 실패 상황에서도 HTTP 500 에러 혹은 브라우저 크래시를 유발하는 Non-JSON 문자열을 내뱉지 않으며, 반드시 `{ success: false, error: '...', message: '...' }` 형태의 규격화된 JSON과 HTTP 200 상태 코드를 반환합니다.
2. **KST 표준시 고정**:
   - UTC 시차로 인한 날짜 밀림 현상을 방지하기 위해 모든 시간 연산은 한국 표준시(KST, UTC+9) 기하 구조를 강제 보장하며, `new Date("YYYY-MM-DD")` 같은 내장 함수 오작동을 차단하는 전용 문자열 처리 도구(`dateUtils.ts`)를 사용합니다.
3. **오염 및 인위적 조작 차단**:
   - LG 경기수 하드코딩 등 일체의 인위적 우회 코드를 제거하여, 스크래핑된 실제 공식 데이터만 신뢰성 있게 서비스합니다.

---

## 4. 디렉토리 및 파일 상세 설계

### A. Core Library (`src/lib/kbo/`)
- `cache.ts`: 메모리 및 파일시스템 2중 캐시 어댑터
- `dateUtils.ts`: KST 전용 날짜 포맷 변환 및 정합성 검사
- `kboDataService.ts`: 순위표 및 일정 수집 및 Fallback 오케스트레이터
- `statsCalculator.ts`: 득실점차, 최근 10경기, 승률 등 세부 지표 계산 엔진
- `predictionEngine.ts`: 선발 투수, 최근 기세, 불펜 전력 가중치 기반 승률 예측 알고리즘

### B. Real-time Scraping Engine (`src/lib/kbo/sources/`)
- `fetchHtml.ts`: 유동적인 User-Agent 생성 및 HTML 안전 조회
- `parseOfficialStandings.ts`: KBO 공식 영문 사이트 파싱 및 구단명 정규화
- `parseOfficialScoreboard.ts`: KBO 공식 국문 스코어보드 실시간 중계 파싱
- `parseMyKboSchedule.ts`: MyKBOStats 일정표 파싱 (백업 소스)
- `parseMyKboGameDetail.ts`: 선발 투수 통계 정보 정밀 파싱
- `validateKboData.ts`: 데이터 유효성 정합성 수리 연산 검사

### C. Serverless API Router (`api/`)
- `/api/kbo/standings.ts`: 최신 순위표 정보 API
- `/api/kbo/today-games.ts`: 당일 경기 일정 및 선발투수 정보 API
- `/api/kbo/predictions.ts`: 경기별 상세 예측 수치 API
- `/api/kbo/schedule.ts`: 경기 역사 및 완료 데이터 이력 API
- `/api/kbo/refresh.ts`: 캐시 강제 무효화 및 크롤러 즉시 작동 API
- `/api/simulate.ts`: 실시간 수집 데이터를 주입받는 몬테카를로 플레이오프 시뮬레이터 API
