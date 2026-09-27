/**
 * Antigravity QR - Firebase Configuration
 * 
 * PANDUAN PENYIAPAN GRATIS (Hanya butuh 2 menit di Firebase Console):
 * 1. Buka https://console.firebase.google.com/ lalu klik "Add project" (beri nama bebas).
 * 2. Di menu kiri, buka "Build" -> "Authentication" -> "Get started".
 * 3. Di tab "Sign-in method", pilih "Google" -> "Enable" -> Simpan (Save).
 * 4. Di menu kiri, buka "Build" -> "Firestore Database" -> "Create database" -> pilih "Start in test mode".
 * 5. Buka icon Gerigi (Project settings) di kiri atas -> Scroll ke bawah -> Klik icon Web (</>) untuk mendaftarkan web app.
 * 6. Salin objek `firebaseConfig` yang muncul dan tempelkan ke variabel di bawah ini.
 * 7. Untuk GitHub Pages: Di menu Authentication -> tab "Settings" -> "Authorized domains", tambahkan domain GitHub Anda (contoh: username.github.io).
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCiQ71fof_fDogDeSdUQHV4-287pzdoF4k",
  authDomain: "qr-generator-free-381c4.firebaseapp.com",
  projectId: "qr-generator-free-381c4",
  storageBucket: "qr-generator-free-381c4.firebasestorage.app",
  messagingSenderId: "253805316019",
  appId: "1:253805316019:web:6af76a7016699c18152dc6"
};

// Cek apakah konfigurasi Firebase sudah diisi oleh pengguna
function isFirebaseConfigured() {
  return (
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" &&
    FIREBASE_CONFIG.projectId &&
    FIREBASE_CONFIG.projectId !== "YOUR_PROJECT_ID"
  );
}

window.FIREBASE_CONFIG = FIREBASE_CONFIG;
window.isFirebaseConfigured = isFirebaseConfigured;
