import React, { useEffect, useState } from 'react';
import { portfolioStore } from '../integration/portfolio-store';
import { realizedPnL, exportLedgerCSV } from '../portfolio/ledger';
import { buyUnderlying, sellUnderlying } from '../integration/options-portfolio-adapter';

type Row = { symbol: string; shares: number; avgCost: number; price: number; unrealized: number };

export function PortfolioPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cashAvail, setCashAvail] = useState<number>(portfolioStore.pf.cash.available);
  const [cashRes, setCashRes] = useState<number>(portfolioStore.pf.cash.reserved);
  const [realized, setRealized] = useState<number>(realizedPnL(portfolioStore.pf));
  const [symbol, setSymbol] = useState<string>('XYZ');
  const [shares, setShares] = useState<number>(100);
  const [price, setPrice] = useState<number>(100);

  const refresh = () => {
    setRows(portfolioStore.getUnrealizedRows());
    setCashAvail(portfolioStore.pf.cash.available);
    setCashRes(portfolioStore.pf.cash.reserved);
    setRealized(realizedPnL(portfolioStore.pf));
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 500);
    return () => clearInterval(id);
  }, []);

  const onExport = () => {
    const csv = exportLedgerCSV(portfolioStore.pf);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'portfolio-ledger.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const quickBuy = () => { buyUnderlying(symbol, shares, price); refresh(); };
  const quickSell = () => { sellUnderlying(symbol, shares, price); refresh(); };

  return (
    <div style={{border:'1px solid #ccc', padding:'10px', borderRadius:8, fontFamily:'system-ui', background:'#fafafa'}}>
      <h3 style={{marginTop:0}}>Portfolio &amp; P&amp;L</h3>
      <div style={{display:'flex', gap:24}}>
        <div>
          <div><strong>Cash available:</strong> {cashAvail.toFixed(2)} {portfolioStore.currency}</div>
          <div><strong>Cash reserved:</strong> {cashRes.toFixed(2)} {portfolioStore.currency}</div>
          <div><strong>Realized P&amp;L:</strong> {realized.toFixed(2)} {portfolioStore.currency}</div>
        </div>
        <div style={{marginLeft:'auto'}}>
          <button onClick={onExport}>Export ledger CSV</button>
        </div>
      </div>

      <hr/>
      <h4>Underlying positions</h4>
      <table style={{width:'100%'}}>
        <thead>
          <tr>
            <th align="left">Symbol</th>
            <th align="right">Shares</th>
            <th align="right">Avg cost</th>
            <th align="right">Last price</th>
            <th align="right">Unrealized</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.symbol}>
              <td>{r.symbol}</td>
              <td align="right">{r.shares}</td>
              <td align="right">{r.avgCost.toFixed(2)}</td>
              <td align="right">{r.price.toFixed(2)}</td>
              <td align="right" style={{color: r.unrealized>=0 ? 'green':'crimson'}}>{r.unrealized.toFixed(2)}</td>
            </tr>
          ))}
          {rows.length===0 && (
            <tr><td colSpan={5} style={{opacity:.7}}>No underlying positions yet.</td></tr>
          )}
        </tbody>
      </table>

      <hr/>
      <h4>Quick underlying trade</h4>
      <div style={{display:'flex', gap:8}}>
        <input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())} placeholder="Symbol" style={{width:80}}/>
        <input type="number" value={shares} onChange={e=>setShares(parseInt(e.target.value,10)||0)} placeholder="Shares" style={{width:100}}/>
        <input type="number" value={price} onChange={e=>setPrice(parseFloat(e.target.value)||0)} placeholder="Price" style={{width:100}}/>
        <button onClick={quickBuy}>Buy</button>
        <button onClick={quickSell}>Sell</button>
      </div>
      <div style={{opacity:.7, fontSize:12, marginTop:6}}>No fees/slippage; educational paper-trading model.</div>
    </div>
  );
}
