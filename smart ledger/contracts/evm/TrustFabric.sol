// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TrustFabric
 * @notice Unified TrustFabric Single Smart Contract on Ethereum Sepolia.
 * 
 * Capabilities:
 * 1. Direct Payable ETH Donations (MetaMask & Web3):
 *    - Resolves verified on-chain campaign recipients.
 *    - Forwards ETH directly with reentrancy protection.
 *    - Emits immutable `DonationReceived` event logs for public auditing.
 * 2. Cryptographic Fiat Commitments & Merkle Batch Anchoring:
 *    - Records SHA-256 commitments of off-chain verified bank/gateway events.
 *    - Batches 100+ concurrent commitments into on-chain Merkle roots.
 *    - Provides on-chain cryptographic inclusion verification (`verifyMerkleProof`).
 *
 * Compliant with CASCADE '26 Theme 4 Problem 4.2.
 */
contract TrustFabric {
    address public owner;
    address public authorizedRelayer;

    // --- Reentrancy Guard State ---
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    // --- Campaign Recipient Registry ---
    struct Campaign {
        bytes32 campaignId;
        address payable recipient;
        bool isActive;
        uint256 totalDonatedWei;
        uint256 donationCount;
        uint256 createdAt;
    }

    mapping(bytes32 => Campaign) public campaigns;
    bytes32[] public campaignIdList;

    // --- Fiat / Gateway Anchor Records ---
    struct FiatAnchorRecord {
        bytes32 paymentCommitment;
        bytes32 grantRefHash;
        uint256 amountPaise;
        bytes3 currencyCode; // e.g. "INR"
        address relayer;
        uint256 timestamp;
        uint256 blockNumber;
    }

    mapping(bytes32 => FiatAnchorRecord) public anchors;
    bytes32[] public anchoredCommitmentList;

    // --- Merkle Batch Records ---
    struct MerkleBatchRecord {
        bytes32 batchId;
        bytes32 merkleRoot;
        uint256 leafCount;
        address relayer;
        uint256 timestamp;
        uint256 blockNumber;
    }

    mapping(bytes32 => MerkleBatchRecord) public batches;
    bytes32[] public batchList;

    // --- Events ---
    event DonationReceived(
        address indexed donor,
        bytes32 indexed campaignId,
        address indexed recipient,
        uint256 amountWei,
        uint256 timestamp,
        uint256 blockNumber
    );

    event CampaignRegistered(
        bytes32 indexed campaignId,
        address indexed recipient,
        uint256 timestamp
    );

    event CampaignStatusUpdated(
        bytes32 indexed campaignId,
        bool isActive,
        uint256 timestamp
    );

    event CampaignRecipientUpdated(
        bytes32 indexed campaignId,
        address indexed previousRecipient,
        address indexed newRecipient,
        uint256 timestamp
    );

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

    event MerkleBatchAnchored(
        bytes32 indexed batchId,
        bytes32 indexed merkleRoot,
        uint256 leafCount,
        address indexed relayer,
        uint256 timestamp,
        uint256 blockNumber
    );

    // --- Custom Errors ---
    error UnauthorizedCaller();
    error ZeroAddressNotAllowed();
    error ZeroCommitmentNotAllowed();
    error ZeroAmountNotAllowed();
    error DuplicatePaymentCommitment(bytes32 commitment);
    error ReentrancyGuardReentrantCall();
    error UnknownCampaign(bytes32 campaignId);
    error InactiveCampaign(bytes32 campaignId);
    error DuplicateCampaign(bytes32 campaignId);
    error RecipientTransferFailed(address recipient, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert UnauthorizedCaller();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != authorizedRelayer && msg.sender != owner) revert UnauthorizedCaller();
        _;
    }

    modifier nonReentrant() {
        if (_status == _ENTERED) revert ReentrancyGuardReentrantCall();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    constructor(address _relayer) {
        if (_relayer == address(0)) revert ZeroAddressNotAllowed();
        owner = msg.sender;
        authorizedRelayer = _relayer;
        _status = _NOT_ENTERED;
        emit RelayerUpdated(address(0), _relayer);
    }

    // =============================================================
    // 1. Direct Payable MetaMask / Web3 ETH Donations
    // =============================================================

    /**
     * @notice Accepts direct ETH donation for an authorized campaign, forwards funds to recipient, and logs immutable event.
     * @param campaignId Unique 32-byte identifier for the active NGO campaign.
     */
    function donate(bytes32 campaignId) external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmountNotAllowed();

        Campaign storage campaign = campaigns[campaignId];
        if (campaign.recipient == address(0)) revert UnknownCampaign(campaignId);
        if (!campaign.isActive) revert InactiveCampaign(campaignId);

        address payable recipient = campaign.recipient;
        uint256 donationAmount = msg.value;

        // Update campaign statistics
        campaign.totalDonatedWei += donationAmount;
        campaign.donationCount += 1;

        // Emit event before external call (Checks-Effects-Interactions pattern)
        emit DonationReceived(
            msg.sender,
            campaignId,
            recipient,
            donationAmount,
            block.timestamp,
            block.number
        );

        // Forward donated ETH to the authorized campaign recipient
        (bool success, ) = recipient.call{value: donationAmount}("");
        if (!success) {
            revert RecipientTransferFailed(recipient, donationAmount);
        }
    }

    /**
     * @notice Registers an authorized campaign recipient (Owner only)
     */
    function registerCampaign(bytes32 campaignId, address payable recipient) external onlyOwner {
        if (campaignId == bytes32(0)) revert ZeroCommitmentNotAllowed();
        if (recipient == address(0)) revert ZeroAddressNotAllowed();
        if (campaigns[campaignId].recipient != address(0)) revert DuplicateCampaign(campaignId);

        campaigns[campaignId] = Campaign({
            campaignId: campaignId,
            recipient: recipient,
            isActive: true,
            totalDonatedWei: 0,
            donationCount: 0,
            createdAt: block.timestamp
        });
        campaignIdList.push(campaignId);

        emit CampaignRegistered(campaignId, recipient, block.timestamp);
    }

    /**
     * @notice Updates active status of a registered campaign (Owner only)
     */
    function setCampaignStatus(bytes32 campaignId, bool isActive) external onlyOwner {
        if (campaigns[campaignId].recipient == address(0)) revert UnknownCampaign(campaignId);
        campaigns[campaignId].isActive = isActive;
        emit CampaignStatusUpdated(campaignId, isActive, block.timestamp);
    }

    /**
     * @notice Updates the authorized recipient of a registered campaign (Owner only)
     */
    function setCampaignRecipient(bytes32 campaignId, address payable newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddressNotAllowed();
        Campaign storage c = campaigns[campaignId];
        if (c.recipient == address(0)) revert UnknownCampaign(campaignId);

        address oldRecipient = c.recipient;
        c.recipient = newRecipient;
        emit CampaignRecipientUpdated(campaignId, oldRecipient, newRecipient, block.timestamp);
    }

    /**
     * @notice Returns campaign details
     */
    function getCampaign(bytes32 campaignId)
        external
        view
        returns (
            bool exists,
            address recipient,
            bool isActive,
            uint256 totalDonatedWei,
            uint256 donationCount,
            uint256 createdAt
        )
    {
        Campaign storage c = campaigns[campaignId];
        if (c.recipient == address(0)) {
            return (false, address(0), false, 0, 0, 0);
        }
        return (true, c.recipient, c.isActive, c.totalDonatedWei, c.donationCount, c.createdAt);
    }

    function totalCampaigns() external view returns (uint256) {
        return campaignIdList.length;
    }

    // =============================================================
    // 2. Cryptographic Commitments & Merkle Batch Anchoring
    // =============================================================

    /**
     * @notice Updates authorized relayer address
     */
    function setRelayer(address _newRelayer) external onlyOwner {
        if (_newRelayer == address(0)) revert ZeroAddressNotAllowed();
        address prev = authorizedRelayer;
        authorizedRelayer = _newRelayer;
        emit RelayerUpdated(prev, _newRelayer);
    }

    /**
     * @notice Anchors verified fiat donation commitment
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

    function totalAnchored() external view returns (uint256) {
        return anchoredCommitmentList.length;
    }

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
