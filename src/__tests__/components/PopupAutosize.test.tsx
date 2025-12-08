import React from "react";
import { render, fireEvent } from "@testing-library/react";
import PopupAutosize from "@/components/PopupAutosize"; 

describe("PopupAutosize", () => {
  let target: HTMLElement;
  let height: number;

  // We'll store the latest ResizeObserver instance + callback here
  let roInstance: { observe: jest.Mock; disconnect: jest.Mock } | null = null;
  let roCallback: ResizeObserverCallback | null = null;

  beforeAll(() => {
    // Mock ResizeObserver in a very explicit way
    (global as any).ResizeObserver = jest.fn(
      (cb: ResizeObserverCallback): ResizeObserver => {
        roCallback = cb;
        roInstance = {
          observe: jest.fn(),
          disconnect: jest.fn(),
        };
        return roInstance as unknown as ResizeObserver;
      }
    );

    jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
  });

  beforeEach(() => {
    document.documentElement.style.height = "";
    document.documentElement.style.maxHeight = "";
    document.body.style.height = "";
    document.body.style.maxHeight = "";
    document.body.style.overflow = "";
    document.body.style.willChange = "";

    // Create the popup root element
    document.body.innerHTML = `<div class="popup-root"></div>`;
    target = document.querySelector(".popup-root") as HTMLElement;

    // Drive height via a closure so tests can change it
    height = 300;
    target.getBoundingClientRect = jest.fn(
      () =>
        ({
          width: 0,
          height,
          top: 0,
          left: 0,
          bottom: height,
          right: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect)
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    roInstance = null;
    roCallback = null;
  });

  afterAll(() => {
    jest.restoreAllMocks();
    delete (global as any).ResizeObserver;
  });

  it("applies initial height based on the popup element and clamps to maxH", () => {
    render(<PopupAutosize maxH={250} minH={0} />);

    // Initial height is 300 but maxH is 250, so it should clamp
    expect(document.documentElement.style.height).toBe("250px");
    expect(document.documentElement.style.maxHeight).toBe("250px");
    expect(document.body.style.height).toBe("250px");
    expect(document.body.style.maxHeight).toBe("250px");
    expect(document.body.style.overflow).toBe("hidden");
    // final state after apply() should be auto
    expect(document.body.style.willChange).toBe("auto");
  });

  it("updates height when ResizeObserver fires and cleans up on unmount", () => {
    const { unmount } = render(<PopupAutosize maxH={600} minH={0} />);

    // Make sure our mock got created
    expect(roInstance).not.toBeNull();
    expect(roCallback).not.toBeNull();

    // Initial height: 300
    expect(document.documentElement.style.height).toBe("300px");

    // Change the element height and trigger observer callback
    height = 450;
    // simulate ResizeObserver callback
    roCallback!([], roInstance as unknown as ResizeObserver);

    // requestAnimationFrame is mocked to run immediately, so we should see updated height
    expect(document.documentElement.style.height).toBe("450px");
    expect(document.documentElement.style.maxHeight).toBe("450px");
    expect(document.body.style.height).toBe("450px");

    // Unmount should disconnect the observer
    unmount();
    expect(roInstance!.disconnect).toHaveBeenCalledTimes(1);
  });

  it("re-measures on click of an .amplify-tabs__item inside the popup", () => {
    jest.useFakeTimers();

    render(<PopupAutosize maxH={600} minH={0} />);

    // Initial height: 300
    expect(document.documentElement.style.height).toBe("300px");

    // Add an Amplify tab element inside the popup
    const tab = document.createElement("button");
    tab.className = "amplify-tabs__item";
    target.appendChild(tab);

    // Change height to simulate new content and click the tab
    height = 500;
    fireEvent.click(tab);

    // Click handler uses setTimeout(apply, 0)
    jest.runAllTimers();

    expect(document.documentElement.style.height).toBe("500px");
    expect(document.documentElement.style.maxHeight).toBe("500px");
    expect(document.body.style.height).toBe("500px");

    jest.useRealTimers();
  });

  it("does nothing when the selector does not match any element", () => {
    document.body.innerHTML = ""; // remove popup-root

    render(<PopupAutosize selector=".does-not-exist" />);

    expect(document.documentElement.style.height).toBe("");
    expect(document.body.style.height).toBe("");
  });
});