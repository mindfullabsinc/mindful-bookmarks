import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import SmartFavicon, { __test__resetSmartFaviconCaches } from '@/components/SmartFavicon';

beforeEach(() => {
  __test__resetSmartFaviconCaches();
});
afterEach(() => {
  __test__resetSmartFaviconCaches();
});

// Utility to build the candidate URLs exactly like the component
const candidatesFor = (host: string, size: number) => ([
  `https://icons.duckduckgo.com/ip3/${host}.ico`,
  `https://www.google.com/s2/favicons?sz=${String(size)}&domain=${host}`,
  `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=https://${host}&size=${String(size)}`,
  `https://${host}/favicon.ico`,
]);

// --- Canvas mocking ---
// We’ll stub <canvas> and its 2d context so SmartFavicon’s analyze() can run deterministically.
const makeCanvasMock = (opts: { colorfulRatio: number }) => {
  const n = 16;
  const totalPixels = n * n; // 256
  const colorfulCount = Math.max(0, Math.min(totalPixels, Math.round(totalPixels * opts.colorfulRatio)));
  const arr = new Uint8ClampedArray(totalPixels * 4);

  // Fill some pixels as colorful (saturated-ish) and opaque; rest grayish
  let written = 0;
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    if (written < colorfulCount) {
      // bright red-ish (saturated)
      arr[idx] = 200; arr[idx + 1] = 30; arr[idx + 2] = 30; arr[idx + 3] = 255;
      written++;
    } else {
      // gray
      arr[idx] = 120; arr[idx + 1] = 120; arr[idx + 2] = 120; arr[idx + 3] = 255;
    }
  }

  const getContext = jest.fn().mockReturnValue({
    drawImage: jest.fn(),
    getImageData: jest.fn().mockReturnValue({ data: arr }),
  });

  const canvas = {
    width: 0,
    height: 0,
    getContext,
  } as unknown as HTMLCanvasElement;

  return { canvas, getContext };
};

describe('SmartFavicon', () => {
  // We’ll swap in a canvas mock per-test to control mono/color analysis.
  let originalCreateElement: typeof document.createElement;

  beforeAll(() => {
    originalCreateElement = document.createElement.bind(document);
  });

  afterEach(() => {
    cleanup();
    jest.resetModules(); // important to reset in-module caches between tests
  });

  afterAll(() => {
    // restore any global patches
    (document.createElement as any) = originalCreateElement;
  });

  test('returns null when url is undefined', () => {
    const { container } = render(<SmartFavicon size={20} />);
    expect(container.firstChild).toBeNull();
  });

  test('progresses through candidates on error and then shows letter fallback after exhausting all', async () => {
    // Colorfulness doesn’t matter for this test; set any.
    const { canvas } = makeCanvasMock({ colorfulRatio: 0.5 });
    (document.createElement as any) = (tag: string) => {
      if (tag === 'canvas') return canvas;
      return originalCreateElement(tag);
    };

    const host = 'example.com';
    const size = 20;
    const candidates = candidatesFor(host, size);

    render(<SmartFavicon url={`https://${host}`} size={size} />);

    // 1st candidate (DuckDuckGo)
    let img = screen.getByRole('presentation') as HTMLImageElement;
    expect(img).toHaveAttribute('src', candidates[0]);

    // Trigger error -> move to 2nd
    fireEvent.error(img);
    await waitFor(() => {
      img = screen.getByRole('presentation') as HTMLImageElement;
      expect(img).toHaveAttribute('src', candidates[1]);
    });

    // Trigger error -> move to 3rd
    fireEvent.error(img);
    await waitFor(() => {
      img = screen.getByRole('presentation') as HTMLImageElement;
      expect(img).toHaveAttribute('src', candidates[2]);
    });

    // Trigger error -> move to 4th
    fireEvent.error(img);
    await waitFor(() => {
      img = screen.getByRole('presentation') as HTMLImageElement;
      expect(img).toHaveAttribute('src', candidates[3]);
    });

    // Trigger error -> no more candidates -> letter fallback
    fireEvent.error(img);
    await waitFor(() => {
      // Now it renders the letter fallback <span> (not an <img/>)
      const letter = screen.getByText('E'); // example.com => "E"
      expect(letter.tagName.toLowerCase()).toBe('span');
      expect(letter).toHaveAttribute('aria-hidden', 'true');
    });
  });

  test('caches a successful source and reuses it on re-render', async () => {
    // Make canvas valid; color ratio not important here
    const { canvas } = makeCanvasMock({ colorfulRatio: 0.5 });
    (document.createElement as any) = (tag: string) => {
      if (tag === 'canvas') return canvas;
      return originalCreateElement(tag);
    };

    const host = 'example.com';
    const size = 20;
    const candidates = candidatesFor(host, size);

    const { rerender } = render(<SmartFavicon url={`https://${host}`} size={size} />);

    // First render: start on candidate[0]
    let img = screen.getByRole('presentation') as HTMLImageElement;
    expect(img).toHaveAttribute('src', candidates[0]);

    // Simulate first failing, second succeeding:
    fireEvent.error(img); // move to candidate[1]
    await waitFor(() => {
      img = screen.getByRole('presentation') as HTMLImageElement;
      expect(img).toHaveAttribute('src', candidates[1]);
    });

    // Fire load at candidate[1] -> should cache and analyze
    fireEvent.load(img);

    // Re-render same component/props -> should stick to pinned source (candidate[1]) immediately
    rerender(<SmartFavicon url={`https://${host}`} size={size} />);
    img = screen.getByRole('presentation') as HTMLImageElement;
    expect(img).toHaveAttribute('src', candidates[1]);
  });

  test('renders letter fallback immediately if host is previously marked bad (by exhausting candidates)', async () => {
    // First, exhaust candidates to mark as bad
    const { canvas } = makeCanvasMock({ colorfulRatio: 0.5 });
    (document.createElement as any) = (tag: string) => {
      if (tag === 'canvas') return canvas;
      return originalCreateElement(tag);
    };

    const host = 'badhost.test';
    const size = 20;
    const candidates = candidatesFor(host, size);

    const { unmount } = render(<SmartFavicon url={`https://${host}`} size={size} />);
    let img = screen.getByRole('presentation') as HTMLImageElement;

    // Cause 4 errors -> triggers bad cache set + inline letter fallback
    for (let i = 0; i < candidates.length; i++) {
      fireEvent.error(img);
      if (i < candidates.length - 1) {
        // wait for next candidate
        // eslint-disable-next-line no-loop-func
        await waitFor(() => {
          img = screen.getByRole('presentation') as HTMLImageElement;
          expect(img).toHaveAttribute('src', candidates[i + 1] ?? candidates[i]); // shifts forward
        });
      }
    }
    // Last error -> letter fallback rendered
    fireEvent.error(img);
    await waitFor(() => {
      expect(screen.getByText('B')).toBeInTheDocument(); // "badhost.test" -> "B"
    });

    unmount();

    // Re-render fresh instance for same host -> should short-circuit to letter due to bad cache
    const { container } = render(<SmartFavicon url={`https://${host}`} size={size} />);
    // Because the module is cached, the bad cache remains. It should render <span> directly.
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});
