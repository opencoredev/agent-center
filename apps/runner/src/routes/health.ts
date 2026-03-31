import { SERVICE_NAMES, type HealthPayload } from "@agent-center/shared";

export function handleHealthRequest() {
  const payload: HealthPayload = {
    service: SERVICE_NAMES.runner,
    status: "ok",
    timestamp: new Date().toISOString(),
  };

  return Response.json(payload);
}
