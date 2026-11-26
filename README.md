# Frames

Real-time photo + video sharing. Koi npm install nahi — sirf **Node.js 22.13+** chahiye (nodejs.org se LTS).

## Chalane ka tarika
```
cd frames
node server.js
```
Terminal me `http://localhost:3000` aur `Network: http://192.168.x.x:3000` dikhega. Phone se wahi Network link kholo (same Wi-Fi).
Internet par daalna ho to kisi VPS/Render/Railway par chalao (persistent disk ke saath) aur HTTPS lagao.

## Full screen
Browser bina tap ke full screen allow nahi karta, isliye **pehle tap par** automatic full screen hota hai.
Sach me app jaisa full screen chahiye to browser menu → **Add to Home screen** — wahan se seedha full screen khulta hai.
(Notification, share aur install ke liye HTTPS chahiye; localhost par chalta hai.)

## Settings (optional)
`PORT=8080  MAX_UPLOAD_MB=2048  DATA_DIR=/path/to/data  node server.js`

## Kya kahan store hota hai
`data/frames.db` (posts, likes, comments) · `data/media` (original HD files, byte-by-byte same) · `data/thumbs` (chhote previews). Backup = `data` folder copy.

## Security
Sirf asli photo/video (file signature check) · random file names · path-traversal block · CSP + nosniff headers · HttpOnly cookie · rate limits · size limit · saara user text `textContent` se (XSS nahi).

## Jo abhi nahi hai
Login (likes cookie se device-wise bante hain) · upload resume · notification ke liye service worker.

## Download
Viewer me download button: original HD file device me save hoti hai, aur **har baar naya file naam** (`title-xxxx.jpg`) milta hai — isliye Chrome `(1)` ya duplicate wali dikkat nahi deta. Ek tap = ek download.
