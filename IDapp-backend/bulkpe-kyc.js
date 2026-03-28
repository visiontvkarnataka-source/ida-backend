// Bulkpe KYC Verification Module
// Uses Bulkpe Verification Stack API for PAN & Aadhaar verification
// Docs: https://docs.bulkpe.in

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

// Verify PAN number via Bulkpe
async function verifyPAN(panNumber) {
  const result = await bulkpeRequest('/verifyPanLite', { pan: panNumber.toUpperCase() });
  return result;
}

// Request Aadhaar OTP via Bulkpe (Step 1)
async function requestAadhaarOTP(aadhaarNumber) {
  const result = await bulkpeRequest('/verifyAadhar', { aadhaar: aadhaarNumber });
  return result;
}

// Verify Aadhaar OTP via Bulkpe (Step 2)
async function verifyAadhaarOTP(refId, otp) {
  const result = await bulkpeRequest('/verifyAadharOtp', { ref_id: refId, otp: otp });
  return result;
}

// Surepass-compatible wrapper - maps Surepass API calls to Bulkpe
// This lets us drop-in replace surepassCall() without changing server.js logic
async function surepassCompatCall(endpoint, body) {
  const idNumber = body.id_number || '';

  // PAN verification
  if (endpoint.indexOf('pan') !== -1) {
    const result = await verifyPAN(idNumber);
    // Bulkpe PAN response: { status: true/false, data: { name, pan, ... } }
    if (result && (result.status === true || result.success === true)) {
      return {
        status_code: 200,
        success: true,
        data: {
          full_name: (result.data && result.data.name) || (result.data && result.data.full_name) || '',
          pan_number: idNumber.toUpperCase(),
          category: (result.data && result.data.category) || (result.data && result.data.type) || '',
          valid: true
        }
      };
    } else {
      return {
        status_code: 422,
        success: false,
        message: (result && result.message) || 'PAN verification failed',
        message_code: 'invalid_pan'
      };
    }
  }

  // Aadhaar verification (initiates OTP)
  if (endpoint.indexOf('aadhaar') !== -1) {
    const result = await requestAadhaarOTP(idNumber);
    if (result && (result.status === true || result.success === true) && result.data && result.data.ref_id) {
      // OTP sent successfully - return partial success
      return {
        status_code: 200,
        success: true,
        data: {
          ref_id: result.data.ref_id,
          message: 'OTP sent to Aadhaar-linked mobile',
          otp_sent: true,
          aadhaar_last4: idNumber.slice(-4)
        }
      };
    } else {
      return {
        status_code: 422,
        success: false,
        message: (result && result.message) || 'Aadhaar verification failed - could not send OTP',
        message_code: 'aadhaar_otp_failed'
      };
    }
  }

  // Unsupported doc types via Bulkpe
  throw new Error('Document type not supported by Bulkpe. Endpoint: ' + endpoint);
}

function isConfigured() {
  return !!BULKPE_TOKEN;
}

module.exports = {
  verifyPAN,
  requestAadhaarOTP,
  verifyAadhaarOTP,
  surepassCompatCall,
  isConfigured
};
