import mongoose, { Model, Schema, Types } from "mongoose";

export interface UserRecord {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export interface SubjectRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  targetPercentage: number;
  attendedClasses: number;
  totalClasses: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttendanceLogRecord {
  _id: Types.ObjectId;
  subjectId: Types.ObjectId;
  userId: Types.ObjectId;
  date: string;
  status: "Present" | "Absent";
  createdAt: Date;
}

const userSchema = new Schema<UserRecord>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254
    },
    passwordHash: { type: String, required: true, select: false }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const subjectSchema = new Schema<SubjectRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    targetPercentage: { type: Number, required: true, min: 0, max: 100, default: 75 },
    attendedClasses: { type: Number, required: true, min: 0, default: 0 },
    totalClasses: { type: Number, required: true, min: 0, default: 0 }
  },
  { timestamps: true }
);

subjectSchema.index({ userId: 1, createdAt: 1 });

const attendanceLogSchema = new Schema<AttendanceLogRecord>(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true },
    status: { type: String, enum: ["Present", "Absent"], required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

attendanceLogSchema.index({ subjectId: 1, createdAt: -1 });

export const User: Model<UserRecord> =
  (mongoose.models.User as Model<UserRecord> | undefined) ??
  mongoose.model<UserRecord>("User", userSchema);

export const Subject: Model<SubjectRecord> =
  (mongoose.models.Subject as Model<SubjectRecord> | undefined) ??
  mongoose.model<SubjectRecord>("Subject", subjectSchema);

export const AttendanceLog: Model<AttendanceLogRecord> =
  (mongoose.models.AttendanceLog as Model<AttendanceLogRecord> | undefined) ??
  mongoose.model<AttendanceLogRecord>("AttendanceLog", attendanceLogSchema);
