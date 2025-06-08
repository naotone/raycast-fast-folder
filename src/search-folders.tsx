import { useState, useEffect } from "react";
import { ActionPanel, Action, List, showToast, Toast, getPreferenceValues, Icon, LocalStorage } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import { readdir, stat } from "fs/promises";
import { join, basename, dirname } from "path";
import { homedir } from "os";

interface Preferences {
  searchPaths: string;
  maxHistoryItems: string;
  searchDepth: string;
}

interface FolderItem {
  path: string;
  name: string;
  lastUsed?: Date;
  isFromHistory: boolean;
  sourceDirectory?: string;
}

export default function SearchFolders() {
  const [searchText, setSearchText] = useState("");
  const [folderHistory, setFolderHistory] = useState<string[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDirectory, setCurrentDirectory] = useState<string | null>(null);
  const [navigationHistory, setNavigationHistory] = useState<string[]>([]);
  
  const preferences = getPreferenceValues<Preferences>();
  const searchPaths = preferences.searchPaths 
    ? preferences.searchPaths.split(',').map(p => p.trim()).filter(p => p.length > 0)
    : [homedir()];
  const maxHistoryItems = parseInt(preferences.maxHistoryItems) || 10;
  const searchDepth = parseInt(preferences.searchDepth) || 3;

  // Load history from LocalStorage on component mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const savedHistory = await LocalStorage.getItem<string>("folder-history-v2");
        if (savedHistory) {
          const parsedHistory = JSON.parse(savedHistory);
          if (Array.isArray(parsedHistory)) {
            setFolderHistory(parsedHistory);
            console.log(`Loaded ${parsedHistory.length} history items:`, parsedHistory.map(p => basename(p)));
          }
        } else {
          console.log("No saved history found");
        }
      } catch (error) {
        console.warn("Failed to load folder history:", error);
      }
    }
    loadHistory();
  }, []);

  useEffect(() => {
    searchFolders();
  }, [searchText, currentDirectory, folderHistory]);

  async function searchFolders() {
    setIsLoading(true);
    try {
      const allFolders: FolderItem[] = [];
      const uniquePaths = new Set<string>();
      
      // Add folders from history first (always show when relevant)
      // Debug: Show current history state
      console.log(`searchFolders called: searchText="${searchText}", currentDirectory=${currentDirectory}, historyLength=${folderHistory.length}`);
      if (folderHistory.length > 0) {
        console.log(`History has ${folderHistory.length} items:`, folderHistory.map(p => basename(p)));
      }
      
      for (const historyPath of folderHistory.slice(0, maxHistoryItems)) {
        try {
          // Ensure path exists and is accessible
          const stats = await stat(historyPath);
          if (stats.isDirectory()) {
            const name = basename(historyPath);
            // Show history items when not in navigation mode and when search matches
            const matchesSearch = !searchText || name.toLowerCase().includes(searchText.toLowerCase());
            const showInCurrentMode = currentDirectory === null; // Only show history in main mode
            
            console.log(`History item ${name}: matchesSearch=${matchesSearch}, showInCurrentMode=${showInCurrentMode}, currentDirectory=${currentDirectory}`);
            
            if (matchesSearch && showInCurrentMode) {
              allFolders.push({
                path: historyPath,
                name,
                isFromHistory: true
              });
              uniquePaths.add(historyPath);
            }
          }
        } catch (error) {
          // Path doesn't exist or is inaccessible, remove from history
          console.warn(`Removing inaccessible path from history: ${historyPath}`);
          const cleanedHistory = folderHistory.filter(p => p !== historyPath);
          setFolderHistory(cleanedHistory);
          // Save cleaned history
          LocalStorage.setItem("folder-history-v2", JSON.stringify(cleanedHistory)).catch(console.warn);
        }
      }
      
      // If we're navigating in a specific directory, show its contents
      if (currentDirectory) {
        const directoryFolders = await findFolders(currentDirectory, searchText, 1);
        for (const folder of directoryFolders) {
          if (!uniquePaths.has(folder.path)) {
            allFolders.push({
              ...folder,
              sourceDirectory: currentDirectory
            });
            uniquePaths.add(folder.path);
          }
        }
      } else {
        
        // Search in all specified directories
        for (const searchPath of searchPaths) {
          try {
            if (searchText.length === 0) {
              // Show all folders when no search text, limited to first level for performance
              const rootFolders = await findFolders(searchPath, "", 1);
              for (const folder of rootFolders.slice(0, 15)) {
                if (!uniquePaths.has(folder.path)) {
                  allFolders.push({
                    ...folder,
                    sourceDirectory: searchPath
                  });
                  uniquePaths.add(folder.path);
                }
              }
            } else if (searchText.length >= 1) {
              const foundFolders = await findFolders(searchPath, searchText, searchDepth);
              for (const folder of foundFolders) {
                if (!uniquePaths.has(folder.path)) {
                  allFolders.push({
                    ...folder,
                    sourceDirectory: searchPath
                  });
                  uniquePaths.add(folder.path);
                }
              }
            }
          } catch (error) {
            console.error(`Failed to search in ${searchPath}:`, error);
          }
        }
      }
      
      setFolders(allFolders);
    } catch (error) {
      showToast(Toast.Style.Failure, "Search failed", String(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function findFolders(rootPath: string, query: string, maxDepth = 3): Promise<FolderItem[]> {
    const results: FolderItem[] = [];
    
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
              // Add folder if it matches the query (or if no query specified)
              if (query === "" || entry.toLowerCase().includes(query.toLowerCase())) {
                results.push({
                  path: fullPath,
                  name: entry,
                  isFromHistory: false
                });
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
    return results.slice(0, 20); // Limit results
  }

  async function handleFolderSelect(folder: FolderItem) {
    // Debug: Show what we're trying to add
    const hasSpaces = folder.path.includes(' ');
    const hasDots = folder.path.includes('.');
    
    showToast(
      Toast.Style.Success, 
      `Adding: ${folder.name}`, 
      `Spaces: ${hasSpaces}, Dots: ${hasDots}, Path: ${folder.path.slice(0, 50)}...`
    );
    
    // Update history
    const newHistory = [folder.path, ...folderHistory.filter(p => p !== folder.path)];
    const trimmedHistory = newHistory.slice(0, maxHistoryItems);
    
    setFolderHistory(trimmedHistory);
    
    // Save to LocalStorage
    try {
      await LocalStorage.setItem("folder-history-v2", JSON.stringify(trimmedHistory));
      
      // Immediately verify it was saved
      const saved = await LocalStorage.getItem<string>("folder-history-v2");
      const parsed = saved ? JSON.parse(saved) : [];
      
      setTimeout(() => {
        showToast(
          Toast.Style.Success,
          "Verification",
          `Saved ${parsed.length} items. First: ${parsed[0] ? basename(parsed[0]) : 'none'}`
        );
      }, 1000);
      
    } catch (error) {
      console.warn("Failed to save folder history:", error);
      showToast(Toast.Style.Failure, "Failed to save history", String(error));
    }
  }

  function navigateIntoFolder(folder: FolderItem) {
    if (currentDirectory) {
      setNavigationHistory(prev => [...prev, currentDirectory]);
    }
    setCurrentDirectory(folder.path);
    setSearchText("");
    
    // Don't add to Recent history when navigating with arrow keys
  }

  function navigateBack() {
    if (currentDirectory) {
      const parentPath = dirname(currentDirectory);
      if (navigationHistory.length > 0) {
        const previousPath = navigationHistory[navigationHistory.length - 1];
        setNavigationHistory(prev => prev.slice(0, -1));
        setCurrentDirectory(previousPath);
      } else {
        setCurrentDirectory(null);
      }
      setSearchText("");
    }
  }

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder={currentDirectory ? `Search in ${basename(currentDirectory)}...` : "Search folders..."}
      throttle
      navigationTitle={currentDirectory ? `📁 ${basename(currentDirectory)}` : "Fast Folder Access"}
    >
      {folders.map((folder) => {
        const accessories = [];
        if (folder.isFromHistory) {
          accessories.push({ text: "Recent" });
        } else if (folder.sourceDirectory) {
          accessories.push({ text: basename(folder.sourceDirectory) });
        }
        
        return (
          <List.Item
            key={folder.path}
            title={folder.name}
            subtitle={folder.path}
            icon={folder.isFromHistory ? Icon.Clock : Icon.Folder}
            accessories={accessories}
            actions={
              <ActionPanel>
                <Action.Open
                  title="Open Folder"
                  target={folder.path}
                  onOpen={() => handleFolderSelect(folder)}
                />
                <Action
                  title="Add to Recent"
                  icon={Icon.Plus}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={() => handleFolderSelect(folder)}
                />
                <Action
                  title="Navigate Into"
                  icon={Icon.ArrowRight}
                  shortcut={{ modifiers: [], key: "arrowRight" }}
                  onAction={() => navigateIntoFolder(folder)}
                />
                {currentDirectory && (
                  <Action
                    title="Go Back"
                    icon={Icon.ArrowLeft}
                    shortcut={{ modifiers: [], key: "arrowLeft" }}
                    onAction={navigateBack}
                  />
                )}
                <Action.ShowInFinder
                  path={folder.path}
                  onShow={() => handleFolderSelect(folder)}
                />
                <Action.CopyToClipboard
                  title="Copy Path"
                  content={folder.path}
                  shortcut={{ modifiers: ["cmd"], key: "c" }}
                />
              </ActionPanel>
            }
          />
        );
      })}
      {folders.length === 0 && !isLoading && (
        <List.EmptyView
          title="No folders found"
          description={searchText ? "Try a different search term" : "Start typing to search for folders"}
        />
      )}
    </List>
  );
}