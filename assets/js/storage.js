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
   * Helper to normalize deviceStats across local, Firestore, and legacy structures.
   * Auto-recovers missing device stats from scanLogs, scanCount, or legacy dotted fields.
   */
  normalizeDeviceStats(project) {
    if (!project) return { mobile: 0, desktop: 0, tablet: 0 };

    let stats = project.deviceStats && typeof project.deviceStats === 'object'
      ? { ...project.deviceStats }
      : { mobile: 0, desktop: 0, tablet: 0 };

    stats.mobile = Number(stats.mobile) || 0;
    stats.desktop = Number(stats.desktop) || 0;
    stats.tablet = Number(stats.tablet) || 0;

    // 1. Recover stats from legacy dotted fields if present (written by previous Firestore set bug)
    if (project['deviceStats.mobile'] !== undefined) {
      stats.mobile += Number(project['deviceStats.mobile']) || 0;
      delete project['deviceStats.mobile'];
    }
    if (project['deviceStats.desktop'] !== undefined) {
      stats.desktop += Number(project['deviceStats.desktop']) || 0;
      delete project['deviceStats.desktop'];
    }
    if (project['deviceStats.tablet'] !== undefined) {
      stats.tablet += Number(project['deviceStats.tablet']) || 0;
      delete project['deviceStats.tablet'];
    }

    // 2. Cross-reference scanLogs if deviceStats is all zero or smaller than logged scans
    if (Array.isArray(project.scanLogs) && project.scanLogs.length > 0) {
      let logMob = 0;
      let logDesk = 0;
      let logTab = 0;

      project.scanLogs.forEach((entry) => {
        const dev = ((entry && entry.device) || '').toLowerCase();
        if (dev.includes('desk') || dev.includes('pc') || dev.includes('lap') || dev.includes('mac') || dev.includes('win')) {
          logDesk++;
        } else if (dev.includes('tab') || dev.includes('pad')) {
          logTab++;
        } else {
          logMob++;
        }
      });

      const totalLogs = logMob + logDesk + logTab;
      const totalRecorded = stats.mobile + stats.desktop + stats.tablet;

      if (totalLogs > totalRecorded || totalRecorded === 0) {
        stats.mobile = Math.max(stats.mobile, logMob);
        stats.desktop = Math.max(stats.desktop, logDesk);
        stats.tablet = Math.max(stats.tablet, logTab);
      }
    }

    // 3. Reconcile with total scanCount: if scanCount > recorded device stats, attribute remainder to Mobile
    const totalScans = Number(project.scanCount) || 0;
    const currentSum = stats.mobile + stats.desktop + stats.tablet;
    if (totalScans > currentSum) {
      stats.mobile += (totalScans - currentSum);
    }

    project.deviceStats = stats;
    return stats;
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
        const publicRef = this.firestore.collection('public_projects').doc(record.id);

        // Check if public_projects already has higher scanCount so we don't accidentally overwrite scans
        try {
          const pubSnap = await publicRef.get();
          if (pubSnap.exists) {
            const pubData = pubSnap.data();
            this.normalizeDeviceStats(pubData);
            const pubScans = Number(pubData.scanCount) || 0;
            if (pubScans >= record.scanCount) {
              record.scanCount = pubScans;
              record.lastScannedAt = pubData.lastScannedAt || record.lastScannedAt;
              record.deviceStats = pubData.deviceStats;
              if (pubData.scanLogs && pubData.scanLogs.length) record.scanLogs = pubData.scanLogs;
            }
          }
        } catch (e) {}

        this.normalizeDeviceStats(record);

        if (this.currentUser) {
          const userRef = this.firestore.collection('users').doc(this.currentUser.uid);
          await userRef.collection('projects').doc(record.id).set(record, { merge: true });
        }

        // Save public projection so any smartphone scanner can read payload and log scans
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

        await this.saveLocalOnly(record);
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

          // CRITICAL FIX: Merge scanCount, lastScannedAt, deviceStats, and scanLogs from public_projects!
          await Promise.all(cloudProjects.map(async (cp) => {
            try {
              const pubDoc = await this.firestore.collection('public_projects').doc(cp.id).get();
              if (pubDoc.exists) {
                const pubData = pubDoc.data();
                this.normalizeDeviceStats(pubData);
                const pubScans = Number(pubData.scanCount) || 0;
                const cpScans = Number(cp.scanCount) || 0;
                if (pubScans >= cpScans) {
                  cp.scanCount = pubScans;
                  cp.lastScannedAt = pubData.lastScannedAt || cp.lastScannedAt;
                  cp.deviceStats = pubData.deviceStats;
                  if (pubData.scanLogs && pubData.scanLogs.length) {
                    cp.scanLogs = pubData.scanLogs;
                  }
                  // Keep user's private copy in sync asynchronously
                  userRef.collection('projects').doc(cp.id).set({
                    scanCount: cp.scanCount,
                    lastScannedAt: cp.lastScannedAt,
                    deviceStats: cp.deviceStats || {},
                    scanLogs: cp.scanLogs || []
                  }, { merge: true }).catch(() => {});
                }
              }
            } catch (err) {
              console.warn('Sync public project err:', err);
            }
            this.normalizeDeviceStats(cp);
            await this.saveLocalOnly(cp);
          }));

          return cloudProjects;
        }
      } catch (err) {
        console.warn('Pull from Firestore warning:', err);
      }
    }

    // Also for localProjects (e.g. demo mode or fallback), sync with public_projects if firestore is online
    if (this.firestore && localProjects.length > 0) {
      await Promise.all(localProjects.map(async (lp) => {
        try {
          const pubDoc = await this.firestore.collection('public_projects').doc(lp.id).get();
          if (pubDoc.exists) {
            const pubData = pubDoc.data();
            this.normalizeDeviceStats(pubData);
            const pubScans = Number(pubData.scanCount) || 0;
            const lpScans = Number(lp.scanCount) || 0;
            if (pubScans >= lpScans) {
              lp.scanCount = pubScans;
              lp.lastScannedAt = pubData.lastScannedAt || lp.lastScannedAt;
              lp.deviceStats = pubData.deviceStats;
              if (pubData.scanLogs && pubData.scanLogs.length) {
                lp.scanLogs = pubData.scanLogs;
              }
              await this.saveLocalOnly(lp);
            }
          }
        } catch (e) {}
        this.normalizeDeviceStats(lp);
      }));
    } else {
      localProjects.forEach(lp => this.normalizeDeviceStats(lp));
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

    let project = null;

    // Check Cloud first if online & configured
    if (this.firestore) {
      try {
        if (this.currentUser) {
          const userDoc = await this.firestore.collection('users').doc(this.currentUser.uid).collection('projects').doc(id).get();
          if (userDoc.exists) {
            project = userDoc.data();
          }
        }
        const publicDoc = await this.firestore.collection('public_projects').doc(id).get();
        if (publicDoc.exists) {
          const pubData = publicDoc.data();
          this.normalizeDeviceStats(pubData);
          if (project) {
            const pubScans = Number(pubData.scanCount) || 0;
            const projScans = Number(project.scanCount) || 0;
            if (pubScans >= projScans) {
              project.scanCount = pubScans;
              project.lastScannedAt = pubData.lastScannedAt || project.lastScannedAt;
              project.deviceStats = pubData.deviceStats;
              if (pubData.scanLogs && pubData.scanLogs.length) project.scanLogs = pubData.scanLogs;
            }
          } else {
            project = pubData;
          }
        }
        if (project) {
          this.normalizeDeviceStats(project);
          await this.saveLocalOnly(project);
          return project;
        }
      } catch (e) {
        // Fallback to local
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => {
        const res = request.result || null;
        if (res) this.normalizeDeviceStats(res);
        resolve(res);
      };
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
        
        this.normalizeDeviceStats(project);
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
            deviceStats: {
              [devKey]: firebase.firestore.FieldValue.increment(1)
            },
            scanLogs: firebase.firestore.FieldValue.arrayUnion(logEntry)
          };
          await publicDocRef.set(updatePayload, { merge: true });

          if (this.currentUser) {
            const userDocRef = this.firestore.collection('users').doc(this.currentUser.uid).collection('projects').doc(id);
            await userDocRef.set(updatePayload, { merge: true });
          }
        } catch (e) {
          console.warn('Sync scan to firestore warning:', e);
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
          'deviceStats.mobile': firebase.firestore.FieldValue.delete(),
          'deviceStats.desktop': firebase.firestore.FieldValue.delete(),
          'deviceStats.tablet': firebase.firestore.FieldValue.delete(),
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
      this.normalizeDeviceStats(p);
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
