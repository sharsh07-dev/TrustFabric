import { Router, Request, Response } from 'express';
import { JwtService } from '../services/jwtService.js';
import { ClerkService } from '../services/clerkService.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { DbPersistenceService } from '../services/dbPersistenceService.js';
import type { AuthUser, UserRole } from '../types.js';

import { SiweService } from '../services/siweService.js';

export const authRouter = Router();
const jwtService = JwtService.getInstance();
const clerkService = ClerkService.getInstance();
const dbPersistence = DbPersistenceService.getInstance();
const siweService = SiweService.getInstance();

export const STANDARD_PERSONAS: Record<string, AuthUser> = {
  AARAV_DONOR: {
    id: 'usr-donor-001',
    name: 'Aarav Sharma',
    email: 'aarav.donor@trustfabric.org',
    role: 'DONOR',
    organizationId: 'donor-northstar-fund',
  },
  MEERA_ADMIN: {
    id: 'usr-admin-002',
    name: 'Meera Patel',
    email: 'meera.admin@jaljeevan-relief.org',
    role: 'ADMIN',
    organizationId: 'ngo-jal-jeevan',
  },
  JUDGE_AUDITOR: {
    id: 'usr-audit-003',
    name: 'Chief Forensic Auditor (Judge)',
    email: 'auditor.judge@cascade26.org',
    role: 'AUDITOR',
    organizationId: 'org-independent-audit',
  },
  RAVI_VENDOR: {
    id: 'usr-vendor-004',
    name: 'Ravi Kumar',
    email: 'ravi.field@greenbuild-supplies.com',
    role: 'FIELD_WORKER',
    organizationId: 'vendor-greenbuild',
  },
};

/**
 * GET /api/auth/personas
 * Lists available system personas for rapid authentication and testing
 */
authRouter.get('/auth/personas', (_req: Request, res: Response) => {
  res.json({ personas: Object.values(STANDARD_PERSONAS) });
});

/**
 * POST /api/auth/login
 * Issues cryptographically signed JWT for credentials or chosen persona
 * (Maintained for backward compatibility and automated unit tests)
 */
authRouter.post('/auth/login', (req: Request, res: Response): void => {
  const { persona, personaKey, email, role, name } = req.body;
  const key = persona || personaKey;

  let user: AuthUser;

  if (key && STANDARD_PERSONAS[key]) {
    user = STANDARD_PERSONAS[key];
  } else if (role && !email) {
    const matched = Object.values(STANDARD_PERSONAS).find((p) => p.role === role);
    user = matched || {
      id: `usr-${Date.now().toString(36)}`,
      name: name || `${role} User`,
      email: `${role.toLowerCase()}@trustfabric.org`,
      role: role as UserRole,
    };
  } else if (email && role) {
    user = {
      id: `usr-${Date.now().toString(36)}`,
      name: name || email.split('@')[0],
      email,
      role: role as UserRole,
    };
  } else {
    // Default to AARAV_DONOR if unspecified
    user = STANDARD_PERSONAS.AARAV_DONOR;
  }

  const token = jwtService.signToken(user);

  res.json({
    token,
    tokenType: 'Bearer',
    expiresIn: 86400,
    user,
    message: `Authenticated as ${user.name} (${user.role})`,
  });
});

/**
 * POST /api/auth/clerk-sync
 * Synchronizes authenticated Clerk session with PostgreSQL/Prisma user table.
 * Strictly derives identity from verified token; never from request body.
 */
authRouter.post('/auth/clerk-sync', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const authUser = req.user!;
  
  // Ensure user is mapped in DB persistence service
  let dbUser = authUser.clerkUserId ? await dbPersistence.getUserByClerkId(authUser.clerkUserId) : undefined;
  if (!dbUser && authUser.email) {
    dbUser = await dbPersistence.getUserByEmail(authUser.email);
  }

  res.json({
    success: true,
    user: dbUser || authUser,
    permissions: {
      canReviewApplications: ['ADMIN', 'AUDITOR'].includes(authUser.role),
      canAuthorizeEscrow: ['ADMIN', 'AUDITOR', 'FINANCE_OFFICER'].includes(authUser.role),
      canDonate: true,
      canSubmitClaims: ['ADMIN', 'FIELD_WORKER'].includes(authUser.role),
    },
  });
});

