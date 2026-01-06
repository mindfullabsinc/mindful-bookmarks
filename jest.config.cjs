// CommonJS config works even with "type": "module" in package.json
module.exports = {
  projects: [
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      setupFiles: [
        '<rootDir>/src/__tests__/setupEnv.js',
        '<rootDir>/src/__tests__/setupChrome.js',
      ],
      setupFilesAfterEnv: ['<rootDir>/src/__tests__/setupTests.ts'],
      moduleNameMapper: {
        '^@/env$': '<rootDir>/src/__tests__/mocks/env.mock.ts',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '^@/(.*)$': '<rootDir>/src/$1',
        "^@shared/(.*)$": "<rootDir>/shared/$1",
        '^~/(.*)$': '<rootDir>/$1',
        '\\.(png|jpg|jpeg|gif|svg)$': '<rootDir>/src/__tests__/mocks/fileMock.js',
      },
      transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
        '^.+\\.[jt]sx?$': 'babel-jest'
      },
      moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json'],
      testMatch: ['<rootDir>/src/**/*.test.[jt]s?(x)'],
      // 👇 Prevent frontend project from running backend integration tests
      testPathIgnorePatterns: ['<rootDir>/src/__tests__/backend/'],
      clearMocks: true,
    },

    {
      displayName: 'backend',
      testEnvironment: 'node',
      setupFiles: ['<rootDir>/src/__tests__/backend/jest.setup.cjs'],
      moduleNameMapper: {
        '^\\$amplify/env/.*$': '<rootDir>/src/__tests__/mocks/amplify-env.cjs',
        '^@/(.*)$': '<rootDir>/src/$1',
        "^@shared/(.*)$": "<rootDir>/shared/$1",
        '^~/(.*)$': '<rootDir>/$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
      },
      transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
        '^.+\\.[jt]sx?$': 'babel-jest'
      },
      // Transpile ESM deps used by the backend tests
      transformIgnorePatterns: ['/node_modules/(?!(aws-sdk-client-mock|sinon)/)'],
      moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'json'],
      testMatch: [
        '<rootDir>/src/__tests__/backend/**/*.int.test.[jt]s?(x)',
        '<rootDir>/src/__tests__/backend/**/*.test.[jt]s?(x)',
      ],
      clearMocks: true,
    },
  ],
};
