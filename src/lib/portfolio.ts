import { bsmPrice, bsmGreeks } from './blackScholes';
import type { OptionRight, TradeSide } from '@/lib/types';
import type { Env } from './types';
export type LegPosition = { id:string; side:TradeSide; right:OptionRight; quantity:number; strike:number; entryPrice:number };
export type OpenPosition = { legs:LegPosition[]; entryIndex?:number; expiryIndex?:number; realized:number };
export function emptyPosition():OpenPosition{ return { legs:[], realized:0 }; }
const sign = (s:TradeSide)=> s==='LONG'? 1 : -1;

// ------ Pricing & Greeks ------
export function legNowPrice(leg:Pick<LegPosition,'right'|'strike'>, env:Env, S:number, Tau:number){
  return bsmPrice(S, leg.strike, env.r, env.q, env.sigma, Math.max(0,Tau), leg.right);
}
export function valueLeg(env:Env,S:number,T:number,leg:Pick<LegPosition,'side'|'right'|'quantity'|'strike'>){ return sign(leg.side)*leg.quantity*legNowPrice(leg,env,S,T); }
export function valuePositionNow(pos:OpenPosition, env:Env, idx:number, hist:{prices:number[]}){
  if (pos.legs.length===0) return { value:0, cost:0, unrealized:0, realized:pos.realized };
  const S=hist.prices[idx]; const Tau=Math.max(0,(pos.expiryIndex!-idx)/365);
  const value=pos.legs.reduce((a,l)=>a+valueLeg(env,S,Tau,l),0);
  const cost=pos.legs.reduce((a,l)=>a+sign(l.side)*l.quantity*l.entryPrice,0);
  const unrealized=value-cost; return { value, cost, unrealized, realized:pos.realized };
}
export function positionPnlTimeSeries(pos:OpenPosition, env:Env, currentIdx:number, hist:{prices:number[]}){
  if (!pos.entryIndex || pos.legs.length===0) return new Array(currentIdx+1).fill(0);
  const start=pos.entryIndex; const arr=new Array(currentIdx+1).fill(0);
  for(let i=start;i<=currentIdx;i++){
    const S=hist.prices[i]; const Tau=Math.max(0,(pos.expiryIndex!-i)/365);
    const value=pos.legs.reduce((a,l)=>a+valueLeg(env,S,Tau,l),0);
    const cost=pos.legs.reduce((a,l)=>a+sign(l.side)*l.quantity*l.entryPrice,0);
    arr[i]=pos.realized+(value-cost);
  }
  for(let i=0;i<start;i++) arr[i]=0; return arr;
}
export function greeksNow(pos:OpenPosition, env:Env, idx:number, hist:{prices:number[]}){
  const S=hist.prices[idx]; const Tau=Math.max(0,(pos.expiryIndex!? pos.expiryIndex!-idx : 0)/365);
  const g = pos.legs.reduce((acc,l)=>{
    const gr = bsmGreeks(S,l.strike,env.r,env.q,env.sigma,Math.max(1e-8,Tau),l.right);
    acc.delta += sign(l.side)*l.quantity*gr.delta;
    acc.gamma += sign(l.side)*l.quantity*gr.gamma;
    acc.vega  += sign(l.side)*l.quantity*gr.vega;
    acc.theta += sign(l.side)*l.quantity*gr.theta;
    return acc;
  }, { delta:0, gamma:0, vega:0, theta:0 });
  return g;
}
export function greeksTimeSeries(pos:OpenPosition, env:Env, currentIdx:number, hist:{prices:number[]}){
  const start = pos.entryIndex ?? currentIdx; const out = { delta:[], theta:[], vega:[], gamma:[], idxStart:start } as any;
  for (let i=0;i<=currentIdx;i++){
    if (!pos.entryIndex || i<start){ out.delta.push(0); out.theta.push(0); out.vega.push(0); out.gamma.push(0); continue; }
    const S=hist.prices[i]; const Tau=Math.max(0,(pos.expiryIndex!-i)/365);
    const g = pos.legs.reduce((acc,l)=>{
      const gr=bsmGreeks(S,l.strike,env.r,env.q,env.sigma,Math.max(1e-8,Tau),l.right);
      acc.delta += sign(l.side)*l.quantity*gr.delta;
      acc.gamma += sign(l.side)*l.quantity*gr.gamma;
      acc.vega  += sign(l.side)*l.quantity*gr.vega;
      acc.theta += sign(l.side)*l.quantity*gr.theta;
      return acc;
    }, { delta:0, gamma:0, vega:0, theta:0 });
    out.delta.push(g.delta); out.theta.push(g.theta); out.vega.push(g.vega); out.gamma.push(g.gamma);
  }
  return out;
}

