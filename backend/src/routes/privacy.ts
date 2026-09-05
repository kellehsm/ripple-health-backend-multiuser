import { FastifyInstance } from "fastify";

const LAST_UPDATED = "September 5, 2026";
const CONTACT_EMAIL = "kjsmyre@gmail.com";
const APP_NAME = "Ripple Wellness";
const DOMAIN = "https://app.kels.gg";

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy — ${APP_NAME}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.7;
      color: #1a1a1a;
      background: #fafaf8;
      padding: 0 16px;
    }
    .container { max-width: 740px; margin: 0 auto; padding: 48px 0 80px; }
    h1 { font-size: 2rem; font-weight: 900; letter-spacing: -0.5px; margin-bottom: 6px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 40px; }
    h2 { font-size: 1.15rem; font-weight: 800; margin-top: 36px; margin-bottom: 10px; color: #111; }
    p { margin-bottom: 14px; color: #333; }
    ul { margin: 0 0 14px 20px; color: #333; }
    li { margin-bottom: 6px; }
    a { color: #0a7ea4; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .pill {
      display: inline-block;
      background: #e6f4f8;
      color: #0a7ea4;
      font-size: 13px;
      font-weight: 700;
      border-radius: 20px;
      padding: 2px 10px;
      margin-bottom: 2px;
    }
    hr { border: none; border-top: 1px solid #e5e5e5; margin: 36px 0; }
    .footer { color: #888; font-size: 13px; margin-top: 48px; }
  </style>
</head>
<body>
<div class="container">

  <h1>Privacy Policy</h1>
  <p class="meta">
    <strong>${APP_NAME}</strong> &nbsp;·&nbsp; Last updated: ${LAST_UPDATED}
  </p>

  <p>
    This Privacy Policy explains how ${APP_NAME} ("Ripple", "we", "our") collects, uses,
    and protects the personal information you provide when you use the Ripple Wellness mobile
    application and its associated server software (collectively, the "Service").
  </p>
  <p>
    By using the Service, you agree to the practices described in this policy.
  </p>

  <hr />

  <h2>1. Who We Are</h2>
  <p>
    Ripple Wellness is an independent personal wellness tracking application. The Service is
    operated by an individual developer. Questions about this policy can be directed to
    <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.
  </p>

  <h2>2. What Data We Collect</h2>
  <p>
    Ripple is built on the principle of <strong>user-controlled data</strong>. Your data is
    stored on a server you authorise — not on shared cloud infrastructure. We collect only
    what is necessary to provide the features you use.
  </p>

  <h3 style="font-size:1rem;font-weight:700;margin-top:20px;margin-bottom:8px;">2a. Account Data</h3>
  <ul>
    <li>Email address and hashed password (for authentication)</li>
    <li>Account creation date</li>
    <li>Optional display preferences (theme, tab layout, week-start day)</li>
  </ul>

  <h3 style="font-size:1rem;font-weight:700;margin-top:20px;margin-bottom:8px;">2b. Health &amp; Wellness Data</h3>
  <p>The following data is collected <strong>only if you enable the relevant feature</strong>:</p>
  <ul>
    <li><strong>Glucose readings</strong> — sourced from your Dexcom Share account via the Dexcom Share API</li>
    <li><strong>Steps, sleep, heart rate, exercise, weight, and oxygen saturation</strong> — sourced from Android Health Connect on your device</li>
    <li><strong>Mood check-ins</strong> — text and numeric ratings you enter manually</li>
    <li><strong>Meal logs</strong> — foods, portion sizes, and calorie estimates you log</li>
    <li><strong>Medication names, doses, and reminders</strong> — entered manually by you</li>
    <li><strong>Menstrual cycle data</strong> — entered manually by you</li>
    <li><strong>Water and substance intake</strong> — entered manually by you</li>
  </ul>

  <h3 style="font-size:1rem;font-weight:700;margin-top:20px;margin-bottom:8px;">2c. Financial Data</h3>
  <p>
    If you connect a bank account via <strong>Plaid</strong>, Ripple stores transaction
    descriptions, amounts, dates, and merchant categories to power spending insights. We store
    only what Plaid provides; we never store your bank credentials. Plaid's own privacy policy
    applies to the bank-linking process: <a href="https://plaid.com/legal/#end-user-privacy-policy" target="_blank">plaid.com/legal</a>.
  </p>

  <h3 style="font-size:1rem;font-weight:700;margin-top:20px;margin-bottom:8px;">2d. Activity &amp; Lifestyle Data</h3>
  <ul>
    <li><strong>Books</strong> — reading progress synced from your Hardcover.app account (if connected)</li>
    <li><strong>Hobbies &amp; custom trackers</strong> — entered manually by you</li>
    <li><strong>Journal entries</strong> — free-text notes you write</li>
    <li><strong>Weather</strong> — city-level weather data fetched for your configured location (no GPS used)</li>
  </ul>

  <h3 style="font-size:1rem;font-weight:700;margin-top:20px;margin-bottom:8px;">2e. Technical Data</h3>
  <ul>
    <li>Push notification tokens (for delivering reminders to your device)</li>
    <li>Server-side logs (request timestamps, error messages — no health data in logs)</li>
  </ul>

  <h2>3. How We Use Your Data</h2>
  <p>Your data is used exclusively to:</p>
  <ul>
    <li>Display your tracked metrics, trends, and insights within the app</li>
    <li>Generate daily AI summaries and correlation insights from your own data</li>
    <li>Send push notifications for reminders and alerts you have configured</li>
    <li>Back up your data to Google Drive (only if you connect Google Drive)</li>
    <li>Enable optional social features such as step challenges with friends (only data you explicitly choose to share)</li>
  </ul>
  <p>
    We do <strong>not</strong> use your data for advertising, do not sell it to third parties,
    and do not use it to train AI models.
  </p>

  <h2>4. Data Storage &amp; Security</h2>
  <p>
    Your data is stored on a private server at <strong>${DOMAIN}</strong>. All data is transmitted
    over HTTPS (TLS 1.2+). Sensitive credentials (Dexcom, Plaid tokens) are encrypted at rest
    using AES-256 encryption. Passwords are hashed using bcrypt and never stored in plaintext.
  </p>
  <p>
    Access to the server is restricted; no third party has access to your personal data except
    as described in Section 5.
  </p>

  <h2>5. Third-Party Services</h2>
  <p>Ripple integrates with the following third-party services. Each is opt-in and only
  activated when you choose to connect it:</p>
  <ul>
    <li>
      <span class="pill">Dexcom</span> — Glucose readings are fetched from the Dexcom Share
      API using credentials you provide. Dexcom's privacy policy applies to your Dexcom account.
    </li>
    <li>
      <span class="pill">Android Health Connect</span> — Steps, sleep, heart rate, exercise,
      and other health metrics are read from Health Connect on your device. Data is never sent
      to third parties.
    </li>
    <li>
      <span class="pill">Plaid</span> — Bank account connections are handled via Plaid's Link
      flow. We receive and store transaction data; we never receive or store your bank login
      credentials.
    </li>
    <li>
      <span class="pill">Google Drive</span> — Backup exports are uploaded to your personal
      Google Drive via OAuth 2.0. We access only the specific backup folder we create.
    </li>
    <li>
      <span class="pill">Hardcover.app</span> — Reading progress is synced from Hardcover using
      your account token if you connect it.
    </li>
    <li>
      <span class="pill">Passio Nutrition AI</span> — Food photos you take in the meal-logging
      scanner are sent to the Passio API for food recognition. Images are not stored by Ripple.
    </li>
    <li>
      <span class="pill">USDA FoodData Central</span> — Nutrition data is fetched from the
      publicly available USDA database for food lookups.
    </li>
    <li>
      <span class="pill">Open Food Facts</span> — Barcode scans may query the Open Food Facts
      public database for product information.
    </li>
  </ul>
  <p>
    Ripple does <strong>not</strong> include advertising SDKs, analytics SDKs, or crash-reporting
    services that transmit your personal data to third parties.
  </p>

  <h2>6. Data Sharing</h2>
  <p>
    Your personal data is <strong>never sold</strong> to third parties. Data is shared only:
  </p>
  <ul>
    <li>With third-party services you explicitly connect (see Section 5)</li>
    <li>With friends you invite to challenges, and only the specific metrics you choose to share
    (e.g., daily step count for a step challenge) — controlled by your Friend Sharing settings</li>
    <li>If required by law (e.g., a valid legal order)</li>
  </ul>

  <h2>7. Data Retention &amp; Deletion</h2>
  <p>
    Your data is retained for as long as your account is active. You may request deletion of
    your account and all associated data by emailing
    <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. Deletion will be completed
    within 30 days.
  </p>
  <p>
    You can export a full copy of your data at any time via <strong>Settings → Export &amp;
    Backup</strong> in the app.
  </p>

  <h2>8. Health Data Disclaimer</h2>
  <p>
    Ripple is a personal wellness tracking tool, <strong>not a medical device</strong>. Insights
    and correlations shown in the app are observations based on patterns in your own data only —
    they are never diagnoses, clinical assessments, or medical advice. Always consult a qualified
    healthcare professional before making health decisions based on any tracked metric.
  </p>

  <h2>9. Children's Privacy</h2>
  <p>
    The Service is not directed to children under the age of 13. We do not knowingly collect
    personal information from children under 13. If you believe a child has provided us with
    personal data, please contact us and we will promptly delete it.
  </p>

  <h2>10. Your Rights</h2>
  <p>Depending on your location, you may have the right to:</p>
  <ul>
    <li>Access the personal data we hold about you</li>
    <li>Correct inaccurate data</li>
    <li>Request deletion of your data</li>
    <li>Withdraw consent for data processing</li>
    <li>Port your data to another service</li>
  </ul>
  <p>
    To exercise any of these rights, contact us at
    <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.
  </p>

  <h2>11. Changes to This Policy</h2>
  <p>
    We may update this Privacy Policy from time to time. The "Last updated" date at the top
    of this page will reflect any changes. Continued use of the Service after changes are posted
    constitutes your acceptance of the revised policy.
  </p>

  <h2>12. Contact</h2>
  <p>
    Questions, concerns, or requests regarding this Privacy Policy should be directed to:
  </p>
  <p>
    <strong>${APP_NAME}</strong><br />
    <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>
  </p>

  <hr />

  <p class="footer">
    &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
  </p>

</div>
</body>
</html>`;

export default async function privacyRoute(app: FastifyInstance) {
  app.get("/", async (_req, reply) => {
    reply.type("text/html; charset=utf-8").send(HTML);
  });
}
