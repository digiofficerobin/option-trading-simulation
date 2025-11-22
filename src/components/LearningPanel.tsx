'use client'
import React, { useMemo, useState } from 'react'
import type { Env } from '@/lib/types'
import { evaluateTemplates } from '@/lib/learn'

export default function LearningPanel({ S, T, env, onPick }:{
  S:number, T:number, env:Env, onPick:(templateKey:string)=>void
}) {
  const [seed, setSeed] = useState(1234)
  const [n, setN] = useState(3000)

  const results = useMemo(
    () => (T > 0 ? evaluateTemplates({ S0: S, T, env, seed, n }) : []),
    [S, T, env, seed, n]
  )

  return (
    <section className="panel">
      <h3>Learning Mode (beta)</h3>
      <p className="muted">
        Educational-only. Uses Monte Carlo under risk-neutral drift (r−q), current σ and T.
      </p>

      <div className="row wrap">
        <label className="field"><span>Seed</span>
          <input type="number" value={seed} onChange={e => setSeed(parseInt(e.target.value || '0'))} />
        </label>
        <label className="field"><span>Samples</span>
          <input
            type="number" value={n} min={500} max={20000} step={500}
            onChange={e => setN(parseInt(e.target.value || '1000'))}
          />
        </label>
      </div>

      {results.length === 0 ? (
        <p className="muted">No T available. Open or set an expiry to evaluate.</p>
      ) : (
        <table className="table">
          <thead>
            <tr><th>Template</th><th>Premium</th><th>EV</th><th>Median</th><th>PoP</th><th></th></tr>
          </thead>
          <tbody>
            {results.map(r => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td>{r.premium.toFixed(2)}</td>
                <td><b>{r.ev.toFixed(2)}</b></td>
                <td>{r.median.toFixed(2)}</td>
                <td>{(r.pop * 100).toFixed(1)}%</td>
                <td><button onClick={() => onPick(r.key)}>Use</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}