export interface Soul {
  id: number;
  slug: string;
  label: string;
  name: string;
  user_id: number;
  author: string;
  description: string | null;
  tags: string[];
  rating_avg: number;
  rating_count: number;
  downloads_count: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SoulListResponse {
  data: Soul[];
  pagination: Pagination;
}

export interface SoulDetailResponse extends Soul {}

export interface RateResponse {
  slug: string;
  rating: number;
  rating_avg: number;
  rating_count: number;
}

export interface UploadResponse {
  slug: string;
  name: string;
  hash: string;
}

export interface User {
  id: number;
  username: string;
  avatar: string;
}
