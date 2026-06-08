import {
  ErrorCodes,
  type MessageEnvelope,
  type RequestEnvelope,
  type ResponseEnvelope,
  type FileSearchRequest,
  type FileSearchResponse,
  type FileSearchProgressEvent,
  type FileSearchReplaceRequest,
  type FileSearchReplaceResponse,
} from '@ymir/shared';
import type { ClientConnection } from '../../connection';
import { createError, createResponse, createEvent } from '../../router';
import { streamSearch as _streamSearch } from '../../../files/search';
import { safePath, resolveWorkspace, sanitizeErrorMessage, type FileDeps } from './shared';
import type { MessageRouter } from '../../router';

// ---------------------------------------------------------------------------
// Per-connection AbortController tracking
// ---------------------------------------------------------------------------

const activeSearches = new Map<string, AbortController>();

// ---------------------------------------------------------------------------
// Registration — search & replace handlers
// ---------------------------------------------------------------------------

export function registerSearchHandlers(router: MessageRouter, deps: FileDeps): void {
  const doStreamSearch = deps._mocks?.streamSearch ?? deps.search?.streamSearch ?? _streamSearch;

  // --- file.search --------------------------------------------------------
  router.handle('file.search', async (conn: ClientConnection, envelope: MessageEnvelope) => {
    const req = envelope as RequestEnvelope<FileSearchRequest>;
    const payload = req.payload;
    const channel = req.channel ?? 'file.search';

    // 1. Validate required fields
    if (
      payload == null ||
      typeof payload !== 'object' ||
      typeof payload.workspaceId !== 'string' ||
      typeof payload.query !== 'string' ||
      payload.query.length === 0
    ) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel },
        ErrorCodes.INVALID_MESSAGE,
        'Missing required fields: workspaceId, query',
      );
      conn.send(err);
      return;
    }

    // 2. Resolve workspace
    const workspace = resolveWorkspace(deps, payload as unknown as Record<string, unknown>);
    if (!workspace) {
      const err: ResponseEnvelope = createError(
        { id: req.id, channel },
        ErrorCodes.WORKSPACE_NOT_FOUND,
        `Workspace not found: ${payload.workspaceId}`,
      );
      conn.send(err);
      return;
    }

    // 3. Abort any previous search for this connection
    const connId = conn.sessionId;
    const prev = activeSearches.get(connId);
    if (prev) {
      prev.abort();
    }

    // 4. Create new AbortController
    const abortController = new AbortController();
    activeSearches.set(connId, abortController);

    // 5. Determine search root
    const searchRoot = workspace.cwd;

    // 6. Track counts for progress events
    let totalMatches = 0;
    let truncated = false;
    let fileCount = 0;

    try {
      const result = await doStreamSearch(
        searchRoot,
        workspace.cwd,
        {
          query: payload.query,
          caseSensitive: !!payload.caseSensitive,
          wholeWord: !!payload.wholeWord,
          useRegex: !!payload.useRegex,
          includePattern: payload.includePattern,
          maxTotal: 1000,
          maxPerFile: 50,
        },
        {
          onFileResult(result) {
            totalMatches += result.matches.length;
            fileCount++;
            if (result.truncated) {
              truncated = true;
            }
            const progressEvent: FileSearchProgressEvent = {
              workspaceId: payload.workspaceId,
              requestId: req.id,
              fileResult: result,
              done: false,
              totalMatches,
              truncated,
            };
            conn.send(createEvent('file.search.progress', progressEvent));
          },
        },
        abortController.signal,
      );

      // Use the authoritative counts from streamSearch
      totalMatches = result.totalMatches;
      truncated = result.truncated;
      fileCount = result.fileCount;

      // Send final progress event with done: true
      const finalProgressEvent: FileSearchProgressEvent = {
        workspaceId: payload.workspaceId,
        requestId: req.id,
        fileResult: {
          path: '',
          relativePath: '',
          matches: [],
          truncated: false,
        },
        done: true,
        totalMatches,
        truncated,
      };
      conn.send(createEvent('file.search.progress', finalProgressEvent));

      // Send success response
      const resp: ResponseEnvelope<FileSearchResponse> = createResponse(req, {
        totalMatches,
        truncated,
        fileCount,
      } satisfies FileSearchResponse);
      conn.send(resp);
    } catch (err: unknown) {
      const message = err instanceof Error ? sanitizeErrorMessage(err) : 'Search failed';
      const errResp: ResponseEnvelope = createError(
        { id: req.id, channel },
        ErrorCodes.HANDLER_ERROR,
        message,
      );
      conn.send(errResp);
    } finally {
      activeSearches.delete(connId);
    }
  });

  // --- file.search.replace ------------------------------------------------
  router.handle(
    'file.search.replace',
    async (conn: ClientConnection, envelope: MessageEnvelope) => {
      const req = envelope as RequestEnvelope<FileSearchReplaceRequest>;
      const payload = req.payload;
      const channel = req.channel ?? 'file.search.replace';

      // 1. Validate required fields
      if (
        payload == null ||
        typeof payload !== 'object' ||
        typeof payload.workspaceId !== 'string' ||
        typeof payload.query !== 'string' ||
        payload.query.length === 0 ||
        typeof payload.replacement !== 'string'
      ) {
        const err: ResponseEnvelope = createError(
          { id: req.id, channel },
          ErrorCodes.INVALID_MESSAGE,
          'Missing required fields: workspaceId, query, replacement',
        );
        conn.send(err);
        return;
      }

      // 2. Resolve workspace
      const workspace = resolveWorkspace(deps, payload as unknown as Record<string, unknown>);
      if (!workspace) {
        const err: ResponseEnvelope = createError(
          { id: req.id, channel },
          ErrorCodes.WORKSPACE_NOT_FOUND,
          `Workspace not found: ${payload.workspaceId}`,
        );
        conn.send(err);
        return;
      }

      const cwd = workspace.cwd;

      try {
        // 3. Validate regex pattern length (ReDoS protection)
        if (payload.useRegex && payload.query.length > 500) {
          const err: ResponseEnvelope = createError(
            { id: req.id, channel },
            ErrorCodes.INVALID_MESSAGE,
            'Regex pattern too long (max 500 characters)',
          );
          conn.send(err);
          return;
        }

        // 4. Build ripgrep arguments to find matching files
        const rgArgs: string[] = ['-l', '-F', '-e', payload.query, cwd];

        if (!payload.caseSensitive) {
          rgArgs.splice(1, 0, '-i');
        }
        if (payload.wholeWord) {
          rgArgs.splice(1, 0, '-w');
        }
        if (payload.useRegex) {
          // Remove -F flag (at index after -l)
          const fIdx = rgArgs.indexOf('-F');
          if (fIdx !== -1) rgArgs.splice(fIdx, 1);
        }
        if (payload.includePattern) {
          rgArgs.push('--glob', payload.includePattern);
        }

        // 5. Spawn ripgrep to find matching files
        const proc = Bun.spawn(['rg', ...rgArgs], {
          cwd,
          stdout: 'pipe',
          stderr: 'pipe',
        });

        const stdout = proc.stdout as ReadableStream<Uint8Array>;
        const reader = stdout.getReader();
        const decoder = new TextDecoder();
        let output = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          output += decoder.decode(value, { stream: true });
        }

        await proc.exited;

        // ripgrep exits with code 1 when no matches found — that's fine
        if (proc.exitCode !== 0 && proc.exitCode !== 1) {
          const errResp: ResponseEnvelope = createError(
            { id: req.id, channel },
            ErrorCodes.HANDLER_ERROR,
            'Search replace failed: ripgrep error',
          );
          conn.send(errResp);
          return;
        }

        const matchingFiles = output
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        // 6. Perform replacements
        const replacedFiles: string[] = [];
        let totalReplacements = 0;

        const ops = deps.operations;

        for (const filePath of matchingFiles) {
          // Validate path safety
          let resolvedPath: string;
          try {
            // Compute relative path from cwd for safePath
            const relativePath = filePath.startsWith(cwd + '/')
              ? filePath.slice(cwd.length + 1)
              : filePath;
            resolvedPath = safePath(cwd, relativePath);
          } catch {
            // Skip files with unsafe paths
            continue;
          }

          // Skip files larger than 1MB for performance and safety
          const stat = await Bun.file(resolvedPath).stat();
          if (stat && stat.size > 1_000_000) {
            continue;
          }

          const content = await ops.readFile(resolvedPath);

          let newContent: string;
          let count: number;

          if (payload.useRegex) {
            const flags = payload.caseSensitive ? 'g' : 'gi';
            let regex: RegExp;
            try {
              regex = new RegExp(payload.query, flags);
            } catch {
              const errResp: ResponseEnvelope = createError(
                { id: req.id, channel },
                ErrorCodes.INVALID_MESSAGE,
                `Invalid regex pattern: ${payload.query}`,
              );
              conn.send(errResp);
              return;
            }
            const matches = content.match(regex);
            count = matches ? matches.length : 0;
            newContent = content.replace(regex, payload.replacement);
          } else {
            // Literal replacement
            if (payload.caseSensitive) {
              count = content.split(payload.query).length - 1;
              newContent = content.replaceAll(payload.query, payload.replacement);
            } else {
              // Case-insensitive literal: need regex
              const escaped = payload.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(escaped, 'gi');
              const matches = content.match(regex);
              count = matches ? matches.length : 0;
              newContent = content.replace(regex, payload.replacement);
            }
          }

          if (count > 0) {
            await ops.writeFile(resolvedPath, newContent);
            replacedFiles.push(filePath);
            totalReplacements += count;
          }
        }

        // 7. Send success response
        const resp: ResponseEnvelope<FileSearchReplaceResponse> = createResponse(req, {
          replacedFiles,
          totalReplacements,
        } satisfies FileSearchReplaceResponse);
        conn.send(resp);
      } catch (err: unknown) {
        const message = err instanceof Error ? sanitizeErrorMessage(err) : 'Search replace failed';
        const errResp: ResponseEnvelope = createError(
          { id: req.id, channel },
          ErrorCodes.HANDLER_ERROR,
          message,
        );
        conn.send(errResp);
      }
    },
  );
}
