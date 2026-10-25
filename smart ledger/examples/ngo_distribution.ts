/**
 * @file examples/ngo_distribution.ts
 *
 * Example: Nourish Africa Initiative distributing food security funds
 * across 5 verified households in Kano, Nigeria.
 *
 * This example demonstrates the full AidFlow protocol flow:
 *   Donor deposits → Beneficiary registration → Milestone-gated release
 *
 * Run with:
 *   cd sdk && npx ts-node ../examples/ngo_distribution.ts
 *
 * Prerequisites:
 *   1. Deploy all contracts (./scripts/deploy.sh)
 *   2. Copy .env.testnet into this file's config block
 *   3. Have a funded testnet keypair for the admin
 */

import { AidFlowClient, ConditionType, Networks } from "../sdk/src";
import { Keypair } from "@stellar/stellar-sdk";

// ─── Configuration ─────────────────────────────────────────────────────────

// TODO: Replace with values from your .env.testnet file after deployment
const CONFIG = {
  networkPassphrase: Networks.TESTNET,
  rpcUrl: "https://soroban-testnet.stellar.org",
  contracts: {
    fundPool:        "REPLACE_WITH_FUND_POOL_CONTRACT_ID",
    distribution:    "REPLACE_WITH_DISTRIBUTION_CONTRACT_ID",
    registry:        "REPLACE_WITH_REGISTRY_CONTRACT_ID",
    milestoneEngine: "REPLACE_WITH_MILESTONE_ENGINE_CONTRACT_ID",
    audit:           "REPLACE_WITH_AUDIT_CONTRACT_ID",
  },
};

// TODO: Replace with real keypairs (or load from environment variables)
const ADMIN_SECRET  = "REPLACE_WITH_ADMIN_SECRET_KEY";
const DONOR_SECRET  = "REPLACE_WITH_DONOR_SECRET_KEY";

// Simulated beneficiary addresses (in a real deployment, these are real Stellar accounts)
const BENEFICIARIES = [
  { address: "GABENEFICIARY1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", name: "Amina Hassan",   region: "Kano" },
  { address: "GABENEFICIARY2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", name: "Musa Ibrahim",   region: "Kano" },
  { address: "GABENEFICIARY3XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", name: "Fatima Yusuf",   region: "Katsina" },
  { address: "GABENEFICIARY4XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", name: "Abubakar Musa",  region: "Kano" },
  { address: "GABENEFICIARY5XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", name: "Halima Sani",    region: "Katsina" },
];

// Amount per beneficiary: 50 USDC (in base units, 7 decimal places on Stellar)
const AMOUNT_PER_BENEFICIARY = BigInt(50_000_000_0); // 50 USDC

// ─── Main Script ──────────────────────────────────────────────────────────

async function main() {
  const client = new AidFlowClient(CONFIG);
  const adminKeypair = Keypair.fromSecret(ADMIN_SECRET);
  const donorKeypair = Keypair.fromSecret(DONOR_SECRET);

  console.log("=== AidFlow: Nourish Africa Initiative ===\n");

  // ── Step 1: Donor makes a contribution ────────────────────────────────

  const totalDonation = AMOUNT_PER_BENEFICIARY * BigInt(BENEFICIARIES.length);
  console.log(`Step 1: Donor ${donorKeypair.publicKey()} donating ${totalDonation} units...`);

  const donateResult = await client.fundPool.donate(
    { donor: donorKeypair.publicKey(), amount: totalDonation },
    donorKeypair
  );
  console.log(`  ✅ Donation confirmed: ${donateResult.hash}\n`);

  const totalFunds = await client.fundPool.getTotalFunds();
  console.log(`  FundPool balance: ${totalFunds} units\n`);

  // ── Step 2: Register and verify beneficiaries ────────────────────────

  console.log("Step 2: Registering beneficiaries...");
  for (const b of BENEFICIARIES) {
    await client.registry.registerBeneficiary(
      {
        address: b.address,
        metadata: { name: b.name, region: b.region, category: "food_security" },
      },
      adminKeypair
    );
    console.log(`  Registered: ${b.name} (${b.region})`);

    await client.registry.verifyBeneficiary(b.address, adminKeypair);
    console.log(`  Verified:   ${b.name}`);
  }
  console.log();

  // ── Step 3: Create milestones (one per beneficiary) ──────────────────

  console.log("Step 3: Creating milestones...");
  const milestoneIds: number[] = [];
  for (const b of BENEFICIARIES) {
    const milestoneId = await client.milestone.createMilestone(
      {
        beneficiary: b.address,
        condition: { conditionType: ConditionType.ManualApproval, data: 0 },
      },
      adminKeypair
    );
    milestoneIds.push(milestoneId);
    console.log(`  Milestone #${milestoneId} created for ${b.name}`);
  }
  console.log();

  // ── Step 4: Allocate funds ───────────────────────────────────────────

  console.log("Step 4: Allocating funds...");
  const allocationIds: number[] = [];
  for (let i = 0; i < BENEFICIARIES.length; i++) {
    const allocId = await client.distribution.allocateFunds(
      {
        beneficiary: BENEFICIARIES[i].address,
        amount: AMOUNT_PER_BENEFICIARY,
        milestoneId: milestoneIds[i],
      },
      adminKeypair
    );
    allocationIds.push(allocId);
    console.log(`  Allocation #${allocId}: ${AMOUNT_PER_BENEFICIARY} units → ${BENEFICIARIES[i].name}`);
  }
  console.log();

  // ── Step 5: Field officers approve milestones ────────────────────────

  console.log("Step 5: Approving milestones (field officer confirms delivery)...");
  for (let i = 0; i < milestoneIds.length; i++) {
    await client.milestone.approveMilestone(milestoneIds[i], adminKeypair);
    console.log(`  Milestone #${milestoneIds[i]} approved for ${BENEFICIARIES[i].name}`);
  }
  console.log();

  // ── Step 6: Release funds ────────────────────────────────────────────

  console.log("Step 6: Releasing funds...");
  for (let i = 0; i < allocationIds.length; i++) {
    const result = await client.distribution.releaseFunds(allocationIds[i], adminKeypair);
    console.log(`  Released allocation #${allocationIds[i]} to ${BENEFICIARIES[i].name}: ${result.hash}`);
  }
  console.log();

  // ── Step 7: Query audit trail ────────────────────────────────────────

  console.log("Step 7: Querying audit trail...");
  const eventCount = await client.audit.getEventCount();
  console.log(`  Total events logged: ${eventCount}`);

  const history = await client.audit.getFundFlowHistory();
  console.log(`  Events:`);
  for (const event of history) {
    console.log(`    [${event.ledger}] Event #${event.eventId}: type=${event.eventType}, amount=${event.amount}`);
  }
  console.log();

  // ── Summary ──────────────────────────────────────────────────────────

  console.log("=== Distribution Complete ===");
  console.log(`  Beneficiaries served: ${BENEFICIARIES.length}`);
  console.log(`  Total distributed: ${totalDonation} units`);
  console.log(`  All transactions verifiable on-chain.`);
  console.log();
  console.log("This audit trail is publicly accessible by any donor, regulator, or journalist.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
