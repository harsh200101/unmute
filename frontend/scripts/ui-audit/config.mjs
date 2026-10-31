/**
 * Configuration for Frontend UI Auditing & Bug Detection Suite
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CONFIG = {
  // Target base URL (defaults to live deployed Render app)
  baseUrl: process.env.AUDIT_BASE_URL || 'https://unmute-frontend.onrender.com',

  // Directory to store raw reports and screenshots
  outputDir: path.resolve(__dirname, '../../ui-reports'),
  screenshotDir: path.resolve(__dirname, '../../ui-reports/screenshots'),

  // Key routes to audit thoroughly, including wallet, auth, and legal pages
  routes: [
    { name: 'landing', path: '/' },
    { name: 'wallet', path: '/wallet' },
    { name: 'login', path: '/login' },
    { name: 'register', path: '/register' },
    { name: 'mentors', path: '/mentors' },
    { name: 'crisis', path: '/crisis' },
    { name: 'terms', path: '/terms' },
    { name: 'privacy', path: '/privacy' },
    { name: 'refund-policy', path: '/refund-policy' },
    { name: 'notifications', path: '/me/notifications' }
  ],

  // Screen viewports to test for responsive and layout shortcomings
  viewports: [
    { name: 'mobile', width: 375, height: 667 },    // Typical iPhone SE / standard mobile
    { name: 'tablet', width: 768, height: 1024 },   // iPad / Tablet
    { name: 'desktop', width: 1440, height: 900 }   // High-res desktop
  ]
};
