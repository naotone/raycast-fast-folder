export interface FolderItem {
  path: string;
  name: string;
  isFromHistory: boolean;
  sourceDirectory?: string;
  isParentDirectory?: boolean;
  score?: number;
  matchReason?: string;
}

export interface MatchOptions {
  enableFuzzyMatch?: boolean;
  prioritizeRecent?: boolean;
}

export interface SortOptions {
  prioritizeRecent?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function calculateMatchScore(
  folderName: string,
  query: string,
  pathDepth = 0,
  isFromHistory = false,
  options: MatchOptions = {}
): { score: number; reason: string } {
  const enableFuzzyMatch = options.enableFuzzyMatch !== false;
  const prioritizeRecent = options.prioritizeRecent !== false;

  if (!query) {
    let score = 50;
    if (isFromHistory && prioritizeRecent) score += 20;
    return {
      score,
      reason:
        'no query' + (isFromHistory && prioritizeRecent ? ' + history' : ''),
    };
  }

  const normalizedName = folderName.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  const queryWords = normalizedQuery
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (queryWords.length > 1) {
    let totalScore = 0;

    for (const word of queryWords) {
      let wordScore = 0;

      if (normalizedName.includes(word)) {
        if (normalizedName.startsWith(word)) {
          wordScore = 90;
        } else if (
          normalizedName.match(new RegExp(`[\\s\\-_]${escapeRegExp(word)}`))
        ) {
          wordScore = 80;
        } else {
          wordScore = 70;
        }
      } else if (enableFuzzyMatch) {
        const fuzzyScore = calculateFuzzyScore(normalizedName, word);
        if (fuzzyScore > 0.5) {
          wordScore = Math.floor(50 + fuzzyScore * 20);
        }
      }

      if (wordScore === 0) {
        return { score: 0, reason: 'not all words match' };
      }

      totalScore += wordScore;
    }

    let score = Math.floor(totalScore / queryWords.length);
    let reason = 'multi-word match';

    if (isFromHistory && prioritizeRecent) {
      score += 20;
      reason += ' + history';
    }

    score -= Math.min(pathDepth * 5, 25);
    if (pathDepth > 0) {
      reason += ` -${pathDepth}depth`;
    }

    return { score: Math.max(score, 1), reason };
  }

  let score = 0;
  let reason = '';

  if (normalizedName === normalizedQuery) {
    score = 100;
    reason = 'exact match';
  } else if (normalizedName.startsWith(normalizedQuery)) {
    score = 90;
    reason = 'starts with';
  } else if (
    normalizedName.match(new RegExp(`[\\s\\-_]${escapeRegExp(normalizedQuery)}`))
  ) {
    score = 80;
    reason = 'word boundary';
  } else if (normalizedName.includes(normalizedQuery)) {
    score = 70;
    reason = 'contains';
  } else if (enableFuzzyMatch) {
    const fuzzyScore = calculateFuzzyScore(normalizedName, normalizedQuery);
    if (fuzzyScore > 0.5) {
      score = Math.floor(50 + fuzzyScore * 20);
      reason = 'fuzzy match';
    } else {
      return { score: 0, reason: 'no match' };
    }
  } else {
    return { score: 0, reason: 'no match' };
  }

  if (isFromHistory && prioritizeRecent) {
    score += 20;
    reason += ' + history';
  }

  score -= Math.min(pathDepth * 5, 25);
  if (pathDepth > 0) {
    reason += ` -${pathDepth}depth`;
  }

  return { score: Math.max(score, 1), reason };
}

export function calculateFuzzyScore(text: string, pattern: string): number {
  let textIndex = 0;
  let patternIndex = 0;
  let matches = 0;

  while (textIndex < text.length && patternIndex < pattern.length) {
    if (text[textIndex] === pattern[patternIndex]) {
      matches++;
      patternIndex++;
    }
    textIndex++;
  }

  return patternIndex === pattern.length ? matches / pattern.length : 0;
}

export function sortFolders(
  folders: FolderItem[],
  options: SortOptions = {}
): FolderItem[] {
  const prioritizeRecent = options.prioritizeRecent !== false;

  return [...folders].sort((a, b) => {
    if (prioritizeRecent) {
      if (a.isFromHistory && !b.isFromHistory) return -1;
      if (!a.isFromHistory && b.isFromHistory) return 1;
    }

    const scoreDifference = (b.score || 0) - (a.score || 0);
    if (scoreDifference !== 0) return scoreDifference;

    const nameDifference = a.name.localeCompare(b.name);
    if (nameDifference !== 0) return nameDifference;

    return a.path.localeCompare(b.path);
  });
}
