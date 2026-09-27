/**
 * Antigravity QR Code Storage & Analytics Manager
 * Hybrid storage: IndexedDB (Guest/Offline) + Cloud Firestore (Google Auth)
 * Includes real-time Scan Analytics tracking.
 */

const DB_NAME = 'AntigravityQR_DB';
const DB_VERSION = 2;
const STORE_NAME = 'projects';

class QRStorage {
  constructor() {
    this.db = null;
    this.initPromise = this.initDB();
  }

  initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async ready() {
    if (!this.db) {
      await this.initPromise;
    }
    return this.db;
  }

  get currentUser() {
    return window.authManager?.currentUser || null;
  }

  get firestore() {
    if (typeof firebase !== 'undefined' && window.isFirebaseConfigured && window.isFirebaseConfigured()) {
      if (!firebase.apps.length && window.FIREBASE_CONFIG) {
        try {
          firebase.initializeApp(window.FIREBASE_CONFIG);
        } catch (e) {
          console.warn('Firebase init in storage failed:', e);
        }
      }
      if (firebase.apps.length) {
        return firebase.firestore();
      }
    }
    return null;
  }

  /**
   * Save or Update a QR project (Hybrid: Local DB + Cloud Firestore if logged in)
   */
  async saveProject(project) {
    await this.ready();

    // Mode Tamu tidak menyimpan data
    if (!this.currentUser) {
      throw new Error('Harus login dengan akun Google untuk menyimpan proyek.');
    }

    const record = {
      id: project.id || 'qr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4),
      userId: this.currentUser.uid,
      title: project.title || 'QR Code Tanpa Judul',
      type: project.type || 'url',
      isDynamic: project.isDynamic !== undefined ? Boolean(project.isDynamic) : true,
      data: project.data || {},
      qrConfig: project.qrConfig || {},
      frameConfig: project.frameConfig || {},
      thumbnail: project.thumbnail || '',
      scanCount: project.scanCount !== undefined ? Number(project.scanCount) : 0,
      lastScannedAt: project.lastScannedAt || null,
      deviceStats: project.deviceStats || { mobile: 0, desktop: 0, tablet: 0 },
      scanLogs: Array.isArray(project.scanLogs) ? project.scanLogs : [],
      createdAt: project.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 1. Always save to Local IndexedDB cache for instant UI response
    await new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(record);
      request.onsuccess = () => resolve(record);
      request.onerror = (e) => reject(e.target.error);
    });

    // 2. If Firestore is active, sync to Cloud Firestore
    if (this.firestore) {
      try {
        if (this.currentUser) {
          const userRef = this.firestore.collection('users').doc(this.currentUser.uid);
          await userRef.collection('projects').doc(record.id).set(record, { merge: true });
        }
        // Save public projection so any smartphone scanner can read payload and log scans
        const publicRef = this.firestore.collection('public_projects').doc(record.id);
        await publicRef.set({
          id: record.id,
          userId: this.currentUser.uid,
          title: record.title,
          type: record.type,
          isDynamic: record.isDynamic,
          data: record.data,
          scanCount: record.scanCount,
          lastScannedAt: record.lastScannedAt,
          deviceStats: record.deviceStats,
          updatedAt: record.updatedAt
        }, { merge: true });
      } catch (err) {
        console.warn('Sync to Firestore warning:', err);
      }
    }

