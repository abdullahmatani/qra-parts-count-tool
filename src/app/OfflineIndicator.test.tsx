import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useUiStore } from '@/store/ui-store';
import { OfflineIndicator } from './OfflineIndicator';

function show() {
  return render(
    <TooltipProvider>
      <OfflineIndicator />
    </TooltipProvider>,
  );
}

describe('OfflineIndicator (NFR-01)', () => {
  afterEach(() => {
    vi.useRealTimers();
    useUiStore.getState().setOfflineReady(false);
    useUiStore.getState().setAppUpdate(null);
  });

  it('stands out for a moment when the app becomes available offline', () => {
    vi.useFakeTimers();
    show();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Caching for offline use');
    expect(status).toHaveAttribute('data-highlight', 'false');

    act(() => useUiStore.getState().setOfflineReady(true));
    expect(status).toHaveTextContent('Offline ready');
    expect(status).toHaveAttribute('data-highlight', 'true');
    act(() => vi.advanceTimersByTime(4000));
    expect(status).toHaveAttribute('data-highlight', 'false');
  });

  it('does not stand out when the app was ready already', () => {
    useUiStore.getState().setOfflineReady(true);
    show();
    expect(screen.getByRole('status')).toHaveAttribute('data-highlight', 'false');
  });

  it('offers to reload into a new version that is waiting', async () => {
    const update = vi.fn();
    show();
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
    act(() => useUiStore.getState().setAppUpdate(update));
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(update).toHaveBeenCalledOnce();
  });
});
