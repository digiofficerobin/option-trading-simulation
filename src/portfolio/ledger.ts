import type { PortfolioSnapshot, LedgerEntry } from './types';

/** Safe 2‑dec rounding (pennies) to avoid FP drift */
function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Simple UID helper (if you already have one elsewhere, you can remove this) */
function uid(prefix = 'led'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Append a ledger entry to the portfolio.
 *
 * Notes:
 * - `pushLedger` **only records** the event; it does NOT mutate cash or positions.
 *   Do cash/position updates in your domain functions (e.g., buy/sell, open/close option),
 *   then call `pushLedger` to log the event.
 * - If `timestamp` is missing, we fall back to `Date.now()`. Prefer passing the
 *   **simulation day** timestamp (e.g., `Date.parse(hist.dates[idx])`) so charts align.
 * - `cashDelta` and `realizedPnL` are rounded to 2 decimals for consistency.
 */
export function pushLedger(
  pf: PortfolioSnapshot,
  entry: Partial<LedgerEntry> & { type: LedgerEntry['type'] }
): LedgerEntry {
  const out: LedgerEntry = {
    id: entry.id ?? uid('led'),
    timestamp: entry.timestamp ?? Date.now(),
    type: entry.type,
    symbol: entry.symbol,
    details: entry.details ?? {},
    cashDelta: round2(entry.cashDelta ?? 0),
    realizedPnL: round2(entry.realizedPnL ?? 0),
  };

  // Append
  pf.ledger.push(out);

  // Return the normalized entry in case the caller wants to inspect/log it
  return out;
}

/* ------------------------------------------------------------------------- */
/* (You already have these, shown here only for context; keep your versions.) */
/* ------------------------------------------------------------------------- */

// Example (keep your existing implementations)
export function realizedPnL(pf: PortfolioSnapshot): number {
  return round2((pf.ledger ?? []).reduce((sum, e) => sum + (e.realizedPnL ?? 0), 0));
}

export function exportLedgerCSV(pf: PortfolioSnapshot): string {
  const header = [
    'id',
    'timestamp',
    'type',
    'symbol',
    'qty',
    'price',
    'strike',
    'cashDelta',
    'realizedPnL'
  ];
  const rows = (pf.ledger ?? []).map(e => {
    const d = e.details ?? {};
    return [
      e.id,
      new Date(e.timestamp).toISOString(),
      e.type,
      e.symbol ?? '',
      d.qty ?? d.shares ?? '',
      d.price ?? '',
      d.strike ?? '',
      (e.cashDelta ?? 0).toFixed(2),
      (e.realizedPnL ?? 0).toFixed(2),
    ].join(',');
  });
  return [header.join(','), ...rows].join('\n');
}
