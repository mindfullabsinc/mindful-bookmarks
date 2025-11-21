import { KMSClient, GenerateDataKeyCommand } from "@aws-sdk/client-kms";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { createCipheriv, randomBytes } from "crypto";

import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Agent as HttpsAgent } from "https";

// Shared helpers
import { withCorsAndErrors } from "../_shared/safe";
import { resp, getUserIdFromEvent } from "../_shared/http";
import { evalCors } from "../_shared/cors"; // for CorsPack type only
import { unauthorized, badRequest, serverError } from "../_shared/errors";

// --- Keep-alive setup (module scope so it's reused across invocations) ---
const httpsAgent = new HttpsAgent({
  keepAlive: true,
  maxSockets: 50,          // tune as needed
  keepAliveMsecs: 30_000,  // optional
});
const requestHandler = new NodeHttpHandler({ httpsAgent });

// Reuse clients across warm invokes + keep-alive enabled
const kmsClient = new KMSClient({ requestHandler });
const s3Client  = new S3Client({ requestHandler });

type CorsPack = ReturnType<typeof evalCors>;

const saveBookmarksCore = async (
  event: APIGatewayProxyEvent,
  cors: CorsPack
): Promise<APIGatewayProxyResult> => {
  // Auth
  const userId = getUserIdFromEvent(event);
  if (!userId) throw unauthorized("Unauthorized: Missing authentication details");

  // Body
  if (!event.body) throw badRequest("Bad Request: Missing request body");

  // Support base64-encoded bodies just in case
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  let bookmarksToSave: unknown;
  try {
    bookmarksToSave = JSON.parse(rawBody);
  } catch {
    throw badRequest("Bad Request: Body must be valid JSON");
  }

  // Env
  const bucket   = process.env.S3_BUCKET_NAME;
  const kmsKeyId = process.env.KMS_KEY_ID;
  if (!bucket || !kmsKeyId) {
    throw serverError("Server misconfiguration: missing S3_BUCKET_NAME or KMS_KEY_ID");
  }

  // 1) KMS: data key (AES-256) bound to userId via EncryptionContext
  const { Plaintext, CiphertextBlob } = await kmsClient.send(
    new GenerateDataKeyCommand({
      KeyId: kmsKeyId,
      KeySpec: "AES_256",
      EncryptionContext: { userId },
    })
  );
  if (!Plaintext || !CiphertextBlob) {
    throw serverError("Failed to generate encryption key");
  }

  // 2) Encrypt payload with AES-256-GCM (+AAD=userId)
  const key = Buffer.from(Plaintext as Uint8Array); // 32 bytes
  if (key.length !== 32) throw serverError("BadKeyLength", { expected: 32, actual: key.length });

  const iv  = randomBytes(12);                       // 12-byte GCM nonce
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const aad = Buffer.from(userId, "utf8"); // bind ciphertext to user
  cipher.setAAD(aad);

  const plaintext = Buffer.from(JSON.stringify(bookmarksToSave), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  // 3) V2 envelope includes wrapped key used for this ciphertext
  const payloadV2 = {
    version: 2 as const,
    algo: "AES-256-GCM",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: ciphertext.toString("base64"),
    encKey: Buffer.from(CiphertextBlob as Uint8Array).toString("base64"),
    aad: aad.toString("base64"),
  };

  const dataKey = `private/${userId}/${process.env.BOOKMARKS_FILE_NAME}`;

  // Single atomic write for readers
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: dataKey,
      Body: JSON.stringify(payloadV2),
      ContentType: "application/json",
    })
  );

  // 4) Optional legacy dual-write for V1 readers (non-fatal)
  if (process.env.KEY_FILE_NAME) {
    const legacyKeyPath = `private/${userId}/${process.env.KEY_FILE_NAME}`;
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: legacyKeyPath,
          Body: Buffer.from(CiphertextBlob as Uint8Array),
          ContentType: "application/octet-stream",
        })
      );
    } catch (e) {
      // Keep non-fatal to avoid breaking V2—wrapper will still return 200 for the main write
      console.warn("Legacy key write failed (non-fatal):", e);
    }
  }

  return resp(cors, 200, { message: "Bookmarks saved successfully" });
};

// Exported entrypoint — wrapper handles CORS, OPTIONS, and error shaping (HttpError or generic)
export const handler = withCorsAndErrors(saveBookmarksCore);
