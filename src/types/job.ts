/** Core job and clip types matching backend Pydantic models. */

export interface Job {
  id: string;
  video_path: string;
  video_name: string;
  status: JobStatus;
  created_at: string;
  updated_at: string;
  error_msg: string | null;
}

export type JobStatus = 'queued' | 'transcribing' | 'analyzing' | 'rendering' | 'completed' | 'failed';

export interface JobDetail extends Job {
  clips: Clip[];
}

export interface Clip {
  id: string;
  job_id: string;
  rank: number;
  start_time: number;
  end_time: number;
  duration: number;
  transcript_text: string;
  hook_text: string | null;
  hook_audio_path: string | null;
  output_path: string | null;
  status: ClipStatus;
  rationale: string | null;
  created_at: string;
}

export type ClipStatus = 'pending' | 'rendering' | 'rendered' | 'approved' | 'rejected';

export interface ClipUpdate {
  status?: 'approved' | 'rejected' | 'pending';
  hook_text?: string;
  start_time?: number;
  end_time?: number;
}

export type FramingMode = 'presentation_fit' | 'split_screen' | 'face_focus';
export type AudioMode = 'original' | 'preroll' | 'voiceover';

export interface ClipRerenderOptions {
  start_time?: number;
  end_time?: number;
  framing_mode?: FramingMode;
  audio_mode?: AudioMode;
  hook_text?: string;
}

export interface ClipSynthesizeOptions {
  script_text: string;
  voice_preset?: string;
  use_cloned_voice?: boolean;
  reference_sample_name?: string;
}

export interface Transcript {
  id: string;
  job_id: string;
  full_text: string;
  segments: string; // JSON string
  words: string;    // JSON string
  created_at: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptWord {
  start: number;
  end: number;
  word: string;
}
