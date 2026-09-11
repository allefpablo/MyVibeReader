import { describe, it, expect } from 'vitest';
import tauriConfig from '../../src-tauri/tauri.conf.json';

describe('Tauri Application Security Configuration', () => {
  it('enforces a strict Content Security Policy (CSP) and disallows null or wildcard csp', () => {
    const security = (tauriConfig as any).app?.security;
    expect(security).toBeDefined();
    expect(security.csp).not.toBeNull();
    expect(typeof security.csp).toBe('string');
    expect(security.csp.length).toBeGreaterThan(0);

    const csp = security.csp as string;

    // Must restrict default-src
    expect(csp).toMatch(/default-src\s+[^;]*'self'/);

    // Must restrict object-src to 'none' to block plugin/object exploits
    expect(csp).toMatch(/object-src\s+[^;]*'none'/);

    // Must restrict base-uri
    expect(csp).toMatch(/base-uri\s+[^;]*'self'/);

    // Must restrict frame-ancestors to prevent clickjacking/framing
    expect(csp).toMatch(/frame-ancestors\s+[^;]*'none'/);

    // Must restrict script-src (no unsafe-inline or wildcards)
    expect(csp).toMatch(/script-src\s+[^;]*'self'/);
  });
});
