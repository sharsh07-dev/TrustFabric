/**
 * @file index.ts
 * Main entry point for the AidFlow TypeScript SDK.
 *
 * Provides typed wrappers around all AidFlow Soroban contract interactions.
 *
 * ## Usage
 * ```typescript
 * import { AidFlowClient } from '@aidflow/sdk';
 *
 * const client = new AidFlowClient({
 *   networkPassphrase: Networks.TESTNET,
 *   rpcUrl: 'https://soroban-testnet.stellar.org',
 *   contracts: { ... }
 * });
 *
 * await client.fundPool.donate({ donor: 'G...', amount: 100_000_000n });
 * ```
 *
 * ## TODO (Contributors Welcome)
 * - TODO(intermediate): Add retry logic with exponential backoff for RPC failures
 * - TODO(intermediate): Add transaction fee estimation before submission
 * - TODO(advanced): Add event subscription / polling for contract events
 * - TODO(advanced): Add multi-sig transaction building support
 */

import {
  Contract,
  Keypair,
  Networks,
  rpc as StellarRpc,
  TransactionBuilder,
  BASE_FEE,
  xdr,
  Address,
  nativeToScVal,
  scValToNative,
} from "@stellar/stellar-sdk";

import {
  AidFlowConfig,
  AidFlowContracts,
  DonateParams,
  DonationRecord,
  RegisterBeneficiaryParams,
  BeneficiaryRecord,
  AllocateFundsParams,
  Allocation,
  CreateMilestoneParams,
  Milestone,
  AuditEvent,
  TransactionResult,
  BeneficiaryMetadata,
} from "./types";

export * from "./types";

// ─── Base Contract Client ─────────────────────────────────────────────────────

/**
 * Base class for all contract clients.
 * Handles transaction building and submission.
 *
 * TODO(intermediate): Extract transaction building into a separate TransactionManager class
 */
abstract class BaseContractClient {
  protected server: StellarRpc.Server;
  protected contractId: string;
  protected networkPassphrase: string;

  constructor(
    contractId: string,
    rpcUrl: string,
    networkPassphrase: string
  ) {
    this.contractId = contractId;
    this.networkPassphrase = networkPassphrase;
    this.server = new StellarRpc.Server(rpcUrl, { allowHttp: true });
  }

  /**
   * Build and submit a contract invocation transaction.
   *
   * @param keypair - The signing keypair
   * @param method - The contract method name
   * @param args - XDR arguments for the method
   */
  protected async invokeContract(
    keypair: Keypair,
    method: string,
    args: xdr.ScVal[]
  ): Promise<TransactionResult> {
    const account = await this.server.getAccount(keypair.publicKey());

    const contract = new Contract(this.contractId);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    // Simulate first to get accurate fees and check for errors
    const simResult = await this.server.simulateTransaction(tx);

    if (StellarRpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulation failed: ${simResult.error}`);
    }

    // Assemble the transaction with the simulation result
    const preparedTx = StellarRpc.assembleTransaction(tx, simResult).build();
    preparedTx.sign(keypair);

    const sendResult = await this.server.sendTransaction(preparedTx);

    if (sendResult.status === "ERROR") {
      throw new Error(`Transaction failed: ${sendResult.errorResult}`);
    }

    // Poll for confirmation
    // TODO(intermediate): Add configurable timeout and polling interval
    let txResult = await this.server.getTransaction(sendResult.hash);
    let attempts = 0;
    while (txResult.status === "NOT_FOUND" && attempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      txResult = await this.server.getTransaction(sendResult.hash);
      attempts++;
    }

    if (txResult.status === "SUCCESS") {
      return {
        hash: sendResult.hash,
        success: true,
        value:
          txResult.returnValue
            ? scValToNative(txResult.returnValue)
            : undefined,
      };
    }

    throw new Error(`Transaction not confirmed after ${attempts} attempts`);
  }

  /**
   * Call a read-only (view) contract function.
   * Does not require a keypair — uses simulation only.
   */
  protected async callContract(
    method: string,
    args: xdr.ScVal[],
    sourceAccount?: string
  ): Promise<unknown> {
    // For view functions, we use a simulated transaction
    // The source account doesn't need funds for simulation
    const source = sourceAccount ?? "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

    const account = await this.server.getAccount(source).catch(() => {
      // If account doesn't exist on testnet, use a default
      return { accountId: () => source, sequenceNumber: () => "0", incrementSequenceNumber: () => {} } as any;
    });

    const contract = new Contract(this.contractId);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const simResult = await this.server.simulateTransaction(tx);

    if (StellarRpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulation error: ${simResult.error}`);
    }

