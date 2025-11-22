# Options Timeline Simulator — v5

Adds:
- **Greeks** (Δ, Γ, Θ, Vega) totals + timeline chart
- **Margin** (educational Reg‑T approximation) & **Account** panel with **initial deposit**
- **Jump diffusion** (Merton) crash toggle in price generator
- **Coach** (rule‑based guidance) for **when/why** to apply strategies
- Keeps: regimes with randomized μ/σ, aligned charts, payoff slices, learning mode

> Educational use only. Margin model and suggestions are simplified.

## Run
```bash
npm install
npm run dev
# http://localhost:3000
```
