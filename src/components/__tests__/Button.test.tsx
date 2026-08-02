import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button, { buttonClasses } from '../ui/Button';

describe('Button', () => {
  it('renders its label as a button', () => {
    render(<Button>Release payment</Button>);
    expect(screen.getByRole('button', { name: 'Release payment' })).toBeInTheDocument();
  });

  it('defaults to type="button" so it cannot accidentally submit a form', () => {
    render(<Button>Release payment</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('accepts an explicit submit type', () => {
    render(<Button type="submit">Send quote</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('calls onClick when pressed', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Release payment</Button>);

    await user.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick while disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>Release payment</Button>);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await user.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to the primary teal variant at the 44px touch-target size', () => {
    render(<Button>Release payment</Button>);

    const className = screen.getByRole('button').className;
    expect(className).toContain('bg-ct-teal');
    expect(className).toContain('min-h-11');
  });

  it.each([
    ['secondary', 'bg-ct-surface-2'],
    ['ghost', 'bg-transparent'],
    ['danger', 'text-ct-rose'],
  ] as const)('applies the %s variant classes', (variant, expected) => {
    render(<Button variant={variant}>Action</Button>);
    expect(screen.getByRole('button').className).toContain(expected);
  });

  it('shrinks to the small size when asked', () => {
    render(<Button size="sm">Edit</Button>);

    const className = screen.getByRole('button').className;
    expect(className).toContain('min-h-9');
    expect(className).not.toContain('min-h-11');
  });

  it('is not full width unless explicitly asked', () => {
    render(<Button>Release payment</Button>);
    expect(screen.getByRole('button').className).not.toContain('w-full');
  });

  it('goes full width on request', () => {
    render(<Button fullWidth>Release payment</Button>);
    expect(screen.getByRole('button').className).toContain('w-full');
  });

  it('keeps a caller className alongside the variant classes', () => {
    render(<Button className="mt-4">Release payment</Button>);

    const className = screen.getByRole('button').className;
    expect(className).toContain('mt-4');
    expect(className).toContain('bg-ct-teal');
  });

  it('forwards arbitrary button attributes', () => {
    render(<Button aria-label="Release escrow payment">Release</Button>);
    expect(screen.getByRole('button', { name: 'Release escrow payment' })).toBeInTheDocument();
  });

  it('exposes the same classes to link-shaped buttons via buttonClasses', () => {
    render(<Button variant="secondary" size="sm">Edit</Button>);

    expect(buttonClasses('secondary', 'sm')).toBe(screen.getByRole('button').className);
    expect(buttonClasses('primary', 'default', true)).toContain('w-full');
  });
});