// ------ Payoff Curves ------
export function pnlCurveAtTau(
  pos: OpenPosition,
  env: Env,
  Sref: number,
  Tau: number
): [number[], number[]] {
  if (!pos.entryIndex || pos.legs.length === 0) return [[], []];

  // Premium: LONG = negative (debit), SHORT = positive (credit)
  const premium = pos.legs.reduce(
    (acc, l) => acc + (l.side === 'LONG' ? -1 : +1) * l.quantity * l.entryPrice,
    0
  );

  const min = Math.max(0.1, Sref * 0.7);
  const max = Sref * 1.3;
  const steps = 200;

  const xs: number[] = [];
  const ys: number[] = [];

  for (let i = 0; i <= steps; i++) {
    const S = min + (max - min) * (i / steps);

    // Current theoretical value (BSM) at Tau
    const val = pos.legs.reduce((acc, l) => {
      const px = bsmPrice(S, l.strike, env.r, env.q, env.sigma, Math.max(0, Tau), l.right);
      return acc + (l.side === 'LONG' ? 1 : -1) * l.quantity * px;
    }, 0);

    // Effective P/L = current value + premium (premium is negative for LONG)
    xs.push(S);
    ys.push(val + premium);
  }

  return [xs, ys];
}
export function payoutCurveAtExpiry(
  pos: OpenPosition,
  Sref: number
): [number[], number[]] {
  if (!pos.entryIndex || pos.legs.length === 0) return [[], []];

  // Premium: LONG = negative (debit), SHORT = positive (credit)
  const premium = pos.legs.reduce(
    (acc, l) => acc + (l.side === 'LONG' ? -1 : +1) * l.quantity * l.entryPrice,
    0
  );

  const min = Math.max(0.1, Sref * 0.7);
  const max = Sref * 1.3;
  const steps = 200;

  const xs: number[] = [];
  const ys: number[] = [];

  for (let i = 0; i <= steps; i++) {
    const S = min + (max - min) * (i / steps);

    // Intrinsic payoff at expiry
    const raw = pos.legs.reduce((acc, l) => {
      const intr = l.right === 'CALL'
        ? Math.max(0, S - l.strike)
        : Math.max(0, l.strike - S);
      return acc + (l.side === 'LONG' ? 1 : -1) * l.quantity * intr;
    }, 0);

    xs.push(S);
    ys.push(raw + premium); // includes premium effect
  }

  return [xs, ys];
}

// ------ Margin (educational Reg‑T approx) ------
export function marginRequirement(pos:OpenPosition, S:number){
  let req=0;
  for (const l of pos.legs){
    if (l.side==='SHORT'){
      const premium = l.entryPrice; // per unit
      const otm = l.right==='CALL'? Math.max(0, S - l.strike) : Math.max(0, l.strike - S);
      const base = 0.2*S - otm; // 20% underlying minus OTM
      const alt  = 0.1*S;      // 10% underlying floor
      const legReq = Math.max(base, alt) + premium; // per unit
      req += legReq * l.quantity;
    }
  }
  return Math.max(0, req);
}

// ------ Cashflows for trades ------
export function cashChangeOpen(legs:{side:TradeSide,right:OptionRight,quantity:number,price:number}[]){
  return legs.reduce((a,l)=> a + (l.side==='LONG'? -1: +1) * l.quantity * l.price, 0);
}
export function cashChangeClose(legs:{side:TradeSide,right:OptionRight,quantity:number,price:number}[]){
  return legs.reduce((a,l)=> a + (l.side==='LONG'? +1: -1) * l.quantity * l.price, 0);
}

// High-level helpers to compute cash deltas alongside position updates are applied in page.tsx
// ===========================
// Trading operations (open/add/close/roll) + Preview helpers
// ===========================

/**
 * Open a (new) strategy: sets entryIndex and expiryIndex and prices all draft legs at entry.
 * - draft.expiryDays is relative to the current idx (minimum 1 day)
 */
export function openStrategy(
  pos: OpenPosition,
  env: Env,
  idx: number,
  hist: { prices: number[] },
  draft: {
    expiryDays: number;
    legs: { side: TradeSide; right: OptionRight; quantity: number; strike: number }[];
  }
): OpenPosition {
  const expiryIndex = idx + Math.max(1, Math.round(draft.expiryDays));
  const S = hist.prices[idx];
  const Tau = (expiryIndex - idx) / 365;

  const legs = draft.legs.map(l => ({
    id: crypto.randomUUID(),
    side: l.side,
    right: l.right,
    quantity: l.quantity,
    strike: l.strike,
    entryPrice: legNowPrice(l as any, env, S, Tau), // price per 1 at entry
  }));

  return { legs, entryIndex: idx, expiryIndex, realized: pos.realized };
}

/**
 * Add more legs to the existing position (same expiry as current position).
 */
export function openAdditional(
  pos: OpenPosition,
  env: Env,
  idx: number,
  hist: { prices: number[] },
  legsDraft: { side: TradeSide; right: OptionRight; quantity: number; strike: number }[]
): OpenPosition {
  if (pos.expiryIndex === undefined) {
    throw new Error('openAdditional: no existing expiry to add to');
  }
  const S = hist.prices[idx];
  const Tau = Math.max(0, (pos.expiryIndex - idx) / 365);

  const add = legsDraft.map(l => ({
    id: crypto.randomUUID(),
    side: l.side,
    right: l.right,
    quantity: l.quantity,
    strike: l.strike,
    entryPrice: legNowPrice(l as any, env, S, Tau),
  }));

  return { ...pos, legs: [...pos.legs, ...add] };
}

/**
 * Close selected quantities of legs (partial close supported).
 * closeMap maps leg.id -> quantityToClose
 * Realized P/L = signed qty * (nowPx - entryPrice).
 */
export function closeSelected(
  pos: OpenPosition,
  env: Env,
  idx: number,
  hist: { prices: number[] },
  closeMap: Record<string, number>
): OpenPosition {
  if (pos.legs.length === 0) return pos;

  const S = hist.prices[idx];
  const Tau = Math.max(0, (pos.expiryIndex! - idx) / 365);

  let realized = pos.realized;
  const nextLegs: LegPosition[] = [];

  for (const leg of pos.legs) {
    const toClose = Math.max(0, Math.min(leg.quantity, closeMap[leg.id] ?? 0));
    if (toClose > 0) {
      const nowPx = legNowPrice(leg, env, S, Tau);
      const pnl = (leg.side === 'LONG' ? 1 : -1) * toClose * (nowPx - leg.entryPrice);
      realized += pnl;
    }
    const remaining = leg.quantity - (closeMap[leg.id] ?? 0);
    if (remaining > 0) {
      nextLegs.push({ ...leg, quantity: remaining });
    }
  }

  const res: OpenPosition = { ...pos, legs: nextLegs, realized };

  if (res.legs.length === 0) {
    res.entryIndex = undefined;
    res.expiryIndex = undefined;
  }
  return res;
}

/**
 * Close all legs at current fair values (not intrinsic) and realize P/L.
 * Leaves an empty position but carries forward realized P/L.
 */
export function closeAll(
  pos: OpenPosition,
  env: Env,
  idx: number,
  hist: { prices: number[] }
): OpenPosition {
  if (pos.legs.length === 0) return pos;

  const S = hist.prices[idx];
  const Tau = Math.max(0, (pos.expiryIndex! - idx) / 365);

  // Current value of the position at mid/fair
  const closeValue = pos.legs.reduce((acc, leg) => acc + valueLeg(env, S, Tau, leg), 0);

  // Entry cost (signed): +debit for LONG, −credit for SHORT
  const cost = pos.legs.reduce(
    (acc, leg) => acc + (leg.side === 'LONG' ? 1 : -1) * leg.quantity * leg.entryPrice,
    0
  );

  const realized = pos.realized + (closeValue - cost);
  return { legs: [], entryIndex: undefined, expiryIndex: undefined, realized };
}

/**
 * Optional helper to close-and-reopen to a new draft (roll).
 */
export function rollTo(
  pos: OpenPosition,
  env: Env,
  idx: number,
  hist: { prices: number[] },
  draft: {
    expiryDays: number;
    legs: { side: TradeSide; right: OptionRight; quantity: number; strike: number }[];
  }
): OpenPosition {
  const closed = closeAll(pos, env, idx, hist);
  return openStrategy(closed, env, idx, hist, draft);
}

// ===========================
// Draft preview helpers (used by Take action dialog)
// ===========================

/**
 * Signed order premium for a draft at (S, Tau):
 * + credit for SHORT, − debit for LONG.
 */
export function previewDraftPremium(
  env: Env,
  S: number,
  Tau: number,
  legs: { side: TradeSide; right: OptionRight; quantity: number; strike: number }[]
): number {
  return legs.reduce(
    (a, l) =>
      a +
      (l.side === 'LONG' ? 1 : -1) *
        l.quantity *
        bsmPrice(S, l.strike, env.r, env.q, env.sigma, Math.max(0, Tau), l.right),
    0
  );
}

/**
 * Payoff curve @ expiry for a draft (intrinsic + entry premium), around Sref ±30%.
 * Used to preview the shape before placing the order.
 */
export function payoffCurveForDraft(
  env: Env,
  Sref: number,
  Tau: number,
  legs: { side: TradeSide; right: OptionRight; quantity: number; strike: number }[]
): [number[], number[]] {
  const premium = previewDraftPremium(env, Sref, Tau, legs);

  const min = Math.max(0.1, Sref * 0.7);
  const max = Sref * 1.3;
  const steps = 200;

  const xs: number[] = [];
  const ys: number[] = [];

  for (let i = 0; i <= steps; i++) {
    const s = min + (max - min) * (i / steps);
    const raw = legs.reduce((acc, l) => {
      const intr = l.right === 'CALL' ? Math.max(0, s - l.strike) : Math.max(0, l.strike - s);
      return acc + (l.side === 'LONG' ? 1 : -1) * l.quantity * intr;
    }, 0);
    xs.push(s);
    ys.push(raw + premium);
  }
  return [xs, ys];
}
