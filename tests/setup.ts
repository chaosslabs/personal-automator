// Test setup file for vitest
import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';

// Mock fetch for API tests
const mockFetch = vi.fn();

Object.defineProperty(global, 'fetch', {
  value: mockFetch,
  writable: true,
});

// Default mock responses
beforeEach(() => {
  vi.clearAllMocks();

  // Default status response
  mockFetch.mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        status: 'ok',
        version: '0.1.0',
        uptime: 1000,
      }),
  });
});

// Helper to mock specific API responses
export function mockApiResponse<T>(data: T, ok = true): void {
  mockFetch.mockResolvedValueOnce({
    ok,
    json: () => Promise.resolve(data),
  });
}

export { mockFetch };
