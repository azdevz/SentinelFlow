/**
 * Sample Application — User Authentication Service
 */

export interface UserSession {
  userId: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
}

export class AuthService {
  private sessions = new Map<string, UserSession>();

  public createSession(token: string, session: UserSession): void {
    if (!token || token.trim().length === 0) {
      throw new Error('Invalid token provided');
    }
    this.sessions.set(token, session);
  }

  public validateToken(token: string): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }
    return token.startsWith('Bearer sf_') && token.length >= 16;
  }

  public getSession(token: string): UserSession | null {
    if (!this.validateToken(token)) {
      return null;
    }
    return this.sessions.get(token) || null;
  }
}
