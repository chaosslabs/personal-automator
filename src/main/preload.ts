import { contextBridge, ipcRenderer } from 'electron';

// Type definitions for the exposed API
export interface ElectronAPI {
  // Template operations
  templates: {
    list: () => Promise<unknown[]>;
    get: (id: string) => Promise<unknown>;
    create: (template: unknown) => Promise<unknown>;
    update: (id: string, template: unknown) => Promise<unknown>;
    delete: (id: string) => Promise<void>;
  };
  // Task operations
  tasks: {
    list: () => Promise<unknown[]>;
    get: (id: number) => Promise<unknown>;
    create: (task: unknown) => Promise<unknown>;
    update: (id: number, task: unknown) => Promise<unknown>;
    delete: (id: number) => Promise<void>;
    toggle: (id: number, enabled: boolean) => Promise<void>;
    execute: (id: number) => Promise<unknown>;
  };
  // Execution operations
  executions: {
    list: (filters?: unknown) => Promise<unknown[]>;
    get: (id: number) => Promise<unknown>;
  };
  // Credential operations
  credentials: {
    list: () => Promise<unknown[]>;
    add: (credential: unknown) => Promise<unknown>;
    delete: (id: number) => Promise<void>;
  };
  // System
  system: {
    getStatus: () => Promise<unknown>;
    getAppVersion: () => Promise<string>;
    getPlatform: () => string;
  };
  // Event subscriptions
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
}

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    get: (id: string) => ipcRenderer.invoke('templates:get', id),
    create: (template: unknown) => ipcRenderer.invoke('templates:create', template),
    update: (id: string, template: unknown) => ipcRenderer.invoke('templates:update', id, template),
    delete: (id: string) => ipcRenderer.invoke('templates:delete', id),
  },
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    get: (id: number) => ipcRenderer.invoke('tasks:get', id),
    create: (task: unknown) => ipcRenderer.invoke('tasks:create', task),
    update: (id: number, task: unknown) => ipcRenderer.invoke('tasks:update', id, task),
    delete: (id: number) => ipcRenderer.invoke('tasks:delete', id),
    toggle: (id: number, enabled: boolean) => ipcRenderer.invoke('tasks:toggle', id, enabled),
    execute: (id: number) => ipcRenderer.invoke('tasks:execute', id),
  },
  executions: {
    list: (filters?: unknown) => ipcRenderer.invoke('executions:list', filters),
    get: (id: number) => ipcRenderer.invoke('executions:get', id),
  },
  credentials: {
    list: () => ipcRenderer.invoke('credentials:list'),
    add: (credential: unknown) => ipcRenderer.invoke('credentials:add', credential),
    delete: (id: number) => ipcRenderer.invoke('credentials:delete', id),
  },
  system: {
    getStatus: () => ipcRenderer.invoke('system:status'),
    getAppVersion: () => ipcRenderer.invoke('system:version'),
    getPlatform: () => process.platform,
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Declare the global type for TypeScript
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
