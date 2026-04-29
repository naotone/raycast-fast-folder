import { describe, expect, it, vi } from 'vitest';

import {
  getCurrentFolderActionDescriptors,
  getFolderActionDescriptors,
  type FolderActionHandlers,
} from './folder-action-descriptors';
import type { FolderItem } from './search-utils';

const folder: FolderItem = {
  path: '/Users/example/Project "A"',
  name: 'Project "A"',
  isFromHistory: false,
};

function createHandlers(
  overrides: Partial<FolderActionHandlers> = {}
): FolderActionHandlers {
  return {
    onNavigateInto: vi.fn(),
    onOpenWithHistory: vi.fn(),
    onNavigateBack: vi.fn(),
    onAddToRecent: vi.fn(),
    onRemoveFromHistory: vi.fn(),
    ...overrides,
  };
}

describe('getFolderActionDescriptors', () => {
  it('keeps navigate as the primary action and Finder open as the secondary action', () => {
    const actions = getFolderActionDescriptors({
      currentDirectory: null,
      folder,
      handlers: createHandlers(),
    });

    expect(actions[0]).toMatchObject({
      id: 'navigate-into',
      kind: 'action',
      title: 'Navigate Into',
      shortcut: { modifiers: ['cmd'], key: 'arrowRight' },
    });
    expect(actions[1]).toMatchObject({
      id: 'open-in-finder',
      kind: 'open',
      title: 'Open in Finder',
      target: folder.path,
      application: 'Finder',
      shortcut: { modifiers: ['cmd'], key: 'o' },
    });
  });

  it('adds history only when opening with the main Finder action', () => {
    const onOpenWithHistory = vi.fn();
    const actions = getFolderActionDescriptors({
      currentDirectory: null,
      folder,
      handlers: createHandlers({ onOpenWithHistory }),
    });

    const finderOpen = actions.find((action) => action.id === 'open-in-finder');
    const withoutHistory = actions.find(
      (action) => action.id === 'open-without-history'
    );

    expect(finderOpen).toMatchObject({
      kind: 'open',
      onOpen: expect.any(Function),
    });
    expect(withoutHistory).toMatchObject({
      kind: 'open',
      title: 'Open Without History',
      target: folder.path,
      application: 'Finder',
      shortcut: { modifiers: ['cmd', 'opt'], key: 'o' },
    });
    expect(withoutHistory).not.toHaveProperty('onOpen');
  });

  it('keeps reveal in Finder separate from opening the folder', () => {
    const actions = getFolderActionDescriptors({
      currentDirectory: null,
      folder,
      handlers: createHandlers(),
    });

    expect(actions.find((action) => action.id === 'reveal-in-finder')).toMatchObject(
      {
        kind: 'showInFinder',
        title: 'Reveal in Finder',
        path: folder.path,
        shortcut: { modifiers: ['cmd', 'shift'], key: 'o' },
      }
    );
  });

  it('adds Backspace as a go back shortcut in browse mode', () => {
    const actions = getFolderActionDescriptors({
      currentDirectory: '/Users/example',
      folder,
      handlers: createHandlers(),
    });

    expect(actions.find((action) => action.id === 'go-back-backspace')).toMatchObject(
      {
        kind: 'action',
        title: 'Go Back',
        shortcut: { modifiers: [], key: 'backspace' },
      }
    );
  });
});

describe('getCurrentFolderActionDescriptors', () => {
  it('uses go back as primary and opens the current folder as secondary', () => {
    const actions = getCurrentFolderActionDescriptors({
      folder,
      handlers: createHandlers(),
    });

    expect(actions[0]).toMatchObject({
      id: 'go-back',
      kind: 'action',
      title: 'Go Back',
      shortcut: { modifiers: ['cmd'], key: 'arrowLeft' },
    });
    expect(actions[1]).toMatchObject({
      id: 'open-current-folder-in-finder',
      kind: 'open',
      title: 'Open Current Folder in Finder',
      target: folder.path,
      application: 'Finder',
      shortcut: { modifiers: ['cmd'], key: 'o' },
    });
  });

  it('does not attach history tracking to current folder open without history', () => {
    const actions = getCurrentFolderActionDescriptors({
      folder,
      handlers: createHandlers(),
    });

    expect(
      actions.find((action) => action.id === 'open-current-folder-without-history')
    ).toMatchObject({
      kind: 'open',
      title: 'Open Current Folder Without History',
      target: folder.path,
      application: 'Finder',
      shortcut: { modifiers: ['cmd', 'opt'], key: 'o' },
    });
    expect(
      actions.find((action) => action.id === 'open-current-folder-without-history')
    ).not.toHaveProperty('onOpen');
  });

  it('adds Backspace as a go back shortcut without changing secondary open', () => {
    const actions = getCurrentFolderActionDescriptors({
      folder,
      handlers: createHandlers(),
    });

    expect(actions[1].id).toBe('open-current-folder-in-finder');
    expect(actions.find((action) => action.id === 'go-back-backspace')).toMatchObject(
      {
        kind: 'action',
        title: 'Go Back',
        shortcut: { modifiers: [], key: 'backspace' },
      }
    );
  });
});
