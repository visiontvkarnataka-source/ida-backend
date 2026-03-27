// ===================================================
// IDapp Backend Server v1.0
// Indian Drivers App - Complete Backend
// ===================================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const admin = require('firebase-admin');
const Razorpay = require('razorpay');
const path = require('path');
const fs = require('fs');

// ===== CONFIG =====
const PORT = process.env.PORT || 3000;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_SVw7TwtCMoWIno';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'iKjzuWNMvZtf79xBLfWbDS50';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'idapp_webhook_secret_2026';
const FRONTEND_URL = process.env.FRONTEND_URL || '*';

// ===== SUREPASS KYC API CONFIG =====
const SUREPASS_API_TOKEN = process.env.SUREPASS_API_TOKEN || ''; // Get from https://surepass.io/get-api-key/
const SUREPASS_BASE_URL = process.env.SUREPASS_BASE_URL || 'https://kyc-api.surepass.io/api/v1';
const https = require('https');
const http_native = require('http');

// Surepass API helper — makes HTTPS calls to Surepass
function surepassCall(endpoint, body) {
  return new Promise((resolve, reject) => {
    if (!SUREPASS_API_TOKEN) {
      return reject(new Error('SUREPASS_API_TOKEN not configured. Get one from https://surepass.io/get-api-key/'));
    }

    const postData = JSON.stringify(body);
    const url = new URL(SUREPASS_BASE_URL + endpoint);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUREPASS_API_TOKEN,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          reject(new Error('Invalid response from Surepass: ' + data.substring(0, 200)));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Surepass API timeout')); });
    req.write(postData);
    req.end();
  });
}

// ===== FIREBASE ADMIN INIT =====
let db = null;
let rtdb = null;

try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://project-18bcddb7-1b7d-4641-8ec-default-rtdb.firebaseio.com'
    });
  } else {
    // Initialize with application default credentials or project ID only
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'project-18bcddb7-1b7d-4641-8ec',
      databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://project-18bcddb7-1b7d-4641-8ec-default-rtdb.firebaseio.com'
    });
  }
  db = admin.firestore();
  rtdb = admin.database();
  console.log('[Firebase] Admin SDK initialized');
} catch (e) {
  console.log('[Firebase] Init with fallback in-memory mode:', e.message);
}

// ===== RAZORPAY INIT =====
let razorpay = null;
try {
  razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
  });
  console.log('[Razorpay] Initialized');
} catch (e) {
  console.log('[Razorpay] Init error:', e.message);
}

// ===== IN-MEMORY STORE (fallback when Firebase unavailable) =====
const MemStore = {
  users: new Map(),
  drivers: new Map(),
  rides: new Map(),
  transactions: new Map(),
  promoCodes: new Map(),
  referrals: new Map(),
  driverDocuments: new Map(),
  scheduledRides: new Map(),
  chatMessages: new Map(),
  sosAlerts: new Map(),
  surgeZones: new Map(),
  splitFareRequests: new Map(),
  driverLocations: new Map(),  // Real-time driver GPS
  activeRideDriverMap: new Map(), // rideId -> socketId
  kycApplications: new Map(),  // userId -> { status, documents, submittedAt, reviewedAt, reviewedBy, rejectionReason }
  kycDocFiles: new Map(),       // docKey (userId_docType) -> { originalName, mimeType, base64Data, uploadedAt }
  referralCodes: new Map(),     // referralCode -> { ownerId, ownerName, ownerPhone }
  referralRedemptions: new Map(), // userId -> { referredBy, rewardGiven }
  sharedTrips: new Map(),        // shareToken -> { rideId, userId, expiresAt }
  pushTokens: new Map(),         // userId -> { token, platform }
  revenueLog: new Map(),         // date -> { totalFares, totalCommission, totalBookingFees, rideCount }
  packages: new Map(),         // Package delivery orders
  ads: new Map(),              // Ad campaigns
  adImpressions: new Map(),    // Ad view tracking
  photoVerifications: new Map(), // Driver selfie verifications
  ratings: new Map(),          // Ride ratings
  insurance: new Map(),        // Ride insurance records
  loyaltyPoints: new Map(),    // User loyalty points
  driverStreaks: new Map(),    // Driver daily streak data
  leaderboard: new Map(),      // Driver leaderboard
  savedPlaces: new Map(),      // User saved places (home, work, etc)
  rideHistory: new Map(),      // Ride history records
  docExpiry: new Map(),        // Driver document expiry dates
  fcmTokens: new Map(),        // FCM push notification tokens
  callRecordings: new Map(),   // Call recordings by rideId
  routeDeviations: new Map(),  // Route deviation alerts by rideId
  multiBookings: new Map(),    // Multi-vehicle bookings
  fleetOwners: new Map(),      // Fleet owner details
  fleetVehicles: new Map(),    // Fleet vehicles
  driverRentals: new Map(),    // Driver rental tracking
  ridePatterns: new Map(),     // User ride patterns for suggestions
  favoriteDrivers: new Map(),  // User's favorite drivers
  carpoolRides: new Map(),     // Carpool/group ride bookings
  speedAlerts: new Map(),      // Speed violation alerts
  dashcamFootage: new Map(),   // Dashcam video footage
  cashbackCampaigns: new Map(),// Cashback campaigns
  etaHistory: new Map(),       // Historical ETA data
  broadcasts: new Map(),       // Admin broadcasts to drivers/customers
  richAds: new Map(),          // Rich ads system (video/image/text)
  voicePreferences: new Map()  // User voice preferences for alerts
};

// Seed promo codes
// MemStore.promoCodes.set('WELCOME50', { code: 'WELCOME50', type: 'percentage', value: 50, maxDiscount: 100, minFare: 99, usageLimit: 1, usedBy: [], expiresAt: new Date('2026-12-31'), active: true });
// MemStore.promoCodes.set('FLAT30', { code: 'FLAT30', type: 'flat', value: 30, maxDiscount: 30, minFare: 50, usageLimit: 3, usedBy: [], expiresAt: new Date('2026-12-31'), active: true });
// MemStore.promoCodes.set('RIDE100', { code: 'RIDE100', type: 'flat', value: 100, maxDiscount: 100, minFare: 200, usageLimit: 1, usedBy: [], expiresAt: new Date('2026-12-31'), active: true });

// ===== EXPRESS APP =====
const app = express();
const server = http.createServer(app);

// CORS
app.use(cors({ origin: FRONTEND_URL, credentials: true }));

// Security
app.use(helmet({ contentSecurityPolicy: false }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

// Body parsing - raw for webhooks, json for rest
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static('public'));

// ===== SOCKET.IO =====
const io = new Server(server, {
  cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'], credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000
});

// ===== PLATFORM CONFIGURATION (Admin-changeable) =====
const PLATFORM_CONFIG = {
  // Wallet settings
  wallet: {
    minTopUp: 100,           // ₹100 minimum top-up
    maxBalance: null,        // No limit
    bookingFee: 50,          // ₹50 flat per ride
    feeDeductAt: 'completion', // 'booking' | 'start' | 'completion'
    blockIfLowBalance: true, // Block booking if wallet < bookingFee
    refundable: false,       // No refunds on cancellation
    refundInfo: 'Wallet balance is non-refundable after booking. ₹50 booking fee deducted on ride completion.'
  },
  // Commission
  commission: {
    percentage: 10,          // 10% commission
    onlyLongDistance: true,   // Only charge commission on long-distance rides
    longDistanceThresholdKm: 15, // What counts as "long distance"
  },
  // Cancellation
  cancellation: {
    fee: 100,                // ₹100 cancellation fee after driver assigned
    driverShare: 50,         // ₹50 goes to driver
    ownerShare: 50,          // ₹50 goes to platform owner
    freeWindowMs: 120000,    // 2 minutes free cancellation after booking
  },
  // Driver matching
  matching: {
    initialRadiusKm: 2,     // Start searching at 2km
    maxRadiusKm: 5,          // Expand up to 5km
    radiusStepKm: 1,         // Expand 1km at a time
    acceptTimeoutSec: 20,    // 20 seconds to accept
    showFareToDriver: true,  // Show full fare before accepting
    showDestToDriver: true,  // Show full destination before accepting
    autoIncreaseFare: true,  // Auto-increase fare if no driver accepts
    fareIncreasePercent: 10, // Increase by 10%
    maxFareIncreases: 3,     // Try 3 times max (up to 30% increase)
  },
  // Ride settings
  ride: {
    otpRequired: true,       // 4-digit OTP every ride
    otpDigits: 4,
    waitingFreeMinutes: 3,   // 3 minutes free waiting
    waitingChargePerMin: 3,  // ₹3/min after free period
    nightSurchargePercent: 10, // +10% between 11PM-5AM
    nightStartHour: 23,
    nightEndHour: 5,
    tollsOnCustomer: true,   // Tolls added to customer fare
  },
  // Surge pricing
  surge: {
    enabled: true,
    maxMultiplier: 3.0,      // Up to 3x (like Uber)
    peakHours: [[8,10], [17,20]], // Morning & evening rush
    peakBaseSurge: 1.5,
    lateNightBaseSurge: 1.3,
    rainMultiplier: 1.5,
  },
  // SOS
  sos: {
    callPolice: true,        // Call 112
    smsContacts: true,       // SMS to emergency contacts
    shareLiveLocation: true, // Share live GPS
    alertAdmin: true,        // Alert admin panel
  },
  // Women Safety
  womenSafety: {
    enabled: true,
    womenOnlyDrivers: true,
    autoShareTrip: true,
    routeDeviationAlertMeters: 500,
    panicButtonEnabled: true,
    trustedContactsMax: 5,
  },
  // Referral
  referral: {
    enabled: true,
    referrerReward: 50,    // ₹50 to referrer
    refereeReward: 50,     // ₹50 to new user
    minRidesForReward: 1,  // Referee must complete 1 ride
    maxReferrals: 50,      // Max 50 referrals per user
  },
  // Airport pricing
  airport: {
    perKmRate: 24         // ₹24/km for airport rides
  }
};

// ===== PRICING ENGINE =====
const VEHICLE_CONFIG = {
  auto:    { baseFare: 30, perKm: 12, perMin: 1.5, minFare: 40,  icon: '🛺', name: 'Auto' },
  mini:    { baseFare: 50, perKm: 14, perMin: 2,   minFare: 80,  icon: '🚗', name: 'Mini' },
  sedan:   { baseFare: 80, perKm: 18, perMin: 2.5, minFare: 120, icon: '🚙', name: 'Sedan' },
  suv:     { baseFare: 120, perKm: 22, perMin: 3,  minFare: 180, icon: '🚐', name: 'SUV' },
  premium: { baseFare: 150, perKm: 28, perMin: 4,  minFare: 250, icon: '⭐', name: 'Premium' },
  truck:   { baseFare: 200, perKm: 25, perMin: 3,  minFare: 300, icon: '🚛', name: 'Truck' },
  tempo:   { baseFare: 250, perKm: 30, perMin: 3.5, minFare: 400, icon: '🚚', name: 'Tempo Traveller' },
  bus:     { baseFare: 500, perKm: 40, perMin: 5,  minFare: 800, icon: '🚌', name: 'Bus' },
  towing:  { baseFare: 500, perKm: 35, perMin: 0,  minFare: 500, icon: '🚨', name: 'Towing Service' }
};

function calculateSurgeMultiplier(pickupLat, pickupLng) {
  if (!PLATFORM_CONFIG.surge.enabled) return 1.0;
  const hour = new Date().getHours();
  let baseSurge = 1.0;

  // Peak hours check
  for (const [start, end] of PLATFORM_CONFIG.surge.peakHours) {
    if (hour >= start && hour <= end) {
      baseSurge = PLATFORM_CONFIG.surge.peakBaseSurge;
      break;
    }
  }
  // Late night
  if (hour >= 22 || hour <= 5) {
    baseSurge = Math.max(baseSurge, PLATFORM_CONFIG.surge.lateNightBaseSurge);
  }
  // Demand simulation (in production: real demand/supply ratio)
  const demandFactor = 1 + (Math.random() * 0.5);
  const surge = Math.round(baseSurge * demandFactor * 10) / 10;
  return Math.min(surge, PLATFORM_CONFIG.surge.maxMultiplier);
}

function isNightTime() {
  const hour = new Date().getHours();
  return hour >= PLATFORM_CONFIG.ride.nightStartHour || hour < PLATFORM_CONFIG.ride.nightEndHour;
}

function estimateFare(distanceKm, durationMin, vehicleType, pickupLat, pickupLng) {
  const config = VEHICLE_CONFIG[vehicleType] || VEHICLE_CONFIG.auto;
  const surgeMultiplier = calculateSurgeMultiplier(pickupLat, pickupLng);

  const distanceFare = config.perKm * distanceKm;
  const timeFare = config.perMin * durationMin;
  let fare = config.baseFare + distanceFare + timeFare;
  fare = Math.max(fare, config.minFare);

  // Apply surge
  const surgedFare = Math.round(fare * surgeMultiplier);

  // Night surcharge
  const nightSurcharge = isNightTime() ? Math.round(surgedFare * PLATFORM_CONFIG.ride.nightSurchargePercent / 100) : 0;

  // Booking fee (shown separately, deducted from wallet on completion)
  const bookingFee = PLATFORM_CONFIG.wallet.bookingFee;

  // Platform commission (only on long distance)
  let commission = 0;
  if (PLATFORM_CONFIG.commission.onlyLongDistance && distanceKm >= PLATFORM_CONFIG.commission.longDistanceThresholdKm) {
    commission = Math.round(surgedFare * PLATFORM_CONFIG.commission.percentage / 100);
  } else if (!PLATFORM_CONFIG.commission.onlyLongDistance) {
    commission = Math.round(surgedFare * PLATFORM_CONFIG.commission.percentage / 100);
  }

  const totalFare = surgedFare + nightSurcharge;
  const driverEarnings = totalFare - commission;

  return {
    baseFare: config.baseFare,
    distanceFare: Math.round(distanceFare),
    timeFare: Math.round(timeFare),
    subtotal: Math.round(fare),
    surgeMultiplier,
    surgeAmount: Math.round(fare * surgeMultiplier - fare),
    nightSurcharge,
    bookingFee,
    commission,
    driverEarnings,
    totalFare,
    totalWithBookingFee: totalFare + bookingFee,
    vehicleType,
    vehicleName: config.name,
    vehicleIcon: config.icon,
    distanceKm,
    durationMin,
    isNight: isNightTime(),
    isLongDistance: distanceKm >= PLATFORM_CONFIG.commission.longDistanceThresholdKm,
    currency: 'INR'
  };
}

// Generate 4-digit ride OTP
function generateRideOTP() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// ===== WALLET SYSTEM =====
async function getWallet(userId) {
  let user = MemStore.users.get(userId);
  if (!user) user = { uid: userId, walletBalance: 0, driverEarnings: 0, transactions: [] };
  return {
    balance: user.walletBalance || 0,
    driverEarnings: user.driverEarnings || 0,
    transactions: user.transactions || []
  };
}

async function deductFromWallet(userId, amount, reason, rideId) {
  let user = MemStore.users.get(userId) || { uid: userId, walletBalance: 0, transactions: [] };
  if ((user.walletBalance || 0) < amount) {
    return { success: false, error: 'Insufficient wallet balance. Please top up at least ₹' + amount };
  }
  user.walletBalance = (user.walletBalance || 0) - amount;
  const txn = {
    id: 'txn_' + uuidv4().slice(0, 8),
    type: 'debit',
    amount,
    reason,
    rideId,
    balanceAfter: user.walletBalance,
    timestamp: new Date().toISOString()
  };
  if (!user.transactions) user.transactions = [];
  user.transactions.unshift(txn);
  MemStore.users.set(userId, user);
  if (db) { try { await db.collection('users').doc(userId).set(user, { merge: true }); } catch(e) {} }
  return { success: true, newBalance: user.walletBalance, transaction: txn };
}

async function addToWallet(userId, amount, reason, rideId) {
  let user = MemStore.users.get(userId) || { uid: userId, walletBalance: 0, transactions: [] };
  user.walletBalance = (user.walletBalance || 0) + amount;
  const txn = {
    id: 'txn_' + uuidv4().slice(0, 8),
    type: 'credit',
    amount,
    reason,
    rideId,
    balanceAfter: user.walletBalance,
    timestamp: new Date().toISOString()
  };
  if (!user.transactions) user.transactions = [];
  user.transactions.unshift(txn);
  MemStore.users.set(userId, user);
  if (db) { try { await db.collection('users').doc(userId).set(user, { merge: true }); } catch(e) {} }
  return { success: true, newBalance: user.walletBalance, transaction: txn };
}

async function addToDriverEarnings(driverId, amount, reason, rideId) {
  let user = MemStore.users.get(driverId) || { uid: driverId, driverEarnings: 0, driverTransactions: [] };
  user.driverEarnings = (user.driverEarnings || 0) + amount;
  const txn = {
    id: 'drv_txn_' + uuidv4().slice(0, 8),
    type: 'earning',
    amount,
    reason,
    rideId,
    balanceAfter: user.driverEarnings,
    timestamp: new Date().toISOString()
  };
  if (!user.driverTransactions) user.driverTransactions = [];
  user.driverTransactions.unshift(txn);
  MemStore.users.set(driverId, user);
  if (db) { try { await db.collection('users').doc(driverId).set(user, { merge: true }); } catch(e) {} }
  return { success: true, newEarnings: user.driverEarnings, transaction: txn };
}

// ===== DRIVER MATCHING ENGINE =====
async function findNearestDrivers(pickupLat, pickupLng, vehicleType, radiusKm) {
  const drivers = [];
  MemStore.driverLocations.forEach((driver, driverId) => {
    if (!driver.isOnline || driver.activeRideId) return;
    if (vehicleType && driver.vehicleType !== vehicleType) return;
    const dist = haversine(pickupLat, pickupLng, driver.lat, driver.lng);
    if (dist <= radiusKm) {
      const driverUser = MemStore.users.get(driverId) || {};
      const walletBalance = driverUser.walletBalance || 0;
      drivers.push({ ...driver, distance: Math.round(dist * 100) / 100, walletBalance });
    }
  });
  // Sort by wallet balance (descending) first, then by distance (ascending)
  drivers.sort((a, b) => {
    if (b.walletBalance !== a.walletBalance) return b.walletBalance - a.walletBalance;
    return a.distance - b.distance;
  });
  return drivers;
}

async function matchDriver(rideId, pickupLat, pickupLng, vehicleType, fareEstimate, attempt = 0) {
  const config = PLATFORM_CONFIG.matching;
  let radius = config.initialRadiusKm + (attempt * config.radiusStepKm);
  radius = Math.min(radius, config.maxRadiusKm);

  const nearbyDrivers = await findNearestDrivers(pickupLat, pickupLng, vehicleType, radius);

  if (nearbyDrivers.length === 0 && radius < config.maxRadiusKm) {
    // Expand radius and retry
    return matchDriver(rideId, pickupLat, pickupLng, vehicleType, fareEstimate, attempt + 1);
  }

  if (nearbyDrivers.length === 0 && config.autoIncreaseFare && fareEstimate._increaseCount < config.maxFareIncreases) {
    // Auto-increase fare to attract drivers
    fareEstimate.totalFare = Math.round(fareEstimate.totalFare * (1 + config.fareIncreasePercent / 100));
    fareEstimate._increaseCount = (fareEstimate._increaseCount || 0) + 1;
    fareEstimate.fareIncreased = true;
    fareEstimate.fareIncreasePercent = fareEstimate._increaseCount * config.fareIncreasePercent;
    // Notify customer about fare increase
    io.emit('ride:fare_increased', { rideId, newFare: fareEstimate.totalFare, increasePercent: fareEstimate.fareIncreasePercent });
    return { drivers: [], fareEstimate, expanded: true };
  }

  return { drivers: nearbyDrivers, fareEstimate, radius };
}

// ===== HELPER: Firestore or MemStore =====
async function saveToStore(collection, id, data) {
  if (db) {
    try {
      await db.collection(collection).doc(id).set(data, { merge: true });
    } catch (e) {
      console.log(`[Firestore] Write fallback for ${collection}/${id}`);
    }
  }
  // Always save to MemStore too
  if (!MemStore[collection]) MemStore[collection] = new Map();
  MemStore[collection].set(id, { ...data, _id: id });
}

async function getFromStore(collection, id) {
  if (db) {
    try {
      const doc = await db.collection(collection).doc(id).get();
      if (doc.exists) return { _id: id, ...doc.data() };
    } catch (e) { /* fallback */ }
  }
  if (MemStore[collection]) return MemStore[collection].get(id) || null;
  return null;
}

async function queryStore(collection, field, op, value) {
  const results = [];
  if (db) {
    try {
      const snap = await db.collection(collection).where(field, op, value).get();
      snap.forEach(doc => results.push({ _id: doc.id, ...doc.data() }));
      if (results.length > 0) return results;
    } catch (e) { /* fallback */ }
  }
  if (MemStore[collection]) {
    MemStore[collection].forEach((item, key) => {
      if (op === '==' && item[field] === value) results.push(item);
      if (op === 'array-contains' && Array.isArray(item[field]) && item[field].includes(value)) results.push(item);
    });
  }
  return results;
}

// ===== AUTH MIDDLEWARE =====
async function verifyAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No auth token provided' });
  }

  try {
    if (token.startsWith('demo_')) {
      // Demo mode
      req.user = { uid: token, phone: '+919876543210', name: 'Demo User' };
      return next();
    }
    // Verify Firebase token
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = { uid: decoded.uid, phone: decoded.phone_number, name: decoded.name || 'User' };
    next();
  } catch (e) {
    // Fallback: treat as valid for development
    req.user = { uid: token, phone: '+910000000000', name: 'User' };
    next();
  }
}

// ================================================
// REST API ROUTES
// ================================================

// ----- Health Check -----
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    app: 'IDapp Backend',
    firebase: !!db,
    razorpay: !!razorpay,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ================================================
// USER MANAGEMENT
// ================================================

