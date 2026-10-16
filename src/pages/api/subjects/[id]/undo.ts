import mongoose from "mongoose";
import type { NextApiRequest, NextApiResponse } from "next";
import { apiHandler, methodNotAllowed } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { AttendanceLog, Subject } from "@/lib/models";

type SubjectSummary = {
  id: string;
  name: string;
  targetPercentage: number;
  attendedClasses: number;
  totalClasses: number;
};

type UndoResult = {
  subject: SubjectSummary;
  log: { id: string; date: string; status: "Present" | "Absent" } | null;
};

function toSubjectSummary(subject: {
  _id: { toString(): string };
  name: string;
  targetPercentage: number;
  attendedClasses: number;
  totalClasses: number;
}): SubjectSummary {
  return {
    id: subject._id.toString(),
    name: subject.name,
    targetPercentage: subject.targetPercentage,
    attendedClasses: subject.attendedClasses,
    totalClasses: subject.totalClasses
  };
}

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

  await connectToDatabase();
  const session = await mongoose.startSession();
  let undoResult: UndoResult | null = null;

  try {
    undoResult = await session.withTransaction(async () => {
      const subject = await Subject.findOne({ _id: subjectId, userId }).session(session);
      if (!subject) return null;

      const latestLog = await AttendanceLog.findOne({ subjectId, userId })
        .sort({ createdAt: -1, _id: -1 })
        .session(session);
      if (!latestLog) {
        return { subject: toSubjectSummary(subject), log: null };
      }

      const log = { id: latestLog.id, date: latestLog.date, status: latestLog.status };
      await latestLog.deleteOne({ session });
      const decrements = {
        totalClasses: -1,
        ...(latestLog.status === "Present" ? { attendedClasses: -1 } : {})
      };
      const counterGuards = {
        totalClasses: { $gt: 0 },
        ...(latestLog.status === "Present" ? { attendedClasses: { $gt: 0 } } : {})
      };
      const updatedSubject = await Subject.findOneAndUpdate(
        { _id: subjectId, userId, ...counterGuards },
        { $inc: decrements },
        { new: true, runValidators: true, session }
      );
      if (!updatedSubject) {
        throw new Error("Attendance log and subject counters are inconsistent");
      }
      return { subject: toSubjectSummary(updatedSubject), log };
    });
  } finally {
    await session.endSession();
  }

  if (!undoResult) {
    res.status(404).json({ error: "Subject not found" });
    return;
  }
  if (!undoResult.log) {
    res.status(400).json({ error: "No attendance mark to undo" });
    return;
  }

  res.status(200).json({
    subject: undoResult.subject,
    undone: undoResult.log
  });
});
