# Acceptance, Red-Team & Security Test Plan

## 1. Rule

A feature is complete only when code, automated tests, and visible behavior agree. A green-looking UI is not a test. Label every test fixture as synthetic and every mock as simulated.

## 2. Source requirement coverage tests

### Fund allocation and escrow

- `AT-ALLOC-01`: Create a grant with purpose, allowed category, max amount and milestone.
- `AT-ALLOC-02`: Reject allocations exceeding authorized amount.
- `AT-ALLOC-03`: Reject out-of-purpose category allocation.
- `AT-ALLOC-04`: Reject release before required conditions are met.
- `AT-ESCROW-01`: Place a tranche on hold after a valid duplicate nullifier conflict.
- `AT-ESCROW-02`: Attempt release while held; contract/server must reject it.
- `AT-ESCROW-03`: The initial claimant cannot unilaterally clear the hold.
- `AT-ESCROW-04`: All hold/release/dispute transitions have permanent audit events.

### Evidence/cryptography

- `AT-EVID-01`: Upload permitted PDF/image and compute SHA-256 server-side.
- `AT-EVID-02`: Change one byte in the document; digest check must fail against the old commitment.
- `AT-EVID-03`: Same file renamed or uploaded under different claim; exact digest duplicate is detected.
- `AT-EVID-04`: Canonical invoice fields are normalized according to a versioned schema.
- `AT-EVID-05`: Alter invoice amount/vendor but keep invoice reference; field mismatch finding occurs.
- `AT-EVID-06`: Invalid issuer/attestor signature is rejected.
- `AT-EVID-07`: Replay same signed delivery claim with reused nonce is rejected.
- `AT-EVID-08`: Valid signed delivery attestation verifies and links to a milestone.
- `AT-EVID-09`: Invalid commitment/Merkle proof/ZK proof is rejected if that proof type is implemented.
- `AT-EVID-10`: UI distinguishes `EVIDENCE_LINKED` from `AUTHENTICITY_VERIFIED` and `DELIVERY_ATTESTATION_VERIFIED`.

### Cross-report duplicate detection

- `AT-DUP-01`: Same receipt file linked to two claims is flagged.
- `AT-DUP-02`: Same normalized invoice number/vendor/currency/amount/date across two reports is flagged.
- `AT-DUP-03`: Re-encoded/scanned receipt with different file hash but matching extracted invoice fields becomes a duplicate candidate.
- `AT-DUP-04`: A legitimate vendor with recurring invoices is not automatically called fraud solely due to vendor reuse.
- `AT-DUP-05`: Duplicate result identifies prior claim, evidence refs and matching reason.
- `AT-DUP-06`: Shared nullifier registry is idempotent under concurrent submissions; only one unique claim is accepted and conflicting use becomes disputed.
- `AT-DUP-07`: Public event contains no raw invoice number, vendor PII or beneficiary personal information.

### Multi-chain, bridge, swap and fiat

- `AT-FLOW-01`: Ingest two chain-specific fixtures with provenance and stable IDs.
- `AT-FLOW-02`: Duplicate event delivery by listener does not double-count funds.
- `AT-FLOW-03`: Reorg/finality simulation updates event state and downstream reconciliation appropriately.
- `AT-FLOW-04`: Valid bridge source/destination pair is linked with proof/source metadata.
- `AT-FLOW-05`: Missing destination proof leaves bridge edge `UNRECONCILED`; no guessed connection.
- `AT-FLOW-06`: Swap records input, output, fee, rate and correct decimal conversion.
- `AT-FLOW-07`: Fiat statement import matches a payment reference and currency/amount within explicit tolerances.
- `AT-FLOW-08`: Unmatched/partial fiat payment is clearly reported as partial/unreconciled.
- `AT-FLOW-09`: Reported grand total reconciles across fees, conversion and split transfers without double-counting.

### Discrepancy and reporting

