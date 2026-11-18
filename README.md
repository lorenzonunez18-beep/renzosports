# V18 Quant Edge update

Adds weighted empirical player distributions, chronological fixed-line holdouts, 20-game selector and fresh exact-line market break-even/no-vig comparisons. No calibrated edge or new live feed. Existing deployment steps below.

# V17 player-stat category repair

**Main fix:** ESPN may place an RB's rushing yards, receiving yards, receptions,
and rushing/receiving TDs in a *combined* `rushingReceiving` game-log group.
Earlier versions searched only a group named `rushing` or `receiving` and
mistakenly declared those columns missing even when the source returned them.
V17 resolves the full metric names across ESPN groups and only uses abbreviated
`YDS`/`TD` columns where their category is unambiguous, preventing fake values.

We tested the screenshot-like combined category shape, separate-category shape,
NBA statistics, event-date filtering, and mobile player/market selection with
fixture payloads. **Live ESPN / Netlify / bookmaker data was not accessible
from the build environment.** After deployment verify the player and the season.

A Netlify project created afresh also needs its own `ODDS_API_KEY` environment
variable and a new deploy; no key is included here. This app remains an
experimental research tool, not a verified high-accuracy or gambling model.

---

# Renzo's Sports Lab V17 — Selectable Touchdowns Fix

**Update from V15** (no need to start another repository):
- The Odds & Lines screen has an **Open touchdown markets** shortcut.
- NFL player prop selection now shows **Touchdown picks** and **Yards & receptions** as visible wrapping buttons, not horizontally hidden, disabled controls.
- **Anytime TD (1+)**, **2+ touchdowns**, **first/last TD scorer** (sportsbook-only), **rushing TDs**, **receiving TDs**, and **passing TDs** are selectable in appropriate position menus.
- ESPN missing stats no longer disable the market buttons or force a different selected market.
- History-based 2+ touchdown results refer to offensive rushing + receiving TDs, and require an observed history. First/last TD order cannot be inferred from seasonal stat totals.
- Optional The Odds API maps the new on-demand TD markets to provider-supported keys; first/last TD and all player sportsbook offers may be absent due to plan, game status, and bookmaker coverage.
- No key required for selectable menus or for historical props that the unofficial ESPN feed actually returns. **No invented odds or projections.**

## Upload
In your existing GitHub repo, replace `index.html`, `netlify.toml`, `README.md`, and `netlify/functions/sports.js`, keeping the function path intact. Commit, then verify Netlify shows Published. Your app header and `/.netlify/functions/sports?health=1` should report version `16.0`. No new API key is required if you already have `ODDS_API_KEY` configured on Netlify.

## Limitations
- This is not an accuracy-validated or guaranteed profit model.
- ESPN player-game-log availability and field mappings are unofficial and can fail; missing historical stats are displayed honestly.
- Sportsbook TD props require The Odds API access and bookmakers offering the market, normally for upcoming games. Check provider terms and resale rights before paid distribution.
- A `health=1` success only validates your deployed function, not access to every ESPN or odds endpoint.

# Renzo's Sports Lab V15 — Research Build

NFL + NBA research dashboard designed for iPhone and Netlify. This **is not a tested profitable predictor or a payment-enabled product**. It has experimental matchup projections, reported player game logs, optional bookmaker data, basic safeguards, and a new transparent model audit.

## What's changed from V14

- **Smaller-sample regression:** Instead of allowing four-game averages to dominate a forecast, V15 shrinks offense and defense estimates toward a fixed, disclosed, approximate league scoring baseline (NFL 22.5 points/team, NBA 112.5 points/team). This is a *hand-set modeling assumption*, not an empirical prior fitted to 2026.
- **Matchup-specific forecasts:** Two team histories, recency-weighted points for/against, home/away scoring splits, rest and a modest home adjustment. Live forecasts combine the real score and pregame outlook. No scores are generated without 4 eligible completed regular-season games per team.
- **Model Audit tab:** For an *earlier* regular-season head-to-head game available in both teams' history feeds, the app reconstructs pregame inputs from *strictly earlier* games and measures the held-out absolute score error and winner. It preserves the **actual home team for that earlier game**, not the home team of today's game. Usually zero or one eligible holdout is available: that is **not a valid league-wide backtest**. If none, the dashboard says so.
- **Research snapshot:** Copy the matchup timestamp, data sample size, forecast, audit coverage and limitations to the clipboard; useful for tracking picks before kickoff.
- **Correct missing bookmaker values:** Provider spreads, totals and prop points that are absent now remain `null` (displayed as a dash), instead of being incorrectly converted to 0.00.
- **Deployment safety:** Optional Netlify rate-limit configuration targets 100 requests per 60s per IP and domain; confirm the deployment actually enforces it. Provider credentials remain on the server. Cached requests reduce repeat usage in a single function instance.
- **Unchanged from V14:** ESPN scoreboard, dated schedule and player-log lookup, selector state preservation, player-prop charts, live-intel screen, optional Odds API odds. Data-source and model limitations remain.

## iPhone installation (new repo or replace existing)

