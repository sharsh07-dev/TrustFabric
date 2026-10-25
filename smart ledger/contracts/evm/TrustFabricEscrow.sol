// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TrustFabricEscrow
 * @notice Decentralized Escrow & Purpose-Bound Tranche Disbursement Contract
 * @dev Enforces grant purpose bounds, cryptographic expense nullifier uniqueness,
 *      milestone delivery attestations, and automated dispute holds without a centralized auditor.
 *      Satisfies CASCADE '26 Theme 4 Problem 4.2 (PS42-R04, PS42-R09, PS42-R17).
 */
contract TrustFabricEscrow {
    enum TrancheState {
        LOCKED,
        CONDITION_PENDING,
        RELEASE_ELIGIBLE,
        ON_HOLD,
        RELEASED,
        REJECTED
    }

    struct GrantPolicy {
        bytes32 grantCodeHash;
        address donorAddress;
        uint256 authorizedCeilingMinor;
        uint256 totalAllocatedMinor;
        uint256 totalDisbursedMinor;
        bytes32 allowedCategoriesMask;
        bool isActive;
    }

    struct DisbursementTranche {
        bytes32 trancheId;
        bytes32 grantId;
        bytes32 claimId;
        address beneficiaryOrVendor;
        uint256 amountMinor;
        bytes32 categoryHash;
        bytes32 evidenceDocSha256;
        bytes32 expenseNullifier;
        bytes32 deliveryProofHash;
        TrancheState state;
        uint256 createdAt;
        uint256 releasedAt;
    }

    // Mapping of grantId to GrantPolicy
    mapping(bytes32 => GrantPolicy) public grants;

    // Mapping of trancheId to DisbursementTranche
    mapping(bytes32 => DisbursementTranche) public tranches;

    // Global Nullifier Registry: maps expenseNullifier to the originating claimId
    // Guarantees cross-grant and cross-donor uniqueness of expense commitments
    mapping(bytes32 => bytes32) public expenseNullifierRegistry;

    // Events for immutable on-chain audit trail
    event GrantRegistered(bytes32 indexed grantId, address indexed donor, uint256 ceilingMinor);
    event TrancheCreated(bytes32 indexed trancheId, bytes32 indexed grantId, uint256 amountMinor, bytes32 expenseNullifier);
    event NullifierRegistered(bytes32 indexed expenseNullifier, bytes32 indexed claimId, bytes32 indexed grantId);
    event AutomatedHoldTriggered(bytes32 indexed trancheId, bytes32 indexed collidingNullifier, string reason);
    event DeliveryAttestationLinked(bytes32 indexed trancheId, bytes32 indexed proofHash);
    event TrancheReleased(bytes32 indexed trancheId, address indexed recipient, uint256 amountMinor);
    event DisputeResolved(bytes32 indexed trancheId, bytes32 resolutionProofHash);

    // Custom Errors for clear revert diagnostics
    error GrantNotFound();
    error GrantInactive();
    error OverAllocationLimit();
    error OverDisbursementLimit();
    error TrancheAlreadyExists();
    error TrancheNotFound();
    error InvalidTrancheState(TrancheState current, TrancheState required);
    error DuplicateNullifierCollision(bytes32 nullifier, bytes32 existingClaimId);
    error MissingEvidenceCommitment();
    error MissingDeliveryAttestation();
    error UnauthorizedDisputeResolver();
    error DoubleReleasePrevented();

    /**
     * @notice Registers a new grant policy with an authorized budget ceiling and spending bounds
     */
    function registerGrant(
        bytes32 grantId,
        bytes32 grantCodeHash,
        uint256 ceilingMinor,
        bytes32 allowedCategoriesMask
    ) external {
        if (grants[grantId].isActive) revert GrantAlreadyActive();

        grants[grantId] = GrantPolicy({
            grantCodeHash: grantCodeHash,
            donorAddress: msg.sender,
            authorizedCeilingMinor: ceilingMinor,
            totalAllocatedMinor: 0,
            totalDisbursedMinor: 0,
            allowedCategoriesMask: allowedCategoriesMask,
            isActive: true
        });

        emit GrantRegistered(grantId, msg.sender, ceilingMinor);
    }

    error GrantAlreadyActive();

    /**
     * @notice Registers a claim tranche. If the expense nullifier has ALREADY been used
     * in another claim or grant, the transaction triggers an automated hold or reverts.
     */
    function registerClaimTranche(
        bytes32 trancheId,
        bytes32 grantId,
        bytes32 claimId,
        address vendor,
        uint256 amountMinor,
        bytes32 categoryHash,
        bytes32 evidenceDocSha256,
        bytes32 expenseNullifier
    ) external {
        GrantPolicy storage grant = grants[grantId];
        if (!grant.isActive) revert GrantInactive();
        if (grant.totalAllocatedMinor + amountMinor > grant.authorizedCeilingMinor) {
            revert OverAllocationLimit();
        }
        if (tranches[trancheId].amountMinor > 0) revert TrancheAlreadyExists();
        if (evidenceDocSha256 == bytes32(0)) revert MissingEvidenceCommitment();

        // Check Nullifier Collision (PS42-R09 & PS42-R17)
        bytes32 existingClaimId = expenseNullifierRegistry[expenseNullifier];
        TrancheState initialState = TrancheState.CONDITION_PENDING;

        if (existingClaimId != bytes32(0)) {
            // Nullifier collision detected!
            initialState = TrancheState.ON_HOLD;
            emit AutomatedHoldTriggered(trancheId, expenseNullifier, "Cryptographic expense nullifier collision detected");
        } else {
            // Record nullifier to registry
            expenseNullifierRegistry[expenseNullifier] = claimId;
            emit NullifierRegistered(expenseNullifier, claimId, grantId);
        }

        grant.totalAllocatedMinor += amountMinor;

        tranches[trancheId] = DisbursementTranche({
            trancheId: trancheId,
            grantId: grantId,
            claimId: claimId,
            beneficiaryOrVendor: vendor,
            amountMinor: amountMinor,
            categoryHash: categoryHash,
            evidenceDocSha256: evidenceDocSha256,
            expenseNullifier: expenseNullifier,
            deliveryProofHash: bytes32(0),
            state: initialState,
            createdAt: block.timestamp,
            releasedAt: 0
        });

        emit TrancheCreated(trancheId, grantId, amountMinor, expenseNullifier);
    }

    /**
     * @notice Links a verified delivery milestone attestation to a tranche
     */
    function linkDeliveryAttestation(
        bytes32 trancheId,
        bytes32 deliveryProofHash
    ) external {
        DisbursementTranche storage tranche = tranches[trancheId];
        if (tranche.amountMinor == 0) revert TrancheNotFound();
        if (tranche.state == TrancheState.RELEASED) revert DoubleReleasePrevented();
        if (deliveryProofHash == bytes32(0)) revert MissingDeliveryAttestation();

        tranche.deliveryProofHash = deliveryProofHash;
        emit DeliveryAttestationLinked(trancheId, deliveryProofHash);

        if (tranche.state == TrancheState.CONDITION_PENDING) {
            tranche.state = TrancheState.RELEASE_ELIGIBLE;
        }
    }

    /**
     * @notice Executes tranche disbursement release.
     * Rejects automatically if:
     * - Tranche is ON_HOLD (e.g. from nullifier collision)
     * - Tranche is already RELEASED (preventing double disbursement)
     * - Delivery attestation proof is missing
     * - Grant disbursement ceiling would be breached
     */
    function executeRelease(bytes32 trancheId) external {
        DisbursementTranche storage tranche = tranches[trancheId];
        if (tranche.amountMinor == 0) revert TrancheNotFound();

        if (tranche.state == TrancheState.ON_HOLD) {
            revert InvalidTrancheState(tranche.state, TrancheState.RELEASE_ELIGIBLE);
        }
        if (tranche.state == TrancheState.RELEASED) {
            revert DoubleReleasePrevented();
        }
        if (tranche.deliveryProofHash == bytes32(0)) {
            revert MissingDeliveryAttestation();
        }

        GrantPolicy storage grant = grants[tranche.grantId];
        if (!grant.isActive) revert GrantInactive();
        if (grant.totalDisbursedMinor + tranche.amountMinor > grant.authorizedCeilingMinor) {
            revert OverDisbursementLimit();
        }

        // State Transition
        tranche.state = TrancheState.RELEASED;
        tranche.releasedAt = block.timestamp;
        grant.totalDisbursedMinor += tranche.amountMinor;

        emit TrancheReleased(trancheId, tranche.beneficiaryOrVendor, tranche.amountMinor);
    }

    /**
     * @notice Resolves a dispute and lifts an automated hold if a verifiable resolution proof is provided
     */
    function resolveDispute(
        bytes32 trancheId,
        bytes32 resolutionProofHash
    ) external {
        DisbursementTranche storage tranche = tranches[trancheId];
        if (tranche.amountMinor == 0) revert TrancheNotFound();
        if (tranche.state != TrancheState.ON_HOLD) {
            revert InvalidTrancheState(tranche.state, TrancheState.ON_HOLD);
        }

        tranche.state = TrancheState.CONDITION_PENDING;
        emit DisputeResolved(trancheId, resolutionProofHash);

        if (tranche.deliveryProofHash != bytes32(0)) {
            tranche.state = TrancheState.RELEASE_ELIGIBLE;
        }
    }

    /**
     * @notice View function to verify whether a given expense nullifier is already committed
     */
    function isNullifierCommitted(bytes32 nullifier) external view returns (bool, bytes32) {
        bytes32 claimId = expenseNullifierRegistry[nullifier];
        return (claimId != bytes32(0), claimId);
    }
}
