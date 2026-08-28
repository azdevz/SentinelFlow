# 🔌 SentinelFlow AI — Complete End-to-End Integration Guide

This guide walks you step-by-step through connecting **Slack**, **Linear**, **GitHub Actions**, and **AI Models (OpenAI / Gemini)** with SentinelFlow.

---

## 📑 Table of Contents
1. [Part 1: Slack App & Incoming Webhook Setup](#part-1-slack-app--incoming-webhook-setup)
2. [Part 2: Linear API Key & Team Setup](#part-2-linear-api-key--team-setup)
3. [Part 3: AI Provider Key Setup](#part-3-ai-provider-key-setup)
4. [Part 4: Local Configuration (`.env`)](#part-4-local-configuration-env)
5. [Part 5: GitHub Actions Secrets Setup](#part-5-github-actions-secrets-setup)
6. [Part 6: Triggering Your First Live Pull Request](#part-6-triggering-your-first-live-pull-request)

---

## Part 1: Slack App & Incoming Webhook Setup

### Step 1.1: Create the Slack App
1. Open [Slack API: Your Apps](https://api.slack.com/apps).
2. Click **Create New App** ➔ Choose **From scratch**.
3. **App Name:** `SentinelFlow` (or `SentinelFlow AI`).
4. **Pick a workspace:** Select your company or team Slack workspace.
5. Click **Create App**.

### Step 1.2: Enable Incoming Webhooks
1. In the left sidebar under *Features*, click **Incoming Webhooks**.
2. Toggle the switch to **Activate Incoming Webhooks** (turn ON).
3. Scroll down and click **Add New Webhook to Workspace**.
4. Select the channel where SentinelFlow should post alerts (e.g. `#alerts-engineering`, `#sentinelflow-notifications`, or `#dev-alerts`).
5. Click **Allow**.

### Step 1.3: Copy Webhook URL
Copy the generated Webhook URL. It looks like:
```text
https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```
> 💡 *Save this URL. You will use it as `SLACK_WEBHOOK_URL`.*

---

## Part 2: Linear API Key & Team Setup

### Step 2.1: Generate a Personal API Key
1. Log in to [Linear](https://linear.app).
2. Click on your profile avatar in the bottom-left ➔ **Settings**.
3. Under *Account*, click **Security & Access** (or navigate directly to [linear.app/settings/account/security](https://linear.app/settings/account/security)).
4. Scroll to **Personal API Keys**.
5. Click **New API Key** ➔ Name it `SentinelFlow CI` ➔ Click **Create**.
6. Copy the key (starts with `lin_api_...`).
> 💡 *Save this key. You will use it as `LINEAR_API_KEY`.*

### Step 2.2: Find Your Linear Team Key
1. In Linear, go to **Settings** ➔ **Teams**.
2. Click on your target team (e.g., Engineering).
3. Look at the **Team Key / Identifier** (usually 3-4 letters, like `ENG`, `DEV`, `PROD`, `SF`).
> 💡 *Save this key. You will use it as `LINEAR_TEAM_KEY` (e.g., `ENG`).*

---

## Part 3: AI Provider Key Setup

SentinelFlow can use either **OpenAI** or **Google Gemini** (or fallback to built-in heuristic analysis if running offline):

* **Option A: OpenAI**
  1. Go to [OpenAI API Keys](https://platform.openai.com/api-keys).
  2. Create a new secret key (starts with `sk-...`).
  3. Set as `OPENAI_API_KEY`.

* **Option B: Google Gemini**
  1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
  2. Click **Create API Key**.
  3. Set as `GEMINI_API_KEY`.

---

## Part 4: Local Configuration (`.env`)

To test locally with real Slack and Linear accounts:

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and fill in your keys:
   ```env
   # AI Provider
   OPENAI_API_KEY=sk-your-openai-api-key
   # or GEMINI_API_KEY=your-gemini-key

   # Linear Integration
   LINEAR_API_KEY=lin_api_your_linear_key
   LINEAR_TEAM_KEY=ENG

   # Slack Integration
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

   # Thresholds
   SENTINELFLOW_AUTO_TICKET_THRESHOLD=0.90
   ```

3. Test your live integrations locally using the built-in simulations:
   ```bash
   # Test green PR notification in Slack
   npm run simulate:pass

   # Test defect detection: creates real Linear issue and sends Slack failure card
   npm run simulate:fail

   # Test security leak: creates P0 Linear security ticket and sends Slack alert
   npm run simulate:security
   ```

---

## Part 5: GitHub Actions Secrets Setup

To run SentinelFlow automatically whenever someone opens a Pull Request on GitHub:

### Step 5.1: Push Code to GitHub
```bash
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git
git branch -M main
git push -u origin main
```

### Step 5.2: Add Secrets to GitHub Repository
1. On GitHub, navigate to your repository.
2. Go to **Settings** (top tab) ➔ **Secrets and variables** (left sidebar) ➔ **Actions**.
3. Under *Repository secrets*, click **New repository secret** for each of the following:

| Secret Name | Value | Purpose |
| :--- | :--- | :--- |
| `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/services/...` | Dispatches Slack notifications |
| `LINEAR_API_KEY` | `lin_api_...` | Searches and creates Linear issues |
| `LINEAR_TEAM_KEY` | `ENG` | Target team in Linear |
| `OPENAI_API_KEY` | `sk-...` | AI code review & failure RCA |
| `GEMINI_API_KEY` | *(Optional if using OpenAI)* | Alternative AI provider |

*(Note: `GITHUB_TOKEN` is automatically created and injected by GitHub Actions with no manual setup needed).*

---

## Part 6: Triggering Your First Live Pull Request

1. Create a new branch:
   ```bash
   git checkout -b feat/add-payment-webhook
   ```

2. Make a small code change or add a test.
3. Commit and push:
   ```bash
   git add .
   git commit -m "feat: Add payment webhook handler"
   git push -u origin feat/add-payment-webhook
   ```

4. Open a **Pull Request** on GitHub against `main`.
5. **Watch the automation run:**
   - GitHub Actions will automatically start the **SentinelFlow AI Quality & Security Pipeline**.
   - Typechecking, unit tests, and secret scans will execute.
   - AI will review the PR diff and test outcomes.
   - A detailed summary comment will be added to the GitHub PR.
   - Any defects will appear on your Linear board.
   - Slack will receive the formatted status card!

---

## 🛠️ Troubleshooting & FAQ

* **Q: Slack notification is not appearing?**
  * Verify the Webhook URL is valid and the bot has permission to post to that channel.
* **Q: Linear issue creation failed?**
  * Check that `LINEAR_TEAM_KEY` matches the exact uppercase team key (e.g. `ENG`) in your Linear workspace.
* **Q: Will raw API keys be exposed to the AI?**
  * No. SentinelFlow includes an in-memory secret redactor that masks all detected credentials before any text is sent to LLMs or output to logs.
