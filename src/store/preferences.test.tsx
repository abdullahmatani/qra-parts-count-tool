import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { resolveTheme, useApplyPreferences, usePreferences } from './preferences';

describe('preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    usePreferences.setState({
      theme: 'system',
      density: 'compact',
      initials: '',
      cadColorMode: 'monochrome',
      language: 'en',
      autoAssignSegment: true,
    });
    document.documentElement.className = '';
  });

  it('applies the dark theme and comfortable density to the root element', () => {
    renderHook(() => useApplyPreferences());
    expect(document.documentElement).not.toHaveClass('dark');

    act(() => usePreferences.getState().setTheme('dark'));
    expect(document.documentElement).toHaveClass('dark');

    act(() => usePreferences.getState().setDensity('comfortable'));
    expect(document.documentElement).toHaveClass('density-comfortable');
  });

  it('persists preferences to localStorage, not project data', () => {
    usePreferences.getState().setInitials('  abm ');
    const stored = JSON.parse(localStorage.getItem('qrapc.preferences') ?? '{}');
    expect(stored.state).toEqual({
      theme: 'system',
      density: 'compact',
      initials: 'abm',
      cadColorMode: 'monochrome',
      language: 'en',
      autoAssignSegment: true,
    });
  });

  it('assigns equipment to the highlighted segment until it is switched off', () => {
    expect(usePreferences.getState().autoAssignSegment).toBe(true);
    usePreferences.getState().setAutoAssignSegment(false);
    const stored = JSON.parse(localStorage.getItem('qrapc.preferences') ?? '{}');
    expect(stored.state.autoAssignSegment).toBe(false);
  });

  it('switches the interface to Arabic, right to left, and back (NFR-08)', () => {
    renderHook(() => useApplyPreferences());
    act(() => usePreferences.getState().setLanguage('ar'));
    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(i18n.t('header.settings')).toBe('الإعدادات');

    act(() => usePreferences.getState().setLanguage('en'));
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    expect(i18n.t('header.settings')).toBe('Settings');
  });

  it('resolves explicit themes directly', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });
});
