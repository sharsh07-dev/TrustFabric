import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getDatabase, ref, set, update, type Database } from 'firebase/database';

export const firebaseConfig = {
  apiKey: 'AIzaSyAui01RQQo0HfiX7XlbyS-oVhFtQqWAgs8',
  authDomain: 'ngoledger.firebaseapp.com',
  projectId: 'ngoledger',
  storageBucket: 'ngoledger.firebasestorage.app',
  messagingSenderId: '68686731584',
  appId: '1:68686731584:web:657444db1477c6fd2982a5',
  measurementId: 'G-SHPW4LS1ZE',
  databaseURL: 'https://ngoledger-default-rtdb.firebaseio.com',
};

export class ServerFirebaseService {
  private static instance: ServerFirebaseService;
  private app: FirebaseApp | null = null;
  private db: Database | null = null;
  public isConnected = false;

  private constructor() {
    this.initFirebase();
  }

  public static getInstance(): ServerFirebaseService {
    if (!ServerFirebaseService.instance) {
      ServerFirebaseService.instance = new ServerFirebaseService();
    }
    return ServerFirebaseService.instance;
  }

  private initFirebase() {
    try {
      this.app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
      this.db = getDatabase(this.app, firebaseConfig.databaseURL);
      this.isConnected = true;
      console.log('[Firebase RTDB] Connected to https://ngoledger-default-rtdb.firebaseio.com');
    } catch (err: any) {
      console.warn(`[Firebase RTDB] Initialization note: ${err.message}`);
      this.isConnected = false;
    }
  }

  /**
   * Persists a newly created donation intent to RTDB
   * Separates private intent from sanitized public projection
   */
  public async syncDonationIntent(intent: {
    id: string;
    donationCode: string;
    grantId: string;
    amountPaise: number;
    currency: string;
    razorpayOrderId: string;
    state: string;
    environment: string;
    donorName?: string;
    donorEmail?: string;
    donorContact?: string;
    createdAt: string;
  }): Promise<boolean> {
    if (!this.db) return false;

    try {
      // 1. Private intent record (restricted to admin/auditor)
      const privateRef = ref(this.db, `private/paymentIntents/${intent.id}`);
      await set(privateRef, {
        donationId: intent.id,
        donationCode: intent.donationCode,
        grantId: intent.grantId,
        amountPaise: intent.amountPaise,
        currency: intent.currency,
        razorpayOrderId: intent.razorpayOrderId,
        state: intent.state,
        environment: intent.environment,
        donorName: intent.donorName || 'Anonymous',
        donorEmail: intent.donorEmail || '',
        donorContact: intent.donorContact || '',
        createdAt: intent.createdAt,
        updatedAt: new Date().toISOString(),
      });

      // 2. Public projection (sanitized, zero PII)
      const publicRef = ref(this.db, `public/donations/${intent.id}`);
      await set(publicRef, {
        donationId: intent.id,
        donationCode: intent.donationCode,
        campaignId: intent.grantId,
        amountPaise: intent.amountPaise,
        currency: intent.currency,
        status: intent.state,
        provenance: intent.environment === 'TEST' ? 'RAZORPAY_TEST_PENDING' : 'RAZORPAY_LIVE_PENDING',
        createdAt: intent.createdAt,
      });

      return true;
    } catch (err: any) {
      console.warn(`[Firebase RTDB Sync Note] syncDonationIntent: ${err.message}`);
      return false;
    }
  }

  /**
   * Updates RTDB upon authoritative payment capture
   */
  public async syncPaymentCaptured(params: {
    donationId: string;
    paymentId: string;
    orderId: string;
    amountPaise: number;
    currency: string;
    status: string;
    campaignId: string;
  }): Promise<boolean> {
    if (!this.db) return false;

    try {
      const now = new Date().toISOString();

      // 1. Private payment verification record
      const privatePayRef = ref(this.db, `private/payments/${params.donationId}`);
      await set(privatePayRef, {
        donationId: params.donationId,
        paymentId: params.paymentId,
        orderId: params.orderId,
        amountPaise: params.amountPaise,
        currency: params.currency,
        status: params.status,
        verifiedAt: now,
      });

      // 2. Update private intent state
      const intentRef = ref(this.db, `private/paymentIntents/${params.donationId}`);
      await update(intentRef, {
        state: 'CAPTURED',
        razorpayPaymentId: params.paymentId,
        updatedAt: now,
      });

      // 3. Update public donation projection
      const publicDonRef = ref(this.db, `public/donations/${params.donationId}`);
      await update(publicDonRef, {
        status: 'CAPTURED',
        provenance: 'RAZORPAY_TEST_CAPTURED',
        razorpayPaymentId: params.paymentId,
        updatedAt: now,
      });

      // 4. Record public fund flow event
      const flowEventRef = ref(this.db, `public/fundFlowEvents/evt-${params.donationId}`);
      await set(flowEventRef, {
        eventId: `evt-${params.donationId}`,
        donationId: params.donationId,
        campaignId: params.campaignId,
        amountPaise: params.amountPaise,
        currency: params.currency,
        eventType: 'DONATION_CAPTURED',
        sourceType: 'RAZORPAY_SANDBOX',
        provenance: 'RAZORPAY_TEST_CAPTURED',
        timestamp: now,
      });

      return true;
    } catch (err: any) {
      console.warn(`[Firebase RTDB Sync Note] syncPaymentCaptured: ${err.message}`);
      return false;
    }
  }

  /**
   * Persists on-chain anchor details to RTDB
   */
  public async syncBlockchainAnchor(anchor: {
    donationIntentId: string;
    paymentCommitment: string;
    grantRefHash: string;
    networkName: string;
    chainId: number;
    contractAddress: string;
    txHash: string;
    blockNumber: number;
    explorerUrl: string;
    status: string;
  }): Promise<boolean> {
    if (!this.db) return false;

    try {
      const now = new Date().toISOString();

      // 1. Private / Auditor anchor record
      const anchorRef = ref(this.db, `private/blockchainAnchors/${anchor.donationIntentId}`);
      await set(anchorRef, {
        ...anchor,
        anchoredAt: now,
      });

      // 2. Update public donation with anchor status and explorer URL
      const publicDonRef = ref(this.db, `public/donations/${anchor.donationIntentId}`);
      await update(publicDonRef, {
        status: 'ANCHORED',
        provenance: 'ONCHAIN_ANCHORED_TESTNET',
        txHash: anchor.txHash,
        blockNumber: anchor.blockNumber,
        explorerUrl: anchor.explorerUrl,
        contractAddress: anchor.contractAddress,
        anchoredAt: now,
      });

      // 3. Update public fund flow timeline
      const flowEventRef = ref(this.db, `public/fundFlowEvents/evt-anchor-${anchor.donationIntentId}`);
      await set(flowEventRef, {
        eventId: `evt-anchor-${anchor.donationIntentId}`,
        donationId: anchor.donationIntentId,
        eventType: 'ONCHAIN_COMMITMENT_ANCHORED',
        network: anchor.networkName,
        chainId: anchor.chainId,
        txHash: anchor.txHash,
        blockNumber: anchor.blockNumber,
        explorerUrl: anchor.explorerUrl,
        provenance: 'ONCHAIN_ANCHORED_TESTNET',
        timestamp: now,
      });

      return true;
    } catch (err: any) {
      console.warn(`[Firebase RTDB Sync Note] syncBlockchainAnchor: ${err.message}`);
      return false;
    }
  }

  /**
   * Syncs campaign totals separated strictly by provenance
   */
  public async syncCampaignSummary(campaignId: string, summary: {
    title: string;
    purpose: string;
    currency: string;
    totalSeededPaise: number;
    totalTestModeCapturedPaise: number;
    totalLiveCapturedPaise: number;
  }): Promise<boolean> {
    if (!this.db) return false;

    try {
      const campRef = ref(this.db, `public/campaigns/${campaignId}`);
      await set(campRef, {
        campaignId,
        title: summary.title,
        purpose: summary.purpose,
        currency: summary.currency,
        totals: {
          seededDemoPaise: summary.totalSeededPaise,
          razorpayTestCapturedPaise: summary.totalTestModeCapturedPaise,
          razorpayLiveCapturedPaise: summary.totalLiveCapturedPaise,
          totalRaisedPaise:
            summary.totalSeededPaise +
            summary.totalTestModeCapturedPaise +
            summary.totalLiveCapturedPaise,
        },
        updatedAt: new Date().toISOString(),
      });
      return true;
    } catch (err: any) {
      console.warn(`[Firebase RTDB Sync Note] syncCampaignSummary: ${err.message}`);
      return false;
    }
  }
}
