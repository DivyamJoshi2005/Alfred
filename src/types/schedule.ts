/** Schedule and social account types matching backend models. */

export type Platform = 'youtube' | 'instagram' | 'twitter';

export interface ScheduledPost {
  id: string;
  clip_id: string;
  platform: Platform;
  scheduled_at: string;
  title: string | null;
  description: string | null;
  tags: string | null;
  status: PostStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type PostStatus = 'scheduled' | 'uploading' | 'uploaded' | 'failed';

export interface ScheduleCreate {
  clip_id: string;
  platform: Platform;
  scheduled_at: string;
  title?: string;
  description?: string;
  tags?: string;
}

export interface ScheduleUpdate {
  scheduled_at?: string;
  title?: string;
  description?: string;
  tags?: string;
}

export interface SocialAccount {
  id: string;
  platform: Platform;
  profile_path: string;
  display_name: string | null;
  connected_at: string;
  last_used_at: string | null;
}
