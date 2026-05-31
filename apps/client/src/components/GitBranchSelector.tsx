import { useState, useRef, useEffect, useCallback } from 'react';
import type { GitBranch } from '@ymir/shared';
import {
  COLOR_TEXT,
  COLOR_TEXT_MUTED,
  COLOR_BG_SECONDARY,
  COLOR_BORDER,
  COLOR_GIT_BRANCH_BG,
  COLOR_GIT_BRANCH_BORDER,
  COLOR_GIT_BRANCH_HOVER,
} from '../lib/theme';

interface GitBranchSelectorProps {
  branches: GitBranch[];
  current: string | null;
  onCheckout: (branch: string) => void;
  onCreateBranch: (name: string) => void;
  disabled?: boolean;
}

export function GitBranchSelector({
  branches,
  current,
  onCheckout,
  onCreateBranch,
  disabled = false,
}: GitBranchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const totalItems = branches.length + 1; // branches + "Create New Branch"

  // Reset state when opening
  const openDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen(true);
    setIsCreating(false);
    setNewBranchName('');
    // Default highlight to current branch
    const currentIdx = branches.findIndex((b) => b.name === current);
    setHighlightedIndex(currentIdx >= 0 ? currentIdx : 0);
  }, [disabled, branches, current]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setIsCreating(false);
    setNewBranchName('');
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen) return;
    const dropdown = dropdownRef.current;
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('[role="option"]');
    const highlighted = items[highlightedIndex] as HTMLElement | undefined;
    highlighted?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, closeDropdown]);

  // Focus input when entering create mode
  useEffect(() => {
    if (isCreating) {
      createInputRef.current?.focus();
    }
  }, [isCreating]);

  const handleTriggerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDropdown();
      }
    },
    [openDropdown],
  );

  const handleDropdownKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isCreating) {
        if (e.key === 'Enter') {
          e.preventDefault();
          const trimmed = newBranchName.trim();
          if (trimmed) {
            onCreateBranch(trimmed);
            closeDropdown();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setIsCreating(false);
          setNewBranchName('');
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, totalItems - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex < branches.length) {
          onCheckout(branches[highlightedIndex].name);
          closeDropdown();
        } else {
          // "Create New Branch" selected
          setIsCreating(true);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeDropdown();
      }
    },
    [isCreating, newBranchName, highlightedIndex, branches, totalItems, onCheckout, onCreateBranch, closeDropdown],
  );

  const handleCreateClick = useCallback(() => {
    setIsCreating(true);
    setNewBranchName('');
  }, []);

  const handleCreateInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        const trimmed = newBranchName.trim();
        if (trimmed) {
          onCreateBranch(trimmed);
          closeDropdown();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsCreating(false);
        setNewBranchName('');
      }
    },
    [newBranchName, onCreateBranch, closeDropdown],
  );

  // ── Inactive state ──────────────────────────────────────────────────────

  if (!isOpen) {
    return (
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        data-testid="git-branch-selector"
        aria-expanded={false}
        aria-haspopup="listbox"
        onClick={openDropdown}
        onKeyDown={handleTriggerKeyDown}
        style={{
          background: COLOR_GIT_BRANCH_BG,
          border: `1px solid ${COLOR_GIT_BRANCH_BORDER}`,
          borderRadius: 3,
          padding: '1px 8px',
          cursor: disabled ? 'default' : 'pointer',
          fontSize: 12,
          color: COLOR_TEXT,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          userSelect: 'none',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span>{'⎇ '}</span>
        <span>{current ?? 'no branch'}</span>
      </div>
    );
  }

  // ── Active state ────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', display: 'inline-flex' }}
      onKeyDown={handleDropdownKeyDown}
    >
      {/* Trigger (visible when open) */}
      <div
        role="button"
        tabIndex={0}
        data-testid="git-branch-selector"
        aria-expanded={true}
        aria-haspopup="listbox"
        onClick={closeDropdown}
        style={{
          background: COLOR_GIT_BRANCH_HOVER,
          border: `1px solid ${COLOR_GIT_BRANCH_BORDER}`,
          borderRadius: 3,
          padding: '1px 8px',
          cursor: 'pointer',
          fontSize: 12,
          color: COLOR_TEXT,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          userSelect: 'none',
        }}
      >
        <span>{'⎇ '}</span>
        <span>{current ?? 'no branch'}</span>
      </div>

      {/* Dropdown */}
      <div
        ref={dropdownRef}
        data-testid="git-branch-dropdown"
        role="listbox"
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 1000,
          background: COLOR_BG_SECONDARY,
          border: `1px solid ${COLOR_BORDER}`,
          borderRadius: 4,
          maxHeight: 200,
          overflow: 'auto',
          minWidth: 150,
        }}
      >
        {branches.map((branch, i) => (
          <div
            key={branch.name}
            role="option"
            aria-selected={i === highlightedIndex}
            data-testid={`git-branch-item-${branch.name}`}
            onClick={() => {
              onCheckout(branch.name);
              closeDropdown();
            }}
            onMouseEnter={() => setHighlightedIndex(i)}
            style={{
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 12,
              color: COLOR_TEXT,
              background: i === highlightedIndex ? COLOR_GIT_BRANCH_HOVER : undefined,
              whiteSpace: 'nowrap',
            }}
          >
            {branch.name === current ? `✓ ${branch.name}` : branch.name}
          </div>
        ))}

        {/* Create new branch */}
        {isCreating ? (
          <div style={{ padding: '4px 8px' }}>
            <input
              ref={createInputRef}
              data-testid="git-create-branch"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={handleCreateInputKeyDown}
              placeholder="Branch name..."
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'transparent',
                border: `1px solid ${COLOR_BORDER}`,
                outline: 'none',
                color: COLOR_TEXT,
                fontSize: 12,
                padding: '2px 4px',
                borderRadius: 2,
              }}
            />
          </div>
        ) : (
          <div
            role="option"
            aria-selected={highlightedIndex === branches.length}
            data-testid="git-create-branch"
            onClick={handleCreateClick}
            onMouseEnter={() => setHighlightedIndex(branches.length)}
            style={{
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 12,
              color: COLOR_TEXT_MUTED,
              background: highlightedIndex === branches.length ? COLOR_GIT_BRANCH_HOVER : undefined,
              whiteSpace: 'nowrap',
              borderTop: `1px solid ${COLOR_BORDER}`,
            }}
          >
            + Create New Branch
          </div>
        )}
      </div>
    </div>
  );
}
