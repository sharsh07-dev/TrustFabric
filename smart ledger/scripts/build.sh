#!/usr/bin/env bash
# scripts/build.sh
# Builds all AidFlow Soroban contracts to WASM.
#
# Usage:
#   ./scripts/build.sh           # Build all contracts
#   ./scripts/build.sh fund_pool # Build a specific contract

set -euo pipefail

CONTRACTS_DIR="contracts"
RELEASE_DIR="target/wasm32-unknown-unknown/release"

CONTRACTS=(
  "fund_pool"
  "distribution"
  "beneficiary_registry"
  "milestone_engine"
  "audit"
)

# If a specific contract is requested, only build that one
if [ $# -ge 1 ]; then
  CONTRACTS=("$1")
fi

echo "🔨 Building AidFlow contracts..."
echo ""

for contract in "${CONTRACTS[@]}"; do
  echo "  Building $contract..."
  cargo build \
    --manifest-path "$CONTRACTS_DIR/$contract/Cargo.toml" \
    --target wasm32-unknown-unknown \
    --release 2>&1 | grep -v "^$" | sed 's/^/    /'
  echo "  ✅ $contract built: $RELEASE_DIR/${contract}.wasm"
  echo ""
done

echo "✅ All contracts built successfully."
echo ""
echo "WASM files are in: $RELEASE_DIR/"
