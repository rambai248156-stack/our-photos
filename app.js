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

const CLOUD_NAME = 'kaonxl9f';
const UPLOAD_PRESET = 'our_photos';
const MAX_FILE_BYTES = 100 * 1024 * 1024;

const firebaseConfig = {
  apiKey: "AIzaSyB6ZqAKHK9FqZ9lQWvGoN7vVwW9bpdSvbo",
  authDomain: "://firebaseapp.com",
  projectId: "our-photos-f25a6",
  storageBucket: "our-photos-f25a6.firebasestorage.app",
  messagingSenderId: "945458504446",
  appId: "1:945458504446:web:d832115620bd4d44e3fbaf",
  measurementId: "G-WV2D0NP55Z"
};

const $ = (s) => document.querySelector(s);
const input = $('#mediaInput'), gallery = $('#gallery'), panel = $('#uploadPanel');
const uploadName = $('#uploadName'), uploadPercent = $('#uploadPercent'), progressFill = $('#progressFill');
const uploadStatus = $('#uploadStatus'), connectionStatus = $('#connectionStatus'), itemCount = $('#itemCount'), toast = $('#toast');

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}

function setProgress(pct, status, name) {
  panel.hidden = false;
  panel.classList.remove('error');
  uploadName.textContent = name;
  uploadPercent.textContent = `${pct}%`;
  progressFill.style.width = `${pct}%`;
  uploadStatus.textContent = status;
}

function showError(name, msg) {
  panel.hidden = false;
  panel.classList.add('error');
  uploadName.textContent = name;
  uploadPercent.textContent = 'Error';
  uploadStatus.textContent = msg;
  showToast(msg);
}

const db = getFirestore(initializeApp(firebaseConfig));

onSnapshot(query(collection(db, 'uploads'), orderBy('createdAt', 'desc')), (snap) => {
  const frag = document.createDocumentFragment();
  snap.forEach((doc) => {
    const d = doc.data();
    const card = document.createElement('article');
    card.className = 'media-card';
    card.innerHTML = `
      <div class="media-frame">
        ${d.resourceType === 'video' ? `<video src="${d.mediaUrl}" controls playsinline></video>` : `<img src="${d.mediaUrl}" loading="lazy">`}
        <span class="media-kind">${d.resourceType}</span>
      </div>
      <div class="media-info">
        <p class="media-name">${d.fileName || 'Media'}</p>
        <p class="media-date">${d.createdAt?.toDate ? d.createdAt.toDate().toLocaleString() : 'Just now'}</p>
      </div>`;
    frag.append(card);
  });
  gallery.replaceChildren(frag);
  itemCount.textContent = `${snap.size} items`;
}, (err) => {
  connectionStatus.textContent = `Firebase Error: ${err.message}`;
  connectionStatus.classList.add('error');
});

input.addEventListener('change', async () => {
  const files = Array.from(input.files || []);
  input.value = '';
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) { showError(file.name, '100 MB se chhoti file chunein'); continue; }
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    setProgress(10, 'Uploading...', file.name);
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', UPLOAD_PRESET);
    try {
      const uploadUrl = `https://cloudinary.com{CLOUD_NAME}/${type}/upload`;
      const res = await fetch(uploadUrl, { method: 'POST', body: form });
      const data = await res.json();
      if (!data.secure_url) throw new Error(data.error?.message || 'Upload fail');
      setProgress(90, 'Saving to gallery...', file.name);
      await addDoc(collection(db, 'uploads'), {
        mediaUrl: data.secure_url,
        resourceType: type,
        fileName: file.name,
        createdAt: serverTimestamp()
      });
      setProgress(100, 'Live!', file.name);
      showToast('Uploaded & Live!');
    } catch (e) {
      showError(file.name, e.message);
    }
  }
});
