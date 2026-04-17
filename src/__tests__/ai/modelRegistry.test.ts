import { SUPPORTED_MODELS } from '../../scripts/ai/modelRegistry';

describe('modelRegistry', () => {
  it('should export a non-empty array of models', () => {
    expect(Array.isArray(SUPPORTED_MODELS)).toBe(true);
    expect(SUPPORTED_MODELS.length).toBeGreaterThan(0);
  });

  it('should have required metadata properties on all models', () => {
    SUPPORTED_MODELS.forEach((model) => {
      expect(model).toHaveProperty('id');
      expect(typeof model.id).toBe('string');
      
      expect(model).toHaveProperty('friendlyName');
      expect(typeof model.friendlyName).toBe('string');
      
      expect(model).toHaveProperty('estimatedSize');
      expect(typeof model.estimatedSize).toBe('string');
    });
  });
});
