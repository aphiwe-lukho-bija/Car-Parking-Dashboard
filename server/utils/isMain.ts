import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * True when the module referenced by `metaUrl` is the process entry point.
 *
 * Comparing `import.meta.url` to `process.argv[1]` as strings is unreliable
 * across platforms — Windows drive letters and the `file:///` slash count both
 * differ — so both sides are normalised to real filesystem paths first.
 */
export function isMainModule(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;

  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(resolve(entry));
  } catch {
    return false;
  }
}