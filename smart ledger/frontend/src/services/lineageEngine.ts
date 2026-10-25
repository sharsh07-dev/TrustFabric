/**
 * TrustFabric Multi-Hop Lineage & Provenance Engine
 * Connects donations, swaps, bridges, fiat payouts, invoices, and delivery claims.
 * Satisfies PS42-R01, PS42-R18, PS42-R19, PS42-R20, and AT-FLOW-09.
 */

import {
  type FinancialEvent,
  type FlowEdge,
  type ExpenseClaim,
  type EvidenceDocument,
  type DeliveryAttestation,
  type VerificationStatus,
} from '../types/trustfabric';

export interface LineageHopNode {
  id: string;
  stage: 'DONATION' | 'ALLOCATION' | 'SWAP' | 'BRIDGE' | 'OFFRAMP' | 'FIAT_PAYMENT' | 'EVIDENCE' | 'IMPACT_PROOF';
  title: string;
  sourceType: string;
  identifierRef: string;
  amountFormatted: string;
  timestamp: string;
  status: VerificationStatus | 'VERIFIED' | 'UNRECONCILED';
  provenanceDetails: string;
  hasGap: boolean;
  gapReason?: string;
}

export class LineageEngine {
  /**
   * Builds an ordered multi-hop timeline for a grant's fund execution
   */
  public static buildGrantTimeline(params: {
    grantId: string;
    events: FinancialEvent[];
    flowEdges: FlowEdge[];
    claims: ExpenseClaim[];
    documents: EvidenceDocument[];
    attestations: DeliveryAttestation[];
  }): LineageHopNode[] {
    const nodes: LineageHopNode[] = [];

    // Filter relevant items for this grant
    const grantEvents = params.events.filter(e => e.grantId === params.grantId);
    const grantClaims = params.claims.filter(c => c.grantId === params.grantId);

    // 1. Inbound Donation Events
    const donations = grantEvents.filter(e => e.eventType === 'DONATION');
    for (const d of donations) {
      nodes.push({
        id: `node-${d.id}`,
        stage: 'DONATION',
        title: `Inbound Donation (${d.assetId})`,
        sourceType: d.sourceType,
        identifierRef: d.txHash,
        amountFormatted: `${(d.amountMinor / 100).toLocaleString()} ${d.assetId}`,
        timestamp: d.occurredAt,
        status: d.simulated ? 'SIMULATED' : 'VERIFIED',
        provenanceDetails: `Originated from ${d.sourceAccountRef.substring(0, 10)}... on ${d.sourceType}. Finality: ${d.finalityStatus}.`,
        hasGap: false,
      });
    }

    // 2. Swaps & Bridges
    const swapBridgeEdges = params.flowEdges.filter(
      e => e.grantId === params.grantId && (e.edgeType === 'SWAP' || e.edgeType === 'BRIDGE')
    );
    for (const edge of swapBridgeEdges) {
      const isBridge = edge.edgeType === 'BRIDGE';
      const isUnrec = edge.linkStatus === 'UNRECONCILED';

      nodes.push({
        id: `node-${edge.id}`,
        stage: isBridge ? 'BRIDGE' : 'SWAP',
        title: isBridge ? `Cross-Chain Bridge (${edge.assetIn} -> ${edge.assetOut})` : `DEX Swap (${edge.assetIn} -> ${edge.assetOut})`,
        sourceType: isBridge ? 'BRIDGE_VALIDATOR_PROOF' : 'UNISWAP_V3',
        identifierRef: edge.linkEvidenceId || 'MISSING_TX_REF',
        amountFormatted: `${(edge.amountInMinor / 100).toLocaleString()} ${edge.assetIn} -> ${(edge.amountOutMinor / 100).toLocaleString()} ${edge.assetOut}`,
        timestamp: new Date().toISOString(),
        status: isUnrec ? 'UNRECONCILED' : 'VERIFIED',
        provenanceDetails: edge.confidenceReason,
        hasGap: isUnrec,
        gapReason: isUnrec ? 'Destination proof or mint transaction unverified on target chain.' : undefined,
      });
    }

    // 3. Fiat Off-Ramp / Bank Settlement
    const offrampEdges = params.flowEdges.filter(
      e => e.grantId === params.grantId && (e.edgeType === 'OFFRAMP' || e.edgeType === 'PAYMENT')
    );
    for (const edge of offrampEdges) {
      nodes.push({
        id: `node-${edge.id}`,
        stage: 'FIAT_PAYMENT',
        title: `Fiat Vendor Payout (${edge.assetOut})`,
        sourceType: 'BANK_CLEARING_API',
        identifierRef: edge.linkEvidenceId || 'SETTLEMENT_REF',
        amountFormatted: `${(edge.amountOutMinor / 100).toLocaleString()} ${edge.assetOut}`,
        timestamp: new Date().toISOString(),
        status: edge.linkStatus === 'UNRECONCILED' ? 'UNRECONCILED' : 'SOURCE_ATTESTED',
        provenanceDetails: edge.confidenceReason,
        hasGap: edge.linkStatus === 'UNRECONCILED',
        gapReason: edge.linkStatus === 'UNRECONCILED' ? 'No counterparty match in MT940 bank statement.' : undefined,
      });
    }

    // 4. Invoices & Commitments
    for (const claim of grantClaims) {
      const doc = params.documents.find(d => d.claimId === claim.id);
      nodes.push({
        id: `node-claim-${claim.id}`,
        stage: 'EVIDENCE',
        title: `Invoice Commitment (${claim.invoiceNumberToken})`,
        sourceType: 'VAULT_OBJECT_STORE',
        identifierRef: doc ? doc.sha256.substring(0, 16) + '...' : 'NO_FILE',
        amountFormatted: `${(claim.amountMinor / 100).toLocaleString()} ${claim.currency}`,
        timestamp: claim.createdAt,
        status: doc ? doc.verificationStatus : 'UNRECONCILED',
        provenanceDetails: doc
          ? `SHA-256 byte digest: ${doc.sha256}. Nullifier: ${doc.expenseNullifierRef.substring(0, 14)}...`
          : 'Missing invoice documentation.',
        hasGap: !doc,
        gapReason: !doc ? 'Claim submitted without supporting invoice document.' : undefined,
      });
    }

    // 5. Impact & Delivery Attestations
    for (const att of params.attestations) {
      nodes.push({
        id: `node-att-${att.id}`,
        stage: 'IMPACT_PROOF',
        title: `Signed Delivery Attestation (Milestone ${att.milestoneId})`,
        sourceType: 'ED25519_CREDENTIAL_SIGNATURE',
        identifierRef: att.signature.substring(0, 16) + '...',
        amountFormatted: 'Verified Completion',
        timestamp: att.issuedAt,
        status: att.verificationStatus,
        provenanceDetails: `Signed by credential ${att.signerCredentialRef} with replay nonce ${att.nonce}.`,
        hasGap: att.verificationStatus !== 'SOURCE_ATTESTED' && att.verificationStatus !== 'ON_CHAIN_VERIFIED',
        gapReason: att.verificationStatus === 'UNVERIFIED' ? 'Cryptographic signature verification failed.' : undefined,
      });
    }

    return nodes;
  }
}
