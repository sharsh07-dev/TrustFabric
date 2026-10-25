/**
 * TrustFabric Bridge & Swap Flow Adapter
 * Models multi-hop crypto transitions, cross-chain bridge proofs, and DEX swaps.
 * Satisfies PS42-R11, PS42-R12, AT-FLOW-04 to AT-FLOW-06.
 */

import { type FlowEdge, type FinancialEvent } from '../../types/trustfabric';

export interface BridgeProofRecord {
  bridgeProtocol: string;
  sourceChainId: string;
  sourceTxHash: string;
  destinationChainId: string;
  destinationTxHash: string;
  lockBlockNumber: number;
  mintBlockNumber: number;
  validatorSignatures: string[];
  relayerFeeMinor: number;
  isConfirmed: boolean;
}

export interface SwapExecutionRecord {
  dexProtocol: string;
  txHash: string;
  chainId: string;
  assetIn: string;
  amountInMinor: number;
  assetOut: string;
  amountOutMinor: number;
  effectiveRate: number;
  slippageTolerancePercent: number;
  protocolFeeMinor: number;
  gasCostMinor: number;
}

export class BridgeSwapAdapter {
  /**
   * Reconciles a bridge lock event with its corresponding destination mint event
   */
  public static reconcileBridgeHop(
    lockEvent: FinancialEvent,
    mintEvent?: FinancialEvent,
    proof?: BridgeProofRecord
  ): FlowEdge {
    if (!mintEvent || !proof || !proof.isConfirmed) {
      // Gap detected! Destination event or validator proof is missing.
      // PS42-R12 & PS42-R20: Must preserve as UNRECONCILED rather than guessing.
      return {
        id: `edge-bridge-${lockEvent.id}-missing`,
        grantId: lockEvent.grantId,
        fromEventId: lockEvent.id,
        toEventId: mintEvent ? mintEvent.id : 'UNRESOLVED_DESTINATION_HOP',
        edgeType: 'BRIDGE',
        amountInMinor: lockEvent.amountMinor,
        assetIn: lockEvent.assetId,
        amountOutMinor: mintEvent ? mintEvent.amountMinor : 0,
        assetOut: mintEvent ? mintEvent.assetId : lockEvent.assetId,
        feeMinor: proof?.relayerFeeMinor || 0,
        rate: 1.0,
        linkEvidenceId: proof ? `proof-${proof.sourceTxHash.substring(0, 8)}` : undefined,
        linkStatus: 'UNRECONCILED',
        confidenceReason: 'UNRECONCILED: Bridge destination proof or validator signatures are incomplete.',
      };
    }

    return {
      id: `edge-bridge-${lockEvent.id}-${mintEvent.id}`,
      grantId: lockEvent.grantId,
      fromEventId: lockEvent.id,
      toEventId: mintEvent.id,
      edgeType: 'BRIDGE',
      amountInMinor: lockEvent.amountMinor,
      assetIn: lockEvent.assetId,
      amountOutMinor: mintEvent.amountMinor,
      assetOut: mintEvent.assetId,
      feeMinor: proof.relayerFeeMinor,
      rate: mintEvent.amountMinor / lockEvent.amountMinor,
      linkEvidenceId: `proof-${proof.sourceTxHash.substring(0, 8)}`,
      linkStatus: 'VERIFIED',
      confidenceReason: `VERIFIED: Cross-chain proof confirmed on ${proof.bridgeProtocol} with ${proof.validatorSignatures.length} validator signatures.`,
    };
  }

  /**
   * Reconciles a DEX token swap
   */
  public static reconcileSwapHop(
    swapEvent: FinancialEvent,
    swapRecord: SwapExecutionRecord
  ): FlowEdge {
    return {
      id: `edge-swap-${swapEvent.id}`,
      grantId: swapEvent.grantId,
      fromEventId: swapEvent.id,
      toEventId: swapEvent.id,
      edgeType: 'SWAP',
      amountInMinor: swapRecord.amountInMinor,
      assetIn: swapRecord.assetIn,
      amountOutMinor: swapRecord.amountOutMinor,
      assetOut: swapRecord.assetOut,
      feeMinor: swapRecord.protocolFeeMinor + swapRecord.gasCostMinor,
      rate: swapRecord.effectiveRate,
      linkEvidenceId: `swap-proof-${swapRecord.txHash.substring(0, 8)}`,
      linkStatus: 'VERIFIED',
      confidenceReason: `VERIFIED: Executed on ${swapRecord.dexProtocol} at rate ${swapRecord.effectiveRate} with fee ${swapRecord.protocolFeeMinor / 100} ${swapRecord.assetIn}.`,
    };
  }
}
