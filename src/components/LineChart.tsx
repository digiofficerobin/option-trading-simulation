'use client';
import React from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, LineElement, LinearScale, PointElement, CategoryScale, Tooltip, Legend } from 'chart.js';
ChartJS.register(LineElement, LinearScale, PointElement, CategoryScale, Tooltip, Legend);
export default function LineChart({ labels, datasets, height=120 }:{ labels:string[], datasets:{ label:string, data:(number|null)[], color:string }[], height?:number }){
  const ds = datasets.map(d=>({ label:d.label, data:d.data, borderColor:d.color, pointRadius:0 }));
  const data:any = { labels, datasets: ds };
  const options:any = { animation:false, plugins:{ legend:{ display:true } }, scales:{ x:{ ticks:{ maxTicksLimit: 10 } } } };
  return <Line data={data} options={options} height={height} />
}
