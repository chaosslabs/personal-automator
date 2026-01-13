// Test setup file for vitest
import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';
import type { ElectronAPI } from '../src/main/preload';

// Mock window.electronAPI for renderer tests
const mockElectronAPI: ElectronAPI = {
  templates: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  tasks: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    toggle: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue({}),
  },
  executions: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
  },
  credentials: {
    list: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  system: {
    getStatus: vi.fn().mockResolvedValue({}),
    getAppVersion: vi.fn().mockResolvedValue('0.1.0'),
    getPlatform: vi.fn().mockReturnValue('linux'),
  },
  on: vi.fn().mockReturnValue(() => {}),
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
