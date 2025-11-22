'use client';
import React from 'react';
import type { RegimeKey } from '@/lib/types';

export default function RegimePanel({ regime, setRegime, custom, setCustom, randomize, setRandomize, jumps, setJumps }:{
  regime: RegimeKey, setRegime:(k:RegimeKey)=>void,
  custom: { mu:number, sigma:number, seed:number }, setCustom:(c:{mu:number,sigma:number,seed:number})=>void,
  randomize:boolean, setRandomize:(b:boolean)=>void,
  jumps: { enabled:boolean, lambda:number, muJ:number, sigmaJ:number }, setJumps: (j:{enabled:boolean,lambda:number,muJ:number,sigmaJ:number})=>void
}){
  return (
    <section className="panel">
      <h3>Market regime</h3>
      <div className="row wrap">
        <select value={regime} onChange={e=>setRegime(e.target.value as any)}>
          <option value="BULL">Bullish</option>
          <option value="NEUTRAL">Neutral</option>
          <option value="BEAR">Bearish</option>
          <option value="VOLATILE">Volatile</option>
          <option value="CUSTOM">Custom</option>
        </select>
        {regime==='CUSTOM' && (<>
          <label className="field"><span>μ (annual drift)</span>
            <input type="number" step={0.01} value={custom.mu} onChange={e=>setCustom({ ...custom, mu: parseFloat(e.target.value) })} />
          </label>
          <label className="field"><span>σ (annual vol)</span>
            <input type="number" step={0.01} value={custom.sigma} onChange={e=>setCustom({ ...custom, sigma: parseFloat(e.target.value) })} />
          </label>
        </>)}
        <label className="field"><span>Seed</span>
          <input type="number" value={custom.seed} onChange={e=>setCustom({ ...custom, seed: parseInt(e.target.value||'1') })} />
        </label>
        <label><input type="checkbox" checked={randomize} onChange={e=>setRandomize(e.target.checked)} /> Randomize μ & σ</label>
      </div>

      <h4>Jump risk (Merton)</h4>
      <div className="row wrap">
        <label><input type="checkbox" checked={jumps.enabled} onChange={e=>setJumps({ ...jumps, enabled: e.target.checked })} /> Enable jumps</label>
        <label className="field"><span>λ (per year)</span><input type="number" step={0.1} min={0} value={jumps.lambda} onChange={e=>setJumps({ ...jumps, lambda: parseFloat(e.target.value) })} /></label>
        <label className="field"><span>μ<sub>J</sub> (log)</span><input type="number" step={0.05} value={jumps.muJ} onChange={e=>setJumps({ ...jumps, muJ: parseFloat(e.target.value) })} /></label>
        <label className="field"><span>σ<sub>J</sub></span><input type="number" step={0.05} min={0} value={jumps.sigmaJ} onChange={e=>setJumps({ ...jumps, sigmaJ: parseFloat(e.target.value) })} /></label>
      </div>
    </section>
  );
}
