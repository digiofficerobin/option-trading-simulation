export type Currency = 'USD' | 'EUR';

export interface CashAccount {
  currency: Currency;
  available: number;
  reserved: number;
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
    | 'RESERVE_SHARES' | 'RELEASE_SHARES';
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
