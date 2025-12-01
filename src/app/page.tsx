'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { generateHistory, REGIMES } from '@/lib/history';
import type { Env, RegimeKey, Account, Regime } from '@/lib/types';
import { OpenPosition, emptyPosition, valuePositionNow, positionPnlTimeSeries, closeAll, pnlCurveAtTau, payoutCurveAtExpiry, greeksNow, greeksTimeSeries, marginRequirement, cashChangeOpen, cashChangeClose} from '@/lib/portfolio';
import LineChart from '@/components/LineChart';
import PayoffSlicesChart from '@/components/PayoffSlicesChart';
import { ActionPanel } from '@/components/ActionPanel';
import RegimePanel from '@/components/RegimePanel';
import LearningPanel from '@/components/LearningPanel';
import CoachPanel from '@/components/CoachPanel';
import { templates, type Leg } from '@/lib/learn';
import { bsmPrice, round2 } from '@/lib/blackScholes';
import { PortfolioPanel } from '@/ui/PortfolioPanel';
import { LedgerEntry, PortfolioSnapshot } from '@/portfolio/types';
import { portfolioStore } from '@/integration/portfolio-store';
import { pushLedger } from '@/portfolio/ledger';
import { uid } from '@/lib/uid';
import { assignShortCall, assignShortPut, intrinsicAtExpiry } from '@/portfolio/expiry';

const CONTRACT_MULTIPLIER = 100;
const UNDERLYING_SYMBOL = 'XYZ';

const ledgerLen = portfolioStore.pf.ledger?.length ?? 0;

