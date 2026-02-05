import { sanitizeUrlForAI, truncateForAI } from "@/scripts/import/sanitizeUrlForAI";

describe("sanitizeUrlForAI", () => {
  it("removes known tracking query parameters", () => {
    const input =
      "https://example.com/page?utm_source=google&utm_medium=email&foo=bar&gclid=123";
    const result = sanitizeUrlForAI(input);

    expect(result).toBe("https://example.com/page?foo=bar");
  });

  it("removes tracking parameters regardless of case", () => {
    const input =
      "https://example.com/?UTM_Source=google&FbClid=abc123&foo=bar";
    const result = sanitizeUrlForAI(input);

    expect(result).toBe("https://example.com/?foo=bar");
  });

  it("removes tracking parameters with prefixes like vero_", () => {
    const input =
      "https://example.com/?vero_id=123&vero_conv=abc&keep=this";
    const result = sanitizeUrlForAI(input);

    expect(result).toBe("https://example.com/?keep=this");
  });

  it("preserves non-tracking query parameters", () => {
    const input = "https://example.com/?foo=1&bar=2";
    const result = sanitizeUrlForAI(input);

    expect(result).toBe("https://example.com/?foo=1&bar=2");
  });

  it("removes URL fragments (hash)", () => {
    const input = "https://example.com/page?foo=bar#section-2";
    const result = sanitizeUrlForAI(input);

    expect(result).toBe("https://example.com/page?foo=bar");
  });

  it("handles URLs with only tracking parameters", () => {
    const input =
      "https://example.com/?utm_campaign=test&gclid=123";
    const result = sanitizeUrlForAI(input);

    expect(result).toBe("https://example.com/");
  });

  it("returns the original string if URL parsing fails", () => {
    const input = "not a valid url";
    const result = sanitizeUrlForAI(input);

    expect(result).toBe(input);
  });
});

describe("truncateForAI", () => {
  it("returns the original string if shorter than maxLen", () => {
    const input = "hello";
    const result = truncateForAI(input, 10);

    expect(result).toBe("hello");
  });

  it("truncates the string if longer than maxLen", () => {
    const input = "hello world";
    const result = truncateForAI(input, 5);

    expect(result).toBe("hello");
  });

  it("returns the input unchanged if length equals maxLen", () => {
    const input = "hello";
    const result = truncateForAI(input, 5);

    expect(result).toBe("hello");
  });

  it("returns empty string as-is", () => {
    const result = truncateForAI("", 10);
    expect(result).toBe("");
  });

  it("returns undefined/null as-is", () => {
    expect(truncateForAI(undefined as unknown as string, 10)).toBe(
      undefined
    );
    expect(truncateForAI(null as unknown as string, 10)).toBe(null);
  });
});