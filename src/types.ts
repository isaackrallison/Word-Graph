export interface NeighborRef {
  index: number;
  word: string;
  similarity: number;
}

export interface AddedWord {
  word: string;
  vec: number[]; // pcaDims coords in the shared PCA basis
  position: [number, number, number];
  neighbors: NeighborRef[];
}
