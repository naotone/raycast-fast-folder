import { useEffect, useRef, useState } from 'react';
import {
  List,
  showToast,
  Toast,
  getPreferenceValues,
  Icon,
  LocalStorage,
} from '@raycast/api';
import { readdir, stat } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { homedir } from 'os';

import { CurrentFolderActions, FolderActions } from './folder-actions';
import {
  calculateMatchScore,
  sortFolders,
  type FolderItem,
} from './search-utils';

interface Preferences {
  searchPaths?: string;
  maxHistoryItems?: string;
  searchDepth?: string;
  maxResults?: string;
  debounceDelay?: string;
  enableFuzzyMatch?: boolean;
  prioritizeRecent?: boolean;
}

export default function SearchFolders() {
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [folderHistory, setFolderHistory] = useState<string[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [navigationHistory, setNavigationHistory] = useState<string[]>([]);
  const searchCancelRef = useRef<{ cancel: boolean }>({ cancel: false });
  const [searchProgress, setSearchProgress] = useState<string>('');

  const preferences = getPreferenceValues<Preferences>();
  const searchPaths = preferences.searchPaths
    ? preferences.searchPaths
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
    : [homedir()];
  const maxHistoryItems = parseInt(preferences.maxHistoryItems ?? '', 10) || 10;
  const searchDepth = parseInt(preferences.searchDepth ?? '', 10) || 3;
  const maxResults = parseInt(preferences.maxResults ?? '', 10) || 100;
  const debounceDelay = parseInt(preferences.debounceDelay ?? '', 10) || 300;
  const enableFuzzyMatch = preferences.enableFuzzyMatch !== false;
  const prioritizeRecent = preferences.prioritizeRecent !== false;
  const matchOptions = { enableFuzzyMatch, prioritizeRecent };

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
          }
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
      const sortedFolders = sortFolders(allFolders, { prioritizeRecent });
      const limitedFolders = sortedFolders.slice(0, maxResults);
      setFolders(limitedFolders);
    };

    // Stage 1: Search at depth 1 (immediate children)
    for (const searchPath of searchPaths) {
      if (cancelRef.cancel) return;

      try {
        await findFolders(
          searchPath,
          query,
          1,
          (batchItems) => {
            if (cancelRef.cancel) return;

            const itemsWithSource = batchItems.map((folder) => ({
              ...folder,
              sourceDirectory: searchPath,
            }));
            addToCollection(itemsWithSource);
            updateDisplay();
          },
          maxResults
        );
      } catch (error) {
        console.error(`Failed shallow search in ${searchPath}:`, error);
      }
    }

    // Stage 2: Search deeper if needed and not cancelled
    if (maxDepth > 1) {
      for (const searchPath of searchPaths) {
        if (cancelRef.cancel) return;

        try {
          await findFolders(
            searchPath,
            query,
            maxDepth,
            (batchItems) => {
              if (cancelRef.cancel) return;

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
            },
            maxResults
          );
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
    searchCancelRef.current.cancel = true;
    const currentSearchRef = { cancel: false };
    searchCancelRef.current = currentSearchRef;

    try {
      const allFolders: FolderItem[] = [];
      const currentDisplayedPaths = new Set<string>();
      const query = debouncedSearchText;

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
              const nameMatchResult = calculateMatchScore(
                name,
                query,
                0,
                true,
                matchOptions
              );

              // Also check against the full path
              const pathMatchResult = calculateMatchScore(
                historyPath.toLowerCase().replace(/^\/users\/[^\/]+/, '~'),
                query,
                0,
                true,
                matchOptions
              );

              // Use the better score between name and path matching
              const matchResult =
                nameMatchResult.score >= pathMatchResult.score
                  ? nameMatchResult
                  : {
                      score: pathMatchResult.score,
                      reason: pathMatchResult.reason + ' (path)',
                    };

              // Always show history items when no query, or when they match
              if (!query || matchResult.score > 0) {
                const historyItem: FolderItem = {
                  path: historyPath,
                  name,
                  isFromHistory: true,
                  score: matchResult.score,
                  matchReason: matchResult.reason,
                };
                historyItems.push(historyItem);
              }
            }
          }
        } catch (error) {
          // Path doesn't exist or is inaccessible, silently skip it
          // Don't modify history during search to avoid render loops
          console.warn(`Skipping inaccessible path: ${historyPath}`);
        }
      }

      // Add history items to collection (always allow, even if duplicates)
      if (historyItems.length > 0) {
        addFoldersToCollection(historyItems, true);
      }

      // If we're navigating in a specific directory, show its contents
      if (currentDirectory) {
        const directoryFolders = await findFolders(
          currentDirectory,
          query,
          1,
          undefined,
          maxResults
        );
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

      // Sort and update the display.
      const sortedFolders = sortFolders(allFolders, { prioritizeRecent });

      // Limit results to prevent UI overload
      const limitedFolders = sortedFolders.slice(0, maxResults);

      setFolders(limitedFolders);
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
    onBatch?: (items: FolderItem[]) => void,
    limit = maxResults
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
                false,
                matchOptions
              );

              // Also check against the full path
              const pathMatchResult = calculateMatchScore(
                fullPath.toLowerCase().replace(/^\/users\/[^\/]+/, '~'),
                query,
                0,
                false,
                matchOptions
              );

              // Use the better score between name and path matching
              const matchResult =
                nameMatchResult.score >= pathMatchResult.score
                  ? nameMatchResult
                  : {
                      score: pathMatchResult.score,
                      reason: pathMatchResult.reason + ' (path)',
                    };

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

    return results.slice(0, limit);
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

  const currentFolder =
    currentDirectory === null
      ? null
      : {
          path: currentDirectory,
          name: basename(currentDirectory),
          isFromHistory: folderHistory.includes(currentDirectory),
        };

  const folderActionHandlers = {
    onAddToRecent: handleFolderSelect,
    onNavigateBack: navigateBack,
    onNavigateInto: navigateIntoFolder,
    onOpenWithHistory: handleFolderSelect,
    onRemoveFromHistory: removeFromHistory,
  };

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
              <FolderActions
                currentDirectory={currentDirectory}
                folder={folder}
                handlers={folderActionHandlers}
              />
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
          actions={
            currentFolder ? (
              <CurrentFolderActions
                folder={currentFolder}
                handlers={folderActionHandlers}
              />
            ) : undefined
          }
        />
      )}
    </List>
  );
}
