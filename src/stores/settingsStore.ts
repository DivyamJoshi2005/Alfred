/**
 * App settings state management.
 */

import { create } from 'zustand';
import type { SocialAccount } from '../types/schedule';
import { api } from '../services/api';

interface SettingsStore {
  accounts: SocialAccount[];
  backendConnected: boolean;
  loading: boolean;

  // Actions
  fetchAccounts: () => Promise<void>;
  connectAccount: (platform: string) => Promise<void>;
  disconnectAccount: (platform: string) => Promise<void>;
  setBackendConnected: (connected: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  accounts: [],
  backendConnected: false,
  loading: false,

  fetchAccounts: async () => {
    set({ loading: true });
    try {
      const accounts = await api.listAccounts();
      set({ accounts, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  connectAccount: async (platform: string) => {
    const account = await api.connectAccount(platform);
    set((state) => ({
      accounts: [
        ...state.accounts.filter((a) => a.platform !== platform),
        account,
      ],
    }));
  },

  disconnectAccount: async (platform: string) => {
    await api.disconnectAccount(platform);
    set((state) => ({
      accounts: state.accounts.filter((a) => a.platform !== platform),
    }));
  },

  setBackendConnected: (connected: boolean) => set({ backendConnected: connected }),
}));
