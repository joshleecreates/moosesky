"use client";

import { useState, type FormEvent } from "react";

interface SearchFormProps {
  onSearch: (word: string) => void;
  onCompare: (word: string) => void;
  currentWords: string[];
}

export function SearchForm({ onSearch, onCompare, currentWords }: SearchFormProps) {
  const [input, setInput] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const word = input.trim().toLowerCase();
    if (word) {
      onSearch(word);
      setInput("");
    }
  }

  function handleCompare() {
    const word = input.trim().toLowerCase();
    if (word) {
      onCompare(word);
      setInput("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Search for a word..."
        className="flex-1 rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="submit"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Search
      </button>
      {currentWords.length > 0 && (
        <button
          type="button"
          onClick={handleCompare}
          disabled={!input.trim()}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Compare
        </button>
      )}
    </form>
  );
}
