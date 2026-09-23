import { z } from 'zod';

// Zod compiles fast parsers with `new Function`, which the Content Security Policy
// forbids (no 'unsafe-eval'). Jitless mode avoids the attempt and the console
// CSP violation it would cause.
z.config({ jitless: true });
