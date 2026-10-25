/**
 * TrustFabric Ethereum Sepolia Contract Deployment Script
 * Deploys unified TrustFabric.sol and registers the initial verified test campaign
 */

const { ethers } = require('ethers');
const path = require('path');
const fs = require('fs');

// Load environment from server/.env if available
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../../server/.env') });
} catch {}

const artifact = require('./TrustFabric.json');

async function deploy() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
  const privateKey = process.env.SEPOLIA_RELAYER_PRIVATE_KEY;
  const relayerAddress = process.env.RELAYER_ADDRESS;

  if (!privateKey || privateKey.includes('YOUR_') || privateKey.length < 64) {
    console.error('❌ Error: Deployment via script requires SEPOLIA_RELAYER_PRIVATE_KEY in server/.env');
    console.log('\nIf deploying with MetaMask in the browser / Remix, use the compiled ABI and Bytecode in:');
    console.log('  smart ledger/contracts/evm/TrustFabric.json');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl, 11155111);
  const formattedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const wallet = new ethers.Wallet(formattedKey, provider);
  const balance = await provider.getBalance(wallet.address);

  console.log(`\n======================================================`);
  console.log(`🌐 TrustFabric Sepolia Unified Contract Deployment`);
  console.log(`- Deployer: ${wallet.address}`);
  console.log(`- Balance:  ${ethers.formatEther(balance)} Sepolia ETH`);
  console.log(`- Relayer:  ${relayerAddress || wallet.address}`);
  console.log(`======================================================\n`);

  if (balance === 0n) {
    console.error('❌ Deployer wallet has 0 Sepolia ETH.');
    process.exit(1);
  }

  console.log('Deploying TrustFabric.sol...');
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(relayerAddress || wallet.address);
  console.log(`⏳ Deployment tx sent: ${contract.deploymentTransaction().hash}`);
  console.log(`Waiting for confirmation on Sepolia...`);
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log(`✅ TrustFabric deployed at: ${contractAddress}`);

  // Register default test campaign: CW-2026-014
  const campaignId = ethers.id('CW-2026-014');
  const recipient = '0x92B34c67D2B1cE09874a12D3A6F1959728864f71';
  console.log(`Registering campaign CW-2026-014 -> recipient: ${recipient}...`);
  const tx = await contract.registerCampaign(campaignId, recipient);
  await tx.wait(1);
  console.log(`✅ Campaign CW-2026-014 registered successfully! Tx: ${tx.hash}`);

  console.log('\nNext Step: Set the deployed contract address:');
  console.log(`SEPOLIA_CONTRACT_ADDRESS: ${contractAddress}`);
  return { contractAddress };
}

if (require.main === module) {
  deploy().catch(console.error);
}

module.exports = { deploy };
