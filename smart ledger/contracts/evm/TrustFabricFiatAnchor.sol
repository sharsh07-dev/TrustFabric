// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TrustFabricFiatAnchor
 * @notice Anchors cryptographic commitments of verified off-chain fiat donations (e.g. Razorpay INR)
 * onto Ethereum / EVM testnets (e.g. Sepolia) for independent public auditability.
 *
 * CRITICAL FINANCIAL & TRUST MODEL DISCLOSURE:
 * 1. This contract stores cryptographic proofs of verified off-chain gateway transactions.
 * 2. It does NOT hold, receive, or escrow fiat INR currency. Fiat funds settle through standard banking rails.
 * 3. Smart contract escrow enforcement for milestone payouts is handled separately in TrustFabricEscrow.sol.
 * 4. Zero PII is committed to public blockchain state.
 *
 * Compliant with CASCADE '26 Theme 4 Problem 4.2: Verifiable NGO Fund Flows.
 */
contract TrustFabricFiatAnchor {
    address public owner;
    address public authorizedRelayer;

    struct FiatAnchorRecord {
        bytes32 paymentCommitment;
        bytes32 grantRefHash;
        uint256 amountPaise;
        bytes3 currencyCode; // e.g. "INR"
        address relayer;
        uint256 timestamp;
        uint256 blockNumber;
    }

    // Mapping: paymentCommitment => FiatAnchorRecord
    mapping(bytes32 => FiatAnchorRecord) public anchors;

    // Ordered list of anchored commitments for enumeration
    bytes32[] public anchoredCommitmentList;

    // Events
    event RelayerUpdated(address indexed previousRelayer, address indexed newRelayer);
    event FiatDonationAnchored(
        bytes32 indexed paymentCommitment,
        bytes32 indexed grantRefHash,
        uint256 amountPaise,
        bytes3 currencyCode,
        address indexed relayer,
        uint256 timestamp,
        uint256 blockNumber
    );

    // Custom Errors
    error UnauthorizedCaller();
    error ZeroAddressNotAllowed();
    error ZeroCommitmentNotAllowed();
    error ZeroAmountNotAllowed();
    error DuplicatePaymentCommitment(bytes32 commitment);
    error CommitmentNotFound(bytes32 commitment);

    modifier onlyOwner() {
        if (msg.sender != owner) revert UnauthorizedCaller();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != authorizedRelayer && msg.sender != owner) revert UnauthorizedCaller();
        _;
    }

    constructor(address _relayer) {
        if (_relayer == address(0)) revert ZeroAddressNotAllowed();
        owner = msg.sender;
        authorizedRelayer = _relayer;
        emit RelayerUpdated(address(0), _relayer);
    }

    /**
     * @notice Updates the authorized relayer address
     * @param _newRelayer New relayer account
     */
    function setRelayer(address _newRelayer) external onlyOwner {
        if (_newRelayer == address(0)) revert ZeroAddressNotAllowed();
        address prev = authorizedRelayer;
        authorizedRelayer = _newRelayer;
        emit RelayerUpdated(prev, _newRelayer);
    }

    /**
     * @notice Anchors a server-verified fiat donation commitment on-chain.
     * @param grantRefHash SHA-256 / Keccak-256 hash of the canonical grant identifier
     * @param paymentCommitment Unique cryptographic commitment derived from payment ID, order ID, amount, and server salt
     * @param amountPaise Amount in integer minor units (paise for INR)
     * @param currencyCode 3-byte currency code (e.g. "INR")
     */
    function recordFiatDonation(
        bytes32 grantRefHash,
        bytes32 paymentCommitment,
        uint256 amountPaise,
        bytes3 currencyCode
    ) external onlyRelayer returns (bool) {
        if (paymentCommitment == bytes32(0)) revert ZeroCommitmentNotAllowed();
        if (amountPaise == 0) revert ZeroAmountNotAllowed();
        if (anchors[paymentCommitment].paymentCommitment != bytes32(0)) {
            revert DuplicatePaymentCommitment(paymentCommitment);
        }

        FiatAnchorRecord memory record = FiatAnchorRecord({
            paymentCommitment: paymentCommitment,
            grantRefHash: grantRefHash,
            amountPaise: amountPaise,
            currencyCode: currencyCode,
            relayer: msg.sender,
            timestamp: block.timestamp,
            blockNumber: block.number
        });

        anchors[paymentCommitment] = record;
        anchoredCommitmentList.push(paymentCommitment);

        emit FiatDonationAnchored(
            paymentCommitment,
            grantRefHash,
            amountPaise,
            currencyCode,
            msg.sender,
            block.timestamp,
            block.number
        );

        return true;
    }

    /**
     * @notice Verifies if a given payment commitment exists on-chain and returns its verified record
     */
    function getAnchor(bytes32 paymentCommitment)
        external
        view
        returns (
            bool exists,
            bytes32 grantRefHash,
            uint256 amountPaise,
            bytes3 currencyCode,
            address relayer,
            uint256 timestamp,
            uint256 blockNumber
        )
    {
        FiatAnchorRecord storage record = anchors[paymentCommitment];
        if (record.paymentCommitment == bytes32(0)) {
            return (false, bytes32(0), 0, bytes3(0), address(0), 0, 0);
        }
        return (
            true,
            record.grantRefHash,
            record.amountPaise,
            record.currencyCode,
            record.relayer,
            record.timestamp,
            record.blockNumber
        );
    }

    /**
     * @notice Total count of anchored commitments
     */
    function totalAnchored() external view returns (uint256) {
        return anchoredCommitmentList.length;
    }

    // -------------------------------------------------------------
    // Merkle Root Batch Pipeline (100+ Concurrent Commitments)
    // -------------------------------------------------------------
    struct MerkleBatchRecord {
        bytes32 batchId;
        bytes32 merkleRoot;
        uint256 leafCount;
        address relayer;
        uint256 timestamp;
        uint256 blockNumber;
    }

    // Mapping: batchId => MerkleBatchRecord
    mapping(bytes32 => MerkleBatchRecord) public batches;
    bytes32[] public batchList;

    event MerkleBatchAnchored(
        bytes32 indexed batchId,
        bytes32 indexed merkleRoot,
        uint256 leafCount,
        address indexed relayer,
        uint256 timestamp,
        uint256 blockNumber
    );

    /**
     * @notice Records an aggregated Merkle root batch on Sepolia
     * @param batchId Unique batch identifier hash
     * @param merkleRoot Cryptographic root of the batch commitments
     * @param leafCount Number of individual commitments in this batch
     */
    function recordBatchMerkleRoot(
        bytes32 batchId,
        bytes32 merkleRoot,
        uint256 leafCount
    ) external onlyRelayer returns (bool) {
        if (batchId == bytes32(0)) revert ZeroCommitmentNotAllowed();
        if (merkleRoot == bytes32(0)) revert ZeroCommitmentNotAllowed();
        if (leafCount == 0) revert ZeroAmountNotAllowed();
        if (batches[batchId].batchId != bytes32(0)) {
            revert DuplicatePaymentCommitment(batchId);
        }

        batches[batchId] = MerkleBatchRecord({
            batchId: batchId,
            merkleRoot: merkleRoot,
            leafCount: leafCount,
            relayer: msg.sender,
            timestamp: block.timestamp,
            blockNumber: block.number
        });
        batchList.push(batchId);

        emit MerkleBatchAnchored(
            batchId,
            merkleRoot,
            leafCount,
            msg.sender,
            block.timestamp,
            block.number
        );

        return true;
    }

    /**
     * @notice Retrieves a Merkle batch record by batch ID
     */
    function getBatch(bytes32 batchId)
        external
        view
        returns (
            bool exists,
            bytes32 merkleRoot,
            uint256 leafCount,
            address relayer,
            uint256 timestamp,
            uint256 blockNumber
        )
    {
        MerkleBatchRecord storage record = batches[batchId];
        if (record.batchId == bytes32(0)) {
            return (false, bytes32(0), 0, address(0), 0, 0);
        }
        return (
            true,
            record.merkleRoot,
            record.leafCount,
            record.relayer,
            record.timestamp,
            record.blockNumber
        );
    }

    /**
     * @notice On-chain verification of a cryptographic Merkle inclusion proof
     * Uses OpenZeppelin standard sorted-pairs Keccak256 algorithm
     */
    function verifyMerkleProof(
        bytes32 root,
        bytes32 leaf,
        bytes32[] calldata proof
    ) public pure returns (bool) {
        bytes32 computedHash = leaf;
        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 proofElement = proof[i];
            if (computedHash <= proofElement) {
                computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
            } else {
                computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
            }
        }
        return computedHash == root;
    }

    function totalBatches() external view returns (uint256) {
        return batchList.length;
    }
}

