# Balance Sheet Square V2

A separate redesigned edition of Balance Sheet Square. The original `lbp1122/balance-sheet-square` repository is intentionally unchanged.

## Features

- Seven focused views with larger mobile typography
- Proportional balance-sheet square and key ratios
- Editable assets, liabilities and monthly spending
- Retirement projection with inflation, returns, contributions and other income
- Local-only saving, offline support, PDF export and native sharing
- English, Bahasa Malaysia and Chinese
- Website and Android app from one source

## Website

```bash
npm ci
npm run build
```

GitHub Pages publishes `dist/` through the included workflow.

## Android

The Android project bundles the completed website so calculations work offline from the first launch. Build instructions are in `android-app/README.md`.
