# 💰 DhanRakshak — Personal Finance & Wealth Tracker

A lightning-fast, privacy-first personal finance and wealth management progressive web application (PWA) designed for effortless daily tracking, accurate balances, and holistic net worth monitoring.

---

## 🌟 Key Features

- **⚡ Fast Natural Language Quick Entry**: Type `50 chai PhonePe` or `5000 salary cash` to log in 2 seconds.
- **📩 Indian Bank SMS Parser**: Paste SMS from HDFC, SBI, ICICI, Axis, UPI (PhonePe, GPay, Paytm) for automatic transaction parsing.
- **🏦 Comprehensive Account Management**: Cash, Bank Accounts, UPI Wallets, and Credit Cards with real-time balance calculations.
- **📈 Wealth & Asset Tracking**: Track Fixed Deposits (FD), PF, PPF, Mutual Funds, Stocks, Gold, and Real Estate with valuation logs.
- **📊 Visual Analytics**: Monthly Cash Flow, Savings Rate, Category Breakdown Doughnut, and Daily Spending Velocity charts.
- **📸 Net Worth Snapshots**: Capture point-in-time portfolio snapshots to see your wealth growth over time.
- **📱 PWA & Offline First**: Works 100% offline via local IndexedDB. Installable on Android, iOS, Windows, and Mac.
- **🔒 Zero-Knowledge Privacy**: No logins required, no central server storing your financial secrets.
- **📦 Data Portability**: 1-click JSON full backup/restore and CSV transaction exports.

---

## 🚀 Getting Started

### 1. Run Locally

```bash
# Install dependencies
npm install

# Start local development server
npm run dev
```

Visit `http://localhost:5173/` in your browser.

### 2. Build for Production

```bash
npm run build
```

The production-ready output will be placed in the `dist/` directory.

---

## 🌐 Deploying to Vercel / Netlify (Continuous Deployment via GitHub)

1. Push this repository to your **GitHub** account.
2. Go to [Vercel](https://vercel.com) or [Netlify](https://netlify.com) and log in with GitHub.
3. Click **"Add New Project"** and select your `dhanrakshak` repository.
4. Framework Preset will auto-detect as **Vite**.
5. Click **Deploy**.

> **Automatic Updates**: Every time you commit and push new changes to GitHub (`git push`), Vercel/Netlify will automatically rebuild and update your live mobile/laptop app in ~20 seconds!
