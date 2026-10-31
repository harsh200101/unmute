/**
 * Master Orchestrator: Runs Tool 1 (Axe), Tool 2 (Viewport/Console), and Tool 3 (Vision)
 * Compiles all micro-inconveniences and defects into a unified MASTER_UI_FEEDBACK.md report.
 */
import { fork } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import { CONFIG } from './config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkServerAlive(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    console.log(`\n======================================================`);
    console.log(`🚀 Executing: ${path.basename(scriptPath)}`);
    console.log(`======================================================`);
    const proc = fork(scriptPath, [], { stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(scriptPath)} exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

async function runAll() {
  console.log(`\n🚀 [Frontend UI Testing & Bug Detection Suite] Starting All 3 Tools...`);
  console.log(`Target: ${CONFIG.baseUrl}`);

  const isAlive = await checkServerAlive(CONFIG.baseUrl);
  if (!isAlive) {
    console.warn(`\n⚠️  WARNING: Local server at ${CONFIG.baseUrl} is currently offline or unreachable!`);
    console.warn(`👉 Please start your frontend dev server in another terminal (e.g. 'npm run dev' inside frontend/)`);
    console.warn(`👉 Or specify custom URL with AUDIT_BASE_URL="http://your-host:port" node ...\n`);
  }

  try {
    // Tool 1
    await runScript(path.join(__dirname, 'run-axe-audit.mjs'));
  } catch (err) {
    console.error(`Tool 1 encountered an issue:`, err.message);
  }

  try {
    // Tool 2
    await runScript(path.join(__dirname, 'run-viewport-audit.mjs'));
  } catch (err) {
    console.error(`Tool 2 encountered an issue:`, err.message);
  }

  try {
    // Tool 3
    await runScript(path.join(__dirname, 'run-vision-audit.mjs'));
  } catch (err) {
    console.error(`Tool 3 encountered an issue:`, err.message);
  }

  // Compile Master Report
  const masterPath = path.join(CONFIG.outputDir, 'MASTER_UI_FEEDBACK.md');
  const axeSummaryPath = path.join(CONFIG.outputDir, 'axe-audit-summary.md');
  const viewportSummaryPath = path.join(CONFIG.outputDir, 'viewport-audit-report.md');
  const visionSummaryPath = path.join(CONFIG.outputDir, 'vision-audit-report.md');

  let masterMd = `# 🛡️ Frontend Master UI & Usability Audit Report\n\n`;
  masterMd += `**Generated:** ${new Date().toLocaleString()}\n`;
  masterMd += `**Target URL:** ${CONFIG.baseUrl}\n\n`;
  masterMd += `This comprehensive audit combines all 3 specialized testing tools to capture major bugs, visual glitches, and subtle micro-inconveniences.\n\n`;
  masterMd += `## Quick Tool Navigation\n`;
  masterMd += `1. **[Tool 1: Usability, Contrast & Micro-Inconveniences (Axe-Core)](#1-tool-1-usability--accessibility-audit)**\n`;
  masterMd += `2. **[Tool 2: Viewport Overflows, Layout Shifts & Console Errors](#2-tool-2-multi-viewport--layout-shift-audit)**\n`;
  masterMd += `3. **[Tool 3: AI Vision Aesthetic & Spatial Hierarchy](#3-tool-3-ai-vision-ui-inspector)**\n\n`;
  masterMd += `---\n\n`;

  if (fs.existsSync(axeSummaryPath)) {
    masterMd += `## 1. Tool 1: Usability & Accessibility Audit\n\n`;
    masterMd += fs.readFileSync(axeSummaryPath, 'utf8') + `\n\n---\n\n`;
  }

  if (fs.existsSync(viewportSummaryPath)) {
    masterMd += `## 2. Tool 2: Multi-Viewport & Layout Shift Audit\n\n`;
    masterMd += fs.readFileSync(viewportSummaryPath, 'utf8') + `\n\n---\n\n`;
  }

  if (fs.existsSync(visionSummaryPath)) {
    masterMd += `## 3. Tool 3: AI Vision UI Inspector\n\n`;
    masterMd += fs.readFileSync(visionSummaryPath, 'utf8') + `\n\n`;
  }

  fs.writeFileSync(masterPath, masterMd);

  console.log(`\n======================================================`);
  console.log(`🎉 Master UI Feedback compiled successfully!`);
  console.log(`📁 File: ${masterPath}`);
  console.log(`======================================================\n`);
}

runAll().catch(err => {
  console.error("Master audit failed:", err);
  process.exit(1);
});
