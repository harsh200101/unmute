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

