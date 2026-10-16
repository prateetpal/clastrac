import mongoose from "mongoose";
import type { NextApiRequest, NextApiResponse } from "next";
import { apiHandler, methodNotAllowed } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { AttendanceLog, Subject } from "@/lib/models";
import { updateSubjectSchema } from "@/lib/validation";

export default apiHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  const userId = await requireSession(req, res);
  if (!userId) return;

  const subjectId = req.query.id;
  if (typeof subjectId !== "string" || !mongoose.isValidObjectId(subjectId)) {
    res.status(400).json({ error: "Invalid subject id" });
    return;
  }

  await connectToDatabase();

  if (req.method === "PATCH") {
    const input = updateSubjectSchema.parse(req.body);
    const subject = await Subject.findOneAndUpdate(
      { _id: subjectId, userId },
      { $set: input },
      { new: true, runValidators: true }
    );
    if (!subject) {
      res.status(404).json({ error: "Subject not found" });
      return;
    }

    res.status(200).json({
      subject: {
        id: subject.id,
        name: subject.name,
        targetPercentage: subject.targetPercentage,
        attendedClasses: subject.attendedClasses,
        totalClasses: subject.totalClasses,
        createdAt: subject.createdAt
      }
    });
    return;
  }

  if (req.method === "DELETE") {
    const session = await mongoose.startSession();
    let deleted: boolean | undefined;
    try {
      deleted = await session.withTransaction(async () => {
        const subject = await Subject.findOne({ _id: subjectId, userId }).session(session);
        if (!subject) return false;
        await AttendanceLog.deleteMany({ subjectId, userId }, { session });
        await subject.deleteOne({ session });
        return true;
      });
    } finally {
      await session.endSession();
    }

    if (!deleted) {
      res.status(404).json({ error: "Subject not found" });
      return;
    }
    res.status(200).json({ success: true });
    return;
  }

  methodNotAllowed(res, ["PATCH", "DELETE"]);
});
