
$ledger = @'
/* src/portfolio/ledger.ts */
import { PortfolioSnapshot } from './types';

export function realizedPnL(state: PortfolioSnapshot) {
  return state.ledger.reduce((s, e) => s + (e.realizedPnL || 0), 0);
}
export function cashTotal(state: PortfolioSnapshot) {
  return state.cash.available + state.cash.reserved;
}
export function exportLedgerCSV(state: PortfolioSnapshot) {
  const header = ['id','timestamp','type','symbol','cashDelta','realizedPnL','details'];
  const rows = state.ledger.map(e => [e.id, e.timestamp, e.type, e.symbol || '', e.cashDelta, e.realizedPnL, JSON.stringify(e.details)]);
  return [header, ...rows].map(r => r.join(',')).join('\n');
}
'@
Set-Content -Encoding UTF8 "src\portfolio\ledger.ts" $ledger
