/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Search Directories - Directories to search for folders, separated by commas (default: home directory) */
  "searchPaths"?: string,
  /** Max History Items - Maximum number of recent folders to remember */
  "maxHistoryItems": string,
  /** Search Depth - How deep to search in subdirectories */
  "searchDepth": "1" | "2" | "3" | "4" | "5",
  /** Max Search Results - Maximum number of folders to display in search results */
  "maxResults": string,
  /** Search Delay - Delay before starting search after typing (milliseconds) */
  "debounceDelay": "100" | "200" | "300" | "500",
  /** Enable Fuzzy Matching - Enable fuzzy search that matches characters in sequence (e.g., 'proj' matches 'project') */
  "enableFuzzyMatch": boolean,
  /** Prioritize Recent Folders - Give higher scores to recently used folders in search results */
  "prioritizeRecent": boolean,
  /** Keyboard Shortcuts Guide - 📋 How to use Fast Folder Access:

🔍 SEARCH:
• Type to search folders dynamically
• Results sorted by relevance score
• Fuzzy matching: 'proj' finds 'project'

⚡ ACTIONS:
• ⏎ Enter: Open folder in default app
• ⌘O: Open folder in Finder
• ⌘→: Navigate into folder (browse mode)
• ⌘←: Go back (when in browse mode)
• ⌃R: Add to recent folders
• ⌃X: Remove from recent (recent items only)
• ⌘C: Copy folder path to clipboard

📁 FOLDER TYPES:
• 🕐 Recent: Previously accessed folders
• 🏠 Parent: Configured search directories
• 📂 Search: Found folders matching your query

⚙️ SEARCH SCORING:
• Exact match: 100 points
• Starts with query: 90 points
• Word boundary match: 80 points
• Contains query: 70 points
• Fuzzy match: 50-60 points
• Recent bonus: +20 points
• Depth penalty: -5 points per level */
  "shortcuts"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `search-folders` command */
  export type SearchFolders = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `search-folders` command */
  export type SearchFolders = {}
}

