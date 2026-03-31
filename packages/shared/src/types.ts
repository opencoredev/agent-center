import { SERVICE_NAMES } from "./constants";

export type ServiceName = (typeof SERVICE_NAMES)[keyof typeof SERVICE_NAMES];

export interface HealthPayload {
  service: ServiceName;
  status: "ok";
  timestamp: string;
}
