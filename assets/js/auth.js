/**
 * Antigravity QR - Google Authentication Manager
 * Handles Google OAuth, session persistence, and UI synchronization.
 */

class AuthManager {
  constructor() {
    this.auth = null;
    this.currentUser = null;
    this.isReady = false;

    this.init();
  }

  init() {
    // Check local demo session first if saved
    const savedDemo = localStorage.getItem('antigravity_demo_user');
    if (savedDemo) {
      try {
        this.currentUser = JSON.parse(savedDemo);
        this.updateUI(this.currentUser);
      } catch (e) {
        localStorage.removeItem('antigravity_demo_user');
      }
    }

    if (typeof firebase === 'undefined' || !window.isFirebaseConfigured || !window.isFirebaseConfigured()) {
      console.info('Firebase belum dikonfigurasi. Mode Tamu aktif.');
      if (!this.currentUser) this.updateUI(null);
      return;
    }

    try {
      if (!firebase.apps.length && window.FIREBASE_CONFIG) {
        firebase.initializeApp(window.FIREBASE_CONFIG);
      }
      this.auth = firebase.auth();
      this.isReady = true;

      // Listen for auth state from Firebase
      this.auth.onAuthStateChanged((user) => {
        if (user) {
          localStorage.removeItem('antigravity_demo_user');
          this.currentUser = user;
        } else if (!localStorage.getItem('antigravity_demo_user')) {
          this.currentUser = null;
        }
        this.updateUI(this.currentUser);
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: this.currentUser } }));
      });
    } catch (err) {
      console.error('Firebase Auth initialization error:', err);
    }
  }

  async loginWithGoogle() {
    if (!this.isReady) {
      // If Firebase credentials are not yet entered, provide options
      this.showSetupGuideModal();
      return null;
    }

    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await this.auth.signInWithPopup(provider);
      this.currentUser = result.user;
      this.updateUI(this.currentUser);
      window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: this.currentUser } }));
      window.showToast?.(`Selamat datang, ${this.currentUser.displayName || 'Pengguna'}!`, 'success');
      return this.currentUser;
    } catch (err) {
      console.error('Google Sign-in failed:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        window.showToast?.('Login dibatalkan.', 'info');
      } else {
        window.showToast?.('Gagal login dengan Google: ' + err.message, 'error');
      }
      return null;
    }
  }

  loginWithDemoUser() {
    const demoUser = {
      uid: 'demo_user_cloud',
      displayName: 'Pengguna Demo',
      email: 'demo@antigravity.app',
      photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
      isDemo: true
    };
    this.currentUser = demoUser;
    localStorage.setItem('antigravity_demo_user', JSON.stringify(demoUser));
    this.updateUI(demoUser);
    window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: demoUser } }));
    window.showToast?.('Berhasil masuk dengan Akun Uji Coba!', 'success');
    return demoUser;
  }

  async logout() {
    localStorage.removeItem('antigravity_demo_user');
    if (this.isReady && this.auth) {
      try {
        await this.auth.signOut();
      } catch (err) {
        console.error('Logout error:', err);
      }
    }
    this.currentUser = null;
    this.updateUI(null);
    window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: null } }));
    window.showToast?.('Anda telah keluar dari akun.', 'info');
  }

  updateUI(user) {
    const loginBtn = document.getElementById('btn-google-login');
    const userProfileBox = document.getElementById('user-profile-box');
    const userAvatar = document.getElementById('user-avatar-img');
    const userName = document.getElementById('user-name-text');
    const storageStatusBadge = document.getElementById('storage-status-badge');

    if (user) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (userProfileBox) userProfileBox.style.display = 'inline-flex';
      if (userAvatar) userAvatar.src = user.photoURL || 'https://www.gravatar.com/avatar/?d=mp';
      if (userName) userName.textContent = user.displayName?.split(' ')[0] || 'User';
      if (storageStatusBadge) {
        storageStatusBadge.innerHTML = `<span class="cloud-dot"></span> Cloud Tersinkron (${user.displayName || 'Akun'})`;
        storageStatusBadge.className = 'status-badge status-cloud';
      }
    } else {
      if (loginBtn) loginBtn.style.display = 'inline-flex';
      if (userProfileBox) userProfileBox.style.display = 'none';
      if (storageStatusBadge) {
        storageStatusBadge.innerHTML = `Mode Tamu (Tanpa Simpan)`;
        storageStatusBadge.className = 'status-badge status-guest';
      }
    }
  }

  showSetupGuideModal() {
    const modal = document.getElementById('firebase-setup-modal');
    if (modal) {
      modal.classList.add('active');
    }
  }
}

window.authManager = new AuthManager();
