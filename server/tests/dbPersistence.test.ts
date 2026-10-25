import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import app from '../src/index.js';
import { JwtService } from '../src/services/jwtService.js';

describe('TrustFabric Cloud Database Persistence & Schema Suite (PostgreSQL / Supabase)', () => {
  let server: Server;
  let baseUrl: string;
  let adminToken: string;
  let donorToken: string;

  beforeAll(async () => {
    // Start ephemeral server on dynamic port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });

    adminToken = JwtService.getInstance().signToken({
      sub: 'usr-meera-admin-002',
      email: 'meera.patel@trustfabric.org',
      name: 'Meera Patel',
      role: 'ADMIN',
      organizationId: 'org-trustfabric-core',
      permissions: ['ALL'],
    });

    donorToken = JwtService.getInstance().signToken({
      sub: 'usr-aarav-donor-001',
      email: 'aarav.sharma@example.org',
      name: 'Aarav Sharma',
      role: 'DONOR',
      organizationId: 'org-individual-donors',
      permissions: ['DONATION_CREATE', 'AUDIT_READ'],
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('1. GET /api/db/status returns persistence provider status & pooler details', async () => {
    const res = await fetch(`${baseUrl}/api/db/status`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.provider).toBeDefined();
    expect(body.databaseUrlMasked).toContain('postgresql://postgres.rolfeyepqzricdgfprev');
    expect(body.usersCount).toBeGreaterThanOrEqual(4);
    expect(body.grantsCount).toBeGreaterThanOrEqual(3);
  });

  it('2. GET /api/db/users returns persisted users across all roles', async () => {
    const res = await fetch(`${baseUrl}/api/db/users`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(Array.isArray(body.users)).toBe(true);

    const roles = body.users.map((u: any) => u.role);
    expect(roles).toContain('DONOR');
    expect(roles).toContain('ADMIN');
    expect(roles).toContain('AUDITOR');
    expect(roles).toContain('VENDOR');
  });

  it('3. GET /api/db/grants returns active grants and purpose allocations', async () => {
    const res = await fetch(`${baseUrl}/api/db/grants`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.grants.length).toBeGreaterThanOrEqual(3);
    const codes = body.grants.map((g: any) => g.grantCode);
    expect(codes).toContain('CW-2026-014');
  });

  it('4. POST /api/db/claims successfully records an expense claim with nullifier', async () => {
    const nullifier = `0x_nullifier_${Date.now()}_test_claim`;
    const res = await fetch(`${baseUrl}/api/db/claims`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        claimCode: `CLM-${Date.now()}`,
        grantId: 'grant-cw-2026-014',
        submitterId: 'usr-ravi-vendor-004',
        amountPaise: 4500000,
        currency: 'INR',
        vendorName: 'Apex Solar Pumps Ltd',
        invoiceNumber: 'INV-2026-8819',
        nullifierHash: nullifier,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.claim.nullifierHash).toBe(nullifier);
  });

  it('5. POST /api/db/claims rejects duplicate expense claims with 409 Conflict', async () => {
    const collisionNullifier = '0x_collision_shared_nullifier_abc123';

    // First submission
    const res1 = await fetch(`${baseUrl}/api/db/claims`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        claimCode: `CLM-ORIGINAL-${Date.now()}`,
        grantId: 'grant-cw-2026-014',
        submitterId: 'usr-ravi-vendor-004',
        amountPaise: 5000000,
        currency: 'INR',
        vendorName: 'Apex Solar Pumps Ltd',
        invoiceNumber: 'INV-DUP-1',
        nullifierHash: collisionNullifier,
      }),
    });
    expect(res1.status).toBe(201);

    // Second submission with colliding nullifier
    const res2 = await fetch(`${baseUrl}/api/db/claims`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        claimCode: `CLM-DUPLICATE-${Date.now()}`,
        grantId: 'grant-cw-2026-014',
        submitterId: 'usr-ravi-vendor-004',
        amountPaise: 5000000,
        currency: 'INR',
        vendorName: 'Apex Solar Pumps Ltd',
        invoiceNumber: 'INV-DUP-2',
        nullifierHash: collisionNullifier,
      }),
    });

    expect(res2.status).toBe(409);
    const body2 = await res2.json();
    expect(body2.success).toBe(false);
    expect(body2.code).toBe('DUPLICATE_NULLIFIER_COLLISION');
  });

  it('6. GET /api/db/audit-chain returns sequential SHA-256 cryptographic chain', async () => {
    const res = await fetch(`${baseUrl}/api/db/audit-chain`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.blockCount).toBeGreaterThanOrEqual(1);

    const genesis = body.blocks[0];
    expect(genesis.sequenceNumber).toBe(1);
    expect(genesis.eventHash).toBeDefined();
    expect(genesis.prevEventHash).toBe('0'.repeat(64));
  });
});
