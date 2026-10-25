import type { Request, Response, NextFunction } from 'express';
import { JwtService } from '../services/jwtService.js';
import type { AuthUser, UserRole } from '../types.js';

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
 * Middleware: Requires a valid JWT Bearer token
 * Returns 401 Unauthorized if missing or invalid
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      error: 'UNAUTHORIZED: Missing or malformed Authorization header. Expected format: Bearer <jwt_token>',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const result = jwtService.verifyToken(token);
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
 * Returns 403 Forbidden if the authenticated user's role is not authorized for the operation
 */
export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // If auth header was provided, evaluate user
    if (!req.user) {
      const token = extractBearerToken(req);
      if (token) {
        const result = jwtService.verifyToken(token);
        if (!result.valid || !result.user) {
          res.status(401).json({
            error: `UNAUTHORIZED: ${result.error || 'Invalid session token.'}`,
            code: 'TOKEN_INVALID',
          });
          return;
        }
        req.user = result.user;
      } else {
        // Fallback to body-specified role if token omitted
        const bodyRole = (req.body?.reviewerRole || req.body?.authorizerRole) as UserRole | undefined;
        if (bodyRole) {
          req.user = {
            id: `usr-${bodyRole.toLowerCase()}`,
            name: req.body?.reviewer || req.body?.authorizerName || `Officer (${bodyRole})`,
            email: `${bodyRole.toLowerCase()}@trustfabric.org`,
            role: bodyRole,
          };
        } else {
          res.status(401).json({
            error: 'UNAUTHORIZED: Authentication token required to access this privileged endpoint.',
            code: 'AUTH_REQUIRED',
          });
          return;
        }
      }
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
