import { expect, test } from '@playwright/test';

/**
 * The acceptance criteria jsdom cannot judge (docs/specs/09-dark-mode.md): a real
 * `prefers-color-scheme`, a real reload, real CSS cascade on `/tv`, and the inline boot script
 * in `index.html` that runs before Angular exists. The unit tests stub `matchMedia` and never
 * load a stylesheet, so none of the below is provable there.
 */

const DARK_BG = 'rgb(24, 23, 21)'; // #181715
const DARK_INK = 'rgb(250, 249, 245)'; // #faf9f5
const DARK_ACCENT = 'rgb(232, 165, 90)'; // #e8a55a
const TOGGLE = 'button.theme-toggle';

test.describe('first visit follows the device', () => {
  test.describe('on a dark-mode device', () => {
    test.use({ colorScheme: 'dark' });

    test('renders dark with nothing stored (AC5)', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    });
  });

  test.describe('on a light-mode device', () => {
    test.use({ colorScheme: 'light' });

    test('renders light with nothing stored (AC6)', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator(TOGGLE)).toBeVisible();
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    });
  });
});

/**
 * AC8 (no light flash) rests on two separable facts, and these tests cover them separately
 * because neither alone is the criterion:
 *
 *  - the inline script can theme the page without Angular — the `page.route` abort below; and
 *  - it is parser-blocking in `<head>` with nothing blocking ahead of it — the ordering test.
 *
 * Neither observes an actual paint. Playwright cannot assert "no light frame was painted"
 * without screenshot diffing at first paint, which is flaky enough to be worse than useless
 * here; taken together these pin the mechanism AC8 depends on, and the ordering test is what
 * would fail if the script were ever moved after the bundle. The abort tests double as the only
 * guard against the script's hardcoded copy of the storage key and the light/dark allowlist
 * drifting away from `theme.ts` — nothing else would catch that.
 *
 * None of this can see the *production* build, where Angular's critical-CSS inlining breaks AC8
 * on its own — see the note in `styles.scss` and `docs/specs/09-dark-mode.md`.
 */
test.describe('the boot script', () => {
  test.use({ colorScheme: 'dark' });

  test('is parser-blocking in <head>, with nothing blocking ahead of it (AC8 ordering)', async ({
    page,
  }) => {
    await page.goto('/');

    const shape = await page.evaluate(() => {
      const scripts = [...document.querySelectorAll('script')];
      const boot = scripts.findIndex((s) => !s.src && s.textContent?.includes('wall-theme'));
      const el = scripts[boot];
      const isDeferred = (s: HTMLScriptElement) => s.defer || s.async || s.type === 'module';
      return {
        found: boot >= 0,
        parent: el?.parentElement?.tagName ?? null,
        deferred: el ? isDeferred(el) : null,
        // Anything ahead of it that is NOT deferred would execute first and could paint first.
        blockingBefore: scripts.slice(0, Math.max(boot, 0)).filter((s) => !isDeferred(s)).length,
      };
    });

    expect(shape.found).toBe(true);
    expect(shape.parent).toBe('HEAD');
    expect(shape.deferred).toBe(false); // parser-blocking: runs before <body> is parsed
    // Not "first script in the document": the dev server injects a module-type Vite client
    // ahead of it, and module scripts are deferred, so they cannot paint before this one.
    // What matters is that nothing *blocking* precedes it.
    expect(shape.blockingBefore).toBe(0);
  });
});

test.describe('the boot script, with Angular blocked', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/main*.js', (route) => route.abort());
  });

  test.describe('following the device', () => {
    test.use({ colorScheme: 'dark' });

    test('themes the page with no Angular present at all (AC8 mechanism)', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      // Angular really is absent — otherwise this would prove nothing about the boot script.
      await expect(page.locator(TOGGLE)).toHaveCount(0);
    });
  });

  test.describe('reading a stored choice', () => {
    // Light device + a stored 'dark' means only the stored value can produce a dark result:
    // if the boot script's storage key or allowlist drifts from theme.ts, this goes light.
    test.use({ colorScheme: 'light' });

    test('reads the same storage key and values ThemeService writes (AC8 drift guard)', async ({
      page,
    }) => {
      await page.addInitScript(() => localStorage.setItem('wall-theme', 'dark'));
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    });

    test('ignores a stored value outside the allowlist (AC10)', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('wall-theme', 'chartreuse'));
      await page.goto('/');
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    });
  });
});

test.describe('the toggle', () => {
  test.use({ colorScheme: 'light' });

  test('is present on every route, including /tv, /materials and /admin (AC1)', async ({
    page,
  }) => {
    // /admin is included un-authenticated on purpose: the toggle is mounted in the app shell
    // outside the router outlet, so it must be there on the PIN gate too — and /admin is the
    // surface the spec's Problem section names as the worst-affected one.
    for (const path of ['/', '/post', '/tv', '/materials', '/admin']) {
      await page.goto(path);
      await expect(page.locator(TOGGLE)).toBeVisible();
    }
  });

  test('recolours the page without a reload, and the choice survives one (AC2/AC3)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');

    await page.locator(TOGGLE).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', DARK_BG);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', DARK_BG);
  });

  test('an explicit light choice survives a dark device preference (AC7)', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    try {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); // device
      await page.locator(TOGGLE).click(); // explicit: light
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');

      await page.reload(); // device still says dark; the explicit choice must win
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    } finally {
      await context.close();
    }
  });

  test('a theme query parameter changes nothing (AC12)', async ({ page }) => {
    await page.goto('/?theme=dark');
    await expect(page.locator(TOGGLE)).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  });

  test('dark renders the exact background, ink and accent the spec names (AC9)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator(TOGGLE).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // The three tokens AC9 names, each read off an element that actually renders it, so a
    // token redefined in the wrong place would show up here rather than in a :root inspection.
    await expect(page.locator('body')).toHaveCSS('background-color', DARK_BG);
    await expect(page.locator('body')).toHaveCSS('color', DARK_INK);
    await expect(page.locator('.wall-new-post')).toHaveCSS('background-color', DARK_ACCENT);
  });
});

test.describe('/tv', () => {
  test.use({ colorScheme: 'light' });

  /**
   * `/tv` does not inherit the root palette — `tv.scss` redeclares every `--wall-*` token on its
   * own `:host`, and reaches the dark set through `:host-context([data-theme='dark'])`. Whether
   * that selector survives Angular's emulated encapsulation is the riskiest CSS decision in this
   * slice and is invisible to jsdom, which never applies component styles.
   */
  test('renders in the theme chosen on / (AC4)', async ({ page }) => {
    await page.goto('/');
    await page.locator(TOGGLE).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.goto('/tv');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('app-tv')).toHaveCSS('background-color', DARK_BG);
  });
});
