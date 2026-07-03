import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertTokenHashingConfigured,
  generateToken,
  hashToken,
  isTokenHashingConfigError,
} from '@/lib/tokens';

const ORIGINAL_SECRET = process.env.TOKEN_HASH_SECRET;

beforeEach(() => {
  process.env.TOKEN_HASH_SECRET = 'test-secret';
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.TOKEN_HASH_SECRET;
  } else {
    process.env.TOKEN_HASH_SECRET = ORIGINAL_SECRET;
  }
});

describe('generateToken', () => {
  it('produces 64-char lowercase hex tokens', () => {
    const token = generateToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces unique tokens', () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe('hashToken', () => {
  // Outstanding magic links depend on this hash staying stable: the stored
  // token_hash must keep matching the emailed token for the same secret.
  it('is deterministic for the same token and secret', () => {
    const token = 'a'.repeat(64);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when the secret changes', () => {
    const token = 'a'.repeat(64);
    const first = hashToken(token);
    process.env.TOKEN_HASH_SECRET = 'another-secret';
    expect(hashToken(token)).not.toBe(first);
  });

  it('matches the known HMAC-SHA256 golden value', () => {
    // hmac_sha256(key='test-secret', message='a'*64)
    expect(hashToken('a'.repeat(64))).toBe(
      'bfe0b61defe3a061076a3ab74be1508d8893fc77f57b9c8edd9e09ab8342ee00'
    );
  });
});

describe('assertTokenHashingConfigured', () => {
  it('throws a recognizable config error when the secret is missing', () => {
    delete process.env.TOKEN_HASH_SECRET;

    try {
      assertTokenHashingConfigured();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(isTokenHashingConfigError(error)).toBe(true);
    }
  });
});
