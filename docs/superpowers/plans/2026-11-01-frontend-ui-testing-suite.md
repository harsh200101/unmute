# Frontend UI Testing & Bug Detection Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide an automated 3-tool frontend UI testing suite that opens Chromium in real browser mode, detects minor and major UI/UX shortcomings, and writes structured feedback reports with actionable remediation tips.

**Architecture:** A standalone audit framework under `frontend/scripts/ui-audit/` utilizing Playwright and Axe-Core, orchestrated via npm scripts in `frontend/package.json`. It runs headless or headed, captures multi-viewport screenshots, inspects console errors, measures overflow/layout shifts, evaluates accessibility/usability defects down to WCAG AAA contrast, and runs an AI Vision inspection script.

**Tech Stack:** Node.js, Playwright (`playwright`, `@axe-core/playwright`), JavaScript ESM.

**Spec:** `docs/superpowers/specs/2026-11-01-frontend-ui-testing-suite-design.md`

## Global Constraints
- Must run cleanly against `frontend` (Vite dev server, typically `http://localhost:5173`).
- All scripts must output machine-readable and human-readable feedback in `frontend/ui-reports/`.
- Must never suppress minor warnings or inconveniences (e.g. low contrast, missing alt text, tiny tap targets, overflow-x).

## Review Focus
- Unreachable local server when dev server is offline (clear, friendly diagnostic error message).
- Element layout shifts causing unexpected horizontal scrolling on mobile (`375px`).
- Silent JavaScript errors or unhandled promise rejections during navigation.
- Missing labels or inaccessible interactive elements (icon-only buttons).
- Handling pages requiring authentication gracefully with clear route configuration.

---

### Task 1: Environment & Dependency Setup

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/scripts/ui-audit/config.mjs`

**Interfaces:**
- Produces: `config.mjs` exporting default audit targets (`BASE_URL`, `VIEWPORTS`, `OUTPUT_DIR`).

- [ ] **Step 1: Install Playwright and Axe-Core dependencies in `frontend`**
Run: `npm install -D playwright @axe-core/playwright` in `frontend/`
- [ ] **Step 2: Create audit configuration module `frontend/scripts/ui-audit/config.mjs`**
Define target routes (e.g., `/`, `/login`, `/explore`), standard viewports (Mobile: 375x667, Tablet: 768x1024, Desktop: 1440x900), and report directory `frontend/ui-reports/`.
- [ ] **Step 3: Add npm script entries in `frontend/package.json`**
Add scripts: `test:ui:axe`, `test:ui:viewport`, `test:ui:vision`, and `test:ui:all`.

---

### Task 2: Tool 1 - Axe-Core Usability & Accessibility Auditor

**Files:**
- Create: `frontend/scripts/ui-audit/run-axe-audit.mjs`
- Test Output: `frontend/ui-reports/axe-audit-report.json`, `frontend/ui-reports/axe-audit-summary.md`

**Interfaces:**
- Consumes: `config.mjs` (`BASE_URL`, `TARGET_ROUTES`, `OUTPUT_DIR`)
- Produces: Detailed report of micro-inconveniences (contrast, touch targets, missing ARIA tags, button labels) categorized by impact: Minor, Moderate, Serious, Critical.

- [ ] **Step 1: Implement `run-axe-audit.mjs`**
Launch Playwright Chromium, navigate to each configured route, inject Axe-Core with full rule set (including minor/best-practice rules), and collect violations.
- [ ] **Step 2: Format and save human-readable Markdown summary and raw JSON report**
Write results to `frontend/ui-reports/axe-audit-summary.md` with exact HTML snippets, failure reasons, and remediation suggestions.
- [ ] **Step 3: Verify execution with dry run or live local server**
Run: `node frontend/scripts/ui-audit/run-axe-audit.mjs`
Verify it produces report files in `frontend/ui-reports/`.

---

### Task 3: Tool 2 - Multi-Viewport & Layout Shift / Console Error Inspector

**Files:**
- Create: `frontend/scripts/ui-audit/run-viewport-audit.mjs`
- Test Output: `frontend/ui-reports/screenshots/`, `frontend/ui-reports/viewport-audit-report.md`

**Interfaces:**
- Consumes: `config.mjs` (`BASE_URL`, `VIEWPORTS`, `OUTPUT_DIR`)
- Produces: Viewport overflow metrics (`document.documentElement.scrollWidth > window.innerWidth`), console errors/warnings captured via `page.on('console')`, and full-page screenshots for each breakpoint.

- [ ] **Step 1: Implement `run-viewport-audit.mjs`**
Configure listeners for console warnings, uncaught page exceptions, and 404 network requests.
Iterate through viewports (Mobile: 375px, Tablet: 768px, Desktop: 1440px).
Measure horizontal overflow (`scrollWidth > clientWidth`) to detect unintentional horizontal scrolling bugs.
- [ ] **Step 2: Capture screenshots and generate markdown report**
Save screenshots to `frontend/ui-reports/screenshots/<viewport>-<route>.png` and write findings into `frontend/ui-reports/viewport-audit-report.md`.
- [ ] **Step 3: Verify execution**
Run: `node frontend/scripts/ui-audit/run-viewport-audit.mjs`
Confirm report and screenshots are generated.

---

### Task 4: Tool 3 - AI Vision UI Inspector

**Files:**
- Create: `frontend/scripts/ui-audit/run-vision-audit.mjs`
- Test Output: `frontend/ui-reports/vision-audit-report.md`

**Interfaces:**
- Consumes: Captured screenshots from `frontend/ui-reports/screenshots/`
- Produces: Visual critique report assessing visual hierarchy, awkward whitespace, typography balance, alignment issues, and aesthetic polish suggestions.

- [ ] **Step 1: Implement `run-vision-audit.mjs`**
Create the inspector script that reads captured page screenshots and performs automated visual checks (detecting empty spaces, contrast anomalies, and preparing images for visual evaluation).
- [ ] **Step 2: Generate `frontend/ui-reports/vision-audit-report.md`**
Format the critique report highlighting aesthetic flaws, awkward margins, and styling polish tips.
- [ ] **Step 3: Verify execution**
Run: `node frontend/scripts/ui-audit/run-vision-audit.mjs`
Confirm summary report generation.

---

### Task 5: Master Orchestrator & Execution Verification

**Files:**
- Create: `frontend/scripts/ui-audit/run-all-audits.mjs`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `frontend/ui-reports/MASTER_UI_FEEDBACK.md` synthesizing findings across all 3 tools.

- [ ] **Step 1: Implement `run-all-audits.mjs`**
Orchestrates sequential execution of Axe auditor, Viewport inspector, and Vision inspector. Compiles top findings into `MASTER_UI_FEEDBACK.md`.
- [ ] **Step 2: Run the full test suite and inspect output**
Run: `npm run test:ui:all` in `frontend/`
- [ ] **Step 3: Review generated feedback reports and verify all small inconveniences are reported**
Check `frontend/ui-reports/` to verify comprehensive coverage.
