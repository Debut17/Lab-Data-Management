import crypto from 'node:crypto';

const TOKEN_TTL_SECONDS = 60 * 60;

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function signaturesMatch(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function createSessionService({
  secret,
  ttlSeconds = TOKEN_TTL_SECONDS,
  now = () => Date.now(),
}) {
  if (!secret) {
    throw new Error('A session secret is required.');
  }

  return {
    issue(user) {
      const payload = Buffer.from(
        JSON.stringify({
          sub: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          exp: Math.floor(now() / 1000) + ttlSeconds,
        }),
      ).toString('base64url');

      return `${payload}.${sign(payload, secret)}`;
    },

    verify(token) {
      if (typeof token !== 'string') {
        return null;
      }

      const [payload, signature, extra] = token.split('.');
      if (!payload || !signature || extra) {
        return null;
      }

      const expectedSignature = sign(payload, secret);
      if (!signaturesMatch(signature, expectedSignature)) {
        return null;
      }

      try {
        const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (
          typeof session.sub !== 'string' ||
          typeof session.email !== 'string' ||
          typeof session.role !== 'string' ||
          typeof session.exp !== 'number' ||
          session.exp <= Math.floor(now() / 1000)
        ) {
          return null;
        }
        return session;
      } catch {
        return null;
      }
    },
  };
}

export function readCookie(request, name) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(';')) {
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }
    const key = cookie.slice(0, separatorIndex).trim();
    if (key === name) {
      return decodeURIComponent(cookie.slice(separatorIndex + 1).trim());
    }
  }
  return null;
}
