
// ---- expiry.ts ----
import type { PortfolioSnapshot, StockPosition, StockLot } from '@/portfolio/types';
import { pushLedger } from '@/portfolio/ledger';

const CONTRACT_MULTIPLIER = 100;

/** Safe 2-dec rounding */
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Intrinsic value per share at expiry */
const intrinsicAtExpiry = (right: 'CALL'|'PUT', S: number, strike: number) =>
  right === 'CALL' ? Math.max(0, S - strike) : Math.max(0, strike - S);


/** Ensure a stock position exists */
function ensurePosition(state: PortfolioSnapshot, symbol: string): StockPosition {
  state.positions[symbol] ??= {
    symbol,
    lots: [],
    totalShares: 0,
    avgCost: 0,
    reservedShares: 0,
  };
  return state.positions[symbol];
}

/** Recalculate aggregate fields on a position */
function recalcPosition(pos: StockPosition) {
  let sh = 0, costSum = 0;
  for (const lot of pos.lots) {
    sh += lot.shares;
    costSum += lot.shares * lot.costBasis;
  }
  pos.totalShares = sh;
  pos.avgCost = sh > 0 ? round2(costSum / sh) : 0;
}

/** FIFO lot consumption: remove `qty` shares from oldest lots */
function consumeLotsFIFO(pos: StockPosition, sharesToDeliver: number) {
  pos.lots.sort((a,b) => a.openedAt - b.openedAt);
  let remaining = sharesToDeliver;
  let costConsumed = 0;
  const breakdown: Array<{ lotId:string; qty:number; lotCostBasis:number }> = [];

  for (const lot of pos.lots) {
    if (remaining <= 0) break;
    if (lot.shares <= 0) continue;
    const take = Math.min(lot.shares, remaining);
    costConsumed += take * lot.costBasis;
    breakdown.push({ lotId: lot.lotId, qty: take, lotCostBasis: lot.costBasis });
    lot.shares -= take;
    remaining -= take;
  }
  if (remaining > 0) throw new Error(`Not enough shares to deliver: missing ${remaining}`);

  pos.lots = pos.lots.filter(l => l.shares > 0);
  recalcPosition(pos);
  return { costConsumed, breakdown };
}

/**
 * Assignment for SHORT PUT ITM:
 * - Buy shares at strike (contracts × 100).
 * - Cash decreases by strike × 100 × contracts.
 * - RealizedPnL = premium*100*contracts - (strike - S)*100*contracts
 *   (because you keep premium and absorb intrinsic).
 */
function assignShortPut(
  pf: PortfolioSnapshot,
  symbol: string,
  contracts: number,
  strike: number,
  S: number,
  premiumPerShare: number,
  timestamp: number
) {
  const shares = contracts * CONTRACT_MULTIPLIER;
  const cost = round2(shares * strike);

  // Cash outflow
  pf.cash.available -= cost;

  // Add shares as a new lot at strike cost
   const lot: StockLot = {
     lotId: `lot-${Math.random().toString(36).slice(2,9)}`,
     symbol,
     shares,
     costBasis: strike,
     openedAt: timestamp,
   };
  const pos = ensurePosition(pf, symbol);
  pos.lots.push(lot);
  recalcPosition(pos);

   // 1) Record the BUY STOCK to the ledger (this carries the cash outflow)
  pushLedger(pf, {
    timestamp,
    type: 'BUY_STOCK',
    symbol,
    details: {
      qty: shares,
      price: strike,
      costBasis: cost
    },
    cashDelta: -cost,
    realizedPnL: 0,
  });

   // 2) Record the OPTION ASSIGNMENT with realized on the option leg (no cashDelta here)
  const intrinsic = intrinsicAtExpiry('PUT', S, strike); // per share
  const realized = round2((premiumPerShare - intrinsic) * CONTRACT_MULTIPLIER * contracts);

  pushLedger(pf, {
    timestamp,
    type: 'ASSIGN_SHORT_PUT',
    symbol,
    details: { qty: contracts, strike, price: premiumPerShare, sharesAssigned: shares },
    cashDelta: 0,
    realizedPnL: realized,    // on the option leg
  });
}


/**
 * Assignment for SHORT CALL ITM:
 * - Deliver shares at strike (contracts × 100).
 * - Cash increases by strike × 100 × contracts.
 * - Two ledger entries:
 *   1) SELL_STOCK   (qty in shares, price=strike, cost basis from lots, cashDelta=+proceeds, realizedPnL = proceeds - costConsumed)
 *   2) ASSIGN_SHORT_CALL (option leg realized only; cashDelta=0 to avoid double cash logging)
 */

function assignShortCall(
  pf: PortfolioSnapshot,
  symbol: string,
  contracts: number,
  strike: number,
  S: number,
  premiumPerShare: number,
  timestamp: number
) {
  const shares = contracts * CONTRACT_MULTIPLIER;
  const pos = ensurePosition(pf, symbol);

  // Ensure enough deliverable shares (exclude reserved)
  const available = (pos.totalShares ?? 0) - (pos.reservedShares ?? 0);
  if (available < shares) {
    const reserved = pos.reservedShares ?? 0;
    throw new Error(
      `Covered call assignment requires ${shares} deliverable shares; available=${available}, reserved=${reserved}`
    );
  }

  // Remove shares FIFO and receive cash proceeds at strike
  const { costConsumed, breakdown } = consumeLotsFIFO(pos, shares);
  const proceeds = round2(shares * strike);

  pf.cash.available = round2(pf.cash.available + proceeds);
  recalcPosition(pos);

  // 1) STOCK SALE ledger (carries cash inflow & stock realized)
  pushLedger(pf, {
    timestamp,
    type: 'SELL_STOCK',
    symbol,
    details: {
      qty: shares,           // shares delivered
      price: strike,         // per share
      costBasis: costConsumed,
      lots: breakdown
    },
    cashDelta: +proceeds,
    realizedPnL: round2(proceeds - costConsumed),
  });

  // 2) OPTION ASSIGNMENT ledger (option realized only, no cash here to avoid double-count)
  const intrinsic = intrinsicAtExpiry('CALL', S, strike); // per share
  const realizedOpt = round2((premiumPerShare - intrinsic) * CONTRACT_MULTIPLIER * contracts);

  pushLedger(pf, {
    timestamp,
    type: 'ASSIGN_SHORT_CALL',
    symbol,
    details: { right: 'CALL', qty: contracts, strike, price: premiumPerShare, sharesDelivered: shares },
    cashDelta: 0,
    realizedPnL: realizedOpt,
  });
}

export {
  assignShortPut,
  assignShortCall,
  intrinsicAtExpiry,
  round2,
  CONTRACT_MULTIPLIER
};
