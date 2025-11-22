'use client';
import React from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, LinearScale, PointElement, CategoryScale, Tooltip, Legend } from 'chart.js';
ChartJS.register(LineElement, LinearScale, PointElement, CategoryScale, Tooltip, Legend);

type Series = { label:string, prices:number[], values:number[], color?:string };
const palette = ['#60a5fa','#22c55e','#eab308','#f97316','#a78bfa','#14b8a6','#f43f5e'];
export default function PayoffSlicesChart({ series }:{ series: Series[] }){
  const datasets = series.map((s, i)=> ({ label: s.label, data: s.values, borderColor: s.color ?? palette[i % palette.length], backgroundColor: 'transparent', pointRadius: 0, borderWidth: 1.5 }));
  const labels = series[0]?.prices.map(p=>p.toFixed(2)) ?? [];
  const data:any = { labels, datasets };
  const options:any = { animation:false, plugins:{ legend:{ display:true } }, scales:{ x:{ ticks:{ maxTicksLimit: 10 } } } };
  return <Line data={data} options={options} height={140} />
}
