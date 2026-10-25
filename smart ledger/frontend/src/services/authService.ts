/**
 * TrustFabric Client Authentication & Clerk Session Integration Service
 * Manages active cryptographic Clerk session tokens and application persona state.
 * Preserves RBAC token injection across all TrustFabric API requests.
 */

import { type UserRole } from '../types/trustfabric';

export interface AuthUser {
  id: string;
  clerkUserId?: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId?: string;
  iat?: number;
  exp?: number;
}

export interface LoginResponse {
  token: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
  message: string;
}

const API_BASE = 'http://localhost:5001/api';

export class AuthService {
  private static instance: AuthService;
  private currentToken: string | null = null;
  private currentUser: AuthUser | null = null;
  private tokenGetter: (() => Promise<string | null>) | null = null;
  private subscribers: Array<(user: AuthUser | null) => void> = [];

  private constructor() {
    this.initializeDefaultSession('DONOR');
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public initializeDefaultSession(role: UserRole = 'DONOR'): void {
    const defaultPersonas: Record<UserRole, AuthUser> = {
      DONOR: {
        id: 'usr-donor-001',
        name: 'Aarav Sharma',
        email: 'aarav.donor@trustfabric.org',
        role: 'DONOR',
        organizationId: 'donor-northstar-fund',
      },
      ADMIN: {
        id: 'usr-admin-002',
        name: 'Meera Patel',
        email: 'meera.admin@jaljeevan-relief.org',
        role: 'ADMIN',
        organizationId: 'ngo-jal-jeevan',
      },
      AUDITOR: {
        id: 'usr-audit-003',
        name: 'Chief Forensic Auditor (Judge)',
        email: 'auditor.judge@cascade26.org',
        role: 'AUDITOR',
        organizationId: 'org-independent-audit',
      },
      FINANCE_OFFICER: {
        id: 'usr-finance-005',
        name: 'Finance Compliance Lead',
        email: 'finance@trustfabric.org',
        role: 'FINANCE_OFFICER',
        organizationId: 'ngo-jal-jeevan',
      },
    };

    const user = defaultPersonas[role] || defaultPersonas.DONOR;
    this.currentUser = user;
    this.loginWithRole(role).catch(() => {});
  }

  /**
   * Links active Clerk session and user into AuthService
   */
  public async syncClerkSession(
    tokenGetter: () => Promise<string | null>,
    clerkUser: any
  ): Promise<void> {
    this.tokenGetter = tokenGetter;
    try {
      const token = await tokenGetter();
      if (token) {
        this.currentToken = token;

        // Sync with backend to resolve local PostgreSQL user role & organization
        const res = await fetch(`${API_BASE}/auth/clerk-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            this.currentUser = {
              id: data.user.id,
              clerkUserId: clerkUser.id,
              name: data.user.name || clerkUser.fullName || clerkUser.username || 'Clerk User',
              email: data.user.email || clerkUser.primaryEmailAddress?.emailAddress || '',
              role: (data.user.role as UserRole) || 'DONOR',
              organizationId: data.user.organizationId,
            };
            this.notifySubscribers();
            return;
          }
        }
      }
    } catch (err: any) {
      console.warn('[AuthService] Clerk backend sync fallback:', err.message);
    }

    if (clerkUser) {
      this.currentUser = {
        id: clerkUser.id,
        clerkUserId: clerkUser.id,
        name: clerkUser.fullName || clerkUser.firstName || clerkUser.username || 'Clerk User',
        email: clerkUser.primaryEmailAddress?.emailAddress || 'user@example.com',
        role: (clerkUser.publicMetadata?.role as UserRole) || 'DONOR',
      };
      this.notifySubscribers();
    }
  }

  /**
   * Logs in with a specific persona role (used in development & test suite)
   */
  public async loginWithRole(role: UserRole): Promise<AuthUser> {
    const personaMap: Record<UserRole, string> = {
      DONOR: 'AARAV_DONOR',
      ADMIN: 'MEERA_ADMIN',
      AUDITOR: 'JUDGE_AUDITOR',
      FINANCE_OFFICER: 'MEERA_ADMIN',
    };

    const persona = personaMap[role] || 'AARAV_DONOR';

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona }),
      });

      if (res.ok) {
        const data = (await res.json()) as LoginResponse;
        this.currentToken = data.token;
        this.currentUser = data.user;
        this.notifySubscribers();
        return data.user;
      }
    } catch {
      // Local fallback if server unreachable
    }

    const fallbackUser: AuthUser = {
      id: `usr-${role.toLowerCase()}-001`,
      name: role === 'DONOR' ? 'Aarav Sharma' : role === 'ADMIN' ? 'Meera Patel' : 'Forensic Auditor',
      email: `${role.toLowerCase()}@trustfabric.org`,
      role,
    };
    this.currentToken = `local_jwt_${Date.now()}_${role}`;
    this.currentUser = fallbackUser;
    this.notifySubscribers();
    return fallbackUser;
  }

  public getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  public getToken(): string | null {
    return this.currentToken;
  }

  public async getFreshToken(): Promise<string | null> {
    if (this.tokenGetter) {
      try {
        const fresh = await this.tokenGetter();
        if (fresh) {
          this.currentToken = fresh;
          return fresh;
        }
      } catch {
        // Fallback to cached token
      }
    }
    return this.currentToken;
  }

  public getAuthHeaders(): Record<string, string> {
    if (this.currentToken) {
      return {
        Authorization: `Bearer ${this.currentToken}`,
      };
    }
    return {};
  }

  public logout(): void {
    this.currentToken = null;
    this.currentUser = null;
    this.tokenGetter = null;
    this.notifySubscribers();
  }

  public subscribe(callback: (user: AuthUser | null) => void): () => void {
    this.subscribers.push(callback);
    callback(this.currentUser);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== callback);
    };
  }

  private notifySubscribers(): void {
    for (const sub of this.subscribers) {
      sub(this.currentUser);
    }
  }
}
