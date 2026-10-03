export type Permission =
  | "repository.read" | "repository.write" | "deployment.read" | "deployment.write"
  | "browser.read" | "browser.write" | "filesystem.read" | "filesystem.write"
  | "memory.read" | "memory.write" | "external.read" | "external.write";

export interface PermissionSet {
  allow: Permission[];
  deny?: Permission[];
}

export function can(set: PermissionSet, permission: Permission): boolean {
  if (set.deny?.includes(permission)) return false;
  return set.allow.includes(permission);
}

export function intersectPermissions(a: PermissionSet, b: PermissionSet): PermissionSet {
  const allow = a.allow.filter((p) => b.allow.includes(p));
  const deny = Array.from(new Set([...(a.deny || []), ...(b.deny || [])]));
  return { allow, deny };
}
