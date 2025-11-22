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
import { bsmPrice } from '@/lib/blackScholes';

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

  const [account, setAccount] = useState<Account>({ startingCash: 10000, cash: 10000 });
  const [realizedMarks, setRealizedMarks] = useState<{day:number, realized:number}[]>([{day:0, realized:0}]);

  // regenerate history when regime/jumps change
  useEffect(()=>{
    const h = generateHistory({ S0:100, regime, days: 420, seed: custom.seed, randomize, jumps });
    setHist(h); setIdx(30); setPos(emptyPosition()); setRealizedMarks([{day:0, realized:0}]); setTemplateDraft(null);
    setEnv(e=> ({ ...e, sigma: regime.baseSigma }));
  }, [regimeKey, custom.mu, custom.sigma, custom.seed, randomize, jumps.enabled, jumps.lambda, jumps.muJ, jumps.sigmaJ]);

  const S = hist.prices[idx];
  const date = hist.dates[idx];
  const dte = pos.expiryIndex ? Math.max(0, pos.expiryIndex - idx) : undefined;

  // Auto-expiry with cash settlement (intrinsic)
  useEffect(()=>{
    if (pos.expiryIndex !== undefined && idx >= pos.expiryIndex && pos.legs.length>0){
      // cash settlement = close at now fair value
      const Tau = Math.max(0,(pos.expiryIndex - idx)/365);
      const legsClose = pos.legs.map(l=> ({ side:l.side, right:l.right, quantity:l.quantity, price: (S && Tau!==undefined)? ( // now price
        (l.right==='CALL'? Math.max(0, S - l.strike): Math.max(0, l.strike - S)) // intrinsic at expiry
      ) : 0 }));
      const deltaCash = legsClose.reduce((a,l)=> a + (l.side==='LONG'? +1: -1) * l.quantity * l.price, 0);
      const newPos = closeAll(pos, env, idx, hist);
      if (newPos.realized !== pos.realized){ setRealizedMarks(m=> [...m, { day: idx, realized: newPos.realized }]); }
      setAccount(a=> ({ ...a, cash: a.cash + deltaCash }));
      setPos(newPos);
    }
  }, [idx, pos.expiryIndex]);

  const ahead = 30;
  const labelsExtended = useMemo(()=>{ const base = hist.dates.slice(0, idx+1); const last = new Date(hist.dates[idx]); for(let i=1;i<=ahead;i++){ const d=new Date(last); d.setDate(last.getDate()+i); base.push(d.toISOString().slice(0,10)); } return base; }, [hist.dates, idx]);
  const pricesExtended = useMemo(()=>{ const arr = hist.prices.slice(0, idx+1) as (number|null)[]; for(let i=0;i<ahead;i++) arr.push(null); return arr; }, [hist.prices, idx]);

  const pnlSeries = useMemo(()=> positionPnlTimeSeries(pos, env, idx, hist), [pos, env, idx, hist]);
  const realizedSeriesAligned = useMemo(()=>{ const out:(number|null)[] = []; let lastVal=0, markIdx=0; for (let i=0;i<labelsExtended.length;i++){ const day=Math.min(i, idx); while (markIdx<realizedMarks.length && realizedMarks[markIdx].day<=day){ lastVal=realizedMarks[markIdx].realized; markIdx++; } out.push(i<=idx ? lastVal : null); } return out; }, [labelsExtended, idx, realizedMarks]);
  const totalSeriesAligned = useMemo(()=>{ const arr = pnlSeries.slice(0, idx+1) as (number|null)[]; for(let i=0;i<ahead;i++) arr.push(null); return arr; }, [pnlSeries, idx]);

  const mtm = useMemo(()=> valuePositionNow(pos, env, idx, hist), [pos, env, idx, hist]);
  const accountEquity = account.cash + mtm.value;
  const marginReq = useMemo(()=> marginRequirement(pos, S), [pos, S]);
  const marginUtil = accountEquity>0? marginReq / accountEquity : 0;

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

  function applyAction(apply:(pos:OpenPosition, env:Env, idx:number, hist:any)=>OpenPosition){
    const before = pos; const newPos = apply(pos, env, idx, hist);
    // Cash delta for openings / closings compared to before state
    // Openings handled by comparing legs added vs removed; estimate via entry/now prices
    let deltaCash = 0;
    // detect legs removed (closed)
    const closed = before.legs.filter(b=> !newPos.legs.find(n=> n.id===b.id));
    if (closed.length>0){
      const Tau = Math.max(0,(before.expiryIndex!-idx)/365);
      const legsCash = closed.map(l=> ({ side:l.side, right:l.right, quantity:l.quantity, price: bsmPrice(S, l.strike, env.r, env.q, env.sigma, Tau, l.right) }));
      deltaCash += cashChangeClose(legsCash);
    }
    // detect legs added (new IDs)
    const added = newPos.legs.filter(n=> !before.legs.find(b=> b.id===n.id));
    if (added.length>0){
      const Tau2 = Math.max(0,(newPos.expiryIndex!-idx)/365);
      const legsCash = added.map(l=> ({ side:l.side, right:l.right, quantity:l.quantity, price: l.entryPrice }));
      deltaCash += cashChangeOpen(legsCash);
    }
    setAccount(a=> ({ ...a, cash: a.cash + deltaCash }));
    if (newPos.realized !== before.realized){ setRealizedMarks(m=>[...m,{ day: idx, realized: newPos.realized }]); }
    setPos(newPos);
  }

  function onPickTemplate(templateKey:string){ const t = templates.find(x=>x.key===templateKey); if (!t) return; const draftLegs = t.build(S); const expiryDays = (dte ?? 30) || 30; setTemplateDraft({ legs: draftLegs, expiryDays }); setShowAction(true); }

  return (
    <div className="grid2">
      <div>
        <h1 className="h1">Options Timeline Simulator</h1>

        <RegimePanel regime={regime.key as RegimeKey} setRegime={setRegimeKey} custom={custom} setCustom={setCustom} randomize={randomize} setRandomize={setRandomize} jumps={jumps} setJumps={setJumps} />

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

        <section className="panel">
          <h3>Account</h3>
          <div className="row wrap">
            <label className="field"><span>Initial deposit (€)</span>
              <input type="number" value={account.startingCash} onChange={e=>{ const v=parseFloat(e.target.value||'0'); setAccount(a=>({ ...a, startingCash:v, cash: v - (a.startingCash - a.cash) })); }} />
            </label>
            <div><b>Cash:</b> € {account.cash.toFixed(2)}</div>
            <div><b>Position value:</b> € {mtm.value.toFixed(2)}</div>
            <div><b>Equity:</b> € {(accountEquity).toFixed(2)}</div>
            <div><b>Margin req:</b> € {marginReq.toFixed(2)} ({(marginUtil*100).toFixed(0)}%)</div>
          </div>
        </section>

        <section className="panel">
          <h3>Price history (+30 days ahead)</h3>
          <LineChart labels={labelsExtended} datasets={[{ label:'Price', data: pricesExtended, color:'#22c55e' }]} />
        </section>

        <section className="panel">
          <h3>P/L (Realized vs Total)</h3>
          <LineChart labels={labelsExtended} datasets={[
            { label: 'Realized', data: realizedSeriesAligned, color:'#22c55e' },
            { label: 'Total (Realized + Unrealized)', data: totalSeriesAligned, color:'#eab308' },
          ]} />
        </section>

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

      </div>

      <div>
        <section className="panel">
          <h3>Open position</h3>
          {pos.legs.length===0 ? <p className="muted">No open legs</p> : (
            <table className="table">
              <thead><tr><th>Side</th><th>Right</th><th>Qty</th><th>Strike</th><th>Expiry (abs day)</th><th>DTE</th><th>Entry px</th></tr></thead>
              <tbody>
                {pos.legs.map(leg=> (
                  <tr key={leg.id}><td>{leg.side}</td><td>{leg.right}</td><td>{leg.quantity}</td><td>{leg.strike}</td><td>{pos.expiryIndex}</td><td>{dte ?? '-'}</td><td>{leg.entryPrice.toFixed(2)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="row wrap">
            <div><b>Δ:</b> {gNow.delta.toFixed(3)}</div>
            <div><b>Γ:</b> {gNow.gamma.toFixed(5)}</div>
            <div><b>Θ (per year):</b> {gNow.theta.toFixed(2)}</div>
            <div><b>Vega:</b> {gNow.vega.toFixed(2)}</div>
          </div>
        </section>


        <LearningPanel S={S} T={(dte ?? 0)/365} env={env} onPick={onPickTemplate} />
        <CoachPanel S={S} env={env} dates={hist.dates.slice(0, idx+1)} prices={hist.prices.slice(0, idx+1)} jumpsEnabled={jumps.enabled} />
      </div>

      <div>
        
      </div>
      {showAction && (
        <ActionPanel env={env} currentIndex={idx} position={pos} onClose={()=>{ setShowAction(false); setTemplateDraft(null); }} onSubmit={(apply)=>{ setShowAction(false); applyAction(apply); setTemplateDraft(null); }} hist={hist} preset={templateDraft} />
      )}
    </div>
  );
}