/**
 * GET /api/auth/me
 * Validates active Bearer token and returns current user profile & permissions
 */
authRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  res.json({
    authenticated: true,
    user: req.user,
    permissions: {
      canReviewApplications: ['ADMIN', 'AUDITOR'].includes(req.user!.role),
      canAuthorizeEscrow: ['ADMIN', 'AUDITOR', 'FINANCE_OFFICER'].includes(req.user!.role),
      canDonate: true,
      canSubmitClaims: ['ADMIN', 'FIELD_WORKER'].includes(req.user!.role),
    },
  });
});

/**
 * GET /api/auth/siwe/nonce
 * Generates an unpredictable cryptographic challenge nonce for EIP-4361 wallet authentication
 */
authRouter.get('/auth/siwe/nonce', (req: Request, res: Response) => {
  const domain = (req.query.domain as string) || req.headers.host;
  const uri = (req.query.uri as string) || `${req.protocol}://${req.get('host')}`;
  const challenge = siweService.generateNonce(domain, uri);
  res.json({
    success: true,
    ...challenge,
  });
});

/**
 * POST /api/auth/siwe/verify
 * Cryptographically verifies EIP-4361 message signature, enforces nonce single-use,
 * and issues standard JWT session token bound to the verified Ethereum address.
 */
authRouter.post('/auth/siwe/verify', async (req: Request, res: Response): Promise<void> => {
  const { message, signature, expectedDomain } = req.body;

  if (!message || !signature) {
    res.status(400).json({
      error: 'MISSING_PARAMETERS: Both "message" and "signature" are required.',
    });
    return;
  }

  const result = await siweService.verifySignature({
    message,
    signature,
    expectedDomain,
  });

  if (!result.valid || !result.user) {
    res.status(401).json({
      error: result.error || 'Authentication signature verification failed.',
      code: 'SIWE_VERIFICATION_FAILED',
    });
    return;
  }

  res.json({
    success: true,
    token: result.token,
    tokenType: 'Bearer',
    expiresIn: 86400,
    user: result.user,
    permissions: {
      canReviewApplications: ['ADMIN', 'AUDITOR'].includes(result.user.role),
      canAuthorizeEscrow: ['ADMIN', 'AUDITOR', 'FINANCE_OFFICER'].includes(result.user.role),
      canDonate: true,
      canSubmitClaims: ['ADMIN', 'FIELD_WORKER'].includes(result.user.role),
    },
    message: `Authenticated with wallet ${result.address} (${result.user.role})`,
  });
});

/**
 * POST /api/auth/siwe/logout
 * Explicitly revokes active session token to prevent reuse
 */
authRouter.post('/auth/siwe/logout', (req: Request, res: Response): void => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    siweService.revokeToken(token);
  }
  res.json({
    success: true,
    message: 'Session successfully revoked',
  });
});

/**
 * POST /api/webhooks/clerk
 * Handles Clerk lifecycle webhooks (user.created, user.updated, user.deleted)
 * Verifies Svix signature for tamper resistance and processes events idempotently.
 */
authRouter.post('/webhooks/clerk', async (req: Request, res: Response): Promise<void> => {
  const headers = req.headers as Record<string, string | string[] | undefined>;
  const rawBody = (req as any).rawBody ? (req as any).rawBody.toString('utf8') : JSON.stringify(req.body);

  try {
    const { payload, svixId } = clerkService.verifyWebhook(headers, rawBody);
    const eventType = payload.type;
    const eventData = payload.data;

    const result = await clerkService.handleWebhookEvent(svixId, eventType, eventData);
    res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    console.error('[Clerk Webhook] Signature verification failed:', err.message);
    res.status(400).json({ error: `Webhook verification failed: ${err.message}` });
  }
});

