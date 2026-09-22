import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ThemeService } from '../theme';
import { PinnedCarouselComponent } from './pinned-carousel';
import { Post } from './wall.models';

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 1,
    name: 'Rita',
    message: 'Olá mundo',
    type: 'livre',
    pinned: true,
    hidden: false,
    upvotes: 0,
    createdAt: Date.now(),
    answerText: null,
    answerUpdatedAt: null,
    ...overrides,
  };
}

function posts(count: number): Post[] {
  return Array.from({ length: count }, (_, i) => post({ id: i + 1, message: `Post ${i + 1}` }));
}

function render(
  input: Post[],
  opts: { pageSize?: number; intervalMs?: number; interactive?: boolean } = {},
) {
  const fixture = TestBed.createComponent(PinnedCarouselComponent);
  fixture.componentRef.setInput('posts', input);
  if (opts.pageSize !== undefined) {
    fixture.componentRef.setInput('pageSize', opts.pageSize);
  }
  if (opts.intervalMs !== undefined) {
    fixture.componentRef.setInput('intervalMs', opts.intervalMs);
  }
  if (opts.interactive !== undefined) {
    fixture.componentRef.setInput('interactive', opts.interactive);
  }
  fixture.detectChanges();
  return fixture;
}

describe('PinnedCarouselComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PinnedCarouselComponent] });
  });

  it('renders nothing when there are no pinned posts', () => {
    const fixture = render([]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.pinned-carousel')).toBeNull();
  });

  it('shows the first page of up to 3 posts when given more', () => {
    const fixture = render(posts(5));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('app-post-card').length).toBe(3);
    expect(el.textContent).toContain('Post 1');
    expect(el.textContent).toContain('Post 3');
    expect(el.textContent).not.toContain('Post 4');
  });

  it('shows no dots at all with 3 or fewer pinned posts (a single page)', () => {
    const fixture = render(posts(3));
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.pinned-carousel__dot').length).toBe(0);
  });

  it('auto-advances to the next page every 6s, wrapping back to the first', () => {
    vi.useFakeTimers();
    try {
      const fixture = render(posts(5));
      const el = fixture.nativeElement as HTMLElement;

      vi.advanceTimersByTime(6000);
      fixture.detectChanges();
      expect(el.textContent).toContain('Post 4');
      expect(el.textContent).not.toContain('Post 1');

      vi.advanceTimersByTime(6000);
      fixture.detectChanges();
      expect(el.textContent).toContain('Post 1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('pauses auto-advance on mouseenter and resumes on mouseleave', () => {
    vi.useFakeTimers();
    try {
      const fixture = render(posts(5));
      const el = fixture.nativeElement as HTMLElement;
      const strip = el.querySelector('.pinned-carousel') as HTMLElement;

      strip.dispatchEvent(new Event('mouseenter'));
      vi.advanceTimersByTime(6000);
      fixture.detectChanges();
      expect(el.textContent).toContain('Post 1');

      strip.dispatchEvent(new Event('mouseleave'));
      vi.advanceTimersByTime(6000);
      fixture.detectChanges();
      expect(el.textContent).toContain('Post 4');
    } finally {
      vi.useRealTimers();
    }
  });

  it('pauses on focusin and resumes on focusout', () => {
    vi.useFakeTimers();
    try {
      const fixture = render(posts(5));
      const el = fixture.nativeElement as HTMLElement;
      const strip = el.querySelector('.pinned-carousel') as HTMLElement;

      strip.dispatchEvent(new Event('focusin'));
      vi.advanceTimersByTime(6000);
      fixture.detectChanges();
      expect(el.textContent).toContain('Post 1');

      strip.dispatchEvent(new Event('focusout'));
      vi.advanceTimersByTime(6000);
      fixture.detectChanges();
      expect(el.textContent).toContain('Post 4');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a dot click jumps directly to that page', () => {
    const fixture = render(posts(5));
    const el = fixture.nativeElement as HTMLElement;

    const dots = el.querySelectorAll('.pinned-carousel__dot');
    expect(dots.length).toBe(2);
    (dots[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.textContent).toContain('Post 4');
  });

  it('toggling the theme neither resets the page nor restarts the page-turn beat (09 AC14)', () => {
    vi.useFakeTimers();
    try {
      const fixture = render(posts(5));
      const el = fixture.nativeElement as HTMLElement;

      // t=6000: the first page turn lands on page 2.
      vi.advanceTimersByTime(6000);
      fixture.detectChanges();
      expect(el.textContent).toContain('Post 4');

      // t=9000: halfway through the next 6s beat — deliberately mid-cycle, because that is
      // where a restarted interval hides. ThemeService lives outside this component's inputs
      // and injector chain entirely, so a theme switch must not touch either piece of state.
      vi.advanceTimersByTime(3000);
      TestBed.inject(ThemeService).toggle();
      fixture.detectChanges();
      expect(fixture.componentInstance.currentPage()).toBe(1);
      expect(el.textContent).toContain('Post 4');

      // t=12000: the beat set up at t=6000 fires here and wraps back to page 1. Had the toggle
      // restarted the interval at t=9000, the next turn would not be due until t=15000 and this
      // would still read 'Post 4' — which is the failure this test exists to catch.
      vi.advanceTimersByTime(3000);
      fixture.detectChanges();
      expect(el.textContent).toContain('Post 1');
      expect(el.textContent).not.toContain('Post 4');
    } finally {
      vi.useRealTimers();
    }
  });

  it('clamps back onto a valid page when the input shrinks below the current page index', () => {
    const fixture = render(posts(5));
    fixture.componentInstance.goTo(1);
    fixture.detectChanges();
    expect(fixture.componentInstance.currentPage()).toBe(1);

    fixture.componentRef.setInput('posts', posts(2));
    fixture.detectChanges();

    expect(fixture.componentInstance.currentPage()).toBe(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Post 1');
  });

  it('never auto-advances when prefers-reduced-motion is set', () => {
    const matchMediaSpy = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('matchMedia', matchMediaSpy);
    vi.useFakeTimers();
    try {
      const fixture = render(posts(5));
      const el = fixture.nativeElement as HTMLElement;

      vi.advanceTimersByTime(30000);
      fixture.detectChanges();

      expect(el.textContent).toContain('Post 1');
      expect(el.textContent).not.toContain('Post 4');
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('pageSize input controls how many posts show per page', () => {
    const fixture = render(posts(5), { pageSize: 1 });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('app-post-card').length).toBe(1);
    expect(el.textContent).toContain('Post 1');
    expect(el.textContent).not.toContain('Post 2');
  });

  it('intervalMs input controls the auto-advance period (not the 6s default)', () => {
    vi.useFakeTimers();
    try {
      const fixture = render(posts(5), { intervalMs: 8000 });
      const el = fixture.nativeElement as HTMLElement;

      vi.advanceTimersByTime(6000);
      fixture.detectChanges();
      expect(el.textContent).not.toContain('Post 4');

      vi.advanceTimersByTime(2000);
      fixture.detectChanges();
      expect(el.textContent).toContain('Post 4');
    } finally {
      vi.useRealTimers();
    }
  });

  it('interactive=false renders no dots and does not pause on hover/focus', () => {
    vi.useFakeTimers();
    try {
      const fixture = render(posts(5), { interactive: false });
      const el = fixture.nativeElement as HTMLElement;
      const strip = el.querySelector('.pinned-carousel') as HTMLElement;

      expect(el.querySelectorAll('.pinned-carousel__dot').length).toBe(0);

      strip.dispatchEvent(new Event('mouseenter'));
      vi.advanceTimersByTime(6000);
      fixture.detectChanges();
      expect(el.textContent).toContain('Post 4');
    } finally {
      vi.useRealTimers();
    }
  });

  it('interactive=false keeps auto-advancing even with prefers-reduced-motion set', () => {
    const matchMediaSpy = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('matchMedia', matchMediaSpy);
    vi.useFakeTimers();
    try {
      const fixture = render(posts(5), { interactive: false });
      const el = fixture.nativeElement as HTMLElement;

      vi.advanceTimersByTime(6000);
      fixture.detectChanges();

      expect(el.textContent).toContain('Post 4');
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
