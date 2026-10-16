export type AttendanceLog = {
  id: string;
  date: string;
  status: "Present" | "Absent";
};

export type Subject = {
  id: string;
  name: string;
  targetPercentage: number;
  attendedClasses: number;
  totalClasses: number;
  createdAt: string;
  logs: AttendanceLog[];
};

export type User = {
  id: string;
  name: string;
  email: string;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    credentials: "same-origin",
    headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (typeof data.error === "string") message = data.error;
      else if (Array.isArray(data.details)) {
        message = data.details.map((detail: { message?: string }) => detail.message).filter(Boolean).join(". ");
      }
    } catch {
      // Keep the HTTP status message when the server did not return JSON.
    }
    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export function getAttendanceStats(subject: Pick<
  Subject,
  "attendedClasses" | "totalClasses" | "targetPercentage"
>) {
  const { attendedClasses: attended, totalClasses: total, targetPercentage: target } = subject;
  const percentage = total === 0 ? 0 : (attended / total) * 100;
  const isSafe = total === 0 || percentage >= target;

  if (total === 0) {
    return {
      percentage,
      isSafe,
      message: "No classes recorded yet"
    };
  }
  if (target <= 0) {
    return {
      percentage,
      isSafe: true,
      message: "No minimum attendance target"
    };
  }
  if (isSafe) {
    const safeSkips = Math.max(0, Math.floor((100 * attended - target * total) / target));
    return {
      percentage,
      isSafe,
      message: safeSkips > 0
        ? `Safe to miss ${safeSkips} ${safeSkips === 1 ? "class" : "classes"}`
        : "On the edge — attend your next class"
    };
  }

  if (target >= 100) {
    return {
      percentage,
      isSafe: false,
      message: "A 100% target can only be maintained by attending every class"
    };
  }

  const denominator = Math.max(1, 100 - target);
  const needed = Math.max(1, Math.ceil((target * total - 100 * attended) / denominator));
  return {
    percentage,
    isSafe,
    message: `Attend the next ${needed} ${needed === 1 ? "class" : "classes"} to reach ${target}%`
  };
}
