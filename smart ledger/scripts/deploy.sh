#!/usr/bin/env bash
# scripts/deploy.sh
# Deploy all AidFlow contracts to a Soroban network.
#
# Prerequisites:
#   - soroban-cli installed
#   - A Soroban identity named "deployer" configured
#   - NETWORK env variable set: "testnet" | "mainnet" | "standalone"
#
# Usage:
#   NETWORK=testnet ./scripts/deploy.sh
#
# Output:
#   Creates .env.${NETWORK} with all contract IDs

set -euo pipefail

NETWORK="${NETWORK:-testnet}"
IDENTITY="${IDENTITY:-deployer}"
ENV_FILE=".env.${NETWORK}"
RELEASE_DIR="target/wasm32-unknown-unknown/release"

echo "🚀 Deploying AidFlow to $NETWORK..."
echo "   Identity: $IDENTITY"
echo ""

# Build first
echo "Building contracts..."
./scripts/build.sh
echo ""

# Initialize env file
echo "# AidFlow deployed contracts — $NETWORK" > "$ENV_FILE"
echo "# Generated: $(date -u)" >> "$ENV_FILE"
echo "" >> "$ENV_FILE"

deploy_contract() {
  local name=$1
  local wasm_name=$2

  echo "  Deploying $name..."
  local contract_id
  contract_id=$(soroban contract deploy \
    --wasm "$RELEASE_DIR/${wasm_name}.wasm" \
    --source "$IDENTITY" \
    --network "$NETWORK" 2>/dev/null)

  echo "  ✅ $name: $contract_id"

  # Write to env file
  local var_name
  var_name=$(echo "$name" | tr '[:lower:]' '[:upper:]' | tr '-' '_')
  echo "${var_name}_CONTRACT_ID=${contract_id}" >> "$ENV_FILE"

  echo "$contract_id"
}

FUND_POOL_ID=$(deploy_contract "fund_pool" "fund_pool")
REGISTRY_ID=$(deploy_contract "beneficiary_registry" "beneficiary_registry")
MILESTONE_ID=$(deploy_contract "milestone_engine" "milestone_engine")
AUDIT_ID=$(deploy_contract "audit" "audit")
DISTRIBUTION_ID=$(deploy_contract "distribution" "distribution")

echo ""
echo "─────────────────────────────────────────"
echo "All contracts deployed to $NETWORK"
echo "Contract IDs written to: $ENV_FILE"
echo ""
echo "Next steps:"
echo "  1. Fund your deployer account if needed"
echo "  2. Initialize each contract:"
echo ""
echo "  soroban contract invoke --id $FUND_POOL_ID --source $IDENTITY --network $NETWORK \\"
echo "    -- initialize --admin \$(soroban keys address $IDENTITY) \\"
echo "    --token <USDC_TOKEN_ID> --distributor $DISTRIBUTION_ID"
echo ""
echo "  soroban contract invoke --id $REGISTRY_ID --source $IDENTITY --network $NETWORK \\"
echo "    -- initialize --admin \$(soroban keys address $IDENTITY)"
echo ""
echo "  soroban contract invoke --id $MILESTONE_ID --source $IDENTITY --network $NETWORK \\"
echo "    -- initialize --admin \$(soroban keys address $IDENTITY)"
echo ""
echo "  soroban contract invoke --id $DISTRIBUTION_ID --source $IDENTITY --network $NETWORK \\"
echo "    -- initialize --admin \$(soroban keys address $IDENTITY) \\"
echo "    --fund_pool $FUND_POOL_ID --registry $REGISTRY_ID \\"
echo "    --milestone_engine $MILESTONE_ID --token <USDC_TOKEN_ID>"
echo ""
echo "  soroban contract invoke --id $AUDIT_ID --source $IDENTITY --network $NETWORK \\"
echo "    -- initialize --admin \$(soroban keys address $IDENTITY) \\"
echo "    --authorized_loggers \"[$FUND_POOL_ID,$DISTRIBUTION_ID,$REGISTRY_ID,$MILESTONE_ID]\""
