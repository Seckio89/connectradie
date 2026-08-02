import { render, screen } from '@testing-library/react';
import Pill from '../ui/Pill';

describe('Pill', () => {
  it('renders its label', () => {
    render(<Pill>Funded</Pill>);
    expect(screen.getByText('Funded')).toBeInTheDocument();
  });

  it('defaults to the grey "no state yet" tone', () => {
    render(<Pill>Draft</Pill>);

    const pill = screen.getByText('Draft');
    expect(pill.className).toContain('bg-ct-surface-2');
    expect(pill.className).toContain('text-ct-mute');
    expect(pill.className).not.toContain('text-ct-teal');
  });

  it.each([
    ['teal', 'text-ct-teal', 'Released'],
    ['amber', 'text-ct-amber', 'Awaiting approval'],
    ['rose', 'text-ct-rose', 'Declined'],
  ] as const)('carries the %s tone as text and border colour', (tone, textClass, label) => {
    render(<Pill tone={tone}>{label}</Pill>);

    const pill = screen.getByText(label);
    expect(pill.className).toContain(textClass);
    expect(pill.className).toContain('border');
  });

  it('uses the mono meta treatment and the 9px radius', () => {
    render(<Pill tone="teal">Funded</Pill>);

    const pill = screen.getByText('Funded');
    // Mono uppercase meta label + rounded-ct-sm — a pill steps down inside a card.
    expect(pill.className).toContain('font-ct-mono');
    expect(pill.className).toContain('uppercase');
    expect(pill.className).toContain('rounded-ct-sm');
  });

  it('appends a caller className without dropping the tone', () => {
    render(<Pill tone="rose" className="ml-2">Payment failed</Pill>);

    const pill = screen.getByText('Payment failed');
    expect(pill.className).toContain('ml-2');
    expect(pill.className).toContain('text-ct-rose');
  });
});
