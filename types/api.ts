export interface BaseMetadata {
  requestId: string;
  timestamp: string;
}

export interface PaginationMetadata extends BaseMetadata {
  page: number;
  limit: number;
  total: number;
}

export interface ApiResponse<T = unknown> {
  data: T | null;
  metadata: BaseMetadata | PaginationMetadata;
  error: null | {
    code: string;
    message: string;
  };
}
