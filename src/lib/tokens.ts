import { randomBytes, createHmac } from 'crypto';

const TOKEN_SECRET_MISSING_ERROR = 'Missing TOKEN_HASH_SECRET environment variable.';

function getTokenSecret(): string {
  const tokenSecret = process.env.TOKEN_HASH_SECRET;
  if (!tokenSecret) {
    throw new Error(TOKEN_SECRET_MISSING_ERROR);
  }

  return tokenSecret;
}

export function assertTokenHashingConfigured() {
  getTokenSecret();
}

export function isTokenHashingConfigError(error: unknown): error is Error {
  return error instanceof Error && error.message === TOKEN_SECRET_MISSING_ERROR;
}

/**
 * Generate a cryptographically secure random token (32 bytes, hex-encoded).
 */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a token using HMAC SHA-256 with a server secret.
 * Only the hash is stored in the database; the plaintext token is sent to the supplier.
 */
export function hashToken(token: string): string {
  return createHmac('sha256', getTokenSecret()).update(token).digest('hex');
}

/**
 * Verify a token by comparing its hash to the stored hash.
 */
export function verifyToken(token: string, storedHash: string): boolean {
  const computedHash = hashToken(token);
  // Constant-time comparison to prevent timing attacks
  if (computedHash.length !== storedHash.length) return false;
  let result = 0;
  for (let i = 0; i < computedHash.length; i++) {
    result |= computedHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return result === 0;
}
