import { fireEvent, render, screen } from '@testing-library/react';
import Modal from '../Modal';

function renderModal(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <Modal isOpen onClose={onClose} {...props}>
      <h2>Payment schedule</h2>
      <button>Approve</button>
    </Modal>,
  );
  return { ...utils, onClose };
}

// The backdrop is the outer element; the panel is its only child. Modal.tsx
// closes on mousedown only when the event target IS the backdrop, so these
// tests drive mousedown directly rather than a click helper.
function backdrop(): HTMLElement {
  return screen.getByText('Payment schedule').closest('div[class*="fixed"]') as HTMLElement;
}

describe('Modal', () => {
  it('renders its children when open', () => {
    renderModal();

    expect(screen.getByRole('heading', { name: 'Payment schedule' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <Modal isOpen={false} onClose={vi.fn()}>
        <h2>Payment schedule</h2>
      </Modal>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Payment schedule')).not.toBeInTheDocument();
  });

  it('closes when the backdrop itself is pressed', () => {
    const { onClose } = renderModal();

    fireEvent.mouseDown(backdrop());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when the press lands on the panel content', () => {
    const { onClose } = renderModal();

    fireEvent.mouseDown(screen.getByRole('heading', { name: 'Payment schedule' }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores backdrop presses when closeOnBackdrop is false', () => {
    const { onClose } = renderModal({ closeOnBackdrop: false });

    fireEvent.mouseDown(backdrop());

    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies the default max width', () => {
    renderModal();

    const panel = screen.getByRole('heading', { name: 'Payment schedule' }).parentElement!;
    expect(panel.className).toContain('max-w-2xl');
  });

  it('applies a requested max width', () => {
    renderModal({ maxWidth: 'md' });

    const panel = screen.getByRole('heading', { name: 'Payment schedule' }).parentElement!;
    expect(panel.className).toContain('max-w-md');
    expect(panel.className).not.toContain('max-w-2xl');
  });

  it('locks body scroll while open and releases it on close', () => {
    const { rerender } = renderModal();
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <Modal isOpen={false} onClose={vi.fn()}>
        <h2>Payment schedule</h2>
      </Modal>,
    );

    expect(document.body.style.overflow).toBe('unset');
  });

  it('releases body scroll on unmount', () => {
    const { unmount } = renderModal();
    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('unset');
  });
});
