/**
 * MediCare Pro — VULNERABLE File Upload API
 * ❌ No file type validation (extension or MIME)
 * ❌ No file content inspection / antivirus
 * ❌ Files stored in web-accessible directory with original filename
 * ❌ No file size limit enforced server-side
 */

// Note: Vercel doesn't support traditional multipart in serverless functions
// without a library. This endpoint demonstrates the vulnerability pattern.
// In a real app you'd use multer or busboy.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Filename');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Get filename from header (simulating multipart upload)
  const filename = req.headers['x-filename'] || 'upload.bin';
  const ext = filename.split('.').pop().toLowerCase();

  // ❌ No extension check — this is what a SECURE server would do but we skip:
  // const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx'];
  // if (!ALLOWED_EXTS.includes(ext)) {
  //   return res.status(400).json({ error: 'File type not allowed' });
  // }

  const EXECUTABLE_EXTS = ['php', 'php5', 'phtml', 'php3', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'py', 'rb', 'sh', 'bash'];
  const isExecutable = EXECUTABLE_EXTS.includes(ext);

  // Simulated upload response
  const uploadedUrl = `/uploads/${filename}`;

  const response = {
    success: true,
    filename,
    url: uploadedUrl,
    size: req.headers['content-length'] || '1024',
    isExecutable,
    warning: isExecutable
      ? `⚠ SHELL UPLOADED! File stored at ${uploadedUrl}. In a real server, accessing this URL would execute the script!`
      : null,
    shellExecUrl: isExecutable
      ? `${uploadedUrl}?cmd=whoami`
      : null,
    // ❌ Server should NOT return this info — exposed for educational purposes
    serverPath: `/var/www/html${uploadedUrl}`,
  };

  return res.status(200).json(response);
};
