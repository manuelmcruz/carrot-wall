import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ThemeService } from './theme';
import { ThemeToggleComponent } from './theme-toggle';

/** See theme.spec.ts: jsdom has no real `matchMedia`, so every test stubs it rather than relying
 * on whatever jsdom does by default. */
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

function render() {
  TestBed.configureTestingModule({ imports: [ThemeToggleComponent] });
  const fixture = TestBed.createComponent(ThemeToggleComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('ThemeToggleComponent', () => {
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

  it('renders a real button with an inline svg icon, never [innerHTML]', () => {
    const { el } = render();
    const button = el.querySelector('button.theme-toggle');

    expect(button).not.toBeNull();
    expect(button!.getAttribute('type')).toBe('button');
    expect(el.querySelector('svg')).not.toBeNull();
  });

  it('clicking the toggle flips the app theme live, with no reload (AC1/AC2)', () => {
    const { fixture, el } = render();
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('light');

    const button = el.querySelector<HTMLButtonElement>('button.theme-toggle')!;
    button.click();
    fixture.detectChanges();

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('the aria-label and aria-pressed describe the current and next state, in Portuguese', () => {
    const { fixture, el } = render();
    const button = () => el.querySelector<HTMLButtonElement>('button.theme-toggle')!;

    expect(button().getAttribute('aria-label')).toBe('Mudar para modo escuro');
    expect(button().getAttribute('aria-pressed')).toBe('false');

    button().click();
    fixture.detectChanges();

    expect(button().getAttribute('aria-label')).toBe('Mudar para modo claro');
    expect(button().getAttribute('aria-pressed')).toBe('true');
  });
});
