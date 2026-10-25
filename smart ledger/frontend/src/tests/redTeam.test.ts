import { describe, it, expect } from 'vitest';
import { RedTeamEngine } from '../services/redTeamEngine';

describe('Adversarial 30%-Forged Receipt Suite (PS42-R15 / Section 3)', () => {
  it('Generates exactly 100 receipts with exactly 30 forged (30%) and 70 clean (70%)', async () => {
    const engine = new RedTeamEngine();
    const corpus = await engine.generateCorpus(2026042);

    expect(corpus.length).toBe(100);

    const forgedCount = corpus.filter(c => c.groundTruthIsForged).length;
    const cleanCount = corpus.filter(c => !c.groundTruthIsForged).length;

    expect(forgedCount).toBe(30);
    expect(cleanCount).toBe(70);
  });

  it('Evaluates blind detector scoring, produces 2x2 confusion matrix and metrics', async () => {
    const engine = new RedTeamEngine();
    const metrics = await engine.evaluateCorpus();

    expect(metrics.totalCount).toBe(100);
    expect(metrics.groundTruthForgedCount).toBe(30);
    expect(metrics.groundTruthLegitCount).toBe(70);

    // Sum of confusion matrix components must equal total
    const totalMatrix = metrics.truePositives + metrics.falsePositives + metrics.trueNegatives + metrics.falseNegatives;
    expect(totalMatrix).toBe(100);

    // True positives must be > 0 and precision/recall computed
    expect(metrics.truePositives).toBeGreaterThan(0);
    expect(metrics.precision).toBeGreaterThan(0.9); // High precision on deterministic rules
    expect(metrics.recall).toBeGreaterThan(0.9);
    expect(metrics.falsePositiveRate).toBeLessThan(0.05);

    // Rule breakdown has tracked detections
    expect(metrics.ruleBreakdown['RT-RULE-01'].detected).toBeGreaterThan(0);
    expect(metrics.ruleBreakdown['RT-RULE-03'].detected).toBeGreaterThan(0);
  });
});
