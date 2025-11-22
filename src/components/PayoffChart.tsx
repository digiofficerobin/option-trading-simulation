'use client';
import React from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, LinearScale, PointElement, CategoryScale, Tooltip, Legend } from 'chart.js';
ChartJS.register(LineElement, LinearScale, PointElement, CategoryScale, Tooltip, Legend);
export default function PayoffChart({ prices, payoff }:{ prices:number[], payoff:number[] }){
  const data:any = { labels: prices.map(p=>p.toFixed(2)), datasets: [{ label:'P/L @ Expiry', data: payoff, borderColor:'#60a5fa', backgroundColor:'rgba(96,165,250,0.15)', fill:true, pointRadius:0 }] };
  const options:any = { animation:false, plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ maxTicksLimit: 10 } } } };
  return <Line data={data} options={options} height={110} />
}
