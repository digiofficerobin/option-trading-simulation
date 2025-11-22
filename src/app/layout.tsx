export const metadata = { title: 'Options Timeline Simulator v5', description: 'Greeks, margin, cash, jumps, and coaching' };
import '../..//styles/globals.css';
import React from 'react';
export default function RootLayout({ children }: { children: React.ReactNode }){
  return (<html lang="en"><body><main className="container">{children}</main></body></html>);
}
