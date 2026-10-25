import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import app from '../src/index.js';
import { JwtService } from '../src/services/jwtService.js';
import { STANDARD_PERSONAS } from '../src/routes/authRoutes.js';

describe('TrustFabric RBAC & JWT Bearer Token Security Suite', () => {
  const jwtService = JwtService.getInstance();

  let server: Server;
  let baseUrl: string;
  let donorToken: string;
  let adminToken: string;
  let auditorToken: string;

  beforeAll(async () => {
    // Start ephemeral server on random available port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });

    donorToken = jwtService.signToken(STANDARD_PERSONAS.AARAV_DONOR);
    adminToken = jwtService.signToken(STANDARD_PERSONAS.MEERA_ADMIN);
    auditorToken = jwtService.signToken(STANDARD_PERSONAS.JUDGE_AUDITOR);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('1. JWT Generation, Signature, and Profile Verification', () => {
    it('generates a valid RFC 7519 HS256 JWT for standard personas via /api/auth/login', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona: 'AARAV_DONOR' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.token).toBeDefined();
      expect(data.tokenType).toBe('Bearer');
      expect(data.user.role).toBe('DONOR');
      expect(data.user.name).toBe('Aarav Sharma');

      const verification = jwtService.verifyToken(data.token);
      expect(verification.valid).toBe(true);
      expect(verification.user?.role).toBe('DONOR');
    });

    it('rejects tampered or forged JWT signatures', () => {
      const parts = donorToken.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ ...STANDARD_PERSONAS.AARAV_DONOR, role: 'ADMIN' })
      ).toString('base64url');
      const forgedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const verification = jwtService.verifyToken(forgedToken);
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('Invalid cryptographic signature');
    });

    it('returns authenticated user profile via /api/auth/me when Bearer token is provided', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${donorToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.authenticated).toBe(true);
      expect(data.user.role).toBe('DONOR');
      expect(data.permissions.canAuthorizeEscrow).toBe(false);
      expect(data.permissions.canReviewApplications).toBe(false);
    });

    it('rejects unauthenticated requests with 401 Unauthorized when Bearer token is missing', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('2. Role-Based Access Control (RBAC) Guard Enforcement', () => {
    it('STRICTLY RETURNS 403 Forbidden when a DONOR attempts to review/approve an NGO application', async () => {
      const res = await fetch(`${baseUrl}/api/ngo/applications/ngo-app-001/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${donorToken}`,
        },
        body: JSON.stringify({
          decision: 'APPROVED',
          notes: 'Unauthorized approval attempt by public donor',
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('ROLE_FORBIDDEN');
      expect(data.userRole).toBe('DONOR');
      expect(data.error).toContain('is not authorized to perform this operation');
      expect(data.requiredRoles).toContain('ADMIN');
      expect(data.requiredRoles).toContain('AUDITOR');
    });

    it('STRICTLY RETURNS 403 Forbidden when a DONOR attempts to authorize smart contract escrow funding release', async () => {
      const res = await fetch(`${baseUrl}/api/ngo/applications/ngo-app-001/authorize-funding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${donorToken}`,
        },
        body: JSON.stringify({
          trancheId: 'tranche-001',
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe('ROLE_FORBIDDEN');
      expect(data.userRole).toBe('DONOR');
      expect(data.error).toContain('is not authorized to perform this operation');
    });

    it('ALLOWS an authenticated ADMIN to review applications', async () => {
      const res = await fetch(`${baseUrl}/api/ngo/applications/ngo-app-001/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          decision: 'APPROVED',
          notes: 'Authorized approval by verified NGO Lead',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.application).toBeDefined();
      expect(data.application.verificationStatus).toBe('APPROVED');
    });

    it('ALLOWS an authenticated AUDITOR to authorize escrow funding release when compliant', async () => {
      const res = await fetch(`${baseUrl}/api/ngo/applications/ngo-app-001/authorize-funding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auditorToken}`,
        },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.escrowAuthorization.blockchainStatus).toBe('ESCROW_RELEASED');
      expect(data.escrowAuthorization.authorizerRole).toBe('AUDITOR');
    });
  });
});
