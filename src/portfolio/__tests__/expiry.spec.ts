
import { describe, it, expect } from 'vitest';
import { assignShortPut, assignShortCall } from '@/portfolio/expiry';
import { pushLedger } from '@/portfolio/ledger';
import { portfolioStore } from '@/integration/portfolio-store';
import type { PortfolioSnapshot, StockLot } from '@/portfolio/types';

function newPf(initialCash = 50000): PortfolioSnapshot {
  // If you already have newPortfolio, use that instead
  return {
    timestamp: Date.now(),
    cash: { currency: 'USD', available: initialCash, reserved: 0 },
    positions: {},
    ledger: [],
    optionPositions: [],
  } as any;
}

function ensureXYZLot(pf: PortfolioSnapshot, shares: number, costBasis: number, openedAt: number) {
  pf.positions['XYZ'] ??= { symbol: 'XYZ', lots: [], totalShares: 0, avgCost: 0, reservedShares: 0 } as any;
  const lot: StockLot = { lotId: 'l1', symbol: 'XYZ', shares, costBasis, openedAt };
  (pf.positions['XYZ'].lots as StockLot[]).push(lot);
  // quick recalc
  const lots = pf.positions['XYZ'].lots as StockLot[];
  const costSum = lots.reduce((s, l) => s + l.shares * l.costBasis, 0);
  const total = lots.reduce((s, l) => s + l.shares, 0);
  pf.positions['XYZ'].totalShares = total;
  pf.positions['XYZ'].avgCost = total ? +(costSum / total).toFixed(2) : 0;
}

describe('Options assignment', () => {
  it('assigns SHORT PUT ITM: buys shares, logs BUY_STOCK and ASSIGN_SHORT_PUT with correct realized', () => {
    const pf = newPf(50000);
    const ts = Date.parse('2025-10-01');
    const contracts = 1;
    const strike = 100;
    const S = 95;
    const premiumPerShare = 2.35;

    assignShortPut(pf, 'XYZ', contracts, strike, S, premiumPerShare, ts);

    // Cash decreased by strike * 100
    expect(pf.cash.available).toBe(50000 - 100 * 100);

    // New lot exists with 100 shares @ strike
    expect(pf.positions['XYZ'].totalShares).toBe(100);
    expect(pf.positions['XYZ'].avgCost).toBe(100);

    // Ledger has BUY_STOCK and ASSIGN_SHORT_PUT
    const buy = pf.ledger.find(e => e.type === 'BUY_STOCK')!;
    const assign = pf.ledger.find(e => e.type === 'ASSIGN_SHORT_PUT')!;
    expect(buy.details.qty).toBe(100);
    expect(buy.details.price).toBe(100);
    expect(buy.cashDelta).toBe(-10000);

    // realized on option = (premium - intrinsic) * 100
    const expectedRealized = (2.35 - (100 - 95)) * 100;
    expect(assign.realizedPnL).toBeCloseTo(expectedRealized, 2);
    expect(assign.cashDelta).toBe(0);
  });

  it('assigns SHORT CALL ITM: sells shares FIFO, logs SELL_STOCK and ASSIGN_SHORT_CALL', () => {
    const pf = newPf(50000);
    const ts = Date.parse('2025-10-02');
    ensureXYZLot(pf, 100, 97, ts - 86400000); // 100 sh @ 97

    const contracts = 1;
    const strike = 100;
    const S = 110;
    const premiumPerShare = 2.00;

    assignShortCall(pf, 'XYZ', contracts, strike, S, premiumPerShare, ts);

    // Cash increased by proceeds = 100 * 100
    expect(pf.cash.available).toBe(50000 + 10000);

    // Position now zero shares
    expect(pf.positions['XYZ'].totalShares).toBe(0);

    const sell = pf.ledger.find(e => e.type === 'SELL_STOCK')!;
    expect(sell.details.qty).toBe(100);
    expect(sell.details.price).toBe(100);
    expect(sell.realizedPnL).toBeCloseTo(10000 - 9700, 2); // +300

    const assign = pf.ledger.find(e => e.type === 'ASSIGN_SHORT_CALL')!;
    const expectedRealizedOpt = (2 - (110 - 100)) * 100;
    expect(assign.realizedPnL).toBeCloseTo(expectedRealizedOpt, 2); // -800
    expect(assign.cashDelta).toBe(0);
  });
});
