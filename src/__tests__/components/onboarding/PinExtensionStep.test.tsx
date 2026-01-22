import React from "react";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom";

import { PinExtensionStep } from "@/components/onboarding/PinExtensionStep";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

function removeChrome() {
  delete (global as any).chrome;
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/* ------------------------------------------------------------------ */
/* Test setup                                                          */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(window, "setInterval");
  jest.spyOn(window, "clearInterval");

  // default UA
  setUserAgent("Mozilla/5.0 Chrome/120.0.0.0");
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  removeChrome();
});

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("PinExtensionStep", () => {
  test("renders instructional steps", () => {
    render(<PinExtensionStep />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);

    // 1) "Click the ... icon near your address bar."
    expect(items[0]).toHaveTextContent(/Click the/i);
    expect(items[0]).toHaveTextContent(/Extensions/i);
    expect(items[0]).toHaveTextContent(/icon near your address bar/i);

    // 2) "Find Mindful in the list."
    expect(items[1]).toHaveTextContent(/Find/i);
    expect(items[1]).toHaveTextContent(/Mindful/i);
    expect(items[1]).toHaveTextContent(/in the list/i);

    // 3) "Click the Pin icon so it stays on your toolbar."
    expect(items[2]).toHaveTextContent(/Click the/i);
    expect(items[2]).toHaveTextContent(/Pin/i);
    expect(items[2]).toHaveTextContent(/stays on your toolbar/i);

    expect(
      screen.getByText(/If you don't see the Extensions icon/i)
    ).toBeInTheDocument();
  });

  test("does not show pinned success message when pin status is null (unsupported API shape)", async () => {
    (global as any).chrome = {
      action: {
        getUserSettings: jest.fn(async () => ({})), // no isOnToolbar boolean
      },
    };

    render(<PinExtensionStep />);

    await act(async () => {
      // allow initial run + at least one interval tick
      jest.advanceTimersByTime(1600);
    });

    expect(
      screen.queryByText(/Looks like Mindful is pinned/i)
    ).not.toBeInTheDocument();
  });

  test("shows success message when extension is pinned", async () => {
    (global as any).chrome = {
      action: {
        getUserSettings: jest.fn(async () => ({ isOnToolbar: true })),
      },
    };

    render(<PinExtensionStep />);

    await act(async () => {
      // allow initial run to resolve
      jest.advanceTimersByTime(1);
      // flush microtasks
      await Promise.resolve();
    });

    expect(
      screen.getByText(/Looks like Mindful is pinned/i)
    ).toBeInTheDocument();
  });

  test("polls repeatedly for pin state (false -> true)", async () => {
    const first = deferred<{ isOnToolbar: boolean }>();
    const second = deferred<{ isOnToolbar: boolean }>();

    const getUserSettings = jest
      .fn()
      // immediate run() will call once
      .mockReturnValueOnce(first.promise)
      // first interval tick will call again
      .mockReturnValueOnce(second.promise);

    (global as any).chrome = {
      action: { getUserSettings },
    };

    render(<PinExtensionStep />);

    // Resolve the FIRST call (from the immediate run on mount)
    await act(async () => {
      first.resolve({ isOnToolbar: false });
      await first.promise;
    });

    expect(
      screen.queryByText(/Looks like Mindful is pinned/i)
    ).not.toBeInTheDocument();

    // Advance time so the interval triggers the second call
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    // Resolve the SECOND call (from the interval tick)
    await act(async () => {
      second.resolve({ isOnToolbar: true });
      await second.promise;
    });

    expect(
      screen.getByText(/Looks like Mindful is pinned/i)
    ).toBeInTheDocument();

    expect(getUserSettings).toHaveBeenCalledTimes(2);
  });

  test("cleans up interval on unmount", () => {
    (global as any).chrome = {
      action: {
        getUserSettings: jest.fn(async () => ({ isOnToolbar: false })),
      },
    };

    const { unmount } = render(<PinExtensionStep />);
    unmount();

    expect(window.clearInterval).toHaveBeenCalled();
  });

  test("gracefully handles missing chrome.action API", async () => {
    removeChrome();

    render(<PinExtensionStep />);

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(
      screen.queryByText(/Looks like Mindful is pinned/i)
    ).not.toBeInTheDocument();
  });
});
