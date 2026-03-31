import type { DomainMetadata } from "@agent-center/shared";

export function mergeMetadata(base: DomainMetadata, patch: DomainMetadata) {
  return {
    ...base,
    ...patch,
  };
}
