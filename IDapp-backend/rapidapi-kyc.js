// RapidAPI + IDfy KYC Verification Module
// Uses IDfy PAN, DL, and RC Verification APIs via RapidAPI
// Free tier: 35-40 requests/month per API

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';

// API endpoints
const PAN_HOST = 'pan-card-verification1.p.rapidapi.com';
const PAN_URL = 'https://' + PAN_HOST + '/v3/tasks/sync/verify_with_source/ind_pan';

const DL_HOST = 'driving-license-verification.p.rapidapi.com';
const DL_URL = 'https://' + DL_HOST + '/v3/tasks/async/verify_with_source/ind_driving_license';

const RC_HOST = 'vehicle-rc-verification.p.rapidapi.com';
const RC_URL = 'https://' + RC_HOST + '/v3/tasks/async/verify_with_source/ind_rc_basic';

function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function verifyPAN(panNumber) {
  var resp = await fetch(PAN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-rapidapi-host': PAN_HOST, 'x-rapidapi-key': RAPIDAPI_KEY },
    body: JSON.stringify({ task_id: generateId(), group_id: generateId(), data: { id_number: panNumber.toUpperCase() } })
  });
  return resp.json();
}

async function verifyDL(dlNumber) {
  var resp = await fetch(DL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-rapidapi-host': DL_HOST, 'x-rapidapi-key': RAPIDAPI_KEY },
    body: JSON.stringify({ task_id: generateId(), group_id: generateId(), data: { id_number: dlNumber.toUpperCase() } })
  });
  var result = await resp.json();
  if (result && result.request_id && !result.result) {
    await new Promise(function(r) { setTimeout(r, 3000); });
    var pollResp = await fetch('https://' + DL_HOST + '/v3/tasks?request_id=' + result.request_id, { method: 'GET', headers: { 'Content-Type': 'application/json', 'x-rapidapi-host': DL_HOST, 'x-rapidapi-key': RAPIDAPI_KEY } });
    result = await pollResp.json();
    if (Array.isArray(result) && result.length > 0) result = result[0];
  }
  return result;
}

async function verifyRC(rcNumber) {
  var resp = await fetch(RC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-rapidapi-host': RC_HOST, 'x-rapidapi-key': RAPIDAPI_KEY },
    body: JSON.stringify({ task_id: generateId(), group_id: generateId(), data: { rc_number: rcNumber.toUpperCase() } })
  });
  var result = await resp.json();
  if (result && result.request_id && !result.result) {
    await new Promise(function(r) { setTimeout(r, 3000); });
    var pollResp = await fetch('https://' + RC_HOST + '/v3/tasks?request_id=' + result.request_id, { method: 'GET', headers: { 'Content-Type': 'application/json', 'x-rapidapi-host': RC_HOST, 'x-rapidapi-key': RAPIDAPI_KEY } });
    result = await pollResp.json();
    if (Array.isArray(result) && result.length > 0) result = result[0];
  }
  return result;
}

async function surepassCompatCall(endpoint, body) {
  var idNumber = body.id_number || '';
  if (endpoint.indexOf('pan') !== -1) {
    var result = await verifyPAN(idNumber);
    if (result && result.status === 'completed' && result.result) {
      var src = result.result.source_output || result.result || {};
      return { status_code: 200, success: true, data: { full_name: src.name_on_card || src.full_name || '', pan_number: idNumber.toUpperCase(), category: src.category || src.type || 'individual', valid: true } };
    } else { return { status_code: 422, success: false, message: (result && result.message) || 'PAN verification failed', message_code: 'invalid_pan' }; }
  }
  if (endpoint.indexOf('license') !== -1 || endpoint.indexOf('driving') !== -1 || endpoint.indexOf('dl') !== -1) {
    var result = await verifyDL(idNumber);
    if (result && (result.status === 'completed' || (result.result && result.result.source_output))) {
      var src = result.result ? (result.result.source_output || result.result) : {};
      return { status_code: 200, success: true, data: { full_name: src.name || src.holder_name || '', license_number: idNumber.toUpperCase(), dob: src.dob || src.date_of_birth || '', validity: src.validity || {}, vehicle_classes: src.vehicle_classes || src.cov_details || [], valid: true } };
    } else { return { status_code: 422, success: false, message: (result && result.message) || 'DL verification failed', message_code: 'invalid_dl' }; }
  }
  if (endpoint.indexOf('rc') !== -1 || endpoint.indexOf('vehicle') !== -1) {
    var rcNumber = idNumber || body.rc_number || '';
    var result = await verifyRC(rcNumber);
    if (result && (result.status === 'completed' || (result.result && result.result.source_output))) {
      var src = result.result ? (result.result.source_output || result.result) : {};
      return { status_code: 200, success: true, data: { owner_name: src.owner_name || src.current_owner_name || '', registration_number: rcNumber.toUpperCase(), vehicle_class: src.vehicle_class || '', fuel_type: src.fuel_type || '', maker_model: src.maker_model || src.maker_description || '', fitness_upto: src.fitness_upto || '', insurance_upto: src.insurance_upto || '', valid: true } };
    } else { return { status_code: 422, success: false, message: (result && result.message) || 'RC verification failed', message_code: 'invalid_rc' }; }
  }
  if (endpoint.indexOf('aadhaar') !== -1) {
    return { status_code: 200, success: true, message_code: 'format_only', data: { aadhaar_number: idNumber, valid: /^[2-9]\\d{11}$/.test(idNumber), message: 'Aadhaar verified by format only (RapidAPI supports PAN/DL/RC)' } };
  }
  throw new Error('Document type not supported. Endpoint: ' + endpoint);
}

function isConfigured() { return !!RAPIDAPI_KEY; }

module.exports = { verifyPAN, verifyDL, verifyRC, surepassCompatCall, isConfigured };
