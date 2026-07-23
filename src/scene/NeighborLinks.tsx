import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import type { GraphData } from '../lib/data';
import type { Neighbor } from '../lib/project';

const LINK_COLOR = '#ffd27f'; // warm gold — "these are the real semantic neighbors"

interface NeighborLinksProps {
  focus: number;
  neighbors: Neighbor[];
  data: GraphData;
}

/**
 * Lines from the focused seed word to its true top-k neighbors in the PCA-192
 * space. Because the 3-D UMAP layout only preserves ~44% of top-10 neighbors,
 * many genuine neighbors sit far away on screen — these links surface them
 * regardless of where the layout scattered them. Higher-ranked (more similar)
 * neighbors draw brighter. Shown on select only (neighbor search is O(count)).
 */
export function NeighborLinks({ focus, neighbors, data }: NeighborLinksProps) {
  const origin = useMemo<[number, number, number]>(
    () => [data.positions[focus * 3], data.positions[focus * 3 + 1], data.positions[focus * 3 + 2]],
    [focus, data]
  );

  return (
    <>
      {neighbors.map((n, i) => (
        <Line
          key={n.index}
          points={[
            origin,
            [
              data.positions[n.index * 3],
              data.positions[n.index * 3 + 1],
              data.positions[n.index * 3 + 2],
            ],
          ]}
          color={LINK_COLOR}
          transparent
          opacity={Math.max(0.14, 0.5 - i * 0.035)}
          lineWidth={1.4}
        />
      ))}
    </>
  );
}
