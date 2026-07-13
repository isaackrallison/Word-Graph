import type { Term } from '../lib/algebra';
import type { Neighbor } from '../lib/project';

interface EquationCardProps {
  terms: Term[];
  candidates: Neighbor[];
  words: { word: string }[]; // data.words for index → word lookup
  onSelect(index: number): void;
  onDismiss(): void;
}

/** "king − man + woman ≈ queen" banner with runner-up chips. */
export function EquationCard({ terms, candidates, words, onSelect, onDismiss }: EquationCardProps) {
  const top = candidates[0];
  return (
    <div className="equation-card" role="status">
      <button className="equation-close" onClick={onDismiss} aria-label="dismiss">
        ×
      </button>
      <p className="equation-expr">
        {terms.map((t, i) => (
          <span key={i}>
            {i > 0 && <span className="equation-op"> {t.sign === 1 ? '+' : '−'} </span>}
            {t.word}
          </span>
        ))}
        <span className="equation-op"> ≈ </span>
        <button className="equation-answer" onClick={() => onSelect(top.index)}>
          {words[top.index].word}
        </button>
      </p>
      {candidates.length > 1 && (
        <p className="equation-runners">
          also close:{' '}
          {candidates.slice(1, 5).map((n) => (
            <button key={n.index} className="equation-runner" onClick={() => onSelect(n.index)}>
              {words[n.index].word}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
