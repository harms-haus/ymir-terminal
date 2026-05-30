export interface Command {
  id: string;
  label: string;
  description?: string;
  execute?: () => void | Promise<void>;
}

// All available commands. Currently empty — commands will be added here as the app grows.
const commands: Command[] = [];

/** Get all commands, sorted alphabetically by label */
export function getAllCommands(): Command[] {
  return [...commands].sort((a, b) => a.label.localeCompare(b.label));
}

/** Search commands by query string. Case-insensitive match on label. */
export function searchCommands(query: string): Command[] {
  if (!query) return getAllCommands();
  const lower = query.toLowerCase();
  return commands
    .filter(
      (cmd) => cmd.label.toLowerCase().includes(lower) || cmd.id.toLowerCase().includes(lower),
    )
    .sort((a, b) => a.label.localeCompare(b.label));
}
