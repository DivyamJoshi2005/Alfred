/**
 * Job queue state management.
 */

import { create } from 'zustand';
import type { Job, JobDetail } from '../types/job';
import type { PipelinePhase } from '../types/ws';
import { api } from '../services/api';

interface JobProgress {
  phase: PipelinePhase;
  progress: number;
  message: string;
  clipIndex?: number;
  clipTotal?: number;
}

interface JobStore {
  jobs: Job[];
  currentJob: JobDetail | null;
  progress: Record<string, JobProgress>; // keyed by job_id
  loading: boolean;
  error: string | null;

  // Actions
  fetchJobs: () => Promise<void>;
  fetchJob: (jobId: string) => Promise<void>;
  createJob: (videoPath: string) => Promise<Job>;
  deleteJob: (jobId: string) => Promise<void>;
  updateProgress: (jobId: string, progress: JobProgress) => void;
  updateJobStatus: (jobId: string, status: string) => void;
  clearError: () => void;
}

export const useJobStore = create<JobStore>((set) => ({
  jobs: [],
  currentJob: null,
  progress: {},
  loading: false,
  error: null,

  fetchJobs: async () => {
    set({ loading: true, error: null });
    try {
      const jobs = await api.listJobs();
      set({ jobs, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  fetchJob: async (jobId: string) => {
    set({ loading: true, error: null });
    try {
      const job = await api.getJob(jobId);
      set({ currentJob: job, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  createJob: async (videoPath: string) => {
    set({ loading: true, error: null });
    try {
      const job = await api.createJob(videoPath);
      set((state) => ({
        jobs: [job, ...state.jobs],
        loading: false,
      }));
      return job;
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
      throw err;
    }
  },

  deleteJob: async (jobId: string) => {
    try {
      await api.deleteJob(jobId);
      set((state) => ({
        jobs: state.jobs.filter((j) => j.id !== jobId),
        currentJob: state.currentJob?.id === jobId ? null : state.currentJob,
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  updateProgress: (jobId, progress) => {
    set((state) => ({
      progress: { ...state.progress, [jobId]: progress },
    }));
  },

  updateJobStatus: (jobId, status) => {
    set((state) => ({
      jobs: state.jobs.map((j) =>
        j.id === jobId ? { ...j, status: status as Job['status'] } : j
      ),
    }));
  },

  clearError: () => set({ error: null }),
}));
