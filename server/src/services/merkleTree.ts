import { ethers } from 'ethers';

export interface MerkleLeaf {
  commitmentId: string;
  evidenceDigest: string; // 32-byte hex hash
  ownerAddress: string;
}

export interface MerkleProofResult {
  leafIndex: number;
  leafHash: string;
  root: string;
  proof: string[]; // Array of 32-byte hex hashes
}

/**
 * Deterministic Merkle Tree Engine for Ethereum Sepolia Batch Commitments
 * - Standard OpenZeppelin-compatible sorted-pairs Keccak-256 algorithm
 * - Pairs are sorted lexicographically: a <= b ? hash(a, b) : hash(b, a)
 * - Odd-node rule: carry forward the odd node to the next level
 */
export class DeterministicMerkleTree {
  private leaves: string[];
  private layers: string[][];

  constructor(leafData: (string | MerkleLeaf)[]) {
    if (leafData.length === 0) {
      throw new Error('Cannot construct Merkle tree with zero leaves.');
    }

    // Convert inputs to 32-byte hex leaf hashes
    this.leaves = leafData.map((item) => {
      if (typeof item === 'string') {
        return item.startsWith('0x') && item.length === 66
          ? item
          : ethers.keccak256(ethers.toUtf8Bytes(item));
      }
      return DeterministicMerkleTree.hashLeaf(item);
    });

    this.layers = [this.leaves];
    this.buildTree();
  }

  /**
   * Hashes a structured MerkleLeaf using Ethereum ABI encoding
   */
  public static hashLeaf(leaf: MerkleLeaf): string {
    const cleanDigest = leaf.evidenceDigest.startsWith('0x')
      ? leaf.evidenceDigest
      : '0x' + leaf.evidenceDigest;

    // keccak256(abi.encode(string, bytes32, string))
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'bytes32', 'string'],
        [leaf.commitmentId, cleanDigest, leaf.ownerAddress.toLowerCase()]
      )
    );
  }

  /**
   * Hashes two sibling nodes using OpenZeppelin sorted-pairs rule
   */
  public static hashPair(a: string, b: string): string {
    const aBig = BigInt(a);
    const bBig = BigInt(b);

    if (aBig <= bBig) {
      return ethers.keccak256(ethers.concat([a, b]));
    } else {
      return ethers.keccak256(ethers.concat([b, a]));
    }
  }

  private buildTree(): void {
    let currentLayer = this.layers[0];

    while (currentLayer.length > 1) {
      const nextLayer: string[] = [];

      for (let i = 0; i < currentLayer.length; i += 2) {
        if (i + 1 < currentLayer.length) {
          nextLayer.push(DeterministicMerkleTree.hashPair(currentLayer[i], currentLayer[i + 1]));
        } else {
          // Odd node rule: carry forward odd node
          nextLayer.push(currentLayer[i]);
        }
      }

      this.layers.push(nextLayer);
      currentLayer = nextLayer;
    }
  }

  public getRoot(): string {
    const topLayer = this.layers[this.layers.length - 1];
    return topLayer[0];
  }

  public getLeafCount(): number {
    return this.leaves.length;
  }

  public getLeaves(): string[] {
    return [...this.leaves];
  }

  /**
   * Generates a cryptographic inclusion proof for a leaf at index
   */
  public getProof(index: number): MerkleProofResult {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`Leaf index ${index} out of bounds (0..${this.leaves.length - 1}).`);
    }

    const leafHash = this.leaves[index];
    const proof: string[] = [];
    let currentIndex = index;

    for (let layerIndex = 0; layerIndex < this.layers.length - 1; layerIndex++) {
      const currentLayer = this.layers[layerIndex];
      const isRightNode = currentIndex % 2 === 1;
      const siblingIndex = isRightNode ? currentIndex - 1 : currentIndex + 1;

      if (siblingIndex < currentLayer.length) {
        proof.push(currentLayer[siblingIndex]);
      }
      // If odd node had no sibling, nothing is pushed for this layer (it carried forward)

      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      leafIndex: index,
      leafHash,
      root: this.getRoot(),
      proof,
    };
  }

  /**
   * Verifies an inclusion proof against an expected root
   */
  public static verifyProof(leaf: string, proof: string[], expectedRoot: string): boolean {
    let computedHash = leaf;

    for (const sibling of proof) {
      computedHash = DeterministicMerkleTree.hashPair(computedHash, sibling);
    }

    return computedHash.toLowerCase() === expectedRoot.toLowerCase();
  }
}
