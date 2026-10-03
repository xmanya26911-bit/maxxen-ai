export type ToolPermission =
  | "read"
  | "write"
  | "deploy"
  | "external"
  | "filesystem"
  | "browser";

export interface ToolDefinition<TArgs extends Record<string, unknown> = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  permission: ToolPermission;
  inputSchema: Record<string, unknown>;
  execute: (args: TArgs) => Promise<TResult>;
}

export function defineTool<TArgs extends Record<string, unknown>, TResult>(
  definition: ToolDefinition<TArgs, TResult>
): ToolDefinition<TArgs, TResult> {
  if (!/^[a-z][a-z0-9_.-]{1,63}$/.test(definition.name)) {
    throw new Error("Tool names must be 2-64 chars and use lowercase letters, digits, '.', '_' or '-'.");
  }
  return Object.freeze({ ...definition });
}

export function toolSchema(definition: ToolDefinition): Record<string, unknown> {
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.inputSchema,
  };
}
