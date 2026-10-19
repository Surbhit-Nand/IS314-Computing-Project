import type { RequestHandler } from "express";
import { refreshVeterinaryAlerts } from "./veterinaryAlerts.service.js";
import { retryTransient } from "../../shared/retry/retry.js";

export function veterinaryAlertChanges(sync = refreshVeterinaryAlerts): RequestHandler {
  return (request, response, next) => {
    const changesQueue = ["/api/animals", "/api/veterinary", "/api/adoptions", "/api/admin"].some((prefix) => request.path === prefix || request.path.startsWith(prefix + "/"));
    if (changesQueue && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      // Successful backend writes only. Reads, bell polling and queue refresh
      // cannot send alerts. Notification failure must not fail saved care.
      response.once("finish", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return;
        void retryTransient(() => sync()).catch((error: unknown) => console.error("Veterinary alert synchronization failed", error));
      });
    }
    next();
  };
}
