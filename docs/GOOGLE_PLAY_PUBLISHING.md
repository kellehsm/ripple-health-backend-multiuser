# Google Play Store Publishing Requirements (2026)

---

## 1. Developer Account Setup

- **One-time $25 registration fee** (no annual renewal)
- **Identity verification** — government-issued ID required; mandatory for all developers
- **Two-step verification** — must be enabled on your Google account (enforced in 2026)
- **Email + phone verification** for organization accounts
- Accept the **Google Play Developer Distribution Agreement**
- Accept the **Paid Applications Agreement** (if monetizing)

---

## 2. Account Type: Personal vs. Organization

| | Personal | Organization |
|---|---|---|
| Mandatory closed testing | Yes — 12 active testers for 14 consecutive days | No |
| Direct production access | Only after testing requirement | Yes |

---

## 3. Technical Requirements

### App Bundle Format
- New apps **must submit as AAB** (Android App Bundle) — APK only allowed for updates to existing APK-based apps

### Target API Level
- Currently: **Android 15 (API 35)** minimum
- **August 31, 2026**: Must target **Android 16 (API 36)** or higher
- Wear OS / Automotive OS: API 35; Android TV: API 34

### 16KB Memory Page Size
- Required for all apps targeting Android 15+ (enforced November 1, 2025)

### App Signing
- All AABs must use **Play App Signing** (two-key system)
  - Upload key: you sign locally
  - App signing key: held by Google
- Keep your upload key backed up securely — losing it blocks future updates

### Billing Library (if monetizing)
- Must use **Google Play Billing Library v8+** by August 31, 2026

---

## 4. Store Listing Requirements

| Field | Limit |
|---|---|
| App title | 50 characters |
| Short description | 80 characters |
| Full description | 4,000 characters |

- Select an accurate **app category**
- All descriptions must accurately reflect functionality — no misleading claims

---

## 5. Visual Assets

| Asset | Specs |
|---|---|
| App icon | 512×512 px, 32-bit PNG, under 1024 KB |
| Screenshots | Min 4, max 8; 1080×1920 (portrait) or 1920×1080 (landscape); JPEG or 24-bit PNG |
| Feature graphic | 1024×500 px, JPEG or 24-bit PNG |

- **March 31, 2026**: Icons will auto-render with 30% corner radius — keep key visuals within 15-18% padding safe zone
- No transparency/alpha channels in any assets

---

## 6. Privacy Policy & Data Safety

- **Privacy policy is mandatory** — link required in Play Console and inside the app itself
- Must comply with GDPR, CCPA, and applicable regional laws
- **Data Safety form** must be completed (even if zero data collected, must declare that)
- Must audit and declare **all third-party SDKs** (analytics, ads, crash reporters, etc.)
- Google cross-checks declared practices against actual app behavior (strictly enforced in 2026)

---

## 7. Permissions

- Declare all required permissions in `AndroidManifest.xml`
- Request **only permissions the app genuinely needs**
- Permissions may only be used for **core app functionality**
- Cannot sell or misuse any sensitive data obtained via permissions

---

## 8. Content Rating (IARC)

- Complete the **IARC content rating questionnaire** in Play Console
- Provides ratings across Australia (ACB), Brazil (ClassInd), South Korea (GRB), and international regions
- **Apps cannot be unrated** — must re-submit if content changes significantly
- Stricter age verification in 2026 for gambling, health, and other sensitive categories

---

## 9. Testing (Personal Developer Accounts)

- **12 active testers** must opt in and use the app
- Must run for **14 consecutive days**
- Google verifies testers actually engaged with the app (2026 enforcement)
- After 14 days, complete a **production access questionnaire** (10 questions about testing process, feedback, and changes made)
- Organization accounts skip this requirement

---

## 10. App Review Process

- Review typically takes **a few hours to several days**
- Build in a **3-week buffer**: 2 weeks testing + 1 week review
- Google checks: content compliance, functionality, security, policy adherence
- If rejected, fix issues and resubmit — you can appeal if rejection was in error

---

## 11. Monetization Setup (If Applicable)

- Create a **Google Payments merchant account** linked to Play Console
- Provide: business address (no PO boxes), tax ID, bank account details
- Bank account must be in same country as payments profile
- Verify bank account (instant via online banking, or 2-3 days via micro-deposit)

### New Fee Structure (effective June 30, 2026)
- Under $1M/year: flat **10% service fee** + ~5% billing fee
- Over $1M/year: 20-25% on one-time purchases + billing fee
- Developers can now use **alternative billing systems** alongside Google Play Billing

---

## 12. Developer Policy Compliance

Key policy areas to comply with:
- **Permissions**: No over-requesting; only for core functionality
- **Child safety**: Zero tolerance for CSAM; strict age verification
- **Health/medical**: Must disclose sources, limitations, and avoid misleading claims
- **Sensitive data**: Cannot sell user data; must audit all SDKs
- **Content**: No hate speech, fraud, malware, copyright infringement
- **Foreground services**: Geofencing removed as approved use case in 2026 — use the Geofence API instead

---

## 13. Accessibility

- WCAG 2.1 Level AA compliance expected (most regions)
- Key requirements: 48×48dp touch targets, orientation support, color contrast ratios, alternatives to complex gestures
- ADA Title III, Section 508, and European Accessibility Act apply

---

## 14. Key Deadlines

| Date | Requirement |
|---|---|
| Nov 1, 2025 | 16KB memory page size support for Android 15+ apps |
| Aug 31, 2026 | Target Android 16 (API 36) |
| Aug 31, 2026 | Play Billing Library v8+ required |
| Jun 30, 2026 | New billing fee structure (US, UK, EEA) |
| Feb 2027 | New technical quality / "bad behavior" thresholds |
| Apr 2027 | Zero-tap restore credentials support required |

---

## 15. Pre-Submission Checklist

### Account
- [ ] Developer account created + identity verified + 2FA enabled
- [ ] Merchant account + bank account verified (if monetizing)

### Technical
- [ ] App signed with Play App Signing (AAB format)
- [ ] Targets API 35+ (API 36 by Aug 31, 2026)
- [ ] 16KB memory page size support
- [ ] Billing Library v8+ integrated (if in-app purchases)
- [ ] App tested across multiple devices and Android versions

### Store Listing
- [ ] App title written (max 50 chars)
- [ ] Short description written (max 80 chars)
- [ ] Full description written (max 4,000 chars)
- [ ] App category selected
- [ ] App icon uploaded (512×512 px, 32-bit PNG)
- [ ] 4–8 screenshots uploaded (1080×1920 or 1920×1080 px)
- [ ] Feature graphic uploaded (1024×500 px)

### Legal & Compliance
- [ ] Privacy policy linked in Play Console and in-app
- [ ] Data Safety form completed
- [ ] All third-party SDKs audited and declared
- [ ] IARC content rating questionnaire completed
- [ ] All developer policies reviewed and complied with

### Testing (Personal Accounts)
- [ ] Closed testing track created
- [ ] 12+ testers opted in and actively using the app
- [ ] 14 consecutive days of testing completed
- [ ] Production access questionnaire answered
