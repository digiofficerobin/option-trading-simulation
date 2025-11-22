
$stock = @'
/* src/portfolio/stock.ts */
import { CashAccount, StockLot, StockPosition, PortfolioSnapshot, LedgerEntry, FillSpec, AssignSpec } from './types';

function now() { return Date.now(); }
function uid(prefix: string) { return `${prefix}_${Math.random().toString(36).slice(2, 10)}`; }

export function ensurePosition(state: PortfolioSnapshot, symbol: string): StockPosition {
  if (!state.positions[symbol]) {
    state.positions[symbol] = { symbol, lots: [], totalShares: 0, avgCost: 0, reservedShares: 0 };
  }
  return state.positions[symbol];
}

function pushLedger(state: PortfolioSnapshot, entry: LedgerEntry) { state.ledger.push(entry); }

function recalcPosition(pos: StockPosition) {
  const totalShares = pos.lots.reduce((s, l) => s + l.shares, 0);
  const totalCost = pos.lots.reduce((s, l) => s + l.shares * l.costBasis, 0);
  pos.totalShares = totalShares;
  pos.avgCost = totalShares > 0 ? totalCost / totalShares : 0;
}

export function buyShares(state: PortfolioSnapshot, symbol: string, shares: number, fill: FillSpec) {
  const cost = shares * fill.price;
  if (state.cash.available < cost) throw new Error(`Insufficient cash: need ${cost.toFixed(2)}, have ${state.cash.available.toFixed(2)}`);
  state.cash.available -= cost;
  const lot: StockLot = { lotId: uid('lot'), symbol, shares, costBasis: fill.price, openedAt: fill.timestamp ?? now() };
  const pos = ensurePosition(state, symbol);
  pos.lots.push(lot); recalcPosition(pos);
  pushLedger(state, { id: uid('led'), timestamp: fill.timestamp ?? now(), type: 'BUY_STOCK', symbol, details: { shares, price: fill.price }, cashDelta: -cost, realizedPnL: 0 });
}

export function sellShares(state: PortfolioSnapshot, symbol: string, shares: number, fill: FillSpec) {
  const pos = ensurePosition(state, symbol);
  if (shares > (pos.totalShares - pos.reservedShares)) throw new Error(`Insufficient free shares: ${pos.totalShares - pos.reservedShares}`);
  let remaining = shares, realized = 0;
  while (remaining > 0) {
    const lot = pos.lots[0]; if (!lot) throw new Error('Missing lot');
    const use = Math.min(remaining, lot.shares);
    realized += use * (fill.price - lot.costBasis);
    lot.shares -= use; if (lot.shares === 0) pos.lots.shift();
    remaining -= use;
  }
  const proceeds = shares * fill.price;
  state.cash.available += proceeds; recalcPosition(pos);
  pushLedger(state, { id: uid('led'), timestamp: fill.timestamp ?? now(), type: 'SELL_STOCK', symbol, details: { shares, price: fill.price }, cashDelta: +proceeds, realizedPnL: realized });
}

export function reserveSharesForShortCall(state: PortfolioSnapshot, symbol: string, contracts: number, timestamp?: number) {
  const pos = ensurePosition(state, symbol);
  const need = contracts * 100;
  if ((pos.totalShares - pos.reservedShares) < need) throw new Error(`Not enough shares to cover short call: need ${need}`);
  pos.reservedShares += need;
  pushLedger(state, { id: uid('led'), timestamp: timestamp ?? now(), type: 'RESERVE_SHARES', symbol, details: { contracts, sharesReserved: need }, cashDelta: 0, realizedPnL: 0 });
}

export function releaseReservedShares(state: PortfolioSnapshot, symbol: string, contracts: number, timestamp?: number) {
  const pos = ensurePosition(state, symbol);
  const rel = contracts * 100;
  pos.reservedShares = Math.max(0, pos.reservedShares - rel);
  pushLedger(state, { id: uid('led'), timestamp: timestamp ?? now(), type: 'RELEASE_SHARES', symbol, details: { contracts, sharesReleased: rel }, cashDelta: 0, realizedPnL: 0 });
}

export function reserveCashForShortPut(state: PortfolioSnapshot, symbol: string, strike: number, contracts: number, timestamp?: number) {
  const req = strike * 100 * contracts;
  if (state.cash.available < req) throw new Error(`Insufficient cash to sell cash-secured puts: need ${req.toFixed(2)}, have ${state.cash.available.toFixed(2)}`);
  state.cash.available -= req; state.cash.reserved += req;
  pushLedger(state, { id: uid('led'), timestamp: timestamp ?? now(), type: 'RESERVE_CASH', symbol, details: { strike, contracts, amount: req }, cashDelta: -req, realizedPnL: 0 });
}

export function releaseReservedCash(state: PortfolioSnapshot, symbol: string, amount: number, timestamp?: number) {
  const rel = Math.min(amount, state.cash.reserved);
  state.cash.reserved -= rel; state.cash.available += rel;
  pushLedger(state, { id: uid('led'), timestamp: timestamp ?? now(), type: 'RELEASE_CASH', symbol, details: { amount: rel }, cashDelta: +rel, realizedPnL: 0 });
}

