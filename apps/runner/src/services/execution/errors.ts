export class CancelledError extends Error {
  constructor(message = "Run cancelled") {
    super(message);
    this.name = "CancelledError";
  }
}

export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export class CommandTimedOutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandTimedOutError";
  }
}
