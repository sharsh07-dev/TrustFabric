import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import app from '../src/index.js';
import { ClerkService } from '../src/services/clerkService.js';
import { JwtService } from '../src/services/jwtService.js';
import { DbPersistenceService } from '../src/services/dbPersistenceService.js';

let server: http.Server;
let baseUrl: string;
const clerkService = ClerkService.getInstance();
const jwtService = JwtService.getInstance();
const dbPersistence = DbPersistenceService.getInstance();

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      baseUrl = `http://localhost:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe('TrustFabric Clerk Authentication & RBAC Suite', () => {
  it('1. Rejects missing Authorization header with 401 AUTH_REQUIRED', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('AUTH_REQUIRED');
  });

  it('2. Rejects malformed or tampered Bearer token with 401 TOKEN_INVALID', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.tampered.token' },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('TOKEN_INVALID');
  });

  it('3. Successfully authenticates valid persona token and returns role permissions', async () => {
    // Generate valid signed token for Meera Admin
    const token = jwtService.signToken({
      id: 'usr-admin-002',
      name: 'Meera Patel',
      email: 'meera.admin@jaljeevan-relief.org',
      role: 'ADMIN',
      organizationId: 'ngo-jal-jeevan',
    });

    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.user.role).toBe('ADMIN');
    expect(body.permissions.canReviewApplications).toBe(true);
    expect(body.permissions.canAuthorizeEscrow).toBe(true);
  });

  it('4. Enforces Role-Based Access Control (RBAC): Rejects DONOR from admin endpoints with 403 ROLE_FORBIDDEN', async () => {
    const donorToken = jwtService.signToken({
      id: 'usr-donor-001',
      name: 'Aarav Sharma',
      email: 'aarav.donor@trustfabric.org',
      role: 'DONOR',
      organizationId: 'donor-northstar-fund',
    });

    // Attempting privileged NGO review
    const res = await fetch(`${baseUrl}/api/ngo/applications/app-demo-001/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${donorToken}`,
      },
      body: JSON.stringify({
        decision: 'APPROVED',
        notes: 'Privilege escalation attempt by donor',
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('ROLE_FORBIDDEN');
  });

  it('5. Strictly rejects privilege escalation from request body (reviewerRole injection)', async () => {
    const donorToken = jwtService.signToken({
      id: 'usr-donor-001',
      name: 'Aarav Sharma',
      email: 'aarav.donor@trustfabric.org',
      role: 'DONOR',
    });

    // Injected reviewerRole: 'ADMIN' in request body must NOT override token's DONOR role
    const res = await fetch(`${baseUrl}/api/ngo/applications/app-demo-001/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${donorToken}`,
      },
      body: JSON.stringify({
        reviewerRole: 'ADMIN',
        reviewer: 'Spoofed Admin',
        decision: 'APPROVED',
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('ROLE_FORBIDDEN');
    expect(body.userRole).toBe('DONOR');
  });

  it('6. Idempotent Clerk user sync assigns default DONOR role (least privilege)', async () => {
    const testClerkId = 'user_clerk_test_donor_999';
    const testEmail = 'new.signup.clerk@example.com';

    const syncedUser = await dbPersistence.syncClerkUser({
      clerkUserId: testClerkId,
      email: testEmail,
      name: 'New Clerk Signup',
    });

    expect(syncedUser.clerkUserId).toBe(testClerkId);
    expect(syncedUser.role).toBe('DONOR'); // Safe least privilege

    // Idempotent re-sync returns same user without changing privileges
    const duplicateSync = await dbPersistence.syncClerkUser({
      clerkUserId: testClerkId,
      email: testEmail,
      name: 'Tampered Name',
    });
    expect(duplicateSync.id).toBe(syncedUser.id);
    expect(duplicateSync.role).toBe('DONOR');
  });

  it('7. Idempotent Clerk Webhook processing detects and skips duplicate svix-id', async () => {
    const eventId = 'evt_test_unique_svix_001';
    const firstCall = await clerkService.handleWebhookEvent(eventId, 'user.created', {
      id: 'user_clerk_wh_001',
      primary_email_address_id: 'email_1',
      email_addresses: [{ id: 'email_1', email_address: 'webhook.user@example.com' }],
      first_name: 'Webhook',
      last_name: 'User',
    });

    expect(firstCall.handled).toBe(true);

    // Duplicate webhook with same eventId
    const secondCall = await clerkService.handleWebhookEvent(eventId, 'user.created', {
      id: 'user_clerk_wh_001',
    });

    expect(secondCall.handled).toBe(true);
    expect(secondCall.reason).toContain('Duplicate event ignored');
  });
});
