import { describeError } from "../lib/errors";

export interface RunnerDispatchPayload {
  runId: string;
}

export interface RunnerDispatchResult {
  accepted: boolean;
  responseStatus: number;
}

interface RunnerDispatchResponse {
  accepted?: boolean;
}

export function createRunnerClient(options: {
  baseUrl: string;
  dispatchTimeoutMs: number;
}) {
  const endpoint = new URL("/internal/runs/execute", options.baseUrl).toString();

  return {
    endpoint,
    async dispatchRun(payload: RunnerDispatchPayload): Promise<RunnerDispatchResult> {
      let response: Response;

      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(options.dispatchTimeoutMs),
        });
      } catch (error) {
        throw new Error(`Runner dispatch request failed: ${describeError(error)}`);
      }

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          `Runner dispatch rejected with ${response.status}: ${responseText || response.statusText}`,
        );
      }

      if (responseText.length === 0) {
        return {
          accepted: true,
          responseStatus: response.status,
        };
      }

      let responseBody: RunnerDispatchResponse;

      try {
        responseBody = JSON.parse(responseText) as RunnerDispatchResponse;
      } catch (error) {
        throw new Error(
          `Runner dispatch returned invalid JSON: ${describeError(error)}`,
        );
      }

      if (responseBody.accepted === false) {
        throw new Error("Runner dispatch response was accepted=false");
      }

      return {
        accepted: responseBody.accepted ?? true,
        responseStatus: response.status,
      };
    },
  };
}
