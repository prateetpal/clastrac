# ClasTrac — Simple Attendance Tracker PRD
### Lightweight Web App (React + Tailwind CSS + Email Auth + Simple Database)

> **App Name:** ClasTrac  
> **Purpose:** A simple, free attendance tracker website with basic features only — no payments, no pricing tiers, and no unnecessary bloat.  
> **Core Goal:** Let users add their subjects, mark daily attendance (`Present` or `Absent`) in one click, and see their attendance percentage alongside a basic 75% target indicator.

## 1. Product Overview

**ClasTrac** is a straightforward web application designed to help students track their class attendance. Users sign in with their email, add their subjects, and click **`Present`** or **`Absent`** after each class. The app automatically calculates their subject-wise and overall attendance percentage and tells them if they are above or below their required target (default `75%`).

**What ClasTrac Includes (Basic Features Only):**
* **Simple Email Login / Signup:** Saves the user's subjects and attendance counts to their account.
* **Add / Edit / Delete Subjects:** Add a subject with just its **Subject Name** and **Target `%`** (default `75%`).
* **One-Click Attendance Marking:** Mark **`+ Present`** or **`+ Absent`** directly on the subject card, with an **`Undo`** button to fix accidental clicks.
* **Automatic Percentage & 75% Target Status:** Shows current attendance `%` (`Attended / Total Classes`) and a simple message: how many classes you can safely miss, or how many classes you need to attend to reach `75%`.
* **Basic Attendance History Log:** A simple list of dates marked `Present` or `Absent` for each subject.

**What ClasTrac Does NOT Include (Kept Out for Simplicity):**
* No payments, subscriptions, or pricing pages.
* No complex templates, signatures, currencies, or PDF/invoice builders.
* No multi-role admin panels or heavy enterprise settings.

## 2. Pages & Screen Structure (Only 3 Screens)

| Screen & Route | Components | Basic Functionality |
| :--- | :--- | :--- |
| **1. Home Page (`/`)** | **Header** + **Simple Hero** | Clean Header with **ClasTrac** logo and `Log In` / `Sign Up` buttons. Hero section with a short description (*"Track your class attendance simply in one place"*) and a **`Get Started`** button. |
| **2. Auth Page (`/login`, `/signup`)** | **Email & Password Form** | Simple form with `Name` (on signup), `Email`, and `Password` fields. Redirects straight to `/dashboard` after login. |
| **3. Dashboard (`/dashboard`)** | **Summary Bar** + **Subject Cards** + **History Modal** | Displays overall attendance `%`, the **`+ Add Subject`** button, and the list of Subject Cards where users mark `Present` or `Absent` and view past dates. |

## 3. Core Features & Simple Attendance Logic

### 3.1 Overall Summary Bar (Top of Dashboard)
Displays 3 simple numbers at the top of `/dashboard`:
* **Overall Attendance `%`:** `(Total Attended Across All Subjects / Total Classes Across All Subjects) * 100`
* **Total Classes:** `Attended / Total` (e.g., `42 / 50`)
* **Target Status:** Number of subjects meeting the `75%` requirement vs. falling short.

### 3.2 Subject Card (Main Component)
Each subject is shown as a clean card containing:
1. **Subject Name:** e.g., `Data Structures`
2. **Attendance Count & Percentage:** e.g., `18 / 22 classes` (`81.8%`) with a progress bar (`Green` if `>= 75%`, `Red` if `< 75%`).
3. **Simple 75% Helper Text:**
   * If `Attendance % >= Target %`: `"Safe: You can miss X more classes"`
     $$\text{Safe to Miss} = \left\lfloor \frac{100 \times \text{Attended} - \text{Target} \times \text{Total}}{\text{Target}} \right\rfloor$$
   * If `Attendance % < Target %`: `"Shortage: Attend next Y classes to reach 75%"`
     $$\text{Classes Needed} = \left\lceil \frac{\text{Target} \times \text{Total} - 100 \times \text{Attended}}{100 - \text{Target}} \right\rceil$$
4. **Action Buttons:**
   * **`+ Present` Button:** Adds `1` to `attended` and `1` to `total`, and records today's date as `Present`.
   * **`+ Absent` Button:** Adds `1` to `total` only, and records today's date as `Absent`.
   * **`Undo` / `History` / `Delete` Icons:** Undoes the last mark, opens the date history modal, or deletes the subject.

### 3.3 Add Subject Modal
A minimal popup form with only 3 inputs:
* **Subject Name** (Required, e.g., `Operating Systems`)
* **Target Percentage** (Optional, defaults to `75%`)
* **Initial Attended & Initial Total Classes** (Optional, defaults to `0` — helpful if a student starts tracking mid-semester)

## 4. Tech Stack (Simple & Lightweight)

| Layer | Choice | Purpose |
| :--- | :--- | :--- |
| **Frontend** | React (Next.js or Vite) + Tailwind CSS | Clean, responsive UI for Home, Login/Signup, and Dashboard |
| **Backend** | Next.js API Routes (or Lovable Cloud built-in backend) | Handles login, saving subjects, and updating attendance counts (**No Express.js**) |
| **Database** | MongoDB Atlas (or Lovable Cloud Database) | Stores `users`, `subjects`, and `attendance_logs` |
| **Auth** | Email & Password Only | Simple account login so each user sees only their own subjects |

## 5. Simple Database Schema

### 5.1 `users` Collection / Table
```typescript
interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}
```

### 5.2 `subjects` Collection / Table
```typescript
interface Subject {
  id: string;
  userId: string;
  name: string;              // e.g. "Operating Systems"
  targetPercentage: number;  // Default: 75
  attendedClasses: number;   // Default: 0
  totalClasses: number;      // Default: 0
  createdAt: Date;
}
```

### 5.3 `attendance_logs` Collection / Table
```typescript
interface AttendanceLog {
  id: string;
  subjectId: string;
  userId: string;
  date: string;              // e.g. "2026-10-16"
  status: 'Present' | 'Absent';
}
```

## 6. Basic API Endpoints

| Method & Endpoint | Description |
| :--- | :--- |
| `POST /api/auth/signup` | Create a new user account with Name, Email, and Password |
| `POST /api/auth/login` | Log in with Email and Password |
| `POST /api/auth/logout` | Log out of the current session |
| `GET /api/subjects` | Get all subjects belonging to the logged-in user |
| `POST /api/subjects` | Create a new subject (`name`, `targetPercentage`, `attendedClasses`, `totalClasses`) |
| `POST /api/subjects/:id/mark` | Mark attendance (`{ status: 'Present' | 'Absent', date }`) and update counts |
| `POST /api/subjects/:id/undo` | Remove the most recent attendance log for that subject and decrement counts |
| `DELETE /api/subjects/:id` | Delete a subject and its attendance logs |
