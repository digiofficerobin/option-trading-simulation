/* src/integration/options-portfolio-adapter.ts */
import {
  reserveCashForShortPut, assignShortPut, releaseReservedCash,
  reserveSharesForShortCall, assignShortCall, releaseReservedShares,
  exerciseLongCall, exerciseLongPut,
  buyShares, sellShares
} from '../portfolio/stock';
import { portfolioStore } from './portfolio-store';

// --- Short Put flows ---
export function onSellShortPut(symbol: string, strike: number, contracts: number) {
  reserveCashForShortPut(portfolioStore.pf, symbol, strike, contracts);
}
export function onAssignmentShortPut(symbol: string, strike: number, contracts: number) {
  assignShortPut(portfolioStore.pf, symbol, { strike, contracts });
}
export function onExpiryShortPutWorthless(symbol: string, strike: number, contracts: number) {
  releaseReservedCash(portfolioStore.pf, symbol, strike * 100 * contracts);
}

// --- Covered Call flows ---
export function onSellCoveredCall(symbol: string, contracts: number) {
  reserveSharesForShortCall(portfolioStore.pf, symbol, contracts);
}
export function onAssignmentShortCall(symbol: string, strike: number, contracts: number) {
  assignShortCall(portfolioStore.pf, symbol, { strike, contracts });
}
export function onExpiryShortCallWorthless(symbol: string, contracts: number) {
  releaseReservedShares(portfolioStore.pf, symbol, contracts);
}

// --- Manual Exercise ---
export function onExerciseLongCall(symbol: string, strike: number, contracts: number) {
  exerciseLongCall(portfolioStore.pf, symbol, { strike, contracts });
}
export function onExerciseLongPut(symbol: string, strike: number, contracts: number) {
  exerciseLongPut(portfolioStore.pf, symbol, { strike, contracts });
}

// --- Underlying quick actions ---
export function buyUnderlying(symbol: string, shares: number, price: number) {
  buyShares(portfolioStore.pf, symbol, shares, { price });
  portfolioStore.setPrice(symbol, price);
}
export function sellUnderlying(symbol: string, shares: number, price: number) {
  sellShares(portfolioStore.pf, symbol, shares, { price });
  portfolioStore.setPrice(symbol, price);
}