    if (!("result" in simResult) || !simResult.result) {
      return undefined;
    }

    return scValToNative(simResult.result.retval);
  }
}

// ─── FundPool Client ──────────────────────────────────────────────────────────

/**
 * Client for interacting with the FundPool contract.
 */
export class FundPoolClient extends BaseContractClient {
  /**
   * Donate tokens to the AidFlow fund pool.
   *
   * @param params - Donation parameters
   * @param keypair - Donor's signing keypair
   */
  async donate(params: DonateParams, keypair: Keypair): Promise<TransactionResult> {
    return this.invokeContract(keypair, "donate", [
      new Address(params.donor).toScVal(),
      nativeToScVal(params.amount, { type: "i128" }),
    ]);
  }

  /**
   * Get the total funds currently held in the pool.
   */
  async getTotalFunds(): Promise<bigint> {
    const result = await this.callContract("get_total_funds", []);
    return BigInt(result as string);
  }

  /**
   * Get donation history for a specific donor.
   *
   * @param donorAddress - Stellar address of the donor
   */
  async getDonorHistory(donorAddress: string): Promise<DonationRecord[]> {
    const result = await this.callContract("get_donor_history", [
      new Address(donorAddress).toScVal(),
    ]);

    // TODO(contributor): Map raw XDR result to typed DonationRecord[]
    // The raw result needs to be deserialized from the Soroban Vec<DonationRecord> format
    return (result as any[]) ?? [];
  }
}

// ─── Beneficiary Registry Client ──────────────────────────────────────────────

/**
 * Client for interacting with the BeneficiaryRegistry contract.
 */
export class RegistryClient extends BaseContractClient {
  /**
   * Register a new beneficiary in the registry.
   *
   * @param params - Registration parameters
   * @param keypair - Admin keypair
   */
  async registerBeneficiary(
    params: RegisterBeneficiaryParams,
    keypair: Keypair
  ): Promise<TransactionResult> {
    // Build the metadata struct as a ScVal map
    // TODO(intermediate): Simplify this with a helper utility function
    const metadataMap = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("name"),
        val: xdr.ScVal.scvBytes(Buffer.from(params.metadata.name)),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("region"),
        val: xdr.ScVal.scvBytes(Buffer.from(params.metadata.region)),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("category"),
        val: xdr.ScVal.scvBytes(Buffer.from(params.metadata.category)),
      }),
    ]);

    return this.invokeContract(keypair, "register_beneficiary", [
      new Address(params.address).toScVal(),
      metadataMap,
    ]);
  }

  /**
   * Verify a registered beneficiary.
   *
   * @param beneficiaryAddress - Address to verify
   * @param keypair - Admin keypair
   */
  async verifyBeneficiary(
    beneficiaryAddress: string,
    keypair: Keypair
  ): Promise<TransactionResult> {
    return this.invokeContract(keypair, "verify_beneficiary", [
      new Address(beneficiaryAddress).toScVal(),
    ]);
  }

  /**
   * Deactivate a beneficiary.
   */
  async deactivateBeneficiary(
    beneficiaryAddress: string,
    keypair: Keypair
  ): Promise<TransactionResult> {
    return this.invokeContract(keypair, "deactivate_beneficiary", [
      new Address(beneficiaryAddress).toScVal(),
    ]);
  }

  /**
   * Fetch a beneficiary's record.
   */
  async getBeneficiary(address: string): Promise<BeneficiaryRecord | null> {
    try {
      const result = await this.callContract("get_beneficiary", [
        new Address(address).toScVal(),
      ]);
      // TODO(contributor): Properly deserialize the BeneficiaryRecord from ScVal
      return result as BeneficiaryRecord;
    } catch {
      return null;
    }
  }

  /**
   * List all registered beneficiary addresses.
   */
  async listBeneficiaries(): Promise<string[]> {
    const result = await this.callContract("list_beneficiaries", []);
    return (result as string[]) ?? [];
  }

  /**
   * Check if an address is an eligible (verified + active) beneficiary.
   */
  async isEligible(address: string): Promise<boolean> {
    const result = await this.callContract("is_eligible", [
      new Address(address).toScVal(),
    ]);
    return Boolean(result);
  }
}

// ─── Distribution Client ──────────────────────────────────────────────────────

/**
 * Client for interacting with the Distribution Engine contract.
 */
export class DistributionClient extends BaseContractClient {
  /**
   * Allocate funds to a beneficiary.
   *
   * @param params - Allocation parameters
   * @param keypair - Admin keypair
   * @returns The allocation ID
   */
  async allocateFunds(
    params: AllocateFundsParams,
    keypair: Keypair
  ): Promise<number> {
    const result = await this.invokeContract(keypair, "allocate_funds", [
      new Address(params.beneficiary).toScVal(),
      nativeToScVal(params.amount, { type: "i128" }),
      nativeToScVal(params.milestoneId ?? 0, { type: "u32" }),
    ]);

    return Number(result.value);
  }

  /**
   * Release an allocated amount to a beneficiary.
   *
   * @param allocationId - The allocation ID to release
   * @param keypair - Admin keypair
   */
  async releaseFunds(
    allocationId: number,
    keypair: Keypair
  ): Promise<TransactionResult> {
    return this.invokeContract(keypair, "release_funds", [
      nativeToScVal(allocationId, { type: "u32" }),
    ]);
  }

  /**
   * Cancel a pending allocation.
   */
  async cancelAllocation(
    allocationId: number,
    keypair: Keypair
  ): Promise<TransactionResult> {
    return this.invokeContract(keypair, "cancel_allocation", [
      nativeToScVal(allocationId, { type: "u32" }),
    ]);
  }

  /**
   * Fetch a specific allocation by ID.
   */
  async getAllocation(allocationId: number): Promise<Allocation | null> {
    try {
      const result = await this.callContract("get_allocation", [
        nativeToScVal(allocationId, { type: "u32" }),
      ]);
      // TODO(contributor): Deserialize Allocation from ScVal properly
      return result as Allocation;
    } catch {
      return null;
    }
  }

  /**
   * Get all allocation IDs for a beneficiary.
   */
  async getBeneficiaryAllocations(address: string): Promise<number[]> {
    const result = await this.callContract("get_beneficiary_allocations", [
      new Address(address).toScVal(),
    ]);
    return (result as number[]) ?? [];
  }
}

// ─── Milestone Client ──────────────────────────────────────────────────────────

/**
 * Client for interacting with the MilestoneEngine contract.
 *
 * TODO(intermediate): Add convenience methods for common milestone patterns
 */
