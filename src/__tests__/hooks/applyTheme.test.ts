import {
  applyTheme,
  loadInitialTheme,
  persistAndApplyTheme,
} from "@/hooks/applyTheme";
import { ThemeChoice, THEME_STORAGE_KEY } from "@/core/constants/theme";

describe("theme utilities", () => {
  let matchMediaMock: jest.Mock;

  beforeEach(() => {
    // Reset DOM
    document.documentElement.className = "";
    document.body.className = "";
    document.documentElement.style.colorScheme = "";

    // Mock chrome.storage
    global.chrome = {
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn().mockResolvedValue(undefined),
        },
      },
    } as any;

    // Mock matchMedia
    matchMediaMock = jest.fn().mockReturnValue({
      matches: false,
      addListener: jest.fn(),
      removeListener: jest.fn(),
    });

    (window as any).matchMedia = matchMediaMock;
  });

  describe("applyTheme", () => {
    test("applies dark theme when choice = DARK", () => {
      applyTheme(ThemeChoice.DARK);

      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(document.body.classList.contains("dark")).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe("dark");
    });

    test("removes dark theme when choice = LIGHT", () => {
      // Pre-seed dark class so we can verify removal
      document.documentElement.classList.add("dark");
      document.body.classList.add("dark");

      applyTheme(ThemeChoice.LIGHT);

      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(document.body.classList.contains("dark")).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe("light");
    });

    test("applies dark when choice = SYSTEM and system prefers dark", () => {
      matchMediaMock.mockReturnValueOnce({ matches: true });

      applyTheme(ThemeChoice.SYSTEM);

      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(document.body.classList.contains("dark")).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe("dark");
    });

    test("applies light when choice = SYSTEM and system prefers light", () => {
      matchMediaMock.mockReturnValueOnce({ matches: false });

      applyTheme(ThemeChoice.SYSTEM);

      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(document.body.classList.contains("dark")).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe("light");
    });
  });

  describe("loadInitialTheme", () => {
    test("returns saved theme when valid", async () => {
      chrome.storage.local.get = jest
        .fn()
        .mockResolvedValue({ [THEME_STORAGE_KEY]: ThemeChoice.DARK });

      const result = await loadInitialTheme();

      expect(result).toBe(ThemeChoice.DARK);
    });

    test("returns SYSTEM when key missing", async () => {
      chrome.storage.local.get = jest.fn().mockResolvedValue({});

      const result = await loadInitialTheme();

      expect(result).toBe(ThemeChoice.SYSTEM);
    });

    test("returns SYSTEM when storage throws", async () => {
      chrome.storage.local.get = jest.fn().mockRejectedValue(new Error("boom"));

      const result = await loadInitialTheme();

      expect(result).toBe(ThemeChoice.SYSTEM);
    });
  });

  describe("persistAndApplyTheme", () => {
    test("applies theme immediately and persists", async () => {
      const applySpy = jest.spyOn(document.documentElement.classList, "add");

      await persistAndApplyTheme(ThemeChoice.DARK);

      // applied
      expect(applySpy).toHaveBeenCalledWith("dark");

      // persisted
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [THEME_STORAGE_KEY]: ThemeChoice.DARK,
      });
    });

    test("swallows storage errors but still applies", async () => {
      chrome.storage.local.set = jest
        .fn()
        .mockRejectedValue(new Error("boom"));

      await persistAndApplyTheme(ThemeChoice.LIGHT);

      expect(document.documentElement.style.colorScheme).toBe("light");
    });
  });
});
