export interface PublicPaymentConfig {
  isRazorpayConfigured?: boolean;
  primaryPaymentRail?: string;
  supportedRails?: string[];
  razorpayKeyId: string;
  razorpayMode: 'test' | 'live';
  isTestMode: boolean;
  evmChainMode: string;
  networkName: string;
  chainId: number;
  fiatAnchorContractAddress: string;
  relayerAddress: string;
  minDonationPaise: number;
  maxDonationPaise: number;
  explorerBaseUrl: string;
}

export interface DirectBankDonationResponse {
  success: boolean;
  donation: {
    id: string;
    donationCode: string;
    grantId: string;
    amountPaise: number;
    currency: string;
    state: string;
    paymentRail: string;
    bankReferenceUtr: string;
    createdAt: string;
  };
  anchor?: any;
  notice: string;
}


export interface PaymentGrant {
  id: string;
  grantCode: string;
  title: string;
  purpose: string;
  currency: 'INR';
  minDonationPaise: number;
  maxDonationPaise: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
}

export interface DonationOrderResponse {
  donationId: string;
  donationCode: string;
  orderId: string;
  amountPaise: number;
  currency: 'INR';
  keyId: string;
  environment: 'TEST' | 'LIVE';
  grant: { id: string; title: string; purpose: string };
}

export interface VerificationResponse {
  verified: boolean;
  donation: {
    id: string;
    donationCode: string;
    grantId: string;
    amountPaise: number;
    currency: 'INR';
    state: string;
    environment: 'TEST' | 'LIVE';
    razorpayOrderId: string;
    razorpayPaymentId: string;
    createdAt: string;
  };
  paymentDetails: {
    paymentId: string;
    orderId: string;
    status: string;
    method: string;
    amount: number;
    currency: string;
    captured: boolean;
  };
  anchor?: {
    id: string;
    paymentCommitment: string;
    commitmentSalt: string;
    grantRefHash: string;
    networkName: string;
    chainId: number;
    contractAddress: string;
    relayerAddress: string;
    txHash: string;
    blockNumber: number;
    gasUsed: number;
    explorerUrl: string;
    status: string;
  } | null;
  notice: string;
}

export interface ProofPackageResponse {
  protocol: string;
  verifiedAt: string;
  donation: {
    id: string;
    donationCode: string;
    grantId: string;
    amountPaise: number;
    amountInr: number;
    currency: string;
    state: string;
    environment: string;
    razorpayOrderId: string;
    razorpayPaymentId?: string;
  };
  anchor: {
    paymentCommitment: string;
    commitmentSalt: string;
    grantRefHash: string;
    networkName: string;
    chainId: number;
    contractAddress: string;
    txHash: string;
    blockNumber: number;
    gasUsed: number;
    explorerUrl: string;
    status: string;
  } | null;
  trustModelExplanation: {
    whatIsProven: string;
    whatRemainsUnproven: string;
  };
}

async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const directUrl = path.startsWith('http') ? path : `http://localhost:5001${path}`;
  try {
    const res = await fetch(directUrl, options);
    if (res.ok) return res;
    // If direct returned an error status other than network failure, return it
    if (res.status !== 404 && res.status !== 502 && res.status !== 504) return res;
  } catch {
    // Direct network connection failed, try relative proxy
  }

  try {
    const fallbackRes = await fetch(path, options);
    return fallbackRes;
  } catch (err: any) {
    throw new Error(`Cannot connect to TrustFabric backend at http://localhost:5001 (${err.message}). Ensure backend server is running.`);
  }
}

export class PaymentService {
  private static instance: PaymentService;
  private configCache: PublicPaymentConfig | null = null;

  public static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  public async getPublicConfig(): Promise<PublicPaymentConfig> {
    if (this.configCache) return this.configCache;
    try {
      const resp = await apiFetch('/api/config/public');
      if (!resp.ok) throw new Error(`Config fetch failed (${resp.status})`);
      this.configCache = await resp.json();
      return this.configCache!;
    } catch {
      // Offline fallback config
      return {
        razorpayKeyId: 'rzp_test_Ts8hc71B3sf8nu',
        razorpayMode: 'test',
        isTestMode: true,
        evmChainMode: 'sepolia',
        networkName: 'Ethereum Sepolia Testnet',
        chainId: 11155111,
        fiatAnchorContractAddress: '0x71C25bf4e37da4b7F2eFe341F21074eAf7096eF4',
        relayerAddress: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
        minDonationPaise: 10000,
        maxDonationPaise: 50000000,
        explorerBaseUrl: 'https://sepolia.etherscan.io/tx',
      };
    }
  }

  public async getEligibleGrants(): Promise<PaymentGrant[]> {
    try {
      const resp = await apiFetch('/api/grants');
      if (!resp.ok) throw new Error(`Grants fetch failed (${resp.status})`);
      const data = await resp.json();
      return data.grants;
    } catch {
      return [
        {
          id: 'grant-cw-2026-014',
          grantCode: 'CW-2026-014',
          title: 'Clean Water Boreholes & Community Solar Filtration',
          purpose: 'Deep aquifer boreholes, solar pump installations, and community water taps.',
          currency: 'INR',
          minDonationPaise: 10000,
          maxDonationPaise: 50000000,
          status: 'ACTIVE',
        },
        {
          id: 'grant-health-2026-088',
          grantCode: 'HL-2026-088',
          title: 'Rural Primary Healthcare Mobile Medical Units',
          purpose: 'Essential diagnostic medical equipment and cold-chain vaccine transports for remote clinics.',
          currency: 'INR',
          minDonationPaise: 10000,
          maxDonationPaise: 50000000,
          status: 'ACTIVE',
        },
      ];
    }
  }

  public async getPublicDonations(): Promise<any[]> {
    try {
      const resp = await apiFetch('/api/donations');
      if (!resp.ok) return [];
      const data = await resp.json();
      return data.donations || [];
    } catch {
      return [];
    }
  }

  public async createOrder(params: {
    grantId: string;
    amountPaise: number;
    donorName?: string;
    donorEmail?: string;
    donorContact?: string;
  }): Promise<DonationOrderResponse> {
    const resp = await apiFetch('/api/payments/razorpay/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Order creation failed' }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    return resp.json();
  }

  public async verifyPayment(params: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): Promise<VerificationResponse> {
    const resp = await apiFetch('/api/payments/razorpay/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Payment verification failed' }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    return resp.json();
  }

  public async getDonationProof(donationId: string): Promise<ProofPackageResponse> {
    const resp = await apiFetch(`/api/donations/${donationId}/proof`);
    if (!resp.ok) {
      throw new Error(`Failed to load proof package: HTTP ${resp.status}`);
    }
    return resp.json();
  }

  public async submitDirectBankDonation(params: {
    grantId: string;
    amountRupees: number;
    donorName?: string;
    donorEmail?: string;
    bankReferenceUtr: string;
    idempotencyKey?: string;
  }): Promise<DirectBankDonationResponse> {
    const resp = await apiFetch('/api/donations/direct-bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Direct bank donation submission failed' }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    return resp.json();
  }

  public async loadRazorpayScript(): Promise<boolean> {
    if (typeof (window as any).Razorpay !== 'undefined') return true;
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  public async retryAnchor(donationId: string): Promise<any> {
    const resp = await apiFetch(`/api/donations/${donationId}/retry-anchor`, {
      method: 'POST',
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Anchor retry failed' }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }
    return resp.json();
  }
}

