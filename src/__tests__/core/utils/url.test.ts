/**
 * @file url.test.ts
 * Tests for utils in "@/core/utils/url".
 *
 * Covers:
 *  - constructValidURL
 *  - normalizeUrl
 */

import {
  constructValidURL,
  normalizeUrl,
} from '@/core/utils/url';

describe('constructValidURL', () => {
  it('prepends http:// when protocol is missing', () => {
    expect(constructValidURL('example.com')).toBe('http://example.com');
  });

  it('leaves http and https URLs unchanged', () => {
    expect(constructValidURL('http://foo.com')).toBe('http://foo.com');
    expect(constructValidURL('https://bar.org')).toBe('https://bar.org');
  });
});

describe('normalizeUrl', () => {
  it('normalizes case, strips default ports, removes hash, collapses slashes, sorts query', () => {
    const input = 'HTTPS://Example.com:443//foo///bar/?b=2&a=1#frag';
    const out = normalizeUrl(input);
    expect(out).toBe('https://example.com/foo/bar?a=1&b=2');
  });

  it('keeps non-default ports', () => {
    const input = 'http://EXAMPLE.com:8080/path/';
    const out = normalizeUrl(input);
    expect(out).toBe('http://example.com:8080/path');
  });

  it('returns trimmed input if URL parsing fails', () => {
    const input = '   not a url   ';
    expect(normalizeUrl(input)).toBe('not a url');
  });

  it('removes trailing slash from path except root', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
    expect(normalizeUrl('https://example.com/foo/')).toBe('https://example.com/foo');
  });
});