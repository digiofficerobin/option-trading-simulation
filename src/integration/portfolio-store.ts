/* src/integration/portfolio-store.ts */
import { newPortfolio, computeUnrealizedPnL } from '../portfolio/stock';
import type { PortfolioSnapshot } from '../portfolio/types';

class PortfolioStore {
  pf: PortfolioSnapshot;
  prices: Record<string, number> = {};
  currency: 'USD' | 'EUR' = 'USD';
  constructor(initialCash = 100000, currency: 'USD' | 'EUR' = 'USD') {
    this.currency = currency;
    this.pf = newPortfolio(initialCash, currency);
  }

  setPrice(symbol: string, price: number) {
    this.prices[symbol] = price;
  }

  getUnrealizedRows() {
    return computeUnrealizedPnL(this.pf, this.prices);
  }

  
  // Reset portfolio cash to a new initial deposit (keep positions/ledger as-is)
  resetInitialDeposit(amount: number) {
    if (!Number.isFinite(amount) || amount < 0) return;
    const delta = amount - (this.pf.cash.initial ?? amount);
    this.pf.cash.initial = amount;
    // Keep "reserved" untouched; "available" reflects the delta
    this.pf.cash.available += delta;
    // If you prefer full reset, you could reinstantiate:
    // this.pf = newPortfolio(amount, this.currency);
  }

}

export const portfolioStore = new PortfolioStore(50000, 'USD');
