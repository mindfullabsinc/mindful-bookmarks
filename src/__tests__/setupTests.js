import '@testing-library/jest-dom';

let consoleErrorSpy;

beforeAll(() => {
  // ----- Console + polyfills -----
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  class ResizeObserver {
    constructor(callback) { this._cb = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = global.ResizeObserver || ResizeObserver;

  global.requestAnimationFrame =
    global.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
  
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});
