// Lightweight API client for the Alfred backend

export const isTauriEnv = (): boolean => {
  return typeof window !== 'undefined' && (
    '__TAURI_INTERNALS__' in window ||
    window.location.hostname === 'tauri.localhost' ||
    window.location.protocol === 'tauri:'
  )
}

export const getApiBase = (): string => {
  return isTauriEnv() ? 'http://127.0.0.1:8741' : ''
}

export const mediaUrl = (path: string, extra?: string): string => {
  const base = getApiBase()
  return `${base}/api/media?path=${encodeURIComponent(path)}${extra ? `&${extra}` : ''}`
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || `Request failed: ${res.status}`)
  }
  return res.json()
}

// ── Jobs ────────────────────────────────────────────────
export const jobs = {
  list: () => request<import('./types').Job[]>('/api/jobs'),
  get: (id: string) => request<import('./types').JobDetail>(`/api/jobs/${id}`),
  create: (videoPath: string) => request<import('./types').Job>('/api/jobs', {
    method: 'POST',
    body: JSON.stringify({ video_path: videoPath }),
  }),
  ingestYoutube: (url: string) => request<import('./types').Job>('/api/jobs/youtube', {
    method: 'POST',
    body: JSON.stringify({ url }),
  }),
  upload: (file: File, onProgress?: (pct: number) => void): Promise<import('./types').Job> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const form = new FormData()
      form.append('file', file)

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100))
          }
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText))
          } catch {
            reject(new Error('Invalid response from server'))
          }
        } else {
          try {
            const body = JSON.parse(xhr.responseText)
            reject(new Error(body.detail || `Upload failed: ${xhr.status}`))
          } catch {
            reject(new Error(`Upload failed: ${xhr.status}`))
          }
        }
      }

      xhr.onerror = () => reject(new Error('Network error during upload'))
      xhr.open('POST', `${getApiBase()}/api/jobs/upload`)
      xhr.send(form)
    })
  },
  delete: (id: string) => request<{ success: boolean }>(`/api/jobs/${id}`, { method: 'DELETE' }),
  localVideos: () => request<import('./types').LocalVideo[]>('/api/jobs/local-videos'),
}

// ── Clips ───────────────────────────────────────────────
export const clips = {
  listForJob: (jobId: string) => request<import('./types').Clip[]>(`/api/clips/job/${jobId}`),
  update: (clipId: string, data: Partial<{
    status: string
    hook_text: string
    start_time: number
    end_time: number
    audio_mode: string
    hook_offset_sec: number
    ducking_volume: number
    tags: string
  }>) =>
    request<import('./types').Clip>(`/api/clips/${clipId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  rerender: (clipId: string, data: {
    start_time?: number
    end_time?: number
    framing_mode?: string
    audio_mode?: string
    hook_text?: string
    hook_offset_sec?: number
    ducking_volume?: number
    tags?: string
    voice_preset?: string
    use_cloned_voice?: boolean
    reference_sample_name?: string
  }) =>
    request<import('./types').Clip>(`/api/clips/${clipId}/rerender`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  synthesize: (clipId: string, data: { script_text: string; voice_preset?: string; use_cloned_voice?: boolean; reference_sample_name?: string }) =>
    request<{ hook_audio_path: string; hook_text: string }>(`/api/clips/${clipId}/synthesize-voice`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  generateTags: (clipId: string) =>
    request<{ clip_id: string; tags: string }>(`/api/clips/${clipId}/generate-tags`, {
      method: 'POST',
    }),
}

// ── Schedule ────────────────────────────────────────────
export const schedule = {
  list: (fromDate?: string, toDate?: string) => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from_date', fromDate)
    if (toDate) params.set('to_date', toDate)
    const qs = params.toString()
    return request<import('./types').ScheduledPost[]>(`/api/schedule${qs ? `?${qs}` : ''}`)
  },
  create: (data: { clip_id: string; platform: string; scheduled_at: string; title?: string; description?: string; tags?: string }) =>
    request<import('./types').ScheduledPost>('/api/schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  publishNow: (data: { clip_id: string; platform: string; title?: string; description?: string; tags?: string }) =>
    request<import('./types').ScheduledPost>('/api/schedule/publish-now', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (postId: string, data: Partial<{ scheduled_at: string; title: string; description: string; tags: string; status?: string }>) =>
    request<import('./types').ScheduledPost>(`/api/schedule/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  retry: (postId: string) =>
    request<import('./types').ScheduledPost>(`/api/schedule/${postId}/retry`, {
      method: 'POST',
    }),
  retryAll: () =>
    request<{ success: boolean }>('/api/schedule/retry-all', {
      method: 'POST',
    }),
  clearFailed: () =>
    request<{ success: boolean; deleted: number }>('/api/schedule/failed', {
      method: 'DELETE',
    }),
  delete: (postId: string) => request<{ success: boolean }>(`/api/schedule/${postId}`, { method: 'DELETE' }),
}

// ── Accounts ────────────────────────────────────────────
export const accounts = {
  list: () => request<import('./types').SocialAccount[]>('/api/accounts'),
  status: (platform: string) => request<{ platform: string; authenticated: boolean; error?: string }>(`/api/accounts/${platform}/status`),
  connect: (platform: string) => request<import('./types').SocialAccount>(`/api/accounts/${platform}/connect?interactive=true`, { method: 'POST' }),
  disconnect: (platform: string, clearCookies = false) =>
    request<{ success: boolean }>(`/api/accounts/${platform}?clear_cookies=${clearCookies}`, { method: 'DELETE' }),
}

// ── Settings ────────────────────────────────────────────
export const settings = {
  get: () => request<Record<string, string>>('/api/settings'),
  update: (data: Record<string, string>) => request<Record<string, string>>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  models: () => request<Record<string, import('./types').ModelStatus>>('/api/settings/models'),
  voiceSamples: () => request<import('./types').VoiceSample[]>('/api/settings/voice-samples'),
  deleteVoiceSample: (sampleName: string) =>
    request<{ success: boolean; message: string }>(`/api/settings/voice-sample/${encodeURIComponent(sampleName)}`, {
      method: 'DELETE',
    }),
  getVoicePreviewUrl: (voice: string) => `${getApiBase()}/api/settings/voice-preview?voice=${encodeURIComponent(voice)}`,
  uploadVoiceSample: async (file: File, sampleName = 'my_voice') => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${getApiBase()}/api/settings/voice-sample?sample_name=${encodeURIComponent(sampleName)}`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) throw new Error('Upload failed')
    return res.json()
  },
}
