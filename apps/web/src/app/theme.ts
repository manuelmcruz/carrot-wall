import { Injectable, Signal, WritableSignal, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'wall-theme';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/**
 * What storage had to say: a valid `theme`, or `null` with `unrecognised` telling the caller
 * whether that was because nothing was stored (first visit — consult the OS) or because what
 * was stored is garbage (devtools tampering, a format from a future version), which the caller
 * then overwrites rather than leaving in place.
 */
interface StoredChoice {
  theme: Theme | null;
  unrecognised: boolean;
}

/**
 * Reads whatever this browser last chose, validated against the light/dark allowlist — an
 * unrecognised stored value is never trusted and never reaches the DOM
 * (docs/specs/09-dark-mode.md's stored-value-is-untrusted-input requirement).
 *
 * The try/catch covers a browser that refuses storage outright; it deliberately keeps no
 * in-memory fallback value, unlike `client-token.ts` / `upvoted-posts.ts`. Those read storage
 * repeatedly across a session, so a fallback earns its keep. This is read exactly once, at
 * construction, and the answer then lives in a signal — a fallback variable could never be read
 * back before the reload that resets it anyway.
 */
function readStoredChoice(): StoredChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isTheme(raw)) {
      return { theme: raw, unrecognised: false };
    }
    return { theme: null, unrecognised: raw !== null };
  } catch {
    return { theme: null, unrecognised: false };
  }
}

/** Swallows a refusal to store (Safari private mode throws on `setItem`): the toggle still has
 * to work for the rest of this page's life, it just won't be remembered after a reload. */
function writeStoredChoice(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Intentionally ignored — see above.
  }
}

function prefersDark(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/**
 * One theme for the whole app — every route reads the same signal, so switching on `/` and then
 * navigating to `/tv` shows `/tv` in the same theme. On first ever visit (nothing stored yet)
 * this follows the OS preference at that moment; once `toggle()` has been called, the explicit
 * choice wins forever — the OS is consulted only when nothing has been chosen yet, never again
 * after (docs/specs/09-dark-mode.md AC5–7).
 *
 * `index.html` runs the same stored-choice-or-OS logic in an inline script before Angular boots,
 * purely to set `data-theme` ahead of first paint so a dark-preference browser never flashes
 * light (AC8). This service's own constructor re-applies the same decision once Angular starts,
 * which is a harmless no-op against whatever the boot script already set, and is what keeps every
 * subsequent toggle and route change in sync from then on.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly themeSignal: WritableSignal<Theme>;

  readonly theme: Signal<Theme>;

  constructor() {
    const stored = readStoredChoice();
    const initial: Theme = stored.theme ?? (prefersDark() ? 'dark' : 'light');

    this.themeSignal = signal(initial);
    this.theme = this.themeSignal.asReadonly();

    // A value that failed the allowlist is replaced, not just ignored: leaving it in storage
    // means every future visit re-reads and re-rejects the same garbage forever.
    if (stored.unrecognised) {
      writeStoredChoice(initial);
    }

    // Applied imperatively rather than through `effect()`: this is a plain `providedIn: 'root'`
    // service with no view of its own, and an `effect()`'s first run is scheduled onto the next
    // change-detection tick, not run synchronously at construction — with nothing to trigger
    // that tick outside a component, the attribute would never be set at all. Applying it
    // directly, at the one place the signal ever changes, keeps this synchronous and correct
    // regardless of whether anything is watching.
    this.applyToDom(initial);
  }

  toggle(): void {
    // Branches on a literal rather than `setAttribute('data-theme', theme)`: the value written
    // to the DOM is always one of these two hardcoded strings, never a variable carrying
    // whatever was read back from storage — the validation in readStoredChoice() is what makes
    // that safe, this is what keeps it safe even if that validation is ever weakened by mistake.
    const next: Theme = this.themeSignal() === 'dark' ? 'light' : 'dark';
    this.themeSignal.set(next);
    writeStoredChoice(next);
    this.applyToDom(next);
  }

  private applyToDom(theme: Theme): void {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
}
