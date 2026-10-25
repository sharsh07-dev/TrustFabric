export const TRUSTFABRIC_FIAT_ANCHOR_ABI = [
  // Read methods
  'function owner() external view returns (address)',
  'function authorizedRelayer() external view returns (address)',
  'function getBatch(bytes32 batchId) external view returns (bool exists, bytes32 merkleRoot, uint256 leafCount, address relayer, uint256 timestamp, uint256 blockNumber)',
  'function verifyMerkleProof(bytes32 root, bytes32 leaf, bytes32[] calldata proof) public pure returns (bool)',
  'function totalBatches() external view returns (uint256)',
  'function getAnchor(bytes32 paymentCommitment) external view returns (bool exists, bytes32 grantRefHash, uint256 amountPaise, bytes3 currencyCode, address relayer, uint256 timestamp, uint256 blockNumber)',
  'function totalAnchored() external view returns (uint256)',

  // Write methods
  'function recordBatchMerkleRoot(bytes32 batchId, bytes32 merkleRoot, uint256 leafCount) external returns (bool)',
  'function recordFiatDonation(bytes32 grantRefHash, bytes32 paymentCommitment, uint256 amountPaise, bytes3 currencyCode) external returns (bool)',
  'function setRelayer(address newRelayer) external',

  // Events
  'event MerkleBatchAnchored(bytes32 indexed batchId, bytes32 indexed merkleRoot, uint256 leafCount, address indexed relayer, uint256 timestamp, uint256 blockNumber)',
  'event FiatDonationAnchored(bytes32 indexed paymentCommitment, bytes32 indexed grantRefHash, uint256 amountPaise, bytes3 currencyCode, address indexed relayer, uint256 timestamp, uint256 blockNumber)',
  'event RelayerUpdated(address indexed previousRelayer, address indexed newRelayer)',
];
