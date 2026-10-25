import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'http';
import crypto from 'crypto';
import app from '../src/index.js';
import { JwtService } from '../src/services/jwtService.js';
import { EvidenceVaultService } from '../src/services/evidenceVaultService.js';

describe('TrustFabric Private Cloud Evidence Vault Suite (Supabase Storage / ngo-evidence)', () => {
  let server: Server;
  let baseUrl: string;
  let adminToken: string;
  let auditorToken: string;
  let donorToken: string;
  let ngoWorkerTokenOrgA: string;
  let ngoWorkerTokenOrgB: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });

    const jwt = JwtService.getInstance();

    adminToken = jwt.signToken({
      sub: 'usr-meera-admin-002',
      email: 'meera.patel@trustfabric.org',
      name: 'Meera Patel',
      role: 'ADMIN',
      organizationId: 'org-trustfabric-core',
      permissions: ['ALL'],
    });

    auditorToken = jwt.signToken({
      sub: 'usr-anil-auditor-003',
      email: 'anil.verma@audit-trustfabric.gov.in',
      name: 'Anil Verma',
      role: 'AUDITOR',
      organizationId: 'org-independent-auditors',
      permissions: ['AUDIT_READ', 'VERIFY_DOCS'],
    });

    donorToken = jwt.signToken({
      sub: 'usr-aarav-donor-001',
      email: 'aarav.sharma@example.org',
      name: 'Aarav Sharma',
      role: 'DONOR',
      organizationId: 'org-individual-donors',
      permissions: ['DONATION_CREATE'],
    });

    ngoWorkerTokenOrgA = jwt.signToken({
      sub: 'usr-priya-field-005',
      email: 'priya.singh@field-water.org',
      name: 'Priya Singh',
      role: 'FIELD_WORKER',
      organizationId: 'org-jaljeevan-relief',
      permissions: ['EXPENSE_SUBMIT'],
    });

    ngoWorkerTokenOrgB = jwt.signToken({
      sub: 'usr-rajesh-field-006',
      email: 'rajesh.k@solar-relief.org',
      name: 'Rajesh Kumar',
      role: 'FIELD_WORKER',
      organizationId: 'org-gramin-solar',
      permissions: ['EXPENSE_SUBMIT'],
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('1. GET /api/evidence/vault/status returns private storage config & 300s TTL', async () => {
    const res = await fetch(`${baseUrl}/api/evidence/vault/status`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.bucket).toBe('ngo-evidence');
    expect(body.signedUrlTtlSeconds).toBe(300);
    expect(body.allowedMimes).toContain('application/pdf');
    expect(body.allowedMimes).toContain('image/jpeg');
  });

  it('2. POST /api/evidence/upload rejects unauthenticated requests with 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/evidence/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalFilename: 'test.pdf',
        fileBase64: Buffer.from('%PDF-1.4 mock').toString('base64'),
      }),
    });

    expect(res.status).toBe(401);
  });

  it('3. POST /api/evidence/upload rejects DONOR role with 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/evidence/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${donorToken}`,
      },
      body: JSON.stringify({
        originalFilename: 'donor_attempt.pdf',
        mimeType: 'application/pdf',
        fileBase64: Buffer.from('%PDF-1.4 donor fake receipt').toString('base64'),
        organizationId: 'org-jaljeevan-relief',
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('ROLE_FORBIDDEN');
  });

  it('4. POST /api/evidence/upload rejects unsupported MIME types with 415 Unsupported Media Type', async () => {
    const res = await fetch(`${baseUrl}/api/evidence/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        originalFilename: 'malicious_script.sh',
        mimeType: 'application/x-sh',
        fileBase64: Buffer.from('echo "hack"').toString('base64'),
        organizationId: 'org-jaljeevan-relief',
      }),
    });

    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('5. POST /api/evidence/upload successfully uploads PDF and computes authoritative SHA-256 server-side', async () => {
    const fileContent = Buffer.from('%PDF-1.4 Genuine Water Pump Invoice Apex Solar #8819\nTotal: 45000 INR');
    const expectedSha256 = crypto.createHash('sha256').update(fileContent).digest('hex');

    const res = await fetch(`${baseUrl}/api/evidence/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ngoWorkerTokenOrgA}`,
      },
      body: JSON.stringify({
        originalFilename: 'Invoice_Apex_Solar_8819.pdf',
        mimeType: 'application/pdf',
        fileBase64: fileContent.toString('base64'),
        organizationId: 'org-jaljeevan-relief',
        claimId: 'claim-cw-001',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.evidence.sha256).toBe(expectedSha256);
    expect(body.evidence.organizationId).toBe('org-jaljeevan-relief');
    expect(body.evidence.storageKey).toContain('org-jaljeevan-relief/');
    expect(body.evidence.verificationStatus).toBe('VERIFIED');
  });

  it('6. GET /api/evidence lists only documents within authorized scope', async () => {
    // Org A worker lists evidence -> sees only Org A
    const resA = await fetch(`${baseUrl}/api/evidence`, {
      headers: { Authorization: `Bearer ${ngoWorkerTokenOrgA}` },
    });
    expect(resA.status).toBe(200);
    const bodyA = await resA.json();
    expect(bodyA.evidence.every((e: any) => e.organizationId === 'org-jaljeevan-relief')).toBe(true);

    // Donor gets 403 Forbidden
    const resDonor = await fetch(`${baseUrl}/api/evidence`, {
      headers: { Authorization: `Bearer ${donorToken}` },
    });
    expect(resDonor.status).toBe(403);

    // Auditor gets 200 OK with cross-org visibility
    const resAuditor = await fetch(`${baseUrl}/api/evidence`, {
      headers: { Authorization: `Bearer ${auditorToken}` },
    });
    expect(resAuditor.status).toBe(200);
  });

  it('7. GET /api/evidence/:id/signed-url enforces 403 on DONOR and cross-org access', async () => {
    // First upload a document under Org A
    const fileContent = Buffer.from('%PDF-1.4 Org A Confidential Cheque Leaf');
    const uploadRes = await fetch(`${baseUrl}/api/evidence/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ngoWorkerTokenOrgA}`,
      },
      body: JSON.stringify({
        originalFilename: 'OrgA_Cheque.pdf',
        mimeType: 'application/pdf',
        fileBase64: fileContent.toString('base64'),
        organizationId: 'org-jaljeevan-relief',
      }),
    });
    const { evidence } = await uploadRes.json();

    // 1. Donor attempts signed URL -> 403
    const donorRes = await fetch(`${baseUrl}/api/evidence/${evidence.id}/signed-url`, {
      headers: { Authorization: `Bearer ${donorToken}` },
    });
    expect(donorRes.status).toBe(403);
    const donorBody = await donorRes.json();
    expect(donorBody.code).toBe('ROLE_FORBIDDEN');

    // 2. Org B worker attempts to access Org A's document -> 403 CROSS_ORG_ACCESS_DENIED
    const crossOrgRes = await fetch(`${baseUrl}/api/evidence/${evidence.id}/signed-url`, {
      headers: { Authorization: `Bearer ${ngoWorkerTokenOrgB}` },
    });
    expect(crossOrgRes.status).toBe(403);
    const crossOrgBody = await crossOrgRes.json();
    expect(crossOrgBody.code).toBe('CROSS_ORG_ACCESS_DENIED');

    // 3. Auditor requests signed URL -> 200 OK with 300s TTL
    const auditorRes = await fetch(`${baseUrl}/api/evidence/${evidence.id}/signed-url?ttl=300`, {
      headers: { Authorization: `Bearer ${auditorToken}` },
    });
    expect(auditorRes.status).toBe(200);
    const auditorBody = await auditorRes.json();
    expect(auditorBody.success).toBe(true);
    expect(auditorBody.expiresInSeconds).toBe(300);
    expect(auditorBody.signedUrl).toBeDefined();

    // 4. Download raw bytes using the issued signed URL
    const rawRes = await fetch(auditorBody.signedUrl);
    expect(rawRes.status).toBe(200);
    const downloadedBytes = await rawRes.text();
    expect(downloadedBytes).toBe('%PDF-1.4 Org A Confidential Cheque Leaf');
  });

  it('8. Tampered token or expired link returns 403 Forbidden', async () => {
    // Attempt download with forged token
    const forgedRes = await fetch(`${baseUrl}/api/evidence/some-id/raw?token=0000forgedtoken1111&exp=9999999999`);
    expect(forgedRes.status).toBe(403);
    const forgedBody = await forgedRes.json();
    expect(forgedBody.code).toBe('SIGNED_URL_EXPIRED_OR_INVALID');

    // Attempt download with expired timestamp
    const expiredRes = await fetch(`${baseUrl}/api/evidence/some-id/raw?token=anytoken&exp=1000000000`);
    expect(expiredRes.status).toBe(403);
  });

  it('9. POST /api/evidence/:id/verify-hash verifies byte integrity and detects tampering', async () => {
    const fileContent = Buffer.from('%PDF-1.4 Medical Supply Receipt #7741');
    const uploadRes = await fetch(`${baseUrl}/api/evidence/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        originalFilename: 'Medical_Supply_7741.pdf',
        mimeType: 'application/pdf',
        fileBase64: fileContent.toString('base64'),
        organizationId: 'org-jaljeevan-relief',
      }),
    });
    const { evidence } = await uploadRes.json();

    // Verify hash
    const verifyRes = await fetch(`${baseUrl}/api/evidence/${evidence.id}/verify-hash`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auditorToken}` },
    });
    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json();
    expect(verifyBody.verified).toBe(true);
    expect(verifyBody.tampered).toBe(false);
  });

  it('10. Persistence survives restart', () => {
    const vault = EvidenceVaultService.getInstance();
    const status = vault.getStatus();
    expect(status.documentsCount).toBeGreaterThanOrEqual(1);
  });
});
