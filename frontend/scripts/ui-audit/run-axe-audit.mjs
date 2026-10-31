/**
 * Tool 1: Axe-Core + Playwright Usability & Compliance Auditor
 * Audits every route for even minor UI/UX inconveniences:
 * - Color contrast shortcomings
 * - Missing ARIA names / labels on interactive controls
 * - Inaccessible forms / inputs
 * - Touch target violations & layout hierarchy flaws
 */
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.mjs';

async function runAxeAudit() {
  console.log(`\n🔍 [Tool 1] Starting Axe-Core Usability & Accessibility Audit...`);
  console.log(`Target: ${CONFIG.baseUrl}\n`);

  fs.mkdirSync(CONFIG.outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const allViolations = [];
  const routeSummaries = [];

  for (const route of CONFIG.routes) {
    const fullUrl = `${CONFIG.baseUrl}${route.path}`;
    console.log(`Auditing: ${route.name} (${fullUrl})`);

    try {
      const response = await page.goto(fullUrl, { waitUntil: 'load', timeout: 30000 });
      if (!response || response.status() >= 400 && route.name !== 'not-found') {
        console.warn(`  ⚠️ HTTP status ${response?.status()} on ${fullUrl}`);
      }

      // Allow SPA routing and animations to settle
      await page.waitForTimeout(2000);

      // Run Axe with full rule set (including minor/best-practice)
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
        .analyze();

      const violations = results.violations || [];
      const incomplete = results.incomplete || [];

      console.log(`  -> Found ${violations.length} violations, ${incomplete.length} potential warnings.`);

      routeSummaries.push({
        name: route.name,
        path: route.path,
        url: fullUrl,
        violationsCount: violations.length,
        incompleteCount: incomplete.length,
        violations
      });

      violations.forEach(v => {
        allViolations.push({
          route: route.name,
          url: fullUrl,
          id: v.id,
          impact: v.impact || 'minor',
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.map(n => ({
            html: n.html,
            target: n.target,
            failureSummary: n.failureSummary
          }))
        });
      });
    } catch (err) {
      console.error(`  ❌ Error auditing ${fullUrl}:`, err.message);
      routeSummaries.push({
        name: route.name,
        path: route.path,
        url: fullUrl,
        error: err.message
      });
    }
  }

  await browser.close();

  // Save raw JSON
  const jsonPath = path.join(CONFIG.outputDir, 'axe-audit-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ timestamp: new Date().toISOString(), routeSummaries, allViolations }, null, 2));

  // Generate Markdown summary
  let md = `# Tool 1: Usability & Accessibility Defect Audit Report\n\n`;
  md += `**Timestamp:** ${new Date().toLocaleString()}\n`;
  md += `**Audited Base URL:** ${CONFIG.baseUrl}\n`;
  md += `**Total Defect Violations Found:** ${allViolations.length}\n\n`;

  // Severity breakdown
  const impactCount = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  allViolations.forEach(v => {
    impactCount[v.impact] = (impactCount[v.impact] || 0) + 1;
  });

  md += `### Impact Breakdown\n`;
  md += `- 🔴 **Critical:** ${impactCount.critical}\n`;
  md += `- 🟠 **Serious:** ${impactCount.serious}\n`;
  md += `- 🟡 **Moderate:** ${impactCount.moderate}\n`;
  md += `- ⚪ **Minor Inconveniences:** ${impactCount.minor}\n\n`;

  md += `### Per-Route Overview\n\n`;
  md += `| Route | Name | Violations | Incomplete / Review |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;
  routeSummaries.forEach(r => {
    md += `| \`${r.path}\` | **${r.name}** | ${r.violationsCount ?? 'Error'} | ${r.incompleteCount ?? 0} |\n`;
  });
  md += `\n---\n\n`;

  md += `### Detailed Defect Inconveniences by Severity\n\n`;
  const sortedViolations = [...allViolations].sort((a, b) => {
    const weights = { critical: 4, serious: 3, moderate: 2, minor: 1 };
    return (weights[b.impact] || 0) - (weights[a.impact] || 0);
  });

  if (sortedViolations.length === 0) {
    md += `🎉 **Zero usability violations found! Your UI conforms to all audited rules.**\n`;
  } else {
    sortedViolations.forEach((v, idx) => {
      md += `#### ${idx + 1}. [${v.impact.toUpperCase()}] ${v.help} (\`${v.id}\`)\n`;
      md += `- **Route:** \`${v.route}\` (${v.url})\n`;
      md += `- **Description:** ${v.description}\n`;
      md += `- **Rule Reference:** [Axe Rule Documentation](${v.helpUrl})\n`;
      md += `- **Offending DOM Elements:**\n`;
      v.nodes.slice(0, 5).forEach(node => {
        md += `  - **HTML:** \`${node.html.replace(/\n/g, ' ')}\`\n`;
        md += `  - **CSS Selector:** \`${node.target.join(' ')}\`\n`;
        if (node.failureSummary) {
          md += `  - **Remediation Note:** ${node.failureSummary.replace(/\n/g, ' ')}\n`;
        }
      });
      if (v.nodes.length > 5) {
        md += `  - *...and ${v.nodes.length - 5} more elements with this issue on this page.*\n`;
      }
      md += `\n`;
    });
  }

  const summaryPath = path.join(CONFIG.outputDir, 'axe-audit-summary.md');
  fs.writeFileSync(summaryPath, md);

  console.log(`\n✅ Tool 1 Completed!`);
  console.log(`Reports saved to:`);
  console.log(`- Summary: ${summaryPath}`);
  console.log(`- Raw Data: ${jsonPath}\n`);

  return { totalViolations: allViolations.length, impactCount };
}

runAxeAudit().catch(err => {
  console.error("Axe audit failed:", err);
  process.exit(1);
});
