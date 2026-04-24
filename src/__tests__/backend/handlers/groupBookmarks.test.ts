export {};

// Must be hoisted before handler import so the module-level `new OpenAI()` gets the mock.
jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    responses: {
      create: jest.fn().mockResolvedValue({
        output_text: JSON.stringify({
          groups: [
            {
              id: "grp-1",
              name: "Technology",
              description: "Tech sites",
              purpose: "personal",
              itemIds: ["item-1", "item-2", "item-3", "item-4"],
            },
          ],
        }),
      }),
    },
  })),
}));

import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { handler } from "../../../../amplify/functions/groupBookmarks/handler";

const dynamoMock = mockClient(DynamoDBClient);

// ── Event builders ────────────────────────────────────────────────────────────

const makeEvent = (body: unknown, ip = "1.2.3.4") => ({
  httpMethod: "POST",
  body: JSON.stringify(body),
  isBase64Encoded: false,
  headers: { origin: "http://localhost:5173" },
  requestContext: { http: { sourceIp: ip, method: "POST" } },
});

// 2-item batch: handler short-circuits before calling OpenAI (≤3 items), so
// these tests exercise only the rate-limit path, not the LLM path.
const smallBatch = (ip = "1.2.3.4") =>
  makeEvent(
    {
      items: [
        { id: "item-1", title: "Example", url: "https://example.com" },
        { id: "item-2", title: "Test", url: "https://test.com" },
      ],
      purposes: ["personal"],
    },
    ip
  );