    return record;
  }

  /**
   * Retrieve all saved projects for the logged in user
   */
  async getAllProjects() {
    await this.ready();

    // Mode Tamu tidak menyimpan data
    if (!this.currentUser) {
      return [];
    }

    let localProjects = await new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });

    // Filter projects belonging to this user
    localProjects = localProjects.filter(p => !p.userId || p.userId === this.currentUser.uid);

    // If logged in with Google, pull from Cloud Firestore and sync local cache
    if (this.currentUser && this.firestore) {
      try {
        const userRef = this.firestore.collection('users').doc(this.currentUser.uid);
        const snapshot = await userRef.collection('projects').orderBy('updatedAt', 'desc').get();
        
        if (!snapshot.empty) {
          const cloudProjects = [];
          snapshot.forEach((doc) => cloudProjects.push(doc.data()));

          // Merge cloud into local DB silently
          for (const cp of cloudProjects) {
            await this.saveLocalOnly(cp);
          }
          return cloudProjects;
        }
      } catch (err) {
        console.warn('Pull from Firestore warning:', err);
      }
    }

    localProjects.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return localProjects;
  }

  async saveLocalOnly(record) {
    await this.ready();
    return new Promise((resolve) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(record);
      transaction.oncomplete = () => resolve(true);
    });
  }

  /**
   * Get single project by ID
   */
  async getProject(id) {
    await this.ready();

    // Check Cloud first if online & configured
    if (this.firestore) {
      try {
        const publicDoc = await this.firestore.collection('public_projects').doc(id).get();
        if (publicDoc.exists) return publicDoc.data();
      } catch (e) {
        // Fallback to local
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Delete project by ID
   */
  async deleteProject(id) {
    await this.ready();

    // Delete local
    await new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });

    // Delete Cloud if logged in
    if (this.firestore) {
      try {
        await this.firestore.collection('public_projects').doc(id).delete();
        if (this.currentUser) {
          const userRef = this.firestore.collection('users').doc(this.currentUser.uid);
          await userRef.collection('projects').doc(id).delete();
        }
      } catch (err) {
        console.warn('Cloud delete warning:', err);
      }
    }

    return true;
  }

  // =============================================================
  // SCAN ANALYTICS TRACKING & REPORTING
  // =============================================================

  /**
   * Increment scan analytics counter and record client device metadata
   */
  async incrementScanCount(id, clientMetadata = {}) {
    if (!id) return null;
    const now = new Date().toISOString();
    
    // Normalize device
    let rawDev = (clientMetadata.device || 'Mobile').toLowerCase();
    let devKey = 'mobile';
    if (rawDev.includes('desk') || rawDev.includes('pc') || rawDev.includes('lap')) devKey = 'desktop';
    else if (rawDev.includes('tab') || rawDev.includes('pad')) devKey = 'tablet';

    const logEntry = {
      timestamp: now,
      device: devKey === 'desktop' ? 'Desktop' : devKey === 'tablet' ? 'Tablet' : 'Mobile',
      os: clientMetadata.os || 'Android',
      browser: clientMetadata.browser || 'Chrome',
      referrer: clientMetadata.referrer || 'Direct QR Scan'
    };

    let updatedProject = null;

    try {
      const project = await this.getProject(id);
      if (project) {
        project.scanCount = (project.scanCount || 0) + 1;
        project.lastScannedAt = now;
        
        project.deviceStats = project.deviceStats || { mobile: 0, desktop: 0, tablet: 0 };
        project.deviceStats[devKey] = (project.deviceStats[devKey] || 0) + 1;

        project.scanLogs = Array.isArray(project.scanLogs) ? project.scanLogs : [];
        project.scanLogs.unshift(logEntry);
        if (project.scanLogs.length > 40) {
          project.scanLogs = project.scanLogs.slice(0, 40);
        }

        await this.saveLocalOnly(project);
        updatedProject = project;
      }

      // Sync scan to Cloud if available
      if (this.firestore) {
        try {
          const publicDocRef = this.firestore.collection('public_projects').doc(id);
          const updatePayload = {
            scanCount: firebase.firestore.FieldValue.increment(1),
            lastScannedAt: now,
            [`deviceStats.${devKey}`]: firebase.firestore.FieldValue.increment(1)
          };
          await publicDocRef.set(updatePayload, { merge: true });

          if (this.currentUser) {
            const userDocRef = this.firestore.collection('users').doc(this.currentUser.uid).collection('projects').doc(id);
            await userDocRef.set(updatePayload, { merge: true });
          }
        } catch (e) {
          // Non-critical background sync
        }
      }
    } catch (err) {
      console.warn('Failed to increment scan count:', err);
    }

    return updatedProject;
  }

  /**
   * Simulate a test scan with realistic device metadata for testing
   */
  async simulateScan(id) {
    const devices = [
      { device: 'Mobile', os: 'Android 14', browser: 'Chrome Mobile' },
      { device: 'Mobile', os: 'iOS 17.5', browser: 'Safari Mobile' },
      { device: 'Mobile', os: 'Android 13', browser: 'Samsung Internet' },
      { device: 'Desktop', os: 'Windows 11', browser: 'Google Chrome' },
      { device: 'Desktop', os: 'macOS Sonoma', browser: 'Safari' },
      { device: 'Tablet', os: 'iPadOS 17', browser: 'Safari Mobile' }
    ];
    // Weighted to simulate 70% mobile scans
    const weights = [0, 0, 1, 1, 2, 3, 4, 5];
    const chosenIndex = weights[Math.floor(Math.random() * weights.length)];
    const chosen = devices[chosenIndex];

    return await this.incrementScanCount(id, {
      device: chosen.device,
      os: chosen.os,
      browser: chosen.browser,
      referrer: 'Simulasi Pengujian Dashboard'
    });
  }

  /**
   * Reset analytics data for a specific project
   */
  async resetProjectAnalytics(id) {
    const project = await this.getProject(id);
    if (!project) return null;

    project.scanCount = 0;
    project.lastScannedAt = null;
    project.deviceStats = { mobile: 0, desktop: 0, tablet: 0 };
    project.scanLogs = [];

    await this.saveLocalOnly(project);

    if (this.firestore) {
      try {
        const resetPayload = {
          scanCount: 0,
          lastScannedAt: null,
          deviceStats: { mobile: 0, desktop: 0, tablet: 0 },
          scanLogs: []
        };
        await this.firestore.collection('public_projects').doc(id).set(resetPayload, { merge: true });
        if (this.currentUser) {
          await this.firestore.collection('users').doc(this.currentUser.uid).collection('projects').doc(id).set(resetPayload, { merge: true });
        }
      } catch (e) {
        console.warn('Reset cloud analytics warning:', e);
      }
    }

    return project;
  }

  /**
   * Compute aggregate analytics summary across all projects
   */
  async getAnalyticsSummary() {
    const list = await this.getAllProjects();
    let totalScans = 0;
    let topProject = null;
    let aggregateDevices = { mobile: 0, desktop: 0, tablet: 0 };

    list.forEach((p) => {
      const count = Number(p.scanCount) || 0;
      totalScans += count;
      if (!topProject || count > (topProject.scanCount || 0)) {
        topProject = p;
      }
      if (p.deviceStats) {
        aggregateDevices.mobile += (p.deviceStats.mobile || 0);
        aggregateDevices.desktop += (p.deviceStats.desktop || 0);
        aggregateDevices.tablet += (p.deviceStats.tablet || 0);
      }
    });

    const totalDevScans = aggregateDevices.mobile + aggregateDevices.desktop + aggregateDevices.tablet;
    const mobileRatio = totalDevScans > 0 ? Math.round((aggregateDevices.mobile / totalDevScans) * 100) : 0;

    return {
      totalProjects: list.length,
      totalScans: totalScans,
      topProject: topProject && topProject.scanCount > 0 ? topProject : null,
      deviceStats: aggregateDevices,
      mobileRatio: mobileRatio
    };
  }

  /**
   * One-click sync from Local Database to Cloud
   */
  async syncLocalProjectsToCloud() {
    if (!this.currentUser || !this.firestore) {
      throw new Error('Harus login dengan akun Google terlebih dahulu');
    }

    const localProjects = await this.getAllProjects();
    const userRef = this.firestore.collection('users').doc(this.currentUser.uid);
    let count = 0;

    for (const proj of localProjects) {
      await userRef.collection('projects').doc(proj.id).set(proj, { merge: true });
      await this.firestore.collection('public_projects').doc(proj.id).set({
        id: proj.id,
        title: proj.title,
        type: proj.type,
        isDynamic: proj.isDynamic,
        data: proj.data,
        scanCount: proj.scanCount || 0,
        lastScannedAt: proj.lastScannedAt || null,
        deviceStats: proj.deviceStats || { mobile: 0, desktop: 0, tablet: 0 },
        updatedAt: proj.updatedAt
      }, { merge: true });
      count++;
    }

    return count;
  }
}

// Global storage instance
window.qrStorage = new QRStorage();
