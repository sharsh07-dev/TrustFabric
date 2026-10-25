# TrustFabric Demo Runbook

## Goal

Demonstrate the complete PS 4.2 chain using one administrator, a read-only donor view, persistent records and reproducible synthetic adversarial cases. Mark every generated record `SIMULATED` and never represent it as a real NGO payment.

## Seed scenario

- Grant: `CW-2026-014`.
- Donor: `Northstar Community Fund` (synthetic).
- Purpose: water infrastructure / a local clean-water facility.
- Amount: ₹10,00,000 (synthetic financial example).
- Vendor: `GreenBuild Supplies` (synthetic).
- Invoice: `INV-1047`.
- Example expenditure: ₹42,500.
- Include one chain-A donation event, a swap, a bridge source and destination event, an off-ramp record, a fiat payment statement record, a vendor expense claim, an invoice evidence file and a signed delivery attestation. All fixtures clearly say simulated.

## Before showing the app

1. Start the application using the README commands.
2. Run migrations/seed command and verify a clean success message.
3. Confirm the synthetic dataset banner is visible.
4. Confirm no secrets are printed in console/browser output.
5. Run the health endpoint and core smoke tests.

## Scenario 1 — valid claim

1. Open grant `CW-2026-014`.
2. Inspect the fund-flow timeline.
3. Show the source status and provenance of each edge.
4. Open invoice `INV-1047`; explain file fingerprint versus invoice authenticity status.
5. Verify the signed delivery statement and show the milestone link.
6. Open donor view to show the permitted proof/status without beneficiary PII.

Expected: the app does not call a merely uploaded receipt “authentic” unless issuer/payment verification passed; source fixture status is clearly simulated.

## Scenario 2 — cross-donor duplicate

1. Submit the same invoice/evidence commitment against a second synthetic donor report.
2. Run duplicate verification.
3. Open finding details and show first claim ID, second claim ID, match type and reason.
4. Attempt to release the disputed tranche.
5. Show the server/contract rejection and audit event.

Expected: no central human action is needed to trigger the deterministic duplicate hold. If only application logic is present, label it `APP_HOLD` and explicitly state that real escrow has not been frozen.

## Scenario 3 — 30% forged corpus

1. Run the red-team corpus command.
2. Show the generated count, the 30% ground-truth forged count and the detector output.
3. Display confusion matrix, precision/recall and false-positive rate.
4. Open one invalid-signature/altered amount example and show exactly which check failed.
5. Open one legitimate invoice that was reformatted and show whether it triggers an exact duplicate, likely duplicate, or no match.

Expected: ground truth is used only for evaluation. Do not hardcode pass scores or infer a result from the labels.

## Scenario 4 — report discrepancy and missing hop

1. Alter the report total to differ from the evidence-backed expenditure total.
2. Remove a bridge destination proof or fiat payment reference from a fixture.
3. Re-run reconciliation.
4. Show discrepancy findings and partial/unreconciled state.

Expected: the app shows the difference and missing evidence; it does not invent the link.

## Scenario 5 — privacy and persistence

1. Open donor access, inspect network/API payloads and confirm PII/raw document access is denied.
2. Attempt to request another donor's grant/evidence ID.
3. Refresh, sign out and sign back in; verify records remain.
4. Run audit integrity verification.

Expected: access is denied server-side, data persists and audit integrity test passes.

## Suggested explanation to judges

“TrustFabric does not claim blockchain alone proves impact. It builds an evidence chain linking donation, authorized allocation, multi-hop movement, off-chain expenditure and a signed delivery claim. Its differentiator is cross-donor expense uniqueness and a rule-enforced hold when the same expense is claimed twice, while raw receipts and beneficiary data remain off-chain. In this demo, every external event is labeled live, attested or simulated, and the forged-receipt detection result is evaluated against a known synthetic red-team corpus.”
