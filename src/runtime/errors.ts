import type { RunErrorCode } from "../contracts/skill.js";

export class RuntimeError extends Error {
  constructor(
    public readonly code: RunErrorCode,
    message: string,
    public readonly field?: string,
    public readonly recoverable = false
  ) {
    super(message);
  }
}
