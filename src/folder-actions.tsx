import { Action, ActionPanel, Icon } from '@raycast/api';

import {
  getCurrentFolderActionDescriptors,
  getFolderActionDescriptors,
  type FolderActionDescriptor,
  type FolderActionHandlers,
  type FolderActionIcon,
} from './folder-action-descriptors';
import type { FolderItem } from './search-utils';

interface FolderActionsProps {
  currentDirectory: string | null;
  folder: FolderItem;
  handlers: FolderActionHandlers;
}

function getIcon(icon: FolderActionIcon) {
  switch (icon) {
    case 'arrowLeft':
      return Icon.ArrowLeft;
    case 'arrowRight':
      return Icon.ArrowRight;
    case 'folder':
      return Icon.Folder;
    case 'minus':
      return Icon.Minus;
    case 'plus':
      return Icon.Plus;
  }
}

function renderAction(action: FolderActionDescriptor) {
  switch (action.kind) {
    case 'action':
      return (
        <Action
          key={action.id}
          title={action.title}
          icon={getIcon(action.icon)}
          shortcut={action.shortcut}
          onAction={action.onAction}
        />
      );
    case 'open':
      return (
        <Action.Open
          key={action.id}
          title={action.title}
          icon={getIcon(action.icon)}
          target={action.target}
          application={action.application}
          shortcut={action.shortcut}
          onOpen={action.onOpen}
        />
      );
    case 'showInFinder':
      return (
        <Action.ShowInFinder
          key={action.id}
          title={action.title}
          path={action.path}
          shortcut={action.shortcut}
          onShow={action.onShow}
        />
      );
    case 'copy':
      return (
        <Action.CopyToClipboard
          key={action.id}
          title={action.title}
          content={action.content}
          shortcut={action.shortcut}
        />
      );
  }
}

export function FolderActions({
  currentDirectory,
  folder,
  handlers,
}: FolderActionsProps) {
  return (
    <ActionPanel>
      {getFolderActionDescriptors({
        currentDirectory,
        folder,
        handlers,
      }).map(renderAction)}
    </ActionPanel>
  );
}

export function CurrentFolderActions({
  folder,
  handlers,
}: Pick<FolderActionsProps, 'folder' | 'handlers'>) {
  return (
    <ActionPanel>
      {getCurrentFolderActionDescriptors({
        folder,
        handlers,
      }).map(renderAction)}
    </ActionPanel>
  );
}
