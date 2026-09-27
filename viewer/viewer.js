/**
 * Dynamic QR Viewer & Scan Analytics Tracker
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Sync Theme with Generator
  const savedTheme = localStorage.getItem('antigravity_qr_theme') || 'system';
  let effectiveTheme = savedTheme;
  if (savedTheme === 'system') {
    effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', effectiveTheme);

  const loading = document.getElementById('loading-spinner');
  const redirectContainer = document.getElementById('redirect-container');
  const redirectScanBadge = document.getElementById('redirect-scan-badge');
  const redirectTargetUrl = document.getElementById('redirect-target-url');
  const btnRedirectManual = document.getElementById('btn-redirect-manual');

  const content = document.getElementById('content-container');
  const mediaBox = document.getElementById('media-box');
  const mediaTitle = document.getElementById('media-title');
  const mediaDesc = document.getElementById('media-desc');
  const actionsContainer = document.getElementById('viewer-actions');
  const scanPill = document.getElementById('scan-pill');

  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');
  const directType = urlParams.get('type');
  const directUrl = urlParams.get('url');
  const isRedirectRequested = urlParams.get('redirect') === '1';

  // Client device detection for analytics
  function detectClientInfo() {
    const ua = navigator.userAgent || '';
    let device = 'Desktop';
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
      device = /iPad|Tablet/i.test(ua) ? 'Tablet' : 'Mobile';
    }

    let os = 'Windows';
    if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Mac/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    let browser = 'Chrome';
    if (/Firefox/i.test(ua)) browser = 'Firefox';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
    else if (/Edg/i.test(ua)) browser = 'Edge';
    else if (/OPR/i.test(ua)) browser = 'Opera';

    return {
      device,
      os,
      browser,
      referrer: document.referrer ? new URL(document.referrer).hostname : 'Direct QR Scan'
    };
  }

  try {
    let itemData = null;
    let project = null;

    if (projectId) {
      await window.qrStorage.ready();
      project = await window.qrStorage.getProject(projectId);
      if (project && project.data) {
        itemData = project.data;
        // Record Scan Analytics with rich client metadata!
        const clientInfo = detectClientInfo();
        const updated = await window.qrStorage.incrementScanCount(projectId, clientInfo);
        if (updated) project = updated;
      }
    }

    if (!itemData && directUrl) {
      itemData = {
        title: urlParams.get('title') || 'Shared Media',
        description: urlParams.get('desc') || '',
        mediaUrl: directUrl,
        type: directType || 'image'
      };
    }

    if (!itemData) {
      loading.innerHTML = `
        <h2 style="color: #ef4444; margin-bottom: 0.5rem; font-size: 1.3rem;">Konten Belum Tersedia</h2>
        <p style="color: var(--text-secondary); font-size: 0.88rem; line-height: 1.5;">
          Kode QR belum disimpan ke Cloud atau data tidak ditemukan.
        </p>
        <a href="../index.html" class="btn-viewer-action btn-viewer-primary" style="margin-top: 1.5rem; display: inline-flex;">Kembali ke Generator</a>
      `;
      return;
    }

    // 1. Handle Dynamic Link Redirect (URL / Web)
    const isUrlType = (project && project.type === 'url') || isRedirectRequested;
    const destinationUrl = itemData.rawUrl || itemData.url;

    if (isUrlType && destinationUrl) {
      const finalUrl = destinationUrl.startsWith('http://') || destinationUrl.startsWith('https://') 
        ? destinationUrl 
        : 'https://' + destinationUrl;

      loading.style.display = 'none';
      redirectContainer.style.display = 'flex';
      redirectTargetUrl.textContent = finalUrl;
      btnRedirectManual.href = finalUrl;
      
      const currentScans = project ? (project.scanCount || 1) : 1;
      redirectScanBadge.innerHTML = `✓ Pemindaian ke-${currentScans} berhasil dicatat`;

      // Auto redirect after a brief visual confirmation (650ms)
      setTimeout(() => {
        window.location.replace(finalUrl);
      }, 650);
      return;
    }

    // 2. Handle Media Showcase (Photo / Video)
    mediaTitle.textContent = itemData.title || (project ? project.title : 'QR Showcase');
    mediaDesc.textContent = itemData.description || '';

    if (scanPill) {
      const currentScans = project ? (project.scanCount || 1) : 1;
      scanPill.innerHTML = `👁️ Telah dipindai ${currentScans} kali`;
    }

    if (itemData.type === 'video' || (itemData.mediaUrl && itemData.mediaUrl.match(/\.(mp4|webm|ogg)|youtube|youtu\.be/i))) {
      if (itemData.mediaUrl && (itemData.mediaUrl.includes('youtube.com') || itemData.mediaUrl.includes('youtu.be'))) {
        const videoId = extractYouTubeID(itemData.mediaUrl);
        mediaBox.innerHTML = `
          <iframe width="100%" height="315" src="https://www.youtube.com/embed/${videoId}" 
            frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowfullscreen style="border-radius: var(--radius-md);"></iframe>
        `;
      } else {
        mediaBox.innerHTML = `
          <video controls autoplay muted playsinline src="${itemData.mediaUrl || itemData.fileData}">
            Peramban Anda tidak mendukung pemutar video HTML5.
          </video>
        `;
      }
    } else {
      mediaBox.innerHTML = `
        <img src="${itemData.mediaUrl || itemData.fileData}" alt="${itemData.title || 'Foto'}" />
      `;
    }

    if (itemData.buttonText && itemData.buttonUrl) {
      const btn = document.createElement('a');
      btn.className = 'btn-viewer-action btn-viewer-primary';
      btn.href = itemData.buttonUrl;
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
      btn.textContent = itemData.buttonText;
      actionsContainer.appendChild(btn);
    }

    loading.style.display = 'none';
    content.style.display = 'block';

  } catch (err) {
    console.error('Viewer error:', err);
    loading.innerHTML = `<p style="color: #ef4444;">Terjadi kesalahan saat memuat konten.</p>`;
  }
});

function extractYouTubeID(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : '';
}
