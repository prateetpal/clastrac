import bcrypt from "bcryptjs";
import type { NextApiRequest, NextApiResponse } from "next";
import { apiHandler, methodNotAllowed } from "@/lib/api";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/lib/models";
import { signupSchema } from "@/lib/validation";

export default apiHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  const input = signupSchema.parse(req.body);
  await connectToDatabase();

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await User.create({
    name: input.name,
    email: input.email.toLowerCase(),
    passwordHash
  });
  const token = await createSessionToken(user.id);
  setSessionCookie(res, token);

  res.status(201).json({
    user: { id: user.id, name: user.name, email: user.email }
  });
});
