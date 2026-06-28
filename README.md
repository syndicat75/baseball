# ⚾ KBO 프로야구 가을야구 진출 확률 계산기 (KBO Postseason Simulator)

공식 KBO 리그 순위 및 잔여 경기 일정을 기반으로 한 통계적 몬테카를로 시뮬레이션 웹 어플리케이션입니다.

---

## 📡 클라이언트 정적(Serverlessless) 아키텍처 개요
본 애플리케이션은 서버사이드 API 의존을 완전히 없애고 **100% 브라우저(Client-side) 자가 구동 아키텍처**로 전환하여 설계되었습니다.
이를 통해 기존 Vercel Serverless Function의 10초 타임아웃 제한 및 500 서버 에러 리스크를 원천적으로 종식하였으며 극강의 신뢰성을 보여줍니다.

- **서버 API 미사용:** 앱의 모든 핵심 가을야구 확률 연산과 데이터 핸들링은 서버 API를 호출하지 않고 브라우저 런타임 내에서 이루어집니다.
- **정적 JSON 직접 로드:** 브라우저가 `/data/kbo-latest.json` 또는 날짜별 JSON을 직접 fetch하여 데이터를 획득합니다.
- **브라우저 시뮬레이션:** 몬테카를로 시뮬레이션 계산 엔진이 클라이언트 브라우저 단에서 순수 TypeScript 코드로 실행됩니다.
- **수집 자동화:** 데이터 갱신은 외부 크롤러가 웹앱 구동 시점에 작동하는 대신 **GitHub Actions가 독립적으로 매일 3회 정기 스케줄 수집**하여 파일로 빌드 저장합니다.

```
┌──────────────────────────────────────────────┐
│  [GitHub Actions 스케줄러 (Cron)]            │
│  - scripts/update-kbo-data.ts 정기 수집      │
│  - public/data/kbo-latest.json 파일 생성     │
└──────────────────────┬───────────────────────┘
                       │ (배포 및 동기화)
                       ▼
┌──────────────────────────────────────────────┐
│  [브라우저 정적 자원 획득 (Client-side)]     │
│  - fetch('/data/kbo-latest.json?ts=...')     │
│  - 로드 실패 시 내장 fallback 데이터 사용    │
└──────────────────────┬───────────────────────┘
                       │ (즉시 연동 완료)
                       ▼
┌──────────────────────────────────────────────┐
│  [브라우저 몬테카를로 시뮬레이션 연산]       │
│  - 순수 TypeScript 엔진 기반 브라우저 내 연산│
│  - 500 서버 오류 발생 원천 차단              │
└──────────────────────────────────────────────┘
```

---

## 🚀 주요 기능
- **브라우저 기반 몬테카를로 시뮬레이션 (Monte Carlo Engine):** 정규 시즌의 미치러진 잔여 일정 전체를 수만 회 가상 플레이 구동하여 각 구단이 최종 5위 이내(가을야구 진출 조건)에 포함될 확률을 통계적으로 계산합니다. (10,000회 연산 수십 밀리초 초고속 처리)
- **정적 JSON 로드 및 Fallback 보정:** 예약 수집 JSON 로드 실패 시 내장된 `src/data/fallbackKboData.ts` 번들 데이터로 완전 오프라인 자동 우회하여 서비스 안정성을 완벽히 확보합니다.
- **네트워크 자가진단 모니터 (Self-Diagnostics):** 정적 JSON 파일 정상 로드 상태, 10개 구단 순위표 정합성, 남은 일정 데이터 무결성, 브라우저 엔진 계산 구동성 여부를 실시간 자가 검증합니다.
- **예약 수집 데이터 다시 읽기:** 브라우저 내에서 `/data/kbo-latest.json` 파일을 다시 fetch하여 실시간으로 데이터 최신 상태를 리로드합니다.

---

## 🕒 데이터 수집 스케줄 (GitHub Actions)
KBO 리그 진행 시간을 반영하여 한국 시간(KST) 기준 아래 시각에 자동으로 데이터를 수집하고 빌드를 배포합니다.

- **오전 9:00 (00:00 UTC):** 전날 최종 경기 결과를 최종 반영 및 당일 오전 분석 기준 데이터 구축
- **오후 4:00 (07:00 UTC):** 당일 주중/주말 경기 개시 직전 최종 라인업 및 스냅샷 보강
- **오후 11:00 (14:00 UTC):** 당일 모든 경기 완료 후 가을야구 진출 확률 정밀 업데이트

### 🚀 수동 수집 강제 구동 방법 (Manual Dispatch)
정기 스케줄 외에 즉시 KBO 데이터를 갱신하고 싶을 경우, GitHub 저장소 관리 콘솔에서 워크플로를 수동 실행하여 수집할 수 있습니다.
1. 이 프로젝트의 GitHub 저장소에 접속합니다.
2. 상단 메뉴의 **Actions** 탭으로 이동합니다.
3. 좌측 워크플로 목록에서 **KBO Playoff Data Auto-Harvester (update-kbo-data)**를 클릭합니다.
4. 우측 상단의 **Run workflow** 드롭다운 버튼을 클릭하고 **Run workflow** 버튼을 눌러 즉시 최신 데이터를 수집 및 반영합니다.

---

## 📁 생성되는 수집 데이터 구조 (`public/data/`)
- `kbo-latest.json`: 웹앱이 디폴트로 읽는 가장 최근에 성공적으로 수집 완료된 KBO 순위, 경기 일정 데이터 파일
- `kbo-YYYY-MM-DD.json`: 분석 기준일을 과거 특정 시점으로 변경 시 불러오기 위한 일자별 누적 예비 데이터셋
- `kbo-source-status.json`: 데이터 수집 엔진의 구동 로그, 성공률 및 에러 현황 리포트

---

## 🛠️ 기술 스택
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, Recharts, Motion (from `motion/react`)
- **Harvester:** GitHub Actions, tsx runtime compiler
- **Scraping Engine:** Cheerio, Fetch (with browser imitation headers)

---

## 💻 로컬 개발 환경 실행법

### 1. 패키지 의존성 설치
```bash
npm install
```

### 2. 수동 수집기(Harvester) 1회 작동 (선택 사항)
```bash
npm run update:kbo-data
```
`public/data/kbo-latest.json` 및 `kbo-source-status.json` 파일이 정상적으로 로컬에 생성되는 것을 확인합니다.

### 3. 개발 서버 기동
```bash
npm run dev
```
기본적으로 http://localhost:3000 에서 프론트엔드가 활성화됩니다.
