import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvFiles } from "../config/env";

const touchedKeys = ["MINIMAX_API_KEY", "PORT", "QUOTED_VALUE"] as const;

afterEach(() => {
  for (const key of touchedKeys) {
    delete process.env[key];
  }
});

describe("loadEnvFiles", () => {
  it("loads local env files without overriding existing process env values", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "tts-env-"));
    await writeFile(
      path.join(cwd, ".env"),
      [
        "MINIMAX_API_KEY=file-key",
        "PORT=4100",
        'QUOTED_VALUE="hello\\nworld"',
        "# ignored comment"
      ].join("\n")
    );

    process.env.MINIMAX_API_KEY = "existing-key";
    const result = loadEnvFiles({
      cwd
    });

    expect(result.loadedFiles).toEqual([path.join(cwd, ".env")]);
    expect(process.env.MINIMAX_API_KEY).toBe("existing-key");
    expect(process.env.PORT).toBe("4100");
    expect(process.env.QUOTED_VALUE).toBe("hello\nworld");
  });

  it("loads root env when the api package is the current working directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "tts-env-root-"));
    await writeFile(path.join(root, "pnpm-workspace.yaml"), "packages: []\n");
    await mkdir(path.join(root, "apps", "api"), {
      recursive: true
    });
    await writeFile(path.join(root, ".env"), "MINIMAX_API_KEY=root-key\n");

    const result = loadEnvFiles({
      cwd: path.join(root, "apps", "api")
    });

    expect(result.loadedFiles).toContain(path.join(root, ".env"));
    expect(process.env.MINIMAX_API_KEY).toBe("root-key");
  });
});
