import type { AddedWord } from '../types';

interface AddedWordsProps {
  added: AddedWord[];
  onSelect: (word: AddedWord) => void;
  onRemove: (word: string) => void;
}

export function AddedWords({ added, onSelect, onRemove }: AddedWordsProps) {
  if (added.length === 0) return null;
  return (
    <aside className="added-words" aria-label="your words">
      <h2>your words</h2>
      <ul>
        {added.map((a) => (
          <li key={a.word}>
            <button className="chip" onClick={() => onSelect(a)} title="fly to word">
              {a.word}
            </button>
            <button
              className="chip-remove"
              onClick={() => onRemove(a.word)}
              aria-label={`remove ${a.word}`}
              title="remove"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