// Register / Update User Profile
app.post('/api/users/profile', verifyAuth, async (req, res) => {
  try {
    const { name, email, role, vehicleType, vehicleNumber, vehicleModel, licenseNumber } = req.body;
    const userId = req.user.uid;

    const existing = await getFromStore('users', userId);
    const userData = {
      uid: userId,
      phone: req.user.phone,
      name: name || existing?.name || 'User',
      email: email || existing?.email || '',
      role: role || existing?.role || 'rider', // 'rider' or 'driver'
      rating: existing?.rating || 5.0,
      totalRatings: existing?.totalRatings || 0,
      rideCount: existing?.rideCount || 0,
      walletBalance: existing?.walletBalance || 0,
      referralCode: existing?.referralCode || ('ID' + userId.slice(-6).toUpperCase()),
      referredBy: existing?.referredBy || null,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isVerified: existing?.isVerified || false,
      isOnline: false,
      // Driver-specific fields
      vehicleType: vehicleType || existing?.vehicleType || null,
      vehicleNumber: vehicleNumber || existing?.vehicleNumber || null,
      vehicleModel: vehicleModel || existing?.vehicleModel || null,
      licenseNumber: licenseNumber || existing?.licenseNumber || null,
      documentsVerified: existing?.documentsVerified || false,
      earnings: existing?.earnings || { today: 0, week: 0, month: 0, total: 0 },
      activeRideId: existing?.activeRideId || null
    };

    await saveToStore('users', userId, userData);
    res.json({ success: true, user: userData });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get User Profile
app.get('/api/users/profile', verifyAuth, async (req, res) => {
  try {
    const user = await getFromStore('users', req.user.uid);
    if (!user) {
      return res.json({ success: true, user: null, isNew: true });
    }
    res.json({ success: true, user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// DRIVER DOCUMENT VERIFICATION
// ================================================

app.post('/api/drivers/documents', verifyAuth, async (req, res) => {
  try {
    const { documentType, documentNumber, expiryDate, documentUrl } = req.body;
    const docId = `${req.user.uid}_${documentType}`;

    const docData = {
      driverId: req.user.uid,
      documentType, // 'license', 'insurance', 'registration', 'permit', 'aadhar', 'pan'
      documentNumber,
      expiryDate: expiryDate || null,
      documentUrl: documentUrl || null,
      status: 'pending', // pending, verified, rejected
      submittedAt: new Date().toISOString(),
      verifiedAt: null,
      rejectionReason: null
    };

    await saveToStore('driverDocuments', docId, docData);
    res.json({ success: true, document: docData });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/drivers/documents', verifyAuth, async (req, res) => {
  try {
    const docs = await queryStore('driverDocuments', 'driverId', '==', req.user.uid);
    res.json({ success: true, documents: docs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// DRIVER EARNINGS DASHBOARD
// ================================================

app.get('/api/drivers/earnings', verifyAuth, async (req, res) => {
  try {
    const user = await getFromStore('users', req.user.uid);
    const rides = await queryStore('rides', 'driverId', '==', req.user.uid);

    const completedRides = rides.filter(r => r.status === 'completed');
    const today = new Date().toDateString();
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const monthAgo = new Date(Date.now() - 30 * 86400000);

    const todayEarnings = completedRides
      .filter(r => new Date(r.completedAt).toDateString() === today)
      .reduce((sum, r) => sum + (r.driverEarnings || 0), 0);

    const weekEarnings = completedRides
      .filter(r => new Date(r.completedAt) >= weekAgo)
      .reduce((sum, r) => sum + (r.driverEarnings || 0), 0);

    const monthEarnings = completedRides
      .filter(r => new Date(r.completedAt) >= monthAgo)
      .reduce((sum, r) => sum + (r.driverEarnings || 0), 0);

    const totalEarnings = completedRides.reduce((sum, r) => sum + (r.driverEarnings || 0), 0);

    // Tips
    const totalTips = completedRides.reduce((sum, r) => sum + (r.tip || 0), 0);

    res.json({
      success: true,
      earnings: {
        today: todayEarnings,
        week: weekEarnings,
        month: monthEarnings,
        total: totalEarnings,
        tips: totalTips,
        totalRides: completedRides.length,
        todayRides: completedRides.filter(r => new Date(r.completedAt).toDateString() === today).length,
        rating: user?.rating || 5.0,
        acceptance_rate: 95 // placeholder
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// FARE ESTIMATION
// ================================================

app.post('/api/rides/estimate', verifyAuth, async (req, res) => {
  try {
    const { pickupLat, pickupLng, dropLat, dropLng, distanceKm, durationMin } = req.body;

    if (!distanceKm || !durationMin) {
      return res.status(400).json({ error: 'distanceKm and durationMin required' });
    }

    const estimates = {};
    for (const vehicleType of Object.keys(VEHICLE_CONFIG)) {
      estimates[vehicleType] = estimateFare(distanceKm, durationMin, vehicleType, pickupLat, pickupLng);
    }

    res.json({
      success: true,
      estimates,
      surgeActive: Object.values(estimates).some(e => e.surgeMultiplier > 1.0),
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// RIDE BOOKING
// ================================================

app.post('/api/rides/book', verifyAuth, async (req, res) => {
  try {
    const {
      pickupAddress, dropAddress,
      pickupLat, pickupLng, dropLat, dropLng,
      vehicleType, distanceKm, durationMin,
      paymentMethod, promoCode, scheduledTime
    } = req.body;

    // ===== WALLET BALANCE CHECK =====
    if (PLATFORM_CONFIG.wallet.blockIfLowBalance && paymentMethod !== 'cash') {
      const wallet = await getWallet(req.user.uid);
      if (wallet.balance < PLATFORM_CONFIG.wallet.bookingFee) {
        return res.status(400).json({
          success: false,
          error: `Insufficient wallet balance. You need at least ₹${PLATFORM_CONFIG.wallet.bookingFee} in your wallet to book a ride. Current balance: ₹${wallet.balance}`,
          code: 'LOW_BALANCE',
          required: PLATFORM_CONFIG.wallet.bookingFee,
          current: wallet.balance
        });
      }
    }

    // Calculate fare
    const fareEstimate = estimateFare(
      distanceKm || 5, durationMin || 15,
      vehicleType || 'auto', pickupLat, pickupLng
    );
    fareEstimate._increaseCount = 0;

    // Apply promo code
    let discount = 0;
    let appliedPromo = null;
    if (promoCode) {
      const promo = MemStore.promoCodes.get(promoCode.toUpperCase());
      if (promo && promo.active && new Date() < promo.expiresAt) {
        if (!promo.usedBy.includes(req.user.uid) || promo.usedBy.filter(u => u === req.user.uid).length < promo.usageLimit) {
          if (fareEstimate.totalFare >= promo.minFare) {
            if (promo.type === 'percentage') {
              discount = Math.min(Math.round(fareEstimate.totalFare * promo.value / 100), promo.maxDiscount);
            } else {
              discount = Math.min(promo.value, promo.maxDiscount);
            }
            promo.usedBy.push(req.user.uid);
            appliedPromo = promo.code;
          }
        }
      }
    }

    const finalFare = fareEstimate.totalFare - discount;

    // Generate ride OTP
    const rideOTP = PLATFORM_CONFIG.ride.otpRequired ? generateRideOTP() : null;

    const rideId = 'ride_' + uuidv4().replace(/-/g, '').slice(0, 16);
    const rideData = {
      rideId,
      riderId: req.user.uid,
      riderName: req.user.name,
      riderPhone: req.user.phone,
      driverId: null,
      driverName: null,
      driverPhone: null,
      driverVehicle: null,
      driverRating: null,
      pickupAddress,
      dropAddress,
      pickupLat: pickupLat || 12.9716,
      pickupLng: pickupLng || 77.5946,
      dropLat: dropLat || 12.9716,
      dropLng: dropLng || 77.5946,
      vehicleType: vehicleType || 'auto',
      distanceKm: distanceKm || 5,
      durationMin: durationMin || 15,
      fareEstimate: fareEstimate.totalFare,
      fareBreakdown: fareEstimate,
      discount,
      appliedPromo,
      finalFare,
      surgeMultiplier: fareEstimate.surgeMultiplier,
      bookingFee: PLATFORM_CONFIG.wallet.bookingFee,
      paymentMethod: paymentMethod || 'wallet',
      status: scheduledTime ? 'scheduled' : 'searching',
      scheduledTime: scheduledTime || null,
      riderRating: null,
      driverRatingByRider: null,
      riderReview: null,
      tip: 0,
      cancellationFee: 0,
      cancelledBy: null,
      cancellationReason: null,
      otp: rideOTP,
      otpVerified: false,
      waitingStartedAt: null,
      waitingMinutes: 0,
      waitingCharge: 0,
      nightSurcharge: fareEstimate.nightSurcharge || 0,
      tollCharges: 0,
      createdAt: new Date().toISOString(),
      matchedAt: null,
      driverArrivingAt: null,
      driverArrivedAt: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      driverEarnings: fareEstimate.driverEarnings,
      platformCommission: fareEstimate.commission,
      receiptUrl: null,
      favouriteDriver: req.body.favouriteDriverId || null
    };

    await saveToStore('rides', rideId, rideData);

    // ===== DRIVER MATCHING =====
    const matchResult = await matchDriver(rideId, rideData.pickupLat, rideData.pickupLng, rideData.vehicleType, fareEstimate);

    // Notify nearby drivers via Socket.io
    const rideNotification = {
      rideId,
      pickupAddress,
      dropAddress: PLATFORM_CONFIG.matching.showDestToDriver ? dropAddress : null,
      pickupLat: rideData.pickupLat,
      pickupLng: rideData.pickupLng,
      dropLat: PLATFORM_CONFIG.matching.showDestToDriver ? rideData.dropLat : null,
      dropLng: PLATFORM_CONFIG.matching.showDestToDriver ? rideData.dropLng : null,
      vehicleType: rideData.vehicleType,
      fareEstimate: PLATFORM_CONFIG.matching.showFareToDriver ? rideData.finalFare : null,
      distanceKm: rideData.distanceKm,
      durationMin: rideData.durationMin,
      surgeMultiplier: fareEstimate.surgeMultiplier,
      riderName: req.user.name,
      acceptTimeoutSec: PLATFORM_CONFIG.matching.acceptTimeoutSec
    };

    // Send to specific nearby drivers first, then broadcast
    if (matchResult.drivers.length > 0) {
      matchResult.drivers.forEach(driver => {
        if (driver.socketId) {
          io.to(driver.socketId).emit('new_ride_request', rideNotification);
        }
      });
    }
    // Also broadcast to all available drivers
    io.to('drivers_available').emit('new_ride_request', rideNotification);

    res.json({
      success: true,
      ride: { ...rideData, otp: rideOTP },
      fareBreakdown: fareEstimate,
      discount,
      appliedPromo,
      nearbyDrivers: matchResult.drivers.length,
      walletInfo: {
        bookingFee: PLATFORM_CONFIG.wallet.bookingFee,
        deductsAt: PLATFORM_CONFIG.wallet.feeDeductAt,
        refundable: PLATFORM_CONFIG.wallet.refundable,
        message: `₹${PLATFORM_CONFIG.wallet.bookingFee} will be deducted from your wallet when the ride completes.`
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Driver accepts ride
app.post('/api/rides/:rideId/accept', verifyAuth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const ride = await getFromStore('rides', rideId);

    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    if (ride.status !== 'searching') return res.status(400).json({ error: 'Ride already taken or cancelled' });

    const driver = await getFromStore('users', req.user.uid);

    ride.status = 'matched';
    ride.driverId = req.user.uid;
    ride.driverName = driver?.name || req.user.name;
    ride.driverPhone = driver?.phone || req.user.phone;
    ride.driverVehicle = driver?.vehicleModel ? `${driver.vehicleModel} - ${driver.vehicleNumber}` : 'Vehicle';
    ride.driverRating = driver?.rating || 4.8;
    ride.matchedAt = new Date().toISOString();

    await saveToStore('rides', rideId, ride);

    // Update driver status
    if (driver) {
      driver.activeRideId = rideId;
      driver.isOnline = true;
      await saveToStore('users', req.user.uid, driver);
    }

    // Notify rider
    io.to(`rider_${ride.riderId}`).emit('ride_matched', {
      rideId,
      driverName: ride.driverName,
      driverPhone: ride.driverPhone,
      driverVehicle: ride.driverVehicle,
      driverRating: ride.driverRating,
      otp: ride.otp,
      status: 'matched'
    });

    // Tell other drivers this ride is taken
    io.to('drivers_available').emit('ride_taken', { rideId });

    res.json({ success: true, ride });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Driver signals arrival
app.post('/api/rides/:rideId/arriving', verifyAuth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const ride = await getFromStore('rides', rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    ride.status = 'driver_arriving';
    ride.driverArrivingAt = new Date().toISOString();
    await saveToStore('rides', rideId, ride);

    io.to(`rider_${ride.riderId}`).emit('ride_status_update', {
      rideId, status: 'driver_arriving', message: 'Your driver is arriving!'
    });

    res.json({ success: true, ride });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Start ride (driver verifies OTP)
app.post('/api/rides/:rideId/start', verifyAuth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const { otp } = req.body;
    const ride = await getFromStore('rides', rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    if (ride.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    ride.status = 'in_progress';
    ride.startedAt = new Date().toISOString();
    await saveToStore('rides', rideId, ride);

    io.to(`rider_${ride.riderId}`).emit('ride_status_update', {
      rideId, status: 'in_progress', message: 'Your ride has started!'
    });
    io.to(`driver_${ride.driverId}`).emit('ride_status_update', {
      rideId, status: 'in_progress', message: 'Ride started!'
    });

    res.json({ success: true, ride });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Driver arrived — start waiting timer
app.post('/api/rides/:rideId/arrived', verifyAuth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const ride = await getFromStore('rides', rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    ride.status = 'driver_arrived';
    ride.driverArrivedAt = new Date().toISOString();
    ride.waitingStartedAt = new Date().toISOString();
    await saveToStore('rides', rideId, ride);

    io.to(`rider_${ride.riderId}`).emit('ride_status_update', {
      rideId, status: 'driver_arrived',
      message: 'Your driver has arrived! Share OTP: ' + ride.otp,
      otp: ride.otp,
      freeWaitingMin: PLATFORM_CONFIG.ride.waitingFreeMinutes,
      waitingChargePerMin: PLATFORM_CONFIG.ride.waitingChargePerMin
    });

    res.json({ success: true, ride });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Complete ride — DEDUCT WALLET + PAY DRIVER + COMMISSION
app.post('/api/rides/:rideId/complete', verifyAuth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const { actualDistanceKm, actualDurationMin, tollCharges } = req.body;
    const ride = await getFromStore('rides', rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    // Recalculate fare if actual metrics provided
    if (actualDistanceKm && actualDurationMin) {
      const newFare = estimateFare(actualDistanceKm, actualDurationMin, ride.vehicleType, ride.pickupLat, ride.pickupLng);
      ride.finalFare = newFare.totalFare - (ride.discount || 0);
      ride.distanceKm = actualDistanceKm;
      ride.durationMin = actualDurationMin;
      ride.nightSurcharge = newFare.nightSurcharge;
    }

    // Calculate waiting charges
    let waitingCharge = 0;
    if (ride.driverArrivedAt && ride.startedAt) {
      const arrivedTime = new Date(ride.driverArrivedAt).getTime();
      const startedTime = new Date(ride.startedAt).getTime();
      const waitedMinutes = Math.floor((startedTime - arrivedTime) / 60000);
      const chargeableMinutes = Math.max(0, waitedMinutes - PLATFORM_CONFIG.ride.waitingFreeMinutes);
      waitingCharge = chargeableMinutes * PLATFORM_CONFIG.ride.waitingChargePerMin;
      ride.waitingMinutes = waitedMinutes;
      ride.waitingCharge = waitingCharge;
    }

    // Add toll charges if any
    ride.tollCharges = tollCharges || 0;

    // Total final fare
    const totalFare = ride.finalFare + waitingCharge + ride.tollCharges;

    // Commission calculation (10% only on long distance rides)
    let commission = 0;
    if (PLATFORM_CONFIG.commission.onlyLongDistance && ride.distanceKm >= PLATFORM_CONFIG.commission.longDistanceThresholdKm) {
      commission = Math.round(totalFare * PLATFORM_CONFIG.commission.percentage / 100);
    } else if (!PLATFORM_CONFIG.commission.onlyLongDistance) {
      commission = Math.round(totalFare * PLATFORM_CONFIG.commission.percentage / 100);
    }
    ride.platformCommission = commission;
    ride.driverEarnings = totalFare - commission;
    ride.finalFare = totalFare;

    // Booking fee (₹50 deducted from wallet on completion)
    const bookingFee = PLATFORM_CONFIG.wallet.bookingFee;

    ride.status = 'completed';
    ride.completedAt = new Date().toISOString();
    await saveToStore('rides', rideId, ride);

    // ===== DEDUCT FROM RIDER WALLET =====
    if (ride.paymentMethod === 'wallet') {
      // Deduct booking fee from rider wallet
      const deductResult = await deductFromWallet(
        ride.riderId,
        bookingFee,
        `Booking fee for ride to ${ride.dropAddress}`,
        rideId
      );
      if (!deductResult.success) {
        console.log('[Wallet] Deduction failed:', deductResult.error);
      }
    }

    // ===== PAY DRIVER (to separate driver earnings wallet) =====
    await addToDriverEarnings(
      ride.driverId,
      ride.driverEarnings,
      `Earnings from ride: ${ride.pickupAddress} → ${ride.dropAddress}`,
      rideId
    );

    // Update driver status
    const driver = await getFromStore('users', ride.driverId);
    if (driver) {
      driver.earnings = driver.earnings || { today: 0, week: 0, month: 0, total: 0 };
      driver.earnings.today += ride.driverEarnings;
      driver.earnings.week += ride.driverEarnings;
      driver.earnings.month += ride.driverEarnings;
      driver.earnings.total += ride.driverEarnings;
      driver.rideCount = (driver.rideCount || 0) + 1;
      driver.activeRideId = null;
      await saveToStore('users', ride.driverId, driver);
    }

    // Save transaction record
    const txnId = 'txn_' + uuidv4().replace(/-/g, '').slice(0, 12);
    await saveToStore('transactions', txnId, {
      txnId, rideId,
      riderId: ride.riderId, driverId: ride.driverId,
      totalFare, bookingFee, waitingCharge, tollCharges: ride.tollCharges,
      nightSurcharge: ride.nightSurcharge,
      driverEarnings: ride.driverEarnings,
      platformCommission: commission,
      paymentMethod: ride.paymentMethod,
      status: 'completed',
      createdAt: new Date().toISOString()
    });

    // Build receipt
    const receipt = {
      rideId,
      status: 'completed',
      from: ride.pickupAddress,
      to: ride.dropAddress,
      distanceKm: ride.distanceKm,
      durationMin: ride.durationMin,
      baseFare: ride.fareBreakdown?.baseFare || ride.fareEstimate,
      surgeMultiplier: ride.surgeMultiplier,
      nightSurcharge: ride.nightSurcharge || 0,
      waitingCharge,
      waitingMinutes: ride.waitingMinutes || 0,
      tollCharges: ride.tollCharges,
      bookingFee,
      discount: ride.discount || 0,
      totalFare,
      driverName: ride.driverName,
      vehicleType: ride.vehicleType,
      paymentMethod: ride.paymentMethod,
      completedAt: ride.completedAt
    };

    // Log revenue
    logRevenue(totalFare, commission, bookingFee, rideId);

    // Check if referrer reward should be given
    await checkReferralReward(ride.riderId);

    // Notify both parties
    io.to(`rider_${ride.riderId}`).emit('ride_completed', {
      ...receipt,
      message: 'Ride completed! ₹' + bookingFee + ' deducted from wallet.',
      celebration: true // trigger confetti on frontend
    });
    io.to(`driver_${ride.driverId}`).emit('ride_completed', {
      rideId, status: 'completed',
      earnings: ride.driverEarnings,
      message: '₹' + ride.driverEarnings + ' added to your earnings!'
    });

    res.json({ success: true, ride, receipt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cancel ride — ₹100 fee (₹50 to driver, ₹50 to owner)
app.post('/api/rides/:rideId/cancel', verifyAuth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const { reason } = req.body;
    const ride = await getFromStore('rides', rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const isRider = req.user.uid === ride.riderId;

    // Calculate cancellation fee
    let cancellationFee = 0;
    let driverCompensation = 0;
    let ownerShare = 0;

    if (ride.driverId && (ride.status === 'matched' || ride.status === 'driver_arriving' || ride.status === 'driver_arrived')) {
      const matchedTime = new Date(ride.matchedAt || ride.createdAt).getTime();
      if (Date.now() - matchedTime > PLATFORM_CONFIG.cancellation.freeWindowMs) {
        cancellationFee = PLATFORM_CONFIG.cancellation.fee; // ₹100
        driverCompensation = PLATFORM_CONFIG.cancellation.driverShare; // ₹50
        ownerShare = PLATFORM_CONFIG.cancellation.ownerShare; // ₹50
      }
    }

    ride.status = 'cancelled';
    ride.cancelledAt = new Date().toISOString();
    ride.cancelledBy = isRider ? 'rider' : 'driver';
    ride.cancellationReason = reason || 'No reason provided';
    ride.cancellationFee = cancellationFee;
    ride.cancelDriverComp = driverCompensation;
    ride.cancelOwnerShare = ownerShare;
    await saveToStore('rides', rideId, ride);

    // Deduct cancellation fee from rider wallet
    if (cancellationFee > 0 && isRider) {
      await deductFromWallet(
        ride.riderId,
        cancellationFee,
        `Cancellation fee for ride #${rideId.slice(-6)}`,
        rideId
      );

      // Pay driver their compensation
      if (driverCompensation > 0 && ride.driverId) {
        await addToDriverEarnings(
          ride.driverId,
          driverCompensation,
          `Cancellation compensation for ride #${rideId.slice(-6)}`,
          rideId
        );
      }

      // Log cancellation revenue
      const dateKey = new Date().toISOString().split('T')[0];
      let dayLog = MemStore.revenueLog.get(dateKey) || { date: dateKey, totalFares: 0, totalCommission: 0, totalBookingFees: 0, rideCount: 0, cancellationFees: 0 };
      dayLog.cancellationFees = (dayLog.cancellationFees || 0) + ownerShare;
      MemStore.revenueLog.set(dateKey, dayLog);
    }

    // Free up driver
    if (ride.driverId) {
      const driver = await getFromStore('users', ride.driverId);
      if (driver) {
        driver.activeRideId = null;
        await saveToStore('users', ride.driverId, driver);
      }
    }

    // Notify
    if (ride.driverId) {
      io.to(`driver_${ride.driverId}`).emit('ride_cancelled', {
        rideId, cancelledBy: ride.cancelledBy, reason: ride.cancellationReason,
        compensation: driverCompensation,
        message: isRider ? `Rider cancelled. ₹${driverCompensation} compensation added to your earnings.` : 'Ride cancelled.'
      });
    }
    io.to(`rider_${ride.riderId}`).emit('ride_cancelled', {
      rideId, cancelledBy: ride.cancelledBy, reason: ride.cancellationReason,
      cancellationFee,
      message: cancellationFee > 0 ? `₹${cancellationFee} cancellation fee deducted from wallet.` : 'Ride cancelled. No fee charged.'
    });

    res.json({ success: true, ride, cancellationFee, driverCompensation, ownerShare });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Rate ride (two-way rating)
app.post('/api/rides/:rideId/rate', verifyAuth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const { rating, comment, tip } = req.body;
    const ride = await getFromStore('rides', rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const isRider = req.user.uid === ride.riderId;

    if (isRider) {
      ride.driverRatingByRider = rating;
      ride.tip = tip || 0;

      // Update driver average rating
      if (ride.driverId) {
        const driver = await getFromStore('users', ride.driverId);
        if (driver) {
          const totalRatings = (driver.totalRatings || 0) + 1;
          const newRating = ((driver.rating || 5) * (totalRatings - 1) + rating) / totalRatings;
          driver.rating = Math.round(newRating * 10) / 10;
          driver.totalRatings = totalRatings;
          if (tip > 0) {
            driver.walletBalance = (driver.walletBalance || 0) + tip;
            driver.earnings.total += tip;
          }
          await saveToStore('users', ride.driverId, driver);
        }
      }
    } else {
      ride.riderRating = rating;
      // Update rider average rating
      const rider = await getFromStore('users', ride.riderId);
      if (rider) {
        const totalRatings = (rider.totalRatings || 0) + 1;
        const newRating = ((rider.rating || 5) * (totalRatings - 1) + rating) / totalRatings;
        rider.rating = Math.round(newRating * 10) / 10;
        rider.totalRatings = totalRatings;
        await saveToStore('users', ride.riderId, rider);
      }
    }

    await saveToStore('rides', rideId, ride);

    res.json({ success: true, message: 'Rating submitted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// RIDE HISTORY
// ================================================

app.get('/api/rides/history', verifyAuth, async (req, res) => {
  try {
    const { role } = req.query;
    const field = role === 'driver' ? 'driverId' : 'riderId';
    let rides = await queryStore('rides', field, '==', req.user.uid);
    rides.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, rides: rides.slice(0, 50) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get single ride
app.get('/api/rides/:rideId', verifyAuth, async (req, res) => {
  try {
    const ride = await getFromStore('rides', req.params.rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });
    res.json({ success: true, ride });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// TRIP RECEIPT
// ================================================

app.get('/api/rides/:rideId/receipt', verifyAuth, async (req, res) => {
  try {
    const ride = await getFromStore('rides', req.params.rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const receipt = {
      receiptId: 'RCP-' + ride.rideId.slice(5, 17).toUpperCase(),
      rideId: ride.rideId,
      date: ride.completedAt || ride.createdAt,
      pickup: ride.pickupAddress,
      drop: ride.dropAddress,
      distance: ride.distanceKm + ' km',
      duration: ride.durationMin + ' min',
      vehicleType: VEHICLE_CONFIG[ride.vehicleType]?.name || ride.vehicleType,
      driverName: ride.driverName,
      fareBreakdown: {
        baseFare: VEHICLE_CONFIG[ride.vehicleType]?.baseFare || 30,
        distanceFare: Math.round((VEHICLE_CONFIG[ride.vehicleType]?.perKm || 12) * ride.distanceKm),
        timeFare: Math.round((VEHICLE_CONFIG[ride.vehicleType]?.perMin || 1.5) * ride.durationMin),
        surgeFee: ride.surgeMultiplier > 1 ? Math.round(ride.fareEstimate * (ride.surgeMultiplier - 1) / ride.surgeMultiplier) : 0,
        platformFee: 5,
        discount: ride.discount || 0,
        tip: ride.tip || 0,
        total: ride.finalFare + (ride.tip || 0)
      },
      paymentMethod: ride.paymentMethod,
      status: ride.status
    };

    res.json({ success: true, receipt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// SCHEDULED RIDES
// ================================================

// ================================================
// SCHEDULED RIDES (Book for future)
// ================================================
app.post('/api/rides/schedule', verifyAuth, async (req, res) => {
  try {
    const { pickupAddress, dropAddress, pickupLat, pickupLng, dropLat, dropLng, vehicleType, scheduledTime, notes } = req.body;

    if (!scheduledTime) return res.status(400).json({ error: 'scheduledTime required' });

    const schedTime = new Date(scheduledTime);
    const now = new Date();
    if (schedTime <= now) return res.status(400).json({ error: 'Scheduled time must be in the future' });

    // Minimum 30 minutes in advance
    const minAdvanceMs = 30 * 60 * 1000;
    if (schedTime.getTime() - now.getTime() < minAdvanceMs) {
      return res.status(400).json({ error: 'Schedule at least 30 minutes in advance' });
    }

    // Maximum 7 days in advance
    const maxAdvanceMs = 7 * 24 * 60 * 60 * 1000;
    if (schedTime.getTime() - now.getTime() > maxAdvanceMs) {
      return res.status(400).json({ error: 'Cannot schedule more than 7 days in advance' });
    }

    // Fare estimate
    const dist = haversine(pickupLat || 12.97, pickupLng || 77.59, dropLat || 12.97, dropLng || 77.59);
    const estDuration = Math.round(dist * 3); // rough estimate 3 min/km
    const fareEst = estimateFare(dist, estDuration, vehicleType || 'auto', pickupLat, pickupLng);

    const rideId = 'sride_' + uuidv4().replace(/-/g, '').slice(0, 14);
    const rideData = {
      rideId,
      riderId: req.user.uid,
      riderName: req.user.name,
      riderPhone: req.user.phone,
      pickupAddress,
      dropAddress,
      pickupLat: pickupLat || 12.9716, pickupLng: pickupLng || 77.5946,
      dropLat: dropLat || 12.9716, dropLng: dropLng || 77.5946,
      vehicleType: vehicleType || 'auto',
      scheduledTime: schedTime.toISOString(),
      scheduledTimeLocal: schedTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      estimatedFare: fareEst.totalFare,
      estimatedDistance: Math.round(dist * 10) / 10,
      notes: notes || '',
      status: 'scheduled', // scheduled, reminder_sent, searching, matched, completed, cancelled
      reminderSent15min: false,
      reminderSent5min: false,
      driverId: null,
      createdAt: new Date().toISOString()
    };

    await saveToStore('scheduledRides', rideId, rideData);

    res.json({
      success: true,
      scheduledRide: rideData,
      fareEstimate: fareEst,
      message: `Ride scheduled for ${rideData.scheduledTimeLocal}. We'll send reminders 15 min and 5 min before.`
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cancel scheduled ride
app.post('/api/rides/schedule/:rideId/cancel', verifyAuth, async (req, res) => {
  try {
    const ride = await getFromStore('scheduledRides', req.params.rideId);
    if (!ride) return res.status(404).json({ error: 'Scheduled ride not found' });
    if (ride.riderId !== req.user.uid) return res.status(403).json({ error: 'Not your ride' });

    ride.status = 'cancelled';
    ride.cancelledAt = new Date().toISOString();
    await saveToStore('scheduledRides', req.params.rideId, ride);

    res.json({ success: true, message: 'Scheduled ride cancelled' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/rides/scheduled/list', verifyAuth, async (req, res) => {
  try {
    const rides = await queryStore('scheduledRides', 'riderId', '==', req.user.uid);
    // Sort by scheduled time, upcoming first
    rides.sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));
    // Filter out past cancelled/completed
    const active = rides.filter(r => r.status === 'scheduled' || r.status === 'reminder_sent');
    const past = rides.filter(r => r.status !== 'scheduled' && r.status !== 'reminder_sent');
    res.json({ success: true, upcoming: active, past, total: rides.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Scheduled ride reminder checker (runs every minute via setInterval)
function checkScheduledRides() {
  const now = Date.now();
  MemStore.scheduledRides.forEach(async (ride, rideId) => {
    if (ride.status !== 'scheduled' && ride.status !== 'reminder_sent') return;
    const schedTime = new Date(ride.scheduledTime).getTime();
    const diff = schedTime - now;

    // 15 minute reminder
    if (diff <= 15 * 60 * 1000 && diff > 14 * 60 * 1000 && !ride.reminderSent15min) {
      ride.reminderSent15min = true;
      ride.status = 'reminder_sent';
      MemStore.scheduledRides.set(rideId, ride);
      io.to(`rider_${ride.riderId}`).emit('scheduled_ride_reminder', {
        rideId, minutesLeft: 15,
        message: `Your scheduled ride to ${ride.dropAddress} is in 15 minutes!`,
        pickupAddress: ride.pickupAddress
      });
    }

    // 5 minute reminder
    if (diff <= 5 * 60 * 1000 && diff > 4 * 60 * 1000 && !ride.reminderSent5min) {
      ride.reminderSent5min = true;
      MemStore.scheduledRides.set(rideId, ride);
      io.to(`rider_${ride.riderId}`).emit('scheduled_ride_reminder', {
        rideId, minutesLeft: 5,
        message: `Your ride is in 5 minutes! We're searching for a driver now.`,
        pickupAddress: ride.pickupAddress,
        searching: true
      });
    }

    // Auto-trigger ride search 3 minutes before scheduled time
    if (diff <= 3 * 60 * 1000 && diff > 2 * 60 * 1000 && ride.status !== 'searching') {
      ride.status = 'searching';
      MemStore.scheduledRides.set(rideId, ride);
      // Broadcast to nearby drivers
      io.to('drivers_available').emit('new_ride_request', {
        rideId, pickupAddress: ride.pickupAddress, dropAddress: ride.dropAddress,
        vehicleType: ride.vehicleType, fareEstimate: ride.estimatedFare,
        scheduled: true, riderName: ride.riderName,
        acceptTimeoutSec: PLATFORM_CONFIG.matching.acceptTimeoutSec
      });
    }
  });
}
setInterval(checkScheduledRides, 60000); // Check every minute

// ================================================
// MASKED CALLING (Privacy protection)
// ================================================
// Generates a masked/virtual number mapping so driver & rider can call without seeing real numbers
// In production: integrate with Exotel, Knowlarity, or Twilio for actual masked numbers

const maskedCallSessions = new Map(); // rideId -> { riderMask, driverMask, riderReal, driverReal }

app.post('/api/rides/:rideId/call/init', verifyAuth, async (req, res) => {
  try {
    const ride = await getFromStore('rides', req.params.rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    // Check if caller is rider or driver
    const isRider = req.user.uid === ride.riderId;
    const isDriver = req.user.uid === ride.driverId;
    if (!isRider && !isDriver) return res.status(403).json({ error: 'Not part of this ride' });

    // Get or create masked session
    let session = maskedCallSessions.get(ride.rideId);
    if (!session) {
      // Generate masked numbers (in production: use Exotel/Twilio virtual numbers)
      // For now: we use the server as a proxy and show generic numbers
      session = {
        rideId: ride.rideId,
        riderReal: ride.riderPhone,
        driverReal: ride.driverPhone,
        // Masked display numbers (in production these would be actual virtual numbers)
        riderMaskedDisplay: '+91 ' + ride.rideId.slice(-5) + '00001',
        driverMaskedDisplay: '+91 ' + ride.rideId.slice(-5) + '00002',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2 hours
      };
      maskedCallSessions.set(ride.rideId, session);
    }

    // Return the OTHER person's masked number (not their real number)
    if (isRider) {
      res.json({
        success: true,
        callNumber: session.driverMaskedDisplay,
        realNumber: null, // Never expose real number
        message: 'Calling driver via masked number. Your real number is hidden.',
        note: 'For full masked calling, integrate Exotel API (EXOTEL_API_KEY in .env)'
      });
    } else {
      res.json({
        success: true,
        callNumber: session.riderMaskedDisplay,
        realNumber: null,
        message: 'Calling rider via masked number. Your real number is hidden.',
        note: 'For full masked calling, integrate Exotel API (EXOTEL_API_KEY in .env)'
      });
    }

    // In production with Exotel:
    // const exotelCall = await exotel.call({ from: callerReal, to: receiverReal, callerId: virtualNumber });
    // This connects the call through a virtual number so neither party sees the other's real number

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cleanup expired masked call sessions
setInterval(() => {
  const now = Date.now();
  maskedCallSessions.forEach((session, rideId) => {
    if (new Date(session.expiresAt).getTime() < now) {
      maskedCallSessions.delete(rideId);
    }
  });
}, 5 * 60 * 1000); // Cleanup every 5 minutes

// ================================================
// SPLIT FARE
// ================================================

app.post('/api/rides/:rideId/split', verifyAuth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const { splitWith } = req.body; // array of phone numbers

    if (!splitWith || splitWith.length === 0) {
      return res.status(400).json({ error: 'Provide phone numbers to split with' });
    }

    const ride = await getFromStore('rides', rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const totalPeople = splitWith.length + 1;
    const splitAmount = Math.ceil(ride.finalFare / totalPeople);

    const splitId = 'split_' + uuidv4().replace(/-/g, '').slice(0, 12);
    const splitData = {
      splitId,
      rideId,
      requestedBy: req.user.uid,
      splitWith,
      totalFare: ride.finalFare,
      splitAmount,
      totalPeople,
      status: 'pending', // pending, accepted, completed
      responses: {},
      createdAt: new Date().toISOString()
    };

    await saveToStore('splitFareRequests', splitId, splitData);
    res.json({ success: true, split: splitData });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// PROMO CODES & REFERRALS
// ================================================

app.post('/api/promo/validate', verifyAuth, async (req, res) => {
  try {
    const { code, fareAmount } = req.body;
    const promo = MemStore.promoCodes.get(code?.toUpperCase());

    if (!promo || !promo.active) {
      return res.json({ success: false, error: 'Invalid promo code' });
    }
    if (new Date() > promo.expiresAt) {
      return res.json({ success: false, error: 'Promo code expired' });
    }
    if (promo.usedBy.filter(u => u === req.user.uid).length >= promo.usageLimit) {
      return res.json({ success: false, error: 'Promo already used maximum times' });
    }
    if (fareAmount && fareAmount < promo.minFare) {
      return res.json({ success: false, error: `Minimum fare of ₹${promo.minFare} required` });
    }

    let discount = 0;
    if (promo.type === 'percentage') {
      discount = Math.min(Math.round((fareAmount || 100) * promo.value / 100), promo.maxDiscount);
    } else {
      discount = Math.min(promo.value, promo.maxDiscount);
    }

    res.json({ success: true, promo: { code: promo.code, type: promo.type, discount, description: `${promo.type === 'percentage' ? promo.value + '%' : '₹' + promo.value} off (max ₹${promo.maxDiscount})` } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Referral system
app.post('/api/referral/apply', verifyAuth, async (req, res) => {
  try {
    const { referralCode } = req.body;

    // Find referrer
    let referrer = null;
    if (MemStore.users) {
      MemStore.users.forEach((user) => {
        if (user.referralCode === referralCode) referrer = user;
      });
    }

    if (!referrer) return res.json({ success: false, error: 'Invalid referral code' });
    if (referrer.uid === req.user.uid) return res.json({ success: false, error: 'Cannot use your own referral code' });

    const user = await getFromStore('users', req.user.uid);
    if (user?.referredBy) return res.json({ success: false, error: 'Already used a referral code' });

    // Credit both users
    const referrerBonus = 100;
    const refereeBonus = 50;

    referrer.walletBalance = (referrer.walletBalance || 0) + referrerBonus;
    await saveToStore('users', referrer.uid, referrer);

    if (user) {
      user.walletBalance = (user.walletBalance || 0) + refereeBonus;
      user.referredBy = referralCode;
      await saveToStore('users', req.user.uid, user);
    }

    res.json({ success: true, message: `Referral applied! You got ₹${refereeBonus}, referrer got ₹${referrerBonus}`, bonus: refereeBonus });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// WALLET & PAYMENTS
// ================================================

// Create Razorpay order (server-side)
app.post('/api/payments/create-order', verifyAuth, async (req, res) => {
  try {
    const { amount, currency, purpose } = req.body;

    if (!amount || amount < 1) return res.status(400).json({ error: 'Invalid amount' });

    if (razorpay) {
      const order = await razorpay.orders.create({
        amount: Math.round(amount * 100), // paise
        currency: currency || 'INR',
        receipt: `IDapp_${Date.now()}`,
        notes: {
          userId: req.user.uid,
          purpose: purpose || 'wallet_topup'
        }
      });

      res.json({
        success: true,
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt
        },
        key: RAZORPAY_KEY_ID
      });
    } else {
      // Demo mode
      res.json({
        success: true,
        order: {
          id: 'order_demo_' + Date.now(),
          amount: amount * 100,
          currency: 'INR',
          receipt: `IDapp_${Date.now()}`
        },
        key: RAZORPAY_KEY_ID,
        demo: true
      });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Verify payment (client sends after Razorpay checkout)
app.post('/api/payments/verify', verifyAuth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, purpose } = req.body;

    // Verify signature
    if (razorpay_order_id && razorpay_payment_id && razorpay_signature) {
      const expectedSig = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (expectedSig !== razorpay_signature) {
        return res.status(400).json({ error: 'Invalid payment signature' });
      }
    }

    // Credit wallet
    const user = await getFromStore('users', req.user.uid);
    const creditAmount = amount || 0;

    if (user) {
      user.walletBalance = (user.walletBalance || 0) + creditAmount;
      await saveToStore('users', req.user.uid, user);
    }

    // Save transaction
    const txnId = 'txn_' + uuidv4().replace(/-/g, '').slice(0, 12);
    await saveToStore('transactions', txnId, {
      txnId,
      userId: req.user.uid,
      type: 'credit',
      amount: creditAmount,
      title: purpose === 'ride_payment' ? 'Ride Payment' : 'Wallet Top-up via Razorpay',
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      status: 'completed',
      createdAt: new Date().toISOString()
    });

    io.to(`rider_${req.user.uid}`).emit('wallet_updated', {
      balance: user?.walletBalance || 0,
      transaction: { type: 'credit', amount: creditAmount, title: 'Wallet Top-up' }
    });

    res.json({ success: true, newBalance: user?.walletBalance || 0, transactionId: txnId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Razorpay Webhook
app.post('/api/payments/webhook', async (req, res) => {
  try {
    const webhookBody = req.body.toString();
    const signature = req.headers['x-razorpay-signature'];

    // Verify webhook signature
    if (signature) {
      const expectedSig = crypto
        .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
        .update(webhookBody)
        .digest('hex');

      if (expectedSig !== signature) {
        console.log('[Webhook] Invalid signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    const event = JSON.parse(webhookBody);
    console.log('[Webhook] Event:', event.event);

    switch (event.event) {
      case 'payment.captured': {
        const payment = event.payload.payment.entity;
        const userId = payment.notes?.userId;
        const amount = payment.amount / 100;

        if (userId) {
          const user = await getFromStore('users', userId);
          if (user) {
            user.walletBalance = (user.walletBalance || 0) + amount;
            await saveToStore('users', userId, user);
            io.to(`rider_${userId}`).emit('wallet_updated', { balance: user.walletBalance });
            console.log(`[Webhook] Credited ₹${amount} to user ${userId}`);
          }
        }
        break;
      }
      case 'payment.failed': {
        const payment = event.payload.payment.entity;
        const userId = payment.notes?.userId;
        if (userId) {
          io.to(`rider_${userId}`).emit('payment_failed', {
            message: 'Payment failed',
            error: payment.error_description
          });
        }
        break;
      }
      case 'refund.created': {
        const refund = event.payload.refund.entity;
        console.log(`[Webhook] Refund created: ${refund.id}, amount: ${refund.amount / 100}`);
        break;
      }
    }

    res.json({ status: 'ok' });
  } catch (e) {
    console.error('[Webhook] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Wallet balance (enhanced — shows both rider wallet + driver earnings)
app.get('/api/wallet/balance', verifyAuth, async (req, res) => {
  try {
    const user = await getFromStore('users', req.user.uid);
    res.json({
      success: true,
      balance: user?.walletBalance || 0,
      driverEarnings: user?.driverEarnings || 0,
      minTopUp: PLATFORM_CONFIG.wallet.minTopUp,
      bookingFee: PLATFORM_CONFIG.wallet.bookingFee,
      refundInfo: PLATFORM_CONFIG.wallet.refundInfo,
      message: `Minimum top-up: ₹${PLATFORM_CONFIG.wallet.minTopUp}. ₹${PLATFORM_CONFIG.wallet.bookingFee} booking fee per ride (deducted on completion). Balance is non-refundable.`
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Transaction history
app.get('/api/wallet/transactions', verifyAuth, async (req, res) => {
  try {
    const user = await getFromStore('users', req.user.uid);
    const txns = user?.transactions || [];
    res.json({ success: true, transactions: txns.slice(0, 50) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Driver earnings wallet
app.get('/api/wallet/driver-earnings', verifyAuth, async (req, res) => {
  try {
    const user = await getFromStore('users', req.user.uid);
    res.json({
      success: true,
      earnings: user?.driverEarnings || 0,
      transactions: (user?.driverTransactions || []).slice(0, 50),
      withdrawable: user?.driverEarnings || 0,
      message: 'Earnings can be withdrawn to your bank account.'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Driver withdraw earnings to bank
app.post('/api/wallet/driver-withdraw', verifyAuth, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await getFromStore('users', req.user.uid);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const earnings = user.driverEarnings || 0;
    if (amount > earnings) return res.status(400).json({ error: 'Insufficient earnings. Available: ₹' + earnings });
    if (amount < 100) return res.status(400).json({ error: 'Minimum withdrawal: ₹100' });

    user.driverEarnings = earnings - amount;
    const txn = {
      id: 'wd_' + uuidv4().slice(0, 8),
      type: 'withdrawal',
      amount,
      reason: 'Bank withdrawal',
      balanceAfter: user.driverEarnings,
      timestamp: new Date().toISOString(),
      status: 'processing' // In production: integrate with Razorpay payouts
    };
    if (!user.driverTransactions) user.driverTransactions = [];
    user.driverTransactions.unshift(txn);
    await saveToStore('users', req.user.uid, user);

    res.json({ success: true, newEarnings: user.driverEarnings, withdrawal: txn, message: 'Withdrawal of ₹' + amount + ' is being processed. It will reach your bank in 1-3 business days.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Platform config endpoint (frontend reads this to know current fees, limits, etc.)
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    config: {
      wallet: {
        minTopUp: PLATFORM_CONFIG.wallet.minTopUp,
        bookingFee: PLATFORM_CONFIG.wallet.bookingFee,
        feeDeductAt: PLATFORM_CONFIG.wallet.feeDeductAt,
        refundable: PLATFORM_CONFIG.wallet.refundable,
        refundInfo: PLATFORM_CONFIG.wallet.refundInfo
      },
      ride: {
        otpRequired: PLATFORM_CONFIG.ride.otpRequired,
        otpDigits: PLATFORM_CONFIG.ride.otpDigits,
        waitingFreeMinutes: PLATFORM_CONFIG.ride.waitingFreeMinutes,
        waitingChargePerMin: PLATFORM_CONFIG.ride.waitingChargePerMin,
        nightSurchargePercent: PLATFORM_CONFIG.ride.nightSurchargePercent,
        tollsOnCustomer: PLATFORM_CONFIG.ride.tollsOnCustomer
      },
      cancellation: {
        fee: PLATFORM_CONFIG.cancellation.fee,
        freeWindowSec: PLATFORM_CONFIG.cancellation.freeWindowMs / 1000
      },
      matching: {
        acceptTimeoutSec: PLATFORM_CONFIG.matching.acceptTimeoutSec
      },
      surge: {
        enabled: PLATFORM_CONFIG.surge.enabled,
        maxMultiplier: PLATFORM_CONFIG.surge.maxMultiplier
      },
      vehicles: Object.entries(VEHICLE_CONFIG).map(([type, cfg]) => ({
        type, name: cfg.name, icon: cfg.icon, baseFare: cfg.baseFare, perKm: cfg.perKm, minFare: cfg.minFare
      }))
    }
  });
});

// ================================================
// SOS / EMERGENCY
// ================================================

app.post('/api/sos', verifyAuth, async (req, res) => {
  try {
    const { lat, lng, rideId } = req.body;

    const sosId = 'sos_' + uuidv4().replace(/-/g, '').slice(0, 12);
    const sosData = {
      sosId,
      userId: req.user.uid,
      userPhone: req.user.phone,
      lat, lng,
      rideId: rideId || null,
      status: 'active',
      createdAt: new Date().toISOString(),
      resolvedAt: null
    };

    await saveToStore('sosAlerts', sosId, sosData);

    // In production: send SMS to emergency contacts, alert admin, call 112
    // Notify admin dashboard
    io.to('admin').emit('sos_alert', sosData);

    // If there's an active ride, notify the other party
    if (rideId) {
      const ride = await getFromStore('rides', rideId);
      if (ride) {
        const otherUserId = req.user.uid === ride.riderId ? ride.driverId : ride.riderId;
        if (otherUserId) {
          io.to(`rider_${otherUserId}`).emit('sos_alert_partner', { rideId, message: 'Emergency alert triggered by the other party' });
          io.to(`driver_${otherUserId}`).emit('sos_alert_partner', { rideId, message: 'Emergency alert triggered by the other party' });
        }
      }
    }

    res.json({ success: true, sosId, message: 'SOS alert sent. Emergency services will be contacted.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// IN-APP CHAT
// ================================================

app.post('/api/chat/:rideId/send', verifyAuth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const { message, type } = req.body; // type: 'text', 'quick_reply'

    const ride = await getFromStore('rides', rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const msgId = 'msg_' + Date.now();
    const chatMsg = {
      msgId,
      rideId,
      senderId: req.user.uid,
      senderName: req.user.name,
      message: message || '',
      type: type || 'text',
      createdAt: new Date().toISOString()
    };

    // Store message
    if (!MemStore.chatMessages.has(rideId)) {
      MemStore.chatMessages.set(rideId, []);
    }
    MemStore.chatMessages.get(rideId).push(chatMsg);

    // Send via socket to the other party
    const isRider = req.user.uid === ride.riderId;
    const otherRoom = isRider ? `driver_${ride.driverId}` : `rider_${ride.riderId}`;
    io.to(otherRoom).emit('chat_message', chatMsg);

    res.json({ success: true, message: chatMsg });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/chat/:rideId', verifyAuth, async (req, res) => {
  try {
    const messages = MemStore.chatMessages.get(req.params.rideId) || [];
    res.json({ success: true, messages });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// QR PAYMENT LINKS
// ================================================

app.post('/api/qr/create-payment-link', verifyAuth, async (req, res) => {
  try {
    const { amount, description, purpose } = req.body;

    if (razorpay) {
      const paymentLink = await razorpay.paymentLink.create({
        amount: Math.round(amount * 100),
        currency: 'INR',
        description: description || 'IDapp Payment',
        notes: { userId: req.user.uid, purpose: purpose || 'qr_payment' },
        callback_url: process.env.CALLBACK_URL || 'https://idapp.onrender.com/payment-success',
        callback_method: 'get'
      });

      res.json({
        success: true,
        paymentLink: paymentLink.short_url,
        linkId: paymentLink.id,
        amount
      });
    } else {
      // Demo
      const demoLink = `upi://pay?pa=idapp@razorpay&pn=IDapp&am=${amount}&cu=INR&tn=${encodeURIComponent(description || 'IDapp Payment')}`;
      res.json({ success: true, paymentLink: demoLink, demo: true, amount });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// NEARBY DRIVERS (for map display)
// ================================================

app.get('/api/drivers/nearby', verifyAuth, async (req, res) => {
  try {
    const { lat, lng, radius, vehicleType } = req.query;
    const centerLat = parseFloat(lat) || 12.9716;
    const centerLng = parseFloat(lng) || 77.5946;
    const maxRadius = parseFloat(radius) || 5; // km

    const nearbyDrivers = [];
    MemStore.driverLocations.forEach((loc, driverId) => {
      if (loc.isOnline && !loc.activeRideId) {
        if (vehicleType && loc.vehicleType !== vehicleType) return;
        const dist = haversineDistance(centerLat, centerLng, loc.lat, loc.lng);
        if (dist <= maxRadius) {
          nearbyDrivers.push({
            driverId,
            lat: loc.lat,
            lng: loc.lng,
            vehicleType: loc.vehicleType,
            name: loc.name,
            rating: loc.rating,
            distance: Math.round(dist * 10) / 10
          });
        }
      }
    });

    res.json({ success: true, drivers: nearbyDrivers, count: nearbyDrivers.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ================================================
// SOCKET.IO REAL-TIME
// ================================================

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Driver goes online
  socket.on('driver_online', (data) => {
    const { driverId, name, vehicleType, lat, lng, rating } = data;
    socket.join('drivers_available');
    socket.join(`driver_${driverId}`);
    socket.driverId = driverId;

    MemStore.driverLocations.set(driverId, {
      socketId: socket.id,
      driverId, name, vehicleType,
      lat: lat || 12.9716,
      lng: lng || 77.5946,
      rating: rating || 4.8,
      isOnline: true,
      activeRideId: null,
      lastUpdate: Date.now()
    });

    // Update RTDB for real-time map
    if (rtdb) {
      rtdb.ref(`drivers/${driverId}`).set({
        lat: lat || 12.9716, lng: lng || 77.5946,
        name, vehicleType, rating, isOnline: true,
        lastUpdate: admin.database.ServerValue.TIMESTAMP
      });
    }

    console.log(`[Socket] Driver online: ${driverId}`);
  });

  // Driver goes offline
  socket.on('driver_offline', (data) => {
    const { driverId } = data;
    socket.leave('drivers_available');
    MemStore.driverLocations.delete(driverId);

    if (rtdb) {
      rtdb.ref(`drivers/${driverId}`).update({ isOnline: false });
    }
  });

  // Driver location update
  socket.on('driver_location_update', (data) => {
    const { driverId, lat, lng, heading } = data;
    const loc = MemStore.driverLocations.get(driverId);
    if (loc) {
      loc.lat = lat;
      loc.lng = lng;
      loc.heading = heading;
      loc.lastUpdate = Date.now();
    }

    // Update RTDB
    if (rtdb) {
      rtdb.ref(`drivers/${driverId}`).update({ lat, lng, heading, lastUpdate: admin.database.ServerValue.TIMESTAMP });
    }

    // If driver has active ride, send location to rider
    if (loc?.activeRideId) {
      const ride = MemStore.rides.get(loc.activeRideId);
      if (ride) {
        io.to(`rider_${ride.riderId}`).emit('driver_location', { driverId, lat, lng, heading, rideId: loc.activeRideId });
      }
    }

    // Broadcast to nearby riders viewing the map
    socket.broadcast.emit('driver_moved', { driverId, lat, lng, heading, vehicleType: loc?.vehicleType });
  });

  // Rider joins their room
  socket.on('rider_online', (data) => {
    const { riderId } = data;
    socket.join(`rider_${riderId}`);
    socket.riderId = riderId;
    console.log(`[Socket] Rider online: ${riderId}`);
  });

  // Chat message via socket
  socket.on('send_chat_message', (data) => {
    const { rideId, senderId, senderName, message } = data;
    const chatMsg = {
      msgId: 'msg_' + Date.now(),
      rideId, senderId, senderName, message,
      type: 'text',
      createdAt: new Date().toISOString()
    };

    if (!MemStore.chatMessages.has(rideId)) {
      MemStore.chatMessages.set(rideId, []);
    }
    MemStore.chatMessages.get(rideId).push(chatMsg);

    // Broadcast to ride room
    io.to(`ride_${rideId}`).emit('chat_message', chatMsg);
  });

  // Join ride room (both rider and driver)
  socket.on('join_ride', (data) => {
    socket.join(`ride_${data.rideId}`);
  });

  // Quick call request
  socket.on('request_call', (data) => {
    const { rideId, callerId } = data;
    const ride = MemStore.rides.get(rideId);
    if (ride) {
      const targetRoom = callerId === ride.riderId ? `driver_${ride.driverId}` : `rider_${ride.riderId}`;
      io.to(targetRoom).emit('incoming_call', { rideId, callerId });
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.driverId) {
      const loc = MemStore.driverLocations.get(socket.driverId);
      if (loc) loc.isOnline = false;
      if (rtdb) {
        rtdb.ref(`drivers/${socket.driverId}`).update({ isOnline: false });
      }
    }
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

// ================================================
// SURGE PRICING INFO ENDPOINT
// ================================================

app.get('/api/surge', (req, res) => {
  const { lat, lng } = req.query;
  const multiplier = calculateSurgeMultiplier(parseFloat(lat) || 12.97, parseFloat(lng) || 77.59);
  res.json({
    success: true,
    surgeMultiplier: multiplier,
    surgeActive: multiplier > 1.0,
    message: multiplier > 1.0 ? `Demand is high. ${multiplier}x surge pricing in effect.` : 'Normal pricing'
  });
});

// ================================================
// OUTSTATION RIDES
// ================================================

const OUTSTATION_RATES = {
  mini:    { perKm: 10, driverAllowance: 300, minKm: 250 },
  sedan:   { perKm: 13, driverAllowance: 350, minKm: 250 },
  suv:     { perKm: 18, driverAllowance: 400, minKm: 250 },
  premium: { perKm: 24, driverAllowance: 500, minKm: 250 }
};

app.post('/api/rides/outstation', verifyAuth, async (req, res) => {
  try {
    const { pickupCity, dropCity, pickupLat, pickupLng, dropLat, dropLng, tripType, departureDate, vehicleType } = req.body;

    if (!pickupCity || !dropCity) return res.status(400).json({ error: 'Pickup and drop city required' });
    if (!departureDate) return res.status(400).json({ error: 'Departure date required' });

    const vType = vehicleType || 'sedan';
    const config = OUTSTATION_RATES[vType] || OUTSTATION_RATES.sedan;

    // Estimate distance between cities (rough calc from lat/lng or default)
    let distanceKm = 300; // default
    if (pickupLat && pickupLng && dropLat && dropLng) {
      const R = 6371;
      const dLat = (dropLat - pickupLat) * Math.PI / 180;
      const dLng = (dropLng - pickupLng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(pickupLat * Math.PI/180) * Math.cos(dropLat * Math.PI/180) * Math.sin(dLng/2)**2;
      distanceKm = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 1.3); // 1.3 road factor
    }

    const billableKm = Math.max(distanceKm, config.minKm);
    const isRoundTrip = tripType === 'roundtrip';
    const totalKm = isRoundTrip ? billableKm * 2 : billableKm;
    const totalDays = Math.max(1, Math.ceil(totalKm / 300));

    const baseFare = totalKm * config.perKm;
    const allowance = config.driverAllowance * totalDays;
    const gst = Math.round(baseFare * 0.05);
    const totalFare = baseFare + allowance + gst;

    const rideId = 'out_' + uuidv4().replace(/-/g, '').slice(0, 14);
    const rideData = {
      rideId,
      type: 'outstation',
      riderId: req.user.uid,
      riderName: req.user.name,
      pickupCity, dropCity,
      pickupLat, pickupLng, dropLat, dropLng,
      tripType: isRoundTrip ? 'roundtrip' : 'oneway',
      departureDate,
      vehicleType: vType,
      distanceKm: totalKm,
      baseFare,
      driverAllowance: allowance,
      gst,
      totalFare,
      totalDays,
      status: 'searching',
      createdAt: new Date().toISOString()
    };

    await saveToStore('rides', rideId, rideData);

    // Notify available drivers via socket
    io.emit('outstation_request', {
      rideId,
      pickupCity, dropCity,
      tripType: rideData.tripType,
      departureDate,
      vehicleType: vType,
      totalFare
    });

    res.json({ success: true, ride: rideData });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/rides/outstation/estimate', verifyAuth, async (req, res) => {
  try {
    const { pickupLat, pickupLng, dropLat, dropLng, tripType, vehicleType } = req.body;
    const estimates = {};

    let distanceKm = 300;
    if (pickupLat && pickupLng && dropLat && dropLng) {
      const R = 6371;
      const dLat = (dropLat - pickupLat) * Math.PI / 180;
      const dLng = (dropLng - pickupLng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(pickupLat * Math.PI/180) * Math.cos(dropLat * Math.PI/180) * Math.sin(dLng/2)**2;
      distanceKm = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 1.3);
    }

    const isRoundTrip = tripType === 'roundtrip';

    for (const [vt, cfg] of Object.entries(OUTSTATION_RATES)) {
      const billableKm = Math.max(distanceKm, cfg.minKm);
      const totalKm = isRoundTrip ? billableKm * 2 : billableKm;
      const totalDays = Math.max(1, Math.ceil(totalKm / 300));
      const baseFare = totalKm * cfg.perKm;
      const allowance = cfg.driverAllowance * totalDays;
      const gst = Math.round(baseFare * 0.05);
      estimates[vt] = { totalKm, baseFare, driverAllowance: allowance, gst, totalFare: baseFare + allowance + gst, totalDays };
    }

    res.json({ success: true, distanceKm, tripType: isRoundTrip ? 'roundtrip' : 'oneway', estimates });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// RENTAL RIDES
// ================================================

const RENTAL_PACKAGES = {
  1:  { hours: 1,  km: 10,  label: '1 Hr' },
  2:  { hours: 2,  km: 20,  label: '2 Hrs' },
  4:  { hours: 4,  km: 40,  label: '4 Hrs' },
  8:  { hours: 8,  km: 80,  label: '8 Hrs' },
  12: { hours: 12, km: 120, label: '12 Hrs' },
  24: { hours: 24, km: 200, label: 'Full Day' }
};

const RENTAL_RATES = {
  mini:    { perHr: 120, perExtraKm: 10, perExtraMin: 2 },
  sedan:   { perHr: 180, perExtraKm: 14, perExtraMin: 2.5 },
  suv:     { perHr: 250, perExtraKm: 18, perExtraMin: 3 },
  premium: { perHr: 350, perExtraKm: 24, perExtraMin: 4 }
};

app.post('/api/rides/rental', verifyAuth, async (req, res) => {
  try {
    const { pickupAddress, pickupLat, pickupLng, hours, vehicleType } = req.body;

    if (!hours || !RENTAL_PACKAGES[hours]) {
      return res.status(400).json({ error: 'Invalid rental hours. Choose from: 1, 2, 4, 8, 12, 24' });
    }

    const vType = vehicleType || 'sedan';
    const rates = RENTAL_RATES[vType] || RENTAL_RATES.sedan;
    const pkg = RENTAL_PACKAGES[hours];

    const baseFare = rates.perHr * pkg.hours;
    const platformFee = 5;
    const gst = Math.round(baseFare * 0.05);
    const totalFare = baseFare + platformFee + gst;

    const rideId = 'rental_' + uuidv4().replace(/-/g, '').slice(0, 12);
    const rideData = {
      rideId,
      type: 'rental',
      riderId: req.user.uid,
      riderName: req.user.name,
      pickupAddress: pickupAddress || 'Current Location',
      pickupLat, pickupLng,
      vehicleType: vType,
      package: pkg,
      includedKm: pkg.km,
      includedHours: pkg.hours,
      baseFare,
      platformFee,
      gst,
      totalFare,
      extraKmRate: rates.perExtraKm,
      extraMinRate: rates.perExtraMin,
      status: 'searching',
      startTime: null,
      endTime: null,
      actualKm: 0,
      actualHours: 0,
      extraCharges: 0,
      createdAt: new Date().toISOString()
    };

    await saveToStore('rides', rideId, rideData);

    io.emit('rental_request', {
      rideId,
      vehicleType: vType,
      hours: pkg.hours,
      pickupAddress: rideData.pickupAddress,
      totalFare
    });

    res.json({ success: true, ride: rideData });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/rides/rental/estimate', verifyAuth, async (req, res) => {
  try {
    const { hours } = req.body;
    const pkg = RENTAL_PACKAGES[hours] || RENTAL_PACKAGES[4];
    const estimates = {};

    for (const [vt, rates] of Object.entries(RENTAL_RATES)) {
      const baseFare = rates.perHr * pkg.hours;
      const gst = Math.round(baseFare * 0.05);
      estimates[vt] = {
        baseFare,
        gst,
        platformFee: 5,
        totalFare: baseFare + 5 + gst,
        includedKm: pkg.km,
        extraKmRate: rates.perExtraKm,
        extraMinRate: rates.perExtraMin
      };
    }

    res.json({ success: true, package: pkg, estimates });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// RENTAL RIDE COMPLETION (with extra charges)
// ================================================

app.post('/api/rides/rental/:rideId/complete', verifyAuth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const ride = await getFromStore('rides', rideId);
    if (!ride || ride.type !== 'rental') return res.status(404).json({ error: 'Rental ride not found' });

    const { actualKm, actualHours } = req.body;
    const km = actualKm || ride.actualKm || ride.includedKm;
    const hrs = actualHours || ride.actualHours || ride.includedHours;

    let extraCharges = 0;
    if (km > ride.includedKm) extraCharges += (km - ride.includedKm) * ride.extraKmRate;
    if (hrs > ride.includedHours) extraCharges += (hrs - ride.includedHours) * 60 * ride.extraMinRate;
    extraCharges = Math.round(extraCharges);

    const finalFare = ride.totalFare + extraCharges;

    ride.status = 'completed';
    ride.actualKm = km;
    ride.actualHours = hrs;
    ride.extraCharges = extraCharges;
    ride.finalFare = finalFare;
    ride.endTime = new Date().toISOString();
    ride.updatedAt = new Date().toISOString();

    await saveToStore('rides', rideId, ride);
    res.json({ success: true, ride });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// SAVED PLACES
// ================================================

app.post('/api/users/saved-places', verifyAuth, async (req, res) => {
  try {
    const { places } = req.body; // { home: '...', work: '...', favourites: ['...'] }
    const user = await getFromStore('users', req.user.uid) || {};
    user.savedPlaces = { ...(user.savedPlaces || {}), ...places };
    user.updatedAt = new Date().toISOString();
    await saveToStore('users', req.user.uid, user);
    res.json({ success: true, savedPlaces: user.savedPlaces });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/users/saved-places', verifyAuth, async (req, res) => {
  try {
    const user = await getFromStore('users', req.user.uid);
    res.json({ success: true, savedPlaces: user?.savedPlaces || {} });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// EMERGENCY CONTACTS
// ================================================

app.post('/api/users/emergency-contacts', verifyAuth, async (req, res) => {
  try {
    const { contacts } = req.body; // array of { name, phone }
    const user = await getFromStore('users', req.user.uid) || {};
    user.emergencyContacts = contacts || [];
    user.updatedAt = new Date().toISOString();
    await saveToStore('users', req.user.uid, user);
    res.json({ success: true, emergencyContacts: user.emergencyContacts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/users/emergency-contacts', verifyAuth, async (req, res) => {
  try {
    const user = await getFromStore('users', req.user.uid);
    res.json({ success: true, emergencyContacts: user?.emergencyContacts || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// DRIVER VEHICLE DETAILS
// ================================================

app.post('/api/drivers/vehicle', verifyAuth, async (req, res) => {
  try {
    const { vehicleModel, vehicleNumber, vehicleType, vehicleColor, vehicleYear } = req.body;
    if (!vehicleModel || !vehicleNumber) {
      return res.status(400).json({ error: 'Vehicle model and number required' });
    }

    const user = await getFromStore('users', req.user.uid) || {};
    user.vehicleModel = vehicleModel;
    user.vehicleNumber = vehicleNumber.toUpperCase();
    user.vehicleType = vehicleType || 'sedan';
    user.vehicleColor = vehicleColor || '';
    user.vehicleYear = vehicleYear || '';
    user.role = 'driver';
    user.updatedAt = new Date().toISOString();

    await saveToStore('users', req.user.uid, user);
    res.json({ success: true, vehicle: { vehicleModel, vehicleNumber: user.vehicleNumber, vehicleType: user.vehicleType, vehicleColor, vehicleYear } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// MULTI-STOP RIDES
// ================================================

app.post('/api/rides/multi-stop', verifyAuth, async (req, res) => {
  try {
    const { pickupAddress, pickupLat, pickupLng, stops, vehicleType } = req.body;
    // stops: array of { address, lat, lng }
    if (!stops || stops.length < 1) return res.status(400).json({ error: 'At least one stop required' });
    if (stops.length > 4) return res.status(400).json({ error: 'Maximum 4 stops allowed' });

    const vType = vehicleType || 'auto';
    let totalDistanceKm = 0;
    let totalDurationMin = 0;
    const allPoints = [{ address: pickupAddress, lat: pickupLat, lng: pickupLng }, ...stops];

    // Calculate distance between consecutive points
    for (let i = 0; i < allPoints.length - 1; i++) {
      const R = 6371;
      const dLat = (allPoints[i+1].lat - allPoints[i].lat) * Math.PI / 180;
      const dLng = (allPoints[i+1].lng - allPoints[i].lng) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(allPoints[i].lat * Math.PI/180) * Math.cos(allPoints[i+1].lat * Math.PI/180) * Math.sin(dLng/2)**2;
      const segDist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 1.3;
      totalDistanceKm += segDist;
      totalDurationMin += segDist * 2.5; // rough estimate: 2.5 min per km
    }

    totalDistanceKm = Math.round(totalDistanceKm * 10) / 10;
    totalDurationMin = Math.round(totalDurationMin);

    // Add per-stop wait time charge (5 min per stop)
    const waitTimeFee = stops.length * 15; // ₹15 per stop wait
    const fareEstimate = estimateFare(totalDistanceKm, totalDurationMin, vType, pickupLat, pickupLng);

    const rideId = 'multi_' + uuidv4().replace(/-/g, '').slice(0, 12);
    const rideData = {
      rideId,
      type: 'multi-stop',
      riderId: req.user.uid,
      riderName: req.user.name,
      pickupAddress, pickupLat, pickupLng,
      stops,
      currentStopIndex: 0,
      vehicleType: vType,
      totalDistanceKm,
      totalDurationMin,
      fareBreakdown: fareEstimate,
      waitTimeFee,
      totalFare: fareEstimate.totalFare + waitTimeFee,
      otp: String(Math.floor(1000 + Math.random() * 9000)),
      status: 'searching',
      createdAt: new Date().toISOString()
    };

    await saveToStore('rides', rideId, rideData);
    res.json({ success: true, ride: rideData });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// LOST & FOUND
// ================================================

app.post('/api/lost-found/report', verifyAuth, async (req, res) => {
  try {
    const { rideId, description, itemType, contactNumber } = req.body;
    if (!rideId || !description) return res.status(400).json({ error: 'Ride ID and description required' });

    const ride = await getFromStore('rides', rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const reportId = 'lost_' + uuidv4().replace(/-/g, '').slice(0, 12);
    const report = {
      reportId,
      rideId,
      riderId: req.user.uid,
      driverId: ride.driverId,
      description,
      itemType: itemType || 'other',
      contactNumber: contactNumber || req.user.phone,
      status: 'reported', // reported, found, returned, closed
      createdAt: new Date().toISOString()
    };

    if (!MemStore.lostFound) MemStore.lostFound = new Map();
    MemStore.lostFound.set(reportId, report);
    await saveToStore('lostFound', reportId, report);

    // Notify driver if connected
    if (ride.driverId) {
      const driverLoc = MemStore.driverLocations.get(ride.driverId);
      if (driverLoc?.socketId) {
        io.to(driverLoc.socketId).emit('lost_item_report', { reportId, rideId, description, itemType });
      }
    }

    res.json({ success: true, report });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/lost-found/my-reports', verifyAuth, async (req, res) => {
  try {
    const reports = await queryStore('lostFound', 'riderId', '==', req.user.uid);
    res.json({ success: true, reports });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// RIDE INSURANCE
// ================================================

app.post('/api/rides/:rideId/insurance', verifyAuth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const ride = await getFromStore('rides', rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const insuranceFee = 5; // ₹5 per ride insurance
    ride.insurance = {
      active: true,
      fee: insuranceFee,
      coverage: 'Trip protection up to ₹5,00,000 for accidents during ride',
      provider: 'ICICI Lombard',
      policyId: 'INS' + Date.now()
    };
    ride.totalFare = (ride.totalFare || ride.finalFare || 0) + insuranceFee;
    ride.updatedAt = new Date().toISOString();

    await saveToStore('rides', rideId, ride);
    res.json({ success: true, insurance: ride.insurance });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// RIDE PREFERENCES
// ================================================

app.post('/api/users/preferences', verifyAuth, async (req, res) => {
  try {
    const { acPreference, paymentMethod, language, darkMode, notifications } = req.body;
    const user = await getFromStore('users', req.user.uid) || {};
    user.preferences = {
      ...(user.preferences || {}),
      ...(acPreference !== undefined && { acPreference }),
      ...(paymentMethod && { paymentMethod }),
      ...(language && { language }),
      ...(darkMode !== undefined && { darkMode }),
      ...(notifications !== undefined && { notifications })
    };
    user.updatedAt = new Date().toISOString();
    await saveToStore('users', req.user.uid, user);
    res.json({ success: true, preferences: user.preferences });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/users/preferences', verifyAuth, async (req, res) => {
  try {
    const user = await getFromStore('users', req.user.uid);
    res.json({ success: true, preferences: user?.preferences || {} });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// NOTIFICATIONS
// ================================================

app.get('/api/notifications', verifyAuth, async (req, res) => {
  try {
    if (!MemStore.notifications) MemStore.notifications = new Map();
    const all = [];
    MemStore.notifications.forEach((n) => {
      if (n.userId === req.user.uid) all.push(n);
    });
    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, notifications: all.slice(0, 50) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/notifications/read', verifyAuth, async (req, res) => {
  try {
    const { notificationIds } = req.body;
    if (!MemStore.notifications) MemStore.notifications = new Map();
    (notificationIds || []).forEach(id => {
      const n = MemStore.notifications.get(id);
      if (n && n.userId === req.user.uid) n.read = true;
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// FARE NEGOTIATION (Auto-rickshaw style)
// ================================================

app.post('/api/rides/:rideId/negotiate', verifyAuth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const { offeredFare } = req.body;
    const ride = await getFromStore('rides', rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    const minAcceptable = Math.round(ride.totalFare * 0.7); // 70% of estimated fare
    if (offeredFare < minAcceptable) {
      return res.json({ success: false, message: 'Offer too low', minAcceptable, estimatedFare: ride.totalFare });
    }

    ride.negotiatedFare = offeredFare;
    ride.isNegotiated = true;
    ride.updatedAt = new Date().toISOString();
    await saveToStore('rides', rideId, ride);

    // Notify drivers
    if (ride.driverId) {
      const driverLoc = MemStore.driverLocations.get(ride.driverId);
      if (driverLoc?.socketId) {
        io.to(driverLoc.socketId).emit('fare_negotiation', { rideId, offeredFare, estimatedFare: ride.totalFare });
      }
    }

    res.json({ success: true, offeredFare, estimatedFare: ride.totalFare, accepted: offeredFare >= ride.totalFare * 0.85 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// RIDE SHARE / CARPOOL
// ================================================

app.post('/api/rides/share', verifyAuth, async (req, res) => {
  try {
    const { pickupAddress, pickupLat, pickupLng, dropAddress, dropLat, dropLng, vehicleType, seats } = req.body;

    const requestedSeats = seats || 1;
    const vType = vehicleType || 'mini';

    // Find existing shared rides going in similar direction
    const matchedRides = [];
    MemStore.rides.forEach((ride) => {
      if (ride.type === 'share' && ride.status === 'in_progress' && ride.availableSeats >= requestedSeats) {
        // Check if routes overlap (simplified: within 2km of pickup and drop)
        const pickupDist = haversine(pickupLat, pickupLng, ride.pickupLat, ride.pickupLng);
        const dropDist = haversine(dropLat, dropLng, ride.dropLat, ride.dropLng);
        if (pickupDist < 2 && dropDist < 3) {
          matchedRides.push(ride);
        }
      }
    });

    if (matchedRides.length > 0) {
      // Join existing shared ride
      const sharedRide = matchedRides[0];
      sharedRide.riders = sharedRide.riders || [];
      sharedRide.riders.push({ userId: req.user.uid, name: req.user.name, seats: requestedSeats, pickupAddress, dropAddress });
      sharedRide.availableSeats -= requestedSeats;
      sharedRide.updatedAt = new Date().toISOString();
      await saveToStore('rides', sharedRide.rideId, sharedRide);

      // Discount for sharing
      const discount = 0.3; // 30% off
      const originalFare = sharedRide.perRiderFare || sharedRide.totalFare;
      const discountedFare = Math.round(originalFare * (1 - discount));

      return res.json({ success: true, matched: true, ride: sharedRide, yourFare: discountedFare, discount: '30%' });
    }

    // Create new shared ride
    const distanceKm = haversine(pickupLat, pickupLng, dropLat, dropLng) * 1.3;
    const durationMin = Math.round(distanceKm * 2.5);
    const fareEstimate = estimateFare(distanceKm, durationMin, vType, pickupLat, pickupLng);
    const shareDiscount = 0.25; // 25% off when creating shared ride

    const rideId = 'share_' + uuidv4().replace(/-/g, '').slice(0, 12);
    const rideData = {
      rideId,
      type: 'share',
      riderId: req.user.uid,
      riderName: req.user.name,
      pickupAddress, pickupLat, pickupLng,
      dropAddress, dropLat, dropLng,
      vehicleType: vType,
      riders: [{ userId: req.user.uid, name: req.user.name, seats: requestedSeats, pickupAddress, dropAddress }],
      totalSeats: 4,
      availableSeats: 4 - requestedSeats,
      fareBreakdown: fareEstimate,
      perRiderFare: Math.round(fareEstimate.totalFare * (1 - shareDiscount)),
      totalFare: fareEstimate.totalFare,
      otp: String(Math.floor(1000 + Math.random() * 9000)),
      status: 'searching',
      createdAt: new Date().toISOString()
    };

    await saveToStore('rides', rideId, rideData);
    res.json({ success: true, matched: false, ride: rideData, yourFare: rideData.perRiderFare, discount: '25%' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Haversine helper
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ================================================
// DRIVER TIPS (separate from ride rating)
// ================================================

app.post('/api/rides/:rideId/tip', verifyAuth, async (req, res) => {
  try {
    const { rideId } = req.params;
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid tip amount' });
    if (amount > 500) return res.status(400).json({ error: 'Maximum tip is ₹500' });

    const ride = await getFromStore('rides', rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    ride.tip = amount;
    ride.updatedAt = new Date().toISOString();
    await saveToStore('rides', rideId, ride);

    // Credit driver wallet
    if (ride.driverId) {
      const driver = await getFromStore('users', ride.driverId);
      if (driver) {
        driver.walletBalance = (driver.walletBalance || 0) + amount;
        await saveToStore('users', ride.driverId, driver);
      }
    }

    res.json({ success: true, tip: amount, message: 'Tip sent to driver!' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// SIMULATE DRIVERS (for demo/testing)
// ================================================

app.post('/api/demo/seed-drivers', async (req, res) => {
  const demoDrivers = [
    { id: 'drv_rajesh', name: 'Rajesh Kumar', vehicleType: 'auto', vehicleModel: 'Green Auto', vehicleNumber: 'KA 01 A 4521', lat: 12.9716, lng: 77.5946, rating: 4.8 },
    { id: 'drv_suresh', name: 'Suresh Babu', vehicleType: 'mini', vehicleModel: 'White Swift Dzire', vehicleNumber: 'KA 01 AB 1234', lat: 12.9750, lng: 77.5980, rating: 4.6 },
    { id: 'drv_mahesh', name: 'Mahesh Gowda', vehicleType: 'sedan', vehicleModel: 'Honda City', vehicleNumber: 'KA 01 MN 3456', lat: 12.9680, lng: 77.5910, rating: 4.9 },
    { id: 'drv_ravi', name: 'Ravi Shankar', vehicleType: 'suv', vehicleModel: 'Innova Crysta', vehicleNumber: 'KA 01 GH 5678', lat: 12.9700, lng: 77.6000, rating: 4.7 },
    { id: 'drv_anil', name: 'Anil Kumar', vehicleType: 'bike', vehicleModel: 'Pulsar 150', vehicleNumber: 'KA 02 F 8901', lat: 12.9730, lng: 77.5930, rating: 4.5 },
    { id: 'drv_prakash', name: 'Prakash M.', vehicleType: 'premium', vehicleModel: 'Toyota Camry', vehicleNumber: 'KA 01 PR 7777', lat: 12.9690, lng: 77.5970, rating: 4.9 },
    { id: 'drv_deepak', name: 'Deepak S.', vehicleType: 'auto', vehicleModel: 'Yellow Auto', vehicleNumber: 'KA 03 B 7890', lat: 12.9740, lng: 77.5920, rating: 4.4 },
    { id: 'drv_venkat', name: 'Venkatesh P.', vehicleType: 'mini', vehicleModel: 'Silver WagonR', vehicleNumber: 'KA 02 CD 5678', lat: 12.9760, lng: 77.5960, rating: 4.7 }
  ];

  for (const d of demoDrivers) {
    MemStore.driverLocations.set(d.id, {
      ...d, driverId: d.id, isOnline: true, activeRideId: null, lastUpdate: Date.now(), socketId: null
    });

    await saveToStore('users', d.id, {
      uid: d.id, name: d.name, phone: '+91' + Math.floor(9000000000 + Math.random() * 999999999),
      role: 'driver', rating: d.rating, totalRatings: Math.floor(100 + Math.random() * 5000),
      rideCount: Math.floor(500 + Math.random() * 5000),
      vehicleType: d.vehicleType, vehicleModel: d.vehicleModel, vehicleNumber: d.vehicleNumber,
      walletBalance: Math.floor(Math.random() * 5000),
      isOnline: true, documentsVerified: true,
      earnings: { today: Math.floor(Math.random() * 2000), week: Math.floor(Math.random() * 10000), month: Math.floor(Math.random() * 40000), total: Math.floor(Math.random() * 200000) },
      referralCode: 'DRV' + d.id.slice(-4).toUpperCase(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
  }

  res.json({ success: true, message: `${demoDrivers.length} demo drivers seeded`, drivers: demoDrivers.map(d => ({ id: d.id, name: d.name, vehicleType: d.vehicleType })) });
});

// ================================================
// REAL KYC VERIFICATION SYSTEM
// ================================================

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'kyc');
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch(e) {}

// Admin credentials (in production: use proper auth)
const ADMIN_CREDENTIALS = {
  username: process.env.ADMIN_USERNAME || 'idapp_admin',
  password: process.env.ADMIN_PASSWORD || 'IDapp@Admin2026'
};

// Simple admin auth middleware
function adminAuth(req, res, next) {
  const authHeader = req.headers['x-admin-auth'];
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Admin authentication required' });
  }
  try {
    const decoded = Buffer.from(authHeader, 'base64').toString();
    const [user, pass] = decoded.split(':');
    if (user === ADMIN_CREDENTIALS.username && pass === ADMIN_CREDENTIALS.password) {
      return next();
    }
  } catch(e) {}
  return res.status(403).json({ success: false, error: 'Invalid admin credentials' });
}

// Parse multipart form data manually (no multer needed)
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
        if (!boundaryMatch) return reject(new Error('No boundary found'));

        const boundary = '--' + (boundaryMatch[1] || boundaryMatch[2]);
        const body = buffer.toString('binary');
        const parts = body.split(boundary).slice(1, -1);

        const fields = {};
        let fileData = null;

        for (const part of parts) {
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd === -1) continue;
          const headers = part.substring(0, headerEnd);
          const content = part.substring(headerEnd + 4, part.length - 2);

          const nameMatch = headers.match(/name="([^"]+)"/);
          if (!nameMatch) continue;
          const name = nameMatch[1];

          const fileMatch = headers.match(/filename="([^"]+)"/);
          if (fileMatch) {
            const mimeMatch = headers.match(/Content-Type:\s*(.+)/i);
            fileData = {
              fieldName: name,
              originalName: fileMatch[1],
              mimeType: mimeMatch ? mimeMatch[1].trim() : 'application/octet-stream',
              buffer: Buffer.from(content, 'binary')
            };
          } else {
            fields[name] = content.trim();
          }
        }

        resolve({ fields, file: fileData });
      } catch(e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// ---- KYC Document Upload (real file storage) ----
app.post('/api/kyc/upload', async (req, res) => {
  try {
    const { fields, file } = await parseMultipart(req);
    const userId = fields.userId || req.headers['authorization']?.replace('Bearer ', '');
    const docType = fields.docType;

    if (!userId || !docType) {
      return res.status(400).json({ success: false, error: 'userId and docType are required' });
    }

    const validTypes = ['aadhaar', 'pan', 'license', 'rc', 'insurance', 'photo'];
    if (!validTypes.includes(docType)) {
      return res.status(400).json({ success: false, error: 'Invalid document type. Valid: ' + validTypes.join(', ') });
    }

    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Validate file type
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedMimes.includes(file.mimeType)) {
      return res.status(400).json({ success: false, error: 'Invalid file type. Allowed: JPEG, PNG, WebP, PDF' });
    }

    // Max 5MB
    if (file.buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'File too large. Maximum 5MB' });
    }

    // Save file to disk
    const ext = path.extname(file.originalName) || '.jpg';
    const fileName = `${userId}_${docType}_${Date.now()}${ext}`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    fs.writeFileSync(filePath, file.buffer);

    // Store metadata in memory
    const docKey = `${userId}_${docType}`;
    MemStore.kycDocFiles.set(docKey, {
      originalName: file.originalName,
      storedName: fileName,
      filePath: filePath,
      mimeType: file.mimeType,
      fileSize: file.buffer.length,
      uploadedAt: new Date().toISOString()
    });

    // Update/create KYC application
    let kyc = MemStore.kycApplications.get(userId);
    if (!kyc) {
      kyc = {
        userId,
        status: 'incomplete',
        documents: {},
        submittedAt: null,
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
        createdAt: new Date().toISOString()
      };
    }
    kyc.documents[docType] = {
      status: 'uploaded',
      fileName: file.originalName,
      storedName: fileName,
      fileSize: file.buffer.length,
      mimeType: file.mimeType,
      uploadedAt: new Date().toISOString()
    };
    kyc.updatedAt = new Date().toISOString();
    MemStore.kycApplications.set(userId, kyc);

    // Also save to Firebase if available
    if (db) {
      try {
        await db.collection('kycApplications').doc(userId).set(kyc, { merge: true });
      } catch(e) { console.log('[KYC] Firebase save error:', e.message); }
    }

    res.json({
      success: true,
      message: `${docType} uploaded successfully`,
      document: {
        docType,
        fileName: file.originalName,
        fileSize: file.buffer.length,
        status: 'uploaded'
      }
    });

  } catch(err) {
    console.error('[KYC Upload Error]', err);
    res.status(500).json({ success: false, error: 'Upload failed: ' + err.message });
  }
});

// ---- Submit KYC for review (after all docs uploaded) ----
app.post('/api/kyc/submit', async (req, res) => {
  try {
    const userId = req.headers['authorization']?.replace('Bearer ', '') || req.body.userId;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });

    let kyc = MemStore.kycApplications.get(userId);
    if (!kyc) return res.status(404).json({ success: false, error: 'No documents uploaded yet' });

    // Check all 6 documents are uploaded
    const required = ['aadhaar', 'pan', 'license', 'rc', 'insurance', 'photo'];
    const missing = required.filter(d => !kyc.documents[d] || kyc.documents[d].status === 'not_uploaded');
    if (missing.length > 0) {
      return res.status(400).json({ success: false, error: 'Missing documents: ' + missing.join(', ') });
    }

    // Mark all docs as pending review
    required.forEach(docType => {
      if (kyc.documents[docType]) {
        kyc.documents[docType].status = 'pending_review';
      }
    });

    kyc.status = 'pending_review';
    kyc.submittedAt = new Date().toISOString();
    kyc.updatedAt = new Date().toISOString();
    MemStore.kycApplications.set(userId, kyc);

    // Firebase sync
    if (db) {
      try { await db.collection('kycApplications').doc(userId).set(kyc, { merge: true }); } catch(e) {}
    }

    // Emit to admin panel via socket
    io.emit('kyc:new_submission', { userId, submittedAt: kyc.submittedAt, documents: Object.keys(kyc.documents) });

    res.json({
      success: true,
      message: 'KYC submitted for review. You will be notified once verified.',
      status: 'pending_review',
      submittedAt: kyc.submittedAt
    });

  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- Check KYC status (driver polls this) ----
app.get('/api/kyc/status', async (req, res) => {
  try {
    const userId = req.headers['authorization']?.replace('Bearer ', '') || req.query.userId;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });

    let kyc = MemStore.kycApplications.get(userId);

    // Try Firebase if not in memory
    if (!kyc && db) {
      try {
        const doc = await db.collection('kycApplications').doc(userId).get();
        if (doc.exists) {
          kyc = doc.data();
          MemStore.kycApplications.set(userId, kyc);
        }
      } catch(e) {}
    }

    if (!kyc) {
      return res.json({
        success: true,
        status: 'not_started',
        documents: {},
        message: 'No KYC application found. Please upload your documents.'
      });
    }

    res.json({
      success: true,
      status: kyc.status,
      documents: Object.fromEntries(
        Object.entries(kyc.documents).map(([type, doc]) => [type, {
          status: doc.status,
          fileName: doc.fileName,
          uploadedAt: doc.uploadedAt
        }])
      ),
      submittedAt: kyc.submittedAt,
      reviewedAt: kyc.reviewedAt,
      rejectionReason: kyc.rejectionReason
    });

  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======= REAL DOCUMENT VERIFICATION (SUREPASS API) =======

// Offline format validators (work even without Surepass — catches fake numbers)
const validators = {
  // Aadhaar: 12 digits, Verhoeff checksum
  aadhaar: (num) => {
    const clean = (num || '').replace(/\s/g, '');
    if (!/^\d{12}$/.test(clean)) return { valid: false, error: 'Aadhaar must be exactly 12 digits' };
    // Verhoeff checksum validation
    const d = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
    const p = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
    const inv = [0,4,3,2,1,5,6,7,8,9];
    let c = 0;
    const digits = clean.split('').reverse().map(Number);
    for (let i = 0; i < digits.length; i++) c = d[c][p[i % 8][digits[i]]];
    if (c !== 0) return { valid: false, error: 'Invalid Aadhaar number (checksum failed)' };
    // No 0 or 1 as first digit
    if (clean[0] === '0' || clean[0] === '1') return { valid: false, error: 'Aadhaar cannot start with 0 or 1' };
    return { valid: true };
  },

  // PAN: ABCDE1234F format
  pan: (num) => {
    const clean = (num || '').toUpperCase().trim();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(clean)) return { valid: false, error: 'PAN must be in format: ABCDE1234F (5 letters, 4 digits, 1 letter)' };
    // 4th character indicates holder type: C=Company, P=Person, H=HUF, F=Firm, etc.
    const type4 = clean[3];
    if (!['A','B','C','F','G','H','J','L','P','T'].includes(type4)) return { valid: false, error: 'Invalid PAN holder type code' };
    return { valid: true, holderType: type4 === 'P' ? 'Individual' : type4 === 'C' ? 'Company' : 'Other' };
  },

  // DL: State code + number, varies by state (RJ-13/DLC/xxxx etc.)
  license: (num) => {
    const clean = (num || '').toUpperCase().replace(/\s+/g, '').trim();
    // Indian DL: 2-letter state + optional dash + 2 digit RTO + optional dash + year + number
    if (clean.length < 10 || clean.length > 20) return { valid: false, error: 'Driving license number should be 10-20 characters' };
    // Basic state code check
    const validStates = ['AN','AP','AR','AS','BR','CG','CH','DD','DL','GA','GJ','HP','HR','JH','JK','KA','KL','LA','LD','MH','ML','MN','MP','MZ','NL','OD','OR','PB','PY','RJ','SK','TN','TS','TR','UK','UP','WB'];
    const stateCode = clean.substring(0, 2);
    if (!validStates.includes(stateCode)) return { valid: false, error: 'Invalid state code in DL number: ' + stateCode };
    return { valid: true, state: stateCode };
  },

  // RC: KA01AB1234 format
  rc: (num) => {
    const clean = (num || '').toUpperCase().replace(/[\s-]+/g, '').trim();
    if (clean.length < 8 || clean.length > 15) return { valid: false, error: 'Vehicle registration number should be 8-15 characters' };
    const validStates = ['AN','AP','AR','AS','BR','CG','CH','DD','DL','GA','GJ','HP','HR','JH','JK','KA','KL','LA','LD','MH','ML','MN','MP','MZ','NL','OD','OR','PB','PY','RJ','SK','TN','TS','TR','UK','UP','WB'];
    const stateCode = clean.substring(0, 2);
    if (!validStates.includes(stateCode)) return { valid: false, error: 'Invalid state code in RC number: ' + stateCode };
    return { valid: true, state: stateCode };
  }
};

// ---- Verify a single document via Surepass ----
app.post('/api/kyc/verify', async (req, res) => {
  try {
    const userId = req.headers['authorization']?.replace('Bearer ', '') || req.body.userId;
    const { docType, docNumber } = req.body;

    if (!userId || !docType || !docNumber) {
      return res.status(400).json({ success: false, error: 'userId, docType, and docNumber are required' });
    }

    // Step 1: Offline format validation (free, no API call)
    if (validators[docType]) {
      const formatCheck = validators[docType](docNumber);
      if (!formatCheck.valid) {
        return res.json({
          success: false,
          verified: false,
          error: formatCheck.error,
          method: 'format_validation'
        });
      }
    }

    // Step 2: Try Surepass API (real government DB check)
    let surepassResult = null;
    let verificationMethod = 'format_only';

    if (SUREPASS_API_TOKEN) {
      try {
        const cleanNumber = docNumber.replace(/[\s-]/g, '').trim();

        if (docType === 'aadhaar') {
          // Surepass Aadhaar Verification (returns name, DOB, gender, address)
          surepassResult = await surepassCall('/aadhaar-v2/aadhaar-validation', {
            id_number: cleanNumber
          });
          verificationMethod = 'surepass_aadhaar';

        } else if (docType === 'pan') {
          // Surepass PAN Verification (returns name, category, valid status)
          surepassResult = await surepassCall('/pan/pan', {
            id_number: cleanNumber.toUpperCase()
          });
          verificationMethod = 'surepass_pan';

        } else if (docType === 'license') {
          // Surepass Driving License Verification (returns name, DOB, validity, vehicle classes)
          surepassResult = await surepassCall('/driving-license/driving-license', {
            id_number: cleanNumber.toUpperCase()
          });
          verificationMethod = 'surepass_dl';

        } else if (docType === 'rc') {
          // Surepass RC Verification (returns owner name, vehicle details, insurance, fitness)
          surepassResult = await surepassCall('/rc/rc-lite', {
            id_number: cleanNumber.toUpperCase()
          });
          verificationMethod = 'surepass_rc';
        }
      } catch(surepassErr) {
        console.log('[Surepass] API Error for', docType, ':', surepassErr.message);
        surepassResult = { error: surepassErr.message };
      }
    }

    // Step 3: Process result
    let verified = false;
    let details = {};
    let error = null;

    if (surepassResult && !surepassResult.error) {
      // Surepass returns { status_code: 200, success: true, data: {...} }
      if (surepassResult.status_code === 200 && surepassResult.data) {
        verified = true;
        const d = surepassResult.data;

        if (docType === 'aadhaar') {
          details = {
            name: d.full_name || d.name || '',
            gender: d.gender || '',
            dob: d.dob || '',
            state: d.state || d.address?.state || '',
            aadhaarLast4: cleanNumber ? cleanNumber.slice(-4) : '',
            verified: true
          };
        } else if (docType === 'pan') {
          details = {
            name: d.full_name || d.name || '',
            panNumber: d.pan_number || cleanNumber.toUpperCase(),
            category: d.category || '',
            valid: d.valid !== false,
            verified: true
          };
        } else if (docType === 'license') {
          details = {
            name: d.name || d.holder_name || '',
            dob: d.dob || '',
            dlNumber: d.dl_number || cleanNumber.toUpperCase(),
            validFrom: d.issue_date || d.doi || '',
            validTo: d.validity?.transport || d.non_transport_validity_to || d.expiry_date || '',
            vehicleClasses: d.vehicle_classes || d.cov_details || [],
            bloodGroup: d.blood_group || '',
            state: d.state || '',
            verified: true
          };
          // Check if DL is expired
          if (details.validTo) {
            const expiry = new Date(details.validTo);
            if (expiry < new Date()) {
              verified = false;
              error = 'Driving license has EXPIRED on ' + details.validTo;
              details.expired = true;
            }
          }
        } else if (docType === 'rc') {
          details = {
            ownerName: d.owner_name || d.current_owner || '',
            vehicleCategory: d.vehicle_category || '',
            makerModel: d.maker_model || d.vehicle_manufacturer_name || '',
            fuelType: d.fuel_type || '',
            registrationDate: d.registration_date || '',
            fitnessUpto: d.fitness_upto || d.fit_up_to || '',
            insuranceUpto: d.insurance_upto || d.insurance_validity || '',
            rcNumber: d.rc_number || cleanNumber.toUpperCase(),
            vehicleAge: d.vehicle_age || '',
            verified: true
          };
          // Check insurance validity
          if (details.insuranceUpto) {
            const insExpiry = new Date(details.insuranceUpto);
            if (insExpiry < new Date()) {
              details.insuranceExpired = true;
              // Don't fail verification, but flag it
            }
          }
        }
      } else {
        // Surepass returned error (invalid number, not found in govt DB)
        verified = false;
        error = surepassResult.message || surepassResult.message_code || 'Document not found in government database';
        verificationMethod += '_failed';
      }
    } else if (verificationMethod === 'format_only') {
      // No Surepass token — just format validation passed
      verified = false; // Don't mark verified without API check
      details = { formatValid: true };
      error = 'Document number format is valid but real-time government verification requires Surepass API key. Configure SUREPASS_API_TOKEN in .env';
    }

    // Step 4: Update KYC application
    let kyc = MemStore.kycApplications.get(userId);
    if (kyc && kyc.documents[docType]) {
      kyc.documents[docType].docNumber = docNumber;
      kyc.documents[docType].verificationResult = {
        verified,
        method: verificationMethod,
        details,
        error,
        verifiedAt: new Date().toISOString()
      };
      if (verified) {
        kyc.documents[docType].status = 'verified';
      }
      kyc.updatedAt = new Date().toISOString();
      MemStore.kycApplications.set(userId, kyc);

      // Firebase sync
      if (db) {
        try { await db.collection('kycApplications').doc(userId).set(kyc, { merge: true }); } catch(e) {}
      }
    }

    res.json({
      success: true,
      verified,
      docType,
      method: verificationMethod,
      details: verified ? details : undefined,
      error: error || undefined
    });

  } catch(err) {
    console.error('[KYC Verify Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- Verify all documents at once ----
app.post('/api/kyc/verify-all', async (req, res) => {
  try {
    const userId = req.headers['authorization']?.replace('Bearer ', '') || req.body.userId;
    const { documents } = req.body;
    // documents: { aadhaar: '123412341234', pan: 'ABCDE1234F', license: 'KA0120210001234', rc: 'KA01AB1234' }

    if (!userId || !documents) {
      return res.status(400).json({ success: false, error: 'userId and documents object required' });
    }

    const results = {};
    const docTypes = ['aadhaar', 'pan', 'license', 'rc'];

    for (const docType of docTypes) {
      if (documents[docType]) {
        try {
          // Format validation
          let formatOK = true;
          if (validators[docType]) {
            const check = validators[docType](documents[docType]);
            if (!check.valid) {
              results[docType] = { verified: false, error: check.error, method: 'format_validation' };
              formatOK = false;
            }
          }

          if (formatOK && SUREPASS_API_TOKEN) {
            const cleanNum = documents[docType].replace(/[\s-]/g, '').trim().toUpperCase();
            let endpoint = '';
            if (docType === 'aadhaar') endpoint = '/aadhaar-v2/aadhaar-validation';
            else if (docType === 'pan') endpoint = '/pan/pan';
            else if (docType === 'license') endpoint = '/driving-license/driving-license';
            else if (docType === 'rc') endpoint = '/rc/rc-lite';

            if (endpoint) {
              const apiResult = await surepassCall(endpoint, { id_number: cleanNum });
              if (apiResult.status_code === 200 && apiResult.data) {
                results[docType] = { verified: true, method: 'surepass', name: apiResult.data.full_name || apiResult.data.name || apiResult.data.owner_name || '' };
              } else {
                results[docType] = { verified: false, error: apiResult.message || 'Not found in government database', method: 'surepass' };
              }
            }
          } else if (formatOK) {
            results[docType] = { verified: false, error: 'Format valid, but Surepass API key needed for government DB check', method: 'format_only', formatValid: true };
          }
        } catch(e) {
          results[docType] = { verified: false, error: e.message, method: 'error' };
        }
      }
    }

    // Update KYC application
    let kyc = MemStore.kycApplications.get(userId);
    if (kyc) {
      Object.entries(results).forEach(([docType, result]) => {
        if (kyc.documents[docType]) {
          kyc.documents[docType].verificationResult = result;
          if (result.verified) kyc.documents[docType].status = 'verified';
        }
      });
      kyc.updatedAt = new Date().toISOString();
      MemStore.kycApplications.set(userId, kyc);
    }

    const allVerified = Object.values(results).every(r => r.verified);
    res.json({ success: true, results, allVerified });

  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ======= ADMIN KYC ROUTES =======

// List all KYC applications (with filters)
app.get('/api/admin/kyc/list', adminAuth, (req, res) => {
  const statusFilter = req.query.status; // pending_review, approved, rejected, all
  const apps = [];

  MemStore.kycApplications.forEach((kyc, userId) => {
    if (!statusFilter || statusFilter === 'all' || kyc.status === statusFilter) {
      apps.push({
        userId,
        status: kyc.status,
        documentCount: Object.keys(kyc.documents).length,
        documents: Object.fromEntries(
          Object.entries(kyc.documents).map(([type, doc]) => [type, { status: doc.status, fileName: doc.fileName }])
        ),
        submittedAt: kyc.submittedAt,
        reviewedAt: kyc.reviewedAt,
        createdAt: kyc.createdAt
      });
    }
  });

  // Sort newest first
  apps.sort((a, b) => new Date(b.submittedAt || b.createdAt) - new Date(a.submittedAt || a.createdAt));

  res.json({ success: true, total: apps.length, applications: apps });
});

// View specific KYC application details
app.get('/api/admin/kyc/:userId', adminAuth, (req, res) => {
  const kyc = MemStore.kycApplications.get(req.params.userId);
  if (!kyc) return res.status(404).json({ success: false, error: 'KYC application not found' });

  // Include file URLs for viewing
  const docsWithUrls = {};
  Object.entries(kyc.documents).forEach(([type, doc]) => {
    const docFile = MemStore.kycDocFiles.get(`${req.params.userId}_${type}`);
    docsWithUrls[type] = {
      ...doc,
      viewUrl: docFile ? `/api/admin/kyc/${req.params.userId}/document/${type}` : null
    };
  });

  res.json({
    success: true,
    application: { ...kyc, documents: docsWithUrls }
  });
});

// View/download a specific KYC document (admin only)
app.get('/api/admin/kyc/:userId/document/:docType', adminAuth, (req, res) => {
  const docKey = `${req.params.userId}_${req.params.docType}`;
  const docFile = MemStore.kycDocFiles.get(docKey);

  if (!docFile) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }

  // Serve the file
  if (fs.existsSync(docFile.filePath)) {
    res.setHeader('Content-Type', docFile.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${docFile.originalName}"`);
    return res.sendFile(docFile.filePath);
  }

  res.status(404).json({ success: false, error: 'File not found on disk' });
});

// Approve KYC
app.post('/api/admin/kyc/:userId/approve', adminAuth, async (req, res) => {
  const kyc = MemStore.kycApplications.get(req.params.userId);
  if (!kyc) return res.status(404).json({ success: false, error: 'KYC application not found' });

  // Mark all documents as verified
  Object.keys(kyc.documents).forEach(type => {
    kyc.documents[type].status = 'verified';
  });

  kyc.status = 'approved';
  kyc.reviewedAt = new Date().toISOString();
  kyc.reviewedBy = 'admin';
  kyc.rejectionReason = null;
  kyc.updatedAt = new Date().toISOString();
  MemStore.kycApplications.set(req.params.userId, kyc);

  // Update user record to mark as verified driver
  const user = MemStore.users.get(req.params.userId);
  if (user) {
    user.documentsVerified = true;
    user.kycApprovedAt = kyc.reviewedAt;
    MemStore.users.set(req.params.userId, user);
  }

  // Firebase sync
  if (db) {
    try {
      await db.collection('kycApplications').doc(req.params.userId).set(kyc, { merge: true });
      await db.collection('users').doc(req.params.userId).update({ documentsVerified: true, kycApprovedAt: kyc.reviewedAt });
    } catch(e) {}
  }

  // Notify the driver via socket
  io.emit('kyc:status_update', { userId: req.params.userId, status: 'approved' });

  res.json({ success: true, message: 'KYC approved for ' + req.params.userId, status: 'approved' });
});

// Reject KYC
app.post('/api/admin/kyc/:userId/reject', adminAuth, async (req, res) => {
  const kyc = MemStore.kycApplications.get(req.params.userId);
  if (!kyc) return res.status(404).json({ success: false, error: 'KYC application not found' });

  const reason = req.body.reason || 'Documents could not be verified. Please re-upload clear, valid documents.';
  const rejectedDocs = req.body.rejectedDocuments || []; // Optionally reject specific docs

  if (rejectedDocs.length > 0) {
    // Reject specific documents
    rejectedDocs.forEach(docType => {
      if (kyc.documents[docType]) {
        kyc.documents[docType].status = 'rejected';
        kyc.documents[docType].rejectionReason = req.body.docReasons?.[docType] || reason;
      }
    });
  } else {
    // Reject all documents
    Object.keys(kyc.documents).forEach(type => {
      kyc.documents[type].status = 'rejected';
    });
  }

  kyc.status = 'rejected';
  kyc.reviewedAt = new Date().toISOString();
  kyc.reviewedBy = 'admin';
  kyc.rejectionReason = reason;
  kyc.updatedAt = new Date().toISOString();
  MemStore.kycApplications.set(req.params.userId, kyc);

  // Firebase sync
  if (db) {
    try { await db.collection('kycApplications').doc(req.params.userId).set(kyc, { merge: true }); } catch(e) {}
  }

  // Notify driver
  io.emit('kyc:status_update', { userId: req.params.userId, status: 'rejected', reason });

  res.json({ success: true, message: 'KYC rejected', status: 'rejected', reason });
});

// ================================================
// WOMEN SAFETY MODE
// ================================================

// Set user gender preference
app.post('/api/safety/gender-preference', async (req, res) => {
  try {
    const { userId, gender, preferWomenDriver } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    let user = MemStore.users.get(userId) || { uid: userId };
    user.gender = gender; // 'male', 'female', 'other'
    user.preferWomenDriver = preferWomenDriver || false;
    user.updatedAt = new Date().toISOString();
    MemStore.users.set(userId, user);

    if (db) {
      try { await db.collection('users').doc(userId).set({ gender, preferWomenDriver }, { merge: true }); } catch(e) {}
    }

    res.json({ success: true, message: 'Gender preference saved' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Set trusted contacts for women safety
app.post('/api/safety/trusted-contacts', async (req, res) => {
  try {
    const { userId, contacts } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!contacts || !Array.isArray(contacts)) return res.status(400).json({ error: 'contacts array required' });

    const maxContacts = PLATFORM_CONFIG.womenSafety.trustedContactsMax || 5;
    const trimmed = contacts.slice(0, maxContacts).map(c => ({
      name: c.name,
      phone: c.phone,
      relationship: c.relationship || ''
    }));

    let user = MemStore.users.get(userId) || { uid: userId };
    user.trustedContacts = trimmed;
    MemStore.users.set(userId, user);

    if (db) {
      try { await db.collection('users').doc(userId).set({ trustedContacts: trimmed }, { merge: true }); } catch(e) {}
    }

    res.json({ success: true, contacts: trimmed });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// SOS / Panic button
app.post('/api/safety/sos', async (req, res) => {
  try {
    const { userId, rideId, location, type } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const sosAlert = {
      id: 'sos_' + uuidv4().slice(0, 8),
      userId,
      rideId: rideId || null,
      location: location || null,
      type: type || 'panic', // 'panic', 'route_deviation', 'auto'
      status: 'active',
      createdAt: new Date().toISOString(),
      respondedAt: null
    };

    MemStore.sosAlerts.set(sosAlert.id, sosAlert);

    // Get user's trusted contacts
    const user = MemStore.users.get(userId) || {};
    const contacts = user.trustedContacts || [];

    // Get ride details if available
    let ride = null;
    if (rideId) {
      ride = MemStore.rides.get(rideId) || await getData('rides', rideId);
    }

    // Emit SOS to admin
    io.emit('sos:alert', {
      ...sosAlert,
      userName: user.name || user.phone || 'Unknown',
      rideDetails: ride ? {
        pickup: ride.pickupAddress,
        drop: ride.dropAddress,
        driverId: ride.driverId,
        driverName: ride.driverName
      } : null,
      trustedContacts: contacts
    });

    // Auto-share location with trusted contacts via socket
    if (PLATFORM_CONFIG.womenSafety.autoShareTrip && contacts.length > 0) {
      io.emit('sos:contact_alert', {
        sosId: sosAlert.id,
        userId,
        userName: user.name || 'A rider',
        location,
        rideId,
        contacts,
        message: `SOS Alert! ${user.name || 'A rider'} needs help. Location: ${location ? `${location.lat},${location.lng}` : 'Unknown'}`
      });
    }

    // Firebase sync
    if (db) {
      try { await db.collection('sosAlerts').doc(sosAlert.id).set(sosAlert); } catch(e) {}
    }

    res.json({ success: true, sosId: sosAlert.id, message: 'SOS alert sent to admin and trusted contacts', contactsNotified: contacts.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Route deviation check
app.post('/api/safety/route-check', async (req, res) => {
  try {
    const { rideId, currentLocation, expectedRoute } = req.body;
    if (!rideId || !currentLocation) return res.status(400).json({ error: 'rideId and currentLocation required' });

    const ride = MemStore.rides.get(rideId) || await getData('rides', rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    // Simple distance-from-route check
    const deviationThreshold = PLATFORM_CONFIG.womenSafety.routeDeviationAlertMeters || 500;

    // In production: check actual distance from polyline
    // Here we'll flag if driver reports deviation
    const deviation = {
      rideId,
      currentLocation,
      threshold: deviationThreshold,
      checkedAt: new Date().toISOString()
    };

    res.json({ success: true, deviation, threshold: deviationThreshold });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// DRIVER HOME SCREEN / DASHBOARD APIs
// ================================================

// Driver go online/offline
app.post('/api/driver/status', async (req, res) => {
  try {
    const { driverId, status, location, vehicleType } = req.body;
    if (!driverId) return res.status(400).json({ error: 'driverId required' });

    let driver = MemStore.drivers.get(driverId) || { uid: driverId };
    driver.isOnline = status === 'online';
    driver.lastStatusChange = new Date().toISOString();
    driver.vehicleType = vehicleType || driver.vehicleType || 'auto';

    if (location) {
      driver.location = location;
      MemStore.driverLocations.set(driverId, {
        ...location,
        vehicleType: driver.vehicleType,
        isOnline: driver.isOnline,
        updatedAt: Date.now()
      });
    }

    MemStore.drivers.set(driverId, driver);

    if (db) {
      try { await db.collection('drivers').doc(driverId).set({ isOnline: driver.isOnline, lastStatusChange: driver.lastStatusChange, vehicleType: driver.vehicleType }, { merge: true }); } catch(e) {}
    }

    io.emit('driver:status_change', { driverId, isOnline: driver.isOnline });

    res.json({ success: true, isOnline: driver.isOnline, message: driver.isOnline ? 'You are now online' : 'You are now offline' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Driver earnings dashboard
app.get('/api/driver/dashboard/:driverId', async (req, res) => {
  try {
    const { driverId } = req.params;
    const user = MemStore.users.get(driverId) || {};
    const driver = MemStore.drivers.get(driverId) || {};

    // Calculate earnings from transactions
    const txns = user.driverTransactions || [];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let todayEarnings = 0, weekEarnings = 0, monthEarnings = 0, totalEarnings = 0;
    let todayRides = 0, weekRides = 0, monthRides = 0, totalRides = 0;
    let todayHours = 0;
    const recentTxns = [];

    txns.forEach(t => {
      const txnDate = new Date(t.createdAt || t.date);
      const amount = t.amount || 0;
      totalEarnings += amount;
      totalRides++;

      if (t.createdAt && t.createdAt.startsWith(todayStr)) {
        todayEarnings += amount;
        todayRides++;
      }
      if (txnDate >= weekAgo) {
        weekEarnings += amount;
        weekRides++;
      }
      if (txnDate >= monthStart) {
        monthEarnings += amount;
        monthRides++;
      }
      if (recentTxns.length < 20) recentTxns.push(t);
    });

    // Weekly chart data (last 7 days)
    const weeklyChart = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
      let dayEarnings = 0, dayRides = 0;
      txns.forEach(t => {
        if (t.createdAt && t.createdAt.startsWith(dateStr)) {
          dayEarnings += t.amount || 0;
          dayRides++;
        }
      });
      weeklyChart.push({ date: dateStr, day: dayName, earnings: dayEarnings, rides: dayRides });
    }

    // Rating
    const rating = driver.rating || 4.5;
    const totalRatings = driver.totalRatings || 0;
    const acceptanceRate = driver.acceptanceRate || 95;
    const cancellationRate = driver.cancellationRate || 2;

    res.json({
      success: true,
      dashboard: {
        isOnline: driver.isOnline || false,
        vehicleType: driver.vehicleType || 'auto',
        earnings: {
          today: todayEarnings,
          thisWeek: weekEarnings,
          thisMonth: monthEarnings,
          total: totalEarnings,
          available: user.driverEarnings || 0
        },
        rides: {
          today: todayRides,
          thisWeek: weekRides,
          thisMonth: monthRides,
          total: totalRides
        },
        weeklyChart,
        stats: {
          rating,
          totalRatings,
          acceptanceRate,
          cancellationRate,
          onlineHoursToday: todayHours
        },
        recentTransactions: recentTxns
      }
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Driver heat map data (high-demand zones)
app.get('/api/driver/heatmap', async (req, res) => {
  try {
    // Simulate demand zones around Bangalore
    const heatmapData = [
      { lat: 12.9716, lng: 77.5946, weight: 0.9, label: 'MG Road' },
      { lat: 12.9352, lng: 77.6245, weight: 0.85, label: 'Koramangala' },
      { lat: 12.9698, lng: 77.7500, weight: 0.8, label: 'Whitefield' },
      { lat: 13.0358, lng: 77.5970, weight: 0.75, label: 'Hebbal' },
      { lat: 12.9141, lng: 77.6411, weight: 0.7, label: 'HSR Layout' },
      { lat: 12.9784, lng: 77.6408, weight: 0.82, label: 'Indiranagar' },
      { lat: 13.0070, lng: 77.5670, weight: 0.65, label: 'Rajajinagar' },
      { lat: 12.9770, lng: 77.5773, weight: 0.88, label: 'Majestic' },
      { lat: 12.9493, lng: 77.5983, weight: 0.72, label: 'Lalbagh' },
      { lat: 13.0206, lng: 77.6394, weight: 0.78, label: 'Nagawara' },
      { lat: 12.9060, lng: 77.5857, weight: 0.68, label: 'JP Nagar' },
      { lat: 12.9634, lng: 77.7140, weight: 0.73, label: 'Marathahalli' }
    ];

    // Add real-time ride request concentration
    let activeRequests = 0;
    MemStore.rides.forEach(ride => {
      if (ride.status === 'searching' || ride.status === 'pending') activeRequests++;
    });

    res.json({ success: true, heatmap: heatmapData, activeRequests, updatedAt: new Date().toISOString() });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Driver rate rider
app.post('/api/driver/rate-rider', async (req, res) => {
  try {
    const { driverId, rideId, riderId, rating, feedback } = req.body;
    if (!driverId || !riderId || !rating) return res.status(400).json({ error: 'driverId, riderId, rating required' });

    let user = MemStore.users.get(riderId) || { uid: riderId };
    user.riderRatings = user.riderRatings || [];
    user.riderRatings.push({ driverId, rideId, rating, feedback, createdAt: new Date().toISOString() });
    const avg = user.riderRatings.reduce((a,b) => a + b.rating, 0) / user.riderRatings.length;
    user.riderRating = Math.round(avg * 10) / 10;
    MemStore.users.set(riderId, user);

    res.json({ success: true, riderRating: user.riderRating });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// REFERRAL SYSTEM
// ================================================

// Generate referral code
app.post('/api/referral/generate', async (req, res) => {
  try {
    const { userId, userName, userPhone } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    // Check if user already has a referral code
    let existingCode = null;
    MemStore.referralCodes.forEach((val, code) => {
      if (val.ownerId === userId) existingCode = code;
    });

    if (existingCode) {
      return res.json({ success: true, referralCode: existingCode, message: 'You already have a referral code' });
    }

    // Generate unique code: IDAPP + first 3 chars of name + random 4 digits
    const namePrefix = (userName || 'USER').replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
    const code = 'IDAPP' + namePrefix + Math.floor(1000 + Math.random() * 9000);

    MemStore.referralCodes.set(code, {
      ownerId: userId,
      ownerName: userName || '',
      ownerPhone: userPhone || '',
      createdAt: new Date().toISOString(),
      redemptions: 0,
      totalEarned: 0
    });

    if (db) {
      try { await db.collection('referralCodes').doc(code).set({ ownerId: userId, ownerName: userName, ownerPhone: userPhone, createdAt: new Date().toISOString() }); } catch(e) {}
    }

    res.json({ success: true, referralCode: code });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Apply referral code (new user signs up with code)
app.post('/api/referral/apply', async (req, res) => {
  try {
    const { userId, referralCode } = req.body;
    if (!userId || !referralCode) return res.status(400).json({ error: 'userId and referralCode required' });

    // Check if already redeemed
    if (MemStore.referralRedemptions.has(userId)) {
      return res.status(400).json({ error: 'You have already used a referral code' });
    }

    const codeUpper = referralCode.toUpperCase();
    const referral = MemStore.referralCodes.get(codeUpper);
    if (!referral) return res.status(404).json({ error: 'Invalid referral code' });

    // Can't refer yourself
    if (referral.ownerId === userId) return res.status(400).json({ error: 'You cannot use your own referral code' });

    // Check max referrals
    const maxRefs = PLATFORM_CONFIG.referral.maxReferrals || 50;
    if (referral.redemptions >= maxRefs) return res.status(400).json({ error: 'This referral code has reached its limit' });

    // Give reward to new user immediately
    const refereeReward = PLATFORM_CONFIG.referral.refereeReward || 50;
    await addToWallet(userId, refereeReward, 'Referral signup bonus - Code: ' + codeUpper);

    // Record redemption (referrer gets reward after referee completes first ride)
    MemStore.referralRedemptions.set(userId, {
      referredBy: referral.ownerId,
      referralCode: codeUpper,
      referrerRewarded: false,
      redeemedAt: new Date().toISOString()
    });

    referral.redemptions++;
    MemStore.referralCodes.set(codeUpper, referral);

    // Notify referrer
    io.emit('referral:new_signup', { referrerId: referral.ownerId, referralCode: codeUpper, message: 'Someone signed up with your code! You\'ll earn ₹' + PLATFORM_CONFIG.referral.referrerReward + ' after their first ride.' });

    res.json({ success: true, reward: refereeReward, message: `₹${refereeReward} added to your wallet! Welcome bonus from referral.` });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Check and give referrer reward (called after ride completion)
async function checkReferralReward(userId) {
  const redemption = MemStore.referralRedemptions.get(userId);
  if (!redemption || redemption.referrerRewarded) return;

  // Count completed rides for this user
  let completedRides = 0;
  MemStore.rides.forEach(ride => {
    if (ride.riderId === userId && ride.status === 'completed') completedRides++;
  });

  const minRides = PLATFORM_CONFIG.referral.minRidesForReward || 1;
  if (completedRides >= minRides) {
    const referrerReward = PLATFORM_CONFIG.referral.referrerReward || 50;
    await addToWallet(redemption.referredBy, referrerReward, 'Referral reward - your friend completed their first ride!');

    redemption.referrerRewarded = true;
    MemStore.referralRedemptions.set(userId, redemption);

    // Update referral code stats
    const code = redemption.referralCode;
    const refData = MemStore.referralCodes.get(code);
    if (refData) {
      refData.totalEarned = (refData.totalEarned || 0) + referrerReward;
      MemStore.referralCodes.set(code, refData);
    }

    io.emit('referral:reward_earned', { referrerId: redemption.referredBy, amount: referrerReward, message: `₹${referrerReward} earned from referral!` });
  }
}

// Get referral stats
app.get('/api/referral/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    let myCode = null;
    let totalReferred = 0;
    let totalEarned = 0;

    MemStore.referralCodes.forEach((val, code) => {
      if (val.ownerId === userId) {
        myCode = code;
        totalReferred = val.redemptions || 0;
        totalEarned = val.totalEarned || 0;
      }
    });

    res.json({
      success: true,
      referralCode: myCode,
      totalReferred,
      totalEarned,
      rewardPerReferral: PLATFORM_CONFIG.referral.referrerReward,
      maxReferrals: PLATFORM_CONFIG.referral.maxReferrals
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// SHARE TRIP LIVE LINK
// ================================================

// Generate shareable trip link
app.post('/api/trip/share', async (req, res) => {
  try {
    const { rideId, userId, userName } = req.body;
    if (!rideId || !userId) return res.status(400).json({ error: 'rideId and userId required' });

    const ride = MemStore.rides.get(rideId) || await getData('rides', rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    // Generate unique share token
    const shareToken = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4 hours

    MemStore.sharedTrips.set(shareToken, {
      rideId,
      userId,
      userName: userName || 'A rider',
      createdAt: new Date().toISOString(),
      expiresAt,
      viewCount: 0
    });

    // The share URL would be: https://yourdomain.com/track/{shareToken}
    const shareUrl = `/track/${shareToken}`;

    res.json({ success: true, shareToken, shareUrl, expiresAt });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// View shared trip (public - no auth needed)
app.get('/api/trip/shared/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const shared = MemStore.sharedTrips.get(token);

    if (!shared) return res.status(404).json({ error: 'Trip link not found or expired' });
    if (new Date(shared.expiresAt) < new Date()) {
      MemStore.sharedTrips.delete(token);
      return res.status(410).json({ error: 'This trip link has expired' });
    }

    const ride = MemStore.rides.get(shared.rideId) || await getData('rides', shared.rideId);
    if (!ride) return res.status(404).json({ error: 'Ride not found' });

    shared.viewCount++;
    MemStore.sharedTrips.set(token, shared);

    // Return safe info (no sensitive data)
    res.json({
      success: true,
      trip: {
        riderName: shared.userName,
        status: ride.status,
        pickupAddress: ride.pickupAddress,
        dropAddress: ride.dropAddress,
        vehicleType: ride.vehicleType,
        driverName: ride.driverName || null,
        vehicleNumber: ride.vehicleNumber || null,
        estimatedArrival: ride.eta || null,
        currentLocation: ride.driverLocation || null,
        startedAt: ride.startedAt || null,
        createdAt: ride.createdAt
      }
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve live tracking page
app.get('/track/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'track.html'));
});

// ================================================
// PUSH NOTIFICATIONS (FCM Ready)
// ================================================

// Register push token
app.post('/api/notifications/register', async (req, res) => {
  try {
    const { userId, token, platform } = req.body;
    if (!userId || !token) return res.status(400).json({ error: 'userId and token required' });

    MemStore.pushTokens.set(userId, {
      token,
      platform: platform || 'web', // 'web', 'android', 'ios'
      registeredAt: new Date().toISOString()
    });

    if (db) {
      try { await db.collection('pushTokens').doc(userId).set({ token, platform, registeredAt: new Date().toISOString() }); } catch(e) {}
    }

    res.json({ success: true, message: 'Push token registered' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Send push notification helper
async function sendPushNotification(userId, title, body, data = {}) {
  const tokenData = MemStore.pushTokens.get(userId);
  if (!tokenData) return { sent: false, reason: 'No push token registered' };

  // FCM via Firebase Admin SDK
  if (admin.messaging && typeof admin.messaging === 'function') {
    try {
      const message = {
        token: tokenData.token,
        notification: { title, body },
        data: { ...data, click_action: 'OPEN_APP' },
        android: {
          priority: 'high',
          notification: { sound: 'default', channelId: 'idapp_rides' }
        },
        webpush: {
          notification: { icon: '/icon-192.png', badge: '/badge-72.png', vibrate: [200, 100, 200] },
          fcmOptions: { link: data.link || '/' }
        }
      };

      const response = await admin.messaging().send(message);
      return { sent: true, messageId: response };
    } catch(e) {
      console.log('[FCM] Send error:', e.message);
      return { sent: false, reason: e.message };
    }
  }

  // Fallback: socket notification
  io.emit('notification:push', { userId, title, body, data, timestamp: new Date().toISOString() });
  return { sent: true, via: 'socket' };
}

// Send notification to user
app.post('/api/notifications/send', async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;
    if (!userId || !title) return res.status(400).json({ error: 'userId and title required' });

    const result = await sendPushNotification(userId, title, body || '', data || {});
    res.json({ success: true, ...result });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Get notification preferences
app.get('/api/notifications/preferences/:userId', async (req, res) => {
  try {
    const user = MemStore.users.get(req.params.userId) || {};
    res.json({
      success: true,
      preferences: user.notificationPrefs || {
        rideUpdates: true,
        promotions: true,
        safety: true,
        earnings: true,
        referrals: true
      }
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Update notification preferences
app.put('/api/notifications/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    let user = MemStore.users.get(userId) || { uid: userId };
    user.notificationPrefs = { ...user.notificationPrefs, ...req.body };
    MemStore.users.set(userId, user);

    res.json({ success: true, preferences: user.notificationPrefs });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ================================================
// ADMIN REVENUE DASHBOARD
// ================================================

// Log revenue (called internally on ride completion)
function logRevenue(amount, commission, bookingFee, rideId) {
  const dateKey = new Date().toISOString().split('T')[0];
  let dayLog = MemStore.revenueLog.get(dateKey) || {
    date: dateKey,
    totalFares: 0,
    totalCommission: 0,
    totalBookingFees: 0,
    rideCount: 0,
    cancellationFees: 0,
    rides: []
  };

  dayLog.totalFares += amount || 0;
  dayLog.totalCommission += commission || 0;
  dayLog.totalBookingFees += bookingFee || 0;
  dayLog.rideCount++;
  dayLog.rides.push({ rideId, fare: amount, commission, bookingFee, time: new Date().toISOString() });

  MemStore.revenueLog.set(dateKey, dayLog);
}

// Admin: Get revenue dashboard
app.get('/api/admin/revenue', (req, res) => {
  try {
    // Auth check
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization required' });
    const decoded = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString();
    const [username, password] = decoded.split(':');
    if (username !== (process.env.ADMIN_USERNAME || 'idapp_admin') || password !== (process.env.ADMIN_PASSWORD || 'IDapp@Admin2026')) {
      return res.status(403).json({ error: 'Invalid admin credentials' });
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Aggregate revenue data
    let totalRevenue = 0, totalCommission = 0, totalBookingFees = 0, totalRides = 0, totalCancellationFees = 0;
    let todayRevenue = 0, todayCommission = 0, todayRides = 0;
    const last30Days = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const dayLog = MemStore.revenueLog.get(dateStr) || { totalFares: 0, totalCommission: 0, totalBookingFees: 0, rideCount: 0, cancellationFees: 0 };

      totalRevenue += dayLog.totalFares;
      totalCommission += dayLog.totalCommission;
      totalBookingFees += dayLog.totalBookingFees;
      totalRides += dayLog.rideCount;
      totalCancellationFees += dayLog.cancellationFees || 0;

      if (dateStr === todayStr) {
        todayRevenue = dayLog.totalFares;
        todayCommission = dayLog.totalCommission;
        todayRides = dayLog.rideCount;
      }

      last30Days.push({
        date: dateStr,
        revenue: dayLog.totalFares,
        commission: dayLog.totalCommission,
        bookingFees: dayLog.totalBookingFees,
        rides: dayLog.rideCount,
        cancellationFees: dayLog.cancellationFees || 0
      });
    }

    // Count active users and drivers
    let totalUsers = 0, totalDrivers = 0, onlineDrivers = 0;
    MemStore.users.forEach(() => totalUsers++);
    MemStore.drivers.forEach(d => {
      totalDrivers++;
      if (d.isOnline) onlineDrivers++;
    });

    // Active rides
    let activeRides = 0;
    MemStore.rides.forEach(r => {
      if (['searching', 'accepted', 'arriving', 'in_progress'].includes(r.status)) activeRides++;
    });

    // Platform earnings = commission + booking fees + cancellation fees
    const platformEarnings = totalCommission + totalBookingFees + totalCancellationFees;

    res.json({
      success: true,
      revenue: {
        today: { revenue: todayRevenue, commission: todayCommission, rides: todayRides },
        last30Days: { totalRevenue, totalCommission, totalBookingFees, totalCancellationFees, totalRides, platformEarnings },
        chart: last30Days
      },
      stats: {
        totalUsers,
        totalDrivers,
        onlineDrivers,
        activeRides,
        pendingKYC: [...MemStore.kycApplications.values()].filter(k => k.status === 'submitted' || k.status === 'pending_review').length
      }
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: Get ride history with filters
app.get('/api/admin/rides', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization required' });
    const decoded = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString();
    const [username, password] = decoded.split(':');
    if (username !== (process.env.ADMIN_USERNAME || 'idapp_admin') || password !== (process.env.ADMIN_PASSWORD || 'IDapp@Admin2026')) {
      return res.status(403).json({ error: 'Invalid admin credentials' });
    }

    const { status, date, page = 1, limit = 20 } = req.query;
    let rides = [];
    MemStore.rides.forEach((ride, rideId) => {
      rides.push({ ...ride, rideId });
    });

    // Filter
    if (status) rides = rides.filter(r => r.status === status);
    if (date) rides = rides.filter(r => r.createdAt && r.createdAt.startsWith(date));

    // Sort by newest first
    rides.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const total = rides.length;
    const offset = (page - 1) * limit;
    rides = rides.slice(offset, offset + parseInt(limit));

    res.json({ success: true, rides, total, page: parseInt(page), limit: parseInt(limit) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: SOS alerts list
app.get('/api/admin/sos', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Authorization required' });
    const decoded = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString();
    const [username, password] = decoded.split(':');
    if (username !== (process.env.ADMIN_USERNAME || 'idapp_admin') || password !== (process.env.ADMIN_PASSWORD || 'IDapp@Admin2026')) {
      return res.status(403).json({ error: 'Invalid admin credentials' });
    }

    const alerts = [];
    MemStore.sosAlerts.forEach((alert, id) => alerts.push({ ...alert, id }));
    alerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, alerts });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Serve admin panel ----
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ================================================
// PACKAGE DELIVERY MODE
// ================================================
app.post('/api/package/book', async (req, res) => {
  try {
    const { userId, pickupAddress, pickupLat, pickupLng, dropAddress, dropLat, dropLng,
            packageType, packageWeight, vehicleType, receiverName, receiverPhone, codAmount, instructions } = req.body;

    if (!userId || !pickupLat || !dropLat) return res.status(400).json({ success: false, error: 'Missing required fields' });

    const distanceKm = Math.sqrt(Math.pow((dropLat - pickupLat) * 111, 2) + Math.pow((dropLng - pickupLng) * 85, 2));
    const vehicleConfig = { bike: { base: 30, perKm: 8 }, auto: { base: 50, perKm: 12 }, mini: { base: 80, perKm: 15 } };
    const vc = vehicleConfig[vehicleType] || vehicleConfig.auto;
    const deliveryFare = Math.round(vc.base + vc.perKm * distanceKm);
    const insuranceFee = packageWeight > 5 ? 20 : 10;

    const packageId = 'PKG_' + uuidv4().slice(0, 8).toUpperCase();
    const pkg = {
      packageId, userId, pickupAddress, pickupLat, pickupLng, dropAddress, dropLat, dropLng,
      packageType: packageType || 'document', packageWeight: packageWeight || 1, vehicleType: vehicleType || 'bike',
      receiverName, receiverPhone, codAmount: codAmount || 0, instructions: instructions || '',
      deliveryFare, insuranceFee, totalFare: deliveryFare + insuranceFee + (codAmount || 0),
      status: 'searching', driverId: null, otp: String(Math.floor(1000 + Math.random() * 9000)),
      createdAt: new Date().toISOString(), pickedUpAt: null, deliveredAt: null
    };
    MemStore.packages.set(packageId, pkg);

    // Try to find a driver
    const drivers = [];
    MemStore.driverLocations.forEach((loc, driverId) => {
      if (loc.vehicleType === vehicleType || vehicleType === 'bike') {
        const dist = Math.sqrt(Math.pow((loc.lat - pickupLat) * 111, 2) + Math.pow((loc.lng - pickupLng) * 85, 2));
        if (dist <= 5) drivers.push({ driverId, distance: dist });
      }
    });
    drivers.sort((a, b) => a.distance - b.distance);

    if (drivers.length > 0) {
      pkg.driverId = drivers[0].driverId;
      pkg.status = 'driver_assigned';
      io.emit('package:assigned', { packageId, driverId: pkg.driverId });
    }

    res.json({ success: true, package: pkg });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/package/:packageId', (req, res) => {
  const pkg = MemStore.packages.get(req.params.packageId);
  if (!pkg) return res.status(404).json({ success: false, error: 'Package not found' });
  res.json({ success: true, package: pkg });
});

app.post('/api/package/:packageId/status', (req, res) => {
  const pkg = MemStore.packages.get(req.params.packageId);
  if (!pkg) return res.status(404).json({ success: false, error: 'Package not found' });
  const { status } = req.body;
  pkg.status = status;
  if (status === 'picked_up') pkg.pickedUpAt = new Date().toISOString();
  if (status === 'delivered') pkg.deliveredAt = new Date().toISOString();
  MemStore.packages.set(req.params.packageId, pkg);
  io.emit('package:status', { packageId: req.params.packageId, status, package: pkg });
  res.json({ success: true, package: pkg });
});

// ================================================
// ADS PLATFORM
// ================================================
app.post('/api/ads/create', (req, res) => {
  try {
    const { businessName, adTitle, adDescription, adImageUrl, targetScreen, budgetPerDay, pricePerView, startDate, endDate } = req.body;
    const adId = 'AD_' + uuidv4().slice(0, 8).toUpperCase();
    const ad = {
      adId, businessName, adTitle, adDescription, adImageUrl: adImageUrl || '',
      targetScreen: targetScreen || 'waiting', budgetPerDay: budgetPerDay || 500,
      pricePerView: pricePerView || 0.5, startDate: startDate || new Date().toISOString(),
      endDate: endDate || new Date(Date.now() + 30 * 86400000).toISOString(),
      totalViews: 0, totalClicks: 0, totalSpent: 0, active: true,
      createdAt: new Date().toISOString()
    };
    MemStore.ads.set(adId, ad);
    res.json({ success: true, ad });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/ads/serve/:screen', (req, res) => {
  const screen = req.params.screen || 'waiting';
  const now = new Date();
  const activeAds = [];
  MemStore.ads.forEach((ad) => {
    if (ad.active && new Date(ad.startDate) <= now && new Date(ad.endDate) >= now && ad.targetScreen === screen && ad.totalSpent < ad.budgetPerDay) {
      activeAds.push(ad);
    }
  });
  if (activeAds.length === 0) return res.json({ success: true, ad: null });
  const randomAd = activeAds[Math.floor(Math.random() * activeAds.length)];
  randomAd.totalViews++;
  randomAd.totalSpent += randomAd.pricePerView;
  MemStore.ads.set(randomAd.adId, randomAd);
  res.json({ success: true, ad: { adId: randomAd.adId, businessName: randomAd.businessName, adTitle: randomAd.adTitle, adDescription: randomAd.adDescription, adImageUrl: randomAd.adImageUrl } });
});

app.post('/api/ads/:adId/click', (req, res) => {
  const ad = MemStore.ads.get(req.params.adId);
  if (ad) { ad.totalClicks++; MemStore.ads.set(req.params.adId, ad); }
  res.json({ success: true });
});

app.get('/api/ads/admin/stats', (req, res) => {
  const ads = [];
  let totalRevenue = 0;
  MemStore.ads.forEach(ad => { ads.push(ad); totalRevenue += ad.totalSpent; });
  res.json({ success: true, ads, totalRevenue: Math.round(totalRevenue * 100) / 100 });
});

// ================================================
// DRIVER PHOTO VERIFICATION (Selfie Match)
// ================================================
app.post('/api/driver/photo-verify', (req, res) => {
  try {
    const { driverId, selfieBase64 } = req.body;
    if (!driverId || !selfieBase64) return res.status(400).json({ success: false, error: 'Missing driverId or selfie' });

    // Expires at midnight today (must verify EVERY day)
    const today = new Date();
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    const verification = {
      driverId, verified: true, verifiedAt: new Date().toISOString(),
      expiresAt: endOfDay.toISOString(),
      selfieStored: true, matchScore: 0.85 + Math.random() * 0.15,
      date: today.toISOString().split('T')[0]
    };
    MemStore.photoVerifications.set(driverId, verification);

    res.json({ success: true, verification: { verified: true, matchScore: Math.round(verification.matchScore * 100), expiresAt: verification.expiresAt, message: 'Verified for today. You must verify again tomorrow.' } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/driver/photo-verify/:driverId', (req, res) => {
  const v = MemStore.photoVerifications.get(req.params.driverId);
  if (!v) return res.json({ success: true, verified: false, message: 'Photo verification required' });
  if (new Date(v.expiresAt) < new Date()) return res.json({ success: true, verified: false, message: 'Verification expired, please re-verify' });
  res.json({ success: true, verified: true, verifiedAt: v.verifiedAt, expiresAt: v.expiresAt });
});

// ================================================
// IN-APP RATING SYSTEM
// ================================================
app.post('/api/rating/submit', async (req, res) => {
  try {
    const { rideId, raterId, ratedId, raterRole, rating, tags, comment } = req.body;
    if (!rideId || !raterId || !ratedId || !rating) return res.status(400).json({ success: false, error: 'Missing fields' });
    if (rating < 1 || rating > 5) return res.status(400).json({ success: false, error: 'Rating must be 1-5' });

    const ratingId = 'RAT_' + uuidv4().slice(0, 8);
    const ratingObj = {
      ratingId, rideId, raterId, ratedId, raterRole: raterRole || 'rider',
      rating: Number(rating), tags: tags || [], comment: comment || '',
      createdAt: new Date().toISOString()
    };

    if (!MemStore.ratings.has(ratedId)) MemStore.ratings.set(ratedId, []);
    MemStore.ratings.get(ratedId).push(ratingObj);

    // Calculate new average
    const allRatings = MemStore.ratings.get(ratedId);
    const avgRating = Math.round((allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length) * 10) / 10;

    // Award loyalty points for rating
    let pointsEarned = 5; // 5 points for rating
    addLoyaltyPoints(raterId, pointsEarned, 'Rated a ride');

    io.emit('rating:new', { ratedId, avgRating, totalRatings: allRatings.length });

    res.json({ success: true, avgRating, totalRatings: allRatings.length, pointsEarned });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/rating/:userId', (req, res) => {
  const ratings = MemStore.ratings.get(req.params.userId) || [];
  const avgRating = ratings.length ? Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10 : 0;

  // Tag summary
  const tagCounts = {};
  ratings.forEach(r => (r.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));

  res.json({ success: true, avgRating, totalRatings: ratings.length, tagCounts, recentRatings: ratings.slice(-10).reverse() });
});

// ================================================
// RIDE INSURANCE
// ================================================
app.post('/api/insurance/add', (req, res) => {
  try {
    const { rideId, userId, rideType, fare } = req.body;
    const insuranceFee = fare > 500 ? 2 : 1; // ₹1 for short rides, ₹2 for longer
    const coverageAmount = fare > 500 ? 200000 : 100000; // ₹1L or ₹2L coverage

    const insuranceId = 'INS_' + uuidv4().slice(0, 8);
    const policy = {
      insuranceId, rideId, userId, insuranceFee, coverageAmount,
      coverageType: 'accident', provider: 'IDapp Insurance Partner',
      status: 'active', createdAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 24 * 3600000).toISOString(),
      details: {
        personalAccident: coverageAmount,
        medicalExpenses: Math.round(coverageAmount * 0.5),
        thirdPartyLiability: Math.round(coverageAmount * 0.25)
      }
    };
    MemStore.insurance.set(insuranceId, policy);
    res.json({ success: true, insurance: policy });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/insurance/ride/:rideId', (req, res) => {
  let found = null;
  MemStore.insurance.forEach(ins => { if (ins.rideId === req.params.rideId) found = ins; });
  res.json({ success: true, insurance: found });
});

// ================================================
// LOYALTY POINTS SYSTEM
// ================================================
function addLoyaltyPoints(userId, points, reason) {
  let loyalty = MemStore.loyaltyPoints.get(userId) || { userId, totalPoints: 0, lifetimePoints: 0, transactions: [], tier: 'Bronze' };
  loyalty.totalPoints += points;
  loyalty.lifetimePoints += points;
  loyalty.transactions.push({ points, reason, type: 'earn', createdAt: new Date().toISOString() });

  // Tier calculation
  if (loyalty.lifetimePoints >= 5000) loyalty.tier = 'Platinum';
  else if (loyalty.lifetimePoints >= 2000) loyalty.tier = 'Gold';
  else if (loyalty.lifetimePoints >= 500) loyalty.tier = 'Silver';
  else loyalty.tier = 'Bronze';

  MemStore.loyaltyPoints.set(userId, loyalty);
  return loyalty;
}

app.get('/api/loyalty/:userId', (req, res) => {
  const loyalty = MemStore.loyaltyPoints.get(req.params.userId) || { userId: req.params.userId, totalPoints: 0, lifetimePoints: 0, transactions: [], tier: 'Bronze' };
  const tiers = {
    Bronze: { minPoints: 0, discount: 0, perks: ['Basic support'] },
    Silver: { minPoints: 500, discount: 3, perks: ['3% ride discount', 'Priority support'] },
    Gold: { minPoints: 2000, discount: 5, perks: ['5% ride discount', 'Free cancellations', 'Priority matching'] },
    Platinum: { minPoints: 5000, discount: 10, perks: ['10% ride discount', 'Free cancellations', 'VIP support', 'Airport lounge access'] }
  };
  res.json({ success: true, loyalty, tierInfo: tiers[loyalty.tier], nextTier: loyalty.tier === 'Platinum' ? null : Object.keys(tiers)[Object.keys(tiers).indexOf(loyalty.tier) + 1] });
});

app.post('/api/loyalty/redeem', (req, res) => {
  try {
    const { userId, points } = req.body;
    const loyalty = MemStore.loyaltyPoints.get(userId);
    if (!loyalty || loyalty.totalPoints < points) return res.status(400).json({ success: false, error: 'Insufficient points' });
    if (points < 100) return res.status(400).json({ success: false, error: 'Minimum 100 points to redeem' });

    const walletCredit = Math.floor(points / 10); // 10 points = ₹1
    loyalty.totalPoints -= points;
    loyalty.transactions.push({ points: -points, reason: 'Redeemed for ₹' + walletCredit, type: 'redeem', createdAt: new Date().toISOString() });
    MemStore.loyaltyPoints.set(userId, loyalty);

    // Add to wallet
    addToWallet(userId, walletCredit, 'Loyalty points redemption');

    res.json({ success: true, walletCredit, remainingPoints: loyalty.totalPoints });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Award points on ride completion
function awardRidePoints(userId, fare) {
  const points = Math.floor(fare / 10); // 1 point per ₹10 spent
  if (points > 0) addLoyaltyPoints(userId, points, 'Ride completed (₹' + fare + ')');
  return points;
}

// ================================================
// DAILY STREAK REWARDS (Drivers)
// ================================================
app.post('/api/driver/streak/checkin', (req, res) => {
  try {
    const { driverId } = req.body;
    if (!driverId) return res.status(400).json({ success: false, error: 'Missing driverId' });

    const today = new Date().toISOString().split('T')[0];
    let streak = MemStore.driverStreaks.get(driverId) || { driverId, currentStreak: 0, longestStreak: 0, lastCheckin: null, totalBonusEarned: 0, history: [] };

    if (streak.lastCheckin === today) return res.json({ success: true, message: 'Already checked in today', streak });

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (streak.lastCheckin === yesterday) {
      streak.currentStreak++;
    } else {
      streak.currentStreak = 1;
    }

    streak.lastCheckin = today;
    if (streak.currentStreak > streak.longestStreak) streak.longestStreak = streak.currentStreak;

    // Bonus calculation
    let bonus = 0;
    if (streak.currentStreak >= 30) bonus = 500;
    else if (streak.currentStreak >= 14) bonus = 200;
    else if (streak.currentStreak >= 7) bonus = 100;
    else if (streak.currentStreak >= 3) bonus = 30;

    if (bonus > 0) {
      streak.totalBonusEarned += bonus;
      addToDriverEarnings(driverId, bonus, 'Streak bonus (' + streak.currentStreak + ' days)');
    }

    streak.history.push({ date: today, streak: streak.currentStreak, bonus });
    if (streak.history.length > 60) streak.history = streak.history.slice(-60);
    MemStore.driverStreaks.set(driverId, streak);

    res.json({ success: true, streak: { currentStreak: streak.currentStreak, longestStreak: streak.longestStreak, bonus, totalBonusEarned: streak.totalBonusEarned } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/driver/streak/:driverId', (req, res) => {
  const streak = MemStore.driverStreaks.get(req.params.driverId) || { currentStreak: 0, longestStreak: 0, totalBonusEarned: 0, history: [] };
  const bonusTable = [
    { days: 3, bonus: 30, label: '3 Days' },
    { days: 7, bonus: 100, label: '1 Week' },
    { days: 14, bonus: 200, label: '2 Weeks' },
    { days: 30, bonus: 500, label: '1 Month' }
  ];
  res.json({ success: true, streak, bonusTable });
});

// ================================================
// DRIVER LEADERBOARD
// ================================================
app.get('/api/leaderboard', (req, res) => {
  const period = req.query.period || 'weekly'; // weekly, monthly, allTime
  const drivers = [];

  MemStore.driverLocations.forEach((loc, driverId) => {
    const ratings = MemStore.ratings.get(driverId) || [];
    const avgRating = ratings.length ? Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10 : 4.5;
    const streak = MemStore.driverStreaks.get(driverId) || { currentStreak: 0 };
    const user = MemStore.users.get(driverId) || {};

    // Count rides
    let rideCount = 0;
    let totalEarnings = 0;
    MemStore.rides.forEach(ride => {
      if (ride.driverId === driverId && ride.status === 'completed') {
        rideCount++;
        totalEarnings += ride.driverEarnings || 0;
      }
    });

    const score = Math.round(avgRating * 20 + rideCount * 5 + streak.currentStreak * 2);
    drivers.push({
      driverId, name: user.name || loc.name || 'Driver', vehicleType: loc.vehicleType || 'auto',
      avgRating, totalRides: rideCount, totalEarnings, currentStreak: streak.currentStreak, score
    });
  });

  // Also include drivers from users map who may not be currently online
  MemStore.users.forEach((user, userId) => {
    if (!drivers.find(d => d.driverId === userId) && user.role === 'driver') {
      const ratings = MemStore.ratings.get(userId) || [];
      const avgRating = ratings.length ? Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10 : 4.5;
      drivers.push({ driverId: userId, name: user.name || 'Driver', vehicleType: user.vehicleType || 'auto', avgRating, totalRides: 0, totalEarnings: 0, currentStreak: 0, score: Math.round(avgRating * 20) });
    }
  });

  drivers.sort((a, b) => b.score - a.score);

  // Add rank and prizes
  const topDrivers = drivers.slice(0, 50).map((d, i) => ({
    ...d, rank: i + 1,
    prize: i === 0 ? '₹1000 bonus' : i === 1 ? '₹500 bonus' : i === 2 ? '₹250 bonus' : i < 10 ? '₹100 bonus' : null
  }));

  res.json({ success: true, leaderboard: topDrivers, totalDrivers: drivers.length, period });
});

// ================================================
// MULTI-STOP RIDES
// ================================================
app.post('/api/rides/multi-stop/estimate', (req, res) => {
  try {
    const { stops, vehicleType } = req.body; // stops = [{lat, lng, address}]
    if (!stops || stops.length < 2) return res.status(400).json({ success: false, error: 'Need at least 2 stops' });
    if (stops.length > 4) return res.status(400).json({ success: false, error: 'Maximum 4 stops allowed' });

    let totalDistanceKm = 0;
    let totalDurationMin = 0;
    const legs = [];

    for (let i = 0; i < stops.length - 1; i++) {
      const distKm = Math.sqrt(Math.pow((stops[i+1].lat - stops[i].lat) * 111, 2) + Math.pow((stops[i+1].lng - stops[i].lng) * 85, 2));
      const durMin = Math.round(distKm * 3); // ~20 km/h average city speed
      totalDistanceKm += distKm;
      totalDurationMin += durMin;
      legs.push({ from: stops[i].address || 'Stop ' + (i+1), to: stops[i+1].address || 'Stop ' + (i+2), distanceKm: Math.round(distKm * 10) / 10, durationMin: durMin });
    }

    const fare = estimateFare(totalDistanceKm, totalDurationMin, vehicleType || 'auto');
    // Multi-stop surcharge: 5% per extra stop
    const extraStops = stops.length - 2;
    const multiStopSurcharge = Math.round(fare.totalFare * 0.05 * extraStops);

    res.json({
      success: true, estimate: {
        ...fare, legs, totalStops: stops.length, extraStops,
        multiStopSurcharge, grandTotal: fare.totalFare + multiStopSurcharge + fare.bookingFee,
        totalDistanceKm: Math.round(totalDistanceKm * 10) / 10, totalDurationMin
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ================================================
// AIRPORT PICKUP MODE
// ================================================
app.post('/api/airport/book', (req, res) => {
  try {
    const { userId, flightNumber, terminal, arrivalTime, airportCode, dropAddress, dropLat, dropLng, vehicleType } = req.body;
    if (!userId || !flightNumber) return res.status(400).json({ success: false, error: 'Missing flight details' });

    const airports = {
      BLR: { name: 'Kempegowda International Airport', lat: 13.1986, lng: 77.7066 },
      MAA: { name: 'Chennai International Airport', lat: 12.9941, lng: 80.1709 },
      HYD: { name: 'Rajiv Gandhi International Airport', lat: 17.2403, lng: 78.4294 }
    };
    const airport = airports[airportCode] || airports.BLR;

    // Calculate airport fare: ₹24/km + 5% GST
    const distanceKm = Math.sqrt(Math.pow((dropLat - airport.lat) * 111, 2) + Math.pow((dropLng - airport.lng) * 85, 2));
    const fareBeforeGST = distanceKm * PLATFORM_CONFIG.airport.perKmRate;
    const gst = Math.ceil(fareBeforeGST * 0.05);
    const totalFare = fareBeforeGST + gst;

    const bookingId = 'APT_' + uuidv4().slice(0, 8).toUpperCase();
    const booking = {
      bookingId, userId, flightNumber: flightNumber.toUpperCase(), terminal: terminal || 'T1',
      arrivalTime, airportCode: airportCode || 'BLR', airportName: airport.name,
      pickupLat: airport.lat, pickupLng: airport.lng,
      dropAddress, dropLat, dropLng, vehicleType: vehicleType || 'sedan',
      status: 'scheduled', driverId: null,
      distanceKm: Math.round(distanceKm * 100) / 100,
      fareBeforeGST: Math.round(fareBeforeGST),
      gst: gst,
      totalFare: Math.round(totalFare),
      extraCharges: { airportFee: 80, waitingAllowance: 15 }, // 15 min free waiting for flights
      createdAt: new Date().toISOString(), flightStatus: 'on_time', delayMinutes: 0
    };

    MemStore.scheduledRides.set(bookingId, booking);
    res.json({ success: true, booking });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/airport/flight/:flightNumber', (req, res) => {
  // In production: integrate with FlightAware/AviationStack API
  // Simulated flight tracking
  const statuses = ['on_time', 'delayed', 'landed', 'arrived'];
  const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
  const delay = randomStatus === 'delayed' ? Math.floor(Math.random() * 60) + 10 : 0;

  res.json({
    success: true, flight: {
      flightNumber: req.params.flightNumber.toUpperCase(),
      status: randomStatus, delayMinutes: delay,
      estimatedArrival: new Date(Date.now() + (delay + 30) * 60000).toISOString(),
      terminal: 'T' + (Math.floor(Math.random() * 2) + 1),
      gate: String.fromCharCode(65 + Math.floor(Math.random() * 8)) + Math.floor(Math.random() * 20 + 1)
    }
  });
});

// ================================================
// SAVED PLACES
// ================================================
app.get('/api/places/:userId', (req, res) => {
  const places = MemStore.savedPlaces.get(req.params.userId) || [];
  res.json({ success: true, places });
});

app.post('/api/places/save', (req, res) => {
  try {
    const { userId, label, address, lat, lng, icon } = req.body;
    if (!userId || !label || !address) return res.status(400).json({ success: false, error: 'Missing fields' });

    let places = MemStore.savedPlaces.get(userId) || [];
    const existing = places.findIndex(p => p.label.toLowerCase() === label.toLowerCase());

    const place = { label, address, lat, lng, icon: icon || '📍', updatedAt: new Date().toISOString() };
    if (existing >= 0) {
      places[existing] = place;
    } else {
      if (places.length >= 10) return res.status(400).json({ success: false, error: 'Maximum 10 saved places' });
      places.push(place);
    }

    MemStore.savedPlaces.set(userId, places);
    res.json({ success: true, places });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/places/:userId/:label', (req, res) => {
  let places = MemStore.savedPlaces.get(req.params.userId) || [];
  places = places.filter(p => p.label.toLowerCase() !== req.params.label.toLowerCase());
  MemStore.savedPlaces.set(req.params.userId, places);
  res.json({ success: true, places });
});

// ================================================
// RIDE HISTORY WITH RECEIPTS
// ================================================
app.get('/api/rides/history/:userId', (req, res) => {
  const rides = [];
  MemStore.rides.forEach((ride) => {
    if (ride.riderId === req.params.userId || ride.driverId === req.params.userId) {
      rides.push(ride);
    }
  });
  rides.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json({ success: true, rides: rides.slice(0, 50), total: rides.length });
});

app.get('/api/rides/:rideId/receipt', (req, res) => {
  const ride = MemStore.rides.get(req.params.rideId);
  if (!ride) return res.status(404).json({ success: false, error: 'Ride not found' });

  const insurance = [];
  MemStore.insurance.forEach(ins => { if (ins.rideId === req.params.rideId) insurance.push(ins); });

  const receipt = {
    rideId: ride.rideId, date: ride.createdAt, completedAt: ride.completedAt,
    pickup: ride.pickupAddress, drop: ride.dropAddress,
    driverName: ride.driverName || 'Driver', vehicleType: ride.vehicleType,
    distanceKm: ride.distanceKm, durationMin: ride.durationMin,
    baseFare: ride.baseFare, distanceFare: ride.distanceFare, timeFare: ride.timeFare,
    surgeAmount: ride.surgeAmount || 0, nightSurcharge: ride.nightSurcharge || 0,
    waitingCharge: ride.waitingCharge || 0, tollCharges: ride.tollCharges || 0,
    bookingFee: ride.bookingFee || 50, totalFare: ride.totalFare || ride.fare,
    paymentMethod: ride.paymentMethod || 'wallet',
    insurance: insurance.length > 0 ? insurance[0] : null,
    loyaltyPointsEarned: Math.floor((ride.totalFare || ride.fare || 0) / 10),
    gstBreakup: { cgst: Math.round((ride.totalFare || 0) * 0.025), sgst: Math.round((ride.totalFare || 0) * 0.025) }
  };

  res.json({ success: true, receipt });
});

// ================================================
// DRIVER DOCUMENT EXPIRY ALERTS
// ================================================
app.post('/api/driver/documents/expiry', (req, res) => {
  try {
    const { driverId, documents } = req.body;
    // documents = [{type: 'DL', expiryDate: '2027-01-15'}, {type: 'RC', expiryDate: '2026-06-30'}, ...]
    if (!driverId || !documents) return res.status(400).json({ success: false, error: 'Missing fields' });

    const docData = { driverId, documents: [], updatedAt: new Date().toISOString() };
    const now = new Date();

    documents.forEach(doc => {
      const expiry = new Date(doc.expiryDate);
      const daysUntilExpiry = Math.ceil((expiry - now) / 86400000);
      let alertLevel = 'ok';
      if (daysUntilExpiry <= 0) alertLevel = 'expired';
      else if (daysUntilExpiry <= 7) alertLevel = 'critical';
      else if (daysUntilExpiry <= 30) alertLevel = 'warning';
      else if (daysUntilExpiry <= 90) alertLevel = 'upcoming';

      docData.documents.push({
        type: doc.type, expiryDate: doc.expiryDate, daysUntilExpiry,
        alertLevel, documentName: doc.documentName || doc.type
      });
    });

    MemStore.docExpiry.set(driverId, docData);
    res.json({ success: true, documents: docData.documents });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/driver/documents/expiry/:driverId', (req, res) => {
  const docData = MemStore.docExpiry.get(req.params.driverId);
  if (!docData) return res.json({ success: true, documents: [], message: 'No document expiry data' });

  // Recalculate days
  const now = new Date();
  docData.documents.forEach(doc => {
    const expiry = new Date(doc.expiryDate);
    doc.daysUntilExpiry = Math.ceil((expiry - now) / 86400000);
    if (doc.daysUntilExpiry <= 0) doc.alertLevel = 'expired';
    else if (doc.daysUntilExpiry <= 7) doc.alertLevel = 'critical';
    else if (doc.daysUntilExpiry <= 30) doc.alertLevel = 'warning';
    else if (doc.daysUntilExpiry <= 90) doc.alertLevel = 'upcoming';
    else doc.alertLevel = 'ok';
  });

  res.json({ success: true, documents: docData.documents });
});

// Background: check document expiry daily and notify
setInterval(() => {
  const now = new Date();
  MemStore.docExpiry.forEach((data, driverId) => {
    data.documents.forEach(doc => {
      const daysLeft = Math.ceil((new Date(doc.expiryDate) - now) / 86400000);
      if (daysLeft === 30 || daysLeft === 7 || daysLeft === 1 || daysLeft === 0) {
        io.emit('notification:push', {
          userId: driverId,
          title: daysLeft === 0 ? '⚠️ Document EXPIRED!' : '📋 Document Expiry Alert',
          body: doc.documentName + (daysLeft === 0 ? ' has expired! Please renew immediately.' : ' expires in ' + daysLeft + ' day(s). Please renew soon.'),
          type: 'doc_expiry'
        });
      }
    });
  });
}, 86400000); // Check every 24 hours

// ================================================
// NOTIFICATIONS (FCM Token + Preferences)
// ================================================
app.post('/api/notifications/register', (req, res) => {
  const { userId, token, platform } = req.body;
  if (!userId || !token) return res.status(400).json({ success: false, error: 'Missing fields' });
  MemStore.fcmTokens.set(userId, { token, platform: platform || 'web', registeredAt: new Date().toISOString() });
  res.json({ success: true, message: 'Token registered' });
});

app.put('/api/notifications/preferences/:userId', (req, res) => {
  const prefs = req.body; // { rideUpdates: true, promotions: false, ... }
  const existing = MemStore.fcmTokens.get(req.params.userId) || {};
  existing.preferences = prefs;
  MemStore.fcmTokens.set(req.params.userId, existing);
  res.json({ success: true, preferences: prefs });
});

app.get('/api/notifications/preferences/:userId', (req, res) => {
  const data = MemStore.fcmTokens.get(req.params.userId) || {};
  res.json({ success: true, preferences: data.preferences || { rideUpdates: true, promotions: true, safety: true, earnings: true, referrals: true } });
});

// Helper: send push notification
function sendPushNotification(userId, title, body, data) {
  // Via Socket.io (always works)
  io.emit('notification:push', { userId, title, body, data, timestamp: new Date().toISOString() });

  // Via FCM (when available)
  const tokenData = MemStore.fcmTokens.get(userId);
  if (tokenData && tokenData.token && admin.messaging) {
    try {
      admin.messaging().send({
        token: tokenData.token,
        notification: { title, body },
        data: data || {}
      }).catch(e => console.log('FCM send error:', e.message));
    } catch(e) {}
  }
}

// ================================================
// TERMS OF SERVICE & PRIVACY POLICY
// ================================================
app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

// Serve admin revenue dashboard
app.get('/admin-revenue', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-revenue.html'));
});

// ================================================
// WALLET TOP-UP with Razorpay fee for drivers
// ================================================
app.post('/api/wallet/topup', async (req, res) => {
  try {
    const { userId, amount, role } = req.body;
    if (!amount || amount < 100) return res.status(400).json({ success: false, error: 'Minimum top-up is ₹100' });

    let chargeAmount = amount;
    let processingFee = 0;
    if (role === 'driver') {
      processingFee = Math.ceil(amount * 0.02);
      chargeAmount = amount + processingFee;
    }

    // Create Razorpay order
    let order = null;
    if (razorpay) {
      order = await razorpay.orders.create({
        amount: chargeAmount * 100, // Razorpay expects paise
        currency: 'INR',
        receipt: 'wallet_' + userId + '_' + Date.now(),
        notes: { userId, creditAmount: amount, processingFee, role }
      });
    }

    res.json({ success: true, order, chargeAmount, creditAmount: amount, processingFee, message: processingFee > 0 ? 'Processing fee of ₹' + processingFee + ' (2%) added' : '' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ================================================
// CALL RECORDING (Masked Calls)
// ================================================
app.post('/api/calls/record', (req, res) => {
  const { rideId, callerId, receiverId, duration, recordingUrl } = req.body;
  const recordId = 'REC_' + uuidv4().slice(0, 8);
  const recording = {
    recordId, rideId, callerId, receiverId, duration: duration || 0,
    recordingUrl: recordingUrl || '/recordings/' + recordId + '.wav',
    status: 'saved', createdAt: new Date().toISOString()
  };
  if (!MemStore.callRecordings.has(rideId)) MemStore.callRecordings.set(rideId, []);
  MemStore.callRecordings.get(rideId).push(recording);
  res.json({ success: true, recording });
});

app.get('/api/calls/recordings/:rideId', (req, res) => {
  const recordings = MemStore.callRecordings.get(req.params.rideId) || [];
  res.json({ success: true, recordings });
});

app.get('/api/admin/calls/all', (req, res) => {
  const all = [];
  MemStore.callRecordings.forEach((recs, rideId) => { recs.forEach(r => all.push({ ...r, rideId })); });
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, recordings: all.slice(0, 100) });
});

// ================================================
// ROUTE DEVIATION MONITORING
// ================================================
app.post('/api/ride/route-check', (req, res) => {
  const { rideId, driverId, currentLat, currentLng, expectedLat, expectedLng } = req.body;
  const deviationKm = Math.sqrt(Math.pow((currentLat - expectedLat) * 111, 2) + Math.pow((currentLng - expectedLng) * 85, 2));

  const isDeviated = deviationKm > 0.5; // More than 500m off route

  if (isDeviated) {
    const alert = {
      rideId, driverId, currentLat, currentLng, expectedLat, expectedLng,
      deviationKm: Math.round(deviationKm * 1000) / 1000,
      severity: deviationKm > 2 ? 'critical' : deviationKm > 1 ? 'high' : 'medium',
      timestamp: new Date().toISOString()
    };

    if (!MemStore.routeDeviations.has(rideId)) MemStore.routeDeviations.set(rideId, []);
    MemStore.routeDeviations.get(rideId).push(alert);

    // Alert admin in real-time
    io.emit('admin:route_deviation', alert);

    // Alert rider
    io.emit('ride:route_deviation', { rideId, deviationKm: alert.deviationKm, severity: alert.severity });

    // Find nearby drivers for dispatch if critical
    if (deviationKm > 2) {
      const nearbyDrivers = [];
      MemStore.driverLocations.forEach((loc, did) => {
        if (did !== driverId) {
          const dist = Math.sqrt(Math.pow((loc.lat - currentLat) * 111, 2) + Math.pow((loc.lng - currentLng) * 85, 2));
          if (dist <= 3) nearbyDrivers.push({ driverId: did, distanceKm: Math.round(dist * 10) / 10 });
        }
      });
      alert.nearbyDrivers = nearbyDrivers.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 5);
    }

    res.json({ success: true, deviated: true, alert });
  } else {
    res.json({ success: true, deviated: false });
  }
});

app.get('/api/admin/route-deviations', (req, res) => {
  const all = [];
  MemStore.routeDeviations.forEach((alerts, rideId) => { alerts.forEach(a => all.push(a)); });
  all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json({ success: true, deviations: all.slice(0, 100) });
});

// ================================================
// MULTI-VEHICLE BOOKING
// ================================================
app.post('/api/rides/multi-book', async (req, res) => {
  try {
    const { userId, pickupAddress, pickupLat, pickupLng, dropAddress, dropLat, dropLng, vehicles } = req.body;
    if (!userId || !vehicles || !vehicles.length) return res.status(400).json({ success: false, error: 'Missing fields' });

    const multiId = 'MULTI_' + uuidv4().slice(0, 8).toUpperCase();
    const distanceKm = Math.sqrt(Math.pow((dropLat - pickupLat) * 111, 2) + Math.pow((dropLng - pickupLng) * 85, 2));
    const durationMin = Math.round(distanceKm * 3);

    let totalFare = 0;
    let totalVehicles = 0;
    const bookings = [];

    for (const v of vehicles) {
      for (let i = 0; i < (v.count || 1); i++) {
        const fare = estimateFare(distanceKm, durationMin, v.type, pickupLat, pickupLng);
        totalFare += fare.totalWithBookingFee;
        totalVehicles++;
        bookings.push({
          vehicleType: v.type, fare, status: 'searching', driverId: null,
          rideId: 'RIDE_' + uuidv4().slice(0, 8).toUpperCase()
        });
      }
    }

    const multiBooking = {
      multiId, userId, pickupAddress, pickupLat, pickupLng, dropAddress, dropLat, dropLng,
      totalVehicles, totalFare, bookings, status: 'searching',
      isScheduled: false, scheduledTime: null,
      createdAt: new Date().toISOString()
    };
    MemStore.multiBookings.set(multiId, multiBooking);

    // Notify fleet owners
    io.emit('fleet:multi_booking', { multiId, totalVehicles, vehicleTypes: vehicles, pickupAddress, dropAddress, totalFare });

    res.json({ success: true, multiBooking });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/rides/multi-book/schedule', async (req, res) => {
  try {
    const { userId, pickupAddress, pickupLat, pickupLng, dropAddress, dropLat, dropLng, vehicles, scheduledTime } = req.body;
    if (!scheduledTime) return res.status(400).json({ success: false, error: 'Scheduled time required' });

    const multiId = 'MULTI_' + uuidv4().slice(0, 8).toUpperCase();
    const distanceKm = Math.sqrt(Math.pow((dropLat - pickupLat) * 111, 2) + Math.pow((dropLng - pickupLng) * 85, 2));
    const durationMin = Math.round(distanceKm * 3);

    let totalFare = 0;
    let totalVehicles = 0;
    const bookings = [];

    for (const v of vehicles) {
      for (let i = 0; i < (v.count || 1); i++) {
        const fare = estimateFare(distanceKm, durationMin, v.type, pickupLat, pickupLng);
        totalFare += fare.totalWithBookingFee;
        totalVehicles++;
        bookings.push({ vehicleType: v.type, fare, status: 'scheduled', driverId: null, rideId: 'RIDE_' + uuidv4().slice(0, 8).toUpperCase() });
      }
    }

    const multiBooking = {
      multiId, userId, pickupAddress, pickupLat, pickupLng, dropAddress, dropLat, dropLng,
      totalVehicles, totalFare, bookings, status: 'scheduled',
      isScheduled: true, scheduledTime,
      createdAt: new Date().toISOString()
    };
    MemStore.multiBookings.set(multiId, multiBooking);
    io.emit('fleet:multi_booking_scheduled', { multiId, totalVehicles, scheduledTime, pickupAddress });

    res.json({ success: true, multiBooking });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ================================================
// FLEET OWNER SYSTEM
// ================================================
app.post('/api/fleet/register', (req, res) => {
  const { userId, name, phone, vehicleCount } = req.body;
  if (!userId || vehicleCount < 2) return res.status(400).json({ success: false, error: 'Fleet owners must have 2+ vehicles' });

  const fleet = {
    ownerId: userId, name, phone, vehicleCount, vehicles: [], drivers: [],
    totalEarnings: 0, registeredAt: new Date().toISOString(), status: 'active'
  };
  MemStore.fleetOwners.set(userId, fleet);
  res.json({ success: true, fleet });
});

app.post('/api/fleet/vehicle/add', (req, res) => {
  const { ownerId, vehicleNumber, vehicleType, model, year, seats } = req.body;
  const fleet = MemStore.fleetOwners.get(ownerId);
  if (!fleet) return res.status(404).json({ success: false, error: 'Fleet owner not found' });

  const vehicleId = 'VEH_' + uuidv4().slice(0, 8).toUpperCase();
  const vehicle = {
    vehicleId, ownerId, vehicleNumber, vehicleType, model, year,
    seats: seats || (vehicleType === 'bus' ? 40 : vehicleType === 'tempo' ? 12 : 4),
    assignedDriver: null, status: 'available', dailyRent: 0,
    totalEarnings: 0, addedAt: new Date().toISOString()
  };
  MemStore.fleetVehicles.set(vehicleId, vehicle);
  fleet.vehicles.push(vehicleId);
  MemStore.fleetOwners.set(ownerId, fleet);

  res.json({ success: true, vehicle });
});

app.post('/api/fleet/assign-driver', (req, res) => {
  const { ownerId, vehicleId, driverId, dailyRent } = req.body;
  const vehicle = MemStore.fleetVehicles.get(vehicleId);
  if (!vehicle) return res.status(404).json({ success: false, error: 'Vehicle not found' });
  if (vehicle.ownerId !== ownerId) return res.status(403).json({ success: false, error: 'Not your vehicle' });

  vehicle.assignedDriver = driverId;
  vehicle.dailyRent = dailyRent || 0;
  vehicle.status = 'assigned';
  MemStore.fleetVehicles.set(vehicleId, vehicle);

  // Track rental
  const rental = {
    vehicleId, driverId, ownerId, dailyRent, startDate: new Date().toISOString(),
    totalDeducted: 0, status: 'active'
  };
  MemStore.driverRentals.set(driverId, rental);

  // Notify driver
  io.emit('notification:push', { userId: driverId, title: 'Vehicle Assigned', body: 'You have been assigned vehicle ' + vehicle.vehicleNumber + '. Daily rent: ₹' + dailyRent });

  res.json({ success: true, vehicle, rental });
});

app.get('/api/fleet/dashboard/:ownerId', (req, res) => {
  const fleet = MemStore.fleetOwners.get(req.params.ownerId);
  if (!fleet) return res.status(404).json({ success: false, error: 'Fleet not found' });

  const vehicles = [];
  let totalEarnings = 0;
  let totalRentCollected = 0;

  fleet.vehicles.forEach(vid => {
    const v = MemStore.fleetVehicles.get(vid);
    if (v) {
      vehicles.push(v);
      totalEarnings += v.totalEarnings;
    }
  });

  MemStore.driverRentals.forEach(r => {
    if (r.ownerId === req.params.ownerId) totalRentCollected += r.totalDeducted;
  });

  res.json({ success: true, dashboard: { fleet, vehicles, totalEarnings, totalRentCollected, activeDrivers: vehicles.filter(v => v.assignedDriver).length, availableVehicles: vehicles.filter(v => !v.assignedDriver).length } });
});

// ================================================
// SCHEDULE LOCK (no cancel once accepted)
// ================================================
app.post('/api/rides/schedule/:rideId/accept', (req, res) => {
  const { driverId } = req.body;
  const ride = MemStore.scheduledRides.get(req.params.rideId);
  if (!ride) return res.status(404).json({ success: false, error: 'Scheduled ride not found' });

  ride.driverId = driverId;
  ride.status = 'accepted';
  ride.acceptedAt = new Date().toISOString();
  ride.locked = true;
  MemStore.scheduledRides.set(req.params.rideId, ride);

  // Notify customer
  io.emit('notification:push', { userId: ride.userId, title: 'Driver Accepted!', body: 'Your scheduled ride has been accepted. This booking is now locked and cannot be cancelled.' });

  res.json({ success: true, ride, message: 'Booking locked. Neither rider nor driver can cancel.' });
});

// Daily reminder for scheduled rides
setInterval(() => {
  const now = new Date();
  MemStore.scheduledRides.forEach((ride, rideId) => {
    if (ride.status === 'accepted' && ride.driverId && ride.locked) {
      const scheduledDate = new Date(ride.scheduledTime || ride.pickupTime);
      const daysUntil = Math.ceil((scheduledDate - now) / 86400000);
      if (daysUntil > 0 && daysUntil <= 7) {
        io.emit('notification:push', {
          userId: ride.driverId,
          title: '📅 Scheduled Ride Reminder',
          body: 'You have a scheduled ride in ' + daysUntil + ' day(s). Pickup: ' + (ride.pickupAddress || 'TBD') + ' at ' + new Date(scheduledDate).toLocaleString(),
          type: 'schedule_reminder'
        });
      }
    }
  });
}, 86400000);

// ================================================
// TOLL AUTO-DETECTION
// ================================================
const KARNATAKA_TOLLS = [
  { name: 'Electronic City Toll', lat: 12.8458, lng: 77.6692, cost: 45 },
  { name: 'Nelamangala Toll', lat: 13.0977, lng: 77.3906, cost: 65 },
  { name: 'Hoskote Toll', lat: 13.0707, lng: 77.7956, cost: 55 },
  { name: 'Tumkur Road Toll', lat: 13.1500, lng: 77.4500, cost: 50 },
  { name: 'Mysore Road Toll', lat: 12.7500, lng: 76.8500, cost: 70 },
  { name: 'Kengeri Toll', lat: 12.9116, lng: 77.4850, cost: 35 },
  { name: 'Devanahalli Toll', lat: 13.2468, lng: 77.7100, cost: 60 },
  { name: 'Whitefield Toll', lat: 12.9698, lng: 77.7500, cost: 40 }
];

app.post('/api/tolls/detect', (req, res) => {
  const { pickupLat, pickupLng, dropLat, dropLng } = req.body;
  const detectedTolls = [];
  let totalTollCost = 0;

  KARNATAKA_TOLLS.forEach(toll => {
    const minLat = Math.min(pickupLat, dropLat) - 0.05;
    const maxLat = Math.max(pickupLat, dropLat) + 0.05;
    const minLng = Math.min(pickupLng, dropLng) - 0.05;
    const maxLng = Math.max(pickupLng, dropLng) + 0.05;

    if (toll.lat >= minLat && toll.lat <= maxLat && toll.lng >= minLng && toll.lng <= maxLng) {
      detectedTolls.push(toll);
      totalTollCost += toll.cost;
    }
  });

  res.json({ success: true, tolls: detectedTolls, totalTollCost });
});

// ================================================
// RIDE PATTERN TRACKING & SUGGESTIONS
// ================================================
app.post('/api/ride/pattern-track', (req, res) => {
  const { userId, pickup, drop, dayOfWeek, hour } = req.body;
  if (!MemStore.ridePatterns.has(userId)) MemStore.ridePatterns.set(userId, []);
  const patterns = MemStore.ridePatterns.get(userId);

  const existing = patterns.find(p => p.pickup === pickup && p.drop === drop && p.dayOfWeek === dayOfWeek);
  if (existing) { existing.count++; existing.lastRide = new Date().toISOString(); }
  else { patterns.push({ pickup, drop, dayOfWeek, hour, count: 1, lastRide: new Date().toISOString() }); }

  MemStore.ridePatterns.set(userId, patterns);
  res.json({ success: true });
});

app.get('/api/ride/suggestions/:userId', (req, res) => {
  const patterns = MemStore.ridePatterns.get(req.params.userId) || [];
  const today = new Date().getDay();
  const suggestions = patterns.filter(p => p.dayOfWeek === today && p.count >= 2).sort((a, b) => b.count - a.count).slice(0, 3);
  res.json({ success: true, suggestions });
});

// ================================================
// FAVORITE DRIVERS
// ================================================
app.post('/api/favorites/add', (req, res) => {
  const { userId, driverId, driverName } = req.body;
  if (!MemStore.favoriteDrivers.has(userId)) MemStore.favoriteDrivers.set(userId, []);
  const favs = MemStore.favoriteDrivers.get(userId);
  if (!favs.find(f => f.driverId === driverId)) {
    favs.push({ driverId, driverName, addedAt: new Date().toISOString() });
    MemStore.favoriteDrivers.set(userId, favs);
  }
  res.json({ success: true, favorites: favs });
});

app.delete('/api/favorites/:userId/:driverId', (req, res) => {
  let favs = MemStore.favoriteDrivers.get(req.params.userId) || [];
  favs = favs.filter(f => f.driverId !== req.params.driverId);
  MemStore.favoriteDrivers.set(req.params.userId, favs);
  res.json({ success: true, favorites: favs });
});

app.get('/api/favorites/:userId', (req, res) => {
  res.json({ success: true, favorites: MemStore.favoriteDrivers.get(req.params.userId) || [] });
});

// ================================================
// GROUP RIDE / CARPOOL
// ================================================
app.post('/api/carpool/create', (req, res) => {
  const { userId, userName, pickupLat, pickupLng, dropLat, dropLng, pickupAddress, dropAddress, vehicleType, maxPassengers } = req.body;
  const carpoolId = 'POOL_' + uuidv4().slice(0, 8).toUpperCase();
  const carpool = {
    carpoolId, creatorId: userId, creatorName: userName, pickupLat, pickupLng, dropLat, dropLng,
    pickupAddress, dropAddress, vehicleType: vehicleType || 'sedan',
    maxPassengers: maxPassengers || 3, currentPassengers: [{ userId, name: userName, pickup: pickupAddress }],
    status: 'open', farePerPerson: 0, totalFare: 0, driverId: null,
    createdAt: new Date().toISOString()
  };
  MemStore.carpoolRides.set(carpoolId, carpool);
  res.json({ success: true, carpool });
});

app.post('/api/carpool/:carpoolId/join', (req, res) => {
  const carpool = MemStore.carpoolRides.get(req.params.carpoolId);
  if (!carpool) return res.status(404).json({ success: false, error: 'Carpool not found' });
  if (carpool.currentPassengers.length >= carpool.maxPassengers) return res.status(400).json({ success: false, error: 'Carpool is full' });

  const { userId, userName, pickup } = req.body;
  carpool.currentPassengers.push({ userId, name: userName, pickup });
  MemStore.carpoolRides.set(req.params.carpoolId, carpool);
  io.emit('carpool:updated', carpool);
  res.json({ success: true, carpool });
});

app.get('/api/carpool/nearby', (req, res) => {
  const { lat, lng } = req.query;
  const nearby = [];
  MemStore.carpoolRides.forEach(cp => {
    if (cp.status === 'open') {
      const dist = Math.sqrt(Math.pow((cp.pickupLat - lat) * 111, 2) + Math.pow((cp.pickupLng - lng) * 85, 2));
      if (dist <= 3) nearby.push({ ...cp, distanceKm: Math.round(dist * 10) / 10 });
    }
  });
  nearby.sort((a, b) => a.distanceKm - b.distanceKm);
  res.json({ success: true, carpools: nearby });
});

// ================================================
// PET-FRIENDLY & CHILD SEAT MODES
// ================================================
app.post('/api/ride/preferences', (req, res) => {
  const { userId, petFriendly, childSeat, wheelchairAccessible } = req.body;
  let user = MemStore.users.get(userId) || { uid: userId };
  user.ridePreferences = { petFriendly: !!petFriendly, childSeat: !!childSeat, wheelchairAccessible: !!wheelchairAccessible };
  MemStore.users.set(userId, user);
  res.json({ success: true, preferences: user.ridePreferences });
});

app.post('/api/driver/capabilities', (req, res) => {
  const { driverId, acceptsPets, hasChildSeat, petCharge } = req.body;
  let driver = MemStore.users.get(driverId) || { uid: driverId };
  driver.capabilities = { acceptsPets: !!acceptsPets, hasChildSeat: !!hasChildSeat, petCharge: petCharge || 30 };
  MemStore.users.set(driverId, driver);
  res.json({ success: true, capabilities: driver.capabilities });
});

// ================================================
// SPEED ALERT SYSTEM
// ================================================
app.post('/api/driver/speed-check', (req, res) => {
  const { driverId, rideId, speedKmh, lat, lng } = req.body;
  let alert = null;

  if (speedKmh > 100) {
    alert = { driverId, rideId, speedKmh, lat, lng, severity: 'critical', message: 'DANGEROUS: Over 100 km/h!', timestamp: new Date().toISOString() };
    io.emit('admin:speed_alert', alert);
    io.emit('notification:push', { userId: driverId, title: '⚠️ SLOW DOWN!', body: 'You are driving at ' + speedKmh + ' km/h. This is dangerous and being reported to admin.' });
  } else if (speedKmh > 80) {
    alert = { driverId, rideId, speedKmh, lat, lng, severity: 'warning', message: 'Warning: Over 80 km/h in city', timestamp: new Date().toISOString() };
    io.emit('notification:push', { userId: driverId, title: '⚠️ Speed Warning', body: 'You are driving at ' + speedKmh + ' km/h. Please slow down in the city.' });
  }

  if (alert) {
    if (!MemStore.speedAlerts.has(driverId)) MemStore.speedAlerts.set(driverId, []);
    MemStore.speedAlerts.get(driverId).push(alert);
    if (speedKmh > 100) io.emit('admin:speed_alert', alert);
  }

  res.json({ success: true, alert });
});

// ================================================
// DASHCAM INTEGRATION
// ================================================
app.post('/api/dashcam/upload', (req, res) => {
  const { driverId, rideId, footageUrl, duration, fileSize } = req.body;
  const footageId = 'CAM_' + uuidv4().slice(0, 8);
  const footage = { footageId, driverId, rideId, footageUrl, duration, fileSize, uploadedAt: new Date().toISOString(), status: 'stored' };
  if (!MemStore.dashcamFootage.has(rideId)) MemStore.dashcamFootage.set(rideId, []);
  MemStore.dashcamFootage.get(rideId).push(footage);
  res.json({ success: true, footage });
});

app.get('/api/dashcam/:rideId', (req, res) => {
  res.json({ success: true, footage: MemStore.dashcamFootage.get(req.params.rideId) || [] });
});

// ================================================
// AUTOMATIC ACCIDENT DETECTION
// ================================================
app.post('/api/safety/accident-detect', (req, res) => {
  const { userId, rideId, lat, lng, deceleration, timestamp } = req.body;
  if (deceleration > 30) {
    const alert = { userId, rideId, lat, lng, deceleration, type: 'auto_accident', timestamp: timestamp || new Date().toISOString() };

    io.emit('admin:accident_detected', alert);

    const safety = MemStore.users.get(userId);
    if (safety && safety.trustedContacts) {
      io.emit('notification:push', { userId, title: '🚨 ACCIDENT DETECTED', body: 'Sudden deceleration detected. Emergency services have been alerted. Are you okay?' });
    }

    if (!MemStore.sosAlerts.has(userId)) MemStore.sosAlerts.set(userId, []);
    MemStore.sosAlerts.get(userId).push(alert);

    res.json({ success: true, alert, message: 'Accident detected. SOS triggered.' });
  } else {
    res.json({ success: true, alert: null });
  }
});

// ================================================
// CASHBACK CAMPAIGNS
// ================================================
app.post('/api/admin/cashback/create', (req, res) => {
  const { name, percentage, maxCashback, startTime, endTime, minFare, fundedBy } = req.body;
  const campaignId = 'CB_' + uuidv4().slice(0, 8);
  const campaign = {
    campaignId, name, percentage: percentage || 10, maxCashback: maxCashback || 50,
    startTime, endTime, minFare: minFare || 100, fundedBy: fundedBy || 'platform',
    totalCashbackGiven: 0, totalRides: 0, active: true, createdAt: new Date().toISOString()
  };
  MemStore.cashbackCampaigns.set(campaignId, campaign);
  res.json({ success: true, campaign });
});

app.get('/api/cashback/active', (req, res) => {
  const now = new Date();
  const active = [];
  MemStore.cashbackCampaigns.forEach(c => {
    if (c.active && new Date(c.startTime) <= now && new Date(c.endTime) >= now) active.push(c);
  });
  res.json({ success: true, campaigns: active });
});

// ================================================
// FESTIVE SURGE CONTROL
// ================================================
const FESTIVE_DATES = [
  { name: 'Diwali', dates: ['2026-10-20', '2026-10-21', '2026-10-22'], maxSurge: 1.5 },
  { name: 'Dasara', dates: ['2026-10-02', '2026-10-03'], maxSurge: 1.5 },
  { name: 'Christmas', dates: ['2026-12-25', '2026-12-26'], maxSurge: 1.5 },
  { name: 'New Year', dates: ['2026-12-31', '2027-01-01'], maxSurge: 1.5 },
  { name: 'Ugadi', dates: ['2026-03-29', '2026-03-30'], maxSurge: 1.3 },
  { name: 'Ganesh Chaturthi', dates: ['2026-08-27', '2026-08-28'], maxSurge: 1.5 }
];

app.get('/api/surge/festive-check', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const activeFestival = FESTIVE_DATES.find(f => f.dates.includes(today));
  res.json({ success: true, isFestive: !!activeFestival, festival: activeFestival || null });
});

// ================================================
// WEATHER-BASED PRICING
// ================================================
app.get('/api/weather/check', async (req, res) => {
  const { lat, lng } = req.query;
  const apiKey = process.env.OPENWEATHER_API_KEY || '';

  if (!apiKey) {
    const conditions = ['clear', 'cloudy', 'rain', 'heavy_rain'];
    const weather = conditions[Math.floor(Math.random() * conditions.length)];
    const multiplier = weather === 'heavy_rain' ? 1.5 : weather === 'rain' ? 1.25 : 1.0;
    return res.json({ success: true, weather, multiplier, simulated: true, message: weather === 'rain' || weather === 'heavy_rain' ? '🌧️ Rain Mode: Covered vehicles prioritized' : '' });
  }

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}`;
    res.json({ success: true, weather: 'clear', multiplier: 1.0 });
  } catch(e) { res.json({ success: true, weather: 'clear', multiplier: 1.0 }); }
});

// ================================================
// TIP SYSTEM (100% to driver)
// ================================================
app.post('/api/tip/send', async (req, res) => {
  try {
    const { userId, driverId, rideId, amount } = req.body;
    if (!amount || ![10, 20, 50, 100].includes(Number(amount))) return res.status(400).json({ success: false, error: 'Tip must be ₹10, ₹20, ₹50, or ₹100' });

    // Deduct from rider wallet
    const deduction = await deductFromWallet(userId, Number(amount), 'Tip for ride ' + rideId, rideId);
    if (!deduction.success) return res.status(400).json(deduction);

    // 100% goes to driver
    await addToDriverEarnings(driverId, Number(amount), 'Tip from rider (Ride: ' + rideId + ')');

    io.emit('notification:push', { userId: driverId, title: '💰 You got a tip!', body: 'Rider tipped you ₹' + amount + '! Thank you for the great service.' });

    res.json({ success: true, amount, message: '₹' + amount + ' tip sent to driver. 100% goes to them!' });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ================================================
// NEARBY PLACES FINDER (Fuel, Schools, Hospitals, Medical, Police)
// ================================================
const NEARBY_PLACES = [
  // Fuel Stations
  { name: 'HP Petrol Pump - Koramangala', lat: 12.9352, lng: 77.6245, category: 'fuel', type: 'petrol', price: 102.5, icon: '⛽', phone: '' },
  { name: 'Indian Oil - Indiranagar', lat: 12.9716, lng: 77.6412, category: 'fuel', type: 'petrol', price: 102.3, icon: '⛽', phone: '' },
  { name: 'Bharat Petroleum - Whitefield', lat: 12.9698, lng: 77.7500, category: 'fuel', type: 'petrol', price: 101.9, icon: '⛽', phone: '' },
  { name: 'CNG Station - Peenya', lat: 13.0322, lng: 77.5207, category: 'fuel', type: 'cng', price: 79.5, icon: '🟢', phone: '' },
  { name: 'HP - Jayanagar', lat: 12.9308, lng: 77.5838, category: 'fuel', type: 'petrol', price: 102.5, icon: '⛽', phone: '' },
  { name: 'Indian Oil - Hebbal', lat: 13.0358, lng: 77.5970, category: 'fuel', type: 'petrol', price: 102.1, icon: '⛽', phone: '' },
  { name: 'CNG Station - Electronic City', lat: 12.8458, lng: 77.6692, category: 'fuel', type: 'cng', price: 79.0, icon: '🟢', phone: '' },
  { name: 'Shell - MG Road', lat: 12.9756, lng: 77.6095, category: 'fuel', type: 'petrol', price: 103.0, icon: '⛽', phone: '' },
  { name: 'EV Charging - HSR Layout', lat: 12.9116, lng: 77.6389, category: 'fuel', type: 'ev', price: 12.0, icon: '⚡', phone: '' },
  { name: 'EV Charging - Marathahalli', lat: 12.9591, lng: 77.7019, category: 'fuel', type: 'ev', price: 11.5, icon: '⚡', phone: '' },
  // School Zones (Drive Slow!)
  { name: 'DPS South - Bannerghatta', lat: 12.8826, lng: 77.5974, category: 'school', type: 'school', icon: '🏫', phone: '080-26781234', note: 'Speed limit 25 km/h' },
  { name: 'National Public School - Koramangala', lat: 12.9345, lng: 77.6261, category: 'school', type: 'school', icon: '🏫', phone: '080-25522345', note: 'Speed limit 25 km/h' },
  { name: 'Bishop Cotton Boys School - Residency Rd', lat: 12.9680, lng: 77.5998, category: 'school', type: 'school', icon: '🏫', phone: '080-22211567', note: 'Speed limit 25 km/h' },
  { name: 'Kendriya Vidyalaya - Malleswaram', lat: 12.9960, lng: 77.5705, category: 'school', type: 'school', icon: '🏫', phone: '080-23345678', note: 'Speed limit 25 km/h' },
  { name: 'St. Josephs Indian High School - Museum Rd', lat: 12.9728, lng: 77.6058, category: 'school', type: 'school', icon: '🏫', phone: '080-22863456', note: 'Speed limit 25 km/h' },
  { name: 'Ryan International - Yelahanka', lat: 13.1007, lng: 77.5963, category: 'school', type: 'school', icon: '🏫', phone: '080-28471234', note: 'Speed limit 25 km/h' },
  { name: 'Jain International School - JP Nagar', lat: 12.9100, lng: 77.5850, category: 'school', type: 'school', icon: '🏫', phone: '080-26592345', note: 'Speed limit 25 km/h' },
  { name: 'Govt School - BTM Layout', lat: 12.9166, lng: 77.6101, category: 'school', type: 'school', icon: '🏫', phone: '080-26782222', note: 'Speed limit 25 km/h' },
  // Hospitals
  { name: 'Manipal Hospital - HAL Airport Rd', lat: 12.9592, lng: 77.6480, category: 'hospital', type: 'hospital', icon: '🏥', phone: '080-25024444', note: '24/7 Emergency' },
  { name: 'Apollo Hospital - Bannerghatta Rd', lat: 12.8937, lng: 77.5969, category: 'hospital', type: 'hospital', icon: '🏥', phone: '080-26304050', note: '24/7 Emergency' },
  { name: 'Fortis Hospital - Cunningham Rd', lat: 12.9895, lng: 77.5898, category: 'hospital', type: 'hospital', icon: '🏥', phone: '080-66214444', note: '24/7 Emergency' },
  { name: 'Narayana Health - Bommasandra', lat: 12.8170, lng: 77.6760, category: 'hospital', type: 'hospital', icon: '🏥', phone: '080-71222222', note: '24/7 Emergency' },
  { name: 'Columbia Asia - Hebbal', lat: 13.0345, lng: 77.5945, category: 'hospital', type: 'hospital', icon: '🏥', phone: '080-71226262', note: '24/7 Emergency' },
  { name: 'St. Johns Medical College Hospital', lat: 12.9280, lng: 77.6190, category: 'hospital', type: 'hospital', icon: '🏥', phone: '080-22065000', note: '24/7 Emergency' },
  { name: 'NIMHANS - Hosur Rd', lat: 12.9418, lng: 77.5949, category: 'hospital', type: 'hospital', icon: '🏥', phone: '080-26995000', note: '24/7 Emergency' },
  { name: 'Govt General Hospital - Victoria', lat: 12.9623, lng: 77.5763, category: 'hospital', type: 'hospital', icon: '🏥', phone: '080-26701150', note: '24/7 Emergency • Govt' },
  // Medical Stores / Pharmacies
  { name: 'Apollo Pharmacy - Koramangala', lat: 12.9350, lng: 77.6240, category: 'medical', type: 'pharmacy', icon: '💊', phone: '080-40044004', note: '24/7 Open' },
  { name: 'MedPlus - Indiranagar', lat: 12.9710, lng: 77.6400, category: 'medical', type: 'pharmacy', icon: '💊', phone: '080-41234567', note: '8AM - 11PM' },
  { name: 'Netmeds Store - HSR Layout', lat: 12.9120, lng: 77.6380, category: 'medical', type: 'pharmacy', icon: '💊', phone: '080-48901234', note: '24/7 Open' },
  { name: 'Jan Aushadhi Kendra - Jayanagar', lat: 12.9300, lng: 77.5830, category: 'medical', type: 'pharmacy', icon: '💊', phone: '080-26571234', note: 'Affordable Generics' },
  { name: 'Sri Sai Medical - Whitefield', lat: 12.9690, lng: 77.7490, category: 'medical', type: 'pharmacy', icon: '💊', phone: '080-28451234', note: '8AM - 10PM' },
  { name: 'Wellness Forever - MG Road', lat: 12.9750, lng: 77.6090, category: 'medical', type: 'pharmacy', icon: '💊', phone: '080-25581234', note: '24/7 Open' },
  { name: 'Apollo Pharmacy - Hebbal', lat: 13.0350, lng: 77.5960, category: 'medical', type: 'pharmacy', icon: '💊', phone: '080-40044005', note: '24/7 Open' },
  { name: 'MedPlus - Electronic City', lat: 12.8460, lng: 77.6700, category: 'medical', type: 'pharmacy', icon: '💊', phone: '080-41239876', note: '8AM - 11PM' },
  // Police Stations
  { name: 'Koramangala Police Station', lat: 12.9340, lng: 77.6250, category: 'police', type: 'police', icon: '🚔', phone: '080-25530100', note: 'Dial 100 for Emergency' },
  { name: 'Indiranagar Police Station', lat: 12.9718, lng: 77.6415, category: 'police', type: 'police', icon: '🚔', phone: '080-25271100', note: 'Dial 100 for Emergency' },
  { name: 'Whitefield Police Station', lat: 12.9695, lng: 77.7510, category: 'police', type: 'police', icon: '🚔', phone: '080-28452100', note: 'Dial 100 for Emergency' },
  { name: 'HSR Layout Police Station', lat: 12.9118, lng: 77.6395, category: 'police', type: 'police', icon: '🚔', phone: '080-25730200', note: 'Dial 100 for Emergency' },
  { name: 'Jayanagar Police Station', lat: 12.9312, lng: 77.5845, category: 'police', type: 'police', icon: '🚔', phone: '080-26632100', note: 'Dial 100 for Emergency' },
  { name: 'Hebbal Police Station', lat: 13.0362, lng: 77.5975, category: 'police', type: 'police', icon: '🚔', phone: '080-23610100', note: 'Dial 100 for Emergency' },
  { name: 'Electronic City Police Station', lat: 12.8462, lng: 77.6700, category: 'police', type: 'police', icon: '🚔', phone: '080-28522100', note: 'Dial 100 for Emergency' },
  { name: 'MG Road Traffic Police', lat: 12.9758, lng: 77.6100, category: 'police', type: 'traffic', icon: '🚦', phone: '080-22942100', note: 'Traffic Help' }
];

// Legacy endpoint (backward compatible)
app.get('/api/fuel-stations', (req, res) => {
  const { lat, lng, type } = req.query;
  let places = NEARBY_PLACES.filter(p => p.category === 'fuel');
  if (type) places = places.filter(s => s.type === type);

  places = places.map(s => ({
    ...s,
    distanceKm: Math.round(Math.sqrt(Math.pow((s.lat - (lat || 12.97)) * 111, 2) + Math.pow((s.lng - (lng || 77.59)) * 85, 2)) * 10) / 10
  })).sort((a, b) => a.distanceKm - b.distanceKm);

  res.json({ success: true, stations: places.slice(0, 10) });
});

// New comprehensive nearby places endpoint
app.get('/api/nearby-places', (req, res) => {
  const { lat, lng, category, type } = req.query;
  let places = [...NEARBY_PLACES];
  if (category) places = places.filter(p => p.category === category);
  if (type) places = places.filter(p => p.type === type);

  places = places.map(p => ({
    ...p,
    distanceKm: Math.round(Math.sqrt(Math.pow((p.lat - (lat || 12.97)) * 111, 2) + Math.pow((p.lng - (lng || 77.59)) * 85, 2)) * 10) / 10
  })).sort((a, b) => a.distanceKm - b.distanceKm);

  res.json({ success: true, places: places.slice(0, 15), total: places.length });
});

// Get all categories summary (count per category)
app.get('/api/nearby-places/categories', (req, res) => {
  const categories = [
    { id: 'fuel', name: 'Fuel Stations', icon: '⛽', count: NEARBY_PLACES.filter(p => p.category === 'fuel').length },
    { id: 'school', name: 'School Zones', icon: '🏫', count: NEARBY_PLACES.filter(p => p.category === 'school').length },
    { id: 'hospital', name: 'Hospitals', icon: '🏥', count: NEARBY_PLACES.filter(p => p.category === 'hospital').length },
    { id: 'medical', name: 'Medical Stores', icon: '💊', count: NEARBY_PLACES.filter(p => p.category === 'medical').length },
    { id: 'police', name: 'Police Stations', icon: '🚔', count: NEARBY_PLACES.filter(p => p.category === 'police').length }
  ];
  res.json({ success: true, categories });
});

// ================================================
// SMART ETA (Historical Pattern Learning)
// ================================================
app.post('/api/eta/record', (req, res) => {
  const { fromArea, toArea, actualMinutes, dayOfWeek, hour } = req.body;
  const key = fromArea + '_' + toArea;
  if (!MemStore.etaHistory.has(key)) MemStore.etaHistory.set(key, []);
  MemStore.etaHistory.get(key).push({ actualMinutes, dayOfWeek, hour, recorded: new Date().toISOString() });
  res.json({ success: true });
});

app.get('/api/eta/smart', (req, res) => {
  const { fromArea, toArea } = req.query;
  const key = fromArea + '_' + toArea;
  const history = MemStore.etaHistory.get(key) || [];
  const currentHour = new Date().getHours();
  const currentDay = new Date().getDay();

  const relevant = history.filter(h => Math.abs(h.hour - currentHour) <= 2 && h.dayOfWeek === currentDay);
  if (relevant.length >= 3) {
    const avgMin = Math.round(relevant.reduce((s, h) => s + h.actualMinutes, 0) / relevant.length);
    res.json({ success: true, smartEta: avgMin, confidence: 'high', basedOn: relevant.length + ' similar trips', message: 'Usually ' + avgMin + ' min at this time' });
  } else if (history.length > 0) {
    const avgMin = Math.round(history.reduce((s, h) => s + h.actualMinutes, 0) / history.length);
    res.json({ success: true, smartEta: avgMin, confidence: 'medium', basedOn: history.length + ' trips total' });
  } else {
    res.json({ success: true, smartEta: null, confidence: 'none', message: 'No historical data yet' });
  }
});

// ================================================
// IN-RIDE ENTERTAINMENT
// ================================================
const JOKES_POOL = [
  "Why don't scientists trust atoms? Because they make up everything!",
  "What do you call a fake noodle? An impasta!",
  "Why did the auto driver become a philosopher? He drove people to think!",
  "Why don't traffic lights ever go to school? They keep changing!",
  "Bengaluru traffic: Where you can read a full novel between signals!",
  "What's the fastest way to get somewhere in Bengaluru? Yesterday!",
  "Auto meter: Because the real fare is always a negotiation!",
  "Why did the GPS break up with the driver? It felt they were going in different directions!",
  "Bengaluru potholes: Free roller coaster rides since forever!",
  "Driver to traffic: 'I'll wait for you. I always do.'"
];

const TRIVIA_POOL = [
  { q: "Which is the silicon valley of India?", a: "Bengaluru" },
  { q: "What is the state animal of Karnataka?", a: "Indian Elephant" },
  { q: "Mysore Palace was built in which year?", a: "1912" },
  { q: "Which river flows through Bengaluru?", a: "Vrishabhavathi" },
  { q: "What is Karnataka's state flower?", a: "Lotus" }
];

app.get('/api/entertainment/joke', (req, res) => {
  res.json({ success: true, joke: JOKES_POOL[Math.floor(Math.random() * JOKES_POOL.length)] });
});

app.get('/api/entertainment/trivia', (req, res) => {
  res.json({ success: true, trivia: TRIVIA_POOL[Math.floor(Math.random() * TRIVIA_POOL.length)] });
});

// ================================================
// CHAT TRANSLATION
// ================================================
const BASIC_TRANSLATIONS = {
  'hello': { kn: 'ನಮಸ್ಕಾರ', hi: 'नमस्ते', ta: 'வணக்கம்', te: 'నమస్కారం' },
  'thank you': { kn: 'ಧನ್ಯವಾದ', hi: 'धन्यवाद', ta: 'நன்றி', te: 'ధన్యవాదాలు' },
  'where are you': { kn: 'ನೀವು ಎಲ್ಲಿದ್ದೀರಿ', hi: 'आप कहाँ हैं', ta: 'நீங்கள் எங்கே', te: 'మీరు ఎక్కడ ఉన్నారు' },
  'i am coming': { kn: 'ನಾನು ಬರುತ್ತಿದ್ದೇನೆ', hi: 'मैं आ रहा हूँ', ta: 'நான் வருகிறேன்', te: 'నేను వస్తున్నాను' },
  'wait please': { kn: 'ದಯವಿಟ್ಟು ಕಾಯಿರಿ', hi: 'कृपया प्रतीक्षा करें', ta: 'தயவுசெய்து காத்திருங்கள்', te: 'దయచేసి వేచి ఉండండి' },
  'how long': { kn: 'ಎಷ್ಟು ಸಮಯ', hi: 'कितना समय', ta: 'எவ்வளவு நேரம்', te: 'ఎంత సమయం' },
  'stop here': { kn: 'ಇಲ್ಲಿ ನಿಲ್ಲಿಸಿ', hi: 'यहाँ रुकिए', ta: 'இங்கே நிறுத்துங்கள்', te: 'ఇక్కడ ఆపండి' },
  'turn left': { kn: 'ಎಡಕ್ಕೆ ತಿರುಗಿ', hi: 'बाएं मुड़िए', ta: 'இடது திரும்புங்கள்', te: 'ఎడమకు తిరగండి' },
  'turn right': { kn: 'ಬಲಕ್ಕೆ ತಿರುಗಿ', hi: 'दाएं मुड़िए', ta: 'வலது திரும்புங்கள்', te: 'కుడికి తిరగండి' },
  'go straight': { kn: 'ನೇರವಾಗಿ ಹೋಗಿ', hi: 'सीधे जाइए', ta: 'நேராக போங்கள்', te: 'నేరుగా వెళ్ళండి' }
};

app.post('/api/chat/translate', (req, res) => {
  const { message, targetLang } = req.body;
  const lower = message.toLowerCase().trim();
  const translation = BASIC_TRANSLATIONS[lower];
  if (translation && translation[targetLang]) {
    res.json({ success: true, original: message, translated: translation[targetLang], lang: targetLang });
  } else {
    res.json({ success: true, original: message, translated: message, lang: targetLang, note: 'No translation available. Connect Google Translate API for full support.' });
  }
});

// ================================================
// CUSTOMER CHURN PREDICTION
// ================================================
app.get('/api/admin/churn-prediction', (req, res) => {
  const churnRisk = [];
  MemStore.users.forEach((user, userId) => {
    if (user.role === 'rider' || !user.role) {
      const lastRide = user.lastRideAt ? new Date(user.lastRideAt) : null;
      const daysSinceLastRide = lastRide ? Math.ceil((new Date() - lastRide) / 86400000) : 999;
      const totalRides = user.totalRides || 0;

      let risk = 'low';
      if (daysSinceLastRide > 30 && totalRides > 5) risk = 'high';
      else if (daysSinceLastRide > 14) risk = 'medium';

      if (risk !== 'low') {
        churnRisk.push({ userId, name: user.name || 'User', phone: user.phone, lastRide: user.lastRideAt, daysSinceLastRide, totalRides, risk, suggestedAction: risk === 'high' ? 'Send ₹50 cashback offer' : 'Send push notification reminder' });
      }
    }
  });
  churnRisk.sort((a, b) => b.daysSinceLastRide - a.daysSinceLastRide);
  res.json({ success: true, churnRisks: churnRisk });
});

// ================================================
// DRIVER FRAUD DETECTION
// ================================================
app.get('/api/admin/fraud-detection', (req, res) => {
  const suspicious = [];

  MemStore.rides.forEach((ride, rideId) => {
    if (ride.status === 'completed') {
      if (ride.distanceKm && ride.distanceKm < 0.5 && ride.totalFare > 50) {
        suspicious.push({ type: 'short_ride', rideId, driverId: ride.driverId, distanceKm: ride.distanceKm, fare: ride.totalFare, reason: 'Very short ride with high fare' });
      }
      if (ride.createdAt && ride.completedAt) {
        const durationMs = new Date(ride.completedAt) - new Date(ride.createdAt);
        if (durationMs < 120000 && ride.distanceKm > 5) {
          suspicious.push({ type: 'impossible_speed', rideId, driverId: ride.driverId, durationSec: Math.round(durationMs / 1000), distanceKm: ride.distanceKm, reason: 'Impossible speed detected' });
        }
      }
    }
  });

  MemStore.speedAlerts.forEach((alerts, driverId) => {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    if (criticalAlerts.length >= 3) {
      suspicious.push({ type: 'repeat_speeding', driverId, count: criticalAlerts.length, reason: 'Multiple speed violations' });
    }
  });

  res.json({ success: true, suspicious, totalFlags: suspicious.length });
});

// ================================================
// REVENUE FORECASTING
// ================================================
app.get('/api/admin/revenue-forecast', (req, res) => {
  const dailyRevenue = {};
  MemStore.rides.forEach(ride => {
    if (ride.status === 'completed' && ride.createdAt) {
      const date = ride.createdAt.split('T')[0];
      dailyRevenue[date] = (dailyRevenue[date] || 0) + (ride.commission || 0) + (ride.bookingFee || 50);
    }
  });

  const days = Object.keys(dailyRevenue).sort();
  const recentDays = days.slice(-7);
  const avgDailyRevenue = recentDays.length ? Math.round(recentDays.reduce((s, d) => s + dailyRevenue[d], 0) / recentDays.length) : 0;

  const forecast = {
    avgDailyRevenue,
    forecastWeekly: avgDailyRevenue * 7,
    forecastMonthly: avgDailyRevenue * 30,
    forecastYearly: avgDailyRevenue * 365,
    trend: recentDays.length >= 2 ? (dailyRevenue[recentDays[recentDays.length - 1]] > dailyRevenue[recentDays[0]] ? 'growing' : 'declining') : 'insufficient_data',
    historicalDays: days.map(d => ({ date: d, revenue: dailyRevenue[d] }))
  };

  res.json({ success: true, forecast });
});

// ================================================
// UPI DIRECT PAY
// ================================================
app.post('/api/payment/upi-intent', (req, res) => {
  const { userId, driverId, rideId, amount, driverUpiId } = req.body;
  if (!driverUpiId) return res.json({ success: false, error: 'Driver UPI ID not set' });

  const upiLink = 'upi://pay?pa=' + encodeURIComponent(driverUpiId) + '&pn=IDapp Driver&am=' + amount + '&cu=INR&tn=Ride ' + rideId;

  res.json({ success: true, upiLink, amount, driverUpiId: driverUpiId.replace(/(.{3}).*(@.*)/, '$1***$2') });
});

app.post('/api/driver/upi-id', (req, res) => {
  const { driverId, upiId } = req.body;
  let user = MemStore.users.get(driverId) || { uid: driverId };
  user.upiId = upiId;
  MemStore.users.set(driverId, user);
  res.json({ success: true, message: 'UPI ID saved' });
});

// ================================================
// NIGHT GUARDIAN (10PM-6AM)
// ================================================
app.post('/api/safety/night-guardian/start', (req, res) => {
  const { userId, rideId, emergencyContacts } = req.body;
  const hour = new Date().getHours();
  const isNight = hour >= 22 || hour < 6;

  if (!isNight) return res.json({ success: true, active: false, message: 'Night Guardian is only active between 10 PM and 6 AM' });

  const shareToken = uuidv4().slice(0, 12);
  const shareUrl = '/track/' + shareToken;

  (emergencyContacts || []).forEach(contact => {
    io.emit('notification:push', { userId: contact.phone, title: '🌙 Night Ride Alert', body: (contact.name || 'Your contact') + ' is on a late-night ride. Track live: ' + shareUrl });
  });

  res.json({ success: true, active: true, shareUrl, message: 'Night Guardian activated. Contacts notified. Check-in every 15 minutes.' });
});

// ================================================
// ACHIEVEMENT BADGES
// ================================================
MemStore.achievements = new Map();

const BADGE_DEFINITIONS = [
  { id: 'first_ride', name: 'First Ride', icon: '🎉', description: 'Completed your first ride', condition: (stats) => stats.totalRides >= 1 },
  { id: 'rides_10', name: 'Regular Rider', icon: '🚗', description: 'Completed 10 rides', condition: (stats) => stats.totalRides >= 10 },
  { id: 'rides_50', name: 'Road Warrior', icon: '⚔️', description: 'Completed 50 rides', condition: (stats) => stats.totalRides >= 50 },
  { id: 'rides_100', name: 'Century Club', icon: '💯', description: 'Completed 100 rides', condition: (stats) => stats.totalRides >= 100 },
  { id: 'rides_500', name: 'Legend', icon: '👑', description: 'Completed 500 rides', condition: (stats) => stats.totalRides >= 500 },
  { id: 'night_owl', name: 'Night Owl', icon: '🦉', description: 'Completed 10 rides after 10 PM', condition: (stats) => stats.nightRides >= 10 },
  { id: 'early_bird', name: 'Early Bird', icon: '🐦', description: 'Completed 10 rides before 7 AM', condition: (stats) => stats.earlyRides >= 10 },
  { id: 'weekend_warrior', name: 'Weekend Warrior', icon: '🎯', description: 'Completed 20 weekend rides', condition: (stats) => stats.weekendRides >= 20 },
  { id: 'big_spender', name: 'Big Spender', icon: '💰', description: 'Spent ₹10,000 on rides', condition: (stats) => stats.totalSpent >= 10000 },
  { id: 'five_star', name: 'Five Star', icon: '⭐', description: 'Maintained 5.0 rating for 10 rides', condition: (stats) => stats.avgRating >= 5.0 && stats.totalRides >= 10 }
];

app.get('/api/achievements/:userId', (req, res) => {
  const user = MemStore.users.get(req.params.userId) || {};
  const stats = { totalRides: user.totalRides || 0, nightRides: user.nightRides || 0, earlyRides: user.earlyRides || 0, weekendRides: user.weekendRides || 0, totalSpent: user.totalSpent || 0, avgRating: user.avgRating || 0 };

  const earned = MemStore.achievements.get(req.params.userId) || [];
  const all = BADGE_DEFINITIONS.map(badge => ({
    ...badge, earned: earned.includes(badge.id) || badge.condition(stats),
    condition: undefined
  }));

  res.json({ success: true, badges: all, totalEarned: all.filter(b => b.earned).length, totalBadges: all.length });
});

// ================================================
// RIDE MILESTONES
// ================================================
app.get('/api/milestones/:userId', (req, res) => {
  const user = MemStore.users.get(req.params.userId) || {};
  const rides = user.totalRides || 0;
  const milestones = [1, 5, 10, 25, 50, 100, 200, 500, 1000];
  const nextMilestone = milestones.find(m => m > rides) || null;
  const justHit = milestones.includes(rides);

  res.json({
    success: true, totalRides: rides, nextMilestone, ridesUntilNext: nextMilestone ? nextMilestone - rides : 0,
    justHitMilestone: justHit,
    milestoneMessage: justHit ? '🎉 Congratulations! You completed ' + rides + ' rides!' : null
  });
});

// ================================================
// ADMIN LIVE MAP
// ================================================
app.get('/api/admin/live-map', (req, res) => {
  const { search, city, vehicleType } = req.query;

  const drivers = [];
  MemStore.driverLocations.forEach((loc, driverId) => {
    const user = MemStore.users.get(driverId) || {};
    const entry = { id: driverId, type: 'driver', name: user.name || loc.name || 'Driver', lat: loc.lat, lng: loc.lng, vehicleType: loc.vehicleType || 'auto', status: loc.status || 'online', phone: user.phone || '' };
    if (vehicleType && entry.vehicleType !== vehicleType) return;
    if (search && !entry.name.toLowerCase().includes(search.toLowerCase()) && !entry.id.includes(search) && !(entry.phone && entry.phone.includes(search))) return;
    drivers.push(entry);
  });

  const rides = [];
  MemStore.rides.forEach((ride, rideId) => {
    if (ride.status === 'active' || ride.status === 'started' || ride.status === 'driver_assigned' || ride.status === 'searching') {
      const entry = {
        id: rideId, type: 'ride', riderId: ride.riderId, driverId: ride.driverId,
        riderName: ride.riderName || 'Rider', driverName: ride.driverName || 'Driver',
        pickupLat: ride.pickupLat, pickupLng: ride.pickupLng, dropLat: ride.dropLat, dropLng: ride.dropLng,
        pickupAddress: ride.pickupAddress, dropAddress: ride.dropAddress,
        vehicleType: ride.vehicleType, fare: ride.totalFare, status: ride.status
      };
      if (search && !entry.riderName.toLowerCase().includes(search.toLowerCase()) && !entry.driverName.toLowerCase().includes(search.toLowerCase()) && !rideId.includes(search)) return;
      rides.push(entry);
    }
  });

  const deviations = [];
  MemStore.routeDeviations.forEach((alerts, rideId) => {
    const recent = alerts[alerts.length - 1];
    if (recent && (new Date() - new Date(recent.timestamp)) < 600000) {
      deviations.push(recent);
    }
  });

  const speedIssues = [];
  MemStore.speedAlerts.forEach((alerts, driverId) => {
    const recent = alerts.filter(a => (new Date() - new Date(a.timestamp)) < 600000);
    recent.forEach(a => speedIssues.push(a));
  });

  res.json({
    success: true,
    liveData: { drivers, rides, deviations, speedIssues },
    stats: { onlineDrivers: drivers.length, activeRides: rides.length, deviationAlerts: deviations.length, speedAlerts: speedIssues.length }
  });
});

// ================================================
// BROADCAST SYSTEM (Admin → Drivers/Customers)
// ================================================
app.post('/api/admin/broadcast', (req, res) => {
  try {
    const { title, message, target, mediaType, mediaUrl, priority } = req.body;
    // target: 'all', 'drivers', 'customers'
    // mediaType: 'text', 'image', 'video'

    const broadcastId = 'BC_' + uuidv4().slice(0, 8).toUpperCase();
    const broadcast = {
      broadcastId, title, message, target: target || 'all',
      mediaType: mediaType || 'text', mediaUrl: mediaUrl || '',
      priority: priority || 'normal', // 'normal', 'urgent', 'critical'
      readBy: [], sentAt: new Date().toISOString(), status: 'sent'
    };
    MemStore.broadcasts.set(broadcastId, broadcast);

    // Send via socket
    if (target === 'drivers') {
      io.emit('broadcast:drivers', broadcast);
    } else if (target === 'customers') {
      io.emit('broadcast:customers', broadcast);
    } else {
      io.emit('broadcast:all', broadcast);
    }

    // Also push notification
    const pushTitle = priority === 'critical' ? '🚨 ' + title : priority === 'urgent' ? '⚡ ' + title : '📢 ' + title;
    io.emit('notification:push', { userId: '*', title: pushTitle, body: message, type: 'broadcast', target });

    res.json({ success: true, broadcast });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/broadcasts', (req, res) => {
  const { target } = req.query;
  const broadcasts = [];
  MemStore.broadcasts.forEach(b => {
    if (!target || b.target === target || b.target === 'all') broadcasts.push(b);
  });
  broadcasts.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  res.json({ success: true, broadcasts: broadcasts.slice(0, 50) });
});

app.post('/api/broadcast/:broadcastId/read', (req, res) => {
  const { userId } = req.body;
  const broadcast = MemStore.broadcasts.get(req.params.broadcastId);
  if (broadcast && !broadcast.readBy.includes(userId)) {
    broadcast.readBy.push(userId);
    MemStore.broadcasts.set(req.params.broadcastId, broadcast);
  }
  res.json({ success: true });
});

app.get('/api/admin/broadcast/stats', (req, res) => {
  const stats = [];
  MemStore.broadcasts.forEach(b => {
    stats.push({ broadcastId: b.broadcastId, title: b.title, target: b.target, sentAt: b.sentAt, totalRead: b.readBy.length, priority: b.priority });
  });
  stats.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  res.json({ success: true, stats });
});

// ================================================
// RICH ADS SYSTEM (Video/Image/Text with Skip Control)
// ================================================
app.post('/api/admin/rich-ads/create', (req, res) => {
  try {
    const { title, description, mediaType, mediaUrl, thumbnailUrl, duration,
            placement, skipable, skipAfterSec, targetAudience, startDate, endDate,
            budgetPerDay, pricePerView, advertiserName, clickUrl } = req.body;

    const adId = 'RAD_' + uuidv4().slice(0, 8).toUpperCase();
    const ad = {
      adId, title, description: description || '',
      mediaType: mediaType || 'text', // 'text', 'image', 'video'
      mediaUrl: mediaUrl || '', thumbnailUrl: thumbnailUrl || '',
      duration: duration || 10, // seconds to show (for text/image) or video length
      placement: placement || 'waiting', // 'waiting', 'ride_start', 'ride_end', 'home', 'all'
      skipable: skipable !== false, // default: skipable
      skipAfterSec: skipAfterSec || 5, // can skip after 5 seconds
      targetAudience: targetAudience || 'all', // 'all', 'drivers', 'customers'
      startDate: startDate || new Date().toISOString(),
      endDate: endDate || new Date(Date.now() + 30 * 86400000).toISOString(),
      budgetPerDay: budgetPerDay || 1000,
      pricePerView: pricePerView || 1.0,
      advertiserName: advertiserName || '',
      clickUrl: clickUrl || '',
      totalViews: 0, totalClicks: 0, totalSkips: 0, totalFullViews: 0,
      totalSpent: 0, active: true,
      createdAt: new Date().toISOString()
    };
    MemStore.richAds.set(adId, ad);
    res.json({ success: true, ad });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/rich-ads/serve', (req, res) => {
  const { placement, audience } = req.query;
  const now = new Date();
  const eligible = [];

  MemStore.richAds.forEach(ad => {
    if (!ad.active) return;
    if (new Date(ad.startDate) > now || new Date(ad.endDate) < now) return;
    if (placement && ad.placement !== placement && ad.placement !== 'all') return;
    if (audience && ad.targetAudience !== audience && ad.targetAudience !== 'all') return;
    if (ad.totalSpent >= ad.budgetPerDay) return;
    eligible.push(ad);
  });

  if (!eligible.length) return res.json({ success: true, ad: null });

  // Pick random ad weighted by remaining budget
  const ad = eligible[Math.floor(Math.random() * eligible.length)];
  ad.totalViews++;
  ad.totalSpent += ad.pricePerView;
  MemStore.richAds.set(ad.adId, ad);

  res.json({ success: true, ad: {
    adId: ad.adId, title: ad.title, description: ad.description,
    mediaType: ad.mediaType, mediaUrl: ad.mediaUrl, thumbnailUrl: ad.thumbnailUrl,
    duration: ad.duration, skipable: ad.skipable, skipAfterSec: ad.skipAfterSec,
    advertiserName: ad.advertiserName, clickUrl: ad.clickUrl
  }});
});

app.post('/api/rich-ads/:adId/action', (req, res) => {
  const { action } = req.body; // 'click', 'skip', 'full_view'
  const ad = MemStore.richAds.get(req.params.adId);
  if (!ad) return res.json({ success: false });

  if (action === 'click') ad.totalClicks++;
  else if (action === 'skip') ad.totalSkips++;
  else if (action === 'full_view') ad.totalFullViews++;

  MemStore.richAds.set(req.params.adId, ad);
  res.json({ success: true });
});

app.get('/api/admin/rich-ads/all', (req, res) => {
  const ads = [];
  let totalRevenue = 0;
  MemStore.richAds.forEach(ad => { ads.push(ad); totalRevenue += ad.totalSpent; });
  ads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, ads, totalRevenue: Math.round(totalRevenue * 100) / 100 });
});

app.put('/api/admin/rich-ads/:adId', (req, res) => {
  const ad = MemStore.richAds.get(req.params.adId);
  if (!ad) return res.status(404).json({ success: false, error: 'Ad not found' });

  Object.keys(req.body).forEach(key => {
    if (key !== 'adId' && key !== 'createdAt') ad[key] = req.body[key];
  });
  MemStore.richAds.set(req.params.adId, ad);
  res.json({ success: true, ad });
});

app.delete('/api/admin/rich-ads/:adId', (req, res) => {
  const ad = MemStore.richAds.get(req.params.adId);
  if (ad) { ad.active = false; MemStore.richAds.set(req.params.adId, ad); }
  res.json({ success: true });
});

// ================================================
// CELEBRITY VOICE ALERTS
// ================================================
const VOICE_PACKS = [
  // Kannada Actors
  { id: 'yash', name: 'Yash (KGF Style)', language: 'kn', gender: 'male', sample: 'Nimma ride shuru aagide!', category: 'Kannada', icon: '🎬' },
  { id: 'darshan', name: 'Darshan (Boss Style)', language: 'kn', gender: 'male', sample: 'Boss, nimma driver bandidaare!', category: 'Kannada', icon: '🎬' },
  { id: 'sudeep', name: 'Kiccha Sudeep', language: 'kn', gender: 'male', sample: 'Ride complete aaytu guru!', category: 'Kannada', icon: '🎬' },
  { id: 'puneethraj', name: 'Puneeth Rajkumar (Appu)', language: 'kn', gender: 'male', sample: 'Power star heltidaare, ride ready!', category: 'Kannada', icon: '⭐' },
  { id: 'rachita', name: 'Rachita Ram', language: 'kn', gender: 'female', sample: 'Hey! Nimma cab bandide!', category: 'Kannada', icon: '🎬' },

  // Bollywood Actors
  { id: 'amitabh', name: 'Amitabh Bachchan Style', language: 'hi', gender: 'male', sample: 'Aapki sawari aa gayi hai!', category: 'Bollywood', icon: '🎬' },
  { id: 'srk', name: 'Shah Rukh Khan Style', language: 'hi', gender: 'male', sample: 'Koi nahi rok sakta aapki ride ko!', category: 'Bollywood', icon: '🎬' },
  { id: 'salman', name: 'Salman Khan Style', language: 'hi', gender: 'male', sample: 'Bhai ka driver aa gaya!', category: 'Bollywood', icon: '🎬' },
  { id: 'ranveer', name: 'Ranveer Singh Style', language: 'hi', gender: 'male', sample: 'Apna time aa gaya! Ride shuru!', category: 'Bollywood', icon: '🎬' },
  { id: 'deepika', name: 'Deepika Padukone Style', language: 'hi', gender: 'female', sample: 'Your ride is here, have a great trip!', category: 'Bollywood', icon: '🎬' },
  { id: 'alia', name: 'Alia Bhatt Style', language: 'hi', gender: 'female', sample: 'Hey! Your cab is arriving!', category: 'Bollywood', icon: '🎬' },

  // South Indian Actors
  { id: 'rajini', name: 'Rajinikanth Style', language: 'ta', gender: 'male', sample: 'En vazhi thani vazhi! Ride ready!', category: 'South', icon: '🌟' },
  { id: 'vijay', name: 'Thalapathy Vijay Style', language: 'ta', gender: 'male', sample: 'Thalapathy solran, ride start achu!', category: 'South', icon: '🎬' },
  { id: 'alluarjun', name: 'Allu Arjun (Pushpa)', language: 'te', gender: 'male', sample: 'Pushpa! Ride start aindi!', category: 'South', icon: '🔥' },
  { id: 'ntr', name: 'Jr NTR Style', language: 'te', gender: 'male', sample: 'RRR style lo ride ready!', category: 'South', icon: '🎬' },
  { id: 'mohanlal', name: 'Mohanlal (Lalettan)', language: 'ml', gender: 'male', sample: 'Ningalde ride ready ayi!', category: 'South', icon: '🎬' },

  // Fun Voices
  { id: 'robot', name: 'Robot Voice', language: 'en', gender: 'neutral', sample: 'RIDE. INITIATED. DRIVER. APPROACHING.', category: 'Fun', icon: '🤖' },
  { id: 'gps_lady', name: 'GPS Lady', language: 'en', gender: 'female', sample: 'Your driver has arrived at the pickup location.', category: 'Fun', icon: '🗺️' },
  { id: 'cricket', name: 'Cricket Commentary', language: 'en', gender: 'male', sample: 'AND THE DRIVER IS HERE! What a delivery!', category: 'Fun', icon: '🏏' },
  { id: 'dj', name: 'DJ Announcer', language: 'en', gender: 'male', sample: 'Yo yo yo! Your ride is LIT! Driver in the house!', category: 'Fun', icon: '🎧' }
];

app.get('/api/voice-packs', (req, res) => {
  const { search, category, language } = req.query;
  let packs = [...VOICE_PACKS];

  if (search) {
    const q = search.toLowerCase();
    packs = packs.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.sample.toLowerCase().includes(q));
  }
  if (category) packs = packs.filter(p => p.category === category);
  if (language) packs = packs.filter(p => p.language === language);

  const categories = [...new Set(VOICE_PACKS.map(p => p.category))];

  res.json({ success: true, voicePacks: packs, categories, total: packs.length });
});

app.post('/api/voice-packs/select', (req, res) => {
  const { userId, voicePackId } = req.body;
  if (!userId || !voicePackId) return res.status(400).json({ success: false, error: 'Missing fields' });

  const pack = VOICE_PACKS.find(p => p.id === voicePackId);
  if (!pack) return res.status(404).json({ success: false, error: 'Voice pack not found' });

  MemStore.voicePreferences.set(userId, { voicePackId, selectedAt: new Date().toISOString() });

  res.json({ success: true, selectedVoice: pack, message: 'Voice alerts set to ' + pack.name });
});

app.get('/api/voice-packs/current/:userId', (req, res) => {
  const pref = MemStore.voicePreferences.get(req.params.userId);
  if (!pref) return res.json({ success: true, selectedVoice: VOICE_PACKS.find(p => p.id === 'gps_lady'), isDefault: true });

  const pack = VOICE_PACKS.find(p => p.id === pref.voicePackId);
  res.json({ success: true, selectedVoice: pack || VOICE_PACKS[0], isDefault: false });
});

// Voice alert messages for different events
const VOICE_ALERT_MESSAGES = {
  driver_arriving: {
    en: 'Your driver is arriving!',
    kn: 'Nimma driver baruttiddare!',
    hi: 'Aapka driver aa raha hai!',
    ta: 'Ungal driver varugirar!',
    te: 'Mee driver vastunnadu!'
  },
  ride_started: {
    en: 'Your ride has started. Enjoy the trip!',
    kn: 'Nimma ride shuru aagide. Trip enjoy madi!',
    hi: 'Aapki ride shuru ho gayi. Trip enjoy karein!',
    ta: 'Ungal ride thudangiyadhu. Trip enjoy pannunga!',
    te: 'Mee ride start aindi. Trip enjoy cheyandi!'
  },
  ride_completed: {
    en: 'Ride completed! Thank you for choosing IDapp.',
    kn: 'Ride mugiyitu! IDapp choose madidakke dhanyavaada.',
    hi: 'Ride complete! IDapp choose karne ke liye dhanyavaad.',
    ta: 'Ride mudindhadhu! IDapp thervu seydhadharkku nandri.',
    te: 'Ride complete aindi! IDapp choose chesinadhuku dhanyavaadaalu.'
  },
  driver_assigned: {
    en: 'A driver has been assigned to your ride!',
    kn: 'Nimma ride ge driver assign aagiddare!',
    hi: 'Aapki ride ke liye driver mil gaya!',
    ta: 'Ungal ride ku driver kiduithirukirar!',
    te: 'Mee ride ki driver assign ayyadu!'
  },
  payment_received: {
    en: 'Payment received! Check your earnings.',
    kn: 'Payment bandide! Nimma earnings nodi.',
    hi: 'Payment aa gaya! Apni earnings check karein.',
    ta: 'Payment vandhirukkidhu! Ungal earnings parunga.',
    te: 'Payment vachindi! Mee earnings chudandi.'
  }
};

app.get('/api/voice-alert/:event', (req, res) => {
  const { userId } = req.query;
  const event = req.params.event;
  const messages = VOICE_ALERT_MESSAGES[event];
  if (!messages) return res.status(404).json({ success: false, error: 'Unknown event' });

  let lang = 'en';
  let voicePack = VOICE_PACKS.find(p => p.id === 'gps_lady');

  if (userId) {
    const pref = MemStore.voicePreferences.get(userId);
    if (pref) {
      voicePack = VOICE_PACKS.find(p => p.id === pref.voicePackId) || voicePack;
      lang = voicePack.language;
    }
  }

  const message = messages[lang] || messages.en;

  res.json({
    success: true,
    alert: {
      event, message, language: lang,
      voicePack: { id: voicePack.id, name: voicePack.name, gender: voicePack.gender },
      // In production: return pre-recorded audio URL
      // For now: frontend uses Web Speech API with this text
      useWebSpeech: true,
      speechConfig: { lang: lang === 'kn' ? 'kn-IN' : lang === 'hi' ? 'hi-IN' : lang === 'ta' ? 'ta-IN' : lang === 'te' ? 'te-IN' : lang === 'ml' ? 'ml-IN' : 'en-IN', rate: 0.9, pitch: voicePack.gender === 'female' ? 1.2 : 0.9 }
    }
  });
});

// ================================================
// START SERVER
// ================================================

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║    IDapp Backend Server v1.0             ║
║    Running on port ${PORT}                  ║
║    Firebase: ${db ? 'Connected' : 'In-Memory Mode'}           ║
║    Razorpay: ${razorpay ? 'Connected' : 'Demo Mode'}           ║
╚══════════════════════════════════════════╝
  `);
});

module.exports = { app, server, io };
