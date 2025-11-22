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
}

export const portfolioStore = new PortfolioStore(50000, 'USD');
