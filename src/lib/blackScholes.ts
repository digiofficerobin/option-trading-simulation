import type { OptionRight } from './types';
const erf = (x:number)=>{ const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911; const sign=x<0?-1:1; const ax=Math.abs(x); const t=1/(1+p*ax); const y=1-((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-ax*ax); return sign*y; };
const N = (x:number)=> 0.5*(1+erf(x/Math.SQRT2));
const n = (x:number)=> Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI);

export function bsmPrice(S:number,K:number,r:number,q:number,sigma:number,T:number,right:OptionRight){
  if (sigma<=0 || T<=0){ return right==='CALL'? Math.max(0,S-K):Math.max(0,K-S); }
  const sqrtT=Math.sqrt(T); const d1=(Math.log(S/K)+(r-q+0.5*sigma*sigma)*T)/(sigma*sqrtT); const d2=d1-sigma*sqrtT; const edqT=Math.exp(-q*T), edrT=Math.exp(-r*T);
  return right==='CALL'? S*edqT*N(d1) - K*edrT*N(d2) : K*edrT*N(-d2) - S*edqT*N(-d1);
}

export function bsmGreeks(S:number,K:number,r:number,q:number,sigma:number,T:number,right:OptionRight){
  const sqrtT=Math.sqrt(Math.max(1e-8,T));
  const d1=(Math.log(S/K)+(r-q+0.5*sigma*sigma)*T)/(sigma*sqrtT);
  const d2=d1 - sigma*sqrtT;
  const edqT=Math.exp(-q*T), edrT=Math.exp(-r*T);
  const delta = right==='CALL'? edqT*N(d1) : -edqT*N(-d1);
  const gamma = edqT*n(d1)/(S*sigma*sqrtT);
  const vega  = S*edqT*n(d1)*sqrtT; // per 1.0 volatility
  const theta_call = -(S*edqT*n(d1)*sigma)/(2*sqrtT) - r*K*edrT*N(d2) + q*S*edqT*N(d1);
  const theta_put  = -(S*edqT*n(d1)*sigma)/(2*sqrtT) + r*K*edrT*N(-d2) - q*S*edqT*N(-d1);
  const theta = right==='CALL'? theta_call : theta_put; // per year
  return { delta, gamma, vega, theta };
}

/** Round to 2 decimals (cents) safely to avoid FP drift */
export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

