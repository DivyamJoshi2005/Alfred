// API types matching the backend Pydantic models

export type JobStatus = 
  | 'queued' 
  | 'processing' 
  | 'transcribing' 
  | 'analyzing' 
  | 'generating_hooks' 
  | 'cropping' 
  | 'rendering' 
  | 'completed' 
  | 'failed'

export interface Job {
  id: string
  video_path: string
  video_name: string
  status: JobStatus
  created_at: string
  updated_at: string
  error_msg: string | null
}

export interface JobDetail extends Job {
  clips: Clip[]
}

export interface Clip {
  id: string
  job_id: string
  rank: number
  start_time: number
  end_time: number
  duration: number
  transcript_text: string
  hook_text: string | null
  hook_audio_path: string | null
  output_path: string | null
  status: 'pending' | 'approved' | 'rejected'
  rationale: string | null
  visual_score?: number
  audio_score?: number
  hook_score?: number
  retention_score?: number
  visual_hook_rationale?: string | null
  storyboard_paths?: string | null
  created_at: string
}

export interface ScheduledPost {
  id: string
  clip_id: string
  platform: 'youtube' | 'instagram' | 'twitter'
  scheduled_at: string
  title: string | null
  description: string | null
  tags: string | null
  status: string
  attempts: number
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface SocialAccount {
  id: string
  platform: 'youtube' | 'instagram' | 'twitter'
  profile_path: string
  display_name: string | null
  connected_at: string
  last_used_at: string | null
}

export interface LocalVideo {
  name: string
  path: string
  size_mb: number
  folder: string
}

export interface ModelStatus {
  name: string
  ready: boolean
  path?: string
  engine?: string
  center_crop_fallback?: boolean
  acoustic_profile_ready?: boolean
}

export interface VoiceSample {
  name: string
  path: string
  has_embedding: boolean
  embedding_path?: string
}

// WebSocket message types
export type WSMessage =
  | { type: 'progress'; job_id: string; phase: string; progress: number; message: string; clip_index?: number; clip_total?: number }
  | { type: 'job_status'; job_id: string; status: string; error?: string }
  | { type: 'upload_status'; post_id: string; status: string; error?: string }
  | { type: 'notification'; level: string; message: string }
  | { type: 'pong' }
