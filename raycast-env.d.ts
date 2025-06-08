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
  "searchDepth": "1" | "2" | "3" | "4" | "5"
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

