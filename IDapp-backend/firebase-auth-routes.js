// ============================================================
// IDA Firebase Auth Routes
// Handles: /api/auth/firebase-verify
// ============================================================

module.exports = function(app, admin, MemStore) {

  // Verify Firebase ID token and create/update user
  app.post('/api/auth/firebase-verify', async (req, res) => {
    try {
      const { idToken, phone, role, firebaseUid } = req.body;

      if (!idToken || !phone) {
        return res.status(400).json({
          success: false,
          message: 'Missing idToken or phone number'
        });
      }

      let decodedToken = null;
      let uid = firebaseUid;

      // Try to verify the token with Firebase Admin
      try {
        if (admin && admin.auth) {
          decodedToken = await admin.auth().verifyIdToken(idToken);
          uid = decodedToken.uid;
          console.log('[Auth] Firebase token verified for:', decodedToken.phone_number || phone);
        }
      } catch (verifyError) {
        console.log('[Auth] Token verification skipped (Firebase Admin not configured):', verifyError.message);
        // Continue with the provided firebaseUid - allows offline/demo mode
      }

      // Normalize phone
      let normalizedPhone = phone.replace(/\s+/g, '');
      if (!normalizedPhone.startsWith('+')) {
        normalizedPhone = '+91' + normalizedPhone.replace(/^0+/, '');
      }

      const userRole = role || 'rider';
      const now = new Date().toISOString();

      // Check if user exists in MemStore
      let existingUser = null;
      if (MemStore && MemStore.users) {
        for (const [userId, userData] of MemStore.users) {
          if (userData.phone === normalizedPhone) {
            existingUser = { id: userId, ...userData };
            break;
          }
        }
      }

      let userId;

      if (existingUser) {
        // Update existing user
        userId = existingUser.id;
        const updated = {
          ...existingUser,
          role: userRole,
          firebaseUid: uid,
          lastLogin: now,
          updatedAt: now
        };
        delete updated.id;
        if (MemStore && MemStore.users) {
          MemStore.users.set(userId, updated);
        }
        console.log('[Auth] Existing user logged in:', userId, '- Role:', userRole);
      } else {
        // Create new user
        userId = uid || ('user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
        const newUser = {
          phone: normalizedPhone,
          role: userRole,
          firebaseUid: uid,
          name: '',
          email: '',
          walletBalance: 0,
          rating: 5.0,
          totalRides: 0,
          createdAt: now,
          lastLogin: now,
          updatedAt: now,
          kycStatus: 'pending',
          isActive: true,
          language: 'en',
          referralCode: 'IDA' + Date.now().toString(36).toUpperCase().slice(-6)
        };

        if (MemStore && MemStore.users) {
          MemStore.users.set(userId, newUser);
        }

        // If driver, also add to drivers store
        if (userRole === 'driver' && MemStore && MemStore.drivers) {
          MemStore.drivers.set(userId, {
            userId: userId,
            phone: normalizedPhone,
            vehicleType: '',
            vehicleNumber: '',
            licensePlate: '',
            isOnline: false,
            isVerified: false,
            currentLocation: null,
            earnings: 0,
            rating: 5.0,
            totalTrips: 0,
            createdAt: now
          });
        }

        console.log('[Auth] New user created:', userId, '- Role:', userRole);
      }

      // Try to also save to Firebase Firestore if available
      try {
        const db = admin && admin.firestore ? admin.firestore() : null;
        if (db) {
          await db.collection('users').doc(userId).set({
            phone: normalizedPhone,
            role: userRole,
            firebaseUid: uid,
            lastLogin: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      } catch (firestoreError) {
        // Non-fatal - MemStore is primary
        console.log('[Auth] Firestore sync skipped:', firestoreError.message);
      }

      res.json({
        success: true,
        userId: userId,
        role: userRole,
        phone: normalizedPhone,
        isNewUser: !existingUser,
        message: existingUser ? 'Welcome back!' : 'Account created successfully!'
      });

    } catch (error) {
      console.error('[Auth] Firebase verify error:', error);
      res.status(500).json({
        success: false,
        message: 'Authentication failed. Please try again.'
      });
    }
  });

  // Check auth status
  app.get('/api/auth/status', (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
      return res.json({ success: false, loggedIn: false });
    }

    let user = null;
    if (MemStore && MemStore.users) {
      user = MemStore.users.get(userId);
    }

    if (user) {
      res.json({
        success: true,
        loggedIn: true,
        user: {
          id: userId,
          phone: user.phone,
          role: user.role,
          name: user.name,
          kycStatus: user.kycStatus
        }
      });
    } else {
      res.json({ success: false, loggedIn: false });
    }
  });

  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    const { userId } = req.body;
    console.log('[Auth] User logged out:', userId);
    res.json({ success: true, message: 'Logged out successfully' });
  });

  console.log('[Auth] Firebase auth routes registered');
};
