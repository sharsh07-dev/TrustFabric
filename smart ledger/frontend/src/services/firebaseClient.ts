import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getDatabase, ref, onValue, type Database, type Unsubscribe } from 'firebase/database';

export const firebaseConfig = {
  apiKey: 'AIzaSyAui01RQQo0HfiX7XlbyS-oVhFtQqWAgs8',
  authDomain: 'ngoledger.firebaseapp.com',
  projectId: 'ngoledger',
  storageBucket: 'ngoledger.firebasestorage.app',
  messagingSenderId: '68686731584',
  appId: '1:68686731584:web:657444db1477c6fd2982a5',
  measurementId: 'G-SHPW4LS1ZE',
};

export const DATABASE_URL = 'https://ngoledger-default-rtdb.firebaseio.com';

export interface PublicDonationRecord {
  donationId: string;
  donationCode: string;
  campaignId: string;
  amountPaise: number;
  currency: string;
  status: string;
  provenance:
    | 'RAZORPAY_TEST_CAPTURED'
    | 'RAZORPAY_LIVE_CAPTURED'
    | 'ONCHAIN_ANCHORED_TESTNET'
    | 'SEEDED_DEMO_DATA'
    | 'SIMULATED';
  razorpayPaymentId?: string;
  txHash?: string;
  blockNumber?: number;
  explorerUrl?: string;
  createdAt: string;
  anchoredAt?: string;
}

export interface PublicFundFlowEvent {
  eventId: string;
  donationId?: string;
  campaignId?: string;
  amountPaise?: number;
  currency?: string;
  eventType: string;
  provenance: string;
  network?: string;
  txHash?: string;
  blockNumber?: number;
  explorerUrl?: string;
  timestamp: string;
}

export class FirebaseClient {
  private static instance: FirebaseClient;
  public app: FirebaseApp | null = null;
  public db: Database | null = null;
  public isInitialized = false;

  private constructor() {
    this.init();
  }

  public static getInstance(): FirebaseClient {
    if (!FirebaseClient.instance) {
      FirebaseClient.instance = new FirebaseClient();
    }
    return FirebaseClient.instance;
  }

  private init() {
    try {
      this.app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      this.db = getDatabase(this.app, DATABASE_URL);
      this.isInitialized = true;
    } catch (err: any) {
      console.warn('[FirebaseClient] Initialization notice:', err.message);
      this.isInitialized = false;
    }
  }

  /**
   * Monitors Firebase Realtime Database connection status
   */
  public subscribeToConnectionStatus(callback: (connected: boolean) => void): Unsubscribe {
    if (!this.db) {
      callback(false);
      return () => {};
    }

    try {
      const connectedRef = ref(this.db, '.info/connected');
      return onValue(
        connectedRef,
        snap => {
          callback(!!snap.val());
        },
        () => {
          callback(false);
        }
      );
    } catch {
      callback(false);
      return () => {};
    }
  }

  /**
   * Realtime listener for public donations feed
   */
  public subscribeToPublicDonations(
    callback: (donations: PublicDonationRecord[]) => void
  ): Unsubscribe {
    if (!this.db) {
      callback([]);
      return () => {};
    }

    try {
      const donRef = ref(this.db, 'public/donations');
      return onValue(
        donRef,
        snap => {
          if (!snap.exists()) {
            callback([]);
            return;
          }
          const val = snap.val();
          const list: PublicDonationRecord[] = Object.values(val);
          list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          callback(list);
        },
        error => {
          console.warn('[FirebaseClient] Donations listen notice:', error.message);
          callback([]);
        }
      );
    } catch {
      callback([]);
      return () => {};
    }
  }

  /**
   * Realtime listener for public fund-flow events
   */
  public subscribeToFundFlowEvents(
    callback: (events: PublicFundFlowEvent[]) => void
  ): Unsubscribe {
    if (!this.db) {
      callback([]);
      return () => {};
    }

    try {
      const eventsRef = ref(this.db, 'public/fundFlowEvents');
      return onValue(
        eventsRef,
        snap => {
          if (!snap.exists()) {
            callback([]);
            return;
          }
          const val = snap.val();
          const list: PublicFundFlowEvent[] = Object.values(val);
          list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          callback(list);
        },
        error => {
          console.warn('[FirebaseClient] Fund flow listen notice:', error.message);
          callback([]);
        }
      );
    } catch {
      callback([]);
      return () => {};
    }
  }
}
