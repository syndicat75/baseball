# KBO 가을야구 진출 확률 계산기 설계 문서 (Design.md)

이 문서는 KBO 프로야구 가을야구(최종 5위 이내) 진출 확률을 계산하는 몬테카를로 시뮬레이션 웹앱의 아키텍처 및 세부 설계 사양을 정의합니다.

---

## 1. 프로젝트 주요 아키텍처 및 폴더 구조
본 애플리케이션은 프론트엔드 React(Vite)와 Vercel Serverless Function 백엔드 구조로 설계되어 Vercel 클라우드 플랫폼 상에 완벽하게 빌드 및 배포됩니다.

```
/
├── api/                    # Vercel Serverless Function API 엔드포인트
│   ├── health.ts           # 서비스 상태 자가진단용 상태 확인 API
│   ├── simulate.ts         # 가을야구 몬테카를로 시뮬레이션 계산 실행 API
│   └── kbo/
│       ├── standings.ts    # 날짜별 구단 공식 순위 정보 파싱 API
│       └── schedule.ts     # 잔여 경기 및 미지정 경기 일정 분석 API
├── vercel.json             # Vercel 배포 시 라우트 재작성 및 배포 규칙 정의 파일
├── metadata.json           # 앱 메타데이터 정의
├── package.json            # 의존성 패키지 및 빌드 스크립트 정의
├── Design.md               # [본 문서] 시스템 아키텍처 및 알고리즘 설명서
├── vite.config.ts          # Vite 번들 설정 및 개발 환경 API 에뮬레이터 탑재
├── src/
│   ├── config.ts           # 공통 설정 상수 (KBO URL, 구단 정보, 시뮬레이션 설정)
│   ├── App.tsx             # 메인 React 화면 (상태값 조정, 대시보드 및 자가진단 패널 조립)
│   ├── index.css           # 글로벌 CSS (Tailwind CSS 바인딩)
│   ├── main.tsx            # React 렌더링 진입점
│   ├── types.ts            # 공용 브라우저 호환 타입 정의 (클라이언트-서버 간 결합도 해결)
│   ├── components/         # 프리젠테이셔널 UI 컴포넌트 단위 분리
│   │   ├── DateControl.tsx         # 분석 기준일 선택 및 갱신 액션 컨트롤러
│   │   ├── SimulationControls.tsx # 시뮬레이션 반복 횟수 및 확률 모델 제어기
│   │   ├── ProbabilityCards.tsx   # 구단별 확률 카드 (진출 확률 상태 뱃지 포함)
│   │   ├── ProbabilityTable.tsx   # 상세 정렬표 (5위 경계선 Bubble Zone 하이라이트 포함)
│   │   ├── RankDistribution.tsx   # 최종 예상 순위 분포 매트릭스 (Heatmap 스타일)
│   │   └── DataQualityNotice.tsx  # 우천취소 미지정 경기 자동 보정 알림판
│   └── lib/
│       ├── kbo/            # KBO 데이터 수집 및 가공 모듈
│       │   ├── cache.ts            # 서버리스 환경 대응 하이브리드 캐시 매니저 (Memory & FS)
│       │   ├── normalizeTeamName.ts# 스크래핑된 한글/영문 구단명을 내부 표준코드로 변환
│       │   ├── parseStandings.ts   # KBO 공식 순위표 파서 (헤더 위치 자동 보정 기능 탑재)
│       │   ├── parseSchedule.ts    # 월별 전체 경기 정보 파서 및 미편성 보정본 생성기
│       │   └── buildSnapshotByDate.ts # 기준일자 시점 순위 및 상대전적 스냅샷 생성기
│       └── simulation/     # 몬테카를로 시뮬레이션 연산 모듈
│           ├── types.ts            # 시뮬레이션 관련 타입 정의
│           ├── probabilityModel.ts # 경기별 승리 확률 산출 모델 (winRate, hybrid, basic)
│           ├── ranking.ts          # 정규시즌 최종 순위 판정 및 동률 경계선 확률 분할 처리
│           └── simulateSeason.ts   # 몬테카를로 반복 연산 루프 코어 엔진
```

---

