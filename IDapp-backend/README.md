# IDapp Backend - Indian Drivers Super App

Complete Node.js/Express backend for the Indian Drivers ride-hailing app with real-time tracking, ride matching, payments, and Uber-like features.

## Features

### Core
- Real-time driver tracking via Socket.io + Firebase Realtime Database
- Ride matching — nearest driver, first-to-accept model
- Razorpay payment integration with webhook verification
- Wallet system with top-up, deductions, and transaction history
- QR payment link generation

### Uber-like Features
- **Surge/Dynamic Pricing** — Time-of-day and demand-based multiplier (up to 3x)
- **6 Vehicle Types** — Bike, Auto, Mini, Sedan, SUV, Premium with different pricing
- **Fare Estimation** — Pre-booking fare estimates for all vehicle types
- **Two-way Ratings** — Riders rate drivers, drivers rate riders (1-5 stars)
- **Ride Cancellation** — Free within 1 minute, cancellation fee after
- **Trip Receipts** — Detailed fare breakdown for completed rides
- **SOS/Emergency** — Location-based emergency alerts
- **Promo Codes** — Percentage and flat discount codes
- **Referral System** — ₹100 for referrer, ₹50 for referee
- **Driver Earnings Dashboard** — Today/week/month earnings tracking
- **Scheduled Rides** — Book rides for future dates
- **Split Fare** — Split ride cost with friends
- **In-app Chat** — Text messaging between rider and driver during rides
- **Ride OTP** — 4-digit verification code to start rides
- **Driver Documents** — License, insurance, registration verification system
- **Outstation Rides** — Inter-city bookings with per-km pricing, driver allowance, one-way and round-trip
- **Rental Rides** — Hourly packages (1hr to full day) with included km and extra charges
- **Multi-stop Rides** — Up to 4 stops with per-stop wait time charges
- **Ride Sharing / Carpool** — Route-matching with 25-30% discount for shared rides
- **Lost & Found** — Report lost items, notify driver automatically
- **Ride Insurance** — ₹5 add-on for trip protection up to ₹5,00,000
- **Fare Negotiation** — Auto-rickshaw style offer system (min 70% of estimate)
- **Driver Tips** — Post-ride tips up to ₹500, directly credited to driver wallet
- **Saved Places** — Home, Work, Favourites for quick booking
- **Emergency Contacts** — Store and manage emergency contacts for SOS
- **Ride Preferences** — AC preference, payment method, dark mode, language
- **Notifications** — In-app notification system with read tracking
- **Dark Mode** — Full dark theme toggle

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4
- **Real-time**: Socket.io 4
- **Database**: Firebase Firestore + Realtime Database (with in-memory fallback)
- **Payments**: Razorpay
- **Auth**: Firebase Admin SDK

## Project Structure

```
IDapp-backend/
├── server.js              # Main server with all routes and Socket.io
├── package.json           # Dependencies
├── .env.example           # Environment variables template
├── README.md              # This file
└── public/
    └── IndianDrivers_v6.html  # Frontend (served as static file)
```

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp .env.example .env
# Edit .env with your credentials

# 3. Start server
npm start

# 4. Open in browser
# http://localhost:3000/IndianDrivers_v6.html
```

## Deploy to Render

1. Push this folder to a GitHub repository

2. Go to [render.com](https://render.com) → New → Web Service

3. Connect your GitHub repo

4. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node

5. Add environment variables in Render dashboard:
   - `RAZORPAY_KEY_ID` = `rzp_test_SVw7TwtCMoWIno`
   - `RAZORPAY_KEY_SECRET` = `iKjzuWNMvZtf79xBLfWbDS50`
   - `RAZORPAY_WEBHOOK_SECRET` = your webhook secret
   - `FIREBASE_PROJECT_ID` = `project-18bcddb7-1b7d-4641-8ec`
   - `FIREBASE_SERVICE_ACCOUNT` = (paste your Firebase service account JSON)
   - `FIREBASE_DATABASE_URL` = `https://project-18bcddb7-1b7d-4641-8ec-default-rtdb.firebaseio.com`

