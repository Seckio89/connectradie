import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmModal from '../ConfirmModal';

function renderModal(props: Partial<React.ComponentProps<typeof ConfirmModal>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <ConfirmModal
      title="Cancel this job?"
      message="The tradie will be told the job is off. Funds in escrow are refunded."
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { ...utils, onConfirm, onCancel };
}

describe('ConfirmModal', () => {
  it('renders the title and message', () => {
    renderModal();

    expect(screen.getByRole('heading', { name: 'Cancel this job?' })).toBeInTheDocument();
    expect(
      screen.getByText('The tradie will be told the job is off. Funds in escrow are refunded.'),
    ).toBeInTheDocument();
  });

  it('is exposed as a modal dialog to assistive tech', () => {
    renderModal();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('uses sentence-case default button labels', () => {
    renderModal();

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('uses custom button labels when given', () => {
    renderModal({ confirmText: 'Release payment', cancelText: 'Keep in escrow' });

    expect(screen.getByRole('button', { name: 'Release payment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep in escrow' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  });

  it('fires onConfirm when the confirm button is clicked', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderModal({ confirmText: 'Release payment' });

    await user.click(screen.getByRole('button', { name: 'Release payment' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('fires onCancel when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('fires onCancel when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderModal();

    await user.click(screen.getByRole('dialog'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss when the click lands inside the panel', async () => {
    const user = userEvent.setup();
    const { onCancel, onConfirm } = renderModal();

    await user.click(screen.getByRole('heading', { name: 'Cancel this job?' }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('tints the confirm action rose for a danger confirmation', () => {
    renderModal({ type: 'danger', confirmText: 'Delete account' });

    // Rose = failed or declined / destructive; the semantic rule is enforced.
    expect(screen.getByRole('button', { name: 'Delete account' }).className).toContain('bg-ct-rose');
  });

  it('tints the confirm action teal for the default warning confirmation', () => {
    renderModal({ confirmText: 'Continue' });

    expect(screen.getByRole('button', { name: 'Continue' }).className).toContain('bg-ct-teal');
  });
});
