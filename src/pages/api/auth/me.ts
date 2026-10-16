import type { NextApiRequest, NextApiResponse } from "next";
import { apiHandler, methodNotAllowed } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models";

export default apiHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const userId = await requireSession(req, res);
  if (!userId) return;

  await connectToDatabase();
  const user = await User.findById(userId).select("name email");
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  res.status(200).json({
    user: { id: user.id, name: user.name, email: user.email }
  });
});
