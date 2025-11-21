import { defineFunction } from "@aws-amplify/backend";

/**
 * Lambda function that processes waitlist signups and sends SES notifications.
 */
export const emailWaitlist = defineFunction({
  name: "emailWaitlistFunc",
  entry: "./handler.ts",
  environment: {
    // Where to send notifications
    DESTINATION_EMAIL: "team@mindfulbookmarks.com",
    SOURCE_EMAIL: "team@mindfulbookmarks.com", // must be verified in SES
    SES_REGION: "us-west-1", 
  },
});
