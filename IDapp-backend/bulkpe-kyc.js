// Bulkpe KYC Verification Integration
// Docs: https://docs.bulkpe.in/verification-stack

const BULKPE_BASE = 'https://api.bulkpe.in/client';
const BULKPE_TOKEN = process.env.BULKPE_API_KEY || '';

async function bulkpeRequest(endpoint, body) {
  const resp = await fetch(BULKPE_BASE + endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + BULKPE_TOKEN
    },
    body: JSON.stringify(body)
  });
  return resp.json();
}

// Verify PAN card
async function verifyPAN(panNumber) {
  try {
    const result = await bulkpeRequest('/verifyPanLite', { pan: panNumber });
    if (result.status && result.data && result.data.valid) {
      return {
        success: true,
        verified: true,
        data: {
          pan: result.data.pan,
          name: result.data.registered_name || result.data.name_pan_card,
          type: result.data.type,
          status: result.data.pan_status,
          aadhaar_linked: result.data.aadhaar_seeding_status === 'Y'
        },
        method: 'bulkpe_api'
      };
    }
    return {
      success: false,
      verified: false,
      error: result.message || 'PAN verification failed',
      method: 'bulkpe_api'
    };
  } catch (err) {
    return { success: false, verified: false, error: err.message, method: 'bulkpe_api_error' };
  }
}

// Request Aadhaar OTP
async function requestAadhaarOTP(aadhaarNumber) {
  try {
    const result = await bulkpeRequest('/verifyAadhar', { aadhaar: aadhaarNumber });
    if (result.status && result.data && result.data.ref_id) {
      return {
        success: true,
        ref_id: result.data.ref_id,
        message: 'OTP sent to Aadhaar-linked mobile'
      };
    }
    return {
      success: false,
      error: result.message || 'Failed to send Aadhaar OTP'
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Verify Aadhaar OTP
async function verifyAadhaarOTP(refId, otp) {
  try {
    const result = await bulkpeRequest('/verifyAadharOtp', { ref_id: refId, otp: otp });
    if (result.status && result.data && result.data.status === 'VALID') {
      return {
        success: true,
        verified: true,
        data: {
          name: result.data.name,
          dob: result.data.dob,
          gender: result.data.gender,
          address: result.data.address,
          photo: result.data.photo_link
        },
        method: 'bulkpe_api'
      };
    }
    return {
      success: false,
      verified: false,
      error: result.message || 'Aadhaar OTP verification failed',
      method: 'bulkpe_api'
    };
  } catch (err) {
    return { success: false, verified: false, error: err.message, method: 'bulkpe_api_error' };
  }
}

module.exports = {
  verifyPAN,
  requestAadhaarOTP,
  verifyAadhaarOTP,
  isConfigured: function() { return !!BULKPE_TOKEN; }
};
