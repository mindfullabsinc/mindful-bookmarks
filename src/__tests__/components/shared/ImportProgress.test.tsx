import React from "react";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom";

import { ImportProgress, useSmoothedPhase } from "@/components/shared/ImportProgress";
import type { ImportPhase } from "@/core/types/importPhase";

/* ------------------------------------------------------------------ */
/* Test helpers */
/* ------------------------------------------------------------------ */

const PHASE_SEQUENCE = [
  "initializing",
  "importing",
  "categorizing",
  "done",
] as const satisfies readonly ImportPhase[];

type Phase = (typeof PHASE_SEQUENCE)[number];

const MIN_PHASE_DURATION_MS = 800;

function tickPhaseOnce() {
  act(() => {
    jest.advanceTimersByTime(MIN_PHASE_DURATION_MS);
  });
}

function tickToIndex(targetIndex: number) {
  // visualPhaseIndex starts at 0
  // it can advance at most +1 per tick
  for (let i = 0; i < targetIndex; i += 1) {
    tickPhaseOnce();
  }
}

function renderProgress(
  props?: Partial<React.ComponentProps<typeof ImportProgress>>
) {
  return render(
    <ImportProgress
      phaseSequence={PHASE_SEQUENCE}
      backendPhase="initializing"
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Hook tests: useSmoothedPhase */
/* ------------------------------------------------------------------ */

describe("useSmoothedPhase", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts at the first phase", () => {
    let result: ReturnType<typeof useSmoothedPhase> | null = null;

    function Test() {
      result = useSmoothedPhase(PHASE_SEQUENCE, "initializing");
      return null;
    }

    render(<Test />);

    expect(result!.visualPhase).toBe("initializing");
    expect(result!.visualPhaseIndex).toBe(0);
  });

  it("smoothly advances toward backendPhase with a delay", () => {
    let result: ReturnType<typeof useSmoothedPhase> | null = null;

    function Test({ backendPhase }: { backendPhase: Phase }) {
      result = useSmoothedPhase(PHASE_SEQUENCE, backendPhase);
      return null;
    }

    const { rerender } = render(<Test backendPhase="initializing" />);

    // Backend jumps ahead (index 2)
    rerender(<Test backendPhase="categorizing" />);

    // Not immediate
    expect(result!.visualPhase).toBe("initializing");

    tickPhaseOnce();
    expect(result!.visualPhase).toBe("importing");

    tickPhaseOnce();
    expect(result!.visualPhase).toBe("categorizing");
  });

  it("does not regress if backendPhase goes backwards", () => {
    let result: ReturnType<typeof useSmoothedPhase> | null = null;

    function Test({ backendPhase }: { backendPhase: Phase }) {
      result = useSmoothedPhase(PHASE_SEQUENCE, backendPhase);
      return null;
    }

    const { rerender } = render(<Test backendPhase="categorizing" />);

    // Step to organizing (index 2) *in increments*
    tickPhaseOnce();
    expect(result!.visualPhase).toBe("importing");

    tickPhaseOnce();
    expect(result!.visualPhase).toBe("categorizing");

    // Backend regresses
    rerender(<Test backendPhase="initializing" />);

    // Ensure no regression occurs
    tickPhaseOnce();
    expect(result!.visualPhase).toBe("categorizing");
  });
});

/* ------------------------------------------------------------------ */
/* Component tests: ImportProgress */
/* ------------------------------------------------------------------ */

describe("ImportProgress", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders idle state correctly", () => {
    renderProgress();

    expect(screen.getByText("Preparing your space ...")).toBeInTheDocument();
    expect(screen.getByText("This only takes a few seconds.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
  });

  it("shows loader icon while not done", () => {
    const { container } = renderProgress();
    expect(container.querySelector(".s_import-icon-loader")).toBeInTheDocument();
  });

  it("advances message as phases progress", () => {
    renderProgress({
      backendPhase: "importing",
      phaseMessages: {
        initializing: "Initializing ...",
        importing: "Importing your selections ...",
        categorizing: "Categorizing ...",
        done: "Done.",
      },
    });

    // backendPhase is "importing" (index 1), so after 1 tick visual reaches importing
    tickToIndex(1);

    expect(
      screen.getByText("Importing your selections ...")
    ).toBeInTheDocument();
  });

  it("renders done state correctly", () => {
    renderProgress({
      backendPhase: "done",
      backendMessage: "Finished successfully!",
      phaseMessages: {
        initializing: "Initializing ...",
        importing: "Importing your selections ...",
        categorizing: "Categorizing ...",
        done: "Done.",
      },
    });

    // done is index 3, step through all intermediate phases
    tickToIndex(3);

    expect(screen.getByText("You're all set!")).toBeInTheDocument();
    expect(screen.getByText("Finished successfully!")).toBeInTheDocument();
    expect(
      screen.queryByText("This only takes a few seconds.")
    ).not.toBeInTheDocument();
  });

  it("shows wand icon when done", () => {
    const { container } = renderProgress({ backendPhase: "done" });

    tickToIndex(3);

    expect(container.querySelector(".s_import-icon-wand")).toBeInTheDocument();
  });

  it("calls onVisualDoneChange when visual done is reached", () => {
    const onVisualDoneChange = jest.fn();

    renderProgress({
      backendPhase: "done",
      onVisualDoneChange,
    });

    // initial call (likely false) happens first render
    expect(onVisualDoneChange).toHaveBeenCalled();

    tickToIndex(3);

    // At least one call should be true once done is reached
    expect(onVisualDoneChange).toHaveBeenCalledWith(true);
  });

  it("applies progress bar width class as phases advance", () => {
    const { container, rerender } = renderProgress({
      backendPhase: "importing",
    });

    tickToIndex(1);

    let bar = container.querySelector(".s_import-progress-bar");
    expect(bar).toBeTruthy();
    expect(bar!.className).toMatch(/w-\d\/6|w-full/);

    rerender(
      <ImportProgress
        phaseSequence={PHASE_SEQUENCE}
        backendPhase="done"
      />
    );

    // step to done
    tickToIndex(3);

    // IMPORTANT: re-query after rerender / state updates
    bar = container.querySelector(".s_import-progress-bar");
    expect(bar).toBeTruthy();
    expect(bar!.className).toMatch(/w-full/);
  });
});