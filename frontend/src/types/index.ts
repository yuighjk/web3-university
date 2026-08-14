// Shared TypeScript types across the frontend

export interface OnChainCourse {
  id: bigint;
  provider: `0x${string}`;
  metadataURI: string;
  contentHash: `0x${string}`;
  certificateName: string;
  price: bigint;
  active: boolean;
}

export interface BackendCourse {
  course_id: number;
  title: string;
  description: string;
  cover_url: string;
  content_hash: string;
  status: 'pending' | 'published' | 'delisted';
  provider_address: string;
  created_at: string;
}

export interface BackendCourseDetail extends BackendCourse {
  video_urls?: string[];
}

export interface MergedCourse {
  id: number;
  title: string;
  description: string;
  coverUrl: string;
  price: bigint;
  provider: string;
  contentHash: `0x${string}`;
  certificateName: string;
  active: boolean;
  status: string;
}

export interface UserProfile {
  address: string;
  username: string | null;
  avatar_url: string | null;
  updated_at: string;
}

export interface ProgressRecord {
  user_address: string;
  course_id: number;
  progress: number;
  completed_at: string | null;
}

export type BuyStep = 'idle' | 'checking' | 'approving' | 'buying' | 'done' | 'error';
