# ⚡ SentinelFlow AI — Automated Quality, Security & Reliability Pipeline

> **Deterministic tools find evidence. AI interprets evidence. Linear tracks work. Slack communicates it.**

SentinelFlow AI is an enterprise-grade automated CI/CD quality engineering system that connects **GitHub Actions**, **deterministic test suites**, **secret/credential scanning**, **AI code review & Root Cause Analysis (RCA)**, **Linear issue tracking with deduplication**, and **Slack notifications**.

---

## 🏗️ Architecture Overview

```text
Developer Opens PR ────► GitHub Actions CI
                               │
       ┌───────────────────────┴───────────────────────┐
       ▼                                               ▼
Deterministic Checks (Lint, Types, Tests)     Security & Secret Scan
       │                                               │
       └───────────────────────┬───────────────────────┘
                               ▼
                   Evidence Collector (Redacts Secrets)
                               ▼
                   AI Review & Failure RCA Agent
                               ▼
                   Linear Triage & Deduplication
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
     Linear Issue Tracker             Slack Block Kit Alert
   (Automated Bug / Security)       (Status & Direct Deep-Links)
               │                               │
               └───────────────┬───────────────┘
                               ▼
                   GitHub PR Status & Comments
```

---

## 🚀 Quick Start & Local Simulation

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/your-username/SentinelFlow.git
cd SentinelFlow

# Install dependencies
npm install

# Build TypeScript
npm run build
```

### 2. Run Test Suite
```bash
npm test
```

### 3. Run Pre-Configured Simulations

SentinelFlow includes three dry-run simulation scenarios to test every branch of the pipeline locally:

```bash
# Scenario 1: Clean Pull Request (All tests pass, security scan clean, green Slack notification)
npm run simulate:pass

# Scenario 2: Test Failure & Regression (AI Root Cause Analysis, Linear ticket created, Slack alert)
npm run simulate:fail

# Scenario 3: Critical Security Leak (AWS token detected, in-memory redaction, P0 Linear security bug, Slack alert)
npm run simulate:security
```

---

## 🔑 Integrations Setup Guide

### 1. Linear Integration
SentinelFlow creates clean, structured defect tickets and automatically queries your workspace to prevent duplicate issues.
1. Log in to [Linear](https://linear.app).
2. Go to **Settings** ➔ **Account** ➔ **Security & Access** ➔ **Personal API Keys**.
3. Create a new key and copy the token.
4. Set in your `.env` (or GitHub Secrets):
   ```env
   LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxx
   LINEAR_TEAM_KEY=ENG
   ```

### 2. Slack Integration
SentinelFlow sends formatted **Block Kit** cards directly to your engineering team's channel.
1. Go to [Slack API: Incoming Webhooks](https://api.slack.com/messaging/webhooks).
2. Create or select a Slack App and enable **Incoming Webhooks**.
3. Click **Add New Webhook to Workspace**, select your target channel (e.g. `#alerts-quality-engineering`), and copy the URL.
4. Set in your `.env` (or GitHub Secrets):
   ```env
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   ```

### 3. AI Providers (OpenAI or Gemini)
1. **OpenAI**: Set `OPENAI_API_KEY=sk-...` (default model: `gpt-4o`).
2. **Gemini**: Set `GEMINI_API_KEY=...` (default model: `gemini-1.5-flash`).
*(Note: If no AI key is provided, SentinelFlow uses its built-in deterministic heuristic analysis).*

---

## 🐙 Setting Up on GitHub & GitHub Actions

### 1. Push to GitHub
```bash
git add .
git commit -m "feat: Initialize SentinelFlow AI Quality Pipeline"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/<YOUR_REPO_NAME>.git
git push -u origin main
```

### 2. Configure GitHub Repository Secrets
Navigate to your repository on GitHub:
**Settings** ➔ **Secrets and variables** ➔ **Actions** ➔ **New repository secret**

Add the following secrets:
- `LINEAR_API_KEY`: Your Linear Personal API Key.
- `LINEAR_TEAM_KEY`: `ENG` (or your team's key).
- `SLACK_WEBHOOK_URL`: Your Slack Incoming Webhook URL.
- `OPENAI_API_KEY` (or `GEMINI_API_KEY`): Your LLM API key.

The `.github/workflows/sentinelflow.yml` workflow will automatically trigger on any Pull Request opened or updated in your repository!

---

## 📚 Tech Lead Handbook: CI/CD & PR Lifecycles

### Why Shift-Left Quality & DevSecOps Matter
- **Cost of Defects**: Fixing a defect in a PR costs a fraction of fixing it after production deployment.
- **Deterministic First**: Always run fast, deterministic checks (type checking, linting, unit tests, secret scanning) before invoking AI. AI interprets the evidence produced by deterministic tools.
- **Zero Credential Exposure**: Never log plaintext secrets or transmit raw API keys to external LLMs. SentinelFlow applies in-memory secret masking before AI analysis.
- **Deduplication**: Automatically matching failures against existing issue trackers keeps engineering backlogs clean and actionable.

---

## 📄 License
MIT License. Built for engineering teams striving for zero-defect velocity.
