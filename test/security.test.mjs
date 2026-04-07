import assert from "node:assert/strict";
import { once } from "node:events";
import { server } from "../server.mjs";

const tests = [
  {
    name: "serves login pages with security headers and csrf-protected forms",
    async run(baseUrl) {
      const response = await fetch(`${baseUrl}/vi/login`, { redirect: "manual" });
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-security-policy") || "", /default-src 'self'/);
      assert.equal(response.headers.get("x-frame-options"), "DENY");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
      assert.match(response.headers.get("permissions-policy") || "", /camera=\(\)/);
      assert.match(html, /name="csrf_token"/);
    }
  },
  {
    name: "blocks writer registration without a valid csrf token",
    async run(baseUrl) {
      const response = await fetch(`${baseUrl}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: baseUrl
        },
        body: new URLSearchParams({
          lang: "vi",
          email: "security-check@example.com",
          name: "Security Check",
          password: "strong-pass-123",
          password_confirm: "strong-pass-123"
        }),
        redirect: "manual"
      });
      const location = decodeURIComponent(response.headers.get("location") || "");

      assert.equal(response.status, 302);
      assert.match(location, /\/vi\/login/);
      assert.match(location, /Phiên biểu mẫu|form session/i);
    }
  },
  {
    name: "rejects forged cross-site login attempts even when a csrf token is copied",
    async run(baseUrl) {
      const loginPage = await fetch(`${baseUrl}/vi/login`);
      const html = await loginPage.text();
      const csrfToken = html.match(/<form class="platform-form auth-form" method="post" action="\/auth\/login">[\s\S]*?name="csrf_token" value="([^"]+)"/)?.[1];

      assert.ok(csrfToken);

      const response = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://evil.example"
        },
        body: new URLSearchParams({
          lang: "vi",
          email: "security-check@example.com",
          password: "wrong-pass",
          csrf_token: csrfToken
        }),
        redirect: "manual"
      });
      const location = decodeURIComponent(response.headers.get("location") || "");

      assert.equal(response.status, 302);
      assert.match(location, /\/vi\/login/);
      assert.match(location, /nguồn gửi biểu mẫu|form origin/i);
    }
  },
  {
    name: "rejects unsupported HTTP methods before page rendering",
    async run(baseUrl) {
      const response = await fetch(`${baseUrl}/vi/`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        }
      });
      const payload = await response.json();

      assert.equal(response.status, 405);
      assert.equal(response.headers.get("allow"), "GET, HEAD, POST, OPTIONS");
      assert.match(payload.error || "", /method not allowed/i);
    }
  },
  {
    name: "serves HEAD requests for crawlers without blocking article previews",
    async run(baseUrl) {
      const response = await fetch(`${baseUrl}/vi/`, {
        method: "HEAD"
      });

      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") || "", /text\/html/i);
    }
  },
  {
    name: "rejects abusive query strings early",
    async run(baseUrl) {
      const oversizedQuery = "q=".concat("a".repeat(2500));
      const response = await fetch(`${baseUrl}/vi/?${oversizedQuery}`);
      const payload = await response.json();

      assert.equal(response.status, 414);
      assert.match(payload.error || "", /query string is too long/i);
    }
  },
  {
    name: "throttles burst traffic on the live newsroom api",
    async run(baseUrl) {
      let limitedResponse = null;

      for (let attempt = 0; attempt < 65; attempt += 1) {
        const response = await fetch(`${baseUrl}/api/newsroom/live?lang=vi`);
        if (response.status === 429) {
          limitedResponse = response;
          break;
        }
      }

      assert.ok(limitedResponse, "Expected the live API to eventually return 429.");
      const payload = await limitedResponse.json();

      assert.equal(limitedResponse.status, 429);
      assert.ok(Number(limitedResponse.headers.get("retry-after")) >= 1);
      assert.ok(Number(limitedResponse.headers.get("x-ratelimit-limit")) >= 1);
      assert.match(payload.error || "", /live update feed|nguon live update/i);
    }
  }
];

let failed = 0;

try {
  if (!server.listening) {
    server.listen(0);
    await once(server, "listening");
  }

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  for (const entry of tests) {
    try {
      await entry.run(baseUrl);
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${entry.name}`);
      console.error(error.stack || error.message || error);
    }
  }
} finally {
  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
}

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log(`All ${tests.length} security checks passed.`);
}
