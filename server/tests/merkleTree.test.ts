import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { DeterministicMerkleTree, type MerkleLeaf } from '../src/services/merkleTree.js';

describe('Deterministic Merkle Tree Engine (OpenZeppelin Sorted-Pairs Compatible)', () => {
  it('1. correctly computes root and proof for a single-leaf tree', () => {
    const leaf: MerkleLeaf = {
      commitmentId: 'anc-001',
      evidenceDigest: '0x' + crypto.createHash('sha256').update('doc-001').digest('hex'),
      ownerAddress: '0x1111111111111111111111111111111111111111',
    };

    const tree = new DeterministicMerkleTree([leaf]);
    const root = tree.getRoot();
    expect(root).toBeDefined();
    expect(root.startsWith('0x')).toBe(true);

    const proofResult = tree.getProof(0);
    expect(proofResult.leafIndex).toBe(0);
    expect(proofResult.proof.length).toBe(0); // Single leaf has empty proof

    const isValid = DeterministicMerkleTree.verifyProof(proofResult.leafHash, proofResult.proof, root);
    expect(isValid).toBe(true);
  });

  it('2. correctly computes roots and valid proofs for even-sized trees (2, 4, 8, 16)', () => {
    for (const size of [2, 4, 8, 16]) {
      const leaves: MerkleLeaf[] = Array.from({ length: size }, (_, i) => ({
        commitmentId: `anc-even-${size}-${i}`,
        evidenceDigest: '0x' + crypto.createHash('sha256').update(`item-${i}`).digest('hex'),
        ownerAddress: '0x2222222222222222222222222222222222222222',
      }));

      const tree = new DeterministicMerkleTree(leaves);
      const root = tree.getRoot();

      // Verify inclusion proof for every single leaf
      for (let i = 0; i < size; i++) {
        const proofResult = tree.getProof(i);
        const isValid = DeterministicMerkleTree.verifyProof(proofResult.leafHash, proofResult.proof, root);
        expect(isValid).toBe(true);
      }
    }
  });

  it('3. correctly handles odd-sized batches (3, 5, 9, 17, 33)', () => {
    for (const size of [3, 5, 9, 17, 33]) {
      const leaves: MerkleLeaf[] = Array.from({ length: size }, (_, i) => ({
        commitmentId: `anc-odd-${size}-${i}`,
        evidenceDigest: '0x' + crypto.createHash('sha256').update(`odd-${i}`).digest('hex'),
        ownerAddress: '0x3333333333333333333333333333333333333333',
      }));

      const tree = new DeterministicMerkleTree(leaves);
      const root = tree.getRoot();

      // Verify every leaf in the odd-sized tree
      for (let i = 0; i < size; i++) {
        const proofResult = tree.getProof(i);
        const isValid = DeterministicMerkleTree.verifyProof(proofResult.leafHash, proofResult.proof, root);
        expect(isValid).toBe(true);
      }
    }
  });

  it('4. rejects tampered leaf data or altered sibling proofs', () => {
    const leaves: MerkleLeaf[] = Array.from({ length: 4 }, (_, i) => ({
      commitmentId: `anc-tamper-${i}`,
      evidenceDigest: '0x' + crypto.createHash('sha256').update(`tamper-${i}`).digest('hex'),
      ownerAddress: '0x4444444444444444444444444444444444444444',
    }));

    const tree = new DeterministicMerkleTree(leaves);
    const root = tree.getRoot();
    const proofResult = tree.getProof(1);

    // 1. Tamper with leaf content
    const tamperedLeaf = '0x' + '9'.repeat(64);
    const validWithTamperedLeaf = DeterministicMerkleTree.verifyProof(tamperedLeaf, proofResult.proof, root);
    expect(validWithTamperedLeaf).toBe(false);

    // 2. Tamper with proof sibling
    const tamperedProof = [...proofResult.proof];
    tamperedProof[0] = '0x' + '8'.repeat(64);
    const validWithTamperedProof = DeterministicMerkleTree.verifyProof(proofResult.leafHash, tamperedProof, root);
    expect(validWithTamperedProof).toBe(false);
  });

  it('5. handles duplicate leaves deterministically without crash', () => {
    const identicalDigest = '0x' + crypto.createHash('sha256').update('same_document').digest('hex');
    const leaves: MerkleLeaf[] = [
      { commitmentId: 'dup-1', evidenceDigest: identicalDigest, ownerAddress: '0x555' },
      { commitmentId: 'dup-2', evidenceDigest: identicalDigest, ownerAddress: '0x555' },
      { commitmentId: 'dup-3', evidenceDigest: identicalDigest, ownerAddress: '0x555' },
    ];

    const tree = new DeterministicMerkleTree(leaves);
    const root = tree.getRoot();
    expect(root).toBeDefined();

    for (let i = 0; i < leaves.length; i++) {
      const proofResult = tree.getProof(i);
      expect(DeterministicMerkleTree.verifyProof(proofResult.leafHash, proofResult.proof, root)).toBe(true);
    }
  });
});
