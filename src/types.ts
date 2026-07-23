export interface NeighborRef {
  index: number;
  word: string;
  similarity: number;
}

export interface AddedWord {
  word: string;
  vec: number[]; // raw word2vec coords (dims-length), same space as the seeds
  position: [number, number, number];
  neighbors: NeighborRef[];
}
