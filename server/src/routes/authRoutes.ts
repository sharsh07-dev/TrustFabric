import { Router, Request, Response } from 'express';
import { JwtService } from '../services/jwtService.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type { AuthUser, UserRole } from '../types.js';

export const authRouter = Router();
const jwtService = JwtService.getInstance();

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
 */
authRouter.post('/auth/login', (req: Request, res: Response): void => {
  const { persona, email, role, name } = req.body;

  let user: AuthUser;

  if (persona && STANDARD_PERSONAS[persona]) {
    user = STANDARD_PERSONAS[persona];
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
