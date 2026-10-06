/**
 * Alfred REST API client.
 * Typed HTTP client for all FastAPI backend endpoints.
 */

import type { Job, JobDetail, Clip, ClipUpdate, ClipRerenderOptions, ClipSynthesizeOptions } from '../types/job';
import type { ScheduledPost, ScheduleCreate, ScheduleUpdate, SocialAccount } from '../types/schedule';

const API_BASE = 'http://127.0.0.1:8741';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Jobs ──────────────────────────────────────────────────

export const api = {
  // Health
  health: () => request<{ status: string; version: string }>('/api/health'),

  // Jobs
  createJob: (videoPath: string) =>
    request<Job>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ video_path: videoPath }),
    }),

  listJobs: () => request<Job[]>('/api/jobs'),

  listLocalVideos: () =>
    request<Array<{ name: string; path: string; size_mb: number; folder: string }>>('/api/jobs/local-videos'),

  getJob: (jobId: string) => request<JobDetail>(`/api/jobs/${jobId}`),

  deleteJob: (jobId: string) =>
    request<{ success: boolean }>(`/api/jobs/${jobId}`, { method: 'DELETE' }),

  // Clips
  listClips: (jobId: string) => request<Clip[]>(`/api/clips/job/${jobId}`),

  updateClip: (clipId: string, update: ClipUpdate) =>
    request<Clip>(`/api/clips/${clipId}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    }),

  rerenderClip: (clipId: string, options: ClipRerenderOptions) =>
    request<Clip>(`/api/clips/${clipId}/rerender`, {
      method: 'POST',
      body: JSON.stringify(options),
    }),

  synthesizeClipVoice: (clipId: string, options: ClipSynthesizeOptions) =>
    request<{ hook_audio_path: string; hook_text: string }>(`/api/clips/${clipId}/synthesize-voice`, {
      method: 'POST',
      body: JSON.stringify(options),
    }),

  // Schedule
  createSchedule: (data: ScheduleCreate) =>
    request<ScheduledPost>('/api/schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listSchedule: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from_date', from);
    if (to) params.set('to_date', to);
    const qs = params.toString();
    return request<ScheduledPost[]>(`/api/schedule${qs ? `?${qs}` : ''}`);
  },

  updateSchedule: (postId: string, update: ScheduleUpdate) =>
    request<ScheduledPost>(`/api/schedule/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    }),

  deleteSchedule: (postId: string) =>
    request<{ success: boolean }>(`/api/schedule/${postId}`, { method: 'DELETE' }),

  // Social Accounts
  listAccounts: () => request<SocialAccount[]>('/api/accounts'),

  connectAccount: (platform: string) =>
    request<SocialAccount>(`/api/accounts/${platform}/connect`, { method: 'POST' }),

  disconnectAccount: (platform: string, clearCookies = false) =>
    request<{ success: boolean }>(`/api/accounts/${platform}?clear_cookies=${clearCookies}`, { method: 'DELETE' }),

  getAccountStatus: (platform: string) =>
    request<{ platform: string; authenticated: boolean; error?: string }>(`/api/accounts/${platform}/status`),

  // Media
  getVideoSrc: (path: string | null | undefined): string => {
    if (!path) return '';
    return `${API_BASE}/api/media?path=${encodeURIComponent(path)}`;
  },

  // Settings & Voice
  getSettings: () => request<Record<string, string>>('/api/settings'),

  updateSettings: (data: Record<string, string>) =>
    request<Record<string, string>>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getModels: () => request<Record<string, any>>('/api/settings/models'),

  listVoiceSamples: () => request<any[]>('/api/settings/voice-samples'),

  uploadVoiceSample: async (file: File, sampleName = 'my_voice') => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/api/settings/voice-sample?sample_name=${encodeURIComponent(sampleName)}`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Upload failed');
    }
    return res.json();
  },
};
