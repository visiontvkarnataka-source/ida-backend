// RapidAPI + IDfy KYC Verification Module
// Uses IDfy PAN Card Verification API via RapidAPI
// Free tier: 35 requests/month

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const RAPIDAPI_HOST = 'pan-card-verification1.p.rapidapi.com';
const RAPIDAPI_URL = 'https://' + RAPIDAPI_HOST + '/v3/tasks/sync/verify_with_source/ind_pan';

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function verifyPAN(panNumber) {
  const resp = await fetch(RAPIDAPI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-rapidapi-host': RAPIDAPI_HOST,
      'x-rapidapi-key': RAPIDAPI_KEY
    },
    body: JSON.stringify({
      task_id: generateId(),
      group_id: generateId(),
      data: { id_number: panNumber.toUpperCase() }
    })
  });
  return resp.json();
}

async function surepassCompatCall(endpoint, body) {
  var idNumber = body.id_number || '';
  if (endpoint.indexOf('pan') !== -1) {
    var result = await verifyPAN(idNumber);
    if (result && result.status === 'completed' && result.result) {
      var src = result.result.source_output || result.result || {};
      return { status_code: 200, success: true, data: { full_name: src.name_on_card || src.full_name || '', pan_number: idNumber.toUpperCase(), category: src.category || src.type || 'individual', valid: true } };
    } else {
      return { status_code: 422, success: false, message: (result && result.message) || 'PAN verification failed', message_code: 'invalid_pan' };
    }
  }
  if (endpoint.indexOf('aadhaar') !== -1) {
    return { status_code: 200, success: true, message_code: 'format_only', data: { aadhaar_number: idNumber, valid: /^[2-9]\\d{11}$/.test(idNumber), message: 'Aadhaar verified by format only (RapidAPI supports PAN only)' } };
  }
  throw new Error('Document type not supported. Endpoint: ' + endpoint);
}

function isConfigured() { return !!RAPIDAPI_KEY; }

module.exports = { verifyPAN, surepassCompatCall, isConfigured };