6. Deploy! Your app will be at `https://your-app.onrender.com/IndianDrivers_v6.html`

## Firebase Setup

### Get Service Account Key
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project → Project Settings → Service Accounts
3. Click "Generate new private key"
4. Copy the entire JSON and paste it as the `FIREBASE_SERVICE_ACCOUNT` env var (single line)

### Enable Realtime Database
1. Firebase Console → Realtime Database → Create Database
2. Set rules to allow authenticated read/write:
```json
{
  "rules": {
    "drivers": {
      ".read": true,
      ".write": "auth != null"
    }
  }
}
```

### Enable Firestore
1. Firebase Console → Firestore Database → Create Database
2. Start in production mode
3. The server handles all Firestore operations via Admin SDK

## Razorpay Webhook Setup

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com) → Webhooks
2. Add new webhook:
   - **URL**: `https://your-app.onrender.com/api/payments/webhook`
   - **Secret**: Same as your `RAZORPAY_WEBHOOK_SECRET` env var
   - **Events**: `payment.captured`, `payment.failed`, `refund.created`

## API Endpoints

### Health
- `GET /api/health` — Server status

### Users
- `POST /api/users/profile` — Create/update profile
- `GET /api/users/profile` — Get profile

### Rides
- `POST /api/rides/estimate` — Fare estimates for all vehicle types
- `POST /api/rides/book` — Book a ride
- `POST /api/rides/:id/accept` — Driver accepts ride
- `POST /api/rides/:id/arriving` — Driver signals arrival
- `POST /api/rides/:id/start` — Start ride (with OTP)
- `POST /api/rides/:id/complete` — Complete ride
- `POST /api/rides/:id/cancel` — Cancel ride
- `POST /api/rides/:id/rate` — Rate ride (two-way)
- `GET /api/rides/:id/receipt` — Trip receipt
- `GET /api/rides/history` — Ride history
- `POST /api/rides/schedule` — Schedule future ride
- `POST /api/rides/:id/split` — Split fare

### Payments
- `POST /api/payments/create-order` — Create Razorpay order
- `POST /api/payments/verify` — Verify payment
- `POST /api/payments/webhook` — Razorpay webhook handler
- `GET /api/wallet/balance` — Wallet balance
- `GET /api/wallet/transactions` — Transaction history

### Drivers
- `GET /api/drivers/nearby` — Nearby available drivers
- `GET /api/drivers/earnings` — Earnings dashboard
- `POST /api/drivers/documents` — Upload documents

### Other
- `POST /api/promo/validate` — Validate promo code
- `POST /api/referral/apply` — Apply referral code
- `POST /api/sos` — Emergency SOS
- `POST /api/chat/:rideId/send` — Send chat message
- `GET /api/chat/:rideId` — Get chat messages
- `GET /api/surge` — Current surge multiplier
- `POST /api/demo/seed-drivers` — Seed demo drivers

## Socket.io Events

### Client → Server
- `driver_online` — Driver goes online with location
- `driver_offline` — Driver goes offline
- `driver_location_update` — GPS location update
- `rider_online` — Rider connects
- `join_ride` — Join ride room
- `send_chat_message` — Chat message
- `request_call` — Call request

### Server → Client
- `new_ride_request` — New ride for drivers
- `ride_matched` — Driver assigned to rider
- `ride_taken` — Ride no longer available
- `ride_status_update` — Status change
- `ride_completed` — Ride finished
- `ride_cancelled` — Ride cancelled
- `driver_location` — Driver GPS for rider
- `driver_moved` — Driver position broadcast
- `chat_message` — Incoming chat
- `wallet_updated` — Balance change
- `payment_failed` — Payment error
- `sos_alert` — Emergency alert (admin)

## Demo Mode

The app works fully in demo mode without Firebase or Razorpay:
- Seed demo drivers: `POST /api/demo/seed-drivers`
- In-memory data store used as fallback
- Frontend has "Try Demo Mode" button that bypasses auth
- Payments simulate instantly in demo mode

## License

Private — Indian Drivers App
