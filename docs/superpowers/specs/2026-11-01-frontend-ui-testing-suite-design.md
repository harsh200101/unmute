# Design Specification: Frontend UI Testing & Bug Detection Suite

**Date:** 2026-11-01  
**Project:** Unmute Frontend (`unmute-frontend-v2`)  
**Scope:** Automated UI testing, visual inspection, and shortcoming detection suite  

---

## 1. Intent & Purpose
The goal is to provide an automated, highly sensitive frontend UI testing suite that opens a real browser, systematically audits the application, and surfaces even the smallest visual, responsive, usability, and behavioral inconveniences to ensure top-tier product polish.

---

## 2. Goals, Non-Goals & Anti-Goals
* **Goals:**
  * Detect minor and subtle UI shortcomings (low color contrast, illegible text, missing icon labels, poor touch targets).
  * Automatically inspect multiple device viewports (Mobile: 375px, Tablet: 768px, Desktop: 1440px) for layout overflow (`overflow-x`), clipped text, or broken grids.
  * Trap and report 100% of browser console errors, warnings, and unhandled promise rejections during page interactions.
  * Provide an AI Vision Inspector to judge visual aesthetics, alignment, spacing hierarchy, and styling flaws.
  * Generate clear, actionable feedback reports for each tool.
* **Non-Goals:**
  * Heavy backend database stress testing (this phase is strictly focused on frontend UI).
  * Replacing unit tests in `vitest`.
* **Anti-Goals:**
  * Complex, brittle test scripts that break on every minor text change.
  * Suppressing or ignoring minor warnings; every inconvenience should be reported.

---

## 3. Selected 3-Tool Architecture

### Tool 1: Axe-Core + Playwright Usability & Compliance Auditor
* **How it works:** Launches Chromium via Playwright, navigates to target routes, injects `axe-core`, and analyzes all rendered nodes.
* **What it catches:** Contrast deficiencies, missing accessible names/labels on buttons/inputs, touch target sizes below minimum dimensions (48x48px / 24x24px), focus order issues.
* **Output:** Graded JSON/HTML feedback report categorized by Minor, Moderate, and Critical impact.

### Tool 2: Playwright Multi-Viewport & Layout Shift Inspector
* **How it works:** Renders pages across mobile (`375x667`), tablet (`768x1024`), and desktop (`1440x900`). Attaches listeners for console errors (`page.on('console')`) and failed network requests (`page.on('requestfailed')`).
* **What it catches:** Elements overflowing viewport causing accidental horizontal scrolling (`scrollWidth > clientWidth`), overlapping z-index elements, and console warnings/errors.
* **Output:** Screenshot evidence per breakpoint + layout defect log + console error summary.

### Tool 3: AI Vision UI Inspector (Visual Aesthetics & Polish)
* **How it works:** Captures high-fidelity screenshots of pages and key UI components and evaluates them with a Multimodal Vision analysis script (or Midscene.js agent).
* **What it catches:** Awkward whitespace, misaligned headings, unbalanced paddings, visual clutter, inconsistent font weights, and subtle visual defects that HTML DOM scanners cannot see.
* **Output:** Structured visual critique report with specific UI polish recommendations.

---

## 4. Execution & Setup Strategy
* **Runner Location:** `frontend/scripts/ui-audit/` (or root `scripts/ui-audit/`).
* **Dependencies:** `@playwright/test`, `@axe-core/playwright`.
* **Commands:**
  * `npm run test:ui:axe` (Runs Tool 1)
  * `npm run test:ui:viewport` (Runs Tool 2)
  * `npm run test:ui:vision` (Runs Tool 3)
  * `npm run test:ui:all` (Runs all 3 sequentially and outputs a unified feedback summary)

---

## 5. Review & Approval
Once approved, we will proceed to generate the implementation plan and set up the scripts and runners.
