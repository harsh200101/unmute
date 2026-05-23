'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  globalSetup: '<rootDir>/tests/_globalSetup.js',
  globalTeardown: '<rootDir>/tests/_globalTeardown.js',
  testTimeout: 15_000,
  // Ensure serial DB state across tests by running in-band (also done via --runInBand)
  maxWorkers: 1,
  verbose: true,
};
