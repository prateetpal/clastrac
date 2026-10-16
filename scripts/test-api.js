const assert = require("node:assert/strict");
const dns = require("node:dns");
const mongoose = require("mongoose");
require("dotenv").config();

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const baseUrl = (process.argv[2] || process.env.API_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const runId = `${Date.now()}-${process.pid}`;
const users = [
  {
    name: "ClasTrac API Test",
    email: `clastrac-api-test-${runId}@example.invalid`,
    password: "ApiTestPassword123!"
  },
  {
    name: "ClasTrac API Test Other",
    email: `clastrac-api-test-other-${runId}@example.invalid`,
    password: "ApiTestPassword456!"
  }
];

let passed = 0;
let failed = 0;
let primaryCookie;
let otherCookie;
let primaryUserId;
let subjectId;
let concurrentSubjectId;
let otherSubjectId;

async function request(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function cookieFrom(response) {
  const value = response.headers.get("set-cookie") || "";
  const match = value.match(/(?:^|,\s*)clastrac_session=([^;]*)/);
  assert.ok(match, "response should set the session cookie");
  return `clastrac_session=${match[1]}`;
}

async function check(label, run) {
  try {
    await run();
    passed += 1;
    console.log(`PASS ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${label}: ${error.message}`);
  }
}

async function expectStatus(response, status) {
  assert.equal(response.status, status, `expected HTTP ${status}, received ${response.status}`);
}

async function json(response) {
  return response.json();
}

async function cleanup() {
  const database = mongoose.connection.db;
  if (!database) throw new Error("Database connection unavailable during cleanup");

  const usersCollection = database.collection("users");
  const subjectsCollection = database.collection("subjects");
  const logsCollection = database.collection("attendancelogs");
  for (const testUser of users) {
    const user = await usersCollection.findOne({ email: testUser.email });
    if (!user) continue;
    await logsCollection.deleteMany({ userId: user._id });
    await subjectsCollection.deleteMany({ userId: user._id });
    await usersCollection.deleteOne({ _id: user._id });
  }
}

async function main() {
  const health = await request("/api/health/db");
  await check("GET /api/health/db reports connected", async () => {
    await expectStatus(health, 200);
    assert.equal((await json(health)).status, "connected");
  });
  await check("POST /api/health/db is rejected", async () => {
    await expectStatus(
      await request("/api/health/db", { method: "POST" }),
      405
    );
  });

  await check("GET /api/auth/signup is rejected", async () => {
    await expectStatus(await request("/api/auth/signup"), 405);
  });
  await check("invalid signup payload is rejected", async () => {
    await expectStatus(
      await request("/api/auth/signup", {
        method: "POST",
        body: { name: " ", email: "bad-email", password: "short" }
      }),
      400
    );
  });
  await check("signup creates a user and session", async () => {
    const response = await request("/api/auth/signup", {
      method: "POST",
      body: { ...users[0], name: ` ${users[0].name} `, email: ` ${users[0].email} ` }
    });
    await expectStatus(response, 201);
    const result = await json(response);
    assert.equal(result.user.name, users[0].name);
    assert.equal(result.user.email, users[0].email);
    assert.ok(result.user.id);
    primaryUserId = result.user.id;
    primaryCookie = cookieFrom(response);
    assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
    const persistedUser = await mongoose.connection.db
      .collection("users")
      .findOne({ _id: new mongoose.Types.ObjectId(primaryUserId) });
    assert.equal(persistedUser.email, users[0].email);
    assert.equal(persistedUser.name, users[0].name);
    assert.ok(persistedUser.passwordHash);
  });
  await check("duplicate signup returns conflict", async () => {
    await expectStatus(
      await request("/api/auth/signup", { method: "POST", body: users[0] }),
      409
    );
  });

  await check("GET /api/auth/login is rejected", async () => {
    await expectStatus(await request("/api/auth/login"), 405);
  });
  await check("invalid login payload is rejected", async () => {
    await expectStatus(
      await request("/api/auth/login", { method: "POST", body: { email: "bad", password: "" } }),
      400
    );
  });
  await check("wrong password is rejected", async () => {
    await expectStatus(
      await request("/api/auth/login", {
        method: "POST",
        body: { email: users[0].email, password: "IncorrectPassword!" }
      }),
      401
    );
  });
  await check("login succeeds", async () => {
    const response = await request("/api/auth/login", {
      method: "POST",
      body: { email: users[0].email.toUpperCase(), password: users[0].password }
    });
    await expectStatus(response, 200);
    assert.equal((await json(response)).user.email, users[0].email);
    primaryCookie = cookieFrom(response);
  });
  await check("GET /api/auth/me requires a session", async () => {
    await expectStatus(await request("/api/auth/me"), 401);
  });
  await check("GET /api/auth/me returns the current user", async () => {
    const response = await request("/api/auth/me", { cookie: primaryCookie });
    await expectStatus(response, 200);
    assert.equal((await json(response)).user.email, users[0].email);
  });
  await check("POST /api/auth/me is rejected", async () => {
    await expectStatus(
      await request("/api/auth/me", { method: "POST", cookie: primaryCookie }),
      405
    );
  });

  await check("unauthenticated subject list is rejected", async () => {
    await expectStatus(await request("/api/subjects"), 401);
  });
  await check("unauthenticated subject creation is rejected", async () => {
    await expectStatus(
      await request("/api/subjects", { method: "POST", body: { name: "No session" } }),
      401
    );
  });
  await check("unsupported subject collection method is rejected", async () => {
    await expectStatus(
      await request("/api/subjects", { method: "PUT", cookie: primaryCookie }),
      405
    );
  });
  await check("authenticated subject list starts empty", async () => {
    const response = await request("/api/subjects", { cookie: primaryCookie });
    await expectStatus(response, 200);
    assert.deepEqual((await json(response)).subjects, []);
  });
  await check("invalid subject fields are rejected", async () => {
    await expectStatus(
      await request("/api/subjects", {
        method: "POST",
        cookie: primaryCookie,
        body: { name: "Math", targetPercentage: 101 }
      }),
      400
    );
    await expectStatus(
      await request("/api/subjects", {
        method: "POST",
        cookie: primaryCookie,
        body: { name: "Math", attendedClasses: 2, totalClasses: 1 }
      }),
      400
    );
  });
  await check("subject creation applies defaults", async () => {
    const response = await request("/api/subjects", {
      method: "POST",
      cookie: primaryCookie,
      body: { name: "  Mathematics  " }
    });
    await expectStatus(response, 201);
    const subject = (await json(response)).subject;
    assert.equal(subject.name, "Mathematics");
    assert.equal(subject.targetPercentage, 75);
    assert.equal(subject.attendedClasses, 0);
    assert.equal(subject.totalClasses, 0);
    subjectId = subject.id;
    const persistedSubject = await mongoose.connection.db
      .collection("subjects")
      .findOne({ _id: new mongoose.Types.ObjectId(subjectId) });
    assert.equal(persistedSubject.userId.toString(), primaryUserId);
    assert.equal(persistedSubject.name, "Mathematics");
  });

  await check("concurrent attendance marks preserve both database writes", async () => {
    const createResponse = await request("/api/subjects", {
      method: "POST",
      cookie: primaryCookie,
      body: { name: "Concurrent attendance" }
    });
    await expectStatus(createResponse, 201);
    concurrentSubjectId = (await json(createResponse)).subject.id;

    const responses = await Promise.all([
      request(`/api/subjects/${concurrentSubjectId}/mark`, {
        method: "POST",
        cookie: primaryCookie,
        body: { status: "Present", date: "2026-10-20" }
      }),
      request(`/api/subjects/${concurrentSubjectId}/mark`, {
        method: "POST",
        cookie: primaryCookie,
        body: { status: "Absent", date: "2026-10-21" }
      })
    ]);
    for (const response of responses) await expectStatus(response, 200);

    const persistedSubject = await mongoose.connection.db
      .collection("subjects")
      .findOne({ _id: new mongoose.Types.ObjectId(concurrentSubjectId) });
    assert.equal(persistedSubject.attendedClasses, 1);
    assert.equal(persistedSubject.totalClasses, 2);
    assert.equal(
      await mongoose.connection.db.collection("attendancelogs").countDocuments({
        subjectId: new mongoose.Types.ObjectId(concurrentSubjectId)
      }),
      2
    );

    await expectStatus(
      await request(`/api/subjects/${concurrentSubjectId}`, {
        method: "DELETE",
        cookie: primaryCookie
      }),
      200
    );
  });

  await check("GET /api/subjects/:id rejects invalid ID", async () => {
    await expectStatus(
      await request("/api/subjects/not-an-id", { cookie: primaryCookie }),
      400
    );
  });
  await check("GET /api/subjects returns created subject", async () => {
    const response = await request("/api/subjects", { cookie: primaryCookie });
    await expectStatus(response, 200);
    const subjects = (await json(response)).subjects;
    assert.equal(subjects.length, 1);
    assert.equal(subjects[0].id, subjectId);
    assert.deepEqual(subjects[0].logs, []);
  });
  await check("marking attendance requires a session", async () => {
    await expectStatus(
      await request(`/api/subjects/${subjectId}/mark`, {
        method: "POST",
        body: { status: "Present", date: "2026-10-16" }
      }),
      401
    );
  });
  await check("attendance rejects invalid ID, status, and calendar date", async () => {
    await expectStatus(
      await request("/api/subjects/not-an-id/mark", {
        method: "POST",
        cookie: primaryCookie,
        body: { status: "Present", date: "2026-10-16" }
      }),
      400
    );
    await expectStatus(
      await request(`/api/subjects/${subjectId}/mark`, {
        method: "POST",
        cookie: primaryCookie,
        body: { status: "Late", date: "2026-10-16" }
      }),
      400
    );
    await expectStatus(
      await request(`/api/subjects/${subjectId}/mark`, {
        method: "POST",
        cookie: primaryCookie,
        body: { status: "Present", date: "2026-02-30" }
      }),
      400
    );
  });
  await check("GET attendance mark endpoint is rejected", async () => {
    await expectStatus(
      await request(`/api/subjects/${subjectId}/mark`, { cookie: primaryCookie }),
      405
    );
  });
  await check("GET attendance undo endpoint is rejected", async () => {
    await expectStatus(
      await request(`/api/subjects/${subjectId}/undo`, { cookie: primaryCookie }),
      405
    );
  });
  await check("present attendance increments both counts", async () => {
    const response = await request(`/api/subjects/${subjectId}/mark`, {
      method: "POST",
      cookie: primaryCookie,
      body: { status: "Present", date: "2026-10-16" }
    });
    await expectStatus(response, 200);
    const result = await json(response);
    assert.equal(result.subject.attendedClasses, 1);
    assert.equal(result.subject.totalClasses, 1);
    assert.ok(result.log.id);
    const persistedSubject = await mongoose.connection.db
      .collection("subjects")
      .findOne({ _id: new mongoose.Types.ObjectId(subjectId) });
    assert.equal(persistedSubject.attendedClasses, 1);
    assert.equal(persistedSubject.totalClasses, 1);
    const persistedLog = await mongoose.connection.db
      .collection("attendancelogs")
      .findOne({ _id: new mongoose.Types.ObjectId(result.log.id) });
    assert.equal(persistedLog.subjectId.toString(), subjectId);
    assert.equal(persistedLog.status, "Present");
    assert.equal(persistedLog.date, "2026-10-16");
  });
  await check("absent attendance increments total only", async () => {
    const response = await request(`/api/subjects/${subjectId}/mark`, {
      method: "POST",
      cookie: primaryCookie,
      body: { status: "Absent", date: "2026-10-17" }
    });
    await expectStatus(response, 200);
    const result = await json(response);
    assert.equal(result.subject.attendedClasses, 1);
    assert.equal(result.subject.totalClasses, 2);
    const persistedSubject = await mongoose.connection.db
      .collection("subjects")
      .findOne({ _id: new mongoose.Types.ObjectId(subjectId) });
    assert.equal(persistedSubject.attendedClasses, 1);
    assert.equal(persistedSubject.totalClasses, 2);
    assert.equal(
      await mongoose.connection.db.collection("attendancelogs").countDocuments({
        subjectId: new mongoose.Types.ObjectId(subjectId)
      }),
      2
    );
  });
  await check("subject list includes attendance logs", async () => {
    const response = await request("/api/subjects", { cookie: primaryCookie });
    const subject = (await json(response)).subjects[0];
    assert.equal(subject.logs.length, 2);
    assert.deepEqual(
      subject.logs.map(({ status }) => status).sort(),
      ["Absent", "Present"]
    );
  });
  await check("undo removes latest attendance and adjusts counts", async () => {
    const response = await request(`/api/subjects/${subjectId}/undo`, {
      method: "POST",
      cookie: primaryCookie
    });
    await expectStatus(response, 200);
    const result = await json(response);
    assert.ok(result.undone.id);
    assert.equal(result.undone.date, "2026-10-17");
    assert.equal(result.undone.status, "Absent");
    assert.equal(result.subject.attendedClasses, 1);
    assert.equal(result.subject.totalClasses, 1);
    const persistedSubject = await mongoose.connection.db
      .collection("subjects")
      .findOne({ _id: new mongoose.Types.ObjectId(subjectId) });
    assert.equal(persistedSubject.attendedClasses, 1);
    assert.equal(persistedSubject.totalClasses, 1);
    assert.equal(
      await mongoose.connection.db.collection("attendancelogs").countDocuments({
        subjectId: new mongoose.Types.ObjectId(subjectId)
      }),
      1
    );
  });
  await check("undo rejects when there are no marks left", async () => {
    await expectStatus(
      await request(`/api/subjects/${subjectId}/undo`, {
        method: "POST",
        cookie: primaryCookie
      }),
      200
    );
    await expectStatus(
      await request(`/api/subjects/${subjectId}/undo`, {
        method: "POST",
        cookie: primaryCookie
      }),
      400
    );
    const persistedSubject = await mongoose.connection.db
      .collection("subjects")
      .findOne({ _id: new mongoose.Types.ObjectId(subjectId) });
    assert.equal(persistedSubject.attendedClasses, 0);
    assert.equal(persistedSubject.totalClasses, 0);
    assert.equal(
      await mongoose.connection.db.collection("attendancelogs").countDocuments({
        subjectId: new mongoose.Types.ObjectId(subjectId)
      }),
      0
    );
  });

  await check("patch validates ID, fields, and missing subjects", async () => {
    await expectStatus(
      await request("/api/subjects/not-an-id", {
        method: "PATCH",
        cookie: primaryCookie,
        body: { name: "Changed" }
      }),
      400
    );
    await expectStatus(
      await request(`/api/subjects/${subjectId}`, {
        method: "PATCH",
        cookie: primaryCookie,
        body: {}
      }),
      400
    );
    await expectStatus(
      await request(`/api/subjects/${subjectId}`, {
        method: "PATCH",
        cookie: primaryCookie,
        body: { targetPercentage: 101 }
      }),
      400
    );
    await expectStatus(
      await request(`/api/subjects/${new mongoose.Types.ObjectId()}`, {
        method: "PATCH",
        cookie: primaryCookie,
        body: { name: "Missing" }
      }),
      404
    );
  });
  await check("subject patch updates valid fields", async () => {
    const response = await request(`/api/subjects/${subjectId}`, {
      method: "PATCH",
      cookie: primaryCookie,
      body: { name: "Calculus", targetPercentage: 82 }
    });
    await check("DELETE of a missing subject returns not found", async () => {
      await expectStatus(
        await request(`/api/subjects/${new mongoose.Types.ObjectId()}`, {
          method: "DELETE",
          cookie: primaryCookie
        }),
        404
      );
    });
    await expectStatus(response, 200);
    const result = (await json(response)).subject;
    assert.equal(result.name, "Calculus");
    assert.equal(result.targetPercentage, 82);
    const persistedSubject = await mongoose.connection.db
      .collection("subjects")
      .findOne({ _id: new mongoose.Types.ObjectId(subjectId) });
    assert.equal(persistedSubject.name, "Calculus");
    assert.equal(persistedSubject.targetPercentage, 82);
  });
  await check("unsupported authenticated subject method is rejected", async () => {
    await expectStatus(
      await request(`/api/subjects/${subjectId}`, {
        method: "PUT",
        cookie: primaryCookie
      }),
      405
    );
  });
  await check("marking a missing subject returns not found", async () => {
    await expectStatus(
      await request(`/api/subjects/${new mongoose.Types.ObjectId()}/mark`, {
        method: "POST",
        cookie: primaryCookie,
        body: { status: "Present", date: "2026-10-16" }
      }),
      404
    );
  });
  await check("undo on a missing subject returns not found", async () => {
    await expectStatus(
      await request(`/api/subjects/${new mongoose.Types.ObjectId()}/undo`, {
        method: "POST",
        cookie: primaryCookie
      }),
      404
    );
  });

  await check("second account can be created for ownership checks", async () => {
    const response = await request("/api/auth/signup", {
      method: "POST",
      body: users[1]
    });
    await expectStatus(response, 201);
    otherCookie = cookieFrom(response);
  });
  await check("another account cannot modify or delete the subject", async () => {
    const createResponse = await request("/api/subjects", {
      method: "POST",
      cookie: otherCookie,
      body: { name: "Private Subject" }
    });
    await expectStatus(createResponse, 201);
    otherSubjectId = (await json(createResponse)).subject.id;
    for (const [method, body] of [
      ["PATCH", { name: "Intruded" }],
      ["DELETE", undefined]
    ]) {
      await expectStatus(
        await request(`/api/subjects/${subjectId}`, {
          method,
          cookie: otherCookie,
          body
        }),
        404
      );
    }
    await expectStatus(
      await request(`/api/subjects/${otherSubjectId}`, {
        method: "DELETE",
        cookie: primaryCookie
      }),
      404
    );
    await expectStatus(
      await request(`/api/subjects/${subjectId}/mark`, {
        method: "POST",
        cookie: otherCookie,
        body: { status: "Present", date: "2026-10-18" }
      }),
      404
    );
    await expectStatus(
      await request(`/api/subjects/${subjectId}/undo`, {
        method: "POST",
        cookie: otherCookie
      }),
      404
    );
  });
  await check("delete removes owned subject and its logs", async () => {
    await expectStatus(
      await request(`/api/subjects/${subjectId}/mark`, {
        method: "POST",
        cookie: primaryCookie,
        body: { status: "Present", date: "2026-10-19" }
      }),
      200
    );
    const response = await request(`/api/subjects/${subjectId}`, {
      method: "DELETE",
      cookie: primaryCookie
    });
    await expectStatus(response, 200);
    assert.equal((await json(response)).success, true);
    assert.equal(
      await mongoose.connection.db.collection("subjects").countDocuments({
        _id: new mongoose.Types.ObjectId(subjectId)
      }),
      0
    );
    await expectStatus(
      await request(`/api/subjects/${subjectId}`, {
        method: "PATCH",
        cookie: primaryCookie,
        body: { name: "Deleted" }
      }),
      404
    );
    const list = await request("/api/subjects", { cookie: primaryCookie });
    assert.deepEqual((await json(list)).subjects, []);
    const remainingLogs = await mongoose.connection.db
      .collection("attendancelogs")
      .countDocuments({ subjectId: new mongoose.Types.ObjectId(subjectId) });
    assert.equal(remainingLogs, 0);
  });
  await check("logout clears session and invalidates it", async () => {
    await expectStatus(
      await request("/api/auth/logout", { method: "GET" }),
      405
    );
    const response = await request("/api/auth/logout", {
      method: "POST",
      cookie: primaryCookie
    });
    await expectStatus(response, 200);
    assert.match(response.headers.get("set-cookie"), /Max-Age=0/i);
    const clearedCookie = cookieFrom(response);
    await expectStatus(
      await request("/api/auth/me", { cookie: clearedCookie }),
      401
    );
  });
}

(async () => {
  try {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not configured");
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    await main();
  } catch (error) {
    failed += 1;
    console.error(`FAIL test runner: ${error.message}`);
  } finally {
    try {
      await cleanup();
      console.log("Cleaned up temporary API test users, subjects, and attendance logs.");
    } catch (error) {
      failed += 1;
      console.error(`FAIL cleanup: ${error.code || error.name}`);
    }
    await mongoose.disconnect().catch((error) => {
      failed += 1;
      console.error(`FAIL database disconnect: ${error.message}`);
    });
    console.log(`API integration tests: ${passed} passed, ${failed} failed.`);
    if (failed) process.exitCode = 1;
  }
})();
