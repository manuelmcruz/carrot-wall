import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { Post } from './wall.models';
import { PostCardComponent } from './post-card';
import { markUpvoted } from './upvoted-posts';

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 1,
    name: 'Rita',
    message: 'Olá mundo',
    type: 'livre',
    pinned: false,
    hidden: false,
    upvotes: 3,
    createdAt: Date.now() - 5 * 60_000,
    answerText: null,
    answerUpdatedAt: null,
    ...overrides,
  };
}

async function render(input: Post, admin = false) {
  const fixture = TestBed.createComponent(PostCardComponent);
  fixture.componentRef.setInput('post', input);
  fixture.componentRef.setInput('admin', admin);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function renderFixture(input: Post): {
  fixture: ComponentFixture<PostCardComponent>;
  el: HTMLElement;
} {
  const fixture = TestBed.createComponent(PostCardComponent);
  fixture.componentRef.setInput('post', input);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

/** Mirrors moderation-controls.spec.ts's `settle`: whenStable() alone doesn't wait for a
 * `.then()`/`.catch()` layered on top of an HTTP call, so this adds the extra macrotask tick. */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

describe('PostCardComponent', () => {
  beforeEach(() => {
    // AnswerEditorComponent (rendered when admin=true) injects HttpClient — provided here so
    // DI resolves even though these tests never trigger a request through it; interaction
    // with the editor itself is answer-editor.spec.ts's job, not this file's.
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('renders the message, author, type and upvote count', async () => {
    const el = await render(post({ name: 'Rita', message: 'Olá mundo', upvotes: 7 }));
    expect(el.textContent).toContain('Olá mundo');
    expect(el.textContent).toContain('Rita');
    expect(el.textContent).toContain('7');
  });

  it('shows "Anónimo" when the post has no name', async () => {
    const el = await render(post({ name: null }));
    expect(el.textContent).toContain('Anónimo');
  });

  it('shows the pin marker only when pinned', async () => {
    const pinned = await render(post({ pinned: true }));
    expect(pinned.querySelector('.post-card__pin')).not.toBeNull();

    const unpinned = await render(post({ pinned: false }));
    expect(unpinned.querySelector('.post-card__pin')).toBeNull();
  });

  it('shows the answer block only when there is an answer', async () => {
    const answered = await render(post({ answerText: 'Sim.' }));
    expect(answered.textContent).toContain('Sim.');

    const unanswered = await render(post({ answerText: null }));
    expect(unanswered.querySelector('.post-card__answer')).toBeNull();
  });

  it('renders a message containing a script tag as literal text, never as HTML (spec §7.12)', async () => {
    const payload = '<script>alert(1)</script>';
    const el = await render(post({ message: payload }));

    expect(el.querySelector('script')).toBeNull();
    expect(el.textContent).toContain(payload);
  });

  it('renders an answer containing a script tag as literal text, never as HTML (spec §7.12)', async () => {
    const payload = '<script>alert(1)</script>';
    const el = await render(post({ answerText: payload }));

    expect(el.querySelector('script')).toBeNull();
    expect(el.textContent).toContain(payload);
  });

  it('still renders a script tag as literal text in dark mode (09 AC15)', async () => {
    // Escaping is a property of interpolation and cannot vary by theme, so this can only ever
    // agree with the two tests above — it exists because AC15 asks for the check "in both
    // themes" explicitly, and a reader should not have to re-derive that it is theme-independent.
    document.documentElement.setAttribute('data-theme', 'dark');
    try {
      const payload = '<script>alert(1)</script>';
      const el = await render(post({ message: payload }));

      expect(el.querySelector('script')).toBeNull();
      expect(el.textContent).toContain(payload);
    } finally {
      document.documentElement.removeAttribute('data-theme');
    }
  });

  it('shows the admin answer editor only when admin is true', async () => {
    const publicCard = await render(post());
    expect(publicCard.querySelector('app-answer-editor')).toBeNull();

    const adminCard = await render(post(), true);
    expect(adminCard.querySelector('app-answer-editor')).not.toBeNull();
    expect(adminCard.textContent).toContain('Responder');
  });

  it('shows the admin moderation controls only when admin is true', async () => {
    const publicCard = await render(post());
    expect(publicCard.querySelector('app-moderation-controls')).toBeNull();

    const adminCard = await render(post(), true);
    expect(adminCard.querySelector('app-moderation-controls')).not.toBeNull();
  });

  it('shows the "Oculto" marker and dims the card only for a hidden post in admin mode', async () => {
    const adminHidden = await render(post({ hidden: true }), true);
    expect(adminHidden.textContent).toContain('Oculto');
    expect(adminHidden.querySelector('.post-card--hidden')).not.toBeNull();

    const adminVisible = await render(post({ hidden: false }), true);
    expect(adminVisible.textContent).not.toContain('Oculto');
    expect(adminVisible.querySelector('.post-card--hidden')).toBeNull();

    // A hidden post never reaches a non-admin card in practice (it's excluded from the public
    // response entirely), but the marker still must not render if it somehow did.
    const publicHidden = await render(post({ hidden: true }), false);
    expect(publicHidden.textContent).not.toContain('Oculto');
  });

  describe('upvoting', () => {
    let httpMock: HttpTestingController;

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
      httpMock.verify();
    });

    it('clicking the button bumps the shown count immediately and disables further clicks', async () => {
      const { fixture, el } = renderFixture(post({ id: 42, upvotes: 3 }));
      const button = el.querySelector<HTMLButtonElement>('.post-card__upvotes')!;

      button.click();
      fixture.detectChanges();

      // The count and the disabled state flip before the request resolves — the button doesn't
      // wait for the network (spec: "responds immediately rather than waiting for the next poll").
      expect(button.textContent).toContain('4');
      expect(button.disabled).toBe(true);

      const req = httpMock.expectOne('/api/posts/42/upvote');
      expect(req.request.method).toBe('POST');
      req.flush({ id: 42, upvotes: 4 });
      await settle(fixture);
    });

    it('a second click on an already-voted post fires no second request', async () => {
      const { fixture, el } = renderFixture(post({ id: 43, upvotes: 3 }));
      const button = el.querySelector<HTMLButtonElement>('.post-card__upvotes')!;

      button.click();
      fixture.detectChanges();
      httpMock.expectOne('/api/posts/43/upvote').flush({ id: 43, upvotes: 4 });
      await settle(fixture);

      button.click();
      fixture.detectChanges();
      httpMock.expectNone('/api/posts/43/upvote');
    });

    it('rolls back and re-enables the button if the request fails', async () => {
      const { fixture, el } = renderFixture(post({ id: 44, upvotes: 3 }));
      const button = el.querySelector<HTMLButtonElement>('.post-card__upvotes')!;

      button.click();
      fixture.detectChanges();
      expect(button.disabled).toBe(true);

      httpMock.expectOne('/api/posts/44/upvote').error(new ProgressEvent('error'));
      await settle(fixture);

      expect(button.disabled).toBe(false);
      expect(button.textContent).toContain('3');
    });

    it('a post already upvoted by this browser renders disabled on first render (survives reload)', () => {
      // markUpvoted persists to the same store a fresh page load reads from — this is what
      // "survives reload" means for a component that only ever reads that store on init.
      markUpvoted(45);

      const { el } = renderFixture(post({ id: 45, upvotes: 5 }));
      const button = el.querySelector<HTMLButtonElement>('.post-card__upvotes')!;

      expect(button.disabled).toBe(true);
    });
  });

  describe('tv mode', () => {
    it('toggles the large-type class only when tv is true', async () => {
      const fixture = TestBed.createComponent(PostCardComponent);
      fixture.componentRef.setInput('post', post());
      fixture.componentRef.setInput('tv', true);
      await fixture.whenStable();
      expect((fixture.nativeElement as HTMLElement).querySelector('.post-card--tv')).not.toBeNull();
    });

    it('renders the upvote count as plain text, not a button, on tv', async () => {
      const fixture = TestBed.createComponent(PostCardComponent);
      fixture.componentRef.setInput('post', post({ upvotes: 9 }));
      fixture.componentRef.setInput('tv', true);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('button.post-card__upvotes')).toBeNull();
      const upvotes = el.querySelector('.post-card__upvotes')!;
      expect(upvotes.tagName).toBe('SPAN');
      expect(upvotes.textContent).toContain('9');
    });

    it('still renders a clickable button when tv is false (default)', async () => {
      const el = await render(post());
      expect(el.querySelector('button.post-card__upvotes')).not.toBeNull();
    });
  });

  describe('answer timestamp', () => {
    // Fixed "now" so the same-day/earlier-day boundary is deterministic rather than depending
    // on when the test suite happens to run. Mocks Date.now() only (not vi.useFakeTimers, which
    // also stubs setTimeout — and TestBed's whenStable() relies on real timers to resolve).
    const NOW = new Date('2026-09-19T14:32:00');

    beforeEach(() => {
      vi.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('shows a relative time for an answer under 1h old', async () => {
      const answeredAt = NOW.getTime() - 45 * 60_000;
      const el = await render(post({ answerText: 'Sim.', answerUpdatedAt: answeredAt }));

      const label = el.querySelector('.post-card__answer-label')!.textContent!;
      expect(label).toContain('há 45 minutos');
    });

    it('shows HH:mm for an answer over 1h old on the same day', async () => {
      const answeredAt = new Date('2026-09-19T10:05:00').getTime();
      const el = await render(post({ answerText: 'Sim.', answerUpdatedAt: answeredAt }));

      const expectedTime = new Intl.DateTimeFormat('pt-PT', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(answeredAt));
      const label = el.querySelector('.post-card__answer-label')!.textContent!;
      expect(label).toContain(expectedTime);
    });

    it('shows the date and time for an answer from an earlier day', async () => {
      const answeredAt = new Date('2026-09-17T14:32:00').getTime();
      const el = await render(post({ answerText: 'Sim.', answerUpdatedAt: answeredAt }));

      const expectedDate = new Intl.DateTimeFormat('pt-PT', {
        day: 'numeric',
        month: 'short',
      }).format(new Date(answeredAt));
      const expectedTime = new Intl.DateTimeFormat('pt-PT', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(answeredAt));
      const label = el.querySelector('.post-card__answer-label')!.textContent!;
      expect(label).toContain(expectedDate);
      expect(label).toContain(expectedTime);
    });
  });
});
