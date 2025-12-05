import { defineBackend } from '@aws-amplify/backend';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as kms from 'aws-cdk-lib/aws-kms';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as lambda from 'aws-cdk-lib/aws-lambda';

import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';

/* Imported lambdas */
import { saveBookmarks } from "./functions/saveBookmarks/resource";
import { loadBookmarks } from "./functions/loadBookmarks/resource";
import { deleteBookmarks } from "./functions/deleteBookmarks/resource";
import { emailWaitlist } from "./functions/emailWaitlist/resource";
import { groupBookmarks } from "./functions/groupBookmarks/resource";

/**
 * Root Amplify backend definition with auth, storage, functions, and data resources.
 */
export const backend = defineBackend({
  auth,
  data,
  storage,
  saveBookmarks,
  loadBookmarks,
  deleteBookmarks,
  emailWaitlist,           
  groupBookmarks,
});

// ---------- Synthesized resources ----------
const stack = backend.storage.resources.bucket.stack;
const authenticatedUserRole = backend.auth.resources.authenticatedUserIamRole;
const s3Bucket = backend.storage.resources.bucket;

const saveBookmarksFn = backend.saveBookmarks.resources.lambda as lambda.Function;
const loadBookmarksFn = backend.loadBookmarks.resources.lambda as lambda.Function;
const deleteBookmarksFn = backend.deleteBookmarks.resources.lambda as lambda.Function;
const emailWaitlistFn = backend.emailWaitlist.resources.lambda as lambda.Function; 
const groupBookmarksFn = backend.groupBookmarks.resources.lambda as lambda.Function; 

// ---------- KMS key (ID or ARN both work for GenerateDataKey) ----------
const kmsKeyId = 'arn:aws:kms:us-west-1:534861782220:key/51a54516-e016-4d00-a6da-7aff429418ed';
const kmsKey = kms.Key.fromKeyArn(stack, 'BookmarksKmsKey', kmsKeyId);

// Grant only what each function needs
kmsKey.grant(saveBookmarksFn, 'kms:GenerateDataKey');
kmsKey.grant(loadBookmarksFn, 'kms:Decrypt');

// ---------- Lambda env ----------
for (const fn of [saveBookmarksFn, loadBookmarksFn, deleteBookmarksFn]) {
  fn.addEnvironment('S3_BUCKET_NAME', s3Bucket.bucketName);
}
saveBookmarksFn.addEnvironment('KMS_KEY_ID', kmsKeyId);
loadBookmarksFn.addEnvironment('KMS_KEY_ID', kmsKeyId);

// ---------- S3 access for authenticated users ----------
const authenticatedUserPrincipal = new iam.ArnPrincipal(authenticatedUserRole.roleArn);

s3Bucket.addToResourcePolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  principals: [authenticatedUserPrincipal],
  actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
  resources: [`${s3Bucket.bucketArn}/private/\${cognito-identity.amazonaws.com:sub}/*`],
}));

s3Bucket.addToResourcePolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  principals: [authenticatedUserPrincipal],
  actions: ['s3:ListBucket'],
  resources: [s3Bucket.bucketArn],
  conditions: {
    StringLike: { 's3:prefix': [`private/\${cognito-identity.amazonaws.com:sub}/*`] },
  },
}));

// ---------- HTTP API + authorizer ----------
const authorizer = new HttpUserPoolAuthorizer(
  'userPoolAuthorizer',
  backend.auth.resources.userPool,
  { userPoolClients: [backend.auth.resources.userPoolClient] }
);

const api = new apigwv2.HttpApi(stack, 'MyHttpApi', {
  apiName: 'bookmarksApi',
  corsPreflight: {
    allowOrigins: ['*'], // tighten for prod
    allowMethods: [
      apigwv2.CorsHttpMethod.OPTIONS,
      apigwv2.CorsHttpMethod.GET,
      apigwv2.CorsHttpMethod.POST,
      apigwv2.CorsHttpMethod.DELETE,
    ],
    allowHeaders: ['Content-Type', 'Authorization'],
  },
});

// explicit authorizer per-route (safer than relying on defaultAuthorizer)
api.addRoutes({
  path: '/bookmarks',
  methods: [apigwv2.HttpMethod.POST],
  integration: new HttpLambdaIntegration('saveBookmarksIntegration', saveBookmarksFn), 
  authorizer,
});

api.addRoutes({
  path: '/bookmarks',
  methods: [apigwv2.HttpMethod.GET],
  integration: new HttpLambdaIntegration('loadBookmarksIntegration', loadBookmarksFn), 
  authorizer,
});

api.addRoutes({
  path: '/bookmarks',
  methods: [apigwv2.HttpMethod.DELETE],
  integration: new HttpLambdaIntegration('deleteBookmarksIntegration', deleteBookmarksFn),
  authorizer,
});

api.addRoutes({
  path: '/waitlist',
  methods: [apigwv2.HttpMethod.POST],
  integration: new HttpLambdaIntegration('emailWaitlistIntegration', emailWaitlistFn),
  // No authorizer -> public endpoint (safe because handler does its own validation & is write-only)
});

api.addRoutes({
  path: '/groupBookmarks',
  methods: [apigwv2.HttpMethod.POST],
  integration: new HttpLambdaIntegration('groupBookmarksIntegration', groupBookmarksFn),
  // No authorizer: public endpoint, safe because it only writes to OpenAI and returns JSON
});

// ---------- Lambda IAM for S3 + KMS ----------
saveBookmarksFn.addToRolePolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['s3:GetObject','s3:PutObject','s3:DeleteObject'],
  resources: [`${s3Bucket.bucketArn}/*`],
}));

loadBookmarksFn.addToRolePolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['s3:GetObject','s3:PutObject','s3:DeleteObject'],
  resources: [`${s3Bucket.bucketArn}/*`],
}));

deleteBookmarksFn.addToRolePolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['s3:GetObject','s3:PutObject','s3:DeleteObject'],
  resources: [`${s3Bucket.bucketArn}/*`],
}));

// SES permissions for the waitlist lambda 
emailWaitlistFn.addToRolePolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['ses:SendEmail', 'ses:SendRawEmail'],
  resources: ['*'],
}));

// ---------- Export the API endpoint to amplify_outputs.json ----------
backend.addOutput({
  custom: {
    API: {
      bookmarks: {
        apiName: 'bookmarksApi',
        type: 'httpApi',
        endpoint: api.apiEndpoint,
      },
      // Convenience entry for waitlist usage
      waitlist: {
        apiName: 'bookmarksApi',
        type: 'httpApi',
        endpoint: api.apiEndpoint,
        path: '/waitlist',
      },
    },
  },
});