1. Download and extract the ZIP in iPhone **Files**. Do not upload the ZIP itself into GitHub.
2. GitHub → your existing Sports Lab repository → update the four files below, **or** create an empty new repo called `renzos-sports-lab-v15` at https://github.com/new with README creation unchecked.
3. Upload `index.html`, `netlify.toml`, and `README.md` to the **repo root**.
4. Create/upload `sports.js` at this **exact GitHub file path**: `netlify/functions/sports.js`. GitHub's **Add file → Create new file** supports naming the full folder path, then pasting source; commit.
5. In Netlify, import the GitHub repo (or wait for your linked repo's auto-deploy). Branch `main`, empty build command, publish `.`, functions `netlify/functions`.
6. When Netlify says **Published**, open `https://YOUR-SITE.netlify.app/.netlify/functions/sports?health=1`. Check for `"ok":true` and `"version":"15.0"`.
7. Open the website and select NFL/NBA → a matchup → **Projection**, **Model Audit**, **History**, and **Player Props**. For a completed-season fixture, no model is shown without sufficient verified history. The health response alone **doesn't** confirm historical or athlete feeds.

### Optional live bookmaker markets

Use **The Odds API** at https://the-odds-api.com/. Get your own key and add an environment variable in Netlify → Project configuration → Environment variables named `ODDS_API_KEY`. Never commit the key to GitHub, index.html, or screenshots. Redeploy afterward. Supported provider plans/markets, availability and current quotas vary; check provider documentation. Historical sportsbook pricing is a **paid, unimplemented feature**, not silently simulated from game results. For this version, the backend is a publicly accessible read proxy when the site is public, so quotas can still be consumed by other visitors. A rate limit is **not** equivalent to subscriber authentication or guaranteed quota control.

## Before selling subscriptions

This release is suitable for **private testing and collecting prospective user feedback**, not a finished paid launch. A commercially credible service still needs:

1. **Data rights and reliable feeds:** Confirm a commercial license to re-display data, odds, player images/logos, team marks, and historical information. ESPN's public site API is unofficial and may change or restrict commercial use.
2. **Verified full-season holdout backtesting:** Acquire authorized historical league-wide schedules, injuries, lineups and archival odds with timestamps; evaluate forecasts generated only from information known *before* each game. Report score MAE vs baseline, Brier score on win probabilities, calibration and changes across seasons. Don't claim success based on in-sample fits or few prior meetings.
3. **Customer access control:** Add real accounts, server-side entitlements and secure billing webhooks (e.g., Stripe + an authentication platform). A shared site password is not a true per-customer paywall. Current model logic lives in a public HTML file and is not proprietary/hidden.
4. **Reliability and abuse controls:** Persistent shared provider caching, authentication, request quotas, uptime monitoring, error/latency logs, and cost budgets.
5. **Compliance:** Transparent disclosures, terms, privacy policy, relevant consumer and betting-advice laws, and no promises of guaranteed outcomes/earnings.

**Model uncertainty:** A 12,000-run simulation is a visualization of hand-specified scoring assumptions, *not* evidence of calibration or accuracy. Displayed winner percentages are not sportsbook probabilities or validated expected return. Injury/lineup availability isn't quantified, and player hit rates are historical observations, not predictions of hitting a future line.

## Diagnostic URLs

- `/.netlify/functions/sports?health=1` — deployment/version, odds key configured, not data-feed completeness
- `/.netlify/functions/sports?league=nfl` — league scoreboard
- `/.netlify/functions/sports?league=nfl&schedule=23&season=2026` — team's reported 2026 completed games (example)
- `/.netlify/functions/sports?league=nba&odds=1` — optional bookmaker board, no invented odds when unconfigured

## Tested

- Node syntax checks on frontend JS and Netlify function: passed.
- Eight deterministic backend/model tests: passing, including bookmaker missing-line null handling, completed-game filtering, matchup-specific forecasts, chronological leakage safeguards, previous-meeting holdout and reverse-venue evaluation.
- Live ESPN and The Odds API connectivity not verified in this local build (outbound connection unavailable).
- Chromium mobile browser execution was blocked by the environment's administrator policy, so V15 **has not passed a full browser interaction test**. Please test on an iPhone deployment before inviting others.

## Project structure

```
index.html
netlify.toml
README.md
netlify/
  functions/
    sports.js
```

No npm install or build command required for the site. Supported by Node managed by Netlify.

## V25 expansion beta
NBA/NFL projection tab now displays all regulation quarters and halves with totals and home margin when historical split samples exist. The World Sports Center adds independent date-selectable scoreboards for soccer, ATP/WTA, MLB, NHL, UFC and college sports. Expanded leagues are scoreboards only, not validated prediction models. Live feed coverage and authentication require deployment testing. No payments or accounts included. Existing ODDS_API_KEY remains server-side. Deploy the same three root files and netlify/functions/sports.js as V18.

## V26
Nine-sport dashboard, dedicated expanded sports workspace, 1/7/30-day schedule search. NBA/NFL models preserved. Expanded sports do not yet have validated prediction models. Live upstream coverage not tested. Deploy the same four files and preserve ODDS_API_KEY if configured.

## V27
Daily ESPN requests in seven-day batches, expanded soccer leagues and event filters. Live provider access not verified. Deploy with ODDS_API_KEY as before.

## V28 period quant
Open an NBA/NFL matchup and select Quarter Props. Select a quarter or half, combined/team total or home margin, and enter a research threshold. Five paired historical period scores per team are required. The empirical model is uncalibrated; the audit checks chronological team scoring estimates vs a simple mean, not matchup probability calibration. Period player props and live sportsbook period quotes are not implemented. Existing full-game player props remain available. No new key required.

## V29 player quarter research
NBA player points for Q1–Q4 and halves, using historical completed game play-by-play reconciled against full game box scores. Up to 12 games; at least five accepted for empirical hit rates. Strict parser may reject unavailable or differently structured feeds. Not calibrated or matchup-adjusted. NFL player periods and expanded sport forecasts remain unsupported. Existing ODDS_API_KEY remains the only optional environment variable. Never commit its value. Live provider schema and deployment not verified.

## V30 validation beta
The Validation tab records the first pregame full-game score forecast per event on this browser, checks ESPN pregame status, then grades verified final scores in batches of ten. Export JSON for review. Local storage is editable and not shared; it is not commercial proof. No ROI is computed without recorded prices. Existing V29 engines remain uncalibrated. No new API keys: ODDS_API_KEY is still server-side. Live provider tests, browser integration, licensed historical feeds, accounts, subscriptions, full prop scanning and server-side immutable records remain outstanding.
