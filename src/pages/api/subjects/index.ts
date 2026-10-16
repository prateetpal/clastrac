import type { NextApiRequest, NextApiResponse } from "next";
import { apiHandler, methodNotAllowed } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { AttendanceLog, Subject } from "@/lib/models";
import { createSubjectSchema } from "@/lib/validation";

export default apiHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  const userId = await requireSession(req, res);
  if (!userId) return;

  await connectToDatabase();

  if (req.method === "GET") {
    const subjects = await Subject.find({ userId }).sort({ createdAt: 1 }).lean();
    const logs = subjects.length
      ? await AttendanceLog.find({ userId, subjectId: { $in: subjects.map(({ _id }) => _id) } })
          .sort({ date: -1, createdAt: -1 })
          .lean()
      : [];
    const logsBySubject = new Map<string, typeof logs>();
    for (const log of logs) {
      const subjectId = log.subjectId.toString();
      const subjectLogs = logsBySubject.get(subjectId) ?? [];
      subjectLogs.push(log);
      logsBySubject.set(subjectId, subjectLogs);
    }

    res.status(200).json({
      subjects: subjects.map((subject) => ({
        id: subject._id.toString(),
        name: subject.name,
        targetPercentage: subject.targetPercentage,
        attendedClasses: subject.attendedClasses,
        totalClasses: subject.totalClasses,
        createdAt: subject.createdAt,
        logs: (logsBySubject.get(subject._id.toString()) ?? []).map((log) => ({
          id: log._id.toString(),
          date: log.date,
          status: log.status
        }))
      }))
    });
    return;
  }

  if (req.method === "POST") {
    const input = createSubjectSchema.parse(req.body);
    const subject = await Subject.create({ ...input, userId });
    res.status(201).json({
      subject: {
        id: subject.id,
        name: subject.name,
        targetPercentage: subject.targetPercentage,
        attendedClasses: subject.attendedClasses,
        totalClasses: subject.totalClasses,
        createdAt: subject.createdAt,
        logs: []
      }
    });
    return;
  }

  methodNotAllowed(res, ["GET", "POST"]);
});
