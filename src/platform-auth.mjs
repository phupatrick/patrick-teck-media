import crypto from "node:crypto";

const SESSION_COOKIE = "ptm_session";
const SECURE_SESSION_COOKIE = "__Host-ptm_session";
const GOOGLE_STATE_COOKIE = "ptm_google_state";
const SECURE_GOOGLE_STATE_COOKIE = "__Host-ptm_google_state";

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || !password) {
    return false;
  }

  const [salt, expectedHash] = String(storedHash).split(":");

  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto.scryptSync(password, salt, 64).toString("hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(actualHash, "hex");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function parseCookies(headerValue = "") {
  return String(headerValue)
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((cookies, pair) => {
      const separator = pair.indexOf("=");
      if (separator === -1) {
        return cookies;
      }
      const key = decodeURIComponent(pair.slice(0, separator).trim());
      const value = decodeURIComponent(pair.slice(separator + 1).trim());
      cookies[key] = value;
      return cookies;
    }, {});
}

export function readSessionUserId(req, sessionSecret) {
  const cookies = parseCookies(req.headers.cookie || "");
  const payload = verifySignedToken(readNamedCookie(cookies, [SECURE_SESSION_COOKIE, SESSION_COOKIE]), sessionSecret);
  return payload?.userId || null;
}

export function setSessionCookie(res, userId, sessionSecret, maxAgeSeconds = 60 * 60 * 24 * 14, cookieOptions = {}) {
  const token = createSignedToken(
    {
      userId,
      exp: Math.floor(Date.now() / 1000) + maxAgeSeconds
    },
    sessionSecret
  );
  const cookieName = cookieOptions.secure ? SECURE_SESSION_COOKIE : SESSION_COOKIE;

  appendCookie(
    res,
    serializeCookie(cookieName, token, {
      maxAge: maxAgeSeconds,
      expires: new Date(Date.now() + maxAgeSeconds * 1000),
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      priority: "High",
      secure: Boolean(cookieOptions.secure)
    })
  );
}

export function clearSessionCookie(res, cookieOptions = {}) {
  clearCookieByNames(res, [SESSION_COOKIE, SECURE_SESSION_COOKIE], cookieOptions, "Lax");
}

export function createGoogleStateValue(sessionSecret) {
  return createSignedToken(
    {
      nonce: crypto.randomBytes(12).toString("hex"),
      exp: Math.floor(Date.now() / 1000) + 600
    },
    sessionSecret
  );
}

export function setGoogleStateCookie(res, value, cookieOptions = {}) {
  const cookieName = cookieOptions.secure ? SECURE_GOOGLE_STATE_COOKIE : GOOGLE_STATE_COOKIE;
  appendCookie(
    res,
    serializeCookie(cookieName, value, {
      maxAge: 600,
      expires: new Date(Date.now() + 600_000),
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      priority: "High",
      secure: Boolean(cookieOptions.secure)
    })
  );
}

export function readGoogleState(req, sessionSecret) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = readNamedCookie(cookies, [SECURE_GOOGLE_STATE_COOKIE, GOOGLE_STATE_COOKIE]);
  const payload = verifySignedToken(token, sessionSecret);
  return payload ? { ...payload, token } : null;
}

export function clearGoogleStateCookie(res, cookieOptions = {}) {
  clearCookieByNames(res, [GOOGLE_STATE_COOKIE, SECURE_GOOGLE_STATE_COOKIE], cookieOptions, "Lax");
}

export function createCsrfToken(pathname, sessionSecret, userId = null, maxAgeSeconds = 60 * 60 * 2) {
  return createSignedToken(
    {
      scope: "csrf",
      pathname,
      userId: userId || null,
      exp: Math.floor(Date.now() / 1000) + maxAgeSeconds
    },
    sessionSecret
  );
}

export function verifyCsrfToken(token, sessionSecret, pathname, userId = null) {
  const payload = verifySignedToken(token, sessionSecret);

  return Boolean(
    payload &&
      payload.scope === "csrf" &&
      payload.pathname === pathname &&
      (payload.userId || null) === (userId || null)
  );
}

export function buildGoogleAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "select_account",
    state
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode({ code, redirectUri, clientId, clientSecret }) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });

  if (!tokenResponse.ok) {
    throw new Error(`Google token exchange failed (${tokenResponse.status})`);
  }

  const tokenPayload = await tokenResponse.json();
  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`
    }
  });

  if (!userResponse.ok) {
    throw new Error(`Google userinfo failed (${userResponse.status})`);
  }

  return userResponse.json();
}

function createSignedToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifySignedToken(token, secret) {
  if (!token || !secret || !String(token).includes(".")) {
    return null;
  }

  const [body, signature] = String(token).split(".");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (!signature || signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  if (options.secure) {
    parts.push("Secure");
  }

  if (options.priority) {
    parts.push(`Priority=${options.priority}`);
  }

  return parts.join("; ");
}

function readNamedCookie(cookies, names) {
  for (const name of names) {
    if (cookies[name]) {
      return cookies[name];
    }
  }

  return "";
}

function clearCookieByNames(res, names, cookieOptions, sameSite) {
  for (const name of names) {
    appendCookie(
      res,
      serializeCookie(name, "", {
        maxAge: 0,
        expires: new Date(0),
        httpOnly: true,
        sameSite,
        path: "/",
        priority: "High",
        secure: name.startsWith("__Host-") ? true : Boolean(cookieOptions.secure)
      })
    );
  }
}

function appendCookie(res, cookieValue) {
  const current = res.getHeader("Set-Cookie");

  if (!current) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }

  if (Array.isArray(current)) {
    res.setHeader("Set-Cookie", [...current, cookieValue]);
    return;
  }

  res.setHeader("Set-Cookie", [current, cookieValue]);
}
