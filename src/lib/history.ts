import type { Regime } from './types';
function mulberry32(a: number){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^(t>>>15), t|1); t^=t+Math.imul(t^(t>>>7), t|61); return ((t^(t>>>14))>>>0)/4294967296; } }
function boxMuller(rng:()=>number){ let u=0,v=0; while(u===0)u=rng(); while(v===0)v=rng(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }

export type History = { dates:string[]; prices:number[]; muSeries:number[]; sigmaSeries:number[] };
export type JumpParams = { enabled:boolean; lambda:number; muJ:number; sigmaJ:number };
export type HistoryParams = {
  S0:number; regime:Regime; days:number; seed?:number; randomize?: boolean; driftNoise?: number; volOfVol?: number; meanRevert?: number; jumps?: JumpParams;
}

export function generateHistory({ S0, regime, days, seed=11, randomize=true, driftNoise=0.02, volOfVol=0.10, meanRevert=0.2, jumps }: HistoryParams): History {
  const rng = mulberry32(seed|0);
  const prices:number[] = [S0];
  const muSeries:number[] = [];
  const sigmaSeries:number[] = [];
  let mu = regime.baseMu; // annual
  let sigma = regime.baseSigma; // annual
  const lam = jumps?.enabled? (jumps.lambda||0.0) : 0.0; // per year
  const muJ = jumps?.muJ ?? -0.2; // mean log jump
  const sigJ = jumps?.sigmaJ ?? 0.25;
  const kappa = Math.exp(muJ + 0.5*sigJ*sigJ) - 1; // E[e^Y] - 1
  for(let i=1;i<=days;i++){
    if (randomize){
      const epsMu = boxMuller(rng) * driftNoise; // ~N(0, driftNoise)
      mu = regime.baseMu + 0.9*(mu - regime.baseMu) + epsMu;
      const epsSig = boxMuller(rng) * volOfVol * sigma; // proportional noise
      sigma = Math.max(0.05, sigma + meanRevert*(regime.baseSigma - sigma) + epsSig);
    } else { mu = regime.baseMu; sigma = regime.baseSigma; }

    const dt = 1/252;
    let logRet = (mu - 0.5*sigma*sigma - lam*kappa)*dt + sigma*Math.sqrt(dt)*boxMuller(rng);
    if (lam>0){
      const p = lam*dt; // probability of a jump per day
      if (rng() < p){
        const Y = muJ + sigJ*boxMuller(rng); // one log jump
        logRet += Y;
      }
    }
    const St = prices[i-1] * Math.exp(logRet);
    prices.push(St);
    muSeries.push(mu); sigmaSeries.push(sigma);
  }
  const start = new Date();
  const dates = prices.map((_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return d.toISOString().slice(0,10); });
  return { dates, prices, muSeries, sigmaSeries };
}

export const REGIMES = {
  BULL:     { key:'BULL',     label:'Bullish',   baseMu: 0.08, baseSigma: 0.20 },
  NEUTRAL:  { key:'NEUTRAL',  label:'Neutral',   baseMu: 0.00, baseSigma: 0.20 },
  BEAR:     { key:'BEAR',     label:'Bearish',   baseMu: -0.08, baseSigma: 0.25 },
  VOLATILE: { key:'VOLATILE', label:'Volatile',  baseMu: 0.00, baseSigma: 0.40 },
  CUSTOM:   { key:'CUSTOM',   label:'Custom',    baseMu: 0.05, baseSigma: 0.25 },
} as const;
