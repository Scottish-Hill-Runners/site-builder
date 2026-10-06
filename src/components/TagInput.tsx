'use client';

import { useState, type KeyboardEvent } from 'react';

export interface TagInputProps {
  id?: string;
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

// Chip-style multi-value input; commits a tag on Enter/Tab/blur instead of
// splitting on commas, since tag values themselves may contain commas.
export default function TagInput({ id, label, value, onChange, placeholder }: TagInputProps) {
  const [draft, setDraft] = useState('');

  function commitDraft() {
    const trimmed = draft.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setDraft('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (draft.trim()) {
        e.preventDefault();
        commitDraft();
      }
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300" htmlFor={id}>
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-300 bg-white px-2 py-1.5 shadow-sm focus-within:border-blue-500 focus-within:outline-none focus-within:ring-1 focus-within:ring-blue-500 dark:border-slate-600 dark:bg-slate-800">
        {value.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/50 dark:text-blue-200"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              aria-label={`Remove ${tag}`}
              className="text-blue-600 hover:text-blue-900 dark:text-blue-300 dark:hover:text-white"
            >
              &times;
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          placeholder={value.length === 0 ? placeholder : undefined}
          className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm text-gray-900 outline-none dark:text-white"
        />
      </div>
    </div>
  );
}
