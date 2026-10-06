/** WebSocket message types for real-time communication. */

export type WSMessage =
  | ProgressMessage
  | JobStatusMessage
  | UploadStatusMessage
  | NotificationMessage
  | PongMessage;

export interface ProgressMessage {
  type: 'progress';
  job_id: string;
  phase: PipelinePhase;
  progress: number;
  message: string;
  clip_index?: number;
  clip_total?: number;
}

export type PipelinePhase =
  | 'transcribing'
  | 'analyzing'
  | 'generating_hooks'
  | 'rendering'
  | 'cropping';

export interface JobStatusMessage {
  type: 'job_status';
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface UploadStatusMessage {
  type: 'upload_status';
  post_id: string;
  status: 'uploading' | 'uploaded' | 'failed';
  error?: string;
}

export interface NotificationMessage {
  type: 'notification';
  level: 'info' | 'warning' | 'error';
  message: string;
}

export interface PongMessage {
  type: 'pong';
}
