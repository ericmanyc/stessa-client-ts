import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { StessaTokenSet, StessaTokenStore } from "../auth.js";

/**
 * Reads and writes a StessaTokenSet to a JSON file with atomic writes
 * (temp + rename). The file contains the durable session cookie; protect it
 * with appropriate file permissions.
 */
export class FileTokenStore implements StessaTokenStore {
  constructor(private readonly filePath: string) {
    if (!filePath) {
      throw new Error("filePath is required");
    }
  }

  async load(): Promise<StessaTokenSet | null> {
    try {
      const json = await readFile(this.filePath, "utf8");
      const raw = JSON.parse(json) as Record<string, unknown>;
      return deserializeTokenSet(raw);
    } catch {
      return null;
    }
  }

  async save(tokens: StessaTokenSet): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = this.filePath + ".tmp";
    try {
      await writeFile(tempPath, serializeTokenSet(tokens), { mode: 0o600 });
      await rename(tempPath, this.filePath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  async delete(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}

export function serializeTokenSet(tokens: StessaTokenSet): string {
  return JSON.stringify({
    access_token: tokens.accessToken,
    session_cookie: tokens.sessionCookie,
  });
}

export function deserializeTokenSet(raw: Record<string, unknown>): StessaTokenSet | null {
  const accessToken = raw["access_token"];
  const sessionCookie = raw["session_cookie"];
  if (typeof sessionCookie !== "string" || !sessionCookie) {
    return null;
  }
  return {
    accessToken: typeof accessToken === "string" ? accessToken : "",
    sessionCookie,
  };
}