export default function Page(){
  const [env, setEnv] = useState<Env>({ r:0.03, q:0.00, sigma:0.25 });
  const [regimeKey, setRegimeKey] = useState<RegimeKey>('BULL');
  const [randomize, setRandomize] = useState(true);
  const [custom, setCustom] = useState({ mu: 0.05, sigma: 0.25, seed: 11 });
  const [jumps, setJumps] = useState({ enabled:false, lambda: 2.0, muJ: -0.2, sigmaJ: 0.25 });

  const regime: Regime = regimeKey==='CUSTOM'
    ? { key: 'CUSTOM' as RegimeKey, label:'Custom', baseMu: custom.mu, baseSigma: custom.sigma }
    : REGIMES[regimeKey];

  const [hist, setHist] = useState(()=> generateHistory({ S0:100, regime, days: 420, seed: custom.seed, randomize, jumps }));
  const [idx, setIdx] = useState(30);
  const [pos, setPos] = useState<OpenPosition>(emptyPosition());
  const [showAction, setShowAction] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<null | { legs: Leg[]; expiryDays: number }>(null);

    const [realizedMarks, setRealizedMarks] = useState<{day:number, realized:number}[]>([{day:0, realized:0}]);

  // regenerate history when regime/jumps change
  useEffect(()=>{
    const h = generateHistory({ S0:100, regime, days: 420, seed: custom.seed, randomize, jumps });
    setHist(h); setIdx(30); setPos(emptyPosition()); setRealizedMarks([{day:0, realized:0}]); setTemplateDraft(null);
    setEnv(e=> ({ ...e, sigma: regime.baseSigma }));
  }, [regimeKey, custom.mu, custom.sigma, custom.seed, randomize, jumps.enabled, jumps.lambda, jumps.muJ, jumps.sigmaJ]);

  const S = round2(hist.prices[idx]);
  const date = hist.dates[idx];
  const dte = pos.expiryIndex ? Math.max(0, pos.expiryIndex - idx) : undefined;

  // Auto-expiry with cash settlement (intrinsic)
  // useEffect(()=>{
  //   if (pos.expiryIndex !== undefined && idx >= pos.expiryIndex && pos.legs.length>0){
  //     // cash settlement = close at now fair value
  //     const Tau = Math.max(0,(pos.expiryIndex - idx)/365);
  //     const legsClose = pos.legs.map(l=> ({ side:l.side, right:l.right, quantity:l.quantity, price: (S && Tau!==undefined)? ( // now price
  //       (l.right==='CALL'? Math.max(0, S - l.strike): Math.max(0, l.strike - S)) // intrinsic at expiry
  //     ) : 0 }));
  //     const deltaCash = legsClose.reduce((a,l)=> a + (l.side==='LONG'? +1: -1) * l.quantity * l.price, 0);
  //     const newPos = closeAll(pos, env, idx, hist);
  //     if (newPos.realized !== pos.realized){ setRealizedMarks(m=> [...m, { day: idx, realized: newPos.realized }]); }
  //     setPos(newPos);
  //   }
  // }, [idx, pos.expiryIndex]);

  
// Auto-expiry with assignment handling
useEffect(() => {
  if (pos.expiryIndex !== undefined && idx >= pos.expiryIndex && pos.legs.length > 0) {
    const ts = Date.parse(hist.dates[idx]);
    const S  = round2(hist.prices[idx]);

    let realizedDeltaSum = 0;
    let deltaCash = 0;

    for (const leg of pos.legs) {
      const intrinsic = intrinsicAtExpiry(leg.right, S, leg.strike); // per share

      if (leg.side === 'LONG') {
        // Close long option to cash at intrinsic
        const cashClose = round2(intrinsic * CONTRACT_MULTIPLIER * leg.quantity);
        const realized = round2((intrinsic - leg.entryPrice) * CONTRACT_MULTIPLIER * leg.quantity);
        deltaCash += cashClose;

        pushLedger(portfolioStore.pf, {
          timestamp: ts,
          type: 'CLOSE_LONG_OPTION',
          symbol: UNDERLYING_SYMBOL,
          details: { right: leg.right, qty: leg.quantity, strike: leg.strike, price: intrinsic },
          cashDelta: +cashClose,
          realizedPnL: realized,
        });

        realizedDeltaSum += realized;
      } else {
        // SHORT options
        if (leg.right === 'PUT') {
          if (intrinsic > 0) {
            // ITM: assignment -> buy shares at strike
            assignShortPut(
              portfolioStore.pf,
              UNDERLYING_SYMBOL,
              leg.quantity,
              leg.strike,
              S,
              leg.entryPrice,
              ts
            );
            // assignShortPut already pushed ledger and mutated cash; its realized is included
          } else {
            // OTM: close short option, realized = premium, no cash change at expiry
            const realized = round2(leg.entryPrice * CONTRACT_MULTIPLIER * leg.quantity);

            pushLedger(portfolioStore.pf, {
              timestamp: ts,
              type: 'CLOSE_SHORT_OPTION',
              symbol: UNDERLYING_SYMBOL,
              details: { right: 'PUT', qty: leg.quantity, strike: leg.strike, price: 0 },
              cashDelta: 0,
              realizedPnL: realized,
            });

            realizedDeltaSum += realized;
          }
        } else if (leg.right === 'CALL') {
          if (intrinsic > 0) {
            // ITM: assignment -> deliver shares at strike
            assignShortCall(
              portfolioStore.pf,
              UNDERLYING_SYMBOL,
              leg.quantity,
              leg.strike,
              S,
              leg.entryPrice,
              ts
            );
            // assignShortCall already pushed ledger and mutated cash; its realized is included
          } else {
            // OTM: close short call, realized = premium, no cash change
            const realized = round2(leg.entryPrice * CONTRACT_MULTIPLIER * leg.quantity);

            pushLedger(portfolioStore.pf, {
              timestamp: ts,
              type: 'CLOSE_SHORT_OPTION',
              symbol: UNDERLYING_SYMBOL,
              details: { right: 'CALL', qty: leg.quantity, strike: leg.strike, price: 0 },
              cashDelta: 0,
              realizedPnL: realized,
            });

            realizedDeltaSum += realized;
          }
        }
      }
    }

    // Apply any cash deltas accumulated from long option closes (assignment functions already mutated cash)
    if (deltaCash !== 0) {
      portfolioStore.pf.cash.available += deltaCash;
    }

    // Mark realized timeline for charts
    if (realizedDeltaSum !== 0) {
      setRealizedMarks(m => [...m, { day: idx, realized: (m.at(-1)?.realized ?? 0) + realizedDeltaSum }]);
    }

    // Clear open position after expiry
    setPos(emptyPosition());
  }
}, [idx, pos.expiryIndex]);


  const ahead = 30;
  const labelsExtended = useMemo(()=>{ const base = hist.dates.slice(0, idx+1); const last = new Date(hist.dates[idx]); for(let i=1;i<=ahead;i++){ const d=new Date(last); d.setDate(last.getDate()+i); base.push(d.toISOString().slice(0,10)); } return base; }, [hist.dates, idx]);
  const pricesExtended = useMemo(()=>{ const arr = hist.prices.slice(0, idx+1) as (number|null)[]; for(let i=0;i<ahead;i++) arr.push(null); return arr; }, [hist.prices, idx]);

  
  const gNow = greeksNow(pos, env, idx, hist);
  const gTS = greeksTimeSeries(pos, env, idx, hist);

  const payoffSeries = useMemo(()=>{
    if (!pos.expiryIndex || pos.legs.length===0) return [] as {label:string, prices:number[], values:number[]}[];
    const remaining = Math.max(0, pos.expiryIndex - idx);
    const daysList = [0,1,5,10,20,30,60].filter(d => d <= remaining);
    const series:any[] = [];
    const [pxE, pyE] = payoutCurveAtExpiry(pos, S); series.push({ label: 'Expiry', prices: pxE, values: pyE });
    for (const d of daysList){ if (d===0) continue; const Tau = d / 365; const [px, py] = pnlCurveAtTau(pos, env, S, Tau); series.push({ label: `${d}d before`, prices: px, values: py }); }
    return series;
  }, [pos, env, idx, S]);

  const nextDay = () => setIdx(i => Math.min(hist.prices.length-31, i+1));

  useEffect(()=>{ const onKey=(e:KeyboardEvent)=>{ if (e.key==='n'||e.key==='N'||e.key==='ArrowRight'){ e.preventDefault(); nextDay(); } if (e.key==='a'||e.key==='A'){ e.preventDefault(); setShowAction(true); } if (e.key==='c'||e.key==='C'){ e.preventDefault(); const newPos=emptyPosition(); setPos(newPos);} if (e.key==='Escape'){ setShowAction(false); setTemplateDraft(null);} }; window.addEventListener('keydown', onKey); return ()=> window.removeEventListener('keydown', onKey); }, [idx]);


function applyAction(apply: (pos: OpenPosition, env: Env, idx: number, hist: any) => OpenPosition) {
  const before = pos;
  const newPos = apply(pos, env, idx, hist);

  let deltaCash = 0;

  // ----- CLOSED LEGS (removed in newPos)
  const closed = before.legs.filter(b => !newPos.legs.find(n => n.id === b.id));
  if (closed.length > 0) {
    const Tau = Math.max(0, (before.expiryIndex! - idx) / 365);
    const ts = Date.parse(hist.dates[idx]);

    // Cash from closing legs (receive for LONG, pay for SHORT)
    const legsCashClose = closed.map(l => ({
      side: l.side, right: l.right, quantity: l.quantity,
      price: round2(bsmPrice(hist.prices[idx], l.strike, env.r, env.q, env.sigma, Tau, l.right)),
    }));
    deltaCash += cashChangeClose(legsCashClose);

    // Realized P&L per leg
    for (const l of closed) {
      const closePxShare = round2(bsmPrice(hist.prices[idx], l.strike, env.r, env.q, env.sigma, Tau, l.right));
      const sign = l.side === 'LONG' ? +1 : -1;
      const realized = sign * (closePxShare - l.entryPrice) * CONTRACT_MULTIPLIER * l.quantity;

      pushLedger(portfolioStore.pf, {
        id: uid('led'),
        timestamp: ts,
        type: l.side === 'LONG' ? 'CLOSE_LONG_OPTION' : 'CLOSE_SHORT_OPTION',
        symbol: '-', // single underlying in your sim
        details: { right: l.right, qty: l.quantity, price: closePxShare, strike: l.strike },
        cashDelta: (l.side === 'LONG' ? +1 : -1) * closePxShare * CONTRACT_MULTIPLIER * l.quantity,
        realizedPnL: realized,
      });
    }
  }

  // ----- ADDED LEGS (new in newPos)
  const added = newPos.legs.filter(n => !before.legs.find(b => b.id === n.id));
  if (added.length > 0) {
    const ts = Date.parse(hist.dates[idx]);

    // Stamp entry date on new legs
    for (const leg of added) {
      leg.entryIndex = idx;
      leg.entryTimestamp = ts;
    }

    // Cash from opening legs (pay for LONG, receive for SHORT)
    const legsCashOpen = added.map(l => ({
      side: l.side, right: l.right, quantity: l.quantity, price: l.entryPrice,
    }));
    deltaCash += cashChangeOpen(legsCashOpen);

    // Ledger entries for openings
    for (const l of added) {
      pushLedger(portfolioStore.pf, {
        id: uid('led'),
        timestamp: ts,
        type: l.side === 'LONG' ? 'BUY_OPTION' : 'SELL_OPTION',
        symbol: '-',
        details: { right: l.right, qty: l.quantity, price: l.entryPrice, strike: l.strike },
        cashDelta: (l.side === 'LONG' ? -1 : +1) * l.entryPrice * CONTRACT_MULTIPLIER * l.quantity,
        realizedPnL: 0,
      });
    }
  }

  // ----- Apply cash delta to portfolio store (single source of truth)
  if (deltaCash !== 0) {
    portfolioStore.pf.cash.available += deltaCash;
  }

  // Keep your existing realized marks logic (options realized record)
  if (newPos.realized !== before.realized) {
    setRealizedMarks(m => [...m, { day: idx, realized: newPos.realized }]);
  }

  setPos(newPos);
}


// Option trade/event types that contribute to realized P&L
const OPTION_REALIZED_TYPES = new Set([
  'BUY_OPTION',          // usually 0 realized (cash only), but include if you set realizedPnL
  'SELL_OPTION',         // usually 0 realized, cash only
  'CLOSE_LONG_OPTION',
  'CLOSE_SHORT_OPTION',
  'ASSIGN_SHORT_CALL',
  'ASSIGN_SHORT_PUT',
  'EXERCISE_LONG_CALL',
  'EXERCISE_LONG_PUT',
]);

/** Build a cumulative realized options series from the ledger (timestamps aligned to hist.dates). */
function buildRealizedOptionsSeriesFromLedger(
  ledger: LedgerEntry[],
  histDates: string[],
  currentIdx: number
) {
  const entries = [...(ledger ?? [])]
    .filter(e => OPTION_REALIZED_TYPES.has(e.type))
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  const out: (number | null)[] = [];
  let cum = 0;
  let k = 0;

  for (let i = 0; i < histDates.length; i++) {
    const dayStr = histDates[i];

    // accumulate all option realized P&L up to and including this day
    while (k < entries.length) {
      const tsStr = new Date(entries[k].timestamp ?? 0).toISOString().slice(0, 10);
      if (tsStr <= dayStr) {
        cum += entries[k].realizedPnL ?? 0; // already includes ×100 in your ledger
        k++;
      } else {
        break;
      }
    }
    out.push(i <= currentIdx ? Math.round((cum + Number.EPSILON) * 100) / 100 : null);
  }

  return out;
}


function onPickTemplate(templateKey:string){ const t = templates.find(x=>x.key===templateKey); if (!t) return; const draftLegs = t.build(S); const expiryDays = (dte ?? 30) || 30; setTemplateDraft({ legs: draftLegs, expiryDays }); setShowAction(true); }

// Format YYYY-MM-DD (same style as hist.dates)
function toDayString(ts?: number) {
  const d = new Date(ts ?? 0);
  return d.toISOString().slice(0, 10);
}

/**
 * Build stock realized and unrealized series over the historical timeline.
 * We step through ledger entries (requires valid timestamps) and keep
 * per-symbol running position (shares, cost).
 */
function buildStockSeries(
  ledger: LedgerEntry[],
  histDates: string[],
  histPrices: number[],
  currentIdx: number
) {
  const fallbackTs = Date.parse(histDates[Math.min(currentIdx, histDates.length - 1)]);

  // ensure each entry has a timestamp; sort chronologically
  const entries = [...(ledger ?? [])]
    .map(e => ({ ...e, _ts: Number.isFinite(e.timestamp) ? (e.timestamp as number) : fallbackTs }))
    .sort((a, b) => a._ts - b._ts);

  type SymState = { shares: number; cost: number; realized: number };
  const stateBySym: Record<string, SymState> = {};

  const realizedStocks: number[] = [];
  const unrealizedStocks: number[] = [];

  let eIdx = 0;

  for (let i = 0; i < histDates.length; i++) {
    const dayStr = histDates[i];
    const S = histPrices[i] ?? 0;

    // Apply entries up to & including this day
    while (eIdx < entries.length && toDayString(entries[eIdx]._ts) <= dayStr) {
      const e = entries[eIdx];
      const sym = e.symbol ?? '_';
      const st = (stateBySym[sym] ??= { shares: 0, cost: 0, realized: 0 });

      const qty = e.details?.qty ?? e.details?.shares ?? 0;
      const px  = e.details?.price ?? 0;

      switch (e.type) {
        case 'BUY_STOCK': {
          st.shares += qty;
          st.cost   += qty * px;
          break;
        }
        case 'SELL_STOCK': {
          if (st.shares > 0) {
            const avg    = st.cost / st.shares;
            const plReal = (px - avg) * qty;
            st.shares   -= qty;
            st.cost     -= avg * qty;
            st.realized += plReal;
          } else {
            // fallback if local tracking isn't sufficient
            st.realized += e.realizedPnL ?? 0;
          }
          break;
        }
        case 'DIVIDEND': {
          const amt = e.details?.amount ?? e.cashDelta ?? 0;
          st.realized += amt;
          break;
        }
        // Assignment/exercise (simplified; adapt signs to your store semantics)
        case 'ASSIGN_SHORT_CALL':
        case 'ASSIGN_SHORT_PUT':
        case 'EXERCISE_LONG_CALL':
        case 'EXERCISE_LONG_PUT': {
          const assignQty = e.details?.qty ?? 0;
          const strike    = e.details?.strike ?? 0;
          st.shares += assignQty;
          st.cost   += assignQty * strike;
          st.realized += e.realizedPnL ?? 0;
          break;
        }
        default: {
          // Reserve/release do not directly affect P&L; respect any realizedPnL field
          // st.realized += e.realizedPnL ?? 0;
        }
      }
      eIdx++;
    }

    // Unrealized on open shares vs avg cost
    let unrealSum = 0;
    let realizedSum = 0;
    for (const sym of Object.keys(stateBySym)) {
      const st = stateBySym[sym];
      if (st.shares > 0) {
        const avg = st.cost / st.shares;
        unrealSum += st.shares * (S - avg);
      }
      realizedSum += st.realized;
    }

    realizedStocks.push(round2(realizedSum));
    unrealizedStocks.push(round2(unrealSum));
  }

  return { realizedStocks, unrealizedStocks };
}

/**
 * Build options unrealized series by re-pricing legs at each day.
 * Realized options P&L comes from realizedMarks already collected in page.tsx.
 */
function buildOptionsUnrealSeries(pos: OpenPosition, env: Env, hist: { prices: number[]; dates: string[] }) {
  const unreal: number[] = [];

  for (let i = 0; i < hist.dates.length; i++) {
    const S = hist.prices[i] ?? 0;
    const Tau = pos.expiryIndex !== undefined ? Math.max(0, (pos.expiryIndex - i) / 365) : 0;

    let u = 0;
    for (const leg of pos.legs) {
      if (leg.entryIndex !== undefined && i < leg.entryIndex) continue;

      const lastPxShare = round2(bsmPrice(S, leg.strike, env.r, env.q, env.sigma, Tau, leg.right));
      const sign = leg.side === 'LONG' ? 1 : -1;

      // per-share premium delta × contracts × 100 shares per contract
      u += sign * (lastPxShare - leg.entryPrice) * CONTRACT_MULTIPLIER * leg.quantity;
    }
    unreal.push(Math.round(u * 100) / 100);
  }
  return unreal;
}

/** Align a raw series (per-day values) to chart length:
 * - Use value up to current idx
 * - Use null beyond idx
 * - Extend to labelsLength with nulls
 */
function alignSeries(raw: number[], idx: number, labelsLength: number): (number | null)[] {
  const aligned = raw.map((v, i) => (i <= idx ? round2(v ?? 0) : null));
  if (aligned.length < labelsLength) {
    aligned.push(...Array(labelsLength - aligned.length).fill(null));
  }
  return aligned;
}

// If your ledger array is mutated in-place (push), this makes React recompute:
const ledgerLen = portfolioStore.pf.ledger?.length ?? 0;

// --- Build components of equity ---
// Stocks: realized & unrealized from ledger
const { realizedStocks, unrealizedStocks } = useMemo(() => {
  // optional rounding of history prices to cents to avoid drift
  const histPricesRounded = hist.prices.map(round2);
  return buildStockSeries(portfolioStore.pf.ledger ?? [], hist.dates, histPricesRounded, idx);
}, [ledgerLen, hist.dates, hist.prices, idx]);

// Options: unrealized by re-pricing legs (make sure ×100 is inside the helper)
const unrealOptions = useMemo(() => {
  return buildOptionsUnrealSeries(pos, env, hist);
}, [pos, env, hist]);

// Options: realized from ledger (DO NOT use realizedMarks here to avoid double-counting)
const realizedOptionsFromLedger = useMemo(() => {
  return buildRealizedOptionsSeriesFromLedger(portfolioStore.pf.ledger ?? [], hist.dates, idx);
}, [ledgerLen, hist.dates, idx]);

// --- Align all series to chart length (labelsExtended) ---
// IMPORTANT: use labelsExtended.length (it includes +ahead future labels)
const labelsLen = labelsExtended.length;

const realizedStocksAligned   = useMemo(() => alignSeries(realizedStocks,   idx, labelsLen), [realizedStocks, idx, labelsLen]);
const unrealizedStocksAligned = useMemo(() => alignSeries(unrealizedStocks, idx, labelsLen), [unrealizedStocks, idx, labelsLen]);

// realizedOptionsFromLedger already returns (number|null)[] of length hist.dates,
// but we still align to labelsExtended.length for consistency:
const realizedOptionsAligned  = useMemo(() => {
  const base = realizedOptionsFromLedger.map((v, i) => (i <= idx ? round2(v ?? 0) : null));
  if (base.length < labelsLen) base.push(...Array(labelsLen - base.length).fill(null));
  return base;
}, [realizedOptionsFromLedger, idx, labelsLen]);

const unrealOptionsAligned    = useMemo(() => alignSeries(unrealOptions,    idx, labelsLen), [unrealOptions, idx, labelsLen]);

// --- Combine realized and total across assets ---
// (These are optional if you only render equity lines below)
const realizedCombinedAligned = useMemo(() => {
  return labelsExtended.map((_, i) => {
    const rStk = realizedStocksAligned[i]   ?? 0;
    const rOpt = realizedOptionsAligned[i]  ?? 0;
    return i <= idx ? round2(rStk + rOpt) : null;
  });
}, [labelsExtended, idx, realizedStocksAligned, realizedOptionsAligned]);

const totalCombinedAligned = useMemo(() => {
  return labelsExtended.map((_, i) => {
    const rStk = realizedStocksAligned[i]     ?? 0;
    const rOpt = realizedOptionsAligned[i]    ?? 0;
    const uStk = unrealizedStocksAligned[i]   ?? 0;
    const uOpt = unrealOptionsAligned[i]      ?? 0;
    return i <= idx ? round2(rStk + rOpt + uStk + uOpt) : null;
  });
}, [labelsExtended, idx, realizedStocksAligned, realizedOptionsAligned, unrealizedStocksAligned, unrealOptionsAligned]);

// --- Equity base (initial deposit) ---
const initialDeposit = portfolioStore.pf.cash.initial ?? portfolioStore.pf.cash.available ?? 0;

// --- Final equity lines ---
const equityRealizedAligned = useMemo(() => {
  return labelsExtended.map((_, i) =>
    i <= idx
      ? round2(initialDeposit + (realizedStocksAligned[i] ?? 0) + (realizedOptionsAligned[i] ?? 0))
      : null
  );
}, [labelsExtended, idx, initialDeposit, realizedStocksAligned, realizedOptionsAligned]);

const equityTotalAligned = useMemo(() => {
  return labelsExtended.map((_, i) =>
    i <= idx
      ? round2(
          initialDeposit
          + (realizedStocksAligned[i]   ?? 0)
          + (realizedOptionsAligned[i]  ?? 0)
          + (unrealizedStocksAligned[i] ?? 0)
          + (unrealOptionsAligned[i]    ?? 0)
        )
      : null
  );
}, [labelsExtended, idx, initialDeposit, realizedStocksAligned, realizedOptionsAligned, unrealizedStocksAligned, unrealOptionsAligned]);



  return (
    <div className="grid2">
      <div>
        <h1 className="h1">Options Timeline Simulator</h1>

        <section className="panel">
          <h3>Price history (+30 days ahead)</h3>
          <LineChart labels={labelsExtended} datasets={[{ label:'Price', data: pricesExtended, color:'#22c55e' }]} />
        </section>

        <section className="panel">
          <div className="row wrap">
            <div><b>Day:</b> {idx}</div>
            <div><b>Date:</b> {date}</div>
            <div><b>Spot S:</b> {S.toFixed(2)}</div>
            <div><b>r:</b> {env.r.toFixed(3)} | <b>q:</b> {env.q.toFixed(3)} | <b>σ:</b> {env.sigma.toFixed(2)}</div>
            {dte!==undefined && <div><b>DTE:</b> {dte} day(s)</div>}
          </div>
          <div className="row">
            <button onClick={nextDay}>Next day ▶ (N)</button>
            <button onClick={()=>setShowAction(true)}>Take action (A)</button>
          </div>
          <p className="muted">Shortcuts: N/→ next, A action, Esc close dialog.</p>
        </section>

        <PortfolioPanel S={S} env={env} pos={pos} idx={idx} hist={hist} />

        <section className="panel">
          <h3>Greeks timeline</h3>
          <LineChart labels={labelsExtended} datasets={[
            { label:'Δ (Delta)', data: gTS.delta.concat(Array(Math.max(0, labelsExtended.length-gTS.delta.length)).fill(null)), color:'#60a5fa' },
            { label:'Θ (Theta/yr)', data: gTS.theta.concat(Array(Math.max(0, labelsExtended.length-gTS.theta.length)).fill(null)), color:'#f97316' },
            { label:'Vega', data: gTS.vega.concat(Array(Math.max(0, labelsExtended.length-gTS.vega.length)).fill(null)), color:'#22c55e' },
          ]} />
        </section>

        <section className="panel">
          <h3>Payoff slices (expiry & selected days before expiry)</h3>
          {payoffSeries.length===0 ? <p className="muted">No open position</p> : <PayoffSlicesChart series={payoffSeries} />}
        </section>

      <section className="panel">
        <h3>Equity growth (Realized vs Total)</h3>
        <LineChart
          labels={labelsExtended}
          datasets={[
            { label: 'Equity (Realized)', data: equityRealizedAligned, color: '#22c55e' },
            { label: 'Equity (Total)',    data: equityTotalAligned,    color: '#eab308' },
          ]}
        />
      </section>
      </div>

      
      <LearningPanel S={S} T={(dte ?? 0)/365} env={env} onPick={onPickTemplate} />
      <CoachPanel S={S} env={env} dates={hist.dates.slice(0, idx+1)} prices={hist.prices.slice(0, idx+1)} jumpsEnabled={jumps.enabled} />

      <RegimePanel regime={regime.key as RegimeKey} setRegime={setRegimeKey} custom={custom} setCustom={setCustom} randomize={randomize} setRandomize={setRandomize} jumps={jumps} setJumps={setJumps} />

      {showAction && (
        <ActionPanel env={env} currentIndex={idx} position={pos} onClose={()=>{ setShowAction(false); setTemplateDraft(null); }} onSubmit={(apply)=>{ setShowAction(false); applyAction(apply); setTemplateDraft(null); }} hist={hist} preset={templateDraft} />
      )}
    </div>
  );
}

