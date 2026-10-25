import { verifyToken, clerkClient } from '@clerk/express';
import { Webhook } from 'svix';
import { DbPersistenceService, type DbUserRecord } from './dbPersistenceService.js';
import type { AuthUser, UserRole } from '../types.js';

export interface ClerkSessionResult {
  valid: boolean;
  user?: AuthUser;
  error?: string;
}

export class ClerkService {
  private static instance: ClerkService;
  private db: DbPersistenceService;
  private processedWebhookIds: Set<string> = new Set();

  private constructor() {
    this.db = DbPersistenceService.getInstance();
  }

  public static getInstance(): ClerkService {
    if (!ClerkService.instance) {
      ClerkService.instance = new ClerkService();
    }
    return ClerkService.instance;
  }

  /**
   * Verifies a Clerk JWT session token using Clerk backend SDK
   */
  public async verifySessionToken(token: string): Promise<ClerkSessionResult> {
    const secretKey = process.env.CLERK_SECRET_KEY;
    const publishableKey = process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY;

    if (!token) {
      return { valid: false, error: 'Token missing or empty' };
    }

    // If Clerk secret key is configured, verify cryptographically with Clerk
    if (secretKey && secretKey.startsWith('sk_') && !secretKey.includes('[YOUR-')) {
      try {
        const payload = await verifyToken(token, {
          secretKey,
          jwtKey: process.env.CLERK_JWT_KEY,
        });

        const clerkUserId = payload.sub;
        if (!clerkUserId) {
          return { valid: false, error: 'Clerk session payload missing subject identifier (sub)' };
        }

        // Resolve user identity from PostgreSQL
        const appUser = await this.resolveAppUser(clerkUserId);
        if (!appUser) {
          return { valid: false, error: 'User account not authorized or not found in database' };
        }

        return {
          valid: true,
          user: {
            id: appUser.id,
            clerkUserId: appUser.clerkUserId,
            name: appUser.name,
            email: appUser.email,
            role: appUser.role,
            organizationId: appUser.organizationId,
            iat: typeof payload.iat === 'number' ? payload.iat : Math.floor(Date.now() / 1000),
            exp: typeof payload.exp === 'number' ? payload.exp : Math.floor(Date.now() / 1000) + 3600,
          },
        };
      } catch (err: any) {
        return {
          valid: false,
          error: `Clerk token verification failed: ${err.message || 'Signature invalid or token expired'}`,
        };
      }
    }

    // Development / Test placeholder verification for simulated Clerk tokens
    if (token.startsWith('clerk_test_token_') || token.startsWith('sess_')) {
      const mockUserId = token.includes('admin')
        ? 'usr-meera-admin-002'
        : token.includes('auditor')
        ? 'usr-anil-auditor-003'
        : 'usr-aarav-donor-001';

      const user = await this.db.getUser(mockUserId);
      if (user) {
        return {
          valid: true,
          user: {
            id: user.id,
            clerkUserId: `user_clerk_${user.id}`,
            name: user.name,
            email: user.email,
            role: user.role,
            organizationId: user.organizationId,
          },
        };
      }
    }

    return {
      valid: false,
      error: 'Clerk authentication failed: CLERK_SECRET_KEY not configured or invalid token format',
    };
  }

  /**
   * Resolves application user from PostgreSQL by Clerk User ID.
   * If user is registered in Clerk but not yet mapped in Postgres, fetches
   * verified profile from Clerk API and provisions with least-privilege 'DONOR' role.
   */
  public async resolveAppUser(clerkUserId: string): Promise<DbUserRecord | null> {
    // 1. Query Postgres by clerkUserId
    const existing = await this.db.getUserByClerkId(clerkUserId);
    if (existing) {
      return existing;
    }

    // 2. Fetch user profile from Clerk API to obtain verified email
    try {
      if (process.env.CLERK_SECRET_KEY && !process.env.CLERK_SECRET_KEY.includes('[YOUR-')) {
        const clerkUser = await clerkClient.users.getUser(clerkUserId);
        const primaryEmail =
          clerkUser.emailAddresses?.find((e: any) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ||
          clerkUser.emailAddresses?.[0]?.emailAddress;

        if (primaryEmail) {
          const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || primaryEmail.split('@')[0];
          return await this.db.syncClerkUser({
            clerkUserId,
            email: primaryEmail,
            name: fullName,
          });
        }
      }
    } catch (err: any) {
      console.warn(`[ClerkService] Unable to fetch user ${clerkUserId} from Clerk API:`, err.message);
    }

    return null;
  }

  /**
   * Verifies Clerk webhook signature using Svix
   */
  public verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): any {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret || webhookSecret.includes('[YOUR-')) {
      throw new Error('CLERK_WEBHOOK_SECRET is not configured.');
    }

    const svixId = (headers['svix-id'] || headers['svix_id']) as string;
    const svixTimestamp = (headers['svix-timestamp'] || headers['svix_timestamp']) as string;
    const svixSignature = (headers['svix-signature'] || headers['svix_signature']) as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new Error('Missing Svix verification headers');
    }

    const wh = new Webhook(webhookSecret);
    const svixHeaders = {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    };

    const payload = wh.verify(rawBody, svixHeaders);
    return { payload, svixId };
  }

  /**
   * Idempotently processes Clerk user lifecycle webhook events
   */
  public async handleWebhookEvent(eventId: string, eventType: string, data: any): Promise<{ handled: boolean; reason?: string }> {
    if (this.processedWebhookIds.has(eventId)) {
      return { handled: true, reason: 'Duplicate event ignored (idempotent)' };
    }

    switch (eventType) {
      case 'user.created':
      case 'user.updated': {
        const clerkUserId = data.id;
        const primaryEmail =
          data.email_addresses?.find((e: any) => e.id === data.primary_email_address_id)?.email_address ||
          data.email_addresses?.[0]?.email_address;
        const fullName = [data.first_name, data.last_name].filter(Boolean).join(' ') || data.username || 'Clerk User';

        if (clerkUserId && primaryEmail) {
          await this.db.syncClerkUser({
            clerkUserId,
            email: primaryEmail,
            name: fullName,
          });
        }
        break;
      }

      case 'user.deleted': {
        const clerkUserId = data.id;
        if (clerkUserId) {
          const user = await this.db.getUserByClerkId(clerkUserId);
          if (user) {
            console.log(`[ClerkService] User ${clerkUserId} deleted in Clerk; preserving audit logs in database.`);
          }
        }
        break;
      }

      default:
        // Ignore unhandled lifecycle events safely
        break;
    }

    this.processedWebhookIds.add(eventId);
    // Keep set bounded to last 10,000 events
    if (this.processedWebhookIds.size > 10000) {
      const first = this.processedWebhookIds.values().next().value;
      if (first) this.processedWebhookIds.delete(first);
    }

    return { handled: true };
  }
}
