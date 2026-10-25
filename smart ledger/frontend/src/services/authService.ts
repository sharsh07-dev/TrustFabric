/**
 * TrustFabric Client Authentication & JWT Bearer Token Service
 * Manages active cryptographic JWT sessions, user personas, and RBAC token injection
 * Satisfies CASCADE '26 Theme 4 Problem 4.2 RBAC & Multi-User Requirements.
 */

import { type UserRole } from '../types/trustfabric';

export interface AuthUser {
  id: string;
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

const TOKEN_KEY = 'trustfabric_jwt_token';
const USER_KEY = 'trustfabric_current_user';
const API_BASE = 'http://localhost:5001/api';

export class AuthService {
  private static instance: AuthService;
  private currentToken: string | null = null;
  private currentUser: AuthUser | null = null;
  private subscribers: Array<(user: AuthUser | null) => void> = [];

  private constructor() {
    this.restoreSession();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private restoreSession(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const savedToken = localStorage.getItem(TOKEN_KEY);
        const savedUser = localStorage.getItem(USER_KEY);
        if (savedToken && savedUser) {
          this.currentToken = savedToken;
          this.currentUser = JSON.parse(savedUser) as AuthUser;
          return;
        }
      }
    } catch {
      // Fallback to fresh session
    }

    // Default to Aarav (Donor) demo session
    this.initializeDefaultSession('DONOR');
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

    // Login asynchronously to fetch signed server JWT
    this.loginWithRole(role).catch(() => {});
  }

  /**
   * Logs in with a specific persona role and retrieves a signed server JWT
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
        this.setSession(data.token, data.user);
        return data.user;
      }
    } catch {
      // Local fallback token generation if backend is temporarily unreachable
    }

    const fallbackUser: AuthUser = {
      id: `usr-${role.toLowerCase()}-001`,
      name: role === 'DONOR' ? 'Aarav Sharma' : role === 'ADMIN' ? 'Meera Patel' : 'Forensic Auditor',
      email: `${role.toLowerCase()}@trustfabric.org`,
      role,
    };
    this.setSession(`local_jwt_${Date.now()}_${role}`, fallbackUser);
    return fallbackUser;
  }

  private setSession(token: string, user: AuthUser): void {
    this.currentToken = token;
    this.currentUser = user;

    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    this.notifySubscribers();
  }

  public getCurrentUser(): AuthUser | null {
    return this.currentUser;
  }

  public getToken(): string | null {
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
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
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
