import mongoose from "mongoose";
import type { NextApiRequest, NextApiResponse } from "next";
import { apiHandler, isValidDate, methodNotAllowed } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { AttendanceLog, Subject } from "@/lib/models";
import { markAttendanceSchema } from "@/lib/validation";

type SubjectSummary = {
  id: string;
  name: string;
  targetPercentage: number;
  attendedClasses: number;
  totalClasses: number;
};

type MarkResult = {
  subject: SubjectSummary;
  log: { id: string; date: string; status: "Present" | "Absent" };
};

export default apiHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  const userId = await requireSession(req, res);
  if (!userId) return;

  const subjectId = req.query.id;
  if (typeof subjectId !== "string" || !mongoose.isValidObjectId(subjectId)) {
    res.status(400).json({ error: "Invalid subject id" });
    return;
  }

  const input = markAttendanceSchema.parse(req.body);
  if (!isValidDate(input.date)) {
    res.status(400).json({ error: "Date must be a valid calendar date" });
    return;
  }

  await connectToDatabase();
  const session = await mongoose.startSession();
  let markResult: MarkResult | null = null;

  try {
    markResult = await session.withTransaction(async () => {
      const increments = {
        totalClasses: 1,
        ...(input.status === "Present" ? { attendedClasses: 1 } : {})
      };
      const subject = await Subject.findOneAndUpdate(
        { _id: subjectId, userId },
        { $inc: increments },
        { new: true, runValidators: true, session }
      );
      if (!subject) return null;

      const [log] = await AttendanceLog.create(
        [{ subjectId, userId, date: input.date, status: input.status }],
        { session }
      );
      return {
        subject: {
          id: subject.id,
          name: subject.name,
          targetPercentage: subject.targetPercentage,
          attendedClasses: subject.attendedClasses,
          totalClasses: subject.totalClasses
        },
        log: { id: log.id, date: log.date, status: log.status }
      };
    });
  } finally {
    await session.endSession();
  }

  if (!markResult) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }

  res.status(200).json(markResult);
});
