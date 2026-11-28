# Our Photos

Real-time photo + video sharing. **Backend = Firebase** (Auth + Firestore), files = **Cloudinary** (aur bade files ke liye Firebase Storage). Koi server chalana zaroori nahi.

## Pehli baar setup (5 min, bas ek baar)
1. **Authentication** → Sign-in method → **Anonymous** → Enable.
2. **Firestore Database** → Create (agar nahi bana) → **Rules** → `firestore.rules` ka poora text paste → **Publish**.
3. **Cloudinary** → Settings → Upload → Upload presets → Add → naam `our_photos`, **Signing mode: Unsigned** → Save.
4. *(Optional, 10 MB se bade photo / 100 MB se bade video ke liye)* **Storage** enable (Blaze plan) → Rules me `storage.rules` paste → Publish.
   Download ke liye Storage wali files par: `gsutil cors set cors.json gs://our-photos-f25a6.firebasestorage.app`

## Chalana
- Test: `node server.js` → http://localhost:3000 (phone par Network wala link).
- Sabko dikhane ke liye (public link): `npm i -g firebase-tools` → `firebase login` → `firebase deploy` → **https://our-photos-f25a6.web.app**
  Koi bhi, kahin se, kholega to sab real-time dikhega.

## Full screen
Pehle tap par browser full screen hota hai. App jaisa: Chrome menu → **Add to Home screen**.

## Zaroori
`public/config.js` me sirf public keys hain. **Cloudinary API secret / ImageKit private key kabhi kahin paste mat karo** (chat me bhi nahi). Agar kar di hai to dashboard se regenerate kar lo.
Likes private hain (count kisi ko nahi dikhta); har device ka apna anonymous account hota hai.
