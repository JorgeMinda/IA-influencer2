/** Tipos que reflejan docs/api-contracts.md (v1). */

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type Destination = 'auto' | 'local' | 'cloud' | 'mock';
export type UsedDestination = 'local' | 'cloud' | 'mock';
export type Priority = 'speed' | 'balanced' | 'quality';

export interface Paginated<T> {
  items: T[];
  total: number;
}

export interface Character {
  id: string;
  name: string;
  visual_description: string;
  invariant_traits: string[];
  notes: string;
  archived: boolean;
  reference_count: number;
  created_at: string;
  updated_at: string;
}

export interface CharacterInput {
  name: string;
  visual_description?: string;
  invariant_traits?: string[];
  notes?: string;
}

export type CharacterPatch = Partial<CharacterInput> & { archived?: boolean };

export interface ReferenceImage {
  id: string;
  character_id: string;
  url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  source_note: string;
  rights_confirmed: boolean;
  origin_artifact_id: string | null;
  created_at: string;
}

export interface ArtifactMetadata {
  prompt: string;
  negative_prompt: string;
  seed: number;
  model: string;
  engine: string;
  workflow_version: string;
  params: Record<string, unknown>;
}

export interface GenerationArtifact {
  id: string;
  job_id: string;
  character_id: string;
  image_url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  selected: boolean;
  note: string;
  metadata: ArtifactMetadata;
  created_at: string;
}

export interface GenerationJob {
  id: string;
  character_id: string;
  prompt: string;
  negative_prompt: string;
  seed: number;
  width: number;
  height: number;
  priority: Priority;
  destination_requested: Destination;
  destination_used: UsedDestination | null;
  engine: string;
  model: string;
  workflow_version: string;
  status: JobStatus;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  retry_of: string | null;
  provider_job_id: string | null;
  artifacts: GenerationArtifact[];
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface GenerationInput {
  character_id: string;
  prompt: string;
  negative_prompt?: string;
  destination: Destination;
  priority: Priority;
  width: number;
  height: number;
  seed?: number | null;
}

export interface GalleryItem extends GenerationArtifact {
  character_name: string;
  engine: string;
  destination_used: UsedDestination | null;
  job_status: JobStatus;
  job_created_at: string;
}

export interface GalleryFilters {
  character_id?: string;
  status?: string;
  engine?: string;
  selected?: boolean;
  date_from?: string;
  date_to?: string;
}

export interface ProvidersStatus {
  local: { enabled: boolean; available: boolean; detail: string };
  cloud: { enabled: boolean; provider: string; configured: boolean; detail: string };
  mock: { enabled: boolean; detail: string };
  limits: { max_upload_mb: number; max_concurrent_jobs: number; rate_limit_per_minute: number };
}

export interface HealthStatus {
  status: string;
  version: string;
  time: string;
}

/** Cuerpo de error del contrato. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown[] };
}

/** Forma de los errores que lanza el cliente (ver la clase ApiError en services/api.ts). */
export interface ApiError extends Error {
  code: string;
  status: number;
  details: unknown[];
  retryAfter: number | null;
}
