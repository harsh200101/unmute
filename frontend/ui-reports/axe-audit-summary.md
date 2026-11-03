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

