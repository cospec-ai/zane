import type { ApprovalPolicy, SandboxMode } from "./types";

export interface PermissionPreset {
  label: string;
  detail: string;
  approvalPolicy: ApprovalPolicy;
  sandbox: SandboxMode;
}

export const permissionPresets = {
  cautious: {
    label: "Cautious",
    detail: "Read-only, always ask",
    approvalPolicy: "on-request",
    sandbox: "read-only",
  },
  standard: {
    label: "Standard",
    detail: "Workspace write, ask",
    approvalPolicy: "on-request",
    sandbox: "workspace-write",
  },
  autonomous: {
    label: "Autonomous",
    detail: "Full access, no prompts",
    approvalPolicy: "never",
    sandbox: "danger-full-access",
  },
} as const satisfies Record<string, PermissionPreset>;

export type PermissionLevel = keyof typeof permissionPresets;
