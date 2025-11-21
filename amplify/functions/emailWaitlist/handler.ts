// amplify/functions/emailWaitlist/handler.ts

import type {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
} from "aws-lambda";

import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";

import type { Schema } from "../../data/resource";

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

// Shared helpers (same as saveBookmarks)
import { withCorsAndErrors } from "../_shared/safe";
import { evalCors } from "../_shared/cors"; // for CorsPack type only
import { badRequest, serverError } from "../_shared/errors";
import { resp } from "../_shared/http";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type CorsPack = ReturnType<typeof evalCors>;

// ---- Configure Amplify Data client for this Lambda ----
const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(process.env as any);

Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

// ---- SES client ----
const sesClient = new SESv2Client({
  region: process.env.SES_REGION || "us-west-2",
});

const emailWaitlistCore = async (
  event: APIGatewayProxyEvent,
  cors: CorsPack
): Promise<APIGatewayProxyResult> => {
  console.log("emailWaitlist invoked");

  // 1) Body presence + parse
  if (!event.body) {
    return resp(cors, 400, {
      error: "Missing body",
      stage: "parse",
    });
  }

  let payload: any;
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    payload = JSON.parse(rawBody);
  } catch {
    return resp(cors, 400, {
      error: "Body must be valid JSON",
      stage: "parse",
    });
  }

  const { email, tier = "Mindful Pro", source = "pricing_page" } = payload;
  const trimmedEmail = (email || "").trim().toLowerCase();

  if (!EMAIL_REGEX.test(trimmedEmail)) {
    return resp(cors, 400, {
      error: "Invalid email address",
      stage: "validation",
    });
  }

  const createdAt = new Date().toISOString();

  // 2) Store in Data
  try {
    const { errors } = await client.models.WaitlistEntry.create({
      email: trimmedEmail,
      tier,
      createdAt,
      source,
    });

    if (errors && errors.length > 0) {
      console.error("WaitlistEntry.create errors:", errors);
      return resp(cors, 500, {
        error: "Failed to store waitlist entry",
        stage: "data",
        details: errors.map((e) => e.message ?? String(e)),
      });
    }
  } catch (err: any) {
    console.error("Data client threw:", err);
    return resp(cors, 500, {
      error: "Exception while storing waitlist entry",
      stage: "data-exception",
      message: err?.message ?? String(err),
    });
  }

  // 3) Send SES email notification
  const destinationEmail = process.env.DESTINATION_EMAIL;
  const sourceEmail = process.env.SOURCE_EMAIL;

  if (!destinationEmail || !sourceEmail) {
    return resp(cors, 500, {
      error: "Missing DESTINATION_EMAIL or SOURCE_EMAIL",
      stage: "env",
    });
  }

  try {
    await sesClient.send(
      new SendEmailCommand({
        FromEmailAddress: sourceEmail,
        Destination: { ToAddresses: [destinationEmail] },
        Content: {
          Simple: {
            Subject: { Data: "New Mindful Pro waitlist signup" },
            Body: {
              Text: {
                Data: `New waitlist signup:

Email: ${trimmedEmail}
Tier: ${tier}
Source: ${source}
Time: ${createdAt}
`,
              },
            },
          },
        },
      })
    );
  } catch (err: any) {
    console.error("SES send error:", err);
    return resp(cors, 500, {
      error: "Failed to send notification email",
      stage: "ses",
      message: err?.message ?? String(err),
    });
  }

  // 4) Success
  return resp(cors, 200, { success: true });
};

// Exported entrypoint — wrapper still handles OPTIONS & generic error shaping,
// but most errors now return structured JSON from within emailWaitlistCore.
export const handler = withCorsAndErrors(emailWaitlistCore);