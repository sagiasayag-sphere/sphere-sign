// =====================================================
// Sphere Sign v2 — Google Apps Script Backend
// Client: form POST via hidden iframe
// Server: HtmlService + window.top.postMessage (bypasses CORS)
// =====================================================

var FOLDER_ID = '';
var SIGNED_FOLDER_ID = '';
var NOTIFY_EMAIL = 'sagi@sphere-ifs.co.il';
var SEND_EMAIL = true;

// =====================================================
// doPost
// =====================================================
function doPost(e) {
  var result;
  var reqId = '';
  try {
    var raw = '';
    if (e && e.parameter && e.parameter.payload) {
      raw = e.parameter.payload;
    } else if (e && e.postData && e.postData.contents) {
      raw = e.postData.contents;
    }
    if (!raw) {
      result = { success: false, error: 'No data received' };
      return _respond(result, reqId);
    }

    var data = JSON.parse(raw);
    reqId = data._reqId || '';
    var action = data.action || '';

    if (action === 'upload') {
      result = handleUpload(data);
    } else if (action === 'fetch') {
      result = handleFetch(data);
    } else if (action === 'signed') {
      result = handleSigned(data);
    } else {
      result = { success: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { success: false, error: String(err) };
  }

  return _respond(result, reqId);
}

// =====================================================
// doGet — health check
// =====================================================
function doGet(e) {
  var reqId = '';
  if (e && e.parameter && e.parameter._reqId) reqId = e.parameter._reqId;
  return _respond({ success: true, status: 'ok' }, reqId);
}

// =====================================================
// Return HTML with window.top.postMessage (CORS bypass)
// =====================================================
function _respond(result, reqId) {
  result._reqId = reqId || '';
  var json = JSON.stringify(result);
  var html = '<html><body><script>window.top.postMessage(' + json + ', "*");<\/script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =====================================================
// UPLOAD
// =====================================================
function handleUpload(data) {
  var pdf = data.pdf;
  var filename = data.filename || 'document.pdf';
  if (!pdf) throw new Error('No PDF data');

  var decoded = Utilities.base64Decode(pdf);
  var blob = Utilities.newBlob(decoded, 'application/pdf', filename);

  var folder;
  if (FOLDER_ID) {
    folder = DriveApp.getFolderById(FOLDER_ID);
  } else {
    folder = DriveApp.getRootFolder();
  }

  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    success: true,
    fileId: file.getId(),
    fileName: file.getName(),
  };
}

// =====================================================
// FETCH
// =====================================================
function handleFetch(data) {
  var fileId = data.fileId;
  if (!fileId) throw new Error('No fileId provided');

  var file = DriveApp.getFileById(fileId);
  var blob = file.getBlob();
  var base64 = Utilities.base64Encode(blob.getBytes());

  return {
    success: true,
    pdf: base64,
    filename: file.getName(),
  };
}

// =====================================================
// SIGNED
// =====================================================
function handleSigned(data) {
  var pdf = data.pdf;
  var docTitle = data.docTitle || 'document';
  var safeName = data.filename || (docTitle + ' — signed.pdf');
  var clientName = data.clientName || '';
  var timestamp = data.timestamp || new Date().toLocaleString('he-IL');

  if (!pdf) throw new Error('No signed PDF data');

  var decoded = Utilities.base64Decode(pdf);
  var blob = Utilities.newBlob(decoded, 'application/pdf', safeName);

  var folderId = SIGNED_FOLDER_ID || FOLDER_ID;
  var folder;
  if (folderId) {
    folder = DriveApp.getFolderById(folderId);
  } else {
    folder = DriveApp.getRootFolder();
  }

  var file = folder.createFile(blob);

  if (SEND_EMAIL && NOTIFY_EMAIL) {
    try {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: 'מסמך נחתם: ' + docTitle,
        body: 'מסמך: ' + docTitle + '\nחותם: ' + clientName + '\nתאריך: ' + timestamp + '\nקישור: ' + file.getUrl(),
        attachments: [blob],
      });
    } catch (emailErr) {
      Logger.log('Email error: ' + emailErr);
    }
  }

  return {
    success: true,
    fileId: file.getId(),
    fileUrl: file.getUrl(),
  };
}
