import { bsmPrice } from './blackScholes';
import type { OptionRight, TradeSide, Env } from './types';
function mulberry32(a: number){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^(t>>>15), t|1); t^=t+Math.imul(t^(t>>>7), t|61); return ((t^(t>>>14))>>>0)/4294967296; } }
function boxMuller(rng:()=>number){ let u=0,v=0; while(u===0)u=rng(); while(v===0)v=rng(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
export type Leg = { side:TradeSide, right:OptionRight, quantity:number, strike:number };
export type Template = { key:string, label:string, build:(S:number)=>Leg[] };
export const templates: Template[] = [
  { key:'long_call_atm', label:'Long Call (ATM)', build:(S)=> [{ side:'LONG', right:'CALL', quantity:1, strike: Math.round(S) }] },
  { key:'bull_call_spread', label:'Bull Call Spread', build:(S)=> [ { side:'LONG', right:'CALL', quantity:1, strike: Math.round(S*0.98) }, { side:'SHORT', right:'CALL', quantity:1, strike: Math.round(S*1.05) } ] },
  { key:'long_put_atm', label:'Long Put (ATM)', build:(S)=> [{ side:'LONG', right:'PUT', quantity:1, strike: Math.round(S) }] },
  { key:'bear_put_spread', label:'Bear Put Spread', build:(S)=> [ { side:'LONG', right:'PUT', quantity:1, strike: Math.round(S*1.02) }, { side:'SHORT', right:'PUT', quantity:1, strike: Math.round(S*0.95) } ] },
  { key:'long_straddle', label:'Long Straddle (ATM)', build:(S)=> [ { side:'LONG', right:'CALL', quantity:1, strike: Math.round(S) }, { side:'LONG', right:'PUT', quantity:1, strike: Math.round(S) } ] },
  { key:'short_strangle', label:'Short Strangle (±10%)', build:(S)=> [ { side:'SHORT', right:'CALL', quantity:1, strike: Math.round(S*1.10) }, { side:'SHORT', right:'PUT', quantity:1, strike: Math.round(S*0.90) } ] },
  { key:'iron_condor', label:'Iron Condor (±10/20%)', build:(S)=> [ { side:'SHORT', right:'CALL', quantity:1, strike: Math.round(S*1.10) }, { side:'LONG', right:'CALL', quantity:1, strike: Math.round(S*1.20) }, { side:'SHORT', right:'PUT', quantity:1, strike: Math.round(S*0.90) }, { side:'LONG', right:'PUT', quantity:1, strike: Math.round(S*0.80) } ] },
];
export type EvalResult = { key:string, label:string, premium:number, ev:number, median:number, pop:number };
export function evaluateTemplates({ S0, T, env, seed=1234, n=3000 }: { S0:number, T:number, env:Env, seed?:number, n?:number }): EvalResult[] {
  const rng = mulberry32(seed|0); const results: EvalResult[] = [];
  for (const t of templates){
    const legs = t.build(S0);
    const premium = legs.reduce((a,l)=> a + (l.side==='LONG'?1:-1) * l.quantity * bsmPrice(S0, l.strike, env.r, env.q, env.sigma, T, l.right), 0);
    const pnl: number[] = [];
    for (let i=0;i<n;i++){
      const z = boxMuller(rng);
      const ST = S0 * Math.exp((env.r - env.q - 0.5*env.sigma*env.sigma)*T + env.sigma*Math.sqrt(T)*z);
      const intrinsic = legs.reduce((acc,l)=>{ const intr = l.right==='CALL'? Math.max(0, ST - l.strike) : Math.max(0, l.strike - ST); return acc + (l.side==='LONG'?1:-1) * l.quantity * intr; }, 0);
      pnl.push(intrinsic + premium);
    }
    pnl.sort((a,b)=>a-b); const mean = pnl.reduce((a,b)=>a+b,0) / n; const median = pnl[Math.floor(n/2)]; const pop = pnl.filter(x=>x>0).length / n;
    results.push({ key:t.key, label:t.label, premium, ev: mean, median, pop });
  }
  results.sort((a,b)=> b.ev - a.ev); return results;
}
