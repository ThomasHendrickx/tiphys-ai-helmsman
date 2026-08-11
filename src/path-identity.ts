import { realpathSync } from "node:fs";

/** Compare two existing paths by their canonical filesystem identity. */
export function pathsIdentifySameObject(left: string, right: string): boolean {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
}
