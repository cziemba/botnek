/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  extensionsToTreatAsEsm: ['.ts'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};