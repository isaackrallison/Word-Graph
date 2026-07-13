import { useState } from 'react';

interface WordInputProps {
  busy: boolean;
  disabled: boolean;
  onSubmit: (word: string) => void;
}

export function WordInput({ busy, disabled, onSubmit }: WordInputProps) {
  const [value, setValue] = useState('');

  return (
    <form
      className="word-input"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSubmit(value);
        setValue('');
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="type a word… or try: king - man + woman"
        maxLength={40}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="word to add"
      />
      <button type="submit" disabled={disabled || busy || !value.trim()}>
        {busy ? 'placing…' : 'add'}
      </button>
    </form>
  );
}
