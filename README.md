# VC Decision Engine
> AI-assisted sourcing & decision system for early-stage startups

---

## Overview

The **VC Decision Engine** is a multi-agent system designed to improve how early-stage startups are sourced, filtered, and evaluated.

It addresses a core inefficiency in venture capital:

- Too much time spent collecting information
- Weak signals identified too late
- Decisions driven by narratives instead of data

**Goal:**
- Standardize early-stage evaluation
- Filter weak opportunities early
- Support structured, signal-driven decisions

---

## Architecture

The system operates in two main phases:

```
Sourcing (Filtering Layer)  →  Due Diligence (Decision Layer)
```

### Sourcing Layer — Filtering

**Objective:** eliminate weak deals early

| Agent | Role |
|---|---|
| Scouter | Identifies startups from online sources |
| Signal Extractor | Collects structured signals (team, traction, market, etc.) |
| Kill Agent | Applies hard rules to eliminate weak startups |
| Thesis Fit | Enforces fund-specific constraints |
| Decision | Only strong candidates pass to the next stage |

**Output:** a clean, high-quality pipeline

#### Pipeline Gate

Only startups that meet **both** conditions proceed:

- Strong signal quality
- Clear thesis alignment

All others are filtered out.

---

### Due Diligence Layer — Decision

**Objective:** break the deal

**Evaluation Framework:**

- Founder
- Product
- Traction *(revenue / contracts only)*
- Market
- Why now
- Risk

**Final Step — Falsification:**
Identifies why the startup might fail → Decision: **Proceed / Pass**

---

## Agent Documentation

Full agent logic and workflows:

👉 [UV Decision Engine — Claude Code Orchestrator](https://lucaroggi.notion.site/UV-Decision-Engine-Claude-Code-Orchestrator-3324957b8fa180cd9fcac9daee2ee0c6)

Includes:
- Agent roles
- Prompt structure
- Execution logic
- Decision rules
- Iteration history

---

## System Principles

| Principle | Description |
|---|---|
| Default = PASS | Burden of proof is on investment |
| Signals > Narratives | Data overrides storytelling |
| Missing data = negative signal | Incomplete info is penalised |

---

## Iteration & Learning

The system evolves through structured feedback loops:

```
Early versions → over-selected startups
        ↓
Introduced kill rules and stricter filtering
        ↓
Added traction discipline
        ↓
Moved thesis filtering earlier
        ↓
Fewer but higher-quality startups
Reduced false positives
More actionable decisions
```

---

## Use Cases

- Venture Capital firms
- Angel investors
- Startup accelerators
- Innovation teams

---

## Author

**Luca Roggi**
MSc Business Administration & Data Science — Copenhagen Business School

- 🗂 [Portfolio](https://lucaroggi.notion.site/Portfolio-d3767933336d49a3995e7a5a633aa716)
- 💼 [LinkedIn](https://linkedin.com/in/luca-roggi)

---

## Notes

> This system does not replace investors.
> It is designed to reduce noise and structure thinking.
