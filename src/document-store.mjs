import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sqlClients = new Map();
const schemaReady = new Map();

export function createDocumentStore({
  documentKey,
  fallbackPath,
  initialValue,
  databaseUrl = process.env.DATABASE_URL || "",
  requireDatabase = isEnabled(process.env.DOCUMENT_STORE_REQUIRE_DATABASE),
  preferNewerFile = false
}) {
  if (!documentKey) {
    throw new Error("A documentKey is required for the document store.");
  }

  const preferredPath = path.isAbsolute(fallbackPath) ? fallbackPath : path.resolve(process.cwd(), fallbackPath);
  const resolvedPath = resolveWritablePath(preferredPath, initialValue);
  const normalizedInitialValue = cloneValue(initialValue);
  const useDatabase = Boolean(String(databaseUrl || "").trim());

  if (requireDatabase && !useDatabase) {
    throw new Error("DOCUMENT_STORE_REQUIRE_DATABASE is enabled but DATABASE_URL is missing.");
  }

  return {
    documentKey,
    statePath: resolvedPath,
    storageMode: useDatabase ? "neon-postgres" : resolvedPath === preferredPath ? "project-file" : "temp-file",
    async read() {
      if (!useDatabase) {
        return readStateFile(resolvedPath, normalizedInitialValue);
      }

      try {
        const databaseValue = await withDatabaseRetries(() => readDatabaseDocument({ databaseUrl, documentKey, initialValue: normalizedInitialValue }));

        if (!isInitialLike(databaseValue, normalizedInitialValue)) {
          return databaseValue;
        }

        const fileValue = readStateFile(resolvedPath, normalizedInitialValue);

        if (preferNewerFile && !isInitialLike(fileValue, normalizedInitialValue)) {
          const selectedValue = selectNewerSnapshot(databaseValue, fileValue);
          if (selectedValue === fileValue) {
            return fileValue;
          }
        }

        if (!isInitialLike(fileValue, normalizedInitialValue)) {
          try {
            await withDatabaseRetries(() => writeDatabaseDocument({
              databaseUrl,
              documentKey,
              value: fileValue,
              initialValue: normalizedInitialValue
            }));
          } catch (error) {
            if (requireDatabase) {
              throw requiredDatabaseError(documentKey, error);
            }
            // A non-strict local deployment can continue from its known-good state.
          }

          return fileValue;
        }

        return databaseValue;
      } catch (error) {
        if (requireDatabase) {
          throw requiredDatabaseError(documentKey, error);
        }

        return readStateFile(resolvedPath, normalizedInitialValue);
      }
    },
    async write(nextValue) {
      if (!useDatabase) {
        writeStateFile(resolvedPath, nextValue, normalizedInitialValue);
        return normalizeValue(nextValue, normalizedInitialValue);
      }

      try {
        await withDatabaseRetries(() => writeDatabaseDocument({
          databaseUrl,
          documentKey,
          value: nextValue,
          initialValue: normalizedInitialValue
        }));
        writeStateFile(resolvedPath, nextValue, normalizedInitialValue);
      } catch (error) {
        if (requireDatabase) {
          throw requiredDatabaseError(documentKey, error);
        }

        writeStateFile(resolvedPath, nextValue, normalizedInitialValue);
      }

      return normalizeValue(nextValue, normalizedInitialValue);
    },
    async update(updater) {
      const currentValue = await this.read();
      const draft = cloneValue(currentValue);
      const updatedValue = (await updater(draft)) || draft;
      await this.write(updatedValue);
      return normalizeValue(updatedValue, normalizedInitialValue);
    }
  };
}

export function selectNewerSnapshot(databaseValue, fileValue) {
  const databaseTime = snapshotTimestamp(databaseValue);
  const fileTime = snapshotTimestamp(fileValue);

  if (fileTime > databaseTime) {
    return fileValue;
  }

  return databaseValue;
}

