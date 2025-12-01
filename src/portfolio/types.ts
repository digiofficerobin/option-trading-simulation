// src/portfolio/types.ts
export type Currency = 'USD' | 'EUR';

export interface CashAccount {
  currency: Currency;
  available: number;
  reserved: number;
  initial: number
}

export interface StockLot {
  lotId: string;
  symbol: string;
  shares: number;
  costBasis: number;
  openedAt: number;
}

export interface StockPosition {
  symbol: string;
  lots: StockLot[];
  totalShares: number;
  avgCost: number;
  reservedShares: number;
}


export interface LedgerEntry {
  id: string;
  timestamp: number;
  type:
    | 'BUY_STOCK' | 'SELL_STOCK' | 'DIVIDEND'
    | 'SELL_COVERED_CALL' | 'ASSIGN_SHORT_CALL' | 'ASSIGN_SHORT_PUT'
    | 'EXERCISE_LONG_CALL' | 'EXERCISE_LONG_PUT'
    | 'RESERVE_CASH' | 'RELEASE_CASH'
    | 'RESERVE_SHARES' | 'RELEASE_SHARES'
    | 'BUY_OPTION'         // open LONG (pay premium)
    | 'SELL_OPTION'        // open SHORT (receive premium)
    | 'CLOSE_LONG_OPTION'  // close long (receive premium)
    | 'CLOSE_SHORT_OPTION' // close short (pay premium)
  ;
  symbol?: string;
  details: Record<string, any>;
  cashDelta: number;
  realizedPnL: number;
}


export interface PortfolioSnapshot {
  timestamp: number;
  cash: CashAccount;
  positions: Record<string, StockPosition>;
  ledger: LedgerEntry[];
  optionPositions?: any[];
}

export interface FillSpec { price: number; timestamp?: number; }
export interface AssignSpec { strike: number; contracts: number; timestamp?: number; }
