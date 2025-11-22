'use client';
import React, { useEffect, useMemo, useState } from 'react';
import type { Env } from '@/lib/types';
import { openStrategy, closeAll, closeSelected, openAdditional, previewDraftPremium, payoffCurveForDraft } from '@/lib/portfolio';
import type { OpenPosition } from '@/lib/portfolio';
import { bsmPrice } from '@/lib/blackScholes';
import PayoffChart from './PayoffChart';

type LegDraft = { id: string; side:'LONG'|'SHORT'; right:'CALL'|'PUT'; quantity:number; strike:number };

type Preset = { legs: { side:'LONG'|'SHORT'; right:'CALL'|'PUT'; quantity:number; strike:number }[]; expiryDays: number } | null;

export function ActionPanel({ env, currentIndex, position, onClose, onSubmit, hist, preset }:{ env:Env, currentIndex:number, position:OpenPosition, onClose:()=>void, onSubmit:(apply:(pos:OpenPosition, env:Env, idx:number, hist:any)=>OpenPosition)=>void, hist:{prices:number[]}, preset?: Preset }){
  const initialExpiry = preset?.expiryDays ?? (position.expiryIndex? Math.max(1, position.expiryIndex - currentIndex) : 30);
  const initialLegs: LegDraft[] = (preset?.legs ?? [{ side:'LONG', right:'CALL', quantity:1, strike: Math.round(hist.prices[currentIndex]) }]).map(l=> ({ id: crypto.randomUUID(), ...l }));

  const [expiryDays, setExpiryDays] = useState(initialExpiry);
  const [legs, setLegs] = useState<LegDraft[]>(initialLegs);
  const [closeMap, setCloseMap] = useState<Record<string, number>>({});

  useEffect(()=>{ if (preset){ setExpiryDays(preset.expiryDays); setLegs(preset.legs.map(l=> ({ id: crypto.randomUUID(), ...l }))); } }, [preset?.expiryDays, JSON.stringify(preset?.legs||[]) ]);

  const S = hist.prices[currentIndex];
  const Tau = position.expiryIndex? Math.max(0,(position.expiryIndex - currentIndex)/365) : Math.max(1, Math.round(expiryDays))/365;
  const draftPremium = useMemo(()=> previewDraftPremium(env, S, Tau, legs), [env,S,Tau,legs]);
  const draftPayoff = useMemo(()=> payoffCurveForDraft(env, S, Tau, legs), [env,S,Tau,legs]);

  const updateLeg = (id:string, patch:Partial<LegDraft>)=> setLegs(legs.map(l=> l.id===id? { ...l, ...patch } : l));
  const addLeg = ()=> setLegs([...legs, { id: crypto.randomUUID(), side:'LONG', right:'CALL', quantity:1, strike: Math.round(S) }]);
  const removeLeg = (id:string)=> setLegs(legs.filter(l=> l.id!==id));

  const applySameExpiry = () => onSubmit((pos, env, idx, hist)=>{
    let next = closeSelected(pos, env, idx, hist, closeMap);
    if (legs.length>0){ next = next.expiryIndex? openAdditional(next, env, idx, hist, legs) : openStrategy(next, env, idx, hist, { expiryDays, legs }); }
    return next;
  });

  return (
    <div className="modal">
      <div className="modal-body" style={{maxWidth:900}}>
        <h3>Take action (day {currentIndex})</h3>

        <div className="row wrap">
          <label className="field"><span>Expiry (days)</span>
            <input type="number" value={expiryDays} min={1} step={1} onChange={e=>setExpiryDays(parseInt(e.target.value||'1'))} />
          </label>
        </div>

        {position.legs.length>0 && (
          <>
            <h4>Existing legs — close partially</h4>
            <table className="table">
              <thead><tr><th>Side</th><th>Right</th><th>Qty</th><th>Strike</th><th>Now px</th><th>Close qty</th></tr></thead>
              <tbody>
                {position.legs.map(leg=>{
                  const TauNow = Math.max(0,(position.expiryIndex! - currentIndex)/365);
                  const nowPx = bsmPrice(S, leg.strike, env.r, env.q, env.sigma, TauNow, leg.right);
                  const toClose = Math.max(0, Math.min(leg.quantity, closeMap[leg.id] ?? 0));
                  return (
                    <tr key={leg.id}>
                      <td>{leg.side}</td><td>{leg.right}</td><td>{leg.quantity}</td><td>{leg.strike}</td>
                      <td>{nowPx.toFixed(2)}</td>
                      <td>
                        <input type="number" value={toClose} min={0} max={leg.quantity} step={1}
                          onChange={e=> setCloseMap({ ...closeMap, [leg.id]: parseInt(e.target.value||'0',10) })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        <h4>New legs (to add {position.expiryIndex? 'at same expiry' : 'as new position'})</h4>
        {legs.map(leg=> (
          <div className="row leg" key={leg.id}>
            <select value={leg.side} onChange={e=>updateLeg(leg.id,{ side: e.target.value as any })}>
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </select>
            <select value={leg.right} onChange={e=>updateLeg(leg.id,{ right: e.target.value as any })}>
              <option value="CALL">CALL</option>
              <option value="PUT">PUT</option>
            </select>
            <label className="field small"><span>Qty</span>
              <input type="number" value={leg.quantity} min={1} step={1} onChange={e=>updateLeg(leg.id,{ quantity: parseInt(e.target.value||'1',10) })} />
            </label>
            <label className="field"><span>Strike</span>
              <input type="number" value={leg.strike} step={0.5} onChange={e=>updateLeg(leg.id,{ strike: parseFloat(e.target.value) })} />
            </label>
            <span className="muted">Price: {bsmPrice(S, leg.strike, env.r, env.q, env.sigma, Tau, leg.right).toFixed(2)}</span>
            <button className="danger" onClick={()=>removeLeg(leg.id)}>Remove</button>
          </div>
        ))}
        <button onClick={addLeg}>+ Add leg</button>

        <div className="panel" style={{marginTop:12}}>
          <div className="row wrap"><b>Order premium (credit + / debit −):</b> {draftPremium.toFixed(2)}</div>
          <div><PayoffChart prices={draftPayoff[0]} payoff={draftPayoff[1]} /></div>
        </div>

        <div className="row" style={{justifyContent:'flex-end'}}>
          <button onClick={onClose}>Cancel (Esc)</button>
          <button className="danger" onClick={()=> onSubmit((pos, env, idx, hist)=> closeAll(pos, env, idx, hist))}>Close all</button>
          <button onClick={applySameExpiry}>Apply changes (same expiry)</button>
        </div>
      </div>
    </div>
  );
}
