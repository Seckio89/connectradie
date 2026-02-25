import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Search } from 'lucide-react';
import EmptyState from '../EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(
      <EmptyState
        icon={Search}
        title="No results"
        description="Try a different search term"
      />
    );

    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(screen.getByText('Try a different search term')).toBeInTheDocument();
  });

  it('shows action button when actionLabel and onAction provided', () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        icon={Search}
        title="Empty"
        description="Nothing here"
        actionLabel="Add Item"
        onAction={onAction}
      />
    );

    expect(screen.getByText('Add Item')).toBeInTheDocument();
  });

  it('does not show action button when actionLabel is missing', () => {
    render(
      <EmptyState
        icon={Search}
        title="Empty"
        description="Nothing here"
      />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onAction when button is clicked', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(
      <EmptyState
        icon={Search}
        title="Empty"
        description="Nothing here"
        actionLabel="Do Something"
        onAction={onAction}
      />
    );

    await user.click(screen.getByText('Do Something'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('applies compact styles when compact is true', () => {
    const { container } = render(
      <EmptyState
        icon={Search}
        title="Compact"
        description="Smaller"
        compact
      />
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('py-8');
  });

  it('applies full styles when compact is false', () => {
    const { container } = render(
      <EmptyState
        icon={Search}
        title="Full"
        description="Larger"
      />
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('py-16');
  });
});
