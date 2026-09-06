import type { ReadAction, ReadActionPlan } from "./readAction.js";
import type { Action, WriteAction, WriteActionPlan } from "./writeAction.js";

type ReadBridgeAction = Pick<ReadAction, "name" | "mode" | "scope" | "inputSchema" | "outputSchema" | "maxOutputChars" | "contractVersion" | "resultMetadata"> & { plan: ReadActionPlan };
type WriteBridgeAction = Pick<WriteAction, "name" | "mode" | "operation" | "scope" | "inputSchema" | "outputSchema" | "maxOutputChars" | "contractVersion" | "resultMetadata"> & { plan: WriteActionPlan };
export type BridgeCommand =
  | { type: "run-read-action"; taskId: string; action: ReadBridgeAction; input: Record<string, unknown> }
  | { type: "run-write-action"; taskId: string; action: WriteBridgeAction; input: Record<string, unknown> };
type BridgeRunResult = { data: unknown; actionDurationMs?: number };
type PendingTask = { command: BridgeCommand; resolve: (value: BridgeRunResult) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout };
type BridgeFailure = { code: string; message: string };

export class BrowserBridge {
  private queue: BridgeCommand[] = [];
  private pending = new Map<string, PendingTask>();
  private lastSeenAt = 0;

  poll() {
    this.lastSeenAt = Date.now();
    return this.queue.shift();
  }

  connected() {
    return Date.now() - this.lastSeenAt < 7_000;
  }

  run(action: Action, input: Record<string, unknown>) {
    if (!this.connected()) throw new Error("BrowserForge extension is not connected; open an HTTP(S) tab with the extension enabled");
    const taskId = crypto.randomUUID();
    const common = { name: action.name, mode: action.mode, scope: action.scope, inputSchema: action.inputSchema, outputSchema: action.outputSchema, maxOutputChars: action.maxOutputChars, contractVersion: action.contractVersion, resultMetadata: action.resultMetadata };
    const command: BridgeCommand = action.mode === "write"
      ? { type: "run-write-action", taskId, action: { ...common, mode: "write", operation: action.operation, plan: action.plan }, input }
      : { type: "run-read-action", taskId, action: { ...common, mode: "read", plan: action.plan }, input };
    return new Promise<BridgeRunResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(taskId);
        reject(new Error("Timed out waiting for the BrowserForge extension"));
      }, 30_000);
      this.pending.set(taskId, { command, resolve, reject, timer });
      this.queue.push(command);
    });
  }

  complete(taskId: string, result: { ok: boolean; data?: unknown; durationMs?: number; error?: string | BridgeFailure }) {
    const task = this.pending.get(taskId);
    if (!task) return false;
    this.pending.delete(taskId);
    clearTimeout(task.timer);
    if (result.ok) task.resolve({ data: result.data, ...(result.durationMs !== undefined ? { actionDurationMs: result.durationMs } : {}) });
    else {
      const detail = typeof result.error === "object" && result.error ? result.error : { code: "BROWSER_ACTION_FAILED", message: result.error || "Browser action failed" };
      const error = new Error(detail.message) as Error & { code?: string };
      error.code = detail.code;
      task.reject(error);
    }
    return true;
  }
}
