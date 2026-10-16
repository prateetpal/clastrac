import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { ZodError } from "zod";

export function apiHandler(handler: NextApiHandler): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("Vary", "Cookie");

    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: "Invalid request",
          details: error.issues.map(({ path, message }) => ({
            path: path.join("."),
            message
          }))
        });
        return;
      }

      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
      ) {
        res.status(409).json({ error: "An account with this email already exists" });
        return;
      }

      console.error("API request failed", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

export function methodNotAllowed(
  res: NextApiResponse,
  allowedMethods: string[]
): void {
  res.setHeader("Allow", allowedMethods);
  res.status(405).json({ error: "Method not allowed" });
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}
