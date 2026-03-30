import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { spawn } from "node:child_process";

const PORT = Number(process.env.OPENCLAW_OLLAMA_PROXY_PORT || 11435);
const BIND_HOST = process.env.OPENCLAW_OLLAMA_PROXY_BIND || "127.0.0.1";
const TARGET = process.env.OPENCLAW_OLLAMA_TARGET || "http://127.0.0.1:11434";
const IDLE_CONFIG_PATH = path.join(process.cwd(), "openclaw-idle-mode.json");
const LOG_DIR = path.join(process.cwd(), "tmp-ollama-proxy");
const LOG_FILE = path.join(LOG_DIR, "last-request.json");
const MODE = process.env.OPENCLAW_OLLAMA_PROXY_MODE || "slim";

fs.mkdirSync(LOG_DIR, { recursive: true });

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function slimMessages(messages) {
  if (!Array.isArray(messages)) return messages;
  const lastUser = [...messages].reverse().find((entry) => entry?.role === "user");
  if (!lastUser) return messages;
  return [
    {
      role: "system",
      content:
        "You are a concise assistant. Answer directly and avoid extra reasoning unless needed.",
    },
    lastUser,
  ];
}

function requestUpstreamDirect(targetUrl, reqMethod, reqHeaders, reqBody) {
  return new Promise((resolve, reject) => {
    const transport = targetUrl.protocol === "https:" ? https : http;
    const headers = Object.fromEntries(reqHeaders.entries());
    if (typeof reqBody === "string" || Buffer.isBuffer(reqBody)) {
      headers["content-length"] = String(Buffer.byteLength(reqBody));
    }

    const upstream = transport.request(
      targetUrl,
      {
        method: reqMethod,
        headers,
      },
      (upstreamRes) => {
        const chunks = [];
        upstreamRes.on("data", (chunk) => chunks.push(chunk));
        upstreamRes.on("end", () => {
          resolve({
            status: upstreamRes.statusCode ?? 500,
            headers: upstreamRes.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );

    upstream.on("error", reject);
    if (reqBody) upstream.write(reqBody);
    upstream.end();
  });
}

function shouldUseWslFallback(targetUrl, error) {
  if (process.platform !== "win32") return false;
  if (
    targetUrl.hostname !== "127.0.0.1" &&
    targetUrl.hostname !== "localhost"
  ) {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /(ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|aborted)/i.test(
    message,
  );
}

function readIdleConfig() {
  try {
    return JSON.parse(fs.readFileSync(IDLE_CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

function wakeWslOllamaIfNeeded() {
  const config = readIdleConfig();
  if (config?.wakeLocalOllamaInBackground !== false) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const child = spawn(
      "wsl.exe",
      [
        "-e",
        "bash",
        "-lc",
        "systemctl is-active ollama >/dev/null 2>&1 || systemctl start ollama >/dev/null 2>&1 || true",
      ],
      {
        stdio: "ignore",
        windowsHide: true,
      },
    );
    child.on("error", () => resolve());
    child.on("close", () => resolve());
  });
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function requestUpstreamViaWsl(targetUrl, reqMethod, reqBody) {
  return new Promise((resolve, reject) => {
    const hasBody =
      typeof reqBody === "string" || Buffer.isBuffer(reqBody)
        ? Buffer.byteLength(reqBody) > 0
        : false;
    const curlParts = [
      "status=0",
      hasBody ? "body_file=$(mktemp)" : "",
      hasBody ? "cat > \"$body_file\"" : "",
      `response=$(curl -sS -X ${shellQuote(reqMethod)} ${
        hasBody
          ? `-H 'content-type: application/json' --data-binary @"$body_file" `
          : ""
      }${shellQuote(targetUrl.toString())} -w '\\n__STATUS__:%{http_code}') || status=$?`,
      hasBody ? "rm -f \"$body_file\"" : "",
      "if [ \"$status\" -ne 0 ]; then",
      "  printf '%s' \"$response\" >&2",
      "  exit \"$status\"",
      "fi",
      "printf '%s' \"$response\"",
    ]
      .filter(Boolean)
      .join("\n");

    const child = spawn("wsl.exe", ["-e", "bash", "-lc", curlParts], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        const message = Buffer.concat(stderr).toString("utf8").trim();
        reject(new Error(message || `wsl curl exited with code ${code}`));
        return;
      }

      const raw = Buffer.concat(stdout).toString("utf8");
      const match = raw.match(/\n__STATUS__:(\d{3})$/);
      if (!match || match.index === undefined) {
        reject(new Error("wsl curl response missing status trailer"));
        return;
      }

      const status = Number(match[1]);
      const body = raw.slice(0, match.index);
      resolve({
        status,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: Buffer.from(body, "utf8"),
      });
    });

    if (hasBody) child.stdin.end(reqBody);
    else child.stdin.end();
  });
}

async function requestUpstream(targetUrl, reqMethod, reqHeaders, reqBody) {
  try {
    return await requestUpstreamDirect(targetUrl, reqMethod, reqHeaders, reqBody);
  } catch (error) {
    if (!shouldUseWslFallback(targetUrl, error)) throw error;
    await wakeWslOllamaIfNeeded();
    try {
      return await requestUpstreamDirect(targetUrl, reqMethod, reqHeaders, reqBody);
    } catch (retryError) {
      if (!shouldUseWslFallback(targetUrl, retryError)) throw retryError;
    }
    return requestUpstreamViaWsl(targetUrl, reqMethod, reqBody);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString("utf8");
    let parsed = null;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      parsed = null;
    }

    const logPayload = {
      time: new Date().toISOString(),
      method: req.method,
      url: req.url,
      mode: MODE,
      headers: req.headers,
      body: parsed ?? rawBody,
    };
    fs.writeFileSync(LOG_FILE, JSON.stringify(logPayload, null, 2));

    const targetUrl = new URL(req.url || "/", TARGET);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value !== "string") continue;
      const lower = key.toLowerCase();
      if (
        lower === "host" ||
        lower === "connection" ||
        lower === "content-length" ||
        lower === "transfer-encoding" ||
        lower === "expect"
      ) {
        continue;
      }
      headers.set(key, value);
    }

    let forwardBody = rawBody;
    if (MODE === "slim" && parsed && req.url === "/api/chat") {
      const next = {
        ...parsed,
        messages: slimMessages(parsed.messages),
        options: {
          ...(parsed.options && typeof parsed.options === "object"
            ? parsed.options
            : {}),
          num_ctx: 4096,
        },
      };
      delete next.tools;
      delete next.stream;
      next.stream = false;
      forwardBody = JSON.stringify(next);
      fs.writeFileSync(
        path.join(LOG_DIR, "last-forwarded.json"),
        JSON.stringify(next, null, 2),
      );

      res.writeHead(200, {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "transfer-encoding": "chunked",
      });

      const heartbeat = {
        model: next.model,
        created_at: new Date().toISOString(),
        message: { role: "assistant", content: "" },
        done: false,
      };
      res.write(`${JSON.stringify(heartbeat)}\n`);

      const keepAlive = setInterval(() => {
        res.write(`${JSON.stringify(heartbeat)}\n`);
      }, 5000);

      try {
        const upstream = await requestUpstream(
          targetUrl,
          req.method,
          headers,
          forwardBody,
        );
        if (upstream.status < 200 || upstream.status >= 300) {
          throw new Error(
            `upstream ${upstream.status}: ${upstream.body.toString("utf8")}`,
          );
        }
        const finalJson = JSON.parse(upstream.body.toString("utf8"));
        res.write(`${JSON.stringify(finalJson)}\n`);
        res.end();
      } catch (error) {
        const finalJson = {
          model: next.model,
          created_at: new Date().toISOString(),
          message: {
            role: "assistant",
            content: `Proxy error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
          done: true,
          done_reason: "error",
        };
        res.write(`${JSON.stringify(finalJson)}\n`);
        res.end();
      } finally {
        clearInterval(keepAlive);
      }
      return;
    }

    const upstream = await requestUpstream(
      targetUrl,
      req.method,
      headers,
      req.method === "GET" || req.method === "HEAD" ? undefined : forwardBody,
    );
    const responseBody = upstream.body;
    const responseHeaders = {};
    for (const [key, value] of Object.entries(upstream.headers)) {
      if (Array.isArray(value)) responseHeaders[key] = value.join(", ");
      else if (typeof value === "string") responseHeaders[key] = value;
    }
    res.writeHead(upstream.status, responseHeaders);
    res.end(responseBody);
  } catch (error) {
    json(res, 500, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, BIND_HOST, () => {
  console.log(
    JSON.stringify({
      port: PORT,
      bind: BIND_HOST,
      target: TARGET,
      mode: MODE,
      logFile: LOG_FILE,
    }),
  );
});
