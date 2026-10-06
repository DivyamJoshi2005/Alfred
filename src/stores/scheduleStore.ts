/**
 * Schedule and calendar state management.
 */

import { create } from 'zustand';
import type { ScheduledPost, ScheduleCreate } from '../types/schedule';
import { api } from '../services/api';

interface ScheduleStore {
  posts: ScheduledPost[];
  loading: boolean;

  // Actions
  fetchPosts: (from?: string, to?: string) => Promise<void>;
  createPost: (data: ScheduleCreate) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  updatePostStatus: (postId: string, status: string) => void;
}

export const useScheduleStore = create<ScheduleStore>((set) => ({
  posts: [],
  loading: false,

  fetchPosts: async (from?: string, to?: string) => {
    set({ loading: true });
    try {
      const posts = await api.listSchedule(from, to);
      set({ posts, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createPost: async (data: ScheduleCreate) => {
    const post = await api.createSchedule(data);
    set((state) => ({ posts: [...state.posts, post] }));
  },

  deletePost: async (postId: string) => {
    await api.deleteSchedule(postId);
    set((state) => ({
      posts: state.posts.filter((p) => p.id !== postId),
    }));
  },

  updatePostStatus: (postId, status) => {
    set((state) => ({
      posts: state.posts.map((p) =>
        p.id === postId ? { ...p, status: status as ScheduledPost['status'] } : p
      ),
    }));
  },
}));
