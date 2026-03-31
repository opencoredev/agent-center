import { isAbsolute, relative, resolve } from "node:path";

export function isPathInside(parentPath: string, childPath: string) {
  const rel = relative(parentPath, childPath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function resolveInsideWorkspace(workspacePath: string, ...segments: Array<string | undefined>) {
  const resolved = resolve(workspacePath, ...segments.filter((segment): segment is string => !!segment));

  if (!isPathInside(workspacePath, resolved)) {
    throw new Error(`Resolved path escapes workspace: ${resolved}`);
  }

  return resolved;
}
