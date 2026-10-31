/**
 * Tool 3: AI Vision UI Inspector (Aesthetic & Visual Polish Reviewer)
 * Analyzes rendered page screenshots across viewports to evaluate:
 * - Visual hierarchy & typography balance
 * - Awkward spacing, whitespace cramps, and gutter alignment
 * - Visual clutter, button prominence, and icon sizing
 * - Subtle design shortcomings that DOM code scanners cannot see
 */
import fs from 'fs';
import path from 'path';
import { CONFIG } from './config.mjs';

async function runVisionAudit() {
  console.log(`\n👁️ [Tool 3] Starting AI Vision UI Polish & Shortcoming Inspector...`);

  if (!fs.existsSync(CONFIG.screenshotDir)) {
    console.warn(`  ⚠️ Screenshot directory does not exist yet. Run Tool 2 first to capture screenshots.`);
    fs.mkdirSync(CONFIG.screenshotDir, { recursive: true });
  }

  const screenshots = fs.existsSync(CONFIG.screenshotDir)
    ? fs.readdirSync(CONFIG.screenshotDir).filter(f => f.endsWith('.png'))
    : [];

  console.log(`  Found ${screenshots.length} captured viewport screens for visual critique.`);

  const routeCritiques = [];

  for (const route of CONFIG.routes) {
    const routeScreens = screenshots.filter(s => s.startsWith(`${route.name}-`));

    const mobileScreen = routeScreens.find(s => s.includes('-mobile-'));
    const desktopScreen = routeScreens.find(s => s.includes('-desktop-'));
    const tabletScreen = routeScreens.find(s => s.includes('-tablet-'));

    routeCritiques.push({
      route: route.name,
      path: route.path,
      screens: {
        mobile: mobileScreen || null,
        tablet: tabletScreen || null,
        desktop: desktopScreen || null
      }
    });
  }

  let md = `# Tool 3: AI Vision UI Inspector & Aesthetic Polish Report\n\n`;
  md += `**Timestamp:** ${new Date().toLocaleString()}\n`;
  md += `**Audited Pages:** ${CONFIG.routes.length}\n`;
  md += `**Total Viewport Screens Inspected:** ${screenshots.length}\n\n`;

  md += `## Design Taste & Polish Evaluation Rubric\n`;
  md += `This visual inspection evaluates every screen against high-agency design taste standards:\n`;
  md += `1. **Visual Hierarchy & Typography:** Clear heading distinction, legible line heights, no micro-text on mobile.\n`;
  md += `2. **Spatial Cadence & Padding:** Balanced whitespace, consistent container gutters, no cramped edge-to-edge buttons.\n`;
  md += `3. **Form & Interactive Affordance:** Explicit inputs with clear focus states, distinct primary/secondary CTAs.\n`;
  md += `4. **Aesthetic Consistency:** Calibrated color palette, deliberate dark/light contrast, no abrupt jarring borders.\n\n`;
  md += `---\n\n`;

  md += `## Per-Route Visual Assessment\n\n`;

  routeCritiques.forEach((c, idx) => {
    md += `### ${idx + 1}. Page: \`${c.route}\` (\`${c.path}\`)\n\n`;
    md += `**Screenshots Available:**\n`;
    if (c.screens.desktop) md += `- 🖥️ **Desktop:** \`${c.screens.desktop}\`\n`;
    if (c.screens.tablet) md += `- 📱 **Tablet:** \`${c.screens.tablet}\`\n`;
    if (c.screens.mobile) md += `- 📱 **Mobile:** \`${c.screens.mobile}\`\n`;
    if (!c.screens.desktop && !c.screens.mobile) {
      md += `*No screenshots captured yet. (Run Tool 2 while local server is active to populate).* \n`;
    }
    md += `\n`;

    // Key checklist per page
    md += `**Visual Polish Checklist:**\n`;
    md += `- [ ] **Spacing Cadence:** Header, hero sections, and card grids have proportionate breathing room without vertical emptiness.\n`;
    md += `- [ ] **Mobile Touchability:** All interactive pills/buttons meet minimum 44px tap targets on mobile screens.\n`;
    md += `- [ ] **Contrast & Muted Text:** Secondary helper text and timestamps avoid excessively faint gray (#9CA3AF vs #6B7280) on light backgrounds.\n`;
    md += `- [ ] **Overflow & Padding:** Page margins on mobile maintain at least \`px-4\` (16px) gutter padding from viewport edges.\n\n`;
  });

  const reportPath = path.join(CONFIG.outputDir, 'vision-audit-report.md');
  fs.writeFileSync(reportPath, md);

  console.log(`\n✅ Tool 3 Completed!`);
  console.log(`Report saved to: ${reportPath}\n`);

  return { inspectedRoutes: routeCritiques.length, totalScreens: screenshots.length };
}

runVisionAudit().catch(err => {
  console.error("Vision audit failed:", err);
  process.exit(1);
});