## 2. KBO 공식 데이터 스크래핑 및 하이브리드 캐싱 구조
브라우저 CORS 제한 우려 및 수집 안정성을 위해 백엔드 API 단에서 KBO 데이터를 수집, 파싱 및 합성합니다.

1. **팀 순위 수집 (`parseStandings.ts`)**
   - URL: `https://www.koreabaseball.com/Record/TeamRank/TeamRank.aspx`
   - 방식: `cheerio`를 사용해 HTML 내 `table` 구조를 탐색하며, 헤더 컬럼명(`팀명`, `승`, `패`, `무` 등)의 위치를 동적으로 검색하여 매핑하므로 페이지 구조 개편 시에도 오차가 발생하지 않는 복원력을 지닙니다.
   - 상대전적: 동일 페이지에 노출되는 `팀간승패표`를 자동 식별하여 백엔드에 10개 구단 매트릭스 데이터를 채웁니다.
   - 실패 대응: 스크래핑 실패 시, 구체적인 네트워크 오류 또는 파서 장애 메시지를 감지하여 에러 정보를 클라이언트에 알리고 내장된 예비 샘플 스냅샷으로 안전하게 자가전환(Source: `fallback-sample`)합니다.

2. **일정 및 결과 수집 (`parseSchedule.ts`)**
   - URL: `https://www.koreabaseball.com/Schedule/Schedule.aspx`
   - 방식: 월별 일정 쿼리 매개변수(`?month=MM&year=YYYY`)를 활용하여 시즌 개막월(3월)부터 폐막월(10월)까지 정규시즌 720개 매치를 수집합니다.
   - 정규식 매칭: `"한화 5vs2 두산"`, `"한화 vs 두산 (우천취소)"` 등 다양한 텍스트 형식을 완벽하게 추출하고, 이미 치러진 경기와 잔여 일정을 분류합니다.

3. **환경 감지형 다중 캐시 어댑터 (`cache.ts`)**
   - 네트워크 과부하 방지 및 응답 속도 극대화를 위해 캐시 레이어를 탑재하였습니다.
   - **FileSystemCacheAdapter**: 로컬 개발 환경(`process.env.VERCEL` 미감지 시)에서 활용하며, 지정된 파일 경로에 물리 JSON을 기록 보관합니다.
   - **MemoryCacheAdapter**: 파일 쓰기 권한이 제한될 수 있는 Vercel Serverless 호스팅 컨테이너 환경에서 활용하며, 인메모리 구조로 빠르게 캐시 히트를 수행합니다.
   - **유연성 확보**: 향후 대규모 배포 혹은 분산 환경 확장을 위해 `CacheAdapter` 인터페이스 구조로 설계하여 Upstash Redis 또는 Vercel KV 등으로 쉽게 수동 어댑터 교체가 가능합니다.

---

## 3. 몬테카를로 시뮬레이션 및 수학적 승률 공식
선택한 분석 기준일까지 완료된 승/패/무 정보를 초기 고정값으로 설정한 뒤, 정규시즌 종료 시점까지 남아 있는 모든 매치를 지정된 승리 확률에 기반해 난수로 실행합니다.

### A. 경기별 승리 확률 연산 모델
- **basic (균등 확률)**
   $$\text{Away Win} = \frac{1 - \text{DrawRate}}{2}, \quad \text{Home Win} = \frac{1 - \text{DrawRate}}{2}$$
   (기본 KBO 전체 무승부 비율 `DrawRate = 2.5%` 사용)

- **winRate (누적 승률 모델 - 기본 선택값)**
   $$\text{AwayWinBase} = \frac{\text{AwayWinRate}}{\text{AwayWinRate} + \text{HomeWinRate}}$$
   $$\text{HomeWinBase} = \frac{\text{HomeWinRate}}{\text{AwayWinRate} + \text{HomeWinRate}}$$
   - **홈팀 가중치**: $\text{HomeWinBase} + 2.5\%$, $\text{AwayWinBase} - 2.5\%$ 보정 적용.
   - 무승부 확률(2.5%)을 보정하여 합이 1.0이 되도록 최종 정규화 스케일링합니다.

- **hybrid (하이브리드 결합 모델)**
   다음 세 가지 요소를 6:2.5:1.5 비율로 가중 합성합니다:
   1. **누적 승률 요인 (60%)**
   2. **상대전적 다승 요인 (25%)** (표본이 3경기 미만일 경우 전체 누적 승률로 회귀)
   3. **최근 10경기 흐름 요인 (15%)** (기준일 이전 완료된 10경기의 승률)
   - 최종 수치에 **홈팀 보정 +2.5%p**를 추가하고 Clamp `[0.1, 0.9]` 후 최종 정규화 처리합니다.

---

## 4. 정밀 동률 판정 및 포스트시즌 진출 확률 산출 (`ranking.ts`)
시뮬레이션 가상시즌이 완료되었을 때 KBO 정규시즌 순위는 승률($\frac{\text{Wins}}{\text{Wins} + \text{Losses}}$)을 기준으로 계산되며 무승부는 승률 산식에서 제외됩니다.

1. **5위권 경계선 동률 발생 시 '확률 분할(Fractional Division)' 공식 구현**
   - 공동 5위 등 승률이 완전히 동일한 구단들이 가을야구 진출 한계선(5위)을 가로질러 존재하는 경우, 남은 한계선 티켓 슬롯을 동률팀의 크기만큼 분할하여 가산합니다.
   - 예: 공동 5위가 3개 팀이고, 남은 가을야구 진출 슬롯이 1개일 경우 각 동률팀에 포스트시즌 진출 가중치를 정확히 **$1/3$회(0.33)** 부여합니다.
   - 이 방식은 몬테카를로 반복 연산이 누적될수록 확률 수치 왜곡을 전면 방지하여 극히 세밀한 승률 수렴을 달성합니다.

2. **최종 확률 도출**
   $$\text{진출 확률} = \frac{\text{진출 가중치 누적합 (Playoff Scores)}}{\text{전체 시뮬레이션 횟수 (Iterations)}} \times 100\%$$

---

## 5. UI/UX 및 대화형 시스템 자가진단 (Self-Diagnostics)
- **반응형 대시보드**: 모바일 및 태블릿에서는 터치 친화적인 가로형 카드 중심 배치를 취하고, 데스크톱 영역에서는 와이드 그리드 데이터 시트와 10위권 전체 순위 확률 분포 매트릭스(Heatmap)를 통해 데이터 밀도를 고도로 확장합니다.
- **가을야구 안심/경쟁 영역 시각 분류**:
   - `안정권 (Safe Zone)`: 진출 확률 90% 이상 (에메랄드 톤 표시)
   - `경쟁권 (Contender Zone)`: 진출 확률 50% ~ 90% 미만 (블루/인디고 톤 표시)
   - `추격권 (Chaser Zone)`: 진출 확률 10% ~ 50% 미만 (오렌지/amber 톤 표시)
   - `탈락 위기 (Difficult Zone)`: 진출 확률 10% 미만 (로즈 톤 표시)
- **단계별 네트워크 자가진단 패널 (Self-Diagnostics)**:
  네트워크 연결 오류 혹은 스크래핑 제약으로 인해 폴백 상태가 될 경우 사용자가 직접 수동 복구할 수 있는 정교한 진단 시퀀스를 탑재하였습니다:
  1. **1단계 API 헬스체크**: `/api/health` 호출을 통해 클라우드 펑션 서비스 동작 정상 여부를 확인합니다. (미배포 혹은 타임아웃 감지)
  2. **2단계 KBO 수집 검증**: `/api/kbo/standings`를 통해 공식 KBO 서버 연결 및 데이터 원본 스크래퍼/파서가 깨지지 않았는지 정밀 테스트합니다.
  3. **3단계 시뮬레이션 계산 검증**: `/api/simulate` API를 호출해 난수 생성 및 몬테카를로 시뮬레이션 연산 서버 로직이 원활히 기동되는지 순차적으로 검증한 후 통과 시 즉시 대시보드에 실시간 정합 데이터를 재반사합니다.
  4. **고장 지점 시각화**: 장애 발생 단계와 상세 원인(네트워크 끊김, KBO 페이지 구조 개편 등)을 사용자 친화적인 메시지로 리포팅하여 투명한 오류 해결책을 선사합니다.

