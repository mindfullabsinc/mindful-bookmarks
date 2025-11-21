import { detectBrowser, type BrowserName } from "@/core/utils/detectBrowser";

function mockUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

function mockBrave(isBrave: boolean) {
  Object.defineProperty(window.navigator, "brave", {
    value: isBrave ? {} : undefined,
    configurable: true,
  });
}

describe("detectBrowser", () => {
  afterEach(() => {
    // Reset mocks
    mockUserAgent("");
    mockBrave(false);
  });

  it("returns 'unknown' when navigator is undefined", () => {
    const originalNavigator = global.navigator;

    // @ts-expect-error override for test
    delete global.navigator;

    expect(detectBrowser()).toBe("unknown");

    // Restore
    (global as any).navigator = originalNavigator;
  });

  it("detects Brave via navigator.brave", () => {
    mockUserAgent("Mozilla/5.0 (X11; Linux x86_64) Chrome/120");
    mockBrave(true);

    expect(detectBrowser()).toBe("brave");
  });

  it("detects Edge", () => {
    mockUserAgent("Mozilla/5.0 (Windows NT 10.0) Edg/120.0");
    expect(detectBrowser()).toBe("edge");
  });

  it("detects Firefox", () => {
    mockUserAgent("Mozilla/5.0 Firefox/118.0");
    expect(detectBrowser()).toBe("firefox");
  });

  it("detects Safari (but not Chrome)", () => {
    mockUserAgent("Mozilla/5.0 Safari/605.1.15");
    expect(detectBrowser()).toBe("safari");
  });

  it("detects Chrome", () => {
    mockUserAgent("Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36");
    expect(detectBrowser()).toBe("chrome");
  });

  it("returns unknown if nothing matches", () => {
    mockUserAgent("weirdbrowser 1.0");
    expect(detectBrowser()).toBe("unknown");
  });
});
