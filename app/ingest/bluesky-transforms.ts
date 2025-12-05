import {
  BlueskyPostPipeline,
  WordOccurrencePipeline,
  BlueskyPost,
  WordOccurrence,
} from "./bluesky-models";

// Common stop words to filter out (not meaningful for trend analysis)
const STOP_WORDS = new Set([
  // Articles
  "a",
  "an",
  "the",
  // Conjunctions
  "and",
  "or",
  "but",
  "nor",
  "so",
  "yet",
  // Prepositions
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "up",
  "down",
  "out",
  "off",
  "over",
  "under",
  "into",
  "through",
  "about",
  "between",
  "after",
  "before",
  // Verbs (common)
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "can",
  "get",
  "got",
  "go",
  "going",
  "went",
  "come",
  "came",
  "make",
  "made",
  "take",
  "took",
  // Pronouns
  "i",
  "me",
  "my",
  "mine",
  "myself",
  "you",
  "your",
  "yours",
  "yourself",
  "he",
  "him",
  "his",
  "himself",
  "she",
  "her",
  "hers",
  "herself",
  "it",
  "its",
  "itself",
  "we",
  "us",
  "our",
  "ours",
  "ourselves",
  "they",
  "them",
  "their",
  "theirs",
  "themselves",
  // Demonstratives
  "this",
  "that",
  "these",
  "those",
  // Question words
  "what",
  "which",
  "who",
  "whom",
  "whose",
  "when",
  "where",
  "why",
  "how",
  // Other common words
  "if",
  "then",
  "else",
  "than",
  "as",
  "just",
  "also",
  "only",
  "even",
  "more",
  "most",
  "less",
  "very",
  "too",
  "all",
  "any",
  "some",
  "no",
  "not",
  "yes",
  "now",
  "here",
  "there",
  "still",
  "well",
  "back",
  "way",
  "like",
  "know",
  "think",
  "see",
  "want",
  "say",
  "said",
  "really",
  "much",
  "one",
  "two",
  "new",
  "good",
  "first",
  "last",
  "been",
  "being",
  "https",
  "http",
  "www",
  "com",
]);

// Minimum word length to consider (filters out meaningless short words)
const MIN_WORD_LENGTH = 3;

/**
 * Truncate a date to 10-second interval precision
 */
function truncateToInterval(date: Date): Date {
  const seconds = Math.floor(date.getSeconds() / 10) * 10;
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    seconds,
    0,
  );
}


/**
 * Extract and normalize words from text
 */
function extractWords(text: string): string[] {
  // Remove URLs
  const withoutUrls = text.replace(/https?:\/\/\S+/gi, "");

  // Remove mentions (@handle) and hashtags for separate processing
  const withoutMentions = withoutUrls.replace(/@[\w.]+/g, "");

  // Extract words: lowercase, remove punctuation, split on whitespace
  const words = withoutMentions
    .toLowerCase()
    .replace(/[^\w\s#]/g, " ") // Keep # for hashtags
    .split(/\s+/)
    .map((word) => word.replace(/^#+/, "")) // Remove leading # from hashtags
    .filter((word) => word.length >= MIN_WORD_LENGTH)
    .filter((word) => !STOP_WORDS.has(word))
    .filter((word) => !/^\d+$/.test(word)); // Filter pure numbers

  return words;
}

/**
 * Transform BlueskyPost to WordOccurrence records
 * Groups words and counts occurrences per 10-second interval
 */
BlueskyPostPipeline.stream!.addTransform(
  WordOccurrencePipeline.stream!,
  async (post: BlueskyPost): Promise<WordOccurrence[]> => {
    const words = extractWords(post.text);

    if (words.length === 0) {
      return [];
    }

    // Get the 10-second interval timestamp for grouping
    const postDate =
      post.createdAt instanceof Date
        ? post.createdAt
        : new Date(post.createdAt);
    const interval = truncateToInterval(postDate);

    // Count word occurrences
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    // Create WordOccurrence records
    const occurrences: WordOccurrence[] = [];
    wordCounts.forEach((count, word) => {
      occurrences.push({
        intervalTimestamp: interval,
        word,
        count,
      });
    });

    return occurrences;
  },
);

// Log processed posts for debugging
BlueskyPostPipeline.stream!.addConsumer((post: BlueskyPost) => {
  const words = extractWords(post.text);
  if (words.length > 0) {
    console.log(
      `[Bluesky] Processed post with ${words.length} words: ${words.slice(0, 5).join(", ")}...`,
    );
  }
});
