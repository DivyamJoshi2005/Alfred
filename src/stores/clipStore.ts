/**
 * Clip review state management.
 */

import { create } from 'zustand';
import type { Clip, ClipUpdate, ClipRerenderOptions } from '../types/job';
import { api } from '../services/api';

interface ClipStore {
  clips: Clip[];
  activeClipIndex: number;
  loading: boolean;

  // Actions
  fetchClips: (jobId: string) => Promise<void>;
  updateClip: (clipId: string, update: ClipUpdate) => Promise<void>;
  rerenderClip: (clipId: string, options: ClipRerenderOptions) => Promise<Clip>;
  setActiveClip: (index: number) => void;
  clearClips: () => void;
}

export const useClipStore = create<ClipStore>((set) => ({
  clips: [],
  activeClipIndex: 0,
  loading: false,

  fetchClips: async (jobId: string) => {
    set({ loading: true });
    try {
      const clips = await api.listClips(jobId);
      set({ clips, activeClipIndex: 0, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  updateClip: async (clipId: string, update: ClipUpdate) => {
    try {
      const updated = await api.updateClip(clipId, update);
      set((state) => ({
        clips: state.clips.map((c) => (c.id === clipId ? updated : c)),
      }));
    } catch (err) {
      console.error('Failed to update clip:', err);
    }
  },

  rerenderClip: async (clipId: string, options: ClipRerenderOptions) => {
    set({ loading: true });
    try {
      const updated = await api.rerenderClip(clipId, options);
      set((state) => ({
        clips: state.clips.map((c) => (c.id === clipId ? updated : c)),
        loading: false,
      }));
      return updated;
    } catch (err) {
      console.error('Failed to rerender clip:', err);
      set({ loading: false });
      throw err;
    }
  },

  setActiveClip: (index: number) => set({ activeClipIndex: index }),

  clearClips: () => set({ clips: [], activeClipIndex: 0 }),
}));
