import mongoose from "mongoose";
import type { NextApiRequest, NextApiResponse } from "next";
import { apiHandler, methodNotAllowed } from "@/lib/api";
import { connectToDatabase } from "@/lib/db";

export default apiHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  try {
    await connectToDatabase();
    const database = mongoose.connection.db;
    if (!database) {
      res.status(503).json({ status: "disconnected" });
      return;
    }

    await database.admin().ping();
    res.status(200).json({ status: "connected" });
  } catch (error) {
    console.error("MongoDB health check failed", error);
    res.status(503).json({ status: "disconnected" });
  }
});
