/**
 * TrustFabric Deterministic Demo Seed Dataset
 * Matches CASCADE '26 Theme 4 Problem 4.2 Demo Runbook (10_DEMO_RUNBOOK.md)
 * All records strictly labeled SIMULATED.
 */

import {
  type Grant,
  type Allocation,
  type FinancialEvent,
  type FlowEdge,
  type ExpenseClaim,
  type EvidenceDocument,
  type DeliveryAttestation,
  type Report,
  type EscrowCase,
  type BankStatementLine,
} from '../types/trustfabric';
import {
  computeCanonicalCommitment,
  computeExpenseNullifier,
  signCanonicalStatement,
  sha256Hex,
} from './crypto';

export async function createInitialSeedData() {
  const grantId1 = 'grant-cw-2026-014';
  const grantId2 = 'grant-cw-2026-015';

  // 1. Grants
  const grants: Grant[] = [
    {
      id: grantId1,
      grantCode: 'CW-2026-014',
      donorId: 'donor-northstar',
      organizationId: 'org-cascade-aid',
      purpose: 'Water Infrastructure & Community Solar Facility',
      currency: 'INR',
      authorizedAmountMinor: 100000000, // ₹10,00,000.00
      allowedCategories: ['Water Infrastructure', 'Sanitation Equipment', 'Engineering & Logistics'],
      milestones: [
        {
          id: 'MS-01',
          title: 'Hydrogeological Survey & Deep Well Boring',
          description: 'Survey aquifer depth and drill primary casing to 140m.',
          targetDate: '2026-03-15',
          amountMinor: 35000000, // ₹3,50,000
          conditionType: 'DELIVERY_ATTESTATION',
          isMet: true,
          metAt: '2026-02-18T14:00:00Z',
          proofRef: 'att-ms01-verified',
        },
        {
          id: 'MS-02',
          title: 'Solar Water Purification & Pump Installation',
          description: 'Install 5kW solar array and UV multi-stage filtration pump.',
          targetDate: '2026-04-30',
          amountMinor: 45000000, // ₹4,50,000
          conditionType: 'DELIVERY_ATTESTATION',
          isMet: false,
        },
        {
          id: 'MS-03',
          title: 'Community Distribution Mains & Quality Sign-Off',
          description: 'Lay 1.8km distribution pipes and certify potable water standards.',
          targetDate: '2026-06-15',
          amountMinor: 20000000, // ₹2,00,000
          conditionType: 'DELIVERY_ATTESTATION',
          isMet: false,
        },
      ],
      status: 'ACTIVE',
      createdAt: '2026-01-10T08:00:00Z',
      updatedAt: '2026-02-20T10:00:00Z',
      allocatedMinor: 80000000,
      spentMinor: 4250000,
      unreconciledMinor: 35000000,
      heldMinor: 0,
      remainingMinor: 95750000,
    },
    {
      id: grantId2,
      grantCode: 'CW-2026-015',
      donorId: 'donor-global-horizon',
      organizationId: 'org-cascade-aid',
      purpose: 'Emergency Sanitation & Pipeline Relief',
      currency: 'INR',
      authorizedAmountMinor: 50000000, // ₹5,00,000.00
      allowedCategories: ['Sanitation Equipment', 'Emergency Medical', 'Logistics'],
      milestones: [
        {
          id: 'MS-B1',
          title: 'Emergency Latrine Units & Pipeline Delivery',
          description: 'Deploy 20 rapid sanitation units to sector B.',
          targetDate: '2026-03-25',
          amountMinor: 50000000,
          conditionType: 'DELIVERY_ATTESTATION',
          isMet: false,
        },
      ],
      status: 'ACTIVE',
      createdAt: '2026-02-01T09:00:00Z',
      updatedAt: '2026-02-20T10:00:00Z',
      allocatedMinor: 50000000,
      spentMinor: 0,
      unreconciledMinor: 0,
      heldMinor: 0,
      remainingMinor: 50000000,
    },
  ];

  // 2. Allocations
  const allocations: Allocation[] = [
    {
      id: 'alloc-01',
      grantId: grantId1,
      category: 'Water Infrastructure',
      amountMinor: 35000000,
      currency: 'INR',
      milestoneId: 'MS-01',
      conditionHash: 'COND_HASH_MS01_WATER_INFRA',
      status: 'APPROVED',
      createdAt: '2026-01-15T10:00:00Z',
    },
    {
      id: 'alloc-02',
      grantId: grantId1,
      category: 'Sanitation Equipment',
      amountMinor: 45000000,
      currency: 'INR',
      milestoneId: 'MS-02',
      conditionHash: 'COND_HASH_MS02_SANITATION',
      status: 'APPROVED',
      createdAt: '2026-01-15T10:00:00Z',
    },
  ];

  // 3. Multi-Hop Financial Lineage Events (Ethereum -> Swap -> Polygon Bridge -> Fiat Off-Ramp)
  const events: FinancialEvent[] = [
    {
      id: 'evt-01-donation-eth',
      grantId: grantId1,
      eventType: 'DONATION',
      sourceType: 'ETHEREUM',
      sourceChainId: '1',
      txHash: '0x3a9f817bc2d4e5192837465abcde918273645faebcd0192837465abce1283921',
      blockNumber: 19842100,
      finalityStatus: 'FINALIZED',
      sourceAccountRef: '0x3841A820E9c852445E1c385C28f9A469A3B58dF6',
      destinationRef: '0x71295D0A72Bf4b162A48D5Fa930bE23901B84687',
      assetId: 'ETH',
      amountMinor: 5000000000000, // 50 ETH
      currency: 'ETH',
      feeMinor: 2100000,
      occurredAt: '2026-01-12T08:15:00Z',
      observedAt: '2026-01-12T08:15:45Z',
      provenance: 'Northstar Fund Safe on Ethereum Mainnet (Simulated)',
      simulated: true,
      idempotencyKey: 'ETH_DONATION_CW2026014_0',
    },
    {
      id: 'evt-02-swap-usdc',
      grantId: grantId1,
      eventType: 'SWAP',
      sourceType: 'ETHEREUM',
      sourceChainId: '1',
      txHash: '0x882109abcf3451e92837465abcde918273645faebcd0192837465abce1982734',
      blockNumber: 19842145,
      finalityStatus: 'FINALIZED',
      sourceAccountRef: '0x71295D0A72Bf4b162A48D5Fa930bE23901B84687',
      destinationRef: 'Uniswap V3 ETH/USDC 0.05% Pool',
      assetId: 'USDC',
      amountMinor: 125000000000, // $125,000 USDC
      currency: 'USD',
      feeMinor: 4500000,
      exchangeRate: 2500.0,
      occurredAt: '2026-01-12T09:00:00Z',
      observedAt: '2026-01-12T09:01:10Z',
      provenance: 'Executed via Uniswap V3 Router. Rate: 1 ETH = 2,500 USDC.',
      simulated: true,
      idempotencyKey: 'SWAP_ETH_USDC_CW2026014_1',
    },
    {
      id: 'evt-03-bridge-mint',
      grantId: grantId1,
      eventType: 'BRIDGE_MINT',
      sourceType: 'POLYGON',
      sourceChainId: '137',
      txHash: '0x55192837465abcde918273645faebcd0192837465abce1982734102938475628',
      blockNumber: 54910283,
      finalityStatus: 'FINALIZED',
      sourceAccountRef: 'Polygon PoS Bridge Relayer',
      destinationRef: '0x99281a8F9C4d87213892Bcf981A78B38c21746B3',
      assetId: 'USDC',
      amountMinor: 124850000000, // $124,850 USDC (after $150 relayer fee)
      currency: 'USD',
      feeMinor: 15000000,
      occurredAt: '2026-01-12T10:15:00Z',
      observedAt: '2026-01-12T10:16:30Z',
      provenance: 'Minted on Polygon PoS following proof verification on source bridge.',
      simulated: true,
      idempotencyKey: 'BRIDGE_POLYGON_CW2026014_2',
    },
    {
      id: 'evt-04-bank-fiat-settle',
      grantId: grantId1,
      eventType: 'VENDOR_PAYMENT',
      sourceType: 'BANK_FIAT',
      txHash: 'HDFC-NEFT-20260216-992148109',
      finalityStatus: 'FINALIZED',
      sourceAccountRef: 'HDFC Bank NGO Current A/C #9921****812',
      destinationRef: 'GreenBuild Supplies Ltd Current A/C #1102****391',
      assetId: 'INR',
      amountMinor: 4250000, // ₹42,500.00
      currency: 'INR',
      feeMinor: 500, // ₹5 NEFT fee
      occurredAt: '2026-02-16T11:20:00Z',
      observedAt: '2026-02-16T11:25:00Z',
      provenance: 'Cleared via Reserve Bank of India NEFT Clearing Network (CAMT.053 feed).',
      simulated: true,
      idempotencyKey: 'FIAT_NEFT_INV1047_3',
    },
    // Unexplained transfer (Rule 1 test fixture)
    {
      id: 'evt-05-unexplained-gap',
      grantId: 'UNREGISTERED_ENTITY_88',
      eventType: 'VENDOR_PAYMENT',
      sourceType: 'POLYGON',
      sourceChainId: '137',
      txHash: '0xdeadbeef182937465abce1982734102938475628182937465abcde918273645f',
      blockNumber: 54911000,
      finalityStatus: 'FINALIZED',
      sourceAccountRef: '0x99281a8F9C4d87213892Bcf981A78B38c21746B3',
      destinationRef: '0x7777777777777777777777777777777777777777', // Unknown address
      assetId: 'USDC',
      amountMinor: 1500000000, // $1,500.00
      currency: 'USD',
      feeMinor: 2000,
      occurredAt: '2026-02-17T15:00:00Z',
      observedAt: '2026-02-17T15:02:00Z',
      provenance: 'Direct wallet transfer with no linked allocation ID.',
      simulated: true,
      idempotencyKey: 'UNEXPLAINED_TX_GAP_05',
    },
  ];

  // 4. Flow Edges (including 1 clean bridge edge and 1 missing-proof bridge gap)
  const flowEdges: FlowEdge[] = [
    {
      id: 'edge-01-swap',
      grantId: grantId1,
      fromEventId: 'evt-01-donation-eth',
      toEventId: 'evt-02-swap-usdc',
      edgeType: 'SWAP',
      amountInMinor: 5000000000000,
      assetIn: 'ETH',
      amountOutMinor: 125000000000,
      assetOut: 'USDC',
      feeMinor: 4500000,
      rate: 2500.0,
      linkEvidenceId: 'swap-receipt-0x882109',
      linkStatus: 'VERIFIED',
      confidenceReason: 'VERIFIED: Swap executed with signed DEX liquidity proof.',
    },
    {
      id: 'edge-02-bridge',
      grantId: grantId1,
      fromEventId: 'evt-02-swap-usdc',
      toEventId: 'evt-03-bridge-mint',
      edgeType: 'BRIDGE',
      amountInMinor: 125000000000,
      assetIn: 'USDC',
      amountOutMinor: 124850000000,
      assetOut: 'USDC',
      feeMinor: 15000000,
      rate: 1.0,
      linkEvidenceId: 'proof-bridge-lock-mint-pair',
      linkStatus: 'VERIFIED',
      confidenceReason: 'VERIFIED: Bridge relayer validator signatures verified.',
    },
    // Unreconciled Gap (Rule 7 test fixture)
    {
      id: 'edge-03-unreconciled-gap',
      grantId: grantId1,
      fromEventId: 'evt-03-bridge-mint',
      toEventId: 'evt-unresolved-destination',
      edgeType: 'BRIDGE',
      amountInMinor: 5000000000, // $5,000 USDC
      assetIn: 'USDC',
      amountOutMinor: 0,
      assetOut: 'USDC',
      feeMinor: 0,
      rate: 1.0,
      linkStatus: 'UNRECONCILED',
      confidenceReason: 'UNRECONCILED: Bridge transaction initiated on source but missing destination proof.',
    },
  ];

  // 5. Expense Claim for GreenBuild Supplies INV-1047 (₹42,500)
  const canonicalFields1 = {
    vendorName: 'GreenBuild Supplies Ltd',
    invoiceNumber: 'INV-1047',
    totalAmountMinor: 4250000,
    currency: 'INR',
    date: '2026-02-15',
  };

  const canonicalCommitment1 = await computeCanonicalCommitment(canonicalFields1);
  const nullifier1 = await computeExpenseNullifier(canonicalFields1);
  const cleanDocSha256 = await sha256Hex(
    `SIMULATED_INVOICE_PDF_BYTES_INV1047_${canonicalCommitment1}`
  );

  const claim1Id = 'claim-inv-1047';
  const claims: ExpenseClaim[] = [
    {
      id: claim1Id,
      grantId: grantId1,
      vendorRef: 'GreenBuild Supplies Ltd',
      invoiceNumberToken: 'INV-1047',
      currency: 'INR',
      amountMinor: 4250000, // ₹42,500.00
      invoiceDate: '2026-02-15T09:00:00Z',
      category: 'Water Infrastructure',
      purposeRef: 'Deep well boring casing & heavy PVC filtration piping',
      paymentEventId: 'evt-04-bank-fiat-settle',
      deliveryMilestoneId: 'MS-01',
      claimStatus: 'VERIFIED',
      disbursementStatus: 'RELEASED',
      createdAt: '2026-02-16T08:00:00Z',
      updatedAt: '2026-02-18T15:00:00Z',
    },
    // Category Violation Claim (Rule 2 test fixture)
    {
      id: 'claim-out-of-category-02',
      grantId: grantId1,
      vendorRef: 'Apex Luxury Car Rentals',
      invoiceNumberToken: 'INV-LUX-998',
      currency: 'INR',
      amountMinor: 18000000, // ₹1,80,000
      invoiceDate: '2026-02-18T10:00:00Z',
      category: 'Executive Travel & Luxury Transport', // NOT in allowedCategories!
      purposeRef: 'Chauffeured VIP transportation for regional executives',
      claimStatus: 'REJECTED',
      disbursementStatus: 'ON_HOLD',
      createdAt: '2026-02-18T11:00:00Z',
      updatedAt: '2026-02-18T11:05:00Z',
    },
  ];

  // 6. Evidence Documents
  const documents: EvidenceDocument[] = [
    {
      id: 'doc-inv-1047',
      claimId: claim1Id,
      filename: 'Invoice_INV-1047_GreenBuild.pdf',
      storageKey: 'vault://private_evidence/claim-inv-1047/doc-inv-1047/Invoice_INV-1047_GreenBuild.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 248102,
      sha256: cleanDocSha256,
      canonicalCommitment: canonicalCommitment1,
      expenseNullifierRef: nullifier1,
      extractedFields: {
        vendorName: 'GreenBuild Supplies Ltd',
        invoiceNumber: 'INV-1047',
        date: '2026-02-15',
        totalAmountMinor: 4250000,
        currency: 'INR',
        lineItems: [
          { description: 'Heavy Borehole Steel Casing 140m', amountMinor: 2850000 },
          { description: 'Submersible PVC Distribution Risers', amountMinor: 1400000 },
        ],
        isOcrExtracted: true,
      },
      issuerSignatureRef: 'SIGNER_VENDOR_GREENBUILD',
      verificationStatus: 'SOURCE_ATTESTED',
      uploadedBy: 'finance_officer_rohit',
      uploadedAt: '2026-02-16T08:10:00Z',
    },
  ];

  // 7. Delivery Attestation (Signed by Field Officer with Ed25519)
  const canonicalStatement1 =
    'MILESTONE:MS-01|CLAIM:claim-inv-1047|STMT:Hydrogeological survey confirmed. Deep well casing drilled to 140m. Potable water flow attested.|RECIPIENT_OPAQUE:MASKED_COMMUNITY_WELL_ZONE_4|EVIDENCE_COMMITMENT:' +
    canonicalCommitment1 +
    '|TIME:2026-02-18T14:00:00Z';

  const nonce1 = 'NONCE_FIELD_MS01_991823HNA1';
  const signResult1 = await signCanonicalStatement(
    canonicalStatement1,
    nonce1,
    'SIGNER_FIELD_OFFICER_01'
  );

  const deliveryAttestations: DeliveryAttestation[] = [
    {
      id: 'att-ms01-verified',
      claimId: claim1Id,
      milestoneId: 'MS-01',
      canonicalStatementCommitment: await sha256Hex(canonicalStatement1),
      signerCredentialRef: 'SIGNER_FIELD_OFFICER_01',
      signature: signResult1.signature,
      nonce: nonce1,
      issuedAt: '2026-02-18T14:00:00Z',
      proofRef: 'proof-merkle-ms01-block54109430',
      verificationStatus: 'SOURCE_ATTESTED',
    },
  ];

  // 8. Escrow Cases
  const escrowCases: EscrowCase[] = [
    {
      id: 'esc-claim-inv-1047',
      grantId: grantId1,
      claimId: claim1Id,
      trancheId: 'tranche-inv1047',
      state: 'RELEASED',
      enforcementType: 'APP_HOLD',
      lastTransition: '2026-02-18T15:00:00Z',
      transitionReason: 'All smart-contract policy conditions verified: category valid, evidence matched, delivery signed.',
    },
    {
      id: 'esc-claim-lux',
      grantId: grantId1,
      claimId: 'claim-out-of-category-02',
      trancheId: 'tranche-lux998',
      state: 'ON_HOLD',
      triggerFindingId: 'find-rule2-cat-claim-out-of-category-02',
      enforcementType: 'APP_HOLD',
      lastTransition: '2026-02-18T11:05:00Z',
      transitionReason: 'AUTOMATED POLICY FREEZE: Spending category outside authorized grant scope.',
    },
  ];

  // 9. Self-Published Report with discrepancy (Rule 6 test fixture)
  const reports: Report[] = [
    {
      id: 'rep-q1-2026',
      grantId: grantId1,
      reportPeriod: 'Q1 2026 (Jan - Mar)',
      reportedTotalMinor: 65000000, // ₹6,50,000 self-published claim
      calculatedTotalMinor: 4250000, // ₹42,500 evidence-backed
      differenceMinor: 60750000, // ₹6,07,500 gap!
      evidenceRefs: [claim1Id],
      status: 'DISCREPANCY_FLAGGED',
      generatedAt: '2026-02-20T09:00:00Z',
    },
  ];

  // 10. Bank Statement Fixtures for Fiat Reconciliation
  const bankStatements: BankStatementLine[] = [
    {
      id: 'bank-stmt-01',
      transactionDate: '2026-02-16',
      clearingDate: '2026-02-16',
      bankAccountIbanOrMasked: 'HDFC Bank NGO Current A/C #9921****812',
      counterpartyName: 'GreenBuild Supplies Ltd',
      paymentReferenceToken: 'NEFT/INV-1047/DEEPWELL',
      amountMinor: 4250000, // Exact match ₹42,500
      currency: 'INR',
      feeMinor: 500,
      statementDocSha256: 'SHA256_BANK_MT940_STMT_20260216',
      isSignedByBankApi: true,
    },
  ];

  return {
    grants,
    allocations,
    events,
    flowEdges,
    claims,
    documents,
    deliveryAttestations,
    escrowCases,
    reports,
    bankStatements,
  };
}
