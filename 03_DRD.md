# Design Requirements Document (DRD) — TrustFabric

## 1. Design objective

Design TrustFabric as a considered, human-crafted enterprise finance/workflow product—not a generic AI dashboard, crypto landing page, or template full of oversized cards. It should feel like a focused tool used by a grant finance officer: precise, calm, information-dense where needed, legible, transparent about uncertainty, and efficient under time pressure.

## 2. Visual direction

### Personality

- Institutional, careful, quietly modern, accountable.
- More “financial operations workspace” than “futuristic AI platform.”
- Use editorial hierarchy and practical layouts, not decorative novelty.

### Color system

Use a restrained palette with semantic color, not broad gradients:

- Warm paper/off-white canvas for the main app background.
- Deep graphite for primary text and navigation.
- Muted evergreen as the primary action/accent.
- Slate/steel for secondary data and borders.
- Muted amber for `NEEDS_REVIEW` / pending warnings.
- Muted red only for blocked, invalid, or serious discrepancies.
- Neutral green only for verified outcomes.

Define accessible tokens and check text/background contrast. Do not color-code solely by color; include text labels and icons.

### Typography

Use a dependable UI sans font with excellent numeric legibility. Consider Inter, Geist Sans or the system stack. Use tabular numerals for amounts and IDs. Use consistent levels: page title, section title, table label, helper text, and status metadata. Avoid giant slogans inside product screens.

### Surface and shape

- Use subtle 1px borders, minimal shadows, and small/medium corner radii.
- Reserve cards for grouped tasks; don't place every text block inside a card.
- Avoid blur/glassmorphism, glowing borders, animated gradients, oversized decorative icons, excessive pills, and floating blobs.
- Keep controls compact and consistent. Use icons only to clarify action or status.

## 3. Human-crafted interface rules

1. Use meaningful, role-specific content, not generic labels such as “AI Insights” or made-up percentages.
2. Use realistic examples such as grant `CW-2026-014`, vendor `GreenBuild Supplies`, invoice `INV-1047`, and amount `₹42,500`; mark all such records as synthetic demo data.
3. Every status must communicate what was checked, by whom/what, when, and what remains unknown.
4. Prefer tables, timelines, relationship views and concise explanatory side panels over repeated KPI cards.
5. If a chart is used, show a real query result with units, labels, date range and empty/error states.
6. Make risk findings actionable: state the rule, evidence, relationship, affected amount, and next step.
7. Avoid fake “AI confidence 99.8%” values. Use measured model metrics only when a real evaluated model exists.
8. No fake logos or implication that this is an official TCS product. TrustFabric is an independent proposed product.
9. Use thoughtful whitespace, but do not sacrifice financial data density.
10. Keep motion subtle and functional (drawer opening, status change); respect reduced-motion preferences.

## 4. Core information architecture

Primary navigation:

- Overview
- Grants
- Fund flows
- Expenditure & evidence
- Findings
- Disbursement controls
- Audit trail
- Reports

Account/user menu should include role and sign out. The donor experience should be a separate scoped read-only route, not the same admin UI with controls merely hidden.

## 5. Required screens

### Screen A — Login

- Clear TrustFabric identity and concise explanation.
- Email/password or configured auth provider; visible loading/error messages.
- No fake social-login controls unless actually wired.
- Show demo access instructions only in development mode.

### Screen B — Overview

Show a restrained summary strip with actual database values:

- Total donations recorded (separate verified vs simulated totals).
- Allocated amount.
- Evidence-backed expenditure.
- Unreconciled amount.
- Claims requiring review.
- Amount under hold.

Below it, show recent fund-flow events, latest discrepancy findings and one useful “needs attention” list. Avoid making every metric a colorful card. Provide a clear date/filter control and empty state.

### Screen C — Grant list

Table fields: grant ID, project/purpose, donor, total amount, allocated, spent, held, remaining, evidence coverage, state and last updated. Use sticky headers only when useful. Provide search/filter/sort and a clear create-grant action.

### Screen D — Grant detail

