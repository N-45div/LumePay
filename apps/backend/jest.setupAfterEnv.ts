import '@testing-library/jest-dom';

// Increase timeout for all tests
jest.setTimeout(30000);

beforeAll(() => {
    // Clear all mocks and timers before tests
    jest.clearAllMocks();
    jest.clearAllTimers();
});

afterEach(() => {
    // Clear all mocks and timers after each test
    jest.clearAllMocks();
    jest.clearAllTimers();
});

afterAll(async () => {
    // Cleanup after all tests
    jest.clearAllMocks();
    jest.clearAllTimers();
    
    // Allow any pending operations to complete
    await new Promise(resolve => setTimeout(resolve, 500));
});