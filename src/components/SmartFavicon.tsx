/* -------------------- Imports -------------------- */
import React, { useState, useMemo, useCallback } from 'react';
import clsx from "clsx";
import type { CSSProperties } from 'react';
/* ---------------------------------------------------------- */

/* -------------------- Class-level variables -------------------- */
// Simple in-memory caches (per page load)
const goodSourceCache = new Map<string, string>(); // hostname -> working favicon URL
const badSourceCache = new Map<string, true>();  // hostname -> true (no icon found)
/* ---------------------------------------------------------- */

/* -------------------- Class-level helper functions -------------------- */
function circleColorFor(host: string) {
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 60% 45%)`;
}

function toHostname(raw: string) {
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}
/* ---------------------------------------------------------- */

/**
 * Provide a deterministic single-letter circle avatar fallback when favicons cannot be fetched.
 *
 * @param {{ host: string; size: number; className?: string }} props Visual configuration for the fallback.
 */
function DomainLetter({ host, size, className }: { host: string; size: number; className?: string }) {
  const letter = host.replace(/^www\./, '')[0]?.toUpperCase() ?? '?';
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: circleColorFor(host),
    color: 'white',
    fontSize: Math.max(10, Math.round(size * 0.6)),
    lineHeight: `${size}px`,
    textAlign: 'center',
    fontWeight: 700,
    display: 'inline-block',
  };
  return (
    <span className={className} aria-hidden="true" style={style}>
      {letter}
    </span>
  );
}

/**
 * Fault-tolerant favicon loader that tries multiple providers, memoizes successes, and falls back to a letter avatar.
 *
 * @param {{ url: string; size?: number; className?: string; fallback?: 'letter' | 'blank' }} props Rendering options.
 * @returns {JSX.Element | null}
 */
export default function SmartFavicon({ url, size = 20, className, fallback = 'letter' }: {
  url?: string;
  size?: number;
  className?: string;
  fallback?: 'letter' | 'blank';
}) {
  const host = useMemo(() => toHostname(url), [url]);
  const [idx, setIdx] = useState(0);
  const [mono, setMono] = useState<boolean | null>(null);

  const analyze = useCallback((img: HTMLImageElement) => {
    try {
      const cvs = document.createElement("canvas");
      const n = 16; // tiny downscale
      cvs.width = n; cvs.height = n;
      const ctx = cvs.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, n, n);
      const { data } = ctx.getImageData(0, 0, n, n);

      let colorful = 0, total = 0;
      for (let i = 0; i < data.length; i += 4) {
        const [r,g,b,a] = [data[i],data[i+1],data[i+2],data[i+3]];
        if (a < 32) continue; // ignore transparent
        total++;
        // saturation-ish check + not gray
        const max = Math.max(r,g,b), min = Math.min(r,g,b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const grayish = Math.abs(r-g) < 10 && Math.abs(g-b) < 10;
        if (sat > 0.2 && !grayish) colorful++;
      }
      // if fewer than 8% pixels are colorful, treat as monochrome
      setMono(colorful / Math.max(total,1) < 0.08);
    } catch {
      // CORS-tainted canvas or error: fall back to "color" (safer)
      setMono(false);
    }
  }, []);

  const candidates = useMemo(() => {
    if (!host) return [];
    const s = String(size);
    return [
      // Order chosen for reliability + low false-404 rate
      `https://icons.duckduckgo.com/ip3/${host}.ico`,
      `https://www.google.com/s2/favicons?sz=${s}&domain=${host}`,
      `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=https://${host}&size=${s}`,
      `https://${host}/favicon.ico`,
    ];
  }, [host, size]);

  // If we already know a good source, pin to it to avoid repeat probes (and their 404 logs)
  const pinned = host ? goodSourceCache.get(host) : undefined;
    const src = pinned ?? candidates[idx];

  if (!host) return null;

  if (badSourceCache.has(host) && !pinned) {
    return fallback === 'letter' ? (
      <DomainLetter host={host} size={size} className={className} />
    ) : null;
  }

  if (!src) {
    badSourceCache.set(host, true);
    return fallback === 'letter' ? (
      <DomainLetter host={host} size={size} className={className} />
    ) : null;
  }

  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""                
      className={clsx("favicon", mono === true ? "mono" : "color", className)}
      crossOrigin="anonymous" // needed or canvas may be tainted 
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      style={{ objectFit: 'contain', borderRadius: 4, display: 'inline-block' }}
      onLoad={(e) => {
        if (host) {
          goodSourceCache.set(host, src);
          badSourceCache.delete(host);
        }
        analyze(e.currentTarget);
      }}
      onError={() => setIdx(i => i + 1)}
    />
  );
}