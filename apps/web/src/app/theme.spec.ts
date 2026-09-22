import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ThemeService } from './theme';

const STORAGE_KEY = 'wall-theme';

/** jsdom does not implement `matchMedia`; `ThemeService` guards against that at runtime, but
 * every test here stubs it explicitly so "OS prefers light/dark" is a deliberate input, not
 * whatever jsdom happens to do. */
function mockMatchMedia(prefersDark: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' && prefersDark,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

function create(): ThemeService {
  TestBed.configureTestingModule({});
  return TestBed.inject(ThemeService);
}

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    mockMatchMedia(false);
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.unstubAllGlobals();
  });

  it('defaults to light when nothing is stored and the OS prefers light (AC6)', () => {
    const service = create();
    expect(service.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('follows the OS to dark on first visit when nothing is stored (AC5)', () => {
    mockMatchMedia(true);
    const service = create();
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('toggling flips the theme and the DOM attribute live, with no reload (AC1/AC2)', () => {
    const service = create();

    service.toggle();
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    service.toggle();
    expect(service.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  it('an explicit choice survives a fresh instance, i.e. a reload (AC3)', () => {
    const first = create();
    first.toggle();
    expect(first.theme()).toBe('dark');

    // Simulates a reload: a brand new injector, same underlying localStorage.
    TestBed.resetTestingModule();
    mockMatchMedia(false);
    const second = create();
    expect(second.theme()).toBe('dark');
  });

  it('an explicit choice is never overridden by a later OS change (AC7)', () => {
    mockMatchMedia(true); // OS prefers dark
    const first = create();
    expect(first.theme()).toBe('dark'); // first visit follows the OS
    first.toggle();
    expect(first.theme()).toBe('light'); // explicit choice: light

    TestBed.resetTestingModule();
    mockMatchMedia(true); // OS still prefers dark
    const second = create();
    expect(second.theme()).toBe('light'); // the explicit choice wins, not the OS
  });

  it('an invalid stored value is never trusted and never reaches the DOM unvalidated (AC10)', () => {
    localStorage.setItem(STORAGE_KEY, '"><script>alert(1)</script>');
    const service = create();

    expect(service.theme()).toBe('light'); // falls back to OS/default, not the garbage value
    // Only ever one of the two literals reaches the DOM — never the raw stored string, so
    // there's nothing to check it against here beyond this: it can only ever be one of these.
    const attr = document.documentElement.getAttribute('data-theme');
    expect(attr === null || attr === 'dark').toBe(true);
  });

  it('an invalid stored value is overwritten, not left in storage (AC10 constraint)', () => {
    localStorage.setItem(STORAGE_KEY, 'chartreuse');
    create();

    // Otherwise every future visit re-reads and re-rejects the same garbage forever.
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('an absent stored value is left absent, so the OS still decides next visit (AC5/AC7)', () => {
    mockMatchMedia(true);
    const service = create();

    // The OS decided this one; nothing was chosen explicitly, so nothing is written — that
    // distinction is what keeps "never toggled" different from "explicitly chose dark".
    expect(service.theme()).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('stores the theme in localStorage and never in a cookie (AC11)', () => {
    const service = create();
    service.toggle();

    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(document.cookie).not.toContain('theme');
  });

  it('keeps working in-session (signal and DOM) when localStorage.setItem throws', () => {
    const service = create();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    try {
      service.toggle();
      expect(service.theme()).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    } finally {
      setItemSpy.mockRestore();
    }
  });
});