// 4-item batch: reaches the OpenAI call (mocked above).
const largeBatch = (ip = "1.2.3.4") =>
  makeEvent(
    {
      items: [
        { id: "item-1", title: "GitHub", url: "https://github.com" },
        { id: "item-2", title: "MDN", url: "https://developer.mozilla.org" },
        { id: "item-3", title: "Stack Overflow", url: "https://stackoverflow.com" },
        { id: "item-4", title: "TypeScript", url: "https://typescriptlang.org" },
      ],
      purposes: ["personal"],
    },
    ip
  );

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Set up DynamoDB mock to report `count` calls for the current window. */
const mockCount = (count: number) =>
  dynamoMock
    .on(UpdateItemCommand)
    .resolves({ Attributes: { n: { N: String(count) } } });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("groupBookmarks handler", () => {
  beforeEach(() => {
    dynamoMock.reset();
  });

  // ── Rate limiting ────────────────────────────────────────────────────────────

  describe("rate limiting", () => {
    test("allows requests when count is 1 (well under limit)", async () => {
      mockCount(1);
      const res = await handler(smallBatch());
      expect(res.statusCode).toBe(200);
    });

    test("allows requests when count equals RATE_LIMIT_MAX (boundary: check is >10, not >=10)", async () => {
      mockCount(10);
      const res = await handler(smallBatch());
      expect(res.statusCode).toBe(200);
    });

    test("blocks the request when count exceeds RATE_LIMIT_MAX", async () => {
      mockCount(11);
      const res = await handler(smallBatch());
      expect(res.statusCode).toBe(429);
      expect(JSON.parse(res.body).message).toMatch(/rate limit/i);
    });

    test("different IPs are rate-limited independently", async () => {
      // First call (IP A) is over limit; second call (IP B) is its first request.
      dynamoMock
        .on(UpdateItemCommand)
        .resolvesOnce({ Attributes: { n: { N: "11" } } })
        .resolvesOnce({ Attributes: { n: { N: "1" } } });

      const resA = await handler(smallBatch("10.0.0.1"));
      const resB = await handler(smallBatch("10.0.0.2"));

      expect(resA.statusCode).toBe(429);
      expect(resB.statusCode).toBe(200);
    });

    test("rate-limit key encodes the caller IP", async () => {
      mockCount(1);
      await handler(smallBatch("192.168.1.100"));

      const calls = dynamoMock.commandCalls(UpdateItemCommand);
      const pk = (calls[0] as any).args[0].input.Key?.pk?.S as string;
      expect(pk).toContain("192.168.1.100");
    });

    test("rate-limit key changes when the time window rolls over", async () => {
      jest.useFakeTimers();
      const RATE_WINDOW_SEC = 600;
      mockCount(1);

      jest.setSystemTime(new Date(0));
      await handler(smallBatch());

      // Advance into the next window.
      jest.setSystemTime(new Date((RATE_WINDOW_SEC + 1) * 1000));
      await handler(smallBatch());

      const calls = dynamoMock.commandCalls(UpdateItemCommand);
      const pk0 = (calls[0] as any).args[0].input.Key?.pk?.S as string;
      const pk1 = (calls[1] as any).args[0].input.Key?.pk?.S as string;

      expect(pk0).not.toBe(pk1);

      jest.useRealTimers();
    });

    test("rate-limit TTL is set to the end of the current window", async () => {
      jest.useFakeTimers();
      const RATE_WINDOW_SEC = 600;
      jest.setSystemTime(new Date(300_000)); // t = 300 s (middle of window 0)
      mockCount(1);

      await handler(smallBatch());

      const calls = dynamoMock.commandCalls(UpdateItemCommand);
      const input = (calls[0] as any).args[0].input;
      const ttl = Number(input.ExpressionAttributeValues?.[":exp"]?.N);

      // Window 0 ends at 600 s.
      expect(ttl).toBe(RATE_WINDOW_SEC);

      jest.useRealTimers();
    });

    test("OPTIONS preflight is returned before the rate-limit check (DynamoDB not called)", async () => {
      const res = await handler({
        httpMethod: "OPTIONS",
        headers: { origin: "http://localhost:5173" },
        requestContext: { http: { sourceIp: "1.2.3.4", method: "OPTIONS" } },
      });

      expect(res.statusCode).toBe(204);
      expect(dynamoMock.commandCalls(UpdateItemCommand)).toHaveLength(0);
    });
  });

  // ── Input validation ─────────────────────────────────────────────────────────

  describe("input validation", () => {
    beforeEach(() => mockCount(1));

    test("returns 400 when body is absent", async () => {
      const res = await handler({
        httpMethod: "POST",
        headers: { origin: "http://localhost:5173" },
        requestContext: { http: { sourceIp: "1.2.3.4", method: "POST" } },
      });
      expect(res.statusCode).toBe(400);
    });

    test("returns 400 when items[] is missing from the body", async () => {
      const res = await handler(
        makeEvent({ purposes: ["personal"] })
      );
      expect(res.statusCode).toBe(400);
    });

    test("returns 400 when purposes[] is missing from the body", async () => {
      const res = await handler(
        makeEvent({ items: [{ id: "1", url: "https://example.com" }] })
      );
      expect(res.statusCode).toBe(400);
    });

    test("returns 400 when purposes[] is present but contains no valid values", async () => {
      const res = await handler(
        makeEvent({
          items: [{ id: "1", url: "https://example.com" }],
          purposes: ["unknown-purpose"],
        })
      );
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Normal operation ─────────────────────────────────────────────────────────

  describe("normal operation", () => {
    beforeEach(() => mockCount(1));

    test("returns 200 with grouped results for a small import (≤3 items, no OpenAI call)", async () => {
      const res = await handler(smallBatch());
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.groups)).toBe(true);
      expect(body.groups.length).toBeGreaterThan(0);
      // All submitted items must appear somewhere in the groups
      const coveredIds = body.groups.flatMap((g: any) => g.items.map((i: any) => i.id));
      expect(coveredIds).toContain("item-1");
      expect(coveredIds).toContain("item-2");
    });

    test("returns 200 with grouped results for a larger import (calls mocked OpenAI)", async () => {
      const res = await handler(largeBatch());
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.groups)).toBe(true);
    });
  });
});
