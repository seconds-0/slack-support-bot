// Set up any global test setup here
process.env.NODE_ENV = 'test';

// Silence console logs during tests
// Comment out any of these if you want to see the output during tests
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  // Keep error and warn enabled for debugging test failures
  // error: jest.fn(),
  // warn: jest.fn(),
};
