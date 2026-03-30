import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_STATE = {
  users: [],
  submissions: [],
  withdrawals: []
};

export function createPlatformStore({ statePath }) {
  const preferredPath = path.isAbsolute(statePath) ? statePath : path.resolve(process.cwd(), statePath);
  const resolvedPath = resolveWritablePath(preferredPath);

  return {
    statePath: resolvedPath,
    storageMode: resolvedPath === preferredPath ? "project-file" : "temp-file",
    readState: () => readStateFile(resolvedPath),
    writeState: (nextState) => writeStateFile(resolvedPath, nextState),
    updateState(updater) {
      const currentState = readStateFile(resolvedPath);
      const draft = JSON.parse(JSON.stringify(currentState));
      const updated = updater(draft) || draft;
      writeStateFile(resolvedPath, updated);
      return updated;
    }
  };
}

function ensureStateFile(filePath) {
  if (fs.existsSync(filePath)) {
    return true;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(DEFAULT_STATE, null, 2)}\n`, "utf8");
  return true;
}

function readStateFile(filePath) {
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return normalizeState(payload);
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function writeStateFile(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(normalizeState(state), null, 2)}\n`, "utf8");
}

function normalizeState(state) {
  return {
    users: Array.isArray(state?.users) ? state.users : [],
    submissions: Array.isArray(state?.submissions) ? state.submissions : [],
    withdrawals: Array.isArray(state?.withdrawals) ? state.withdrawals : []
  };
}

function resolveWritablePath(preferredPath) {
  try {
    ensureStateFile(preferredPath);
    fs.accessSync(preferredPath, fs.constants.R_OK | fs.constants.W_OK);
    return preferredPath;
  } catch {
    const fallbackPath = path.join(os.tmpdir(), "patrick-tech-media", "platform-state.json");
    ensureStateFile(fallbackPath);
    fs.accessSync(fallbackPath, fs.constants.R_OK | fs.constants.W_OK);
    return fallbackPath;
  }
}
