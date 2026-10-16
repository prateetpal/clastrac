const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "..", "src", "lib", "client-api.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS });
const clientModule = { exports: {} };
new Function("exports", "require", "module", compiled)(
  clientModule.exports,
  require,
  clientModule
);
const { getAttendanceStats } = clientModule.exports;

const cases = [
  {
    name: "zero classes avoids division by zero",
    subject: { attendedClasses: 0, totalClasses: 0, targetPercentage: 75 },
    expected: { percentage: 0, isSafe: true, message: "No classes recorded yet" }
  },
  {
    name: "safe skips uses the specified floor formula",
    subject: { attendedClasses: 18, totalClasses: 22, targetPercentage: 75 },
    expectedMessage: "Safe to miss 2 classes"
  },
  {
    name: "recovery uses the specified ceiling formula",
    subject: { attendedClasses: 14, totalClasses: 20, targetPercentage: 75 },
    expectedMessage: "Attend the next 4 classes to reach 75%"
  },
  {
    name: "100 percent target does not divide by zero",
    subject: { attendedClasses: 5, totalClasses: 10, targetPercentage: 100 },
    expectedMessage: "A 100% target can only be maintained by attending every class"
  },
  {
    name: "perfect attendance with a 100 percent target remains safe",
    subject: { attendedClasses: 10, totalClasses: 10, targetPercentage: 100 },
    expectedIsSafe: true
  },
  {
    name: "zero target is safe",
    subject: { attendedClasses: 0, totalClasses: 10, targetPercentage: 0 },
    expectedMessage: "No minimum attendance target"
  }
];

for (const testCase of cases) {
  const result = getAttendanceStats(testCase.subject);
  if (testCase.expected) assert.deepEqual(result, testCase.expected);
  if (testCase.expectedMessage) assert.equal(result.message, testCase.expectedMessage);
  if (testCase.expectedIsSafe !== undefined) assert.equal(result.isSafe, testCase.expectedIsSafe);
  console.log(`PASS ${testCase.name}`);
}

console.log(`Attendance math tests: ${cases.length} passed.`);
