interface PathCardProps {
  path: number[];
  words: { word: string }[]; // data.words for index → word lookup
  onSelect(index: number): void;
  onDismiss(): void;
}

/** "cat → kitten → pet → … → dog" chain with clickable stepping-stone words. */
export function PathCard({ path, words, onSelect, onDismiss }: PathCardProps) {
  return (
    <div className="equation-card" role="status">
      <button className="equation-close" onClick={onDismiss} aria-label="dismiss">
        ×
      </button>
      <p className="equation-expr">
        {path.map((idx, i) => (
          <span key={idx}>
            {i > 0 && <span className="equation-op"> → </span>}
            <button className="equation-runner" onClick={() => onSelect(idx)}>
              {words[idx].word}
            </button>
          </span>
        ))}
      </p>
    </div>
  );
}
