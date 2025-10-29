// test/handlers.integration.test.ts
export {}; // ensure module scope (prevents accidental global augmentation)

/* -------------------- Imports -------------------- */
import { randomBytes, createCipheriv } from "crypto";
import { mockClient } from "aws-sdk-client-mock";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type PutObjectCommandInput,
  type GetObjectCommandInput,
  type DeleteObjectCommandInput,
} from "@aws-sdk/client-s3";
import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
} from "@aws-sdk/client-kms";
import type { StreamingBlobPayloadOutputTypes } from "@smithy/types";
import { handler as save } from "../../../../amplify/functions/saveBookmarks/handler";
import { handler as load } from "../../../../amplify/functions/loadBookmarks/handler";
import { handler as del } from "../../../../amplify/functions/deleteBookmarks/handler";
/* ---------------------------------------------------------- */

// Ensure ReadableStream exists (Node 18+ has it; for older, use the web shim)
const RS: typeof ReadableStream =
  (globalThis as any).ReadableStream ?? require("stream/web").ReadableStream;

const encoder = new TextEncoder();

const s3Mock = mockClient(S3Client);
const kmsMock = mockClient(KMSClient);

/** Shape compatible with the runtime stream returned by AWS SDK v3 in Node. */
type MockBody = {
  transformToString(): Promise<string>;
  transformToByteArray(): Promise<Uint8Array>;
};

function bodyFromString(s: string): StreamingBlobPayloadOutputTypes {
  const rs = new RS<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(s));
      controller.close();
    },
  });
  // Smithy mixin methods used by AWS SDK helpers
  (rs as any).transformToString = async () => s;
  (rs as any).transformToByteArray = async () => encoder.encode(s);
  return rs as unknown as StreamingBlobPayloadOutputTypes;
}

function bodyFromBytes(b: Uint8Array): StreamingBlobPayloadOutputTypes {
  const rs = new RS<Uint8Array>({
    start(controller) {
      controller.enqueue(b);
      controller.close();
    },
  });
  (rs as any).transformToString = async () => Buffer.from(b).toString("utf8");
  (rs as any).transformToByteArray = async () => b;
  return rs as unknown as StreamingBlobPayloadOutputTypes;
}

/** Helper: coerce aws-sdk-client-mock call objects to typed inputs */
function getPutCalls() {
  // aws-sdk-client-mock doesn't type `.commandCalls` strongly; cast to any then to the shape we need
  return s3Mock.commandCalls(PutObjectCommand) as unknown as Array<{
    args: [{ input: PutObjectCommandInput }];
  }>;
}
function getDeleteCalls() {
  return s3Mock.commandCalls(DeleteObjectCommand) as unknown as Array<{
    args: [{ input: DeleteObjectCommandInput }];
  }>;
}

const authEvent = (
  method: "GET" | "POST" | "DELETE",
  body?: unknown
): any => ({
  httpMethod: method,
  body: body ? JSON.stringify(body) : null,
  headers: { origin: "http://localhost:5173" },
  requestContext: { authorizer: { jwt: { claims: { sub: "user-123" } } } },
});

