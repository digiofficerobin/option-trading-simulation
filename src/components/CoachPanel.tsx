'use client';
import React, { useMemo } from 'react';
import type { Env } from '@/lib/types';

function sma(arr:number[], n:number){ if (arr.length<n) return null; let s=0; for(let i=arr.length-n;i<arr.length;i++) s+=arr[i]; return s/n; }
function realizedVol(prices:number[], w=20){ if (prices.length<w+1) return null; const rets=[]; for(let i=prices.length-w;i<prices.length;i++){ const r=Math.log(prices[i]/prices[i-1]); rets.push(r); } const stdev=Math.sqrt(rets.reduce((a,b)=>a+b*b,0)/Math.max(1,rets.length-1)); return stdev*Math.sqrt(252); }

export default function CoachPanel({ S, env, dates, prices, jumpsEnabled }:{ S:number, env:Env, dates:string[], prices:number[], jumpsEnabled:boolean }){
  const tip = useMemo(()=>{
    const sma5 = sma(prices,5); const sma20=sma(prices,20); const rv = realizedVol(prices,20); const iv = env.sigma;
    let rationale: string[] = [];
    let rec = '';
    if (sma5 && sma20){
      const up = sma5> sma20*1.002; const down = sma5 < sma20*0.998; const flat = !up && !down;
      if (up && iv < (rv??iv)*0.9){ rec='Bull Call Spread or Long Call'; rationale.push('Uptrend with relatively low IV vs RV favors debit bullish strategies with convexity.'); }
      else if (down && iv < (rv??iv)*1.1){ rec='Bear Put Spread or Long Put'; rationale.push('Downtrend with modest IV: defined-risk bearish plays.'); }
      else if (flat && iv > (rv??iv)*1.3){ rec='Iron Condor or Short Strangle (beware margin)'; rationale.push('Sideways + high IV: short premium/defined risk spreads capture theta.'); }
      else { rec='Long Straddle/Strangle (if IV low) or Wait'; rationale.push('Signal unclear: consider convexity if IV is cheap or wait for clarity.'); }
    } else { rec='Gather more data'; rationale.push('Not enough history yet to infer trend.'); }
    if (jumpsEnabled){ rationale.push('Jump risk ON → prefer **defined-risk** structures (spreads) over naked shorts.'); }
    return { rec, rationale };
  }, [S, env, dates, prices, jumpsEnabled]);

  return (
    <section className="panel">
      <h3>Coach (when/why)</h3>
      <p><b>Suggestion:</b> {tip.rec}</p>
      <ul>
        {tip.rationale.map((r,i)=> <li key={i} className="muted">{r}</li> )}
      </ul>
    </section>
  );
}
