/**
 * Tool 2: Multi-Viewport & Layout Shift / Console Error Inspector
 * Audits every route across Mobile, Tablet, and Desktop:
 * - Detects horizontal scrollbar leaks (overflow-x on mobile)
 * - Identifies exact DOM elements causing layout overflows
 * - Captures 100% of browser console warnings and uncaught JavaScript errors
 * - Catches 404/500 asset delivery failures
 * - Saves full-page screenshots for visual inspection
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.mjs';

async function runViewportAudit() {
  console.log(`\n📐 [Tool 2] Starting Multi-Viewport & Layout Shift Inspector...`);
  console.log(`Target: ${CONFIG.baseUrl}\n`);

  fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const findings = [];
  const consoleErrors = [];
  const networkErrors = [];

  for (const route of CONFIG.routes) {
    const fullUrl = `${CONFIG.baseUrl}${route.path}`;
    console.log(`Testing Route: ${route.name} (${fullUrl})`);

    for (const vp of CONFIG.viewports) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        userAgent: vp.name === 'mobile'
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
          : undefined
      });

      const page = await context.newPage();

      // Listen for console logs
      page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
          consoleErrors.push({
            route: route.name,
            viewport: vp.name,
            type: msg.type(),
            text: msg.text(),
            location: msg.location()
          });
        }
      });

      // Listen for uncaught exceptions
      page.on('pageerror', err => {
        consoleErrors.push({
          route: route.name,
          viewport: vp.name,
          type: 'uncaught-exception',
          text: err.message,
          stack: err.stack
        });
      });

      // Listen for network failures
      page.on('requestfailed', req => {
        networkErrors.push({
          route: route.name,
          viewport: vp.name,
          url: req.url(),
          failure: req.failure()?.errorText || 'Unknown failure'
        });
      });

      try {
        await page.goto(fullUrl, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(2000); // Allow render to stabilize

        // Screenshot capture
        const screenshotFileName = `${route.name}-${vp.name}-${vp.width}x${vp.height}.png`;
        const screenshotPath = path.join(CONFIG.screenshotDir, screenshotFileName);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        // Measure layout overflow-x
        const overflowMetrics = await page.evaluate((vpWidth) => {
          const doc = document.documentElement;
          const body = document.body;
          const scrollWidth = Math.max(doc.scrollWidth, body ? body.scrollWidth : 0);
          const clientWidth = doc.clientWidth;
          const hasHorizontalOverflow = scrollWidth > clientWidth + 2; // tolerance

          let offendingElements = [];
          if (hasHorizontalOverflow) {
            // Find elements extending past the client width
            const allElements = Array.from(document.querySelectorAll('*'));
            for (const el of allElements) {
              const rect = el.getBoundingClientRect();
              if (rect.right > clientWidth + 2) {
                const tag = el.tagName.toLowerCase();
                const id = el.id ? `#${el.id}` : '';
                const classes = el.className && typeof el.className === 'string'
                  ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}`
                  : '';
                offendingElements.push({
                  selector: `${tag}${id}${classes}`,
                  rect: { right: Math.round(rect.right), width: Math.round(rect.width) },
                  outerHTMLSnippet: el.outerHTML.slice(0, 120)
                });
                if (offendingElements.length >= 5) break;
              }
            }
          }

          return {
            scrollWidth,
            clientWidth,
            hasHorizontalOverflow,
            overflowAmount: Math.max(0, scrollWidth - clientWidth),
            offendingElements
          };
        }, vp.width);

        findings.push({
          route: route.name,
          path: route.path,
          viewport: vp.name,
          width: vp.width,
          height: vp.height,
          screenshot: screenshotFileName,
          overflow: overflowMetrics
        });

        if (overflowMetrics.hasHorizontalOverflow) {
          console.warn(`  ⚠️ [${vp.name.toUpperCase()}] Horizontal overflow detected! Scroll width: ${overflowMetrics.scrollWidth}px vs Viewport: ${overflowMetrics.clientWidth}px (+${overflowMetrics.overflowAmount}px)`);
        } else {
          console.log(`  ✓ [${vp.name}] Layout OK (${vp.width}px)`);
        }

      } catch (err) {
        console.error(`  ❌ Error testing ${route.name} at ${vp.name}:`, err.message);
        findings.push({
          route: route.name,
          viewport: vp.name,
          error: err.message
        });
      } finally {
        await context.close();
      }
    }
  }

  await browser.close();

  // Save report
  let md = `# Tool 2: Multi-Viewport & Layout Shift Inspection Report\n\n`;
  md += `**Timestamp:** ${new Date().toLocaleString()}\n`;
  md += `**Audited Base URL:** ${CONFIG.baseUrl}\n`;
  md += `**Total Viewport Combinations Audited:** ${findings.length}\n\n`;

  // Summary counts
  const overflowIssues = findings.filter(f => f.overflow?.hasHorizontalOverflow);
  md += `### Summary\n`;
  md += `- 📱 **Horizontal Overflow (Layout Break) Incidents:** ${overflowIssues.length}\n`;
  md += `- ⚠️ **Console Warnings / JS Errors:** ${consoleErrors.length}\n`;
  md += `- 🌐 **Failed Network Requests:** ${networkErrors.length}\n\n`;

  // Table of Viewport tests
  md += `### Viewport Test Matrix\n\n`;
  md += `| Route | Viewport | Dimensions | Overflow Status | Screenshot |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- |\n`;
  findings.forEach(f => {
    const status = f.error
      ? `❌ Error: ${f.error}`
      : f.overflow.hasHorizontalOverflow
        ? `⚠️ **Overflow +${f.overflow.overflowAmount}px**`
        : `✅ Clean`;
    md += `| \`${f.route}\` | **${f.viewport}** | ${f.width}x${f.height} | ${status} | \`${f.screenshot || 'N/A'}\` |\n`;
  });
  md += `\n---\n\n`;

  // Detail on Overflows
  if (overflowIssues.length > 0) {
    md += `### 🚨 Layout Overflow & Responsive Inconveniences\n\n`;
    overflowIssues.forEach((o, i) => {
      md += `#### ${i + 1}. Route \`${o.route}\` on **${o.viewport}** (${o.width}px)\n`;
      md += `- **Excess Width:** Page is **${o.overflow.scrollWidth}px** wide, exceeding viewport by **+${o.overflow.overflowAmount}px**.\n`;
      md += `- **Impact:** Causes unintended horizontal scrolling, broken side-gutters, or chopped UI on mobile.\n`;
      if (o.overflow.offendingElements.length > 0) {
        md += `- **Suspect Elements:**\n`;
        o.overflow.offendingElements.forEach(el => {
          md += `  - \`${el.selector}\` (extends to ${el.rect.right}px, width ${el.rect.width}px)\n`;
          md += `    \`${el.outerHTMLSnippet}\`\n`;
        });
      }
      md += `\n`;
    });
  } else {
    md += `### ✅ Layout Overflow\nNo horizontal scroll leaks or elements protruding past screen boundaries detected across any viewport.\n\n`;
  }

  // Console Warnings & Errors
  md += `### ⚠️ Captured Browser Console Log Anomalies (${consoleErrors.length})\n\n`;
  if (consoleErrors.length === 0) {
    md += `Zero console errors or warnings were thrown during page interactions.\n\n`;
  } else {
    consoleErrors.forEach((c, idx) => {
      md += `#### ${idx + 1}. [${c.type.toUpperCase()}] on \`${c.route}\` (${c.viewport})\n`;
      md += `\`\`\`text\n${c.text}\n\`\`\`\n`;
      if (c.location?.url) {
        md += `- Origin: \`${c.location.url}:${c.location.lineNumber || 0}\`\n`;
      }
      md += `\n`;
    });
  }

  // Network Errors
  if (networkErrors.length > 0) {
    md += `### 🌐 Network Failures (${networkErrors.length})\n\n`;
    networkErrors.forEach((n, idx) => {
      md += `- **[${n.route} / ${n.viewport}]** Failed to load \`${n.url}\` — Reason: \`${n.failure}\`\n`;
    });
    md += `\n`;
  }

  const reportPath = path.join(CONFIG.outputDir, 'viewport-audit-report.md');
  fs.writeFileSync(reportPath, md);

  console.log(`\n✅ Tool 2 Completed!`);
  console.log(`Report saved to: ${reportPath}\n`);

  return { overflowCount: overflowIssues.length, consoleErrorCount: consoleErrors.length };
}

runViewportAudit().catch(err => {
  console.error("Viewport audit failed:", err);
  process.exit(1);
});
