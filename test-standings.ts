import standingsHandler from './api/kbo/standings';
import todayGamesHandler from './api/kbo/today-games';
import predictionsHandler from './api/kbo/predictions';
import refreshHandler from './api/kbo/refresh';

const makeMockRes = (name: string) => {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(key: string, val: string) {
      this.headers[key] = val;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      console.log(`[TEST ${name}] JSON RESPONSE (Status ${this.statusCode}):`, typeof data === 'object' ? Object.keys(data) : data);
      if (data.error) {
        console.error(`[TEST ${name}] Error details:`, data);
      }
      return this;
    }
  };
};

async function runTests() {
  console.log('--- 1. Testing Standings API ---');
  await standingsHandler({ query: {} } as any, makeMockRes('Standings') as any);

  console.log('--- 2. Testing Today Games API for 2026-07-01 ---');
  await todayGamesHandler({ query: { date: '2026-07-01' } } as any, makeMockRes('TodayGames') as any);

  console.log('--- 3. Testing Predictions API for 2026-07-01 ---');
  await predictionsHandler({ query: { date: '2026-07-01' } } as any, makeMockRes('Predictions') as any);

  console.log('--- 4. Testing Refresh API (with date 2026-07-01) ---');
  // Refresh might trigger a crawl. Let's see what happens.
  await refreshHandler({ query: { date: '2026-07-01' } } as any, makeMockRes('Refresh') as any);
}

runTests();
