module.exports = {
  plugins: ['import'],
  rules: {
    'import/no-cycle': ['error', { maxDepth: 2 }],
    'import/no-self-import': 'error',
  },
  settings: {
    'import/resolver': { typescript: {} },
  },
};
