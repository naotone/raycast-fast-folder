import { describe, expect, it } from 'vitest';

import { calculateMatchScore, sortFolders, type FolderItem } from './search-utils';

describe('calculateMatchScore', () => {
  it('does not return fuzzy matches when fuzzy matching is disabled', () => {
    const result = calculateMatchScore('Project Archive', 'pa', 0, false, {
      enableFuzzyMatch: false,
    });

    expect(result).toEqual({ score: 0, reason: 'no match' });
  });

  it('returns fuzzy matches when fuzzy matching is enabled', () => {
    const result = calculateMatchScore('Project Archive', 'pa', 0, false, {
      enableFuzzyMatch: true,
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.reason).toContain('fuzzy');
  });
});

describe('sortFolders', () => {
  const folders: FolderItem[] = [
    {
      path: '/recent',
      name: 'Recent',
      isFromHistory: true,
      score: 10,
    },
    {
      path: '/regular',
      name: 'Regular',
      isFromHistory: false,
      score: 90,
    },
  ];

  it('prioritizes history items when recent priority is enabled', () => {
    expect(sortFolders(folders, { prioritizeRecent: true })[0].path).toBe(
      '/recent'
    );
  });

  it('uses score ordering when recent priority is disabled', () => {
    expect(sortFolders(folders, { prioritizeRecent: false })[0].path).toBe(
      '/regular'
    );
  });
});
