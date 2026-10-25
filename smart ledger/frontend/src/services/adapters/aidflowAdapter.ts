/**
 * TrustFabric AidFlow & Soroban Contract Adapter
 * Connects TrustFabric domain events to AidFlow's Stellar/Soroban contracts
 * (FundPool, BeneficiaryRegistry, MilestoneEngine, Distribution, Audit).
 * Satisfies PS42-R02, PS42-R04, and 09_QUARTZ_AND_AIDFLOW_GUIDANCE.md.
 */

export interface SorobanContractRegistry {
  fundPoolId: string;
  distributionId: string;
  registryId: string;
  milestoneEngineId: string;
  auditId: string;
  usdcAssetContract: string;
  networkPassphrase: string;
  rpcUrl: string;
}

export const AIDFLOW_SOROBAN_TESTNET_CONFIG: SorobanContractRegistry = {
  fundPoolId: 'CA7Q88219HNA891KANOXXXXXX99824HJA891823HNA14V9K',
  distributionId: 'CB3M991823HNA1CA7Q88219HNA891KANOXXXXXX9L2X',
  registryId: 'CD8R182937461829HJKLA881928374HAKLXXXXXX7W4Q',
  milestoneEngineId: 'CE1P99824HJA891823HNA1CA7Q88219HNA891KA5N8Y',
  auditId: 'CF6K891KANOXXXXXX99824HJA891823HNA1CA7Q882M1T',
  usdcAssetContract: 'CC4W881273HNA182937461829HJKLA8819283746H3Z',
  networkPassphrase: 'Test SDF Network ; September 2015',
  rpcUrl: 'https://soroban-testnet.stellar.org',
};

export class AidflowAdapter {
  private config: SorobanContractRegistry;

  constructor(customConfig?: Partial<SorobanContractRegistry>) {
    this.config = { ...AIDFLOW_SOROBAN_TESTNET_CONFIG, ...customConfig };
  }

  public getConfig(): SorobanContractRegistry {
    return { ...this.config };
  }

  /**
   * Translates a TrustFabric allocation to Soroban Milestone invocation
   */
  public generateSorobanInvocation(params: {
    milestoneId: number;
    beneficiaryAddress: string;
    amountUsdc: number;
    conditionType: 'ManualApproval' | 'DeliveryVerification';
  }) {
    return {
      contract: this.config.milestoneEngineId,
      method: 'set_milestone_condition',
      args: {
        milestone_id: params.milestoneId,
        beneficiary: params.beneficiaryAddress,
        amount: params.amountUsdc,
        condition: params.conditionType,
      },
      simulatedLedger: 54109435,
    };
  }

  /**
   * Generates Soroban transaction payload for audit contract logging
   */
  public generateSorobanAuditLog(params: {
    eventType: string;
    actor: string;
    amount?: number;
    txHash: string;
  }) {
    return {
      contract: this.config.auditId,
      method: 'log_event',
      args: {
        event_type: params.eventType,
        actor: params.actor,
        amount: params.amount || 0,
        tx_hash: params.txHash,
      },
      network: 'Stellar Soroban Testnet',
    };
  }
}
