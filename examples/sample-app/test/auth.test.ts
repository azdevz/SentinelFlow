import { describe, it, expect } from 'vitest';
import { AuthService } from '../src/auth.js';

describe('AuthService', () => {
  const auth = new AuthService();

  it('validates Bearer token format correctly', () => {
    expect(auth.validateToken('Bearer sf_1234567890')).toBe(true);
    expect(auth.validateToken('invalid_token')).toBe(false);
    expect(auth.validateToken('')).toBe(false);
  });

  it('stores and retrieves session data', () => {
    const token = 'Bearer sf_secret_user_token';
    auth.createSession(token, {
      userId: 'usr_1',
      email: 'user@example.com',
      role: 'user',
    });

    const session = auth.getSession(token);
    expect(session).not.toBeNull();
    expect(session?.email).toBe('user@example.com');
  });
});
