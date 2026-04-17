import { checkWebGPUSupport } from '../../scripts/ai/webgpuDetector';

describe('webgpuDetector', () => {
  let originalNavigator: any;
  let originalWarn: any;

  beforeEach(() => {
    originalNavigator = global.navigator;
    originalWarn = console.warn;
    console.warn = jest.fn(); // Suppress intentional failure logs during tests
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
    });
    console.warn = originalWarn; // Restore normal warning behavior
  });

  it('should return false if navigator.gpu is undefined', async () => {
    Object.defineProperty(global, 'navigator', {
      value: { gpu: undefined },
      writable: true,
    });

    const result = await checkWebGPUSupport();
    expect(result).toBe(false);
  });

  it('should return false if requestAdapter throws an error', async () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        gpu: {
          requestAdapter: jest.fn().mockRejectedValue(new Error('GPU Not Allowed')),
        },
      },
      writable: true,
    });

    const result = await checkWebGPUSupport();
    expect(result).toBe(false);
  });

  it('should return false if requestAdapter returns null', async () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        gpu: {
          requestAdapter: jest.fn().mockResolvedValue(null),
        },
      },
      writable: true,
    });

    const result = await checkWebGPUSupport();
    expect(result).toBe(false);
  });

  it('should return true if requestAdapter returns an adapter', async () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        gpu: {
          requestAdapter: jest.fn().mockResolvedValue({ name: 'MockAdapter' }),
        },
      },
      writable: true,
    });

    const result = await checkWebGPUSupport();
    expect(result).toBe(true);
  });
});
