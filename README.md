# GreenBite - pure-veg food delivery

An end-to-end, 100% vegetarian food delivery platform with four separate apps in one Next.js codebase: **customers**, **hotel managers**, **delivery partners** and **admins**. Everything updates in real time from MongoDB.

## Features

**Customer** (`/hotels`, `/account`)
- Browse pure-veg hotels near your location (GPS or map pin), search by dish/cuisine, menus grouped by section
- Cart and checkout with server-side pricing (delivery fee by distance, GST, free-delivery threshold, minimum order)
- Cash on delivery or online payment via **Razorpay** (UPI, cards, wallets, netbanking) with signature verification, webhook backup and automatic refunds
- Order confirmation email with a delivery OTP, live order tracking on a map (rider position pushed in real time)

**Hotel manager** (`/manager`)
- Live order board with sound alerts: accept / reject / preparing / ready
- Menu management (veg-only, Jain/Vegan tags, sold-out toggle), hotel profile with map location, sales stats

**Delivery partner** (`/delivery`, mobile-first)
- Go online/offline with live GPS, see nearby orders and accept them (or get auto-assigned)
- Pickup when the hotel marks ready, navigation links, cash-to-collect, deliver by entering the customer's OTP

**Admin** (`/admin`)
- Live dashboard, users, hotels (approve/suspend, menu moderation), riders fleet map, all orders (cancel, reassign, refund, status override)
- Real-time activity log of every action, platform settings (fees, radius, OTP, payments, sign-ups)

**Security**
- Separate login portal and separate session cookie per role; JWTs bound to their portal
- Email OTP verification at sign-up, account lockout, rate limits, CSRF origin checks
- Object-level authorization (customers see only their orders, hotels only theirs, riders only assigned ones)

## Tech stack

Next.js 16 (App Router, route handlers, `proxy.ts`) · React 19 · TypeScript · Tailwind CSS 4 · MongoDB Atlas + Mongoose (change streams for real time) · jose (JWT) · bcrypt · Zod · Nodemailer · Leaflet + OpenStreetMap · Razorpay

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in the values (see below)
npm run seed:admin             # creates the first admin from SEED_ADMIN_* values
npm run dev                    # http://localhost:3000
```

Optional: `npm run seed:demo` adds sample hotels, riders and orders (`npm run seed:demo -- --reset` removes them). `npm run test:mail` checks your SMTP settings.

### Environment variables (`.env.local`)

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string (Atlas is needed for change streams / live updates) |
| `JWT_SECRET` | Long random string for signing sessions |
| `APP_URL` | Public URL of the app (used in emails) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email delivery (e.g. Gmail with an App Password, or Resend) |
| `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | First admin account |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Online payments (use `rzp_test_` keys while developing) |

Never commit `.env.local` - it is git-ignored.

## Portals

| Role | Sign in | Sign up |
|---|---|---|
| Customer | `/login` | `/register` |
| Hotel manager | `/manager/login` | `/manager/register` (admin approval) |
| Delivery partner | `/delivery/login` | `/delivery/register` (admin approval) |
| Admin | `/admin/login` | created by an admin only |

## Project structure

```
src/
  app/
    (auth)/            customer sign-in / sign-up, password reset
    (shop)/            customer app: hotels, menu, checkout, account, tracking
    admin/ manager/ delivery/   each role: login + (panel) dashboard
    api/               route handlers per role + auth, public, payments, live streams
  components/          UI kit, brand, shells, role-specific components
  lib/                 auth, sessions, pricing, assignment, payments, realtime, mail
  models/              Mongoose models (User, Restaurant, MenuItem, Order, ActivityLog, Setting)
scripts/               seed-admin, seed-demo, test-mail
```
