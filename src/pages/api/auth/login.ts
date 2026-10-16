import bcrypt from "bcryptjs";
import type { NextApiRequest, NextApiResponse } from "next";
import { apiHandler, methodNotAllowed } from "@/lib/api";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models";
import { loginSchema } from "@/lib/validation";

export default apiHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  const input = loginSchema.parse(req.body);
  await connectToDatabase();

  const user = await User.findOne({ email: input.email.toLowerCase() }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = await createSessionToken(user.id);
  setSessionCookie(res, token);
  res.status(200).json({
    user: { id: user.id, name: user.name, email: user.email }
  });
});
