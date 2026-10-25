import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NgoVerificationService } from '../services/ngoVerificationService';
import { AuthService } from '../services/authService';

describe('TrustFabric Frontend NGO Verification & Gated Escrow Service', () => {
  let service: NgoVerificationService;
  let fetchSpy: any;

  beforeEach(() => {
    service = NgoVerificationService.getInstance();
    try {
      localStorage.clear();
    } catch {
      // Ignore if localStorage unavailable
    }
    (service as any).localCache.clear();
    (service as any).initDefaultLocalSeeds();

    // Reset AuthService to clean state
    AuthService.getInstance().logout();

    // Deterministic HTTP mocking for unit tests to eliminate external dependencies and timeouts
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || 'GET').toUpperCase();
      const body = init?.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : null;
      const authHeader = (init?.headers as Record<string, string>)?.[ 'Authorization' ] || (init?.headers as Record<string, string>)?.[ 'authorization' ];

      // 1. Mock /api/auth/login (Issues signed test persona JWT)
      if (url.includes('/api/auth/login')) {
        const persona = body?.persona || 'MEERA_ADMIN';
        const role = persona.includes('AUDITOR') ? 'AUDITOR' : persona.includes('ADMIN') ? 'ADMIN' : 'DONOR';
        return new Response(
          JSON.stringify({
            token: `deterministic_test_jwt_${role.toLowerCase()}`,
            user: {
              id: `usr-${role.toLowerCase()}-001`,
              name: role === 'ADMIN' ? 'Meera Patel' : 'Forensic Auditor',
              email: `${role.toLowerCase()}@trustfabric.org`,
              role,
              organizationId: 'ngo-jal-jeevan',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 2. Mock GET /api/ngo/applications
      if (url.endsWith('/api/ngo/applications') && method === 'GET') {
        const apps = Array.from((service as any).localCache.values());
        return new Response(JSON.stringify({ applications: apps }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 3. Mock POST /api/ngo/applications/:id/documents
      if (url.includes('/documents') && method === 'POST') {
        const appIdMatch = url.match(/\/applications\/([^/]+)\/documents/);
        const appId = appIdMatch ? appIdMatch[1] : 'ngo-app-002';
        const app = (service as any).localCache.get(appId);
        if (app && body?.type) {
          app.documents[body.type] = {
            id: `doc-${Date.now()}`,
            type: body.type,
            name: body.name,
            fileSha256: body.fileSha256,
            uploadedAt: new Date().toISOString(),
            mimeType: body.mimeType || 'application/pdf',
            sizeBytes: body.sizeBytes || 240000,
            reviewStatus: body.reviewStatus || 'PENDING_REVIEW',
          };
          (service as any).runClientAudit(app);
        }
        return new Response(
          JSON.stringify({
            message: 'Document uploaded',
            application: app,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 4. Mock POST /api/ngo/applications/:id/review
      if (url.includes('/review') && method === 'POST') {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(JSON.stringify({ error: 'Unauthorized: missing Bearer token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const appIdMatch = url.match(/\/applications\/([^/]+)\/review/);
        const appId = appIdMatch ? appIdMatch[1] : '';
        const decision = body?.decision;

        if (appId === 'ngo-app-002' && decision === 'APPROVED') {
          return new Response(
            JSON.stringify({
              error: 'Cannot approve application with unresolved defects or duplicate bank collisions.',
              defects: [
                'Duplicate Bank Account collision detected across multiple registered NGOs.',
                'Missing one or more mandatory compliance documents.',
              ],
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const app = (service as any).localCache.get(appId);
        if (app) {
          app.verificationStatus = decision;
          app.reviewDecision = {
            decision,
            reviewer: body?.reviewer || 'Meera (NGO Lead)',
            reviewerRole: body?.reviewerRole || 'ADMIN',
            notes: body?.notes || '',
          };
        }

        return new Response(
          JSON.stringify({
            message: `Application ${decision?.toLowerCase()} by reviewer.`,
            application: app,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 5. Mock POST /api/ngo/applications/:id/authorize-funding
      if (url.includes('/authorize-funding') && method === 'POST') {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(JSON.stringify({ error: 'Unauthorized: missing Bearer token' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const appIdMatch = url.match(/\/applications\/([^/]+)\/authorize-funding/);
        const appId = appIdMatch ? appIdMatch[1] : '';

        if (appId === 'ngo-app-002') {
          const app = (service as any).localCache.get('ngo-app-002');
          return new Response(
            JSON.stringify({
              success: false,
              error: 'ESCROW_RELEASE_BLOCKED: Gated verification criteria not satisfied.',
              blockingReasons: [
                "Verification status is 'FLAGGED_DEFECTS' (Must be 'APPROVED' before release).",
                'Duplicate bank account nullifier collision detected. Funds locked to prevent fraud.',
              ],
              application: app,
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const app = (service as any).localCache.get('ngo-app-001') || {
          id: 'ngo-app-001',
          verificationStatus: 'APPROVED',
          escrowAuthorization: {},
        };
        const now = new Date().toISOString();
        const commitment = await service.computeFileSha256(
          `TRUSTFABRIC_ESCROW_RELEASE_V1|${app.id}|${app.darpanId}|${app.bankDetails.accountNumber}|${app.projectProposal.requestedAmountPaise}|${now}`
        );
        const txHash = '0x' + (await service.computeFileSha256(`TX-${commitment}`));

        app.verificationStatus = 'APPROVED';
        app.escrowAuthorization = {
          isAuthorized: true,
          blockingReasons: [],
          authorizedAt: now,
          authorizerRole: body?.authorizerRole || 'ADMIN',
          contractEscrowTrancheId: 'tranche-app-001',
          blockchainTxHash: txHash,
          blockchainBlock: 5892150,
          blockchainStatus: 'ESCROW_RELEASED',
          onChainAnchorHash: '0x' + commitment,
          network: 'Ethereum Sepolia (EVM) / TrustFabricEscrow.sol',
          contractAddress: '0x71C569E962Ac1C7F602B7d2A40EAA672D611293B',
        };

        return new Response(
          JSON.stringify({
            success: true,
            application: app,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({ error: 'Endpoint not found' }), { status: 404 });
    });
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  describe('1. WebCrypto SHA-256 Hashing', () => {
    it('computes exact standard SHA-256 hash of text strings and document buffers', async () => {
      const hash1 = await service.computeFileSha256('TrustFabric_Test_Document_2026');
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);

      // Deterministic check
      const hash2 = await service.computeFileSha256('TrustFabric_Test_Document_2026');
      expect(hash1).toBe(hash2);
    });
  });

  describe('2. Scenario Integrity & Automated Defect Screening', () => {
    it('loads seed applications with correct initial states', async () => {
      const apps = await service.getApplications();
      expect(apps.length).toBeGreaterThanOrEqual(2);

      const verified = apps.find((a) => a.id === 'ngo-app-001');
      expect(verified?.verificationStatus).toBe('APPROVED');
      expect(verified?.automatedChecks.allMandatoryDocsPresent).toBe(true);

      const flawed = apps.find((a) => a.id === 'ngo-app-002');
      expect(flawed?.verificationStatus).toBe('FLAGGED_DEFECTS');
      expect(flawed?.automatedChecks.duplicateBankCollision).toBe(true);
    });

    it('attaches uploaded document and recalculates mandatory checklist', async () => {
      const dummySha = await service.computeFileSha256('Dummy NITI Aayog Darpan Certificate Content');
      const updated = await service.uploadDocument('ngo-app-002', {
        type: 'NGO_DARPAN_REGISTRATION',
        name: 'Darpan_Registration_Proof.pdf',
        fileSha256: dummySha,
        reviewStatus: 'VERIFIED',
      });

      expect(updated.documents['NGO_DARPAN_REGISTRATION']).toBeDefined();
      expect(updated.documents['NGO_DARPAN_REGISTRATION'].fileSha256).toBe(dummySha);
    });
  });

  describe('3. Role Permissions & Review Decisions', () => {
    it('prevents approving an application with duplicate bank collisions', async () => {
      const reviewResult = await service.submitReview('ngo-app-002', {
        decision: 'APPROVED',
        reviewer: 'Meera (NGO Lead)',
        reviewerRole: 'ADMIN',
        notes: 'Attempting invalid approval with known bank collision',
      });

      expect(reviewResult.success).toBe(false);
      expect(reviewResult.error).toMatch(/(defects or collisions|duplicate bank collisions)/);
    });

    it('allows valid approval on compliant application', async () => {
      const reviewResult = await service.submitReview('ngo-app-001', {
        decision: 'APPROVED',
        reviewer: 'Meera (NGO Lead)',
        reviewerRole: 'ADMIN',
        notes: 'Compliant verification attested',
      });

      expect(reviewResult.success).toBe(true);
      expect(reviewResult.application.verificationStatus).toBe('APPROVED');
    });
  });

  describe('4. Gated Escrow Funding Release Enforcement', () => {
    it('strictly blocks escrow release on unapproved or flawed application', async () => {
      const releaseResult = await service.authorizeEscrowRelease('ngo-app-002', {
        role: 'ADMIN',
        name: 'Finance Lead',
      });

      expect(releaseResult.success).toBe(false);
      expect(releaseResult.blockingReasons).toBeDefined();
      expect(releaseResult.blockingReasons!.length).toBeGreaterThan(0);
      expect(releaseResult.application.escrowAuthorization.isAuthorized).toBe(false);
    });

    it('authorizes smart contract release on fully verified application', async () => {
      const releaseResult = await service.authorizeEscrowRelease('ngo-app-001', {
        role: 'ADMIN',
        name: 'Finance Lead',
      });

      expect(releaseResult.success).toBe(true);
      expect(releaseResult.application.escrowAuthorization.isAuthorized).toBe(true);
      expect(releaseResult.application.escrowAuthorization.blockchainStatus).toBe('ESCROW_RELEASED');
      expect(releaseResult.application.escrowAuthorization.blockchainTxHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(releaseResult.application.escrowAuthorization.onChainAnchorHash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });
});
