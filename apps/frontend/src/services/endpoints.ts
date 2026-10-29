import { api, type Query } from './api';
import type {
  Character,
  CharacterInput,
  CharacterPatch,
  GalleryFilters,
  GalleryItem,
  GenerationArtifact,
  GenerationInput,
  GenerationJob,
  HealthStatus,
  Paginated,
  Priority,
  Destination,
  ProvidersStatus,
  ReferenceImage,
} from '../types';

type Sig = { signal?: AbortSignal };

export const getHealth = (s?: Sig) => api.get<HealthStatus>('/api/health', { ...s, track: false });
export const getProviders = (s?: Sig) => api.get<ProvidersStatus>('/api/providers/status', s);

// Personajes
export const listCharacters = (p: { q?: string; include_archived?: boolean; limit?: number; offset?: number }, s?: Sig) =>
  api.get<Paginated<Character>>('/api/characters', { ...s, query: p as Query });
export const getCharacter = (id: string, s?: Sig) => api.get<Character>(`/api/characters/${id}`, s);
export const createCharacter = (input: CharacterInput) => api.post<Character>('/api/characters', input);
export const updateCharacter = (id: string, patch: CharacterPatch) => api.patch<Character>(`/api/characters/${id}`, patch);
export const duplicateCharacter = (id: string) => api.post<Character>(`/api/characters/${id}/duplicate`);
export const deleteCharacter = (id: string) => api.del(`/api/characters/${id}`, { query: { confirm: true } });

// Referencias
export const listReferences = (id: string, s?: Sig) => api.get<Paginated<ReferenceImage>>(`/api/characters/${id}/references`, s);
export function uploadReference(characterId: string, file: File, sourceNote: string, rightsConfirmed: boolean) {
  const form = new FormData();
  form.append('file', file);
  form.append('source_note', sourceNote.trim());
  form.append('rights_confirmed', rightsConfirmed ? 'true' : 'false');
  return api.upload<ReferenceImage>(`/api/characters/${characterId}/references`, form);
}
export const referenceFromArtifact = (characterId: string, artifactId: string, sourceNote: string) =>
  api.post<ReferenceImage>(`/api/characters/${characterId}/references/from-artifact`, { artifact_id: artifactId, source_note: sourceNote.trim() });
export const deleteReference = (id: string) => api.del(`/api/references/${id}`, { query: { confirm: true } });

// Generaciones
/** confirm_cloud solo viaja si el destino es nube Y el usuario aceptó el diálogo. */
export function buildGenerationBody(input: GenerationInput, cloudConfirmed: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    character_id: input.character_id,
    prompt: input.prompt,
    negative_prompt: input.negative_prompt ?? '',
    destination: input.destination,
    priority: input.priority,
    width: input.width,
    height: input.height,
  };
  if (input.seed !== undefined && input.seed !== null) body.seed = input.seed;
  if (input.destination === 'cloud' && cloudConfirmed) body.confirm_cloud = true;
  return body;
}
export const createGeneration = (input: GenerationInput, cloudConfirmed = false) =>
  api.post<GenerationJob>('/api/generations', buildGenerationBody(input, cloudConfirmed));
export const getGeneration = (id: string, s?: Sig) => api.get<GenerationJob>(`/api/generations/${id}`, s);
export const retryGeneration = (id: string, cloudConfirmed = false) =>
  api.post<GenerationJob>(`/api/generations/${id}/retry`, cloudConfirmed ? { confirm_cloud: true } : {});
export const cancelGeneration = (id: string) => api.post<GenerationJob>(`/api/generations/${id}/cancel`);
export function consistencyBatch(
  characterId: string,
  opts: { base_prompt?: string; destination?: Destination; priority?: Priority },
  cloudConfirmed = false,
) {
  const body: Record<string, unknown> = { ...opts };
  if (opts.destination === 'cloud' && cloudConfirmed) body.confirm_cloud = true;
  return api.post<{ jobs: GenerationJob[] }>(`/api/characters/${characterId}/consistency-batch`, body);
}

// Galería y resultados
export const listGallery = (f: GalleryFilters & { limit?: number; offset?: number }, s?: Sig) =>
  api.get<Paginated<GalleryItem>>('/api/gallery', { ...s, query: f as Query });
export const updateArtifact = (id: string, patch: { selected?: boolean; note?: string }) =>
  api.patch<GenerationArtifact>(`/api/artifacts/${id}`, patch);
export const deleteArtifact = (id: string) => api.del(`/api/artifacts/${id}`, { query: { confirm: true } });
