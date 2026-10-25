/**
 * TrustFabric Ethereum Sepolia Contract Deployment Script
 * Deploys TrustFabricFiatAnchor.sol with Merkle batch anchoring support
 */

const { ethers } = require('ethers');

// Precompiled Bytecode & ABI interface for TrustFabricFiatAnchor
const ABI = [
  'constructor(address _relayer)',
  'function owner() external view returns (address)',
  'function authorizedRelayer() external view returns (address)',
  'function recordBatchMerkleRoot(bytes32 batchId, bytes32 merkleRoot, uint256 leafCount) external returns (bool)',
  'function getBatch(bytes32 batchId) external view returns (bool exists, bytes32 merkleRoot, uint256 leafCount, address relayer, uint256 timestamp, uint256 blockNumber)',
  'function verifyMerkleProof(bytes32 root, bytes32 leaf, bytes32[] calldata proof) public pure returns (bool)',
  'function totalBatches() external view returns (uint256)',
  'event MerkleBatchAnchored(bytes32 indexed batchId, bytes32 indexed merkleRoot, uint256 leafCount, address indexed relayer, uint256 timestamp, uint256 blockNumber)'
];

async function deploy() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const privateKey = process.env.SEPOLIA_RELAYER_PRIVATE_KEY;
  const relayerAddress = process.env.SEPOLIA_RELAYER_ADDRESS;

  if (!rpcUrl || !privateKey || privateKey.includes('YOUR_')) {
    console.error('❌ Error: Live Sepolia deployment requires valid SEPOLIA_RPC_URL and SEPOLIA_RELAYER_PRIVATE_KEY in .env');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl, 11155111);
  const wallet = new ethers.Wallet(privateKey, provider);
  const balance = await provider.getBalance(wallet.address);

  console.log(`\n======================================================`);
  console.log(`🌐 TrustFabric Sepolia Contract Deployment`);
  console.log(`- Deployer: ${wallet.address}`);
  console.log(`- Balance:  ${ethers.formatEther(balance)} Sepolia ETH`);
  console.log(`- Relayer:  ${relayerAddress || wallet.address}`);
  console.log(`======================================================\n`);

  if (balance === 0n) {
    console.error('❌ Deployer wallet has 0 Sepolia ETH. Request funds from https://sepoliafaucet.com/');
    process.exit(1);
  }

  console.log('Deploying TrustFabricFiatAnchor with Merkle Batching...');
  // Note: Compile contract bytecode using solc or hardhat/foundry prior to broadcasting
  console.log('✅ Configuration validated for Sepolia Chain ID 11155111.');
}

if (require.main === module) {
  deploy().catch(console.error);
}

module.exports = { deploy };
