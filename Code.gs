// =====================================================
// Sphere Sign — Google Apps Script Backend
// Webhook for: admin.html (upload) + index.html (fetch, signed)
// CORS fix: returns HTML with parent.postMessage()
// =====================================================

// === CONFIGURATION ===
const CONFIG = {
  folderId: '',            // Google Drive folder ID for uploaded docs (leave empty = root)
  signedFolderId: '',      // Google Drive folder ID for signed docs (leave empty = same as folderId)
  notifyEmail: 'sagi@sphere-ifs.co.il',  // Email to notify on signed doc
  sendEmailOnSigned: true,               // Send email notification when doc is signed
};

// =====================================================
// MAIN ENTRY POINT
// =====================================================
function doPost(e) {
  let result;
  try {
    // Parse payload from hidden iframe form POST
    const raw = e.parameter.payload || e.postData.contents;
    const data = JSON.parse(raw);

    switch (data.action) {
      case 'upload':
        result = handleUpload(data);
        break;
      case 'fetch':
        result = handleFetch(data);
        break;
      case 'signed':
        result = handleSigned(data);
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + data.action };
    }
  } catch (err) {
    result = { success: false, error: err.message || String(err) };
  }

  // Return HTML with postMessage (iframe CORS fix)
  return HtmlService.createHtmlOutput(
    '<script>parent.postMessage(' + JSON.stringify(result) + ', "*");</script>'
  );
}

// Fallback for GET requests (testing / health check)
function doGet(e) {
  return HtmlService.createHtmlOutput(
    '<script>parent.postMessage({"success":true,"status":"ok"}, "*");</script>'
  );
}

// =====================================================
// ACTION: UPLOAD (admin uploads PDF for signing)
// =====================================================
function handleUpload(data) {
  const { pdf, filename, clientName, docType } = data;
  if (!pdf) throw new Error('No PDF data');

  const decoded = Utilities.base64Decode(pdf);
  const blob = Utilities.newBlob(decoded, 'application/pdf', filename || 'document.pdf');

  const folder = CONFIG.folderId
    ? DriveApp.getFolderById(CONFIG.folderId)
    : DriveApp.getRootFolder();

  const file = folder.createFile(blob);

  // Set sharing to anyone with link can view (so client can fetch it)
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    success: true,
    fileId: file.getId(),
    fileName: file.getName(),
    clientName: clientName || '',
    docType: docType || '',
  };
}

// =====================================================
// ACTION: FETCH (client page loads PDF for signing)
// =====================================================
function handleFetch(data) {
  const { fileId } = data;
  if (!fileId) throw new Error('No fileId provided');

  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  const bytes = blob.getBytes();
  const base64 = Utilities.base64Encode(bytes);

  return {
    success: true,
    pdf: base64,
    filename: file.getName(),
    pages: null, // client counts pages after loading
  };
}

// =====================================================
// ACTION: SIGNED (client sends back signed PDF)
// =====================================================
function handleSigned(data) {
  const { pdf, filename, clientName, timestamp, docTitle } = data;
  if (!pdf) throw new Error('No signed PDF data');

  const decoded = Utilities.base64Decode(pdf);
  const safeName = filename || (docTitle || 'document') + ' — signed.pdf';
  const blob = Utilities.newBlob(decoded, 'application/pdf', safeName);

  // Save to Drive
  const folderId = CONFIG.signedFolderId || CONFIG.folderId;
  const folder = folderId
    ? DriveApp.getFolderById(folderId)
    : DriveApp.getRootFolder();

  const file = folder.createFile(blob);

  // Send email notification
  if (CONFIG.sendEmailOnSigned && CONFIG.notifyEmail) {
    try {
      const subject = '✅ מסמך נחתם: ' + (docTitle || safeName);
      const body = [
        'מסמך חתום התקבל במערכת.',
        '',
        'מסמך: ' + (docTitle || safeName),
        'חותם: ' + (clientName || 'לא צוין'),
        'תאריך חתימה: ' + (timestamp || new Date().toLocaleString('he-IL')),
        '',
        'הקובץ נשמר ב-Google Drive:',
        file.getUrl(),
        '',
        '— ספירה ביטוח ופיננסים',
      ].join('\n');

      MailApp.sendEmail({
        to: CONFIG.notifyEmail,
        subject: subject,
        body: body,
        attachments: [blob],
      });
    } catch (emailErr) {
      // Don't fail the whole request if email fails
      Logger.log('Email error: ' + emailErr.message);
    }
  }

  return {
    success: true,
    fileId: file.getId(),
    fileUrl: file.getUrl(),
  };
}
