import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";
import { PTYManager } from "./manager";
import { toBase64 } from "@ymir/shared";

describe("PTYManager", () => {
  let manager: PTYManager;
  let mockTerminalInstances: any[];
  let mockSpawnedProcesses: any[];
  let originalTerminal: any;
  let originalSpawn: any;

  beforeEach(() => {
    manager = new PTYManager();
    mockTerminalInstances = [];
    mockSpawnedProcesses = [];

    // Store originals
    originalTerminal = (Bun as any).Terminal;
    originalSpawn = (Bun as any).spawn;

    // Mock Bun.Terminal
    (Bun as any).Terminal = class MockTerminal {
      cols: number;
      rows: number;
      dataCallback: Function;
      written: Buffer[] = [];
      resizeOpts: { cols: number; rows: number } | null = null;
      closed = false;

      constructor(opts: any) {
        this.cols = opts.cols;
        this.rows = opts.rows;
        this.dataCallback = opts.data;
        mockTerminalInstances.push(this);
      }

      write(data: Buffer) {
        this.written.push(data);
      }

      resize(opts: { cols: number; rows: number }) {
        this.resizeOpts = opts;
        this.cols = opts.cols;
        this.rows = opts.rows;
      }

      close() {
        this.closed = true;
      }
    };

    // Mock Bun.spawn
    (Bun as any).spawn = mock((_cmd: string[], opts: any) => {
      const proc = {
        killed: false,
        kill() {
          this.killed = true;
        },
      };
      mockSpawnedProcesses.push(proc);
      return proc;
    });
  });

  // Restore originals after each test
  // (handled by afterEach below)

  afterEach(() => {
    (Bun as any).Terminal = originalTerminal;
    (Bun as any).spawn = originalSpawn;
  });

  it("create() creates a PTY and returns the id", () => {
    const onData = mock((_data: string) => {});
    const id = manager.create("test-1", {
      cwd: "/home/user",
      cols: 80,
      rows: 24,
      onData,
    });

    expect(id).toBe("test-1");
    expect(mockTerminalInstances).toHaveLength(1);
    expect(mockTerminalInstances[0].cols).toBe(80);
    expect(mockTerminalInstances[0].rows).toBe(24);
    expect(mockSpawnedProcesses).toHaveLength(1);
    expect(manager.has("test-1")).toBe(true);
  });

  it("create() uses shell option when provided", () => {
    const onData = mock((_data: string) => {});
    manager.create("test-shell", {
      shell: "/bin/zsh",
      cwd: "/home/user",
      cols: 80,
      rows: 24,
      onData,
    });

    expect((Bun as any).spawn).toHaveBeenCalledWith(
      ["/bin/zsh"],
      expect.objectContaining({ cwd: "/home/user" }),
    );
  });

  it("create() defaults to SHELL env var when no shell option", () => {
    const originalShell = process.env.SHELL;
    process.env.SHELL = "/bin/zsh";

    const onData = mock((_data: string) => {});
    manager.create("test-default-shell", {
      cwd: "/home/user",
      cols: 80,
      rows: 24,
      onData,
    });

    expect((Bun as any).spawn).toHaveBeenCalledWith(
      ["/bin/zsh"],
      expect.objectContaining({ cwd: "/home/user" }),
    );

    process.env.SHELL = originalShell;
  });

  it("create() invokes onData with base64-encoded data from terminal", () => {
    const onData = mock((_data: string) => {});
    manager.create("test-data", {
      cwd: "/home/user",
      cols: 80,
      rows: 24,
      onData,
    });

    const terminal = mockTerminalInstances[0];
    const testData = Buffer.from("hello terminal");
    terminal.dataCallback(terminal, testData);

    expect(onData).toHaveBeenCalledTimes(1);
    const encoded = onData.mock.calls[0][0] as string;
    expect(encoded).toBe(toBase64(testData));
  });

  it("write() decodes base64 and writes to terminal", () => {
    const onData = mock((_data: string) => {});
    manager.create("test-write", {
      cwd: "/home/user",
      cols: 80,
      rows: 24,
      onData,
    });

    const inputData = "ls -la\n";
    const encoded = toBase64(inputData);
    manager.write("test-write", encoded);

    const terminal = mockTerminalInstances[0];
    expect(terminal.written).toHaveLength(1);
    const written = terminal.written[0];
    expect(new TextDecoder().decode(written)).toBe(inputData);
  });

  it("write() throws if terminal not found", () => {
    expect(() => manager.write("nonexistent", toBase64("data"))).toThrow(
      "Terminal nonexistent not found",
    );
  });

  it("resize() resizes the terminal", () => {
    const onData = mock((_data: string) => {});
    manager.create("test-resize", {
      cwd: "/home/user",
      cols: 80,
      rows: 24,
      onData,
    });

    manager.resize("test-resize", 120, 40);

    const terminal = mockTerminalInstances[0];
    expect(terminal.resizeOpts).toEqual({ cols: 120, rows: 40 });
  });

  it("resize() throws if terminal not found", () => {
    expect(() => manager.resize("nonexistent", 120, 40)).toThrow(
      "Terminal nonexistent not found",
    );
  });

  it("kill() closes terminal and kills process", () => {
    const onData = mock((_data: string) => {});
    manager.create("test-kill", {
      cwd: "/home/user",
      cols: 80,
      rows: 24,
      onData,
    });

    expect(manager.has("test-kill")).toBe(true);

    manager.kill("test-kill");

    expect(manager.has("test-kill")).toBe(false);
    expect(mockTerminalInstances[0].closed).toBe(true);
    expect(mockSpawnedProcesses[0].killed).toBe(true);
  });

  it("kill() does nothing if terminal not found", () => {
    // Should not throw
    manager.kill("nonexistent");
  });

  it("has() returns false for nonexistent terminal", () => {
    expect(manager.has("nonexistent")).toBe(false);
  });

  it("killAll() closes all terminals", () => {
    const onData = mock((_data: string) => {});
    manager.create("term-1", {
      cwd: "/home/user",
      cols: 80,
      rows: 24,
      onData,
    });
    manager.create("term-2", {
      cwd: "/home/user",
      cols: 100,
      rows: 30,
      onData,
    });

    manager.killAll();

    expect(manager.has("term-1")).toBe(false);
    expect(manager.has("term-2")).toBe(false);
    expect(mockTerminalInstances[0].closed).toBe(true);
    expect(mockTerminalInstances[1].closed).toBe(true);
    expect(mockSpawnedProcesses[0].killed).toBe(true);
    expect(mockSpawnedProcesses[1].killed).toBe(true);
  });
});
