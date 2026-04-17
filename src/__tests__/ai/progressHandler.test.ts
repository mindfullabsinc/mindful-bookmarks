import { parseProgressMessage } from '../../scripts/ai/progressHandler';

describe('progressHandler', () => {
  it('should parse standard progress correctly', () => {
    const result = parseProgressMessage('Downloading...', 0.5);
    expect(result.text).toBe('Downloading...');
    expect(result.progress).toBe(0.5);
  });

  it('should clamp progress below 0 to 0', () => {
    const result = parseProgressMessage('Starting...', -0.2);
    expect(result.progress).toBe(0);
  });

  it('should clamp progress above 1 to 1', () => {
    const result = parseProgressMessage('Done', 1.5);
    expect(result.progress).toBe(1);
  });
});
