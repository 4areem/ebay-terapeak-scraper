import { existsSync } from "node:fs";

export function storageStateForPath(path: string): string | undefined {
  return existsSync(path) ? path : undefined;
}
