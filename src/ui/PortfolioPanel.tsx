
import React, { useEffect, useState } from 'react';
import { portfolioStore } from '../integration/portfolio-store';
import { realizedPnL, exportLedgerCSV } from '../portfolio/ledger';
import type { Env } from '@/lib/types';
import { buyUnderlying, sellUnderlying } from '../integration/options-portfolio-adapter';
import { bsmPrice, round2 } from '@/lib/blackScholes';
import { valuePositionNow, marginRequirement, greeksNow, OpenPosition } from '@/lib/portfolio';
import type { PortfolioSnapshot } from '../portfolio/types';

const CONTRACT_MULTIPLIER = 100;

type StockRow = {
  type: 'Stock';
  symbol: string;
  qty: number;
  avgCost: number;
  lastPrice: number;
  unrealized: number;
};

type OptionRow = {
  type: 'Option';
  symbol?: string;
  side: 'LONG' | 'SHORT';
  right: 'CALL' | 'PUT';
  qty: number;
  strike: number;
  expiryAbs?: number;
  dte?: number;
  entryPrice: number;
  lastPrice: number;
  unrealized: number;
};

type UnifiedRow = StockRow | OptionRow;

const fmtUSD = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);


function stockMtm(pf: PortfolioSnapshot, S: number) {
  const S2 = round2(S);
  let total = 0;
  for (const sym of Object.keys(pf.positions ?? {})) {
    const p = pf.positions[sym];
    total += (p.totalShares ?? 0) * S2;
  }
  return round2(total);
}




/** Format USD consistently based on round2 */
function fmtUSD2(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(v));
}


export interface PortfolioPanelProps {
  S: number;
  env: Env;
  pos: OpenPosition;
  idx: number;
  hist: { prices: number[]; dates: string[] } | any;
}

export function PortfolioPanel({ S, env, pos, idx, hist }: PortfolioPanelProps) {
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [cashAvail, setCashAvail] = useState(portfolioStore.pf.cash.available);
  const [cashRes, setCashRes] = useState(portfolioStore.pf.cash.reserved);
  const [realized, setRealized] = useState(realizedPnL(portfolioStore.pf));
  const [symbol, setSymbol] = useState('XYZ');
  const [shares, setShares] = useState(100);
  const [price, setPrice] = useState(S);

  const [mtmStocks, setMtmStocks] = useState(0);
  const [mtmOptions, setMtmOptions] = useState(0);
  const [equity, setEquity] = useState(0);

  const remainingDays = pos.expiryIndex !== undefined ? Math.max(0, pos.expiryIndex - idx) : 0;
  const Tau = remainingDays / 365;
  const dte = pos.expiryIndex !== undefined ? remainingDays : undefined;

  const optionRows: OptionRow[] = pos.legs.map((leg) => {

    const lastPxRaw = bsmPrice(S, leg.strike, env.r, env.q, env.sigma, Tau, leg.right);
    const lastPx = round2(lastPxRaw);
    const entry = round2(leg.entryPrice);
    const sideSign = leg.side === 'LONG' ? 1 : -1;
    const lastPxPerShare = round2(bsmPrice(S, leg.strike, env.r, env.q, env.sigma, Tau, leg.right));
    const lastPxPerContract = lastPxPerShare * CONTRACT_MULTIPLIER

    // unrealized cash for all contracts (per-contract premium delta × contracts)
    const unreal = sideSign * (lastPxPerShare - entry) * CONTRACT_MULTIPLIER * leg.quantity;

    return {
      type: 'Option',
      symbol: '-',
      side: leg.side,
      right: leg.right,
      qty: leg.quantity,         // contracts
      strike: leg.strike,
      expiryAbs: pos.expiryIndex,
      dte,
      entryPrice: leg.entryPrice * CONTRACT_MULTIPLIER,  // show per-contract in table
      lastPrice:  lastPxPerContract,                     // show per-contract in table
      unrealized: unreal,
    };

  });

  
  // Summing MTM options value at “now”:
  const optionsValueNow =
    pos.legs.reduce((acc, leg) => {
      const lastPxShare = bsmPrice(S, leg.strike, env.r, env.q, env.sigma, Tau, leg.right);
      const sign = leg.side === 'LONG' ? 1 : -1;
      const legUnreal = sign * (lastPxShare - leg.entryPrice) * CONTRACT_MULTIPLIER * leg.quantity;
      return acc + legUnreal;
    }, 0);

  const refresh = () => {
    const underlying = portfolioStore.getUnrealizedRows?.() ?? [];

    const S2 = round2(S);
    const mapped: StockRow[] = underlying.map((r: any) => {
      const avg = round2(r.avgCost);
      const last = S2;
      const unreal = round2((last - avg) * r.shares);
      return {
        type: 'Stock',
        symbol: r.symbol,
        qty: r.shares,
        avgCost: avg,
        lastPrice: last,
        unrealized: unreal,
      };
    });
    setStockRows(mapped);



    const cash = round2(portfolioStore.pf.cash.available);
    const optionsValue = round2(valuePositionNow(pos, env, idx, hist).value);
    const stocksValue = stockMtm(portfolioStore.pf, S2);

    setCashAvail(cash);
    setCashRes(round2(portfolioStore.pf.cash.reserved));
    setMtmOptions(optionsValue);
    setMtmStocks(stocksValue);
    setEquity(round2(cash + optionsValue + stocksValue));

    setRealized(realizedPnL(portfolioStore.pf));
    setPrice(S);
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 400);
    return () => clearInterval(id);
  }, [S, pos]);

  const marginReq = marginRequirement(pos, S);
  const marginUtil = equity > 0 ? marginReq / equity : 0;

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

  const quickBuy = () => {
    const ts = Date.parse(hist.dates[idx]);       // <-- simulation day → epoch ms
    buyUnderlying(symbol, shares, price, ts);     // pass ts down
    refresh(); // ✅ instant update
  };
  const quickSell = () => {
    const ts = Date.parse(hist.dates[idx]);       // <-- simulation day → epoch ms
    sellUnderlying(symbol, shares, price, ts);
    refresh(); // ✅ instant update
  };

  const rows: UnifiedRow[] = [...stockRows, ...optionRows];
  const gNow = greeksNow(pos, env, idx, hist);


type TradeRow = {
  id: string;
  time: string;
  type: string;
  symbol: string;
  qty: number | '-';
  price: number | '-';
  plAbs: number;
  plPct: string; // "12.34%" or "-"
};


function isCompletedTrade(type: string, realizedPnL: number) {
  return (
    realizedPnL !== 0 ||
    type === 'SELL_STOCK' ||
    type === 'BUY_STOCK'  ||
    type === 'BUY_OPTION' ||
    type === 'SELL_OPTION' ||
    type === 'CLOSE_LONG_OPTION' ||
    type === 'CLOSE_SHORT_OPTION' ||
    type === 'ASSIGN_SHORT_CALL' ||
    type === 'ASSIGN_SHORT_PUT'  ||
    type === 'EXERCISE_LONG_CALL' ||
    type === 'EXERCISE_LONG_PUT'
  );
}


function ledgerToTradeRows(ledger: any[]): TradeRow[] {
  return (ledger ?? [])
    .filter((e) => isCompletedTrade(e.type, e.realizedPnL ?? 0))
    .map((e) => {
      const qty   = e.details?.qty ?? e.details?.shares ?? '-';
      const price = e.details?.price ?? '-';
      const plAbs = e.realizedPnL ?? 0;
      const basis =  e.details?.costBasis ?? (typeof qty === 'number' && typeof price === 'number' ? qty * price * 100 : undefined);
      const plPct =
        basis && basis !== 0
          ? `${((plAbs / basis) * 100).toFixed(2)}%`
          : '-';
      return {
        id: e.id,
        time: new Date(e.timestamp ?? Date.now()).toLocaleString(),
        type: e.type,
        symbol: e.symbol ?? '-',
        qty,
        price,
        plAbs,
        plPct,
      };
    });
}

  return (
    <>
      {/* Account Summary */}
      <section className="panel">
        <h3>Portfolio &amp; Account (USD)</h3>
        <div className="row wrap">
          <label className="field">
            <span>Initial deposit ($)</span>
            <input
              type="number"
              value={portfolioStore.pf.cash.initial ?? portfolioStore.pf.cash.available}
              onChange={(e) => {
                const v = parseFloat(e.target.value || '0');
                portfolioStore.resetInitialDeposit(v);
                refresh();
              }}
            />
          </label>
          <div><b>Cash available:</b> {fmtUSD2(cashAvail)}</div>
          <div><b>Cash reserved:</b> {fmtUSD2(cashRes)}</div>
          <div><b>Stocks MTM:</b> {fmtUSD2(mtmStocks)}</div>
          <div><b>Options MTM:</b> {fmtUSD2(mtmOptions)}</div>
          <div><b>Equity:</b> {fmtUSD2(equity)}</div>
          <div><b>Margin req:</b> {fmtUSD2(marginReq)} ({(marginUtil * 100).toFixed(0)}%)</div>
          <button onClick={onExport}>Export ledger CSV</button>
        </div>
      </section>

      {/* Unified Portfolio Table */}
      <section className="panel">
        <h4>Unified portfolio (Stocks + Options)</h4>
        <table className="table">
          <thead>
            <tr>
              <th>Type</th><th>Symbol</th><th>Side</th><th>Right</th>
              <th>Qty / Shares</th><th>Strike</th><th>Expiry</th><th>DTE</th>
              <th>Avg/Entry</th><th>Last price</th><th>Unrealized</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={11}>No positions yet.</td></tr>}
            {rows.map((r, i) => {
              const key = r.type === 'Stock' ? `${r.symbol}-stock-${i}` : `opt-${i}`;
              const isGain = r.unrealized >= 0;
              return (
                <tr key={key}>
                  <td>{r.type}</td>
                  {r.type === 'Stock' ? (
                    <>
                      <td>{r.symbol}</td><td>-</td><td>-</td>
                      <td>{r.qty}</td><td>-</td><td>-</td><td>-</td>
                      <td>{fmtUSD2(r.avgCost)}</td>
                      <td>{fmtUSD2(r.lastPrice)}</td>
                      <td style={{ color: isGain ? 'green' : 'crimson' }}>{fmtUSD2(r.unrealized)}</td>
                    </>
                  ) : (
                    <>
                      <td>{r.symbol ?? '-'}</td>
                      <td>{r.side}</td>
                      <td>{r.right}</td>
                      <td>{r.qty}</td>
                      <td>{r.strike}</td>
                      <td>{r.expiryAbs ?? '-'}</td>
                      <td>{r.dte ?? '-'}</td>
                      <td>{fmtUSD2(r.entryPrice)}</td>
                      <td>{fmtUSD2(r.lastPrice)}</td>
                      <td style={{ color: isGain ? 'green' : 'crimson' }}>{fmtUSD2(r.unrealized)}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Portfolio Greeks */}
      <section className="panel">
        <h4>Portfolio Greeks</h4>
        <div className="row wrap">
          <div><b>Δ:</b> {gNow.delta.toFixed(3)}</div>
          <div><b>Γ:</b> {gNow.gamma.toFixed(5)}</div>
          <div><b>Θ:</b> {gNow.theta.toFixed(2)}</div>
          <div><b>Vega:</b> {gNow.vega.toFixed(2)}</div>
        </div>
      </section>


      {/* Trade History (completed trades) */}
      <section className="panel">
        <h4>Trade History</h4>
        {(!portfolioStore.pf.ledger || portfolioStore.pf.ledger.length === 0) ? (
          <p className="muted">No trades yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th><th>Action</th><th>Symbol</th>
                <th>Qty</th><th>Price</th><th>P/L</th><th>P/L %</th>
              </tr>
            </thead>
            <tbody>
              {ledgerToTradeRows(portfolioStore.pf.ledger).map((r) => (
                <tr key={r.id}>
                  <td>{r.time}</td>
                  <td>{r.type}</td>
                  <td>{r.symbol}</td>
                  <td>{r.qty}</td>
                  <td>{typeof r.price === 'number' ? fmtUSD(r.price * 100) : '-'}</td>
                  <td style={{ color: r.plAbs >= 0 ? 'green' : 'crimson' }}>{fmtUSD2(r.plAbs)}</td>
                  <td>{r.plPct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Quick underlying trade */}
      <section className="panel">
        <h5>Quick underlying trade</h5>
        <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Symbol" style={{ width: 80 }} />
        <input type="number" value={shares} onChange={(e) => setShares(parseInt(e.target.value, 10) || 0)} placeholder="Shares" style={{ width: 100 }} />
        
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={round2(price).toFixed(2)}
          onChange={(e) => {
            const v = parseFloat(e.target.value || '0');
            setPrice(round2(v));
          }}
          placeholder="Price"
          style={{ width: 100 }}
        />

        <button onClick={quickBuy}>Buy</button>
        <button onClick={quickSell}>Sell</button>
        <p className="muted" style={{ marginTop: 8 }}>No fees/slippage; educational paper-trading model.</p>
      </section>
    </>
  );
}