export class MilestoneClient extends BaseContractClient {
  /**
   * Create a new milestone for a beneficiary.
   *
   * @returns The milestone ID
   */
  async createMilestone(
    params: CreateMilestoneParams,
    keypair: Keypair
  ): Promise<number> {
    const conditionMap = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("condition_type"),
        val: nativeToScVal(params.condition.conditionType, { type: "u32" }),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("data"),
        val: nativeToScVal(params.condition.data, { type: "u32" }),
      }),
    ]);

    const result = await this.invokeContract(keypair, "create_milestone", [
      new Address(params.beneficiary).toScVal(),
      conditionMap,
    ]);

    return Number(result.value);
  }

  /**
   * Manually approve a milestone.
   */
  async approveMilestone(
    milestoneId: number,
    keypair: Keypair
  ): Promise<TransactionResult> {
    return this.invokeContract(keypair, "approve_milestone", [
      nativeToScVal(milestoneId, { type: "u32" }),
    ]);
  }

  /**
   * Check if a milestone has been met.
   */
  async isMilestoneMet(milestoneId: number): Promise<boolean> {
    const result = await this.callContract("is_milestone_met", [
      nativeToScVal(milestoneId, { type: "u32" }),
    ]);
    return Boolean(result);
  }

  /**
   * Fetch the full milestone record.
   */
  async getMilestone(milestoneId: number): Promise<Milestone | null> {
    try {
      const result = await this.callContract("get_milestone", [
        nativeToScVal(milestoneId, { type: "u32" }),
      ]);
      return result as Milestone;
    } catch {
      return null;
    }
  }
}

// ─── Audit Client ──────────────────────────────────────────────────────────────

/**
 * Client for querying the Audit module.
 */
export class AuditClient extends BaseContractClient {
  /**
   * Fetch the complete fund flow history.
   *
   * Note: This becomes expensive at high event counts.
   * TODO(contributor): Add pagination once the contract supports it.
   */
  async getFundFlowHistory(): Promise<AuditEvent[]> {
    const result = await this.callContract("get_fund_flow_history", []);
    // TODO(contributor): Deserialize Vec<AuditEvent> from ScVal properly
    return (result as AuditEvent[]) ?? [];
  }

  /**
   * Get all events related to a specific beneficiary.
   */
  async getEventsByBeneficiary(address: string): Promise<AuditEvent[]> {
    const result = await this.callContract("get_events_by_beneficiary", [
      new Address(address).toScVal(),
    ]);
    return (result as AuditEvent[]) ?? [];
  }

  /**
   * Get the total number of logged events.
   */
  async getEventCount(): Promise<number> {
    const result = await this.callContract("get_event_count", []);
    return Number(result);
  }

  /**
   * Fetch a specific event by its ID.
   */
  async getEvent(eventId: number): Promise<AuditEvent | null> {
    try {
      const result = await this.callContract("get_event", [
        nativeToScVal(eventId, { type: "u32" }),
      ]);
      return result as AuditEvent;
    } catch {
      return null;
    }
  }
}

// ─── Main AidFlow Client ───────────────────────────────────────────────────────

/**
 * The top-level AidFlow SDK client.
 * Composes all contract sub-clients into a single interface.
 *
 * @example
 * ```typescript
 * const client = new AidFlowClient({
 *   networkPassphrase: Networks.TESTNET,
 *   rpcUrl: 'https://soroban-testnet.stellar.org',
 *   contracts: {
 *     fundPool: 'CXXX...',
 *     distribution: 'CXXX...',
 *     registry: 'CXXX...',
 *     milestoneEngine: 'CXXX...',
 *     audit: 'CXXX...',
 *   }
 * });
 * ```
 */
export class AidFlowClient {
  /** FundPool contract client */
  public fundPool: FundPoolClient;
  /** BeneficiaryRegistry contract client */
  public registry: RegistryClient;
  /** Distribution Engine client */
  public distribution: DistributionClient;
  /** Milestone Engine client */
  public milestone: MilestoneClient;
  /** Audit module client */
  public audit: AuditClient;

  constructor(config: AidFlowConfig) {
    const { rpcUrl, networkPassphrase, contracts } = config;

    this.fundPool = new FundPoolClient(contracts.fundPool, rpcUrl, networkPassphrase);
    this.registry = new RegistryClient(contracts.registry, rpcUrl, networkPassphrase);
    this.distribution = new DistributionClient(contracts.distribution, rpcUrl, networkPassphrase);
    this.milestone = new MilestoneClient(contracts.milestoneEngine, rpcUrl, networkPassphrase);
    this.audit = new AuditClient(contracts.audit, rpcUrl, networkPassphrase);
  }
}

// Re-export Networks for convenience
export { Networks };
