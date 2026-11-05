export const EXIT_CODES = Object.freeze({
  success: 0,
  usage: 2,
  source: 3,
  platform: 4,
  operation: 5,
  package: 6,
});

export class CliError extends Error {
  constructor(code, message, exitCode, details = undefined) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export function usageError(message, code = "USAGE_INVALID") {
  return new CliError(code, message, EXIT_CODES.usage);
}

export function packageError(message, code = "PACKAGE_INVALID", details = undefined) {
  return new CliError(code, message, EXIT_CODES.package, details);
}

export function sourceError(message, code = "SOURCE_UNAVAILABLE", details = undefined) {
  return new CliError(code, message, EXIT_CODES.source, details);
}

export function platformError(message, code = "PLATFORM_REQUEST_FAILED", details = undefined) {
  return new CliError(code, message, EXIT_CODES.platform, details);
}

export function operationError(message, code = "OPERATION_INCOMPLETE", details = undefined) {
  return new CliError(code, message, EXIT_CODES.operation, details);
}
