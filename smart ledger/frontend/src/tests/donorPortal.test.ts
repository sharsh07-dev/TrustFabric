import { describe, it, expect } from 'vitest';
import { DonorPortalService } from '../services/donorPortal';
import { createInitialSeedData } from '../services/seedData';

describe('Donor Privacy Projection (PS42-R06 / AT-SEC-01 to AT-SEC-03)', () => {
  it('AT-SEC-02: Denies Donor A from viewing Donor B’s grant data', async () => {
    const seed = await createInitialSeedData();
    const grant = seed.grants[0]; // Belonging to 'donor-northstar'

    // Attempting query with unauthorized donor
    const result = DonorPortalService.generateProjection({
      donorId: 'unauthorized-donor-xyz',
      grant,
      claims: seed.claims,
      flowEdges: seed.flowEdges,
      deliveryAttestations: seed.deliveryAttestations,
      findings: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('ACCESS DENIED');
  });

  it('PS42-R06 & AT-SEC-03: Authorized donor projection contains zero beneficiary PII or raw document URLs', async () => {
    const seed = await createInitialSeedData();
    const grant = seed.grants[0];

    const result = DonorPortalService.generateProjection({
      donorId: grant.donorId,
      grant,
      claims: seed.claims,
      flowEdges: seed.flowEdges,
      deliveryAttestations: seed.deliveryAttestations,
      findings: [],
    });

    expect(result.success).toBe(true);
    const projection = result.projection!;
    expect(projection).toBeDefined();

    const serialized = JSON.stringify(projection);

    // Assert that raw storage paths, local file paths, or private canary strings are NEVER leaked
    expect(serialized.includes('vault://')).toBe(false);
    expect(serialized.includes('/Users/')).toBe(false);
    expect(serialized.includes('private_key')).toBe(false);

    // Verify sanitized delivery statement
    expect(projection.milestones[0].deliveryStatementMasked).toContain('Beneficiary identity protected');
  });
});
