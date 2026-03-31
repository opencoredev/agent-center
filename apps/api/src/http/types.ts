export interface ApiVariables {
  requestId: string;
  userId?: string;
}

export interface ApiEnv {
  Variables: ApiVariables;
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}

export interface SuccessEnvelope<TData> {
  data: TData;
  requestId: string;
}
