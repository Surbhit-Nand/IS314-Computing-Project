export function isDispatcherRole(role: unknown): boolean {
  return role === "dispatcher" || role === "rescuer";
}