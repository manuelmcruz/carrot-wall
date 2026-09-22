import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ThemeService } from './theme';

/**
 * The one control for `ThemeService`, mounted once in `app.html` so it appears on every route —
 * `/`, `/post`, `/admin`, `/tv` and `/materials` alike (docs/specs/09-dark-mode.md AC1). This
 * deliberately puts a tap target on `/tv`, which `docs/intents/08-tv-mode.md` otherwise asks to
 * have none of; that intent needs updating to reflect this, rather than this component quietly
 * working around it.
 */
@Component({
  selector: 'app-theme-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './theme-toggle.html',
  styleUrl: './theme-toggle.scss',
})
export class ThemeToggleComponent {
  private readonly themeService = inject(ThemeService);

  readonly theme = this.themeService.theme;
  readonly label = computed(() =>
    this.theme() === 'dark' ? 'Mudar para modo claro' : 'Mudar para modo escuro',
  );

  toggle(): void {
    this.themeService.toggle();
  }
}