function snapshotTimestamp(value) {
  const timestamp = Date.parse(String(value?.generated_at || value?.updated_at || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function readDatabaseDocument({ databaseUrl, documentKey, initialValue }) {
  await ensureDatabaseSchema(databaseUrl);
  const sql = await getSqlClient(databaseUrl);
  const rows = await sql`SELECT payload FROM app_documents WHERE id = ${documentKey} LIMIT 1`;
  return normalizeValue(rows[0]?.payload, initialValue);
}

async function writeDatabaseDocument({ databaseUrl, documentKey, value, initialValue }) {
  await ensureDatabaseSchema(databaseUrl);
  const sql = await getSqlClient(databaseUrl);
  const payload = JSON.stringify(normalizeValue(value, initialValue));

  await sql`
    INSERT INTO app_documents (id, payload, updated_at)
    VALUES (${documentKey}, CAST(${payload} AS jsonb), NOW())
    ON CONFLICT (id)
    DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
  `;
}

async function ensureDatabaseSchema(databaseUrl) {
  const cacheKey = String(databaseUrl || "").trim();

  if (!cacheKey) {
    return;
  }

  if (!schemaReady.has(cacheKey)) {
    schemaReady.set(
      cacheKey,
      (async () => {
        const sql = await getSqlClient(cacheKey);
        await withDatabaseRetries(() => sql`
          CREATE TABLE IF NOT EXISTS app_documents (
            id TEXT PRIMARY KEY,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
      })().catch((error) => {
        schemaReady.delete(cacheKey);
        throw error;
      })
    );
  }

  return schemaReady.get(cacheKey);
}

async function withDatabaseRetries(operation) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === 2 || !isTransientDatabaseError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
  throw lastError;
}

function isTransientDatabaseError(error) {
  return /timeout|timed out|network|socket|connection|fetch failed|reset|temporar|503|504/i.test(String(error?.message || error));
}

function requiredDatabaseError(documentKey, error) {
  const detail = String(error?.message || error || "unknown database error");
  return new Error(`Document store "${documentKey}" requires Neon Postgres; JSON and memory fallback are disabled: ${detail}`);
}

async function getSqlClient(databaseUrl) {
  const cacheKey = String(databaseUrl || "").trim();

  if (!cacheKey) {
    throw new Error("DATABASE_URL is required to initialize the database-backed store.");
  }

  if (!sqlClients.has(cacheKey)) {
    const { neon } = await import("@neondatabase/serverless");
    sqlClients.set(cacheKey, neon(cacheKey));
  }

  return sqlClients.get(cacheKey);
}

function ensureStateFile(filePath, initialValue) {
  if (fs.existsSync(filePath)) {
    return true;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(normalizeValue(initialValue, initialValue), null, 2)}\n`, "utf8");
  return true;
}

function readStateFile(filePath, initialValue) {
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return normalizeValue(payload, initialValue);
  } catch {
    return cloneValue(initialValue);
  }
}

function writeStateFile(filePath, value, initialValue) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(normalizeValue(value, initialValue), null, 2)}\n`, "utf8");
}

function resolveWritablePath(preferredPath, initialValue) {
  try {
    ensureStateFile(preferredPath, initialValue);
    fs.accessSync(preferredPath, fs.constants.R_OK | fs.constants.W_OK);
    return preferredPath;
  } catch {
    const fallbackPath = path.join(os.tmpdir(), "patrick-tech-media", path.basename(preferredPath));
    ensureStateFile(fallbackPath, initialValue);
    fs.accessSync(fallbackPath, fs.constants.R_OK | fs.constants.W_OK);
    return fallbackPath;
  }
}

function normalizeValue(value, initialValue) {
  const normalizedBase = cloneValue(initialValue);

  if (Array.isArray(normalizedBase)) {
    return Array.isArray(value) ? value : normalizedBase;
  }

  if (!normalizedBase || typeof normalizedBase !== "object") {
    return value ?? normalizedBase;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return normalizedBase;
  }

  return {
    ...normalizedBase,
    ...value
  };
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function isInitialLike(value, initialValue) {
  return JSON.stringify(normalizeValue(value, initialValue)) === JSON.stringify(normalizeValue(initialValue, initialValue));
}

function isEnabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}
