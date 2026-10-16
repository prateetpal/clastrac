import type { NextApiRequest, NextApiResponse } from "next";
import { apiHandler, methodNotAllowed } from "@/lib/api";
import { clearSessionCookie } from "@/lib/auth";

export default apiHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  clearSessionCookie(res);
  res.status(200).json({ success: true });
});
