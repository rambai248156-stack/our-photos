/*
  SETUP — replace the four Cloudinary/Firebase values below with your real values.
  Firebase config is in Firebase Console > Project settings > Your apps > SDK setup.
  Cloudinary Cloud Name is in the Cloudinary dashboard; create an UNSIGNED preset.
*/
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  addDoc,
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const CLOUDINARY_CLOUD_NAME = 'PASTE_YOUR_CLOUD_NAME';
const CLOUDINARY_UNSIGNED_PRESET = 'PASTE_YOUR_UNSIGNED_UPLOAD_PRESET';
const MAX_FILE_BYTES = 100 * 1024 * 1024;

const firebaseConfig = {
  apiKey: 'PASTE_FIREBASE_API_KEY',
  authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  storageBucket: 'PASTE_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'PASTE_MESSAGING_SENDER_ID',
  appId: 'PASTE_FIREBASE_APP_ID'
};

const $ = (selector) => document.querySelector(selector);
const input = $('#mediaInput');
const gallery = $('#gallery');
const panel = $('#uploadPanel');
const uploadName = $('#uploadName');
const uploadPercent = $('#uploadPercent');
const progressFill = $('#progressFill');
const uploadStatus = $('#uploadStatus');
const progressTrack = $('.progress-track');
const connectionStatus = $('#connectionStatus');
const itemCount = $('#itemCount');
const toast = $('#toast');

let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 4500);
}

function configReady() {
  const values = [CLOUDINARY_CLOUD_NAME, CLOUDINARY_UNSIGNED_PRESET, ...Object.values(firebaseConfig)];
  return values.every((value) => value && !value.startsWith('PASTE_'));
}

function setProgress(percent, status, name = '') {
  const bounded = Math.max(0, Math.min(100, Math.round(percent)));
  panel.hidden = false;
  panel.classList.remove('error');
  uploadName.textContent = name || 'Preparing upload…';
  uploadPercent.textContent = `${bounded}%`;
  progressFill.style.width = `${bounded}%`;
  progressTrack.setAttribute('aria-valuenow', String(bounded));
  uploadStatus.textContent = status;
}

function showUploadError(name, message) {
  panel.hidden = false;
  panel.classList.add('error');
  uploadName.textContent = name;
  uploadPercent.textContent = 'Error';
  uploadStatus.textContent = message;
  showToast(message);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function safeMediaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' ? url.href : '';
  } catch {
    return '';
  }
}

function makeMediaCard(data) {
  const card = document.createElement('article');
  card.className = 'media-card';

  const frame = document.createElement('div');
  frame.className = 'media-frame';
  const mediaUrl = safeMediaUrl(data.mediaUrl);
  if (!mediaUrl) {
    frame.textContent = 'Media URL is invalid';
    return card;
  }

  if (data.resourceType === 'video') {
    const video = document.createElement('video');
    video.src = mediaUrl;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-label', data.fileName || 'Uploaded video');
    frame.append(video);
  } else if (data.resourceType === 'image') {
    const image = document.createElement('img');
    image.src = mediaUrl;
    image.alt = data.fileName || 'Uploaded photo';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.onerror = () => { image.alt = 'Image could not be loaded'; };
    frame.append(image);
  } else {
    frame.textContent = 'Unsupported media type';
    return card;
  }

  const badge = document.createElement('span');
  badge.className = 'media-kind';
  badge.textContent = data.resourceType;
  frame.append(badge);

  const info = document.createElement('div');
  info.className = 'media-info';
  const name = document.createElement('p');
  name.className = 'media-name';
  name.textContent = data.fileName || 'Untitled media';
  name.title = name.textContent;
  const date = document.createElement('p');
  date.className = 'media-date';
  const createdAt = data.createdAt;
  date.textContent = createdAt && typeof createdAt.toDate === 'function'
    ? createdAt.toDate().toLocaleString()
    : 'Just uploaded';
  info.append(name, date);
  card.append(frame, info);
  return card;
}

function startLiveGallery(db) {
  const feedQuery = query(collection(db, 'uploads'), orderBy('createdAt', 'desc'));
  onSnapshot(feedQuery, (snapshot) => {
    const fragment = document.createDocumentFragment();
    snapshot.forEach((documentSnapshot) => fragment.append(makeMediaCard(documentSnapshot.data())));
    gallery.replaceChildren(fragment);
    itemCount.textContent = `${snapshot.size} ${snapshot.size === 1 ? 'item' : 'items'}`;
    connectionStatus.textContent = '';
    connectionStatus.classList.remove('error');
  }, (error) => {
    console.error('Firestore live listener failed:', error);
    connectionStatus.textContent = `Live gallery error: ${error.message}`;
    connectionStatus.classList.add('error');
  });
}

function cloudinaryUpload(file, resourceType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY_CLOUD_NAME)}/${resourceType}/upload`;
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', CLOUDINARY_UNSIGNED_PRESET);

    xhr.open('POST', endpoint, true);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener('load', () => {
      let result;
      try { result = JSON.parse(xhr.responseText); } catch { reject(new Error(`Cloudinary returned an unreadable response (HTTP ${xhr.status}).`)); return; }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(result.error?.message || `Cloudinary upload failed (HTTP ${xhr.status}). Check cloud name, preset and allowed formats.`));
        return;
      }
      if (!result.secure_url || !result.public_id) {
        reject(new Error('Cloudinary upload response did not contain a secure media URL.'));
        return;
      }
      resolve(result);
    });
    xhr.addEventListener('error', () => reject(new Error('Could not connect to Cloudinary. Check your internet connection and try again.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));
    xhr.send(form);
  });
}

function inferResourceType(file) {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (['mp4', 'mov', 'm4v', 'webm', 'ogv', '3gp'].includes(extension)) return 'video';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif', 'bmp'].includes(extension)) return 'image';
  return '';
}

async function uploadOne(file, index, total, db) {
  const resourceType = inferResourceType(file);
  if (!resourceType) {
    showUploadError(file.name, 'Choose an image or video file.');
    return false;
  }
  if (file.size > MAX_FILE_BYTES) {
    showUploadError(file.name, 'This starter app accepts files up to 100 MiB. Reduce the file size or adjust MAX_FILE_BYTES and the Firestore rule together.');
    return false;
  }

  setProgress(0, `Preparing ${formatBytes(file.size)} · ${index} of ${total}`, file.name);
  try {
    const asset = await cloudinaryUpload(file, resourceType, (percent) => {
      setProgress(percent, `Uploading to Cloudinary · ${formatBytes(file.size)} · ${index} of ${total}`, file.name);
    });

    setProgress(100, 'Upload complete. Saving to the shared live gallery…', file.name);
    const mediaUrl = safeMediaUrl(asset.secure_url);
    if (!mediaUrl) throw new Error('Cloudinary did not return a valid HTTPS media URL.');

    await addDoc(collection(db, 'uploads'), {
      mediaUrl,
      publicId: asset.public_id,
      resourceType,
      format: asset.format || '',
      fileName: file.name.slice(0, 240),
      sizeBytes: file.size,
      createdAt: serverTimestamp()
    });
    setProgress(100, `Uploaded and published · ${index} of ${total}`, file.name);
    return true;
  } catch (error) {
    console.error('Media upload/publish failed:', error);
    const note = error?.code === 'permission-denied'
      ? 'Cloud upload succeeded, but Firestore denied the gallery save. Check Firestore rules.'
      : error.message || 'Upload failed for an unknown reason.';
    showUploadError(file.name, note);
    return false;
  }
}

input.addEventListener('change', async () => {
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;
  if (!configReady()) {
    showUploadError('Setup required', 'Paste your Cloudinary Cloud Name, unsigned preset, and Firebase config into app.js first.');
    return;
  }

  let db;
  try { db = getFirestore(initializeApp(firebaseConfig)); }
  catch (error) {
    console.error('Firebase initialization failed:', error);
    showUploadError('Firebase setup error', error.message || 'Check the Firebase config in app.js.');
    return;
  }

  let successes = 0;
  for (let i = 0; i < files.length; i += 1) {
    if (await uploadOne(files[i], i + 1, files.length, db)) successes += 1;
  }
  if (successes === files.length) showToast(files.length === 1 ? 'Upload is live for everyone.' : `All ${successes} uploads are live for everyone.`);
  else if (successes) showToast(`${successes} of ${files.length} uploads succeeded. See the status above for the failed item.`);
});

if (!configReady()) {
  connectionStatus.textContent = 'Setup needed: add the Cloudinary and Firebase values in app.js.';
} else {
  try {
    const db = getFirestore(initializeApp(firebaseConfig));
    startLiveGallery(db);
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    connectionStatus.textContent = `Could not start Firebase: ${error.message}`;
    connectionStatus.classList.add('error');
  }
}
