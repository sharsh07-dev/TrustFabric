import type { Request, Response, NextFunction } from 'express';
import { ClerkService } from '../services/clerkService.js';
import { JwtService } from '../services/jwtService.js';
import type { AuthUser, UserRole } from '../types.js';

const clerkService = ClerkService.getInstance();
const jwtService = JwtService.getInstance();

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/**
 * Extracts Bearer token from Authorization header or query parameter
 */
export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1].trim();
    }
  }
  // Optional query token fallback for file downloads / previews
  if (typeof req.query.token === 'string') {
    return req.query.token.trim();
  }
  return null;
}

/**
 * Verifies authentication token:
 * First attempts Clerk session verification via Clerk backend SDK.
 * Falls back to cryptographic JWT service for automated tests & seeded personas.
 * NEVER derives identity from unauthenticated request body.
 */
export async function verifyUserToken(token: string): Promise<{ valid: boolean; user?: AuthUser; error?: string }> {
  // 1. Try Clerk session token verification
  const clerkResult = await clerkService.verifySessionToken(token);
  if (clerkResult.valid && clerkResult.user) {
    return clerkResult;
  }

  // 2. Cryptographic JWT verification for automated test suites and personas
  const jwtResult = jwtService.verifyToken(token);
  if (jwtResult.valid && jwtResult.user) {
    return jwtResult;
  }

  return {
    valid: false,
    error: clerkResult.error || jwtResult.error || 'Invalid session credentials',
  };
}

/**
 * Middleware: Requires a valid Bearer token (Clerk or signed system token)
 * Returns 401 Unauthorized if missing or invalid
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      error: 'UNAUTHORIZED: Missing or malformed Authorization header. Expected format: Bearer <token>',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const result = await verifyUserToken(token);
  if (!result.valid || !result.user) {
    res.status(401).json({
      error: `UNAUTHORIZED: ${result.error || 'Invalid session credentials'}`,
      code: 'TOKEN_INVALID',
    });
    return;
  }

  req.user = result.user;
  next();
}

/**
 * Middleware: Enforces Role-Based Access Control (RBAC)
 * Returns 401 Unauthorized if unauthenticated, and 403 Forbidden if the authenticated user's role is not authorized.
 * Strict: Never trusts client-supplied reviewerRole or authorizerRole from request body.
 */
export function requireRoles(...allowedRoles: UserRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      const token = extractBearerToken(req);
      if (!token) {
        res.status(401).json({
          error: 'UNAUTHORIZED: Authentication token required to access this privileged endpoint.',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const result = await verifyUserToken(token);
      if (!result.valid || !result.user) {
        res.status(401).json({
          error: `UNAUTHORIZED: ${result.error || 'Invalid session token.'}`,
          code: 'TOKEN_INVALID',
        });
        return;
      }
      req.user = result.user;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `FORBIDDEN: User '${req.user.name}' with role '${req.user.role}' is not authorized to perform this operation. Required role: [${allowedRoles.join(', ')}].`,
        code: 'ROLE_FORBIDDEN',
        userRole: req.user.role,
        requiredRoles: allowedRoles,
      });
      return;
    }

    next();
  };
}
