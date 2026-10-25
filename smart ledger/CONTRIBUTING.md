# Contributing to AidFlow

Thank you for your interest in contributing to AidFlow. This is an open-source humanitarian finance protocol and every contribution — no matter how small — has the potential to improve how aid reaches people in need.

---

## Project Philosophy

AidFlow is built on three principles:

1. **Transparency by default** — fund movement should be publicly verifiable, not optionally disclosed
2. **Accountability at every layer** — every actor (donor, admin, distributor) leaves an immutable trace
3. **Openness to contribution** — the codebase is intentionally structured to welcome contributors of all skill levels

We believe the best infrastructure for humanitarian finance will be built in the open, by a diverse community that understands both the technical constraints of Soroban and the real-world context of aid distribution.

---

## Code Standards

### Rust (Smart Contracts)

- Follow [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- Use `clippy` before submitting (`cargo clippy -- -D warnings`)
- Format with `rustfmt` (`cargo fmt`)
- All public functions must have doc comments (`///`)
- Error types should use the `ContractError` enum pattern defined in each contract
- Avoid `unwrap()` in contract logic — always use `Result` returns with explicit errors
- Keep functions small and single-purpose

### TypeScript (SDK)

- Use TypeScript strict mode (`"strict": true` in tsconfig)
- Prefer `async/await` over raw Promises
- All exported functions must have JSDoc comments
- Use named exports, not default exports

### General

- No commented-out dead code in PRs
- Variable names should be descriptive — `beneficiary_address` not `ba`
- If you're unsure whether a design decision is right, open an issue first

---

## Local Setup

### Prerequisites

```bash
# Rust (stable)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Soroban CLI
cargo install --locked soroban-cli

# Node.js 18+ (for SDK)
# Use nvm or download from https://nodejs.org
```

### Clone and Build

```bash
git clone https://github.com/your-org/aidflow.git
cd aidflow

# Install SDK dependencies
cd sdk && npm install && cd ..

# Build all contracts
./scripts/build.sh
```

### Run Tests

```bash
# All contracts
./scripts/test.sh

# Single contract
cd contracts/fund_pool
cargo test -- --nocapture

# SDK tests
cd sdk
npm test
```

### Lint

```bash
# Rust
cargo fmt --check
cargo clippy -- -D warnings

# TypeScript
cd sdk && npm run lint
```

---

## Branching Strategy

We follow a simplified GitFlow model:

```
main          ← stable, tagged releases only
  └── dev     ← integration branch, always passing CI
        └── feature/your-feature-name   ← your work
        └── fix/issue-description
        └── docs/update-readme
```

**Rules:**
- Never commit directly to `main` or `dev`
- Branch from `dev`, target `dev` in your PR
- Branch names should be lowercase and hyphen-separated
- Prefix with `feature/`, `fix/`, `docs/`, `security/`, or `refactor/`

---

## Pull Request Rules

Before opening a PR:

- [ ] All tests pass locally (`./scripts/test.sh`)
- [ ] No clippy warnings (`cargo clippy -- -D warnings`)
- [ ] Code is formatted (`cargo fmt`)
- [ ] New functionality has test coverage
- [ ] Documentation updated if public API changed
- [ ] PR description explains *why*, not just *what*

PR title format: `[type]: short description`

Examples:
- `feat: add oracle-based milestone trigger`
- `fix: prevent double-release in distribution engine`
- `docs: clarify SDK setup instructions`
- `refactor: extract shared error types to common crate`

**PR size:** Keep PRs focused. A PR that does one thing well is always preferred over a PR that does five things adequately.

---

## Issue Labeling System

When filing or picking up issues, use these labels:

| Label | Meaning |
|---|---|
| `good first issue` | No prior Soroban experience needed; well-scoped |
| `intermediate` | Requires understanding of Soroban storage and cross-contract calls |
| `advanced` | Deep Rust/Soroban knowledge; protocol-level implications |
| `security` | Relates to vulnerabilities, access control, or fund safety |
| `protocol design` | Architectural decisions that affect the whole system |
| `documentation` | Docs, comments, or examples only |
| `bug` | Something is broken |
| `enhancement` | New feature or improvement |
| `help wanted` | Maintainers are actively seeking community help on this |

---

## Contributor Onboarding

If this is your first contribution, here's a recommended path:

### Step 1: Understand the Protocol
Read `docs/architecture.md` and `docs/contracts.md` before touching code. Understanding the system design will save you hours of confusion.

### Step 2: Run the Existing Tests
```bash
./scripts/test.sh
```
All tests should pass. If they don't, open an issue.

### Step 3: Pick a `good first issue`
Browse [open issues](https://github.com/your-org/aidflow/issues?q=label%3A"good+first+issue") and comment to claim one. A maintainer will confirm and answer any questions.

### Step 4: Make Your Change in a Branch
```bash
git checkout dev
git pull origin dev
git checkout -b feature/your-feature-name
```

### Step 5: Write Tests First (if applicable)
For contract logic, try to write a failing test before the implementation. This helps confirm you understand what the code should do.

### Step 6: Submit Your PR
Push your branch and open a PR against `dev`. Fill in the PR template completely.

### Step 7: Respond to Review
Maintainers will review within 5 business days. Be open to feedback — every comment is about improving the protocol, not judging you.

---

## Security Vulnerabilities

**Do not file security vulnerabilities as public issues.**

If you discover a security issue, email `security@aidflow.xyz` with:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Your suggested fix (optional)

We will respond within 48 hours and credit you in the security advisory.

---

## Recognition

All contributors are added to `CONTRIBUTORS.md` after their first merged PR. Significant contributors may be invited to join as project maintainers.

We believe in crediting the community that builds this.

---

*Questions? Open a [Discussion](https://github.com/your-org/aidflow/discussions) or ask in our community chat.*
