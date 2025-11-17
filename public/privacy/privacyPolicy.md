---
title: Privacy Policy
---

# Privacy Policy for Mindful Bookmarks
**Effective date:** {{ site.time | date: "%Y-%m-%d" }}

Mindful Bookmarks (“Mindful,” “we,” “us”) gives you control over your data. You can use Mindful entirely **offline** in *Local-Only mode*, with no login and no data leaving your device, or optionally turn on **Encrypted Sync** to back up and sync your bookmarks securely across devices.

---

## Storage Options

### 1) Local-Only (default)
- All bookmark data (URLs, titles, tags, group structure, and settings) is stored **only on your device** using Chrome’s `chrome.storage` API.
- Data never leaves your device and is not uploaded to any server.
- **Sign-in is not required.**
- Deleting the extension or clearing Chrome storage fully removes your data.

### 2) Encrypted Sync (optional)
- If you choose to enable Encrypted Sync, your bookmarks and workspace data are securely stored in our backend to keep them available across your signed-in devices.
- Data is encrypted in transit (HTTPS/TLS) and at rest using AWS-managed encryption (e.g., KMS).
- Only you and your authorized devices can decrypt your data.
- **Sign-in is required** to use this feature (via AWS Cognito through Amplify).
- We do not sell, share, or use your data for advertising or unrelated purposes.

---

## Data We Handle

| **Category** | **When Collected** | **Purpose** |
|--------------|-------------------|--------------|
| **Bookmark data & preferences** | Always (Local-Only or Encrypted Sync) | To store and organize your bookmarks, groups, and settings. |
| **Account info** (email, name, phone) | Only with Encrypted Sync | Used for authentication and account recovery through AWS Cognito. |
| **Diagnostics (non-content)** | Occasionally | Minimal error and performance metadata to maintain reliability. Does **not** include page text, keystrokes, or browsing history. |

We do **not** collect financial, health, personal communication, precise location, or unrelated personal data.

---

## Chrome Permissions Used

- **`storage`** – Save bookmarks and settings locally.
- **`tabs`** – Access tab URL/title *only* when you click **“Add bookmark”**, or list open tabs when you explicitly choose **“Import Open Tabs.”**  
  *No background reading or tracking.*
- **`bookmarks`** – Read from the Chrome Bookmarks API *only* when you choose **“Import from Chrome Bookmarks.”**
- **Host access** – Communicates solely with Mindful’s backend (AWS API Gateway, Cognito, S3) to provide login and sync when enabled.

---

## Your Controls

- **Choose storage mode** per workspace (Local-Only ↔ Encrypted Sync) anytime.
- **Export or import** bookmarks as JSON directly from the app.
- **Delete data**:  
  - *Local-Only:* Remove the extension or clear Chrome’s local storage.  
  - *Encrypted Sync:* In the app, go to *Settings → Encrypted Sync → Delete cloud data*. We permanently delete all copies from our servers immediately upon request.

---

## Security

- Transport security (HTTPS/TLS) and encryption at rest (AWS KMS-managed).
- Access to backend systems is tightly restricted, monitored, and audited.
- We do not execute or load remote code from third-party CDNs.

---

## Data Sharing & Selling

- We **never sell** personal information.  
- We **never share** user data except with service providers (e.g., AWS) that process it securely on our behalf and under strict data-processing agreements.

---

## Regional Rights

Depending on your location (e.g., GDPR or CCPA jurisdictions), you may have rights to access, correct, export, or delete your personal data.  
To exercise these rights, contact us using the email below.

---

## Children’s Privacy

Mindful Bookmarks is not intended for children under 13 years of age, and we do not knowingly collect data from them.

---

## Contact

Questions, feedback, or data-related requests?  
Email: `privacy@mindfulbookmarks.com`

---

## Changes to This Policy

We may update this Privacy Policy to reflect product or legal changes. The “Effective date” above will always show the latest version. If changes are material, we will provide notice within the app.

_Last updated: {{ site.time | date: "%Y-%m-%d" }}_