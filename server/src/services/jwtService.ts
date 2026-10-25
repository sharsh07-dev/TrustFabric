import crypto from 'crypto';
import type { AuthUser, UserRole } from '../types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'trustfabric_super_secure_jwt_secret_cascade26_ps42_2026';

export class JwtService {
  private static instance: JwtService;

  public static getInstance(): JwtService {
    if (!JwtService.instance) {
      JwtService.instance = new JwtService();
    }
    return JwtService.instance;
  }

  public signToken(user: Omit<AuthUser, 'iat' | 'exp'>, expiresInSeconds: number = 86400): string {
    const now = Math.floor(Date.now() / 1000);
    const payload: AuthUser = {
      ...user,
      iat: now,
      exp: now + expiresInSeconds,
    };

    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(dataToSign)
      .digest('base64url');

    return `${dataToSign}.${signature}`;
  }

  public verifyToken(token: string): { valid: boolean; user?: AuthUser; error?: string } {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'Malformed JWT token format' };
      }

      const [encodedHeader, encodedPayload, signature] = parts;
      const dataToSign = `${encodedHeader}.${encodedPayload}`;

      const expectedSignature = crypto
        .createHmac('sha256', JWT_SECRET)
        .update(dataToSign)
        .digest('base64url');

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return { valid: false, error: 'Invalid cryptographic signature' };
      }

      const payload: AuthUser = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
      const now = Math.floor(Date.now() / 1000);

      if (payload.exp && payload.exp < now) {
        return { valid: false, error: 'JWT session token has expired' };
      }

      return { valid: true, user: payload };
    } catch (err: any) {
      return { valid: false, error: err.message || 'JWT verification failed' };
    }
  }
}