- `AT-DISC-01`: Transfer with no authorized path becomes an unexplained-transfer finding.
- `AT-DISC-02`: Spending outside grant category creates a finding and follows hold policy.
- `AT-DISC-03`: Reported expenditure total differs from evidence-backed ledger total; exact difference is shown.
- `AT-DISC-04`: Missing evidence means the claim cannot become fully verified/release eligible.
- `AT-DISC-05`: Uncertain chain/fiat link appears as a gap with source and reason.
- `AT-REPORT-01`: Donor report values are derived from database data, not hardcoded front-end constants.

### Privacy / access / audit

- `AT-SEC-01`: Logged-out user cannot read grant or evidence APIs.
- `AT-SEC-02`: Donor A cannot read Donor B’s grant or files.
- `AT-SEC-03`: Donor endpoint never exposes beneficiary names, addresses, raw document URLs, credentials, or private storage keys.
- `AT-SEC-04`: Upload rejects disallowed extension/MIME/signature and oversized file.
- `AT-SEC-05`: User-supplied filenames and extracted text cannot trigger XSS.
- `AT-SEC-06`: Secrets do not appear in browser bundle, logs, git history or error responses.
- `AT-AUD-01`: Critical operation creates append-only audit event.
- `AT-AUD-02`: Edit/remove attempt against an event is denied through normal application interface.
- `AT-AUD-03`: Alter a stored event in a test fixture; integrity verifier detects chain/hash mismatch.
- `AT-AUD-04`: Repeated import does not create repeated audit events/financial totals beyond documented idempotency policy.

## 3. Adversarial 30%-forged receipt experiment

Create a deterministic synthetic corpus, for example 100 receipts with 70 legitimate and 30 forged/altered records. Use a fixed random seed; store ground-truth labels separately from the algorithm inputs. Ensure the forged set includes:

- Invalid synthetic vendor signature.
- Edited amount while the signed canonical payload remains unchanged.
- Edited vendor or invoice number.
- Duplicate invoice reused in another donor report.
- Mismatch between receipt and payment record.
- Altered document where OCR fields contradict recorded data.

The detector should catch all deterministic signature/commitment mismatches in this controlled test. For OCR/similarity cases, measure quality instead of guaranteeing perfect recall. Produce:

- TP, FP, TN, FN.
- Precision, recall, F1.
- False-positive rate for legitimate invoices.
- Per-rule breakdown and explanation.
- Source/algorithm versions.

Do not use the ground-truth label as an input to the detector. It is only for scoring. Clearly mark that a synthetic 30% adversarial corpus does not demonstrate field performance against sophisticated real-world forged paper documents.

## 4. Privacy red-team tests

- Search API responses, rendered pages, chain event payloads and logs for seeded PII canaries.
- Try guessing receipt URL/object keys.
- Try using another donor's IDs to request data.
- Test nullifier/equality leakage and document it.
- Confirm no raw receipt or beneficiary data is written to public ledger/events.
- Confirm public commitments cannot trivially reveal low-entropy invoice fields under the chosen scheme; if the pilot scheme has a leakage risk, explicitly report it and do not claim production-grade privacy.

## 5. Race and reliability tests

- Concurrent duplicate submissions.
- Simultaneous release and hold attempts.
- Retry after network failure.
- Duplicate webhooks/chain events.
- Database transaction rollback.
- File upload completed but database insert fails; cleanup/retry path.
- Chain adapter timeout, stale response and provider outage.
- Reorg after provisional event.
- Signed proof with expired/revoked key.

## 6. Browser/end-to-end tests

1. Log in as admin.
2. Create grant.
3. Import/record donation and multi-hop flow.
4. Upload receipt and associate it with expense.
5. Verify evidence and view status dimensions.
6. Submit duplicate claim and observe automatic hold.
7. Attempt release and see a clear rejection.
8. Open finding details and inspect evidence references.
9. Log in as donor/read-only role and confirm private data is unavailable.
10. Refresh/re-login and confirm persistence.
11. Run reconciliation report and audit integrity check.

## 7. Completion report

Every acceptance item must be marked `PASS`, `FAIL`, `BLOCKED`, or `NOT IMPLEMENTED` with test command/output or a reproducible manual step. Do not call the project fully compliant if any mandatory PS42-R01 through PS42-R20 item is `BLOCKED`, `NOT IMPLEMENTED`, or only simulated without explicit qualification.
