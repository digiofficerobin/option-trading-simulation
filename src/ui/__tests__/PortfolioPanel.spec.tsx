import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PortfolioPanel } from '@/ui/PortfolioPanel';
import type { Env } from '@/lib/types';

// Minimal mocks for props
const env: Env = { r: 0.03, q: 0.0, sigma: 0.25 };
const hist = { prices: [100, 101, 102], dates: ['2025-10-01', '2025-10-02', '2025-10-03'] };

describe('PortfolioPanel', () => {
  it('renders summary labels', () => {
    render(<PortfolioPanel S={100} env={env} pos={{ legs: [], realized: 0 }} idx={0} hist={hist} />);
    expect(screen.getByText(/Portfolio & Account/i)).toBeInTheDocument();
    expect(screen.getByText(/Cash available:/i)).toBeInTheDocument();
    expect(screen.getByText(/Equity:/i)).toBeInTheDocument();
  });
});
