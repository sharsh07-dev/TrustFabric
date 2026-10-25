export const TRUSTFABRIC_CONTRACT_ABI = [
  // Read methods
  'function owner() external view returns (address)',
  'function authorizedRelayer() external view returns (address)',
  'function getCampaign(bytes32 campaignId) external view returns (bool exists, address recipient, bool isActive, uint256 totalDonatedWei, uint256 donationCount, uint256 createdAt)',
  'function totalCampaigns() external view returns (uint256)',
  'function getBatch(bytes32 batchId) external view returns (bool exists, bytes32 merkleRoot, uint256 leafCount, address relayer, uint256 timestamp, uint256 blockNumber)',
  'function verifyMerkleProof(bytes32 root, bytes32 leaf, bytes32[] calldata proof) public pure returns (bool)',
  'function totalBatches() external view returns (uint256)',
  'function getAnchor(bytes32 paymentCommitment) external view returns (bool exists, bytes32 grantRefHash, uint256 amountPaise, bytes3 currencyCode, address relayer, uint256 timestamp, uint256 blockNumber)',
  'function totalAnchored() external view returns (uint256)',

  // Write methods
  'function donate(bytes32 campaignId) external payable',
  'function registerCampaign(bytes32 campaignId, address payable recipient) external',
  'function setCampaignStatus(bytes32 campaignId, bool isActive) external',
  'function setCampaignRecipient(bytes32 campaignId, address payable newRecipient) external',
  'function recordBatchMerkleRoot(bytes32 batchId, bytes32 merkleRoot, uint256 leafCount) external returns (bool)',
  'function recordFiatDonation(bytes32 grantRefHash, bytes32 paymentCommitment, uint256 amountPaise, bytes3 currencyCode) external returns (bool)',
  'function setRelayer(address newRelayer) external',

  // Events
  'event DonationReceived(address indexed donor, bytes32 indexed campaignId, address indexed recipient, uint256 amountWei, uint256 timestamp, uint256 blockNumber)',
  'event CampaignRegistered(bytes32 indexed campaignId, address indexed recipient, uint256 timestamp)',
  'event CampaignStatusUpdated(bytes32 indexed campaignId, bool isActive, uint256 timestamp)',
  'event CampaignRecipientUpdated(bytes32 indexed campaignId, address indexed previousRecipient, address indexed newRecipient, uint256 timestamp)',
  'event MerkleBatchAnchored(bytes32 indexed batchId, bytes32 indexed merkleRoot, uint256 leafCount, address indexed relayer, uint256 timestamp, uint256 blockNumber)',
  'event FiatDonationAnchored(bytes32 indexed paymentCommitment, bytes32 indexed grantRefHash, uint256 amountPaise, bytes3 currencyCode, address indexed relayer, uint256 timestamp, uint256 blockNumber)',
  'event RelayerUpdated(address indexed previousRelayer, address indexed newRelayer)',
];

export const TRUSTFABRIC_FIAT_ANCHOR_ABI = TRUSTFABRIC_CONTRACT_ABI;
