export class AgentCenterTransportError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AgentCenterTransportError";
    this.cause = cause;
  }
}

export class AgentCenterApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    options?: {
      details?: unknown;
      requestId?: string;
    },
  ) {
    super(message);
    this.name = "AgentCenterApiError";
    this.status = status;
    this.code = code;
    this.details = options?.details;
    this.requestId = options?.requestId;
  }
}

export class AgentCenterProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentCenterProtocolError";
  }
}

export class AgentCenterRealtimeError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AgentCenterRealtimeError";
    this.cause = cause;
  }
}
