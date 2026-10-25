import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Razorpay Gateway Config
  razorpayMode: (process.env.RAZORPAY_MODE || 'test').toLowerCase() as 'test' | 'live',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_Ts8hc71B3sf8nu',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || 'bYp34UkC8VbbVQE80a2dJix6',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_trustfabric_test_2026',

  // EVM Blockchain Anchor Config
  evmChainMode: (process.env.EVM_CHAIN_MODE || 'sepolia').toLowerCase(),
  evmChainId: parseInt(process.env.EVM_CHAIN_ID || '11155111', 10), // Ethereum Sepolia Testnet
  networkName: 'Ethereum Sepolia Testnet',
  sepoliaRpcUrl: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
  sepoliaRelayerPrivateKey: process.env.SEPOLIA_RELAYER_PRIVATE_KEY || '',
  fiatAnchorContractAddress: process.env.FIAT_DONATION_ANCHOR_CONTRACT_ADDRESS || '0x71c25bf4e37da4b7F2Efe341F21074eaF7096ef4',
  relayerAddress: process.env.RELAYER_ADDRESS || '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',

  // Active Grant Limits (Integer Paise: 100 INR = 10,000 paise)
  minDonationPaise: 10000,       // ₹100 min
  maxDonationPaise: 50000000,    // ₹500,000 max

  // Explorer URL template
  explorerBaseUrl: 'https://sepolia.etherscan.io/tx',
};

// Security check: Never run live mode with test keys
if (config.razorpayMode === 'live' && config.razorpayKeyId.startsWith('rzp_test_')) {
  throw new Error('SECURITY VIOLATION: Cannot run RAZORPAY_MODE=live with test credentials.');
}
