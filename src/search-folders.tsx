import { useState, useEffect } from 'react';
import {
  ActionPanel,
  Action,
  List,
  showToast,
  Toast,
  getPreferenceValues,
  Icon,
  LocalStorage,
} from '@raycast/api';
import { useCachedState } from '@raycast/utils';
import { readdir, stat } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { exec } from 'child_process';

interface Preferences {
  searchPaths: string;
  maxHistoryItems: string;
  searchDepth: string;
  maxResults: string;
  debounceDelay: string;
  enableFuzzyMatch: string;
  prioritizeRecent: string;
}

interface FolderItem {
  path: string;
  name: string;
  lastUsed?: Date;
  isFromHistory: boolean;
  sourceDirectory?: string;
  isParentDirectory?: boolean;
  score?: number;
  matchReason?: string;
}

// Calculate match score for a folder name against search query
function calculateMatchScore(
  folderName: string,
  query: string,
  pathDepth: number = 0,
  isFromHistory: boolean = false
): { score: number; reason: string } {
  if (!query) {
    let score = 50;
    if (isFromHistory) score += 20;
    return { score, reason: 'no query' + (isFromHistory ? ' + history' : '') };
  }

  const normalizedName = folderName.toLowerCase();
  const normalizedQuery = query.toLowerCase();

  // Check if query contains multiple words (space-separated)
  const queryWords = normalizedQuery.split(/\s+/).filter(word => word.length > 0);
  
  if (queryWords.length > 1) {
    // Multi-word search: all words must match
    let allWordsMatch = true;
    let totalScore = 0;
    
    for (const word of queryWords) {
      let wordMatched = false;
      let wordScore = 0;
      
      // Check if word appears in folder name
      if (normalizedName.includes(word)) {
        wordMatched = true;
        if (normalizedName.startsWith(word)) {
          wordScore = 90;
        } else if (normalizedName.match(new RegExp(`[\\s\\-_]${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))) {
          wordScore = 80;
        } else {
          wordScore = 70;
        }
      } else {
        // Try fuzzy match for individual word
        const fuzzyScore = calculateFuzzyScore(normalizedName, word);
        if (fuzzyScore > 0.5) {
          wordMatched = true;
          wordScore = Math.floor(50 + fuzzyScore * 20);
        }
      }
      
      if (!wordMatched) {
        allWordsMatch = false;
        break;
      }
      
      totalScore += wordScore;
    }
    
    if (allWordsMatch) {
      // Average score across all words
      let score = Math.floor(totalScore / queryWords.length);
      let reason = 'multi-word match';
      
      // Apply bonuses and penalties
      if (isFromHistory) {
        score += 20;
        reason += ' + history';
      }
      
      // Path depth penalty (deeper = lower score)
      score -= Math.min(pathDepth * 5, 25);
      if (pathDepth > 0) {
        reason += ` -${pathDepth}depth`;
      }
      
      return { score: Math.max(score, 1), reason };
    } else {
      return { score: 0, reason: 'not all words match' };
    }
  }

  // Single word search (original logic)
  let score = 0;
  let reason = '';

  // Exact match
  if (normalizedName === normalizedQuery) {
    score = 100;
    reason = 'exact match';
  }
  // Starts with query
  else if (normalizedName.startsWith(normalizedQuery)) {
    score = 90;
    reason = 'starts with';
  }
  // Word boundary match (after space, dash, underscore)
  else if (
    normalizedName.match(
      new RegExp(
        `[\\s\\-_]${normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
      )
    )
  ) {
    score = 80;
    reason = 'word boundary';
  }
  // Contains query
  else if (normalizedName.includes(normalizedQuery)) {
    score = 70;
    reason = 'contains';
  }
  // Fuzzy match (characters in sequence)
  else {
    const fuzzyScore = calculateFuzzyScore(normalizedName, normalizedQuery);
    if (fuzzyScore > 0.5) {
      score = Math.floor(50 + fuzzyScore * 20);
      reason = 'fuzzy match';
    } else {
      return { score: 0, reason: 'no match' };
    }
  }

  // Apply bonuses and penalties
  if (isFromHistory) {
    score += 20;
    reason += ' + history';
  }

  // Path depth penalty (deeper = lower score)
  score -= Math.min(pathDepth * 5, 25);
  if (pathDepth > 0) {
    reason += ` -${pathDepth}depth`;
  }

  return { score: Math.max(score, 1), reason };
}

// Simple fuzzy matching algorithm
function calculateFuzzyScore(text: string, pattern: string): number {
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

export default function SearchFolders() {
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [folderHistory, setFolderHistory] = useState<string[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [navigationHistory, setNavigationHistory] = useState<string[]>([]);
  const [displayedPaths, setDisplayedPaths] = useState<Set<string>>(new Set());
  const [searchCancelRef, setSearchCancelRef] = useState<{ cancel: boolean }>({
    cancel: false,
  });
  const [searchProgress, setSearchProgress] = useState<string>('');

  const preferences = getPreferenceValues<Preferences>();
  const searchPaths = preferences.searchPaths
    ? preferences.searchPaths
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
    : [homedir()];
  const maxHistoryItems = parseInt(preferences.maxHistoryItems) || 10;
  const searchDepth = parseInt(preferences.searchDepth) || 3;
  const maxResults = parseInt(preferences.maxResults) || 100;
  const debounceDelay = parseInt(preferences.debounceDelay) || 300;
  const enableFuzzyMatch = preferences.enableFuzzyMatch !== 'false';
  const prioritizeRecent = preferences.prioritizeRecent !== 'false';

  // Load history from LocalStorage on component mount and clean invalid paths
  useEffect(() => {
    async function loadAndCleanHistory() {
      try {
        const savedHistory = await LocalStorage.getItem<string>(
          'folder-history-v2'
        );
        if (savedHistory) {
          const parsedHistory = JSON.parse(savedHistory);
          if (Array.isArray(parsedHistory)) {
            // Clean up invalid paths on load
            const validPaths: string[] = [];
            for (const path of parsedHistory) {
              try {
                const stats = await stat(path);
                if (stats.isDirectory()) {
                  validPaths.push(path);
                }
              } catch {
                console.warn(`Removing invalid path from history: ${path}`);
              }
            }

            setFolderHistory(validPaths);

            // Save cleaned history if it changed
            if (validPaths.length !== parsedHistory.length) {
              await LocalStorage.setItem(
                'folder-history-v2',
                JSON.stringify(validPaths)
              );
            }

            console.log(
              `Loaded ${validPaths.length} valid history items:`,
              validPaths.map((p) => basename(p))
            );
          }
        } else {
          console.log('No saved history found');
        }
      } catch (error) {
        console.warn('Failed to load folder history:', error);
      }
    }
    loadAndCleanHistory();
  }, []);

  // Debounce search text
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, debounceDelay);

    return () => clearTimeout(timer);
  }, [searchText, debounceDelay]);

  useEffect(() => {
    searchFolders();
  }, [debouncedSearchText, currentDirectory, folderHistory]);

  // Only search when search text or directory changes, not when history changes
  // History changes should not trigger new searches to avoid infinite loops

  // Progressive search function that shows results as they come in
  async function performProgressiveSearch(
    searchPaths: string[],
    query: string,
    maxDepth: number,
    cancelRef: { cancel: boolean },
    addToCollection: (items: FolderItem[]) => void,
    allFolders: FolderItem[],
    displayedPaths: Set<string>
  ) {
    const updateDisplay = () => {
      const sortedFolders = [...allFolders].sort((a, b) => {
        // If one is history and the other is not, history comes first
        if (a.isFromHistory && !b.isFromHistory) return -1;
        if (!a.isFromHistory && b.isFromHistory) return 1;

        // Otherwise sort by score
        const scoreA = a.score || 0;
        const scoreB = b.score || 0;
        return scoreB - scoreA;
      });
      const limitedFolders = sortedFolders.slice(0, maxResults);
      setFolders(limitedFolders);
      setDisplayedPaths(new Set(displayedPaths));
    };

    // Stage 1: Search at depth 1 (immediate children)
    for (const searchPath of searchPaths) {
      if (cancelRef.cancel) return;

      try {
        await findFolders(searchPath, query, 1, (batchItems) => {
          if (cancelRef.cancel) return;

          const itemsWithSource = batchItems.map((folder) => ({
            ...folder,
            sourceDirectory: searchPath,
          }));
          addToCollection(itemsWithSource);
          updateDisplay();
        });
      } catch (error) {
        console.error(`Failed shallow search in ${searchPath}:`, error);
      }
    }

    // Stage 2: Search deeper if needed and not cancelled
    if (maxDepth > 1) {
      for (const searchPath of searchPaths) {
        if (cancelRef.cancel) return;

        try {
          await findFolders(searchPath, query, maxDepth, (batchItems) => {
            if (cancelRef.cancel) return;

            // Filter out results we already have from shallow search
            const newDeepResults = batchItems.filter(
              (item) => !displayedPaths.has(item.path)
            );
            if (newDeepResults.length > 0) {
              const itemsWithSource = newDeepResults.map((folder) => ({
                ...folder,
                sourceDirectory: searchPath,
              }));
              addToCollection(itemsWithSource);
              updateDisplay();
            }
          });
        } catch (error) {
          console.error(`Failed deep search in ${searchPath}:`, error);
        }
      }
    }
  }

  async function searchFolders() {
    setIsLoading(true);
    setSearchProgress('');

    // Cancel previous search
    searchCancelRef.cancel = true;
    const currentSearchRef = { cancel: false };
    setSearchCancelRef(currentSearchRef);

    try {
      const allFolders: FolderItem[] = [];
      const currentDisplayedPaths = new Set<string>();
      const query = debouncedSearchText;

      // Debug: Show current search state
      console.log(
        `searchFolders called: query="${query}", currentDirectory=${currentDirectory}, historyLength=${folderHistory.length}`
      );
      if (folderHistory.length > 0) {
        console.log(
          `History has ${folderHistory.length} items:`,
          folderHistory.map((p) => basename(p))
        );
      }

      if (query) {
        setSearchProgress('Searching...');
      }

      // Helper function to add folders to collection
      // Allow duplicates for history items that are also parent directories
      const addFoldersToCollection = (
        newFolders: FolderItem[],
        allowDuplicatesForHistory = false
      ) => {
        newFolders.forEach((folder) => {
          const isDuplicate = currentDisplayedPaths.has(folder.path);
          const shouldAdd =
            !isDuplicate || (allowDuplicatesForHistory && folder.isFromHistory);

          if (shouldAdd) {
            if (!isDuplicate) {
              currentDisplayedPaths.add(folder.path);
            }
            allFolders.push(folder);
          }
        });
      };

      // Process history items first and show them immediately
      const historyItems: FolderItem[] = [];
      for (const historyPath of folderHistory.slice(0, maxHistoryItems)) {
        try {
          // Ensure path exists and is accessible
          const stats = await stat(historyPath);
          if (stats.isDirectory()) {
            const name = basename(historyPath);
            const showInCurrentMode = currentDirectory === null; // Only show history in main mode

            if (showInCurrentMode) {
              // Calculate match score for both folder name and full path
              const nameMatchResult = calculateMatchScore(name, query, 0, true);
              
              // Also check against the full path
              const pathMatchResult = calculateMatchScore(
                historyPath.toLowerCase().replace(/^\/users\/[^\/]+/, '~'),
                query,
                0,
                true
              );
              
              // Use the better score between name and path matching
              const matchResult = nameMatchResult.score >= pathMatchResult.score 
                ? nameMatchResult 
                : { score: pathMatchResult.score, reason: pathMatchResult.reason + ' (path)' };

              // Always show history items when no query, or when they match
              if (!query || matchResult.score > 0) {
                console.log(
                  `Adding history item ${name}: score=${matchResult.score}, reason=${matchResult.reason}`
                );

                const historyItem: FolderItem = {
                  path: historyPath,
                  name,
                  isFromHistory: true,
                  score: matchResult.score,
                  matchReason: matchResult.reason,
                };
                historyItems.push(historyItem);
              } else {
                console.log(
                  `Skipping history item ${name}: score=${matchResult.score}, reason=${matchResult.reason}`
                );
              }
            }
          }
        } catch (error) {
          // Path doesn't exist or is inaccessible, silently skip it
          // Don't modify history during search to avoid render loops
          console.warn(`Skipping inaccessible path: ${historyPath}`);
        }
      }

      console.log(
        `Processing ${historyItems.length} history items for display`
      );

      // Add history items to collection (always allow, even if duplicates)
      if (historyItems.length > 0) {
        console.log(
          `Adding ${historyItems.length} history items to collection`
        );
        addFoldersToCollection(historyItems, true);
      } else {
        console.log('No history items to add to collection');
      }

      // If we're navigating in a specific directory, show its contents
      if (currentDirectory) {
        const directoryFolders = await findFolders(currentDirectory, query, 1);
        const newItems: FolderItem[] = directoryFolders.map((folder) => ({
          ...folder,
          sourceDirectory: currentDirectory,
        }));
        addFoldersToCollection(newItems);
      } else {
        // When in main view (not navigating), show registered parent directories
        if (query.length === 0) {
          // Show registered parent directories themselves (always show, even if in history)
          const parentDirectoryItems: FolderItem[] = [];
          for (const searchPath of searchPaths) {
            try {
              const stats = await stat(searchPath);
              if (stats.isDirectory()) {
                parentDirectoryItems.push({
                  path: searchPath,
                  name: basename(searchPath),
                  isFromHistory: false,
                  sourceDirectory: dirname(searchPath),
                  isParentDirectory: true,
                  score: 50,
                  matchReason: 'parent directory',
                });
              }
            } catch (error) {
              console.error(
                `Failed to access parent directory ${searchPath}:`,
                error
              );
            }
          }

          // Add parent directories (allow duplicates with history)
          if (parentDirectoryItems.length > 0) {
            parentDirectoryItems.forEach((folder) => {
              allFolders.push(folder);
            });
          }

          // Don't show child directories on initial load - only when searching
        } else if (query.length >= 1) {
          // Progressive search - show results as they come in
          await performProgressiveSearch(
            searchPaths,
            query,
            searchDepth,
            currentSearchRef,
            (items) => addFoldersToCollection(items),
            allFolders,
            currentDisplayedPaths
          );
        }
      }

      // Sort by score (highest first) and update display
      // Ensure history items always come first when scores are equal
      const sortedFolders = allFolders.sort((a, b) => {
        // If one is history and the other is not, history comes first
        if (a.isFromHistory && !b.isFromHistory) return -1;
        if (!a.isFromHistory && b.isFromHistory) return 1;

        // Otherwise sort by score
        const scoreA = a.score || 0;
        const scoreB = b.score || 0;
        return scoreB - scoreA;
      });

      console.log(
        `Final folders before display (${allFolders.length} total):`,
        allFolders.map(
          (f) =>
            `${f.name}(score:${f.score},hist:${f.isFromHistory},parent:${f.isParentDirectory})`
        )
      );

      // Limit results to prevent UI overload
      const limitedFolders = sortedFolders.slice(0, maxResults);

      console.log(`Setting ${limitedFolders.length} folders for display`);
      setFolders(limitedFolders);
      setDisplayedPaths(currentDisplayedPaths);
      setSearchProgress('');
    } catch (error) {
      showToast(Toast.Style.Failure, 'Search failed', String(error));
      setSearchProgress('');
    } finally {
      setIsLoading(false);
    }
  }

  async function findFolders(
    rootPath: string,
    query: string,
    maxDepth = 3,
    onBatch?: (items: FolderItem[]) => void
  ): Promise<FolderItem[]> {
    const results: FolderItem[] = [];
    const batchSize = 5;
    let currentBatch: FolderItem[] = [];

    const processBatch = () => {
      if (currentBatch.length > 0 && onBatch) {
        onBatch([...currentBatch]);
        currentBatch.length = 0;
      }
    };

    async function searchRecursive(currentPath: string, depth: number) {
      if (depth > maxDepth) return;

      try {
        const entries = await readdir(currentPath);

        for (const entry of entries) {
          if (entry.startsWith('.')) continue;

          const fullPath = join(currentPath, entry);
          try {
            const stats = await stat(fullPath);
            if (stats.isDirectory()) {
              // Calculate match score for both folder name and full path
              const nameMatchResult = calculateMatchScore(
                entry,
                query,
                depth,
                false
              );
              
              // Also check against the full path
              const pathMatchResult = calculateMatchScore(
                fullPath.toLowerCase().replace(/^\/users\/[^\/]+/, '~'),
                query,
                0,
                false
              );
              
              // Use the better score between name and path matching
              const matchResult = nameMatchResult.score >= pathMatchResult.score 
                ? nameMatchResult 
                : { score: pathMatchResult.score, reason: pathMatchResult.reason + ' (path)' };

              // Add folder if it has a good enough score or no query specified
              if (query === '' || matchResult.score > 0) {
                const folderItem = {
                  path: fullPath,
                  name: entry,
                  isFromHistory: false,
                  score: matchResult.score,
                  matchReason: matchResult.reason,
                };

                results.push(folderItem);
                currentBatch.push(folderItem);

                // Process batch when it reaches batch size
                if (currentBatch.length >= batchSize) {
                  processBatch();
                }
              }

              // Continue searching deeper if we haven't reached max depth
              // Only search deeper when there's a search query for performance
              if (depth < maxDepth && query.length > 0) {
                await searchRecursive(fullPath, depth + 1);
              }
            }
          } catch (error) {
            // Skip inaccessible directories
          }
        }
      } catch (error) {
        // Skip inaccessible directories
      }
    }

    await searchRecursive(rootPath, 0);

    // Process any remaining items in the batch
    processBatch();

    return results.slice(0, 20); // Limit results
  }

  async function findFoldersWithCallback(
    rootPath: string,
    query: string,
    maxDepth = 3,
    onBatch?: (items: FolderItem[]) => void
  ): Promise<FolderItem[]> {
    const results: FolderItem[] = [];
    const batchSize = 5; // Show results in batches of 5

    async function searchRecursive(currentPath: string, depth: number) {
      if (depth > maxDepth) return;

      try {
        const entries = await readdir(currentPath);
        const batch: FolderItem[] = [];

        for (const entry of entries) {
          if (entry.startsWith('.')) continue;

          const fullPath = join(currentPath, entry);
          try {
            const stats = await stat(fullPath);
            if (stats.isDirectory()) {
              // Add folder if it matches the query (or if no query specified)
              if (
                query === '' ||
                entry.toLowerCase().includes(query.toLowerCase())
              ) {
                const item = {
                  path: fullPath,
                  name: entry,
                  isFromHistory: false,
                };
                results.push(item);
                batch.push(item);

                // Send batch when it reaches the batch size
                if (batch.length >= batchSize && onBatch) {
                  onBatch([...batch]);
                  batch.length = 0; // Clear batch
                }
              }

              // Continue searching deeper if we haven't reached max depth
              // Only search deeper when there's a search query for performance
              if (depth < maxDepth && query.length > 0) {
                await searchRecursive(fullPath, depth + 1);
              }
            }
          } catch (error) {
            // Skip inaccessible directories
          }
        }

        // Send remaining items in batch
        if (batch.length > 0 && onBatch) {
          onBatch([...batch]);
        }
      } catch (error) {
        // Skip inaccessible directories
      }
    }

    await searchRecursive(rootPath, 0);
    return results.slice(0, 20); // Limit results
  }

  async function handleFolderSelect(folder: FolderItem) {
    // Update history
    const newHistory = [
      folder.path,
      ...folderHistory.filter((p) => p !== folder.path),
    ];
    const trimmedHistory = newHistory.slice(0, maxHistoryItems);

    setFolderHistory(trimmedHistory);

    // Save to LocalStorage
    try {
      await LocalStorage.setItem(
        'folder-history-v2',
        JSON.stringify(trimmedHistory)
      );
      showToast(Toast.Style.Success, 'Added to Recent', folder.name);
    } catch (error) {
      console.warn('Failed to save folder history:', error);
      showToast(Toast.Style.Failure, 'Failed to save history', String(error));
    }
  }

  async function removeFromHistory(folder: FolderItem) {
    const newHistory = folderHistory.filter((p) => p !== folder.path);
    setFolderHistory(newHistory);

    try {
      await LocalStorage.setItem(
        'folder-history-v2',
        JSON.stringify(newHistory)
      );
      showToast(Toast.Style.Success, 'Removed from Recent', folder.name);
    } catch (error) {
      console.warn('Failed to save folder history:', error);
      showToast(
        Toast.Style.Failure,
        'Failed to remove from history',
        String(error)
      );
    }
  }

  function navigateIntoFolder(folder: FolderItem) {
    if (currentDirectory) {
      setNavigationHistory((prev) => [...prev, currentDirectory]);
    }
    setCurrentDirectory(folder.path);
    setSearchText('');

    // Don't add to Recent history when navigating with arrow keys
  }

  function navigateBack() {
    if (currentDirectory) {
      const parentPath = dirname(currentDirectory);
      if (navigationHistory.length > 0) {
        const previousPath = navigationHistory[navigationHistory.length - 1];
        setNavigationHistory((prev) => prev.slice(0, -1));
        setCurrentDirectory(previousPath);
      } else {
        setCurrentDirectory(null);
      }
      setSearchText('');
    }
  }

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder={
        currentDirectory
          ? `Search in ${basename(currentDirectory)}...`
          : 'Search folders...'
      }
      throttle
      navigationTitle={
        currentDirectory
          ? `📁 ${basename(currentDirectory)}`
          : 'Fast Folder Access'
      }
      selectedItemId={
        folders.length > 0
          ? `${folders[0].path}-${
              folders[0].isFromHistory ? 'history' : 'search'
            }`
          : undefined
      }
    >
      {folders.map((folder) => {
        const accessories = [];
        if (folder.isFromHistory) {
          accessories.push({ text: 'Recent' });
        } else if (folder.sourceDirectory) {
          accessories.push({ text: basename(folder.sourceDirectory) });
        }

        // Add match score and reason for debugging/info
        if (folder.score && debouncedSearchText) {
          accessories.push({ text: `${folder.score}` });
        }

        const itemId = `${folder.path}-${
          folder.isFromHistory ? 'history' : 'search'
        }`;

        return (
          <List.Item
            id={itemId}
            key={itemId}
            title={folder.name}
            subtitle={folder.path}
            icon={
              folder.isFromHistory
                ? Icon.Clock
                : folder.isParentDirectory
                ? Icon.House
                : Icon.Folder
            }
            accessories={accessories}
            actions={
              <ActionPanel>
                <Action
                  title="Navigate Into"
                  icon={Icon.ArrowRight}
                  shortcut={{ modifiers: ['cmd'], key: 'arrowRight' }}
                  onAction={() => navigateIntoFolder(folder)}
                />
                <Action
                  title="Open Folder"
                  icon={Icon.Folder}
                  shortcut={{ modifiers: ['cmd'], key: 'o' }}
                  onAction={() => {
                    handleFolderSelect(folder);
                    // Open folder using system default
                    exec(`open "${folder.path}"`);
                  }}
                />
                <Action
                  title="Open Without History"
                  icon={Icon.Folder}
                  shortcut={{ modifiers: ['cmd', 'opt'], key: 'o' }}
                  onAction={() => {
                    // Open folder without adding to history
                    exec(`open "${folder.path}"`);
                  }}
                />
                <Action.Open
                  title="Open in Finder"
                  target={folder.path}
                  onOpen={() => handleFolderSelect(folder)}
                />
                {currentDirectory && (
                  <Action
                    title="Go Back"
                    icon={Icon.ArrowLeft}
                    shortcut={{ modifiers: ['cmd'], key: 'arrowLeft' }}
                    onAction={navigateBack}
                  />
                )}
                <Action
                  title="Add to Recent"
                  icon={Icon.Plus}
                  shortcut={{ modifiers: ['ctrl'], key: 'r' }}
                  onAction={() => handleFolderSelect(folder)}
                />
                {folder.isFromHistory && (
                  <Action
                    title="Remove from Recent"
                    icon={Icon.Minus}
                    shortcut={{ modifiers: ['ctrl'], key: 'x' }}
                    onAction={() => removeFromHistory(folder)}
                  />
                )}
                <Action.ShowInFinder
                  path={folder.path}
                  onShow={() => handleFolderSelect(folder)}
                />
                <Action.CopyToClipboard
                  title="Copy Path"
                  content={folder.path}
                  shortcut={{ modifiers: ['cmd'], key: 'c' }}
                />
              </ActionPanel>
            }
          />
        );
      })}
      {folders.length === 0 && !isLoading && (
        <List.EmptyView
          title={searchProgress || 'No folders found'}
          description={
            searchProgress
              ? 'Please wait...'
              : debouncedSearchText
              ? 'Try a different search term'
              : 'Start typing to search for folders'
          }
        />
      )}
    </List>
  );
}
