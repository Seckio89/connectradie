import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Creates a chainable mock Supabase query builder.
 * Each method returns the same builder so calls can be chained.
 * Call `mockResolve({ data, error })` to set the final response.
 */
export function createMockQueryBuilder(response: { data?: unknown; error?: unknown; count?: number } = { data: null }) {
  const builder: Record<string, unknown> = {};
  const methods = [
    'select', 'insert', 'update', 'delete', 'upsert',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike',
    'is', 'in', 'or', 'not', 'filter',
    'order', 'limit', 'range', 'single', 'maybeSingle',
    'csv', 'count', 'head',
  ];

  for (const method of methods) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  // Terminal methods return the response
  builder.then = vi.fn().mockImplementation((resolve: (value: unknown) => void) => {
    resolve(response);
    return Promise.resolve(response);
  });

  // Make it thenable (awaitable)
  Object.defineProperty(builder, Symbol.toStringTag, { value: 'Promise' });

  // Override to return response directly when awaited
  const originalBuilder = { ...builder };
  for (const method of methods) {
    originalBuilder[method] = vi.fn().mockReturnValue(originalBuilder);
  }

  return {
    ...originalBuilder,
    // Allow setting the final response
    [Symbol.for('nodejs.util.inspect.custom')]: () => 'MockQueryBuilder',
  };
}

/**
 * Renders a component wrapped in MemoryRouter for testing components
 * that use React Router hooks (Link, useNavigate, etc.)
 */
export function renderWithRouter(ui: ReactNode, { route = '/' } = {}) {
  return render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    ),
  });
}
