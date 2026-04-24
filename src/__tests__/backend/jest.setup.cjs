process.env.S3_BUCKET_NAME = 'test-bucket';
process.env.KMS_KEY_ID = 'alias/test-kms';
process.env.BOOKMARKS_FILE_NAME = 'bookmarks.json';
process.env.KEY_FILE_NAME = 'key.bin'; // remove later once fully off V1

global.chrome = {
  runtime: {
    getURL: (p) => `chrome-extension://test/${p}`,
    lastError: undefined,
    sendMessage: jest.fn((msg, cb) => cb && cb()),
  },
  tabs: {
    query: jest.fn((opts, cb) => cb?.([{ url: 'https://example.com', title: 'Mock Tab Title' }])),
    create: jest.fn((opts, cb) => cb && cb({ id: 1, ...opts })),
    reload: jest.fn(),
  },
  extension: { getViews: jest.fn(() => []) },
  storage: { local: { set: jest.fn() } },
};