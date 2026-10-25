/**
 * TrustFabric Client Real-Time Socket.IO Service
 * Replaces polling with live WebSocket broadcasts for 100+ concurrent dashboards.
 * Receives verified Razorpay donation events, campaign metric updates, and snapshots.
 */

import { io, Socket } from 'socket.io-client';
import { AuthService } from './authService';

export interface RealtimeDonationEvent {
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

export interface RealtimeCampaignUpdate {
  grantId: string;
  totalRaisedPaise: number;
  donationsCount: number;
  lastDonationAt: string;
  schemaVersion: '1.0';
}

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';

export class RealtimeClient {
  private static instance: RealtimeClient;
  private socket: Socket | null = null;
  private status: ConnectionStatus = 'DISCONNECTED';
  private serverUrl: string;

  // Deduplicated donation store
  private knownDonationIds: Set<string> = new Set();
  private donationsList: RealtimeDonationEvent[] = [];

  // Event callbacks
  private donationListeners: Array<(donation: RealtimeDonationEvent) => void> = [];
  private campaignListeners: Array<(update: RealtimeCampaignUpdate) => void> = [];
  private statusListeners: Array<(status: ConnectionStatus) => void> = [];

  private constructor() {
    this.serverUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
      ? import.meta.env.VITE_API_BASE_URL.replace(/\/api\/?$/, '')
      : 'http://localhost:5001';
  }

  public static getInstance(): RealtimeClient {
    if (!RealtimeClient.instance) {
      RealtimeClient.instance = new RealtimeClient();
    }
    return RealtimeClient.instance;
  }

  public connect(): void {
    if (this.socket && (this.socket.connected || this.status === 'CONNECTING')) {
      return;
    }

    this.setStatus('CONNECTING');
    const authService = AuthService.getInstance();
    const token = authService.getToken();

    this.socket = io(this.serverUrl, {
      auth: token ? { token } : undefined,
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      this.setStatus('CONNECTED');
    });

    this.socket.on('disconnect', () => {
      this.setStatus('DISCONNECTED');
    });

    this.socket.on('connect_error', () => {
      this.setStatus('ERROR');
    });

    this.socket.io.on('reconnect_attempt', () => {
      this.setStatus('RECONNECTING');
    });

    this.socket.on('realtime:connected', (data) => {
      console.log('[RealtimeClient] Connected to TrustFabric real-time feed:', data);
    });

    // Handle initial or reconnected snapshot
    this.socket.on('donation:feed_snapshot', (data: { donations: RealtimeDonationEvent[] }) => {
      if (Array.isArray(data?.donations)) {
        for (const d of data.donations) {
          if (!this.knownDonationIds.has(d.donationId)) {
            this.knownDonationIds.add(d.donationId);
            this.donationsList.unshift(d);
          }
        }
      }
    });

    // Handle live incoming verified donation
    this.socket.on('donation:confirmed', (event: RealtimeDonationEvent) => {
      // Deduplicate by donationId & eventId
      if (this.knownDonationIds.has(event.donationId)) {
        return;
      }
      this.knownDonationIds.add(event.donationId);
      this.donationsList.unshift(event);

      // Notify UI subscribers
      for (const cb of this.donationListeners) {
        try {
          cb(event);
        } catch (err) {
          console.error('[RealtimeClient] Error in donation subscriber callback:', err);
        }
      }
    });

    // Handle campaign metric updates
    this.socket.on('campaign:updated', (update: RealtimeCampaignUpdate) => {
      for (const cb of this.campaignListeners) {
        try {
          cb(update);
        } catch (err) {
          console.error('[RealtimeClient] Error in campaign subscriber callback:', err);
        }
      }
    });
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.setStatus('DISCONNECTED');
    }
  }

  public subscribeDonations(callback: (donation: RealtimeDonationEvent) => void): () => void {
    this.donationListeners.push(callback);
    return () => {
      this.donationListeners = this.donationListeners.filter((cb) => cb !== callback);
    };
  }

  public subscribeCampaign(callback: (update: RealtimeCampaignUpdate) => void): () => void {
    this.campaignListeners.push(callback);
    return () => {
      this.campaignListeners = this.campaignListeners.filter((cb) => cb !== callback);
    };
  }

  public subscribeStatus(callback: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.push(callback);
    callback(this.status);
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback);
    };
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const cb of this.statusListeners) {
      cb(status);
    }
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public getCachedDonations(): RealtimeDonationEvent[] {
    return [...this.donationsList];
  }
}
