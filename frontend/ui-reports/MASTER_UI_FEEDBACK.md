# 🛡️ Frontend Master UI & Usability Audit Report

**Generated:** 11/1/2026, 1:28:00 AM
**Target URL:** https://unmute-frontend.onrender.com

This comprehensive audit combines all 3 specialized testing tools to capture major bugs, visual glitches, and subtle micro-inconveniences.

## Quick Tool Navigation
1. **[Tool 1: Usability, Contrast & Micro-Inconveniences (Axe-Core)](#1-tool-1-usability--accessibility-audit)**
2. **[Tool 2: Viewport Overflows, Layout Shifts & Console Errors](#2-tool-2-multi-viewport--layout-shift-audit)**
3. **[Tool 3: AI Vision Aesthetic & Spatial Hierarchy](#3-tool-3-ai-vision-ui-inspector)**

---

## 1. Tool 1: Usability & Accessibility Audit

# Tool 1: Usability & Accessibility Defect Audit Report

**Timestamp:** 11/1/2026, 1:25:37 AM
**Audited Base URL:** https://unmute-frontend.onrender.com
**Total Defect Violations Found:** 19

### Impact Breakdown
- 🔴 **Critical:** 0
- 🟠 **Serious:** 9
- 🟡 **Moderate:** 1
- ⚪ **Minor Inconveniences:** 9

### Per-Route Overview

| Route | Name | Violations | Incomplete / Review |
| :--- | :--- | :--- | :--- |
| `/` | **landing** | 2 | 3 |
| `/wallet` | **wallet** | 2 | 1 |
| `/login` | **login** | 2 | 1 |
| `/register` | **register** | 2 | 1 |
| `/mentors` | **mentors** | 3 | 1 |
| `/crisis` | **crisis** | 2 | 1 |
| `/terms` | **terms** | 2 | 0 |
| `/privacy` | **privacy** | 2 | 1 |
| `/refund-policy` | **refund-policy** | 2 | 1 |

---

### Detailed Defect Inconveniences by Severity

#### 1. [SERIOUS] Elements must meet minimum color contrast ratio thresholds (`color-contrast`)
- **Route:** `landing` (https://unmute-frontend.onrender.com/)
- **Description:** Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<button type="button" class="inline-flex items-ce...">`
  - **CSS Selector:** `.gap-2.items-center.flex:nth-child(3) > .text-primary-foreground.hover\:bg-primary\/90.active\:bg-primary\/80`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 4.46 (foreground color: #ffffff, background color: #6366f1, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<button type="button" class="inline-flex items-ce...">`
  - **CSS Selector:** `.sm\:gap-3 > .contents[href$="register"][data-discover="true"] > .text-primary-foreground.hover\:bg-primary\/90.active\:bg-primary\/80`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 4.46 (foreground color: #ffffff, background color: #6366f1, font size: 12.0pt (16px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<button type="button" class="inline-flex items-ce...">`
  - **CSS Selector:** `.max-w-4xl > .mt-7.sm\:flex-row.gap-3 > .contents[href$="register"][data-discover="true"] > .text-primary-foreground.hover\:bg-primary\/90.active\:bg-primary\/80`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 4.46 (foreground color: #ffffff, background color: #6366f1, font size: 12.0pt (16px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<a class="mt-6 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30 px-3 py-1.5 text-xs font-medium hover:bg-destructive/15 transition-colors" href="/crisis" data-discover="true">`
  - **CSS Selector:** `.bg-destructive\/10`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.03 (foreground color: #ef4444, background color: #e5e7eb, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<p class="text-[11px] text-muted-foreground leading-relaxed">`
  - **CSS Selector:** `.text-\[11px\]`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1
  - *...and 2 more elements with this issue on this page.*

#### 2. [SERIOUS] Elements must meet minimum color contrast ratio thresholds (`color-contrast`)
- **Route:** `wallet` (https://unmute-frontend.onrender.com/wallet)
- **Description:** Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<button type="button" class="inline-flex items-ce...">`
  - **CSS Selector:** `.text-primary-foreground`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 4.46 (foreground color: #ffffff, background color: #6366f1, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<a class="mt-6 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30 px-3 py-1.5 text-xs font-medium hover:bg-destructive/15 transition-colors" href="/crisis" data-discover="true">`
  - **CSS Selector:** `.bg-destructive\/10`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.03 (foreground color: #ef4444, background color: #e5e7eb, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<p class="text-[11px] text-muted-foreground leading-relaxed">`
  - **CSS Selector:** `.text-\[11px\]`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<strong>not</strong>`
  - **CSS Selector:** `strong`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: bold). Expected contrast ratio of 4.5:1
  - **HTML:** `<a class="underline" href="/crisis" data-discover="true">use the crisis resources</a>`
  - **CSS Selector:** `.underline`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1

#### 3. [SERIOUS] Elements must meet minimum color contrast ratio thresholds (`color-contrast`)
- **Route:** `login` (https://unmute-frontend.onrender.com/login)
- **Description:** Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<button type="button" class="inline-flex items-ce...">`
  - **CSS Selector:** `.text-primary-foreground`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 4.46 (foreground color: #ffffff, background color: #6366f1, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<a class="mt-6 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30 px-3 py-1.5 text-xs font-medium hover:bg-destructive/15 transition-colors" href="/crisis" data-discover="true">`
  - **CSS Selector:** `.bg-destructive\/10`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.03 (foreground color: #ef4444, background color: #e5e7eb, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<p class="text-[11px] text-muted-foreground leading-relaxed">`
  - **CSS Selector:** `.text-\[11px\]`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<strong>not</strong>`
  - **CSS Selector:** `strong`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: bold). Expected contrast ratio of 4.5:1
  - **HTML:** `<a class="underline" href="/crisis" data-discover="true">use the crisis resources</a>`
  - **CSS Selector:** `.underline`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1

#### 4. [SERIOUS] Elements must meet minimum color contrast ratio thresholds (`color-contrast`)
- **Route:** `register` (https://unmute-frontend.onrender.com/register)
- **Description:** Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<button type="button" class="inline-flex items-ce...">`
  - **CSS Selector:** `.text-primary-foreground`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 4.46 (foreground color: #ffffff, background color: #6366f1, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<a class="mt-6 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30 px-3 py-1.5 text-xs font-medium hover:bg-destructive/15 transition-colors" href="/crisis" data-discover="true">`
  - **CSS Selector:** `.bg-destructive\/10`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.03 (foreground color: #ef4444, background color: #e5e7eb, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<p class="text-[11px] text-muted-foreground leading-relaxed">`
  - **CSS Selector:** `.text-\[11px\]`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<strong>not</strong>`
  - **CSS Selector:** `strong`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: bold). Expected contrast ratio of 4.5:1
  - **HTML:** `<a class="underline" href="/crisis" data-discover="true">use the crisis resources</a>`
  - **CSS Selector:** `.underline`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1

#### 5. [SERIOUS] Elements must meet minimum color contrast ratio thresholds (`color-contrast`)
- **Route:** `mentors` (https://unmute-frontend.onrender.com/mentors)
- **Description:** Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<button type="button" class="inline-flex items-ce...">`
  - **CSS Selector:** `.text-primary-foreground`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 4.46 (foreground color: #ffffff, background color: #6366f1, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<span class="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 px-3 py-1 text-xs font-medium">`
  - **CSS Selector:** `.max-w-2xl > .bg-primary\/10.border-primary\/20.py-1`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 4.26 (foreground color: #6366f1, background color: #f8fafc, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<span class="shrink-0 inline-flex items-baseline gap-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 text-sm font-semibold whitespace-nowrap">₹20/min</span>`
  - **CSS Selector:** `.text-card-foreground.p-5.sm\:p-6:nth-child(1) > .relative > .gap-4.items-start.flex > .min-w-0.flex-1 > .justify-between.gap-3.items-start > .items-baseline.gap-0\.5.px-2\.5`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 4.46 (foreground color: #6366f1, background color: #ffffff, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<span class="ml-auto inline-flex items-center gap-1 text-primary font-medium translate-x-0 group-hover:translate-x-0.5 transition-transform">`
  - **CSS Selector:** `.text-card-foreground.p-5.sm\:p-6:nth-child(1) > .relative > .pt-4.flex-wrap.gap-x-4 > .ml-auto.translate-x-0.group-hover\:translate-x-0\.5`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 4.46 (foreground color: #6366f1, background color: #ffffff, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<span class="shrink-0 inline-flex items-baseline gap-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 text-sm font-semibold whitespace-nowrap">₹10/min</span>`
  - **CSS Selector:** `.text-card-foreground.p-5.sm\:p-6:nth-child(2) > .relative > .gap-4.items-start.flex > .min-w-0.flex-1 > .justify-between.gap-3.items-start > .items-baseline.gap-0\.5.px-2\.5`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 4.46 (foreground color: #6366f1, background color: #ffffff, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1
  - *...and 5 more elements with this issue on this page.*

#### 6. [SERIOUS] Elements must meet minimum color contrast ratio thresholds (`color-contrast`)
- **Route:** `crisis` (https://unmute-frontend.onrender.com/crisis)
- **Description:** Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<button type="button" class="inline-flex items-ce...">`
  - **CSS Selector:** `.text-primary-foreground`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 4.46 (foreground color: #ffffff, background color: #6366f1, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<a class="mt-6 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30 px-3 py-1.5 text-xs font-medium hover:bg-destructive/15 transition-colors" href="/crisis" data-discover="true">`
  - **CSS Selector:** `.bg-destructive\/10`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.03 (foreground color: #ef4444, background color: #e5e7eb, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<p class="text-[11px] text-muted-foreground leading-relaxed">`
  - **CSS Selector:** `.text-\[11px\]`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<strong>not</strong>`
  - **CSS Selector:** `.text-\[11px\] > strong`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: bold). Expected contrast ratio of 4.5:1
  - **HTML:** `<a class="underline" href="/crisis" data-discover="true">use the crisis resources</a>`
  - **CSS Selector:** `.underline[href$="crisis"][data-discover="true"]`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1

#### 7. [SERIOUS] Elements must meet minimum color contrast ratio thresholds (`color-contrast`)
- **Route:** `terms` (https://unmute-frontend.onrender.com/terms)
- **Description:** Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<button type="button" class="inline-flex items-ce...">`
  - **CSS Selector:** `.text-primary-foreground`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 4.46 (foreground color: #ffffff, background color: #6366f1, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<a class="mt-6 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30 px-3 py-1.5 text-xs font-medium hover:bg-destructive/15 transition-colors" href="/crisis" data-discover="true">`
  - **CSS Selector:** `.bg-destructive\/10`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.03 (foreground color: #ef4444, background color: #e5e7eb, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<p class="text-[11px] text-muted-foreground leading-relaxed">`
  - **CSS Selector:** `.text-\[11px\]`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<strong>not</strong>`
  - **CSS Selector:** `.text-\[11px\] > strong`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: bold). Expected contrast ratio of 4.5:1
  - **HTML:** `<a class="underline" href="/crisis" data-discover="true">use the crisis resources</a>`
  - **CSS Selector:** `.text-\[11px\] > .underline[href$="crisis"][data-discover="true"]`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1

#### 8. [SERIOUS] Elements must meet minimum color contrast ratio thresholds (`color-contrast`)
- **Route:** `privacy` (https://unmute-frontend.onrender.com/privacy)
- **Description:** Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<button type="button" class="inline-flex items-ce...">`
  - **CSS Selector:** `.text-primary-foreground`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 4.46 (foreground color: #ffffff, background color: #6366f1, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<a class="mt-6 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30 px-3 py-1.5 text-xs font-medium hover:bg-destructive/15 transition-colors" href="/crisis" data-discover="true">`
  - **CSS Selector:** `.bg-destructive\/10`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.03 (foreground color: #ef4444, background color: #e5e7eb, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<p class="text-[11px] text-muted-foreground leading-relaxed">`
  - **CSS Selector:** `.text-\[11px\]`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<strong>not</strong>`
  - **CSS Selector:** `.text-\[11px\] > strong`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: bold). Expected contrast ratio of 4.5:1
  - **HTML:** `<a class="underline" href="/crisis" data-discover="true">use the crisis resources</a>`
  - **CSS Selector:** `.text-\[11px\] > .underline[href$="crisis"][data-discover="true"]`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1

#### 9. [SERIOUS] Elements must meet minimum color contrast ratio thresholds (`color-contrast`)
- **Route:** `refund-policy` (https://unmute-frontend.onrender.com/refund-policy)
- **Description:** Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/color-contrast?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<button type="button" class="inline-flex items-ce...">`
  - **CSS Selector:** `.text-primary-foreground`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 4.46 (foreground color: #ffffff, background color: #6366f1, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<a class="mt-6 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30 px-3 py-1.5 text-xs font-medium hover:bg-destructive/15 transition-colors" href="/crisis" data-discover="true">`
  - **CSS Selector:** `.bg-destructive\/10`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.03 (foreground color: #ef4444, background color: #e5e7eb, font size: 9.0pt (12px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<p class="text-[11px] text-muted-foreground leading-relaxed">`
  - **CSS Selector:** `.text-\[11px\]`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1
  - **HTML:** `<strong>not</strong>`
  - **CSS Selector:** `.text-\[11px\] > strong`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: bold). Expected contrast ratio of 4.5:1
  - **HTML:** `<a class="underline" href="/crisis" data-discover="true">use the crisis resources</a>`
  - **CSS Selector:** `.underline`
  - **Remediation Note:** Fix any of the following:   Element has insufficient color contrast of 3.9 (foreground color: #6b7280, background color: #e5e7eb, font size: 8.3pt (11px), font weight: normal). Expected contrast ratio of 4.5:1

#### 10. [MODERATE] Heading levels should only increase by one (`heading-order`)
- **Route:** `mentors` (https://unmute-frontend.onrender.com/mentors)
- **Description:** Ensure the order of headings is semantically correct
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/heading-order?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<h3 class="font-semibold text-foreground truncate text-base sm:text-lg">Harsh gajbhiye</h3>`
  - **CSS Selector:** `.text-card-foreground.p-5.sm\:p-6:nth-child(1) > .relative > .gap-4.items-start.flex > .min-w-0.flex-1 > .justify-between.gap-3.items-start > .min-w-0 > h3`
  - **Remediation Note:** Fix any of the following:   Heading order invalid

#### 11. [MINOR] Alternative text of images should not be repeated as text (`image-redundant-alt`)
- **Route:** `landing` (https://unmute-frontend.onrender.com/)
- **Description:** Ensure image alternative is not repeated as text
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/image-redundant-alt?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block transition-transform group-hover:scale-105" loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.group-hover\:scale-105`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block " loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.sm\:justify-start[aria-label="unmute — home"][href="/"] > img`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text

#### 12. [MINOR] Alternative text of images should not be repeated as text (`image-redundant-alt`)
- **Route:** `wallet` (https://unmute-frontend.onrender.com/wallet)
- **Description:** Ensure image alternative is not repeated as text
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/image-redundant-alt?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block transition-transform group-hover:scale-105" loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.transition-transform`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block " loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.sm\:justify-start[aria-label="unmute — home"][href="/"] > img[width="32"][height="32"]`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text

#### 13. [MINOR] Alternative text of images should not be repeated as text (`image-redundant-alt`)
- **Route:** `login` (https://unmute-frontend.onrender.com/login)
- **Description:** Ensure image alternative is not repeated as text
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/image-redundant-alt?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block transition-transform group-hover:scale-105" loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.transition-transform`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block " loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.sm\:justify-start[aria-label="unmute — home"][href="/"] > img[width="32"][height="32"]`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text

#### 14. [MINOR] Alternative text of images should not be repeated as text (`image-redundant-alt`)
- **Route:** `register` (https://unmute-frontend.onrender.com/register)
- **Description:** Ensure image alternative is not repeated as text
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/image-redundant-alt?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block transition-transform group-hover:scale-105" loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.transition-transform`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block " loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.sm\:justify-start[aria-label="unmute — home"][href="/"] > img[width="32"][height="32"]`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text

#### 15. [MINOR] Alternative text of images should not be repeated as text (`image-redundant-alt`)
- **Route:** `mentors` (https://unmute-frontend.onrender.com/mentors)
- **Description:** Ensure image alternative is not repeated as text
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/image-redundant-alt?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block transition-transform group-hover:scale-105" loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.group-hover\:scale-105`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block " loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.sm\:justify-start[aria-label="unmute — home"][href="/"] > img[alt="unmute"][width="32"][height="32"]`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text

#### 16. [MINOR] Alternative text of images should not be repeated as text (`image-redundant-alt`)
- **Route:** `crisis` (https://unmute-frontend.onrender.com/crisis)
- **Description:** Ensure image alternative is not repeated as text
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/image-redundant-alt?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block transition-transform group-hover:scale-105" loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.transition-transform`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block " loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.sm\:justify-start[aria-label="unmute — home"][href="/"] > img`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text

#### 17. [MINOR] Alternative text of images should not be repeated as text (`image-redundant-alt`)
- **Route:** `terms` (https://unmute-frontend.onrender.com/terms)
- **Description:** Ensure image alternative is not repeated as text
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/image-redundant-alt?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block transition-transform group-hover:scale-105" loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.transition-transform`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block " loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.sm\:justify-start[aria-label="unmute — home"][href="/"] > img`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text

#### 18. [MINOR] Alternative text of images should not be repeated as text (`image-redundant-alt`)
- **Route:** `privacy` (https://unmute-frontend.onrender.com/privacy)
- **Description:** Ensure image alternative is not repeated as text
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/image-redundant-alt?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block transition-transform group-hover:scale-105" loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.transition-transform`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block " loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.sm\:justify-start[aria-label="unmute — home"][href="/"] > img`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text

#### 19. [MINOR] Alternative text of images should not be repeated as text (`image-redundant-alt`)
- **Route:** `refund-policy` (https://unmute-frontend.onrender.com/refund-policy)
- **Description:** Ensure image alternative is not repeated as text
- **Rule Reference:** [Axe Rule Documentation](https://dequeuniversity.com/rules/axe/4.14/image-redundant-alt?application=playwright)
- **Offending DOM Elements:**
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block transition-transform group-hover:scale-105" loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.transition-transform`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text
  - **HTML:** `<img alt="unmute" width="32" height="32" class="inline-block " loading="eager" decoding="async" src="/images/logo.png" style="height: 32px; width: 32px;">`
  - **CSS Selector:** `.sm\:justify-start[aria-label="unmute — home"][href="/"] > img`
  - **Remediation Note:** Fix all of the following:   Element contains <img> element with alt text that duplicates existing text



---

## 2. Tool 2: Multi-Viewport & Layout Shift Audit

# Tool 2: Multi-Viewport & Layout Shift Inspection Report

**Timestamp:** 11/1/2026, 1:27:59 AM
**Audited Base URL:** https://unmute-frontend.onrender.com
**Total Viewport Combinations Audited:** 27

### Summary
- 📱 **Horizontal Overflow (Layout Break) Incidents:** 0
- ⚠️ **Console Warnings / JS Errors:** 54
- 🌐 **Failed Network Requests:** 0

### Viewport Test Matrix

| Route | Viewport | Dimensions | Overflow Status | Screenshot |
| :--- | :--- | :--- | :--- | :--- |
| `landing` | **mobile** | 375x667 | ✅ Clean | `landing-mobile-375x667.png` |
| `landing` | **tablet** | 768x1024 | ✅ Clean | `landing-tablet-768x1024.png` |
| `landing` | **desktop** | 1440x900 | ✅ Clean | `landing-desktop-1440x900.png` |
| `wallet` | **mobile** | 375x667 | ✅ Clean | `wallet-mobile-375x667.png` |
| `wallet` | **tablet** | 768x1024 | ✅ Clean | `wallet-tablet-768x1024.png` |
| `wallet` | **desktop** | 1440x900 | ✅ Clean | `wallet-desktop-1440x900.png` |
| `login` | **mobile** | 375x667 | ✅ Clean | `login-mobile-375x667.png` |
| `login` | **tablet** | 768x1024 | ✅ Clean | `login-tablet-768x1024.png` |
| `login` | **desktop** | 1440x900 | ✅ Clean | `login-desktop-1440x900.png` |
| `register` | **mobile** | 375x667 | ✅ Clean | `register-mobile-375x667.png` |
| `register` | **tablet** | 768x1024 | ✅ Clean | `register-tablet-768x1024.png` |
| `register` | **desktop** | 1440x900 | ✅ Clean | `register-desktop-1440x900.png` |
| `mentors` | **mobile** | 375x667 | ✅ Clean | `mentors-mobile-375x667.png` |
| `mentors` | **tablet** | 768x1024 | ✅ Clean | `mentors-tablet-768x1024.png` |
| `mentors` | **desktop** | 1440x900 | ✅ Clean | `mentors-desktop-1440x900.png` |
| `crisis` | **mobile** | 375x667 | ✅ Clean | `crisis-mobile-375x667.png` |
| `crisis` | **tablet** | 768x1024 | ✅ Clean | `crisis-tablet-768x1024.png` |
| `crisis` | **desktop** | 1440x900 | ✅ Clean | `crisis-desktop-1440x900.png` |
| `terms` | **mobile** | 375x667 | ✅ Clean | `terms-mobile-375x667.png` |
| `terms` | **tablet** | 768x1024 | ✅ Clean | `terms-tablet-768x1024.png` |
| `terms` | **desktop** | 1440x900 | ✅ Clean | `terms-desktop-1440x900.png` |
| `privacy` | **mobile** | 375x667 | ✅ Clean | `privacy-mobile-375x667.png` |
| `privacy` | **tablet** | 768x1024 | ✅ Clean | `privacy-tablet-768x1024.png` |
| `privacy` | **desktop** | 1440x900 | ✅ Clean | `privacy-desktop-1440x900.png` |
| `refund-policy` | **mobile** | 375x667 | ✅ Clean | `refund-policy-mobile-375x667.png` |
| `refund-policy` | **tablet** | 768x1024 | ✅ Clean | `refund-policy-tablet-768x1024.png` |
| `refund-policy` | **desktop** | 1440x900 | ✅ Clean | `refund-policy-desktop-1440x900.png` |

---

### ✅ Layout Overflow
No horizontal scroll leaks or elements protruding past screen boundaries detected across any viewport.

### ⚠️ Captured Browser Console Log Anomalies (54)

#### 1. [WARNING] on `landing` (mobile)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 2. [ERROR] on `landing` (mobile)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 3. [WARNING] on `landing` (tablet)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 4. [ERROR] on `landing` (tablet)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 5. [WARNING] on `landing` (desktop)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 6. [ERROR] on `landing` (desktop)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 7. [WARNING] on `wallet` (mobile)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 8. [ERROR] on `wallet` (mobile)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 9. [WARNING] on `wallet` (tablet)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 10. [ERROR] on `wallet` (tablet)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 11. [WARNING] on `wallet` (desktop)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 12. [ERROR] on `wallet` (desktop)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 13. [WARNING] on `login` (mobile)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 14. [ERROR] on `login` (mobile)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 15. [WARNING] on `login` (tablet)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 16. [ERROR] on `login` (tablet)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 17. [WARNING] on `login` (desktop)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 18. [ERROR] on `login` (desktop)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 19. [WARNING] on `register` (mobile)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 20. [ERROR] on `register` (mobile)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 21. [WARNING] on `register` (tablet)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 22. [ERROR] on `register` (tablet)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 23. [WARNING] on `register` (desktop)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 24. [ERROR] on `register` (desktop)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 25. [WARNING] on `mentors` (mobile)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 26. [ERROR] on `mentors` (mobile)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 27. [WARNING] on `mentors` (tablet)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 28. [ERROR] on `mentors` (tablet)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 29. [WARNING] on `mentors` (desktop)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 30. [ERROR] on `mentors` (desktop)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 31. [WARNING] on `crisis` (mobile)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 32. [ERROR] on `crisis` (mobile)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 33. [WARNING] on `crisis` (tablet)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 34. [ERROR] on `crisis` (tablet)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 35. [WARNING] on `crisis` (desktop)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 36. [ERROR] on `crisis` (desktop)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 37. [WARNING] on `terms` (mobile)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 38. [ERROR] on `terms` (mobile)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 39. [WARNING] on `terms` (tablet)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 40. [ERROR] on `terms` (tablet)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 41. [WARNING] on `terms` (desktop)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 42. [ERROR] on `terms` (desktop)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 43. [WARNING] on `privacy` (mobile)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 44. [ERROR] on `privacy` (mobile)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 45. [WARNING] on `privacy` (tablet)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 46. [ERROR] on `privacy` (tablet)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 47. [WARNING] on `privacy` (desktop)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 48. [ERROR] on `privacy` (desktop)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 49. [WARNING] on `refund-policy` (mobile)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 50. [ERROR] on `refund-policy` (mobile)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 51. [WARNING] on `refund-policy` (tablet)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 52. [ERROR] on `refund-policy` (tablet)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`

#### 53. [WARNING] on `refund-policy` (desktop)
```text
Unrecognized feature: 'web-share'.
```
- Origin: `https://checkout.razorpay.com/v1/checkout.js:0`

#### 54. [ERROR] on `refund-policy` (desktop)
```text
Failed to load resource: the server responded with a status of 400 ()
```
- Origin: `https://unmute-backend-4x1x.onrender.com/api/auth/refresh:0`



---

## 3. Tool 3: AI Vision UI Inspector

# Tool 3: AI Vision UI Inspector & Aesthetic Polish Report

**Timestamp:** 11/1/2026, 1:28:00 AM
**Audited Pages:** 9
**Total Viewport Screens Inspected:** 27

## Design Taste & Polish Evaluation Rubric
This visual inspection evaluates every screen against high-agency design taste standards:
1. **Visual Hierarchy & Typography:** Clear heading distinction, legible line heights, no micro-text on mobile.
2. **Spatial Cadence & Padding:** Balanced whitespace, consistent container gutters, no cramped edge-to-edge buttons.
3. **Form & Interactive Affordance:** Explicit inputs with clear focus states, distinct primary/secondary CTAs.
4. **Aesthetic Consistency:** Calibrated color palette, deliberate dark/light contrast, no abrupt jarring borders.

---

## Per-Route Visual Assessment

### 1. Page: `landing` (`/`)

**Screenshots Available:**
- 🖥️ **Desktop:** `landing-desktop-1440x900.png`
- 📱 **Tablet:** `landing-tablet-768x1024.png`
- 📱 **Mobile:** `landing-mobile-375x667.png`

**Visual Polish Checklist:**
- [ ] **Spacing Cadence:** Header, hero sections, and card grids have proportionate breathing room without vertical emptiness.
- [ ] **Mobile Touchability:** All interactive pills/buttons meet minimum 44px tap targets on mobile screens.
- [ ] **Contrast & Muted Text:** Secondary helper text and timestamps avoid excessively faint gray (#9CA3AF vs #6B7280) on light backgrounds.
- [ ] **Overflow & Padding:** Page margins on mobile maintain at least `px-4` (16px) gutter padding from viewport edges.

### 2. Page: `wallet` (`/wallet`)

**Screenshots Available:**
- 🖥️ **Desktop:** `wallet-desktop-1440x900.png`
- 📱 **Tablet:** `wallet-tablet-768x1024.png`
- 📱 **Mobile:** `wallet-mobile-375x667.png`

**Visual Polish Checklist:**
- [ ] **Spacing Cadence:** Header, hero sections, and card grids have proportionate breathing room without vertical emptiness.
- [ ] **Mobile Touchability:** All interactive pills/buttons meet minimum 44px tap targets on mobile screens.
- [ ] **Contrast & Muted Text:** Secondary helper text and timestamps avoid excessively faint gray (#9CA3AF vs #6B7280) on light backgrounds.
- [ ] **Overflow & Padding:** Page margins on mobile maintain at least `px-4` (16px) gutter padding from viewport edges.

### 3. Page: `login` (`/login`)

**Screenshots Available:**
- 🖥️ **Desktop:** `login-desktop-1440x900.png`
- 📱 **Tablet:** `login-tablet-768x1024.png`
- 📱 **Mobile:** `login-mobile-375x667.png`

**Visual Polish Checklist:**
- [ ] **Spacing Cadence:** Header, hero sections, and card grids have proportionate breathing room without vertical emptiness.
- [ ] **Mobile Touchability:** All interactive pills/buttons meet minimum 44px tap targets on mobile screens.
- [ ] **Contrast & Muted Text:** Secondary helper text and timestamps avoid excessively faint gray (#9CA3AF vs #6B7280) on light backgrounds.
- [ ] **Overflow & Padding:** Page margins on mobile maintain at least `px-4` (16px) gutter padding from viewport edges.

### 4. Page: `register` (`/register`)

**Screenshots Available:**
- 🖥️ **Desktop:** `register-desktop-1440x900.png`
- 📱 **Tablet:** `register-tablet-768x1024.png`
- 📱 **Mobile:** `register-mobile-375x667.png`

**Visual Polish Checklist:**
- [ ] **Spacing Cadence:** Header, hero sections, and card grids have proportionate breathing room without vertical emptiness.
- [ ] **Mobile Touchability:** All interactive pills/buttons meet minimum 44px tap targets on mobile screens.
- [ ] **Contrast & Muted Text:** Secondary helper text and timestamps avoid excessively faint gray (#9CA3AF vs #6B7280) on light backgrounds.
- [ ] **Overflow & Padding:** Page margins on mobile maintain at least `px-4` (16px) gutter padding from viewport edges.

### 5. Page: `mentors` (`/mentors`)

**Screenshots Available:**
- 🖥️ **Desktop:** `mentors-desktop-1440x900.png`
- 📱 **Tablet:** `mentors-tablet-768x1024.png`
- 📱 **Mobile:** `mentors-mobile-375x667.png`

**Visual Polish Checklist:**
- [ ] **Spacing Cadence:** Header, hero sections, and card grids have proportionate breathing room without vertical emptiness.
- [ ] **Mobile Touchability:** All interactive pills/buttons meet minimum 44px tap targets on mobile screens.
- [ ] **Contrast & Muted Text:** Secondary helper text and timestamps avoid excessively faint gray (#9CA3AF vs #6B7280) on light backgrounds.
- [ ] **Overflow & Padding:** Page margins on mobile maintain at least `px-4` (16px) gutter padding from viewport edges.

### 6. Page: `crisis` (`/crisis`)

**Screenshots Available:**
- 🖥️ **Desktop:** `crisis-desktop-1440x900.png`
- 📱 **Tablet:** `crisis-tablet-768x1024.png`
- 📱 **Mobile:** `crisis-mobile-375x667.png`

**Visual Polish Checklist:**
- [ ] **Spacing Cadence:** Header, hero sections, and card grids have proportionate breathing room without vertical emptiness.
- [ ] **Mobile Touchability:** All interactive pills/buttons meet minimum 44px tap targets on mobile screens.
- [ ] **Contrast & Muted Text:** Secondary helper text and timestamps avoid excessively faint gray (#9CA3AF vs #6B7280) on light backgrounds.
- [ ] **Overflow & Padding:** Page margins on mobile maintain at least `px-4` (16px) gutter padding from viewport edges.

### 7. Page: `terms` (`/terms`)

**Screenshots Available:**
- 🖥️ **Desktop:** `terms-desktop-1440x900.png`
- 📱 **Tablet:** `terms-tablet-768x1024.png`
- 📱 **Mobile:** `terms-mobile-375x667.png`

**Visual Polish Checklist:**
- [ ] **Spacing Cadence:** Header, hero sections, and card grids have proportionate breathing room without vertical emptiness.
- [ ] **Mobile Touchability:** All interactive pills/buttons meet minimum 44px tap targets on mobile screens.
- [ ] **Contrast & Muted Text:** Secondary helper text and timestamps avoid excessively faint gray (#9CA3AF vs #6B7280) on light backgrounds.
- [ ] **Overflow & Padding:** Page margins on mobile maintain at least `px-4` (16px) gutter padding from viewport edges.

### 8. Page: `privacy` (`/privacy`)

**Screenshots Available:**
- 🖥️ **Desktop:** `privacy-desktop-1440x900.png`
- 📱 **Tablet:** `privacy-tablet-768x1024.png`
- 📱 **Mobile:** `privacy-mobile-375x667.png`

**Visual Polish Checklist:**
- [ ] **Spacing Cadence:** Header, hero sections, and card grids have proportionate breathing room without vertical emptiness.
- [ ] **Mobile Touchability:** All interactive pills/buttons meet minimum 44px tap targets on mobile screens.
- [ ] **Contrast & Muted Text:** Secondary helper text and timestamps avoid excessively faint gray (#9CA3AF vs #6B7280) on light backgrounds.
- [ ] **Overflow & Padding:** Page margins on mobile maintain at least `px-4` (16px) gutter padding from viewport edges.

### 9. Page: `refund-policy` (`/refund-policy`)

**Screenshots Available:**
- 🖥️ **Desktop:** `refund-policy-desktop-1440x900.png`
- 📱 **Tablet:** `refund-policy-tablet-768x1024.png`
- 📱 **Mobile:** `refund-policy-mobile-375x667.png`

**Visual Polish Checklist:**
- [ ] **Spacing Cadence:** Header, hero sections, and card grids have proportionate breathing room without vertical emptiness.
- [ ] **Mobile Touchability:** All interactive pills/buttons meet minimum 44px tap targets on mobile screens.
- [ ] **Contrast & Muted Text:** Secondary helper text and timestamps avoid excessively faint gray (#9CA3AF vs #6B7280) on light backgrounds.
- [ ] **Overflow & Padding:** Page margins on mobile maintain at least `px-4` (16px) gutter padding from viewport edges.



