# 👟 Fashion Feet — Multi-Branch Stock Transfer Hub

> **Professional Footwear Inventory Dispatch, Route Transfer, and Cloud Sync Portal**

---

## 🌟 Overview
Fashion Feet Stock Transfer Hub is a high-performance Progressive Web Application (PWA) designed for multi-branch retail footwear operations. It connects showroom branches and central warehouses in real-time, providing instant stock transfer, barcode dispatch, size splitting, and slip printing.

### 🏢 Connected Branches:
1. **Head Office** (Central Warehouse & Logistics Hub)
2. **Shoe Gallery** (Ramakrishna Showroom Branch)
3. **FF Branch** (Fashion Feet Main Showroom Branch)

---

## 🚀 Key Features
- **🚚 Multi-Branch Stock Dispatch:** Transfer footwear batches between any branch or warehouse route.
- **📱 PWA & Mobile Native Experience:** Fully responsive on Android (Chrome) and iPhone/iPad (Safari) with standalone home-screen installation.
- **🔐 Branch-Role Authentication:** Enterprise-grade security portal powered by Supabase Auth with dedicated transfer staff logins.
- **📦 Size Split Receiver:** Split generic footwear inventory into exact size distributions upon arrival.
- **📄 Instant Dispatch Slips:** Thermal and standard 80mm print-ready dispatch slips with barcode/QR verification.
- **⚡ Offline-Ready Service Worker:** High reliability even during intermittent connectivity.

---

## 🔑 Default Transfer Staff Profiles

| Role | Username / Email | Default PIN | Assigned Branch |
| :--- | :--- | :--- | :--- |
| **Transfer Admin** | `transfer.admin@ff.pos` | `admin123` | **All Branches** |
| **Head Office Dispatcher** | `transfer.headoffice@ff.pos` | `123456` | **Head Office** |
| **Shoe Gallery Transfer Staff** | `transfer.shoegallery@ff.pos` | `123456` | **Shoe Gallery** |
| **FF Branch Transfer Staff** | `transfer.ffbranch@ff.pos` | `123456` | **FF Branch** |

---

## 🛠️ Tech Stack
- **Frontend:** Vanilla HTML5, Modern CSS3 (Glassmorphism), ES6+ JavaScript
- **Backend / Database:** Supabase (PostgreSQL, Realtime REST API, Auth)
- **Deployment:** GitHub Pages / Vercel
- **PWA:** Web App Manifest + Service Worker

---

## 🌐 Hosting & Deployment

### GitHub Pages (Built-in Free Hosting):
1. Navigate to **Settings** ➔ **Pages**.
2. Under **Build and deployment** ➔ **Branch**, select `main` / `/(root)`.
3. Click **Save**. Your site will be live at:
   `https://ChamalJulanJS.github.io/FASHION-FEET-STOCK/`

### Vercel Deployment:
Connect this repository to [Vercel](https://vercel.com) for instantaneous edge CDN deployments.

---
© 2026 Fashion Feet. All rights reserved.
