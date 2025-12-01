
import { describe, it, expect } from 'vitest';
import { pushLedger, realizedPnL, exportLedgerCSV } from '@/portfolio/ledger';
import type { PortfolioSnapshot } from '@/portfolio/types';

function newPf(): PortfolioSnapshot {
  return {
    timestamp: Date.now(),
    cash: { currency: 'USD', available: 0, reserved: 0 },
    positions: {},
    ledger: [],
    optionPositions: [],
  } as any;
}

describe('ledger utils', () => {
  it('pushLedger records entry with rounded values', () => {
    const pf = newPf();
    const entry = pushLedger(pf, {
      timestamp: Date.parse('2025-10-05'),
      type: 'SELL_STOCK',
      symbol: 'XYZ',
      details: { qty: 10, price: 101.234 },
      cashDelta: 1012.3456,
      realizedPnL: 12.3456,
    });
    expect(pf.ledger.length).toBe(1);
    expect(entry.cashDelta).toBe(1012.35);
    expect(entry.realizedPnL).toBe(12.35);
  });

  it('realizedPnL sums entries', () => {
    const pf = newPf();
    pushLedger(pf, { timestamp: Date.now(), type: 'SELL_STOCK', details: {}, cashDelta: 0, realizedPnL: 100 });
    pushLedger(pf, { timestamp: Date.now(), type: 'CLOSE_SHORT_OPTION', details: {}, cashDelta: 0, realizedPnL: 50 });
    expect(realizedPnL(pf)).toBe(150);
  });

  it('exportLedgerCSV outputs expected headers and rows', () => {
    const pf = newPf();
    pushLedger(pf, { timestamp: Date.parse('2025-10-01'), type: 'BUY_STOCK', symbol: 'XYZ', details: { qty: 100, price: 100 }, cashDelta: -10000, realizedPnL: 0 });
    const csv = exportLedgerCSV(pf);
    expect(csv).toMatch(/id,timestamp,type,symbol,qty,price,strike,cashDelta,realizedPnL/);
    expect(csv).toMatch(/BUY_STOCK/);
  });
});