export function assignShortPut(state: PortfolioSnapshot, symbol: string, spec: AssignSpec) {
  const need = spec.strike * 100 * spec.contracts;
  if (state.cash.reserved < need) throw new Error(`Reserved cash ${state.cash.reserved.toFixed(2)} < assignment ${need.toFixed(2)}`);
  state.cash.reserved -= need;
  const shares = spec.contracts * 100;
  const pos = ensurePosition(state, symbol);
  const lot: StockLot = { lotId: uid('lot'), symbol, shares, costBasis: spec.strike, openedAt: spec.timestamp ?? now() };
  pos.lots.push(lot); recalcPosition(pos);
  pushLedger(state, { id: uid('led'), timestamp: spec.timestamp ?? now(), type: 'ASSIGN_SHORT_PUT', symbol, details: { strike: spec.strike, contracts: spec.contracts, shares }, cashDelta: 0, realizedPnL: 0 });
}

export function assignShortCall(state: PortfolioSnapshot, symbol: string, spec: AssignSpec) {
  const pos = ensurePosition(state, symbol);
  const shares = spec.contracts * 100;
  if (pos.reservedShares < shares) throw new Error(`Reserved shares ${pos.reservedShares} < assignment ${shares}`);
  let remaining = shares, realized = 0;
  while (remaining > 0) {
    const lot = pos.lots[0]; if (!lot) throw new Error('Missing lot during assign');
    const use = Math.min(remaining, lot.shares);
    realized += use * (spec.strike - lot.costBasis);
    lot.shares -= use; if (lot.shares === 0) pos.lots.shift();
    remaining -= use;
  }
  pos.reservedShares -= shares;
  state.cash.available += spec.strike * shares; recalcPosition(pos);
  pushLedger(state, { id: uid('led'), timestamp: spec.timestamp ?? now(), type: 'ASSIGN_SHORT_CALL', symbol, details: { strike: spec.strike, contracts: spec.contracts, shares }, cashDelta: +(spec.strike * shares), realizedPnL: realized });
}

export function exerciseLongCall(state: PortfolioSnapshot, symbol: string, spec: AssignSpec) {
  const cost = spec.strike * 100 * spec.contracts;
  if (state.cash.available < cost) throw new Error(`Insufficient cash to exercise long call: need ${cost.toFixed(2)}, have ${state.cash.available.toFixed(2)}`);
  state.cash.available -= cost;
  const shares = spec.contracts * 100;
  const lot: StockLot = { lotId: uid('lot'), symbol, shares, costBasis: spec.strike, openedAt: spec.timestamp ?? now() };
  const pos = ensurePosition(state, symbol);
  pos.lots.push(lot); recalcPosition(pos);
  pushLedger(state, { id: uid('led'), timestamp: spec.timestamp ?? now(), type: 'EXERCISE_LONG_CALL', symbol, details: { strike: spec.strike, contracts: spec.contracts, shares }, cashDelta: -cost, realizedPnL: 0 });
}

export function exerciseLongPut(state: PortfolioSnapshot, symbol: string, spec: AssignSpec) {
  const pos = ensurePosition(state, symbol);
  const shares = spec.contracts * 100;
  if (pos.totalShares < shares) throw new Error(`Insufficient shares to exercise long put: need ${shares}, have ${pos.totalShares}`);
  let remaining = shares, realized = 0;
  while (remaining > 0) {
    const lot = pos.lots[0]; if (!lot) throw new Error('Missing lot during exercise put');
    const use = Math.min(remaining, lot.shares);
    realized += use * (spec.strike - lot.costBasis);
    lot.shares -= use; if (lot.shares === 0) pos.lots.shift();
    remaining -= use;
  }
  state.cash.available += spec.strike * shares; recalcPosition(pos);
  pushLedger(state, { id: uid('led'), timestamp: spec.timestamp ?? now(), type: 'EXERCISE_LONG_PUT', symbol, details: { strike: spec.strike, contracts: spec.contracts, shares }, cashDelta: +(spec.strike * shares), realizedPnL: realized });
}

export function computeUnrealizedPnL(state: PortfolioSnapshot, prices: Record<string, number>) {
  const entries: { symbol: string; shares: number; avgCost: number; price: number; unrealized: number }[] = [];
  for (const [symbol, pos] of Object.entries(state.positions)) {
    const price = prices[symbol] ?? 0;
    const unrealized = (price - pos.avgCost) * pos.totalShares;
    entries.push({ symbol, shares: pos.totalShares, avgCost: pos.avgCost, price, unrealized });
  }
  return entries;
}

export function newPortfolio(initialCash = 100000, currency: CashAccount['currency'] = 'USD'): PortfolioSnapshot {
  return { timestamp: now(), cash: { currency, available: initialCash, reserved: 0 }, positions: {}, ledger: [] };
}
'@
Set-Content -Encoding UTF8 "src\portfolio\stock.ts" $stock