describe("Bookmarks handlers", () => {
  const FIXED_NOW = 1_700_000_000_000; // deterministic Date.now()
  const FIXED_RAND = 0.123456; // deterministic Math.random()

  let insertGroups: jest.Mock;
  let errorSpy: jest.SpyInstance;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  beforeEach(() => {
    // Deterministic IDs and timestamps inside the importers
    jest.setSystemTime(new Date(FIXED_NOW));
    jest.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
    jest.spyOn(Math, "random").mockReturnValue(FIXED_RAND);

    insertGroups = jest.fn().mockResolvedValue(undefined);

    // Keep a spy reference we can restore with correct typing
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    // Fresh chrome mock each test; cast to any so we don't need the full Chrome surface
    (globalThis as any).chrome = {
      bookmarks: { getTree: jest.fn() },
      permissions: { contains: jest.fn(), request: jest.fn() },
      tabs: { query: jest.fn() },
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    errorSpy.mockRestore();
    delete (globalThis as any).chrome;
    s3Mock.reset();
    kmsMock.reset();
  });

  test("saveBookmarks writes V2 payload with encKey + legacy key", async () => {
    // Arrange: mock KMS + let S3 PutObject succeed
    const dataKey = randomBytes(32);
    const wrapped = randomBytes(96); // mock KMS CiphertextBlob bytes

    kmsMock.on(GenerateDataKeyCommand).resolves({
      Plaintext: dataKey,
      CiphertextBlob: wrapped,
    });

    // Let all PutObject calls resolve; we'll inspect them afterward
    s3Mock.on(PutObjectCommand).resolves({ $metadata: {} as any });

    // Act
    const res = await save(authEvent("POST", [{ id: 1, name: "Foo" }]));

    // Assert status
    expect(res.statusCode).toBe(200);

    // Inspect what was written to S3
    const puts = getPutCalls();

    // Build a quick lookup: key -> body
    const byKey: Record<string, any> = Object.fromEntries(
      puts.map((call) => {
        const input = call.args[0].input;
        return [String(input.Key), input.Body as any];
      })
    );

    // 1) V2 payload written to BOOKMARKS_FILE_NAME
    const payloadKey = `private/user-123/${process.env.BOOKMARKS_FILE_NAME!}`;
    expect(byKey[payloadKey]).toBeDefined();

    const payloadStr = String(byKey[payloadKey]);
    const payload = JSON.parse(payloadStr);

    expect(payload.version).toBe(2);
    expect(payload.algo).toBe("AES-256-GCM");
    expect(typeof payload.iv).toBe("string");
    expect(typeof payload.tag).toBe("string");
    expect(typeof payload.data).toBe("string");
    expect(typeof payload.encKey).toBe("string"); // embedded wrapped key present
    // aad is optional; if you're saving it, you can assert it's present:
    // expect(typeof payload.aad).toBe("string");

    // 2) Legacy key file also written (for backward compatibility)
    const legacyKey = `private/user-123/${process.env.KEY_FILE_NAME!}`;
    expect(byKey[legacyKey]).toBeDefined();
    expect(Buffer.isBuffer(byKey[legacyKey])).toBe(true);
  });

  test("loadBookmarks decrypts V2 and returns bookmarks", async () => {
    // Prepare a real V2 payload using the same flow as save
    const dataKey = randomBytes(32);
    const wrapped = randomBytes(96);
    kmsMock.on(DecryptCommand).resolves({ Plaintext: dataKey });

    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
    const aad = Buffer.from("user-123", "utf8");
    cipher.setAAD(aad);
    const pt = Buffer.from(JSON.stringify([{ id: 1, name: "Foo" }]), "utf8");
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();

    const payloadV2 = JSON.stringify({
      version: 2,
      algo: "AES-256-GCM",
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      data: ct.toString("base64"),
      encKey: Buffer.from(wrapped).toString("base64"),
      aad: aad.toString("base64"),
    });

    s3Mock.on(GetObjectCommand).resolves({ Body: bodyFromString(payloadV2) });

    const r = await load(authEvent("GET"));
    expect(r.statusCode).toBe(200);
    const body = JSON.parse(r.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].name).toBe("Foo");
  });

  test("loadBookmarks returns 422 on tag mismatch (client should keep cache)", async () => {
    // Wrong tag on purpose
    kmsMock.on(DecryptCommand).resolves({ Plaintext: randomBytes(32) });
    const badPayload = JSON.stringify({
      version: 2,
      algo: "AES-256-GCM",
      iv: randomBytes(12).toString("base64"),
      tag: randomBytes(16).toString("base64"),
      data: randomBytes(32).toString("base64"),
      encKey: randomBytes(64).toString("base64"),
    });
    s3Mock.on(GetObjectCommand).resolves({ Body: bodyFromString(badPayload) });

    const r = await load(authEvent("GET"));
    expect(r.statusCode).toBe(422);
    expect(JSON.parse(r.body).details.code).toBe("AuthTagMismatch");
  });

  test("deleteBookmarks returns 204 and issues S3 deletes", async () => {
    // Arrange: allow S3 deletes to succeed
    s3Mock.reset();
    s3Mock.on(DeleteObjectCommand).resolves({ $metadata: {} as any });

    // Act
    const res = await del(authEvent("DELETE"));

    // Assert: status (your handler currently returns 204; allow 200 if you later switch to JSON)
    expect([204, 200]).toContain(res.statusCode);

    // Inspect what was deleted
    const calls = getDeleteCalls();
    const deletedKeys = calls.map((c) => String(c.args[0].input.Key));

    // Main payload must be deleted
    expect(deletedKeys).toContain(
      `private/user-123/${process.env.BOOKMARKS_FILE_NAME!}`
    );

    // Legacy key file is optional (only if KEY_FILE_NAME is set)
    if (process.env.KEY_FILE_NAME) {
      expect(deletedKeys).toContain(
        `private/user-123/${process.env.KEY_FILE_NAME}`
      );
    }
  });
});
