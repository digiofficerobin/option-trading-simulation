
$readme = @'
# Stock Trading Add-on for Option Simulator

Adds underlying stock trading:
- Cash-secured puts (reserve cash, assignment -> buy @ strike)
- Covered calls (reserve shares, assignment -> sell @ strike)
- Buy/sell with FIFO lots
- Exercise long calls/puts

Quick start:
```ts
import { newPortfolio } from '../src/portfolio/stock';
const pf = newPortfolio(50000, 'USD');

Wire helpers on option events (sell short, assignment, expiry, exercise).
'@
Set-Content -Encoding UTF8 "docs\README_STOCK_TRADING.md" $readme
### E) `tests/stock.test.ts`
```powershell
$test = @'
// tests/stock.test.ts
import { newPortfolio, buyShares, sellShares, reserveCashForShortPut, assignShortPut, reserveSharesForShortCall, assignShortCall, computeUnrealizedPnL } from '../src/portfolio/stock';

function expect(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

(function run() {
  const pf = newPortfolio(10000);
  buyShares(pf, 'ABC', 100, { price: 50 });
  sellShares(pf, 'ABC', 20, { price: 55 });
  reserveSharesForShortCall(pf, 'ABC', 1);
  assignShortCall(pf, 'ABC', { strike: 60, contracts: 1 });
  reserveCashForShortPut(pf, 'ABC', 40, 1);
  assignShortPut(pf, 'ABC', { strike: 40, contracts: 1 });
  const unreal = computeUnrealizedPnL(pf, { ABC: 42 })[0];
  expect(unreal.unrealized === (42 - 40) * 100, 'unrealized pnl');
})();
'@
Set-Content -Encoding UTF8 "tests\stock.test.ts" $test