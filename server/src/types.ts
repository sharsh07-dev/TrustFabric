export type DonationState =
  | 'CREATED'
  | 'CHECKOUT_OPEN'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'CAPTURED_ANCHOR_PENDING'
  | 'ANCHORED'
  | 'ANCHOR_FAILED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type EnvironmentMode = 'TEST' | 'LIVE';

export interface DonationIntent {
  id: string;
  donationCode: string;
  grantId: string;
  donorId?: string;
  amountPaise: number; // integer paise
  currency: 'INR';
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  state: DonationState;
  environment: EnvironmentMode;
  idempotencyKey: string;
  clientMetadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface RazorpayWebhookEvent {
  id: string;
  providerEventId: string;
  eventType: string;
  orderId?: string;
  paymentId?: string;
  signatureVerified: boolean;
  processingState: 'RECEIVED' | 'PROCESSED' | 'DUPLICATE_IGNORED' | 'FAILED';
  payloadSafeMetadata: Record<string, any>;
  receivedAt: string;
  processedAt?: string;
}

export interface PaymentVerificationEvent {
  id: string;
  donationIntentId: string;
  verificationSource: 'CHECKOUT_CALLBACK' | 'RAZORPAY_API_POLL' | 'WEBHOOK';
  signatureValid: boolean;
  amountMatched: boolean;
  currencyMatched: boolean;
  statusAuthoritative: string;
  reasonCode: string;
  rawResponseDigest: string;
  verifiedAt: string;
}

export interface OnchainPaymentAnchor {
  id: string;
  donationIntentId: string;
  paymentCommitment: string;
  commitmentSalt: string;
  grantRefHash: string;
  chainId: number;
  networkName: string;
  contractAddress: string;
  relayerAddress: string;
  txHash: string;
  blockNumber: number;
  gasUsed: number;
  receiptStatus: 'SUCCESS' | 'REVERTED' | 'PENDING';
  status: 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'REVERTED' | 'RETRY_PENDING';
  retryCount: number;
  explorerUrl: string;
  createdAt: string;
  confirmedAt?: string;
}

export interface PaymentAuditEvent {
  id: string;
  sequenceNumber: number;
  donationIntentId?: string;
  actorRef: string;
  action: string;
  previousState?: string;
  newState: string;
  payloadHash: string;
  prevEventHash: string;
  eventHash: string;
  createdAt: string;
}

export interface ActiveGrant {
  id: string;
  grantCode: string;
  title: string;
  purpose: string;
  currency: 'INR';
  minDonationPaise: number;
  maxDonationPaise: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
}
