import {
  ErrorCodes,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type PathAutocompleteRequest,
  type PathAutocompleteResponse,
  expandTilde,
} from '@ymir/shared';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { listDirectories } from '../../files/directory-lister';
import type { ClientConnection } from '../connection';
import { createError, createResponse, type MessageRouter } from '../router';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface PathDeps {
  _mocks?: {
    listDirectories?: typeof listDirectories;
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerPathHandlers(router: MessageRouter, deps: PathDeps): void {
  const doListDirectories = deps._mocks?.listDirectories ?? listDirectories;

  // --- path.autocomplete --------------------------------------------------
  router.handle('path.autocomplete', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<PathAutocompleteRequest>;
    const payload = req.payload;

    if (
      payload == null ||
      typeof payload !== 'object' ||
      typeof payload.path !== 'string' ||
      payload.path === ''
    ) {
      conn.send(createError(req, ErrorCodes.INVALID_MESSAGE, 'Missing or invalid path field'));
      return;
    }

    const expanded = expandTilde(payload.path);

    // Handle bare "~" (expandTilde only handles "~/…", not bare "~")
    const homeExpanded = expanded === '~' ? homedir() : expanded;

    if (!homeExpanded.startsWith('/')) {
      conn.send(createError(req, ErrorCodes.INVALID_MESSAGE, 'Relative paths are not supported'));
      return;
    }

    const resolved = resolve(homeExpanded);

    try {
      const directories = await doListDirectories(resolved);
      const resp: ResponseEnvelope<PathAutocompleteResponse> = createResponse(req, {
        directories,
      } satisfies PathAutocompleteResponse);
      conn.send(resp);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      const code = error.code;

      if (code === 'ENOENT') {
        conn.send(createError(req, ErrorCodes.FILE_NOT_FOUND, 'Directory not found'));
      } else if (code === 'ENOTDIR') {
        conn.send(createError(req, ErrorCodes.FILE_NOT_FOUND, 'Path is not a directory'));
      } else if (code === 'EACCES' || code === 'EPERM') {
        conn.send(createError(req, ErrorCodes.PERMISSION_DENIED, 'Permission denied'));
      } else {
        conn.send(createError(req, ErrorCodes.HANDLER_ERROR, error.message ?? 'Internal error'));
      }
    }
  });
}
