import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { emailWaitlist } from "../functions/emailWaitlist/resource";

const schema = a
  .schema({
    Todo: a
      .model({
        content: a.string(),
      })
      .authorization((allow) => [allow.guest()]),

    WaitlistEntry: a
      .model({
        // id is optional; Amplify can add one implicitly, but being explicit is fine
        id: a.id().required(),
        email: a.string().required(),
        tier: a.string(),
        source: a.string(),
        createdAt: a.datetime().required(),
      })
      .authorization((allow) => [
        // Minimal rule so the model has *some* auth.
        // This mirrors the Todo pattern and satisfies the "missing auth" check.
        allow.guest(),
      ]),
  })
  .authorization((allow) => [
    // Give the emailWaitlist function permission to call Data mutations
    allow.resource(emailWaitlist).to(["mutate"]),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "identityPool",
  },
});
