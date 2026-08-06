const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'guide');

const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

function extFromFilename(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return ext || '';
}

// 원본은 Channel Talk CDN(cf.channel.io)에 업로드하는 것으로 추정되나
// 해당 API 접근 권한이 없어, web-tools 자체 서버에 저장하는 방식으로 대체 구현.
function saveUploadedImage({ filename, contentType, data }) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = extFromFilename(filename) || EXT_BY_MIME[contentType] || '.png';
  const name = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), data);
  return `/uploads/guide/${name}`;
}

module.exports = { saveUploadedImage };
