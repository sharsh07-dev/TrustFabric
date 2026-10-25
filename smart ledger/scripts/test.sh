#!/usr/bin/env bash
# scripts/test.sh
# Runs all contract unit tests.
#
# Usage:
#   ./scripts/test.sh              # Test all contracts
#   ./scripts/test.sh fund_pool    # Test a specific contract
#   ./scripts/test.sh -- --nocapture  # Pass args to cargo test

set -euo pipefail

CONTRACTS=(
  "fund_pool"
  "distribution"
  "beneficiary_registry"
  "milestone_engine"
  "audit"
)

EXTRA_ARGS="${@:2}"

if [ $# -ge 1 ] && [[ "$1" != "--" ]]; then
  CONTRACTS=("$1")
  EXTRA_ARGS="${@:2}"
fi

echo "🧪 Running AidFlow contract tests..."
echo ""

PASSED=0
FAILED=0

for contract in "${CONTRACTS[@]}"; do
  echo "  Testing $contract..."
  if cargo test \
    --manifest-path "contracts/$contract/Cargo.toml" \
    --features testutils \
    $EXTRA_ARGS 2>&1 | tail -5 | sed 's/^/    /'; then
    echo "  ✅ $contract tests passed"
    PASSED=$((PASSED + 1))
  else
    echo "  ❌ $contract tests FAILED"
    FAILED=$((FAILED + 1))
  fi
  echo ""
done

echo "─────────────────────────────────"
echo "Results: $PASSED passed, $FAILED failed"

if [ $FAILED -gt 0 ]; then
  exit 1
fi

echo ""
echo "✅ All tests passed."
