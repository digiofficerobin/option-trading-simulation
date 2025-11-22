export type OptionRight = 'CALL' | 'PUT';
export type TradeSide = 'LONG' | 'SHORT';
export interface Env { r:number; q:number; sigma:number }
export interface LegDraft { id:string; side:TradeSide; right:OptionRight; quantity:number; strike:number }
export interface Draft { expiryDays:number; legs:LegDraft[] }
export type RegimeKey = 'BULL'|'NEUTRAL'|'BEAR'|'VOLATILE'|'CUSTOM';
export interface Regime { key:RegimeKey; label:string; baseMu:number; baseSigma:number }

export interface Account { startingCash:number; cash:number; }