Use a summary header and compact sub-navigation: Overview, Fund flow, Expenditure, Evidence, Reports, Activity.

Show purpose, conditions, allowed categories, allocations, remaining balance, source status and milestone state. The fund flow should show linked event IDs, timestamps, source chain/provider, amount/currency, fee, conversion/bridge linkage and evidence state. Missing links must be visible as gaps.

### Screen E — Fund-flow explorer

Use a linear timeline as the default and an optional graph view for hops. Do not create a decorative Sankey that cannot be read. Every transfer node must provide source reference, verification status, amount, asset/currency, timestamp/finality and related event. Show multi-hop paths such as source-chain donation → swap → bridge → destination transfer → bank off-ramp → vendor payment. If one link is unknown, show `UNRECONCILED` instead of inferring it.

### Screen F — Evidence workspace

Provide drag-and-drop/upload plus accessible file chooser. Display document title, type, size, uploaded date, file hash, related claim, extracted fields, duplicate matches and independent validation status. Keep actual documents private and only allow short-lived authorized access. Never expose untrusted filenames as raw HTML.

### Screen G — Findings

Each finding row contains severity, finding ID, type, affected claim/grant, amount, rule, created date and status. A detail panel explains:

- Why it triggered.
- Which fields/commitments matched.
- The linked prior claim.
- What was verified vs inferred.
- What action was applied.
- How to review or dispute it.

Do not use a generic “AI found fraud” message.

### Screen H — Disbursement control

Display the state machine and explicit conditions. A hold must show its trigger source and whether it is contract-enforced, application-enforced, or simulated. A release button must be disabled and rejected server-side for held claims. If a chain adapter is in use, show the transaction hash and finality status.

### Screen I — Audit trail

Chronological, filterable event table with actor/source, event, entity, timestamp, source reference and integrity-check status. Event details show before/after state or minimal diff, reason, evidence references and chain reference where applicable.

### Screen J — Donor verification

Display only records authorized for that donor. Show purpose, allocation, fund lineage, eligible expenditure, unresolved discrepancies, evidence status and signed delivery/impact proofs. Do not expose recipient names, addresses, private document URLs or personal data. Explain what “verified” means in plain language.

### Screen K — Reports

Allow an evidence-backed financial report with included/held/excluded amounts, reconciliation rate, missing proof links, category variations, duplicate claims and source provenance. Make report generation reproducible from underlying records; don't generate unsupported impact metrics.

## 6. Interaction requirements

- Forms show inline validation and preserve user input after recoverable errors.
- Every destructive action requires confirmation; no data reset silently overwrites records.
- Uploads show progress, file validation, result and retry action.
- Long-running chain reads show pending/finality state.
- Use toast/snackbar only for concise confirmations; important findings belong in the page.
- Hold transitions require reason metadata generated by the rule, not a freeform untraceable toggle.
- Tables support keyboard use and sensible row focus states.
- Filters persist within the current session where practical.
- Every view has loading, error, empty and populated states.

## 7. Accessibility and responsive behavior

- Target WCAG 2.2 AA for key flows where feasible.
- Full keyboard operation, visible focus, semantic headings/labels, screen-reader status announcements and descriptive icon labels.
- Don't use color alone for severity or verification state.
- At narrow widths, convert wide tables into accessible horizontal scroll or a deliberate summary/detail layout; do not shrink text until unreadable.
- Respect reduced motion.
- Amounts must have explicit currency; dates/timezones must be consistent.

## 8. Design QA acceptance checklist

- All numbers in dashboard come from real queries or are labeled demo fixtures.
- No generic gradients, glowing cards, random charts or fake metrics.
- Donor view is privacy-safe at the API and UI layers.
- Status labels distinguish recorded, source-attested, rule-checked, evidence-linked, simulated and unverified.
- Every risk finding has an explanation and related evidence.
- Primary journey can be completed with keyboard and mouse.
- Desktop 1440px, laptop 1280px, tablet and mobile layouts are reviewed.
- Errors and empty states are designed, not left as blank screens.
