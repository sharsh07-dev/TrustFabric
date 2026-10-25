import { Server as SocketIOServer, Socket } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import crypto from 'crypto';
import { JwtService } from './jwtService.js';
import type { AuthUser } from '../types.js';

export interface SanitizedDonationEvent {
  eventId: string;
  donationId: string;
  campaignId: string;
  amountPaise: number;
  currency: string;
  confirmedAt: string;
  donorDisplayName: string;
  isAnonymous: boolean;
  schemaVersion: '1.0';
  provenance: 'RAZORPAY_VERIFIED' | 'ONCHAIN_ANCHORED';
}

export interface CampaignUpdateEvent {
  grantId: string;
  totalRaisedPaise: number;
  donationsCount: number;
  lastDonationAt: string;
  schemaVersion: '1.0';
}

export interface OutboxRecord {
  id: string;
  eventType: 'donation:confirmed' | 'campaign:updated';
  aggregateId: string;
  payload: any;
  published: boolean;
  publishedAt?: string;
  createdAt: string;
}

export class RealtimeSocketService {
  private static instance: RealtimeSocketService;
  private io: SocketIOServer | null = null;
  private jwtService: JwtService;

  // Transactional outbox storage (persisted in-process and syncable to PostgreSQL)
  private outboxStore: Map<string, OutboxRecord> = new Map();
  private recentDonations: SanitizedDonationEvent[] = [];
  private totalBroadcastEvents: number = 0;

  private constructor() {
    this.jwtService = JwtService.getInstance();
  }

  public static getInstance(): RealtimeSocketService {
    if (!RealtimeSocketService.instance) {
      RealtimeSocketService.instance = new RealtimeSocketService();
    }
    return RealtimeSocketService.instance;
  }

