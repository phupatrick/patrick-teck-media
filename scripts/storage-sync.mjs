import fs from "node:fs";
import path from "node:path";
import { createNewsroomStore } from "../src/newsroom-store.mjs";
import { createPlatformStore } from "../src/platform-store.mjs";
import { createOpenClawWebStore } from "../src/openclaw-web-store.mjs";

const rootDir = process.cwd();
const envFromFile = loadEnvFile(path.join(rootDir, ".env"));
const databaseUrl = process.env.DATABASE_URL || envFromFile.DATABASE_URL || "";

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required before syncing Patrick Tech Media documents to cloud storage.");
}

const syncTargets = [
  {
    label: "newsroom",
    filePath: process.env.NEWSROOM_CONTENT_PATH || envFromFile.NEWSROOM_CONTENT_PATH || "data/newsroom-content.json",
    createStore: (targetPath) => createNewsroomStore({ contentPath: targetPath, databaseUrl }),
    write: (store, value) => store.writePayload(value)
  },
  {
    label: "platform",
    filePath: process.env.PLATFORM_STATE_PATH || envFromFile.PLATFORM_STATE_PATH || "data/platform-state.json",
    createStore: (targetPath) => createPlatformStore({ statePath: targetPath, databaseUrl }),
    write: (store, value) => store.writeState(value)
  },
  {
    label: "openclaw-web",
    filePath: process.env.OPENCLAW_WEB_STATE_PATH || envFromFile.OPENCLAW_WEB_STATE_PATH || "data/openclaw-web-state.json",
    createStore: (targetPath) => createOpenClawWebStore({ statePath: targetPath, databaseUrl }),
    write: (store, value) => store.writeState(value)
  }
];

for (const target of syncTargets) {
  const resolvedPath = path.resolve(rootDir, target.filePath);
  const payload = readJson(resolvedPath);
  const store = target.createStore(target.filePath);

  await target.write(store, payload);
  console.log(`Synced ${target.label} to ${store.storageMode} from ${resolvedPath}`);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function loadEnvFile(filePath) {
  try {
    return fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .reduce((env, line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (key && !(key in process.env)) {
          process.env[key] = value;
        }
        env[key] = value;
        return env;
      }, {});
  } catch {
    return {};
  }
}
