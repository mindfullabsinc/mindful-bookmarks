import '@testing-library/jest-dom';

let consoleErrorSpy: jest.SpyInstance;

beforeAll(() => {
  // ----- Console + polyfills -----
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  class ResizeObserver implements globalThis.ResizeObserver {
    constructor(public callback: ResizeObserverCallback) {}
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  global.ResizeObserver = global.ResizeObserver || ResizeObserver;

  global.requestAnimationFrame ||
    ((cb: FrameRequestCallback) => setTimeout(cb, 0));
  
  /**
   * Minimal IntersectionObserver mock so framer-motion's whileInView works in jsdom.
   */
  (window as any).IntersectionObserver = jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));
});

afterAll(() => {
  consoleErrorSpy?.mockRestore();
});
