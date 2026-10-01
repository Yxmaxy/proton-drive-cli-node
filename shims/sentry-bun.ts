// No-op Sentry replacement for the Node build.
export type ErrorEvent = any;
export type StackFrame = any;
export type SeverityLevel = string;
export function init() {}
export async function close() { return true; }
export function captureException() {}
export function captureMessage() {}
export function addBreadcrumb() {}
export async function flush() { return true; }
