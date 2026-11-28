// Only PUBLIC values live here (Firebase web config is public by design; security = firestore.rules / storage.rules).
// NEVER put a Cloudinary API secret or ImageKit private key in this file.
export const firebaseConfig = {
  apiKey: 'AIzaSyB6ZqAKHK9FqZ9lQWvGoN7vVwW9bpdSvbo',
  authDomain: 'our-photos-f25a6.firebaseapp.com',
  projectId: 'our-photos-f25a6',
  storageBucket: 'our-photos-f25a6.firebasestorage.app',
  messagingSenderId: '945458504446',
  appId: '1:945458504446:web:d832115620bd4d44e3fbaf',
};

// Cloudinary (primary file storage). Create an UNSIGNED upload preset with this exact name:
// Cloudinary Console -> Settings -> Upload -> Upload presets -> Add -> Signing mode: Unsigned
export const CLOUD_NAME = 'kaonxl9f';
export const UPLOAD_PRESET = 'our_photos';

// Cloudinary free-plan file limits. Bigger files automatically go to Firebase Storage instead.
export const CLOUD_LIMIT = { photo: 10 * 1048576, video: 100 * 1048576 };
