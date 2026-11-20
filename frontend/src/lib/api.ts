// Lightweight API client for the Alfred backend

const BASE = ''  // Vite proxy handles /api -> backend

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
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
      xhr.open('POST', `${BASE}/api/jobs/upload`)
      xhr.send(form)
    })
  },
  delete: (id: string) => request<{ success: boolean }>(`/api/jobs/${id}`, { method: 'DELETE' }),
  localVideos: () => request<import('./types').LocalVideo[]>('/api/jobs/local-videos'),
}

// ── Clips ───────────────────────────────────────────────
export const clips = {
  listForJob: (jobId: string) => request<import('./types').Clip[]>(`/api/clips/job/${jobId}`),
  update: (clipId: string, data: Partial<{ status: string; hook_text: string; start_time: number; end_time: number }>) =>
    request<import('./types').Clip>(`/api/clips/${clipId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  rerender: (clipId: string, data: { start_time?: number; end_time?: number; framing_mode?: string; audio_mode?: string; hook_text?: string }) =>
    request<import('./types').Clip>(`/api/clips/${clipId}/rerender`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  synthesize: (clipId: string, data: { script_text: string; voice_preset?: string; use_cloned_voice?: boolean; reference_sample_name?: string }) =>
    request<{ hook_audio_path: string; hook_text: string }>(`/api/clips/${clipId}/synthesize-voice`, {
      method: 'POST',
      body: JSON.stringify(data),
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
  update: (postId: string, data: Partial<{ scheduled_at: string; title: string; description: string; tags: string }>) =>
    request<import('./types').ScheduledPost>(`/api/schedule/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
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
  uploadVoiceSample: async (file: File, sampleName = 'my_voice') => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/settings/voice-sample?sample_name=${encodeURIComponent(sampleName)}`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) throw new Error('Upload failed')
    return res.json()
  },
}
