import type { Keyboard } from '@raycast/api';

import type { FolderItem } from './search-utils';

export type FolderActionIcon =
  | 'arrowLeft'
  | 'arrowRight'
  | 'folder'
  | 'minus'
  | 'plus';

export interface FolderActionHandlers {
  onNavigateInto: (folder: FolderItem) => void;
  onOpenWithHistory: (folder: FolderItem) => void;
  onNavigateBack: () => void;
  onAddToRecent: (folder: FolderItem) => void;
  onRemoveFromHistory: (folder: FolderItem) => void;
}

interface BaseFolderActionDescriptor {
  id: string;
  title: string;
  shortcut?: Keyboard.Shortcut;
}

export interface CustomFolderActionDescriptor
  extends BaseFolderActionDescriptor {
  kind: 'action';
  icon: FolderActionIcon;
  onAction: () => void;
}

export interface OpenFolderActionDescriptor extends BaseFolderActionDescriptor {
  kind: 'open';
  icon: FolderActionIcon;
  target: string;
  application?: string;
  onOpen?: () => void;
}

export interface ShowInFinderActionDescriptor
  extends BaseFolderActionDescriptor {
  kind: 'showInFinder';
  path: string;
  onShow?: () => void;
}

export interface CopyFolderActionDescriptor extends BaseFolderActionDescriptor {
  kind: 'copy';
  content: string;
}

export type FolderActionDescriptor =
  | CopyFolderActionDescriptor
  | CustomFolderActionDescriptor
  | OpenFolderActionDescriptor
  | ShowInFinderActionDescriptor;

function shortcut(
  modifiers: Keyboard.KeyModifier[],
  key: Keyboard.KeyEquivalent
): Keyboard.Shortcut {
  return { modifiers, key };
}

function getGoBackActions(
  onNavigateBack: () => void
): CustomFolderActionDescriptor[] {
  return [
    {
      id: 'go-back',
      kind: 'action',
      title: 'Go Back',
      icon: 'arrowLeft',
      shortcut: shortcut(['cmd'], 'arrowLeft'),
      onAction: onNavigateBack,
    },
    {
      id: 'go-back-backspace',
      kind: 'action',
      title: 'Go Back',
      icon: 'arrowLeft',
      shortcut: shortcut([], 'backspace'),
      onAction: onNavigateBack,
    },
  ];
}

export function getFolderActionDescriptors({
  currentDirectory,
  folder,
  handlers,
}: {
  currentDirectory: string | null;
  folder: FolderItem;
  handlers: FolderActionHandlers;
}): FolderActionDescriptor[] {
  const actions: FolderActionDescriptor[] = [
    {
      id: 'navigate-into',
      kind: 'action',
      title: 'Navigate Into',
      icon: 'arrowRight',
      shortcut: shortcut(['cmd'], 'arrowRight'),
      onAction: () => handlers.onNavigateInto(folder),
    },
    {
      id: 'open-in-finder',
      kind: 'open',
      title: 'Open in Finder',
      icon: 'folder',
      target: folder.path,
      application: 'Finder',
      shortcut: shortcut(['cmd'], 'o'),
      onOpen: () => handlers.onOpenWithHistory(folder),
    },
    {
      id: 'open-without-history',
      kind: 'open',
      title: 'Open Without History',
      icon: 'folder',
      target: folder.path,
      application: 'Finder',
      shortcut: shortcut(['cmd', 'opt'], 'o'),
    },
  ];

  if (currentDirectory) {
    actions.push(...getGoBackActions(handlers.onNavigateBack));
  }

  actions.push({
    id: 'add-to-recent',
    kind: 'action',
    title: 'Add to Recent',
    icon: 'plus',
    shortcut: shortcut(['ctrl'], 'r'),
    onAction: () => handlers.onAddToRecent(folder),
  });

  if (folder.isFromHistory) {
    actions.push({
      id: 'remove-from-recent',
      kind: 'action',
      title: 'Remove from Recent',
      icon: 'minus',
      shortcut: shortcut(['ctrl'], 'x'),
      onAction: () => handlers.onRemoveFromHistory(folder),
    });
  }

  actions.push(
    {
      id: 'reveal-in-finder',
      kind: 'showInFinder',
      title: 'Reveal in Finder',
      path: folder.path,
      shortcut: shortcut(['cmd', 'shift'], 'o'),
      onShow: () => handlers.onOpenWithHistory(folder),
    },
    {
      id: 'copy-path',
      kind: 'copy',
      title: 'Copy Path',
      content: folder.path,
      shortcut: shortcut(['cmd'], 'c'),
    }
  );

  return actions;
}

export function getCurrentFolderActionDescriptors({
  folder,
  handlers,
}: {
  folder: FolderItem;
  handlers: FolderActionHandlers;
}): FolderActionDescriptor[] {
  return [
    getGoBackActions(handlers.onNavigateBack)[0],
    {
      id: 'open-current-folder-in-finder',
      kind: 'open',
      title: 'Open Current Folder in Finder',
      icon: 'folder',
      target: folder.path,
      application: 'Finder',
      shortcut: shortcut(['cmd'], 'o'),
      onOpen: () => handlers.onOpenWithHistory(folder),
    },
    getGoBackActions(handlers.onNavigateBack)[1],
    {
      id: 'open-current-folder-without-history',
      kind: 'open',
      title: 'Open Current Folder Without History',
      icon: 'folder',
      target: folder.path,
      application: 'Finder',
      shortcut: shortcut(['cmd', 'opt'], 'o'),
    },
    {
      id: 'reveal-current-folder-in-finder',
      kind: 'showInFinder',
      title: 'Reveal Current Folder in Finder',
      path: folder.path,
      shortcut: shortcut(['cmd', 'shift'], 'o'),
      onShow: () => handlers.onOpenWithHistory(folder),
    },
    {
      id: 'add-current-folder-to-recent',
      kind: 'action',
      title: 'Add Current Folder to Recent',
      icon: 'plus',
      shortcut: shortcut(['ctrl'], 'r'),
      onAction: () => handlers.onAddToRecent(folder),
    },
    {
      id: 'copy-current-folder-path',
      kind: 'copy',
      title: 'Copy Current Folder Path',
      content: folder.path,
      shortcut: shortcut(['cmd'], 'c'),
    },
  ];
}
