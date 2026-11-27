import { initializeApp } from 'https://gstatic.com';
import {
  addDoc,
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from 'https://gstatic.com';

const IMAGEKIT_PUBLIC_KEY = 'public_FFRD2lgjNJu6yFDt88HDhkTEucA=';
const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB

const firebaseConfig = {
  apiKey: "AIzaSyB6ZqAKHK9FqZ9lQWvGoN7vVwW9bpdSvbo",
  authDomain: "://firebaseapp.com",
  projectId: "our-photos-f25a6",
  storageBucket: "our-photos-f25a6.firebasestorage.app",
  messagingSenderId: "945458504446",
  appId: "1:945458504446:web:d832115620bd4d44e3fbaf",
  measurementId: "G-WV2D0NP55Z"
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

function makeMediaCard(data) {
  const card = document.createElement('article');
  card.className = 'media-card';

  const frame = document.createElement('div');
  frame.className = 'media-frame';

  if (data.resourceType === 'video') {
    const video = document.createElement('video');
    video.src = data.mediaUrl;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    frame.append(video);
  } else {
    const image = document.createElement('img');
    image.src = data.mediaUrl;
    image.alt = data.fileName || 'Uploaded photo';
    image.loading = 'lazy';
    frame.append(image);
  }

  const badge = document.createElement('span');
  badge.className = 'media-kind';
  badge.textContent = data.resourceType || 'media';
  frame.append(badge);

  const info = document.createElement('div');
  info.className = 'media-info';
  const name = document.createElement('p');
  name.className = 'media-name';
  name.textContent = data.fileName || 'Untitled media';
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
    snapshot.forEach((doc) => fragment.append(makeMediaCard(doc.data())));
    gallery.replaceChildren(fragment);
    itemCount.textContent = `${snapshot.size} ${snapshot.size === 1 ? 'item' : 'items'}`;
    connectionStatus.textContent = '';
    connectionStatus.classList.remove('error');
  }, (error) => {
    connectionStatus.textContent = `Live gallery error: ${error.message}`;
    connectionStatus.classList.add('error');
  });
}

async function imagekitUpload(file, onProgress) {
  const authRes = await fetch('/api/auth');
  if (!authRes.ok) {
    throw new Error('Server auth error: Vercel par IMAGEKIT_PRIVATE_KEY check karein.');
  }
  const auth = await authRes.json();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);
    form.append('fileName', file.name);
    form.append('publicKey', IMAGEKIT_PUBLIC_KEY);
    form.append('signature', auth.signature);
    form.append('expire', auth.expire);
    form.append('token', auth.token);

    xhr.open('POST', 'https://imagekit.io', true);
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener('load', () => {
      let result;
      try { result = JSON.parse(xhr.responseText); } catch { reject(new Error('ImageKit invalid response')); return; }
      if (xhr.status >= 200 && xhr.status < 300 && result.url) {
        resolve(result);
      } else {
        reject(new Error(result.message || `Upload failed (HTTP ${xhr.status})`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Network error while uploading to ImageKit.')));
    xhr.send(form);
  });
}

function inferResourceType(file) {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (['mp4', 'mov', 'm4v', 'webm', '3gp'].includes(ext)) return 'video';
  return 'image';
}

async function uploadOne(file, index, total, db) {
  const resourceType = inferResourceType(file);
  if (file.size > MAX_FILE_BYTES) {
    showUploadError(file.name, 'File size 100 MB se kam honi chahiye.');
    return false;
  }

  setProgress(0, `Preparing ${formatBytes(file.size)} · ${index} of ${total}`, file.name);
  try {
    const asset = await imagekitUpload(file, (percent) => {
      setProgress(percent, `Uploading to ImageKit · ${formatBytes(file.size)} · ${index} of ${total}`, file.name);
    });

    setProgress(100, 'Saving to shared live gallery…', file.name);
    await addDoc(collection(db, 'uploads'), {
      mediaUrl: asset.url,
      fileId: asset.fileId,
      resourceType,
      fileName: file.name.slice(0, 240),
      sizeBytes: file.size,
      createdAt: serverTimestamp()
    });
    setProgress(100, `Uploaded & Live! · ${index} of ${total}`, file.name);
    return true;
  } catch (error) {
    showUploadError(file.name, error.message || 'Upload fail ho gaya.');
    return false;
  }
}

const db = getFirestore(initializeApp(firebaseConfig));
startLiveGallery(db);

input.addEventListener('change', async () => {
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;

  let successes = 0;
  for (let i = 0; i < files.length; i += 1) {
    if (await uploadOne(files[i], i + 1, files.length, db)) successes += 1;
  }
  if (successes === files.length) {
    showToast(files.length === 1 ? 'Upload is live for everyone!' : `All ${successes} uploads are live!`);
  }
});
