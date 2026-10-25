export interface FiatAnchorRecord {
  paymentCommitment: string;
  grantRefHash: string;
  amountPaise: number;
  currencyCode: string;
  relayer: string;
  timestamp: number;
  blockNumber: number;
}

export interface FiatAnchorExecutionResult {
  success: boolean;
  txHash: string;
  blockNumber: number;
  gasUsed: number;
  error?: string;
  eventEmitted?: {
    name: 'FiatDonationAnchored';
    params: {
      paymentCommitment: string;
      grantRefHash: string;
      amountPaise: number;
      currencyCode: string;
      relayer: string;
      timestamp: number;
      blockNumber: number;
    };
  };
}

/**
 * FiatAnchorContractService
 * Deterministic EVM execution model reflecting smart ledger/contracts/evm/TrustFabricFiatAnchor.sol
 */
export class FiatAnchorContractService {
  public owner: string;
  public authorizedRelayer: string;
  private anchors: Map<string, FiatAnchorRecord> = new Map();
  private commitmentList: string[] = [];
  private currentBlockNumber = 7248200;

  constructor(ownerAddress = '0xOwnerSafeSepolia001', relayerAddress = '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720') {
    this.owner = ownerAddress;
    this.authorizedRelayer = relayerAddress;
  }

  public setRelayer(caller: string, newRelayer: string): { success: boolean; error?: string } {
    if (caller.toLowerCase() !== this.owner.toLowerCase()) {
      return { success: false, error: 'UnauthorizedCaller: Only owner can update relayer' };
    }
    if (!newRelayer || newRelayer === '0x0000000000000000000000000000000000000000') {
      return { success: false, error: 'ZeroAddressNotAllowed' };
    }
    this.authorizedRelayer = newRelayer;
    return { success: true };
  }

  public recordFiatDonation(params: {
    caller: string;
    grantRefHash: string;
    paymentCommitment: string;
    amountPaise: number;
    currencyCode?: string;
  }): FiatAnchorExecutionResult {
    const { caller, grantRefHash, paymentCommitment, amountPaise, currencyCode = 'INR' } = params;

    // Access control: only authorized relayer or contract owner
    if (
      caller.toLowerCase() !== this.authorizedRelayer.toLowerCase() &&
      caller.toLowerCase() !== this.owner.toLowerCase()
    ) {
      return {
        success: false,
        txHash: '',
        blockNumber: 0,
        gasUsed: 0,
        error: `UnauthorizedCaller: ${caller} is not the authorized relayer`,
      };
    }

    if (!paymentCommitment || paymentCommitment === '0x' + '0'.repeat(64)) {
      return {
        success: false,
        txHash: '',
        blockNumber: 0,
        gasUsed: 0,
        error: 'ZeroCommitmentNotAllowed',
      };
    }

    if (!amountPaise || amountPaise <= 0) {
      return {
        success: false,
        txHash: '',
        blockNumber: 0,
        gasUsed: 0,
        error: 'ZeroAmountNotAllowed',
      };
    }

    // Replay / Duplicate commitment rejection
    if (this.anchors.has(paymentCommitment)) {
      return {
        success: false,
        txHash: '',
        blockNumber: 0,
        gasUsed: 0,
        error: `DuplicatePaymentCommitment: Commitment ${paymentCommitment} is already anchored on-chain`,
      };
    }

    this.currentBlockNumber += 1;
    const now = Math.floor(Date.now() / 1000);
    const txHash = '0x' + '9f' + paymentCommitment.slice(4) ;

    const record: FiatAnchorRecord = {
      paymentCommitment,
      grantRefHash,
      amountPaise,
      currencyCode,
      relayer: caller,
      timestamp: now,
      blockNumber: this.currentBlockNumber,
    };

    this.anchors.set(paymentCommitment, record);
    this.commitmentList.push(paymentCommitment);

    return {
      success: true,
      txHash,
      blockNumber: this.currentBlockNumber,
      gasUsed: 46820,
      eventEmitted: {
        name: 'FiatDonationAnchored',
        params: {
          paymentCommitment,
          grantRefHash,
          amountPaise,
          currencyCode,
          relayer: caller,
          timestamp: now,
          blockNumber: this.currentBlockNumber,
        },
      },
    };
  }

  public getAnchor(paymentCommitment: string): { exists: boolean; record?: FiatAnchorRecord } {
    const record = this.anchors.get(paymentCommitment);
    return {
      exists: !!record,
      record,
    };
  }

  public totalAnchored(): number {
    return this.commitmentList.length;
  }
}
