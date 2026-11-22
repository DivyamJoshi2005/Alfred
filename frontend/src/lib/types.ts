// API types matching the backend Pydantic models

export type JobStatus = 
  | 'downloading'
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
  audio_mode?: string
  hook_offset_sec?: number
  ducking_volume?: number
  framing_mode?: 'presentation_fit' | 'face_focus' | 'split_screen' | string
  crop_coords?: string | null
  tags?: string | null
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
  is_authenticated?: boolean
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

export interface SoundProfile {
  preset: string
  cloningEnabled: boolean
  sampleName: string | null
}

export interface VoiceOption {
  id: string
  name: string
  accent: string
  gender: 'female' | 'male'
  desc: string
  tag: string
}

export const KOKORO_VOICES: VoiceOption[] = [
  { id: 'af_sarah', name: 'Sarah', accent: 'American', gender: 'female', desc: 'Warm & engaging storytelling', tag: 'Warm / Podcast' },
  { id: 'af_bella', name: 'Bella', accent: 'American', gender: 'female', desc: 'Clear, bright & articulate delivery', tag: 'Upbeat / Creator' },
  { id: 'am_michael', name: 'Michael', accent: 'American', gender: 'male', desc: 'Deep, grounded & authoritative tone', tag: 'Deep Voice' },
  { id: 'am_adam', name: 'Adam', accent: 'American', gender: 'male', desc: 'Confident, direct professional presenter', tag: 'Presenter' },
]

export const VOICE_DISPLAY_NAMES: Record<string, string> = {
  af_sarah: 'Sarah (Warm American)',
  af_heart: 'Sarah (Warm American)',
  af_bella: 'Bella (Clear American)',
  af_nicole: 'Nicole (Casual American)',
  af_sky: 'Sky (Energetic American)',
  am_adam: 'Adam (Confident American)',
  am_michael: 'Michael (Deep American)',
  bf_emma: 'Emma (Crisp British)',
  bf_isabella: 'Isabella (Gentle British)',
  bm_george: 'George (Classic British)',
  bm_lewis: 'Lewis (Dynamic British)',
  af: 'Default Neutral',
}

// WebSocket message types
export type WSMessage =
  | { type: 'progress'; job_id: string; phase: string; progress: number; message: string; clip_index?: number; clip_total?: number }
  | { type: 'job_status'; job_id: string; status: string; error?: string }
  | { type: 'upload_status'; post_id: string; status: string; error?: string }
  | { type: 'notification'; level: string; message: string }
  | { type: 'pong' }
