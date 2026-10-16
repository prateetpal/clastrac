import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be no more than 72 characters")
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "Password must be no more than 72 bytes"
  });

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: passwordSchema
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1)
});

const attendanceCount = z.number().int().min(0).max(1000000);

export const createSubjectSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    targetPercentage: z.number().min(0).max(100).default(75),
    attendedClasses: attendanceCount.default(0),
    totalClasses: attendanceCount.default(0)
  })
  .refine((subject) => subject.attendedClasses <= subject.totalClasses, {
    path: ["attendedClasses"],
    message: "Attended classes cannot exceed total classes"
  });

export const updateSubjectSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    targetPercentage: z.number().min(0).max(100).optional()
  })
  .refine((subject) => subject.name !== undefined || subject.targetPercentage !== undefined, {
    message: "At least one subject field must be provided"
  });

export const markAttendanceSchema = z.object({
  status: z.enum(["Present", "Absent"]),
  date: z.string().refine((date) => /^\d{4}-\d{2}-\d{2}$/.test(date), {
    message: "Date must use YYYY-MM-DD format"
  })
});