  /**
   * Attaches Socket.IO to the existing Node.js HTTP server with secure CORS
   */
  public attach(httpServer: HTTPServer): SocketIOServer {
    if (this.io) {
      return this.io;
    }

    const rawOrigins = process.env.SOCKET_ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173';
    const allowedOrigins = rawOrigins.split(',').map((o) => o.trim());

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 20000,
      pingInterval: 10000,
    });

    this.setupMiddleware();
    this.setupConnectionHandlers();

    console.log('[RealtimeSocketService] Socket.IO attached with origins:', allowedOrigins);
    return this.io;
  }

  public getIO(): SocketIOServer | null {
    return this.io;
  }

  /**
   * JWT Handshake Authentication Middleware
   * Allows authenticated users full role-based room access; allows anonymous clients public feed only.
   */
  private setupMiddleware(): void {
    if (!this.io) return;

    this.io.use((socket: Socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          (socket.handshake.headers.authorization
            ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '').trim()
            : null);

        if (token) {
          const result = this.jwtService.verifyToken(token);
          if (result.valid && result.user) {
            socket.data.user = result.user;
          } else {
            // Invalid token passed -> reject connection
            return next(new Error('AUTHENTICATION_FAILED: Invalid or expired JWT token'));
          }
        } else {
          // Anonymous public viewer
          socket.data.user = null;
        }

        next();
      } catch (err: any) {
        next(new Error(`AUTHENTICATION_ERROR: ${err.message}`));
      }
    });
  }

  /**
   * Connection Handlers & Room Access Control
   */
  private setupConnectionHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket) => {
      const user: AuthUser | null = socket.data.user;

      // Automatically join public feed room
      socket.join('feed:public');

      // If authenticated, join user-specific private rooms
      if (user) {
        const userId = user.id || (user as any).sub;
        if (userId) socket.join(`user:${userId}`);
        if (user.role) socket.join(`role:${user.role}`);
        if (user.organizationId) socket.join(`org:${user.organizationId}`);

        if (user.role === 'ADMIN' || user.role === 'AUDITOR') {
          socket.join('admin:all');
        }
      }

      // Send initial welcome & connection confirmation
      socket.emit('realtime:connected', {
        connectionId: socket.id,
        authenticated: !!user,
        userId: user?.id || (user as any)?.sub || null,
        role: user?.role || 'ANONYMOUS',
        timestamp: new Date().toISOString(),
        serverHeartbeatMs: 10000,
      });

      // Deliver initial feed snapshot on connect
      socket.emit('donation:feed_snapshot', {
        donations: this.recentDonations.slice(0, 20),
        timestamp: new Date().toISOString(),
      });

      // Handle explicit room subscriptions with authorization checks
      socket.on('subscribe:room', (payload: { room: string }) => {
        const room = payload?.room;
        if (!room) return;

        // Public campaign rooms: allow all
        if (room.startsWith('campaign:') || room === 'feed:public') {
          socket.join(room);
          socket.emit('room:subscribed', { room, success: true });
          return;
        }

        // NGO organization rooms: require belonging to that org or admin/auditor
        if (room.startsWith('org:')) {
          const targetOrg = room.replace('org:', '');
          const isAuthorized =
            user &&
            (user.organizationId === targetOrg || user.role === 'ADMIN' || user.role === 'AUDITOR');

          if (isAuthorized) {
            socket.join(room);
            socket.emit('room:subscribed', { room, success: true });
          } else {
            socket.emit('realtime:error', {
              code: 'UNAUTHORIZED_ROOM_ACCESS',
              message: `Forbidden: You are not authorized to subscribe to room ${room}`,
            });
          }
          return;
        }

        // Admin room: strictly require ADMIN or AUDITOR
        if (room === 'admin:all') {
          if (user && (user.role === 'ADMIN' || user.role === 'AUDITOR')) {
            socket.join(room);
            socket.emit('room:subscribed', { room, success: true });
          } else {
            socket.emit('realtime:error', {
              code: 'ADMIN_ROLE_REQUIRED',
              message: 'Forbidden: Admin authorization required for this room',
            });
          }
          return;
        }

        // Unknown or custom rooms rejected by default
        socket.emit('realtime:error', {
          code: 'INVALID_ROOM',
          message: `Unknown or restricted room: ${room}`,
        });
      });

      // Handle manual snapshot refresh requests
      socket.on('request:snapshot', () => {
        socket.emit('donation:feed_snapshot', {
          donations: this.recentDonations.slice(0, 20),
          timestamp: new Date().toISOString(),
        });
      });
    });
  }

  /**
   * Broadcast a verified Razorpay donation event to 100+ connected clients
   * Strictly sanitizes private fields (no raw card, email, phone, or secrets)
   */
  public async publishVerifiedDonation(params: {
    donationId: string;
    campaignId: string;
    amountPaise: number;
    currency: string;
    donorName?: string;
    donorUserId?: string;
    organizationId?: string;
    isAnonymous?: boolean;
    provenance?: 'RAZORPAY_VERIFIED' | 'ONCHAIN_ANCHORED';
  }): Promise<SanitizedDonationEvent> {
    const eventId = `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    const isAnon = params.isAnonymous ?? false;
    const donorDisplayName = isAnon || !params.donorName ? 'Anonymous Donor' : params.donorName;

    const sanitizedEvent: SanitizedDonationEvent = {
      eventId,
      donationId: params.donationId,
      campaignId: params.campaignId,
      amountPaise: params.amountPaise,
      currency: params.currency || 'INR',
      confirmedAt: now,
      donorDisplayName,
      isAnonymous: isAnon,
      schemaVersion: '1.0',
      provenance: params.provenance || 'RAZORPAY_VERIFIED',
    };

    // 1. Transactional Outbox persistence
    const outboxRecord: OutboxRecord = {
      id: eventId,
      eventType: 'donation:confirmed',
      aggregateId: params.donationId,
      payload: sanitizedEvent,
      published: false,
      createdAt: now,
    };
    this.outboxStore.set(eventId, outboxRecord);

    // Keep cache of recent donations for reconnecting clients
    this.recentDonations.unshift(sanitizedEvent);
    if (this.recentDonations.length > 50) {
      this.recentDonations.pop();
    }

    // 2. Broadcast through Socket.IO
    if (this.io) {
      // Public broadcast to feed and campaign rooms
      this.io.to('feed:public').emit('donation:confirmed', sanitizedEvent);
      this.io.to(`campaign:${params.campaignId}`).emit('donation:confirmed', sanitizedEvent);

      // Private targeted notification to donor's personal room if user ID known
      if (params.donorUserId) {
        this.io.to(`user:${params.donorUserId}`).emit('donation:user_receipt', {
          ...sanitizedEvent,
          isOwnDonation: true,
        });
      }

      // NGO Organization dashboard room
      if (params.organizationId) {
        this.io.to(`org:${params.organizationId}`).emit('donation:confirmed', sanitizedEvent);
      }

      outboxRecord.published = true;
      outboxRecord.publishedAt = new Date().toISOString();
      this.totalBroadcastEvents++;
    }

    return sanitizedEvent;
  }

  /**
   * Broadcast campaign aggregate update (total raised & count)
   */
  public async publishCampaignUpdate(campaign: {
    grantId: string;
    totalRaisedPaise: number;
    donationsCount: number;
    lastDonationAt: string;
  }): Promise<CampaignUpdateEvent> {
    const payload: CampaignUpdateEvent = {
      ...campaign,
      schemaVersion: '1.0',
    };

    if (this.io) {
      this.io.to('feed:public').emit('campaign:updated', payload);
      this.io.to(`campaign:${campaign.grantId}`).emit('campaign:updated', payload);
      this.totalBroadcastEvents++;
    }

    return payload;
  }

  public getHealth(): {
    status: 'HEALTHY' | 'UNATTACHED';
    attached: boolean;
    connectedClientsCount: number;
    totalBroadcastEvents: number;
    outboxPendingCount: number;
    recentDonationsCached: number;
  } {
    const clientsCount = this.io ? this.io.engine.clientsCount : 0;
    const pendingOutbox = Array.from(this.outboxStore.values()).filter((e) => !e.published).length;

    return {
      status: this.io ? 'HEALTHY' : 'UNATTACHED',
      attached: !!this.io,
      connectedClientsCount: clientsCount,
      totalBroadcastEvents: this.totalBroadcastEvents,
      outboxPendingCount: pendingOutbox,
      recentDonationsCached: this.recentDonations.length,
    };
  }

  public getRecentDonations(): SanitizedDonationEvent[] {
    return [...this.recentDonations];
  }
}
