/**
 * Antigravity QR Code Generator - Main Application Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // Global State
  let currentType = 'url';
  let currentProjectId = 'qr_' + Date.now().toString(36);
  let currentProjectTitle = 'QR Code Baru';
  let qrEngine = null;
  let qrScanner = null;
  let updateTimeout = null;

  // Initialize QR Engine & Scanner
  qrEngine = new QREngine('qr-canvas-container');
  qrScanner = new QRScannerManager();

  // -------------------------------------------------------------
  // 0. Theme Manager (Light, Dark, System Preference)
  // -------------------------------------------------------------
  const themeBtnLight = document.getElementById('theme-btn-light');
  const themeBtnDark = document.getElementById('theme-btn-dark');
  const themeBtnSystem = document.getElementById('theme-btn-system');

  let currentThemePref = localStorage.getItem('antigravity_qr_theme') || 'system';

  function applyTheme(pref) {
    currentThemePref = pref;
    localStorage.setItem('antigravity_qr_theme', pref);

    [themeBtnLight, themeBtnDark, themeBtnSystem].forEach((btn) => btn?.classList.remove('active'));
    if (pref === 'light') themeBtnLight?.classList.add('active');
    else if (pref === 'dark') themeBtnDark?.classList.add('active');
    else themeBtnSystem?.classList.add('active');

    let effectiveTheme = pref;
    if (pref === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      effectiveTheme = prefersDark ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', effectiveTheme);
  }

  themeBtnLight?.addEventListener('click', () => applyTheme('light'));
  themeBtnDark?.addEventListener('click', () => applyTheme('dark'));
  themeBtnSystem?.addEventListener('click', () => applyTheme('system'));

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentThemePref === 'system') {
      applyTheme('system');
    }
  });

  applyTheme(currentThemePref);

  // -------------------------------------------------------------
  // Mobile Hamburger Menu Controller
  // -------------------------------------------------------------
  const btnHamburger = document.getElementById('btn-hamburger');
  const headerActions = document.getElementById('header-actions');

  if (btnHamburger && headerActions) {
    btnHamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = headerActions.classList.toggle('active');
      btnHamburger.classList.toggle('active', isOpen);
      btnHamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!headerActions.contains(e.target) && !btnHamburger.contains(e.target)) {
        headerActions.classList.remove('active');
        btnHamburger.classList.remove('active');
        btnHamburger.setAttribute('aria-expanded', 'false');
      }
    });

    // Close menu when clicking actions inside
    headerActions.querySelectorAll('.btn-nav, .btn-google, .btn-logout, .theme-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        headerActions.classList.remove('active');
        btnHamburger.classList.remove('active');
        btnHamburger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // -------------------------------------------------------------
  // Google Auth Button Handlers
  // -------------------------------------------------------------
  const btnGoogleLogin = document.getElementById('btn-google-login');
  const btnLogout = document.getElementById('btn-logout');
  const modalFirebaseSetup = document.getElementById('firebase-setup-modal');
  const btnCloseFirebaseModal = document.getElementById('btn-close-firebase-modal');
  const btnSyncLocalCloud = document.getElementById('btn-sync-local-cloud');

  btnGoogleLogin?.addEventListener('click', () => {
    window.authManager.loginWithGoogle();
  });

  btnLogout?.addEventListener('click', () => {
    window.authManager.logout();
  });

  btnCloseFirebaseModal?.addEventListener('click', () => {
    modalFirebaseSetup?.classList.remove('active');
  });

  btnSyncLocalCloud?.addEventListener('click', async () => {
    try {
      btnSyncLocalCloud.textContent = 'Menyinkronkan...';
      const count = await window.qrStorage.syncLocalProjectsToCloud();
      window.showToast(`${count} proyek berhasil disinkronkan ke Cloud Google!`, 'success');
      btnSyncLocalCloud.style.display = 'none';
      renderProjectsList();
    } catch (err) {
      window.showToast(err.message, 'error');
    } finally {
      btnSyncLocalCloud.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
        <span>Sinkronkan Proyek Lokal ke Akun Google Anda</span>
      `;
    }
  });

  window.addEventListener('auth-changed', () => {
    updateProjectsBadge();
    if (document.getElementById('projects-modal')?.classList.contains('active')) {
      renderProjectsList();
    }
  });

  // Toast System
  window.showToast = function (message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 3200);
  };

  // -------------------------------------------------------------
  // 1. Tab Navigation (QR Content Types)
  // -------------------------------------------------------------
  const typeTabs = document.querySelectorAll('.type-tab-btn');
  const typeSections = document.querySelectorAll('.type-form-panel');

  typeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const type = tab.getAttribute('data-type');
      setActiveType(type);
    });
  });

  function setActiveType(type) {
    currentType = type;
    typeTabs.forEach((t) => t.classList.toggle('active', t.getAttribute('data-type') === type));
    typeSections.forEach((s) => s.style.display = s.getAttribute('data-type') === type ? 'block' : 'none');

    triggerLiveUpdate();
  }

  // -------------------------------------------------------------
  // 2. Payload Construction Logic
  // -------------------------------------------------------------
  function getPayloadData() {
    switch (currentType) {
      case 'url': {
        const val = document.getElementById('input-url')?.value.trim() || 'https://google.com';
        const target = val.startsWith('http://') || val.startsWith('https://') ? val : 'https://' + val;
        const isDynamic = Boolean(document.getElementById('check-dynamic-url')?.checked);
        if (isDynamic) {
          const origin = window.location.origin;
          const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
          return `${origin}${basePath}viewer/index.html?id=${currentProjectId}&redirect=1`;
        }
        return target;
      }
      case 'photo': {
        const origin = window.location.origin;
        const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
        return `${origin}${basePath}viewer/index.html?id=${currentProjectId}&type=image`;
      }
      case 'video': {
        const origin = window.location.origin;
        const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
        return `${origin}${basePath}viewer/index.html?id=${currentProjectId}&type=video`;
      }
      case 'whatsapp': {
        let phone = document.getElementById('input-wa-phone')?.value.replace(/[^0-9]/g, '') || '';
        const msg = document.getElementById('input-wa-msg')?.value.trim() || '';
        if (phone.startsWith('0')) {
          phone = '62' + phone.substring(1);
        }
        return `https://wa.me/${phone}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
      }
      case 'wifi': {
        const ssid = document.getElementById('input-wifi-ssid')?.value.trim() || 'MyWiFiNetwork';
        const pass = document.getElementById('input-wifi-pass')?.value || '';
        const enc = document.getElementById('select-wifi-enc')?.value || 'WPA';
        const hidden = document.getElementById('check-wifi-hidden')?.checked || false;
        return `WIFI:S:${ssid};T:${enc};P:${pass};${hidden ? 'H:true' : ''};;`;
      }
      case 'text': {
        return document.getElementById('input-plain-text')?.value.trim() || 'Halo, ini pesan dari QR Code!';
      }
      case 'vcard': {
        const fn = document.getElementById('input-vcard-first')?.value.trim() || 'Budi';
        const ln = document.getElementById('input-vcard-last')?.value.trim() || 'Santoso';
        const phone = document.getElementById('input-vcard-phone')?.value.trim() || '+628123456789';
        const email = document.getElementById('input-vcard-email')?.value.trim() || 'budi@kantor.com';
        const org = document.getElementById('input-vcard-org')?.value.trim() || '';
        const title = document.getElementById('input-vcard-title')?.value.trim() || '';
        const web = document.getElementById('input-vcard-web')?.value.trim() || '';

        return `BEGIN:VCARD\nVERSION:3.0\nN:${ln};${fn};;;\nFN:${fn} ${ln}\nORG:${org}\nTITLE:${title}\nTEL;TYPE=CELL:${phone}\nEMAIL:${email}\nURL:${web}\nEND:VCARD`;
      }
      case 'email': {
        const email = document.getElementById('input-email-to')?.value.trim() || 'kontak@perusahaan.com';
        const sub = document.getElementById('input-email-sub')?.value.trim() || '';
        const body = document.getElementById('input-email-body')?.value.trim() || '';
        return `mailto:${email}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}`;
      }
      default:
        return 'https://google.com';
    }
  }

  function triggerLiveUpdate() {
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(() => {
      const payload = getPayloadData();
      qrEngine.update({ data: payload });
    }, 120);
  }

  document.querySelectorAll('.type-form-panel input, .type-form-panel textarea, .type-form-panel select').forEach((el) => {
    el.addEventListener('input', triggerLiveUpdate);
    el.addEventListener('change', triggerLiveUpdate);
  });

  // -------------------------------------------------------------
  // 3. Media Upload Handlers (Photo & Video)
  // -------------------------------------------------------------
  const photoUploadInput = document.getElementById('input-photo-file');
  const photoDropZone = document.getElementById('photo-drop-zone');
  const photoPreview = document.getElementById('photo-preview-container');
  const photoImg = document.getElementById('photo-preview-img');
  const btnRemovePhoto = document.getElementById('btn-remove-photo');

  if (photoDropZone && photoUploadInput) {
    photoDropZone.addEventListener('click', () => photoUploadInput.click());
    photoUploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          photoImg.src = evt.target.result;
          photoPreview.style.display = 'block';
          photoDropZone.style.display = 'none';
          triggerLiveUpdate();
        };
        reader.readAsDataURL(file);
      }
    });

    if (btnRemovePhoto) {
      btnRemovePhoto.addEventListener('click', (e) => {
        e.stopPropagation();
        photoUploadInput.value = '';
        photoImg.src = '';
        photoPreview.style.display = 'none';
        photoDropZone.style.display = 'block';
        triggerLiveUpdate();
      });
    }
  }

  // -------------------------------------------------------------
  // 4. Accordion Toggle
  // -------------------------------------------------------------
  const accordionItems = document.querySelectorAll('.accordion-item');
  accordionItems.forEach((item) => {
    const header = item.querySelector('.accordion-header');
    header.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      accordionItems.forEach((i) => i.classList.remove('open'));
      if (!isOpen) {
        item.classList.add('open');
      }
    });
  });

  // -------------------------------------------------------------
  // 5. 1-Click Design Templates
  // -------------------------------------------------------------
  const templatesContainer = document.getElementById('templates-grid');
  if (templatesContainer && window.QR_TEMPLATES) {
    window.QR_TEMPLATES.forEach((tpl) => {
      const card = document.createElement('div');
      card.className = 'template-card';
      const isSolid = tpl.color1 === tpl.color2 || tpl.gradientType === 'none';
      card.innerHTML = `
        <div class="template-preview-dot" style="background: ${isSolid ? tpl.color1 : `linear-gradient(${tpl.gradientAngle}deg, ${tpl.color1}, ${tpl.color2})`};"></div>
        <div class="template-name">${tpl.name}</div>
      `;
      card.addEventListener('click', () => {
        document.querySelectorAll('.template-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        applyTemplate(tpl);
      });
      templatesContainer.appendChild(card);
    });
  }

  function applyTemplate(tpl) {
    const isSolid = tpl.color1 === tpl.color2 || tpl.gradientType === 'none';
    const colorType = isSolid ? 'solid' : 'gradient';

    const color1Input = document.getElementById('picker-color1');
    const color2Input = document.getElementById('picker-color2');
    const colorTypeSelect = document.getElementById('select-color-type');
    const frameSelect = document.getElementById('select-frame-style');
    const frameTextInput = document.getElementById('input-frame-text');

    if (color1Input) color1Input.value = tpl.color1;
    if (color2Input) color2Input.value = tpl.color2;
    if (colorTypeSelect) colorTypeSelect.value = colorType;
    if (frameSelect) frameSelect.value = tpl.frame || 'none';
    if (frameTextInput && tpl.frameText) frameTextInput.value = tpl.frameText;

    const color2Container = document.getElementById('color2-picker-container');
    const gradientRow = document.getElementById('gradient-controls-row');
    if (color2Container) color2Container.style.display = isSolid ? 'none' : 'flex';
    if (gradientRow) gradientRow.style.display = isSolid ? 'none' : 'block';

    const labelColor1 = document.getElementById('hex-color1');
    const labelColor2 = document.getElementById('hex-color2');
    if (labelColor1) labelColor1.textContent = tpl.color1;
    if (labelColor2) labelColor2.textContent = tpl.color2;

    setActiveStyleBtn('dotsType', tpl.dotsType);
    setActiveStyleBtn('cornersSquareType', tpl.cornerSquareType);
    setActiveStyleBtn('cornersDotType', tpl.cornerDotType);

    qrEngine.update({
      colorType: colorType,
      color1: tpl.color1,
      color2: isSolid ? tpl.color1 : tpl.color2,
      gradientAngle: tpl.gradientAngle || 45,
      dotsType: tpl.dotsType,
      cornersSquareType: tpl.cornerSquareType,
      cornersDotType: tpl.cornerDotType,
      bgColor: tpl.bgColor || '#ffffff',
      frameStyle: tpl.frame || 'none',
      frameText: tpl.frameText || 'SCAN ME'
    });

    window.showToast(`Template "${tpl.name}" diterapkan!`, 'info');
  }

  // -------------------------------------------------------------
  // 6. Shape & Style Buttons (Dots & Corners)
  // -------------------------------------------------------------
  function bindStyleOptions(category, property) {
    const buttons = document.querySelectorAll(`[data-${category}]`);
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const val = btn.getAttribute(`data-${category}`);
        qrEngine.update({ [property]: val });
      });
    });
  }

  function setActiveStyleBtn(property, value) {
    const categoryMap = {
      dotsType: 'dot-style',
      cornersSquareType: 'corner-square-style',
      cornersDotType: 'corner-dot-style'
    };
    const cat = categoryMap[property];
    if (!cat) return;
    const buttons = document.querySelectorAll(`[data-${cat}]`);
    buttons.forEach((b) => {
      b.classList.toggle('active', b.getAttribute(`data-${cat}`) === value);
    });
  }

  bindStyleOptions('dot-style', 'dotsType');
  bindStyleOptions('corner-square-style', 'cornersSquareType');
  bindStyleOptions('corner-dot-style', 'cornersDotType');

  // -------------------------------------------------------------
  // 7. Colors & Gradient Handlers
  // -------------------------------------------------------------
  const pickerColor1 = document.getElementById('picker-color1');
  const pickerColor2 = document.getElementById('picker-color2');
  const pickerBg = document.getElementById('picker-bg');
  const selectColorType = document.getElementById('select-color-type');
  const rangeGradientAngle = document.getElementById('range-gradient-angle');
  const labelColor1 = document.getElementById('hex-color1');
  const labelColor2 = document.getElementById('hex-color2');
  const labelBg = document.getElementById('hex-bg');
  const color2Container = document.getElementById('color2-picker-container');
  const gradientRow = document.getElementById('gradient-controls-row');

  function updateColors() {
    const type = selectColorType?.value || 'solid';
    const c1 = pickerColor1?.value || '#0f172a';
    let c2 = pickerColor2?.value || '#0f172a';
    const bg = pickerBg?.value || '#ffffff';
    const angle = parseInt(rangeGradientAngle?.value, 10) || 45;

    if (type === 'solid') {
      c2 = c1;
      if (pickerColor2) pickerColor2.value = c1;
    }

    if (labelColor1) labelColor1.textContent = c1.toUpperCase();
    if (labelColor2) labelColor2.textContent = c2.toUpperCase();
    if (labelBg) labelBg.textContent = bg.toUpperCase();

    if (color2Container) {
      color2Container.style.display = type === 'gradient' ? 'flex' : 'none';
    }
    if (gradientRow) {
      gradientRow.style.display = type === 'gradient' ? 'block' : 'none';
    }

    qrEngine.update({
      colorType: type,
      color1: c1,
      color2: c2,
      bgColor: bg,
      gradientAngle: angle
    });
  }

  pickerColor1?.addEventListener('input', updateColors);
  pickerColor2?.addEventListener('input', updateColors);
  pickerBg?.addEventListener('input', updateColors);
  selectColorType?.addEventListener('change', updateColors);
  rangeGradientAngle?.addEventListener('input', (e) => {
    document.getElementById('gradient-angle-val').textContent = e.target.value + '°';
    updateColors();
  });

  document.querySelectorAll('.swatch-item').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      const c1 = swatch.getAttribute('data-c1');
      const c2 = swatch.getAttribute('data-c2') || c1;
      const isSolid = (c1.toLowerCase() === c2.toLowerCase());

      if (selectColorType) selectColorType.value = isSolid ? 'solid' : 'gradient';
      if (pickerColor1) pickerColor1.value = c1;
      if (pickerColor2) pickerColor2.value = c2;
      
      updateColors();
      window.showToast(`Warna "${swatch.title}" dipilih`, 'info');
    });
  });

  // -------------------------------------------------------------
  // 8. Center Logo Handling (Reliable Data URIs)
  // -------------------------------------------------------------
  const logoPresetButtons = document.querySelectorAll('.logo-preset-btn');
  const logoUploadInput = document.getElementById('input-logo-file');
  const btnUploadLogo = document.getElementById('btn-upload-logo');
  const sliderLogoSize = document.getElementById('range-logo-size');
  const sliderLogoMargin = document.getElementById('range-logo-margin');
  const checkHideDots = document.getElementById('check-hide-dots');

  logoPresetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      logoPresetButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const preset = btn.getAttribute('data-preset');

      if (!preset || preset === 'none') {
        qrEngine.update({ logo: '' });
        window.showToast('Logo dihapus', 'info');
      } else if (window.PRESET_ICONS && window.PRESET_ICONS[preset]) {
        const dataUri = window.PRESET_ICONS[preset];
        qrEngine.update({ logo: dataUri });
        window.showToast(`Logo ${btn.getAttribute('title') || preset} dipasang!`, 'success');
      }
    });
  });

  if (btnUploadLogo && logoUploadInput) {
    btnUploadLogo.addEventListener('click', () => logoUploadInput.click());
    logoUploadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          logoPresetButtons.forEach((b) => b.classList.remove('active'));
          qrEngine.update({ logo: evt.target.result });
          window.showToast('Logo kustom berhasil dimuat!', 'success');
        };
        reader.readAsDataURL(file);
      }
    });
  }

  sliderLogoSize?.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('logo-size-val').textContent = Math.round(val * 100) + '%';
    qrEngine.update({ logoSize: val });
  });

  sliderLogoMargin?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    document.getElementById('logo-margin-val').textContent = val + 'px';
    qrEngine.update({ logoMargin: val });
  });

  checkHideDots?.addEventListener('change', (e) => {
    qrEngine.update({ hideDotsBehindLogo: e.target.checked });
  });

  // -------------------------------------------------------------
  // 9. Frame & CTA Badge
  // -------------------------------------------------------------
  const selectFrameStyle = document.getElementById('select-frame-style');
  const inputFrameText = document.getElementById('input-frame-text');
  const pickerFrameBg = document.getElementById('picker-frame-bg');
  const pickerFrameText = document.getElementById('picker-frame-text');

  function updateFrame() {
    const style = selectFrameStyle?.value || 'none';
    const text = inputFrameText?.value || 'SCAN ME';
    const bg = pickerFrameBg?.value || '#0f172a';
    const textColor = pickerFrameText?.value || '#ffffff';

    qrEngine.update({
      frameStyle: style,
      frameText: text,
      frameBgColor: bg,
      frameTextColor: textColor
    });
  }

  selectFrameStyle?.addEventListener('change', updateFrame);
  inputFrameText?.addEventListener('input', updateFrame);
  pickerFrameBg?.addEventListener('input', updateFrame);
  pickerFrameText?.addEventListener('input', updateFrame);

  // Advanced Error Correction
  const selectEcl = document.getElementById('select-ecl');
  selectEcl?.addEventListener('change', (e) => {
    qrEngine.update({ errorCorrectionLevel: e.target.value });
  });

  // -------------------------------------------------------------
  // 10. Downloads & Copy Actions
  // -------------------------------------------------------------
  const btnDownloadPng = document.getElementById('btn-download-png');
  const btnDownloadSvg = document.getElementById('btn-download-svg');
  const btnDownloadWebp = document.getElementById('btn-download-webp');
  const btnCopyClipboard = document.getElementById('btn-copy-clipboard');
  const selectResolution = document.getElementById('select-resolution');

  btnDownloadPng?.addEventListener('click', async () => {
    const res = parseInt(selectResolution?.value, 10) || 1024;
    try {
      await QRExporter.downloadPNG(qrEngine, res, currentProjectTitle.toLowerCase().replace(/\s+/g, '-'));
      window.showToast(`QR Code PNG (${res}px) berhasil diunduh!`, 'success');
    } catch (err) {
      console.error(err);
      window.showToast('Gagal mengunduh gambar PNG.', 'error');
    }
  });

  btnDownloadSvg?.addEventListener('click', async () => {
    try {
      await QRExporter.downloadSVG(qrEngine, currentProjectTitle.toLowerCase().replace(/\s+/g, '-'));
      window.showToast('QR Code Vector SVG berhasil diunduh!', 'success');
    } catch (err) {
      console.error(err);
      window.showToast('Gagal mengunduh file SVG.', 'error');
    }
  });

  btnDownloadWebp?.addEventListener('click', async () => {
    const res = parseInt(selectResolution?.value, 10) || 1024;
    try {
      await QRExporter.downloadWebP(qrEngine, res, currentProjectTitle.toLowerCase().replace(/\s+/g, '-'));
      window.showToast('QR Code WebP berhasil diunduh!', 'success');
    } catch (err) {
      console.error(err);
      window.showToast('Gagal mengunduh file WebP.', 'error');
    }
  });

  btnCopyClipboard?.addEventListener('click', async () => {
    try {
      await QRExporter.copyToClipboard(qrEngine);
      window.showToast('QR Code berhasil disalin ke clipboard!', 'success');
    } catch (err) {
      console.error(err);
      window.showToast('Browser tidak mendukung penyalinan gambar.', 'error');
    }
  });

  // -------------------------------------------------------------
  // 11. Project Storage, Auth Gating, and Scan Analytics
  // -------------------------------------------------------------
  const btnSaveProject = document.getElementById('btn-save-project');
  const btnOpenProjects = document.getElementById('btn-open-projects');
  const modalProjects = document.getElementById('projects-modal');
  const btnCloseProjects = document.getElementById('btn-close-projects');
  const projectsListContainer = document.getElementById('projects-list');
  const headerProjectCount = document.getElementById('badge-project-count');

  // Auth Prompt Modal Elements
  const authPromptModal = document.getElementById('auth-prompt-modal');
  const btnCloseAuthPrompt = document.getElementById('btn-close-auth-prompt');
  const btnPromptLoginGoogle = document.getElementById('btn-prompt-login-google');
  const btnPromptLoginDemo = document.getElementById('btn-prompt-login-demo');
  const btnPromptCancel = document.getElementById('btn-prompt-cancel');

  // Detailed Analytics Modal Elements
  const modalAnalyticsDetail = document.getElementById('analytics-detail-modal');
  const btnCloseAnalyticsDetail = document.getElementById('btn-close-analytics-detail');
  const btnCloseAnalyticsBottom = document.getElementById('btn-close-analytics-bottom');
  const detailProjectTitle = document.getElementById('detail-project-title');
  const detailProjectId = document.getElementById('detail-project-id');
  const detailProjectType = document.getElementById('detail-project-type');
  const detailTrackingUrl = document.getElementById('detail-tracking-url');
  const btnCopyTrackingUrl = document.getElementById('btn-copy-tracking-url');
  const btnOpenTrackingUrl = document.getElementById('btn-open-tracking-url');
  const detailStatScans = document.getElementById('detail-stat-scans');
  const detailStatLastTime = document.getElementById('detail-stat-last-time');
  const detailStatMobilePct = document.getElementById('detail-stat-mobile-pct');
  const detailStatTopBrowser = document.getElementById('detail-stat-top-browser');
  const barMobile = document.getElementById('bar-mobile');
  const barDesktop = document.getElementById('bar-desktop');
  const barTablet = document.getElementById('bar-tablet');
  const labelMobileCount = document.getElementById('label-mobile-count');
  const labelDesktopCount = document.getElementById('label-desktop-count');
  const labelTabletCount = document.getElementById('label-tablet-count');
  const scanLogsList = document.getElementById('scan-logs-list');
  const btnSimulateScanAction = document.getElementById('btn-simulate-scan-action');
  const btnResetScansConfirm = document.getElementById('btn-reset-scans-confirm');

  // QR Preview Lightbox Modal Elements
  const modalQrLightbox = document.getElementById('qr-preview-lightbox-modal');
  const btnCloseQrLightbox = document.getElementById('btn-close-qr-lightbox');
  const lightboxProjectTitle = document.getElementById('lightbox-project-title');
  const lightboxProjectMeta = document.getElementById('lightbox-project-meta');
  const lightboxQrImage = document.getElementById('lightbox-qr-image');
  const btnLightboxDownload = document.getElementById('btn-lightbox-download');
  const btnLightboxEdit = document.getElementById('btn-lightbox-edit');
  let activeLightboxProject = null;

  function openQrLightbox(proj) {
    if (!proj || !modalQrLightbox) return;
    activeLightboxProject = proj;
    if (lightboxProjectTitle) lightboxProjectTitle.textContent = proj.title || 'QR Code';
    const scans = proj.scanCount || 0;
    const typeLabel = proj.type ? proj.type.toUpperCase() : 'URL';
    const dynamicLabel = proj.isDynamic ? ' • DINAMIS' : '';
    if (lightboxProjectMeta) {
      lightboxProjectMeta.textContent = `${typeLabel}${dynamicLabel} • ${scans} scan`;
    }
    if (lightboxQrImage) {
      lightboxQrImage.src = proj.thumbnail || '';
      lightboxQrImage.alt = proj.title || 'QR Code';
    }
    modalQrLightbox.classList.add('active');
  }

  // Download Resolution Modal Elements & Actions (Simpel: Format, Resolusi/Ukuran, Tombol Unduh)
  const modalDownloadResolution = document.getElementById('download-resolution-modal');
  const btnCloseDownloadResolution = document.getElementById('btn-close-download-resolution');
  const downloadModalProjectName = document.getElementById('download-modal-project-name');
  const downloadFormatSegmented = document.getElementById('download-format-segmented');
  const groupDownloadResolution = document.getElementById('group-download-resolution');
  const selectDownloadRes = document.getElementById('select-download-res');
  const downloadFileSizeEstimate = document.getElementById('download-file-size-estimate');
  const checkDownloadTransparent = document.getElementById('check-download-transparent');
  const btnDoDownloadAction = document.getElementById('btn-do-download-action');
  const labelDoDownload = document.getElementById('label-do-download');

  let activeDownloadTargetProject = null;
  let currentDownloadFormat = 'png';

  function updateDownloadModalUI() {
    if (!labelDoDownload || !selectDownloadRes) return;
    const resVal = selectDownloadRes.value;
    const selectedOpt = selectDownloadRes.options[selectDownloadRes.selectedIndex];
    const sizeEst = selectedOpt?.getAttribute('data-size') || '';

    // Checkbox transparan hanya bisa diklik saat format PNG; selain PNG dibuat disabled & agak transparan
    const isPng = currentDownloadFormat === 'png';
    const labelTrans = document.getElementById('label-download-transparent') || checkDownloadTransparent?.closest('label');
    if (checkDownloadTransparent) {
      checkDownloadTransparent.disabled = !isPng;
    }
    if (labelTrans) {
      labelTrans.style.opacity = isPng ? '1' : '0.35';
      labelTrans.style.pointerEvents = isPng ? 'auto' : 'none';
      labelTrans.style.cursor = isPng ? 'pointer' : 'not-allowed';
    }

    if (currentDownloadFormat === 'svg') {
      if (groupDownloadResolution) groupDownloadResolution.style.opacity = '0.4';
      if (selectDownloadRes) selectDownloadRes.disabled = true;
      if (downloadFileSizeEstimate) downloadFileSizeEstimate.textContent = 'Vektor Tak Terbatas (~15 KB)';
      labelDoDownload.textContent = 'Unduh Vektor SVG';
    } else {
      if (groupDownloadResolution) groupDownloadResolution.style.opacity = '1';
      if (selectDownloadRes) selectDownloadRes.disabled = false;
      if (downloadFileSizeEstimate) downloadFileSizeEstimate.textContent = `Ukuran: ${sizeEst}`;
      const transText = (isPng && checkDownloadTransparent?.checked) ? ' Transparan' : '';
      labelDoDownload.textContent = `Unduh ${currentDownloadFormat.toUpperCase()}${transText} (${resVal} px)`;
    }
  }

  function openDownloadResolutionModal(proj) {
    if (!proj || !modalDownloadResolution) return;
    activeDownloadTargetProject = proj;
    if (downloadModalProjectName) {
      downloadModalProjectName.textContent = proj.title || 'QR Code';
    }

    // Reset default ke PNG 1024px & non-transparan
    currentDownloadFormat = 'png';
    downloadFormatSegmented?.querySelectorAll('.seg-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-format') === 'png');
    });
    if (selectDownloadRes) {
      selectDownloadRes.value = '1024';
      selectDownloadRes.disabled = false;
    }
    if (checkDownloadTransparent) {
      checkDownloadTransparent.checked = false;
    }
    updateDownloadModalUI();

    modalDownloadResolution.classList.add('active');
  }

  // Event listener format selector (PNG, SVG, WebP semua bisa diklik)
  downloadFormatSegmented?.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadFormatSegmented.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDownloadFormat = btn.getAttribute('data-format') || 'png';
      updateDownloadModalUI();
    });
  });

  // Event listener perubahan resolusi & checkbox transparan
  selectDownloadRes?.addEventListener('change', () => {
    updateDownloadModalUI();
  });

  checkDownloadTransparent?.addEventListener('change', () => {
    updateDownloadModalUI();
  });

  // Event listener tombol unduh utama
  btnDoDownloadAction?.addEventListener('click', async () => {
    if (!activeDownloadTargetProject) return;
    const res = parseInt(selectDownloadRes?.value, 10) || 1024;
    const isTransparent = Boolean(currentDownloadFormat === 'png' && checkDownloadTransparent?.checked);
    await executeResolutionDownload(activeDownloadTargetProject, res, currentDownloadFormat, isTransparent);
  });

  async function executeResolutionDownload(targetProject, resolution = 1024, format = 'png', isTransparent = false) {
    if (!targetProject) {
      window.showToast('Data proyek tidak ditemukan.', 'error');
      return;
    }

    const cleanTitle = (targetProject.title || 'qr-code').trim().replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '_');

    window.showToast(`Menyiapkan ${format.toUpperCase()} (${resolution}px)...`, 'info');

    try {
      if (format === 'svg') {
        if (targetProject.qrConfig && typeof QRCodeStyling !== 'undefined') {
          const dummy = Object.create(QREngine.prototype);
          dummy.state = { ...targetProject.qrConfig };
          const svgOptions = dummy.buildQRCodeOptions(1000);
          svgOptions.type = 'svg';
          const svgQR = new QRCodeStyling(svgOptions);
          const rawBlob = await svgQR.getRawData('svg');
          const link = document.createElement('a');
          link.download = `${cleanTitle}_vector.svg`;
          link.href = URL.createObjectURL(rawBlob);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.showToast(`Berhasil mengunduh format Vektor SVG "${targetProject.title}"!`, 'success');
          modalDownloadResolution?.classList.remove('active');
          return;
        } else {
          window.showToast('Format SVG memerlukan konfigurasi QR asli.', 'warning');
        }
      }

      let canvasToDownload = null;

      if (targetProject.qrConfig && typeof QRCodeStyling !== 'undefined') {
        const dummy = Object.create(QREngine.prototype);
        dummy.state = { ...targetProject.qrConfig };
        if (isTransparent && format === 'png') {
          dummy.state.bgColor = 'transparent';
        }
        canvasToDownload = await dummy.getFramedCanvas(resolution);
      } else if (targetProject.thumbnail) {
        // Fallback upscale dari thumbnail
        canvasToDownload = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const cvs = document.createElement('canvas');
            cvs.width = resolution;
            cvs.height = resolution;
            const ctx = cvs.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, resolution, resolution);
            if (isTransparent && format === 'png') {
              try {
                const imgData = ctx.getImageData(0, 0, resolution, resolution);
                const d = imgData.data;
                for (let i = 0; i < d.length; i += 4) {
                  if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) {
                    d[i + 3] = 0;
                  }
                }
                ctx.putImageData(imgData, 0, 0);
              } catch (e) {
                console.warn('Canvas pixel transparency fallback error:', e);
              }
            }
            resolve(cvs);
          };
          img.src = targetProject.thumbnail;
        });
      }

      if (!canvasToDownload) {
        throw new Error('Gagal menghasilkan kanvas QR');
      }

      const mimeType = format === 'webp' ? 'image/webp' : 'image/png';
      const ext = format === 'webp' ? 'webp' : 'png';
      const dataUrl = canvasToDownload.toDataURL(mimeType, 1.0);

      const transSuffix = (isTransparent && format === 'png') ? '_transparent' : '';
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${cleanTitle}_${resolution}px${transSuffix}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const successLabel = isTransparent ? ' (PNG Transparan)' : ` (${ext.toUpperCase()})`;
      window.showToast(`Berhasil mengunduh QR Code ${resolution}px${successLabel}!`, 'success');
      modalDownloadResolution?.classList.remove('active');
    } catch (err) {
      console.error('Error generating resolution download:', err);
      // Fallback aman ke thumbnail
      if (targetProject.thumbnail) {
        const link = document.createElement('a');
        link.href = targetProject.thumbnail;
        link.download = `${cleanTitle}_qr.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.showToast(`Mengunduh versi standar...`, 'info');
        modalDownloadResolution?.classList.remove('active');
      } else {
        window.showToast('Gagal mengunduh gambar QR Code.', 'error');
      }
    }
  }

  btnCloseDownloadResolution?.addEventListener('click', () => {
    modalDownloadResolution?.classList.remove('active');
  });

  btnCloseQrLightbox?.addEventListener('click', () => {
    modalQrLightbox?.classList.remove('active');
  });

  btnLightboxDownload?.addEventListener('click', () => {
    if (activeLightboxProject) {
      openDownloadResolutionModal(activeLightboxProject);
    }
  });

  btnLightboxEdit?.addEventListener('click', () => {
    if (activeLightboxProject) {
      loadProjectIntoEditor(activeLightboxProject);
      modalQrLightbox?.classList.remove('active');
      modalProjects?.classList.remove('active');
    }
  });

  // Search & Filter
  const inputSearchProjects = document.getElementById('input-search-projects');
  const selectSortProjects = document.getElementById('select-sort-projects');

  let pendingSaveAfterLogin = false;
  let activeAnalyticsProjectId = null;
  let cachedProjectsList = [];

  async function updateProjectsBadge() {
    try {
      if (!window.authManager?.currentUser) {
        if (headerProjectCount) headerProjectCount.textContent = '0';
        return;
      }
      const list = await window.qrStorage.getAllProjects();
      if (headerProjectCount) {
        headerProjectCount.textContent = list.length;
      }
    } catch (e) {
      console.warn('Get projects badge failed:', e);
    }
  }

  // SAVE PROJECT FLOW
  btnSaveProject?.addEventListener('click', async () => {
    // Mode Tamu tidak menyimpan data: tampilkan popup login
    if (!window.authManager?.currentUser) {
      pendingSaveAfterLogin = true;
      authPromptModal?.classList.add('active');
      return;
    }
    await executeSaveProjectFlow();
  });

  btnOpenProjects?.addEventListener('click', async () => {
    if (!window.authManager?.currentUser) {
      pendingSaveAfterLogin = false;
      authPromptModal?.classList.add('active');
      return;
    }
    await renderProjectsList();
    modalProjects?.classList.add('active');
  });

  // Auth Prompt Actions
  btnPromptLoginGoogle?.addEventListener('click', async () => {
    authPromptModal?.classList.remove('active');
    const user = await window.authManager.loginWithGoogle();
    if (user && pendingSaveAfterLogin) {
      pendingSaveAfterLogin = false;
      await executeSaveProjectFlow();
    }
  });

  btnPromptLoginDemo?.addEventListener('click', async () => {
    authPromptModal?.classList.remove('active');
    const user = window.authManager.loginWithDemoUser();
    if (user && pendingSaveAfterLogin) {
      pendingSaveAfterLogin = false;
      await executeSaveProjectFlow();
    }
  });

  [btnCloseAuthPrompt, btnPromptCancel].forEach((btn) => {
    btn?.addEventListener('click', () => {
      authPromptModal?.classList.remove('active');
      pendingSaveAfterLogin = false;
    });
  });

  async function executeSaveProjectFlow() {
    const titlePrompt = prompt('Beri nama / label untuk proyek QR ini:', currentProjectTitle);
    if (titlePrompt === null) return; // User cancelled prompt
    if (titlePrompt.trim()) {
      currentProjectTitle = titlePrompt.trim();
    }

    try {
      const canvas = await qrEngine.getFramedCanvas(300);
      const thumbnailData = canvas.toDataURL('image/png', 0.85);
      const isDynamicUrl = Boolean(document.getElementById('check-dynamic-url')?.checked);

      const projectPayload = {
        title: currentProjectTitle,
        type: currentType,
        isDynamic: currentType === 'photo' || currentType === 'video' || isDynamicUrl,
        mediaUrl: document.getElementById('input-photo-url')?.value || document.getElementById('input-video-url')?.value || '',
        fileData: document.getElementById('photo-preview-img')?.src || '',
        description: document.getElementById('input-photo-desc')?.value || document.getElementById('input-video-desc')?.value || '',
        rawUrl: document.getElementById('input-url')?.value || '',
        waPhone: document.getElementById('input-wa-phone')?.value || '',
        waMsg: document.getElementById('input-wa-msg')?.value || '',
        wifiSsid: document.getElementById('input-wifi-ssid')?.value || '',
        wifiPass: document.getElementById('input-wifi-pass')?.value || ''
      };

      const existing = await window.qrStorage.getProject(currentProjectId);

      await window.qrStorage.saveProject({
        id: currentProjectId,
        title: currentProjectTitle,
        type: currentType,
        isDynamic: projectPayload.isDynamic,
        data: projectPayload,
        qrConfig: { ...qrEngine.state },
        thumbnail: thumbnailData,
        scanCount: existing?.scanCount || 0,
        lastScannedAt: existing?.lastScannedAt || null,
        deviceStats: existing?.deviceStats || { mobile: 0, desktop: 0, tablet: 0 },
        scanLogs: existing?.scanLogs || []
      });

      document.getElementById('current-project-id-badge').textContent = currentProjectId;
      await updateProjectsBadge();

      window.showToast(
        `Proyek "${currentProjectTitle}" berhasil disimpan ke Akun Anda!`,
        'success'
      );
    } catch (err) {
      console.error('Save project error:', err);
      window.showToast('Gagal menyimpan proyek QR.', 'error');
    }
  }

  // RENDER PROJECTS & SCAN ANALYTICS LIST
  async function renderProjectsList() {
    if (!projectsListContainer) return;
    projectsListContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 2rem 0;">Memuat riwayat proyek & analitik...</p>';

    cachedProjectsList = await window.qrStorage.getAllProjects();
    const analytics = await window.qrStorage.getAnalyticsSummary();

    // Update Top Analytics KPI Stats
    const statTotalProj = document.getElementById('stat-total-projects');
    const statTotalScans = document.getElementById('stat-total-scans');
    const statTopQr = document.getElementById('stat-top-qr');
    const statDeviceRatio = document.getElementById('stat-device-ratio');

    if (statTotalProj) statTotalProj.textContent = analytics.totalProjects;
    if (statTotalScans) statTotalScans.textContent = analytics.totalScans;
    if (statTopQr) {
      statTopQr.textContent = analytics.topProject ? `${analytics.topProject.title} (${analytics.topProject.scanCount}x)` : '-';
    }
    if (statDeviceRatio) {
      statDeviceRatio.textContent = (analytics.mobileRatio || 0) + '%';
    }

    displayFilteredProjects();
  }

  function displayFilteredProjects() {
    if (!projectsListContainer) return;

    let filtered = [...cachedProjectsList];
    const query = inputSearchProjects?.value.trim().toLowerCase() || '';
    if (query) {
      filtered = filtered.filter(p => (p.title || '').toLowerCase().includes(query) || (p.type || '').toLowerCase().includes(query));
    }

    const sortMode = selectSortProjects?.value || 'date-desc';
    filtered.sort((a, b) => {
      if (sortMode === 'scans-desc') return (b.scanCount || 0) - (a.scanCount || 0);
      if (sortMode === 'date-desc') return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
      if (sortMode === 'date-asc') return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
      if (sortMode === 'title-asc') return (a.title || '').localeCompare(b.title || '');
      return 0;
    });

    if (filtered.length === 0) {
      projectsListContainer.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <path d="M7 7h.01M17 7h.01M7 17h.01M17 17h.01"></path>
          </svg>
          <h3>Belum ada QR Code tersimpan</h3>
          <p>Buat QR Code dan klik tombol "Simpan Proyek" untuk melacak analitik pemindaian & mengeditnya kapan saja.</p>
        </div>
      `;
      return;
    }

    projectsListContainer.innerHTML = '';
    filtered.forEach((proj) => {
      const card = document.createElement('div');
      card.className = 'project-item-card';
      const dateFormatted = new Date(proj.updatedAt || proj.createdAt).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
      const scans = proj.scanCount || 0;

      card.innerHTML = `
        <div class="project-info-left">
          <img src="${proj.thumbnail}" alt="${proj.title}" class="project-thumb" title="Klik untuk melihat pratinjau QR Code" />
          <div class="project-details">
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <h4>${proj.title}</h4>
              <span class="project-scan-pill" title="Total pemindaian">👁️ ${scans} scan</span>
            </div>
            <div class="project-meta">
              <span class="project-type-badge">${proj.type}${proj.isDynamic ? ' • Dinamis' : ''}</span>
              <span>Diperbarui ${dateFormatted}</span>
            </div>
          </div>
        </div>
        <div class="project-actions-right">
          <button type="button" class="btn-action-sm btn-icon-only btn-preview-qr" title="Tampilkan / Pratinjau QR Code">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <button type="button" class="btn-action-sm btn-icon-only btn-download-qr" title="Unduh QR Code (PNG)">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button type="button" class="btn-action-sm btn-icon-only btn-action-primary btn-analytics" title="Lihat Analitik Scan Lengkap">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
          </button>
          <button type="button" class="btn-action-sm btn-icon-only btn-edit" title="Buka dan Edit Desain">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          <button type="button" class="btn-action-sm btn-icon-only btn-delete-sm btn-delete" title="Hapus Proyek">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      card.querySelector('.project-thumb').addEventListener('click', () => {
        openQrLightbox(proj);
      });

      card.querySelector('.btn-preview-qr').addEventListener('click', () => {
        openQrLightbox(proj);
      });

      card.querySelector('.btn-download-qr').addEventListener('click', () => {
        openDownloadResolutionModal(proj);
      });

      card.querySelector('.btn-analytics').addEventListener('click', () => {
        openAnalyticsDetailModal(proj.id);
      });

      card.querySelector('.btn-edit').addEventListener('click', () => {
        loadProjectIntoEditor(proj);
        modalProjects.classList.remove('active');
      });

      card.querySelector('.btn-delete').addEventListener('click', async () => {
        if (confirm(`Yakin ingin menghapus proyek "${proj.title}"?`)) {
          await window.qrStorage.deleteProject(proj.id);
          card.remove();
          await updateProjectsBadge();
          await renderProjectsList();
          window.showToast('Proyek berhasil dihapus.', 'info');
        }
      });

      projectsListContainer.appendChild(card);
    });
  }

  inputSearchProjects?.addEventListener('input', displayFilteredProjects);
  selectSortProjects?.addEventListener('change', displayFilteredProjects);

  // DETAILED SCAN ANALYTICS MODAL CONTROLLER
  async function openAnalyticsDetailModal(projectId) {
    activeAnalyticsProjectId = projectId;
    const project = await window.qrStorage.getProject(projectId);
    if (!project) {
      window.showToast('Data proyek tidak ditemukan.', 'error');
      return;
    }

    const origin = window.location.origin;
    const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
    const trackingLink = `${origin}${basePath}viewer/index.html?id=${project.id}${project.type === 'url' ? '&redirect=1' : ''}`;

    if (detailProjectTitle) detailProjectTitle.textContent = `Analitik: ${project.title}`;
    if (detailProjectId) detailProjectId.textContent = project.id;
    if (detailProjectType) detailProjectType.textContent = project.type.toUpperCase() + (project.isDynamic ? ' (DINAMIS)' : '');
    if (detailTrackingUrl) detailTrackingUrl.textContent = trackingLink;
    if (btnOpenTrackingUrl) btnOpenTrackingUrl.href = trackingLink;

    renderAnalyticsDetailValues(project);
    modalAnalyticsDetail?.classList.add('active');
  }

  function renderAnalyticsDetailValues(project) {
    const scans = Number(project.scanCount) || 0;
    const stats = project.deviceStats || { mobile: 0, desktop: 0, tablet: 0 };
    const totalRecorded = (stats.mobile || 0) + (stats.desktop || 0) + (stats.tablet || 0);

    const mobCount = stats.mobile || 0;
    const dskCount = stats.desktop || 0;
    const tabCount = stats.tablet || 0;

    const mobPct = totalRecorded > 0 ? Math.round((mobCount / totalRecorded) * 100) : 0;
    const dskPct = totalRecorded > 0 ? Math.round((dskCount / totalRecorded) * 100) : 0;
    const tabPct = totalRecorded > 0 ? Math.round((tabCount / totalRecorded) * 100) : 0;

    // KPI values
    if (detailStatScans) detailStatScans.textContent = scans;
    if (detailStatLastTime) {
      if (project.lastScannedAt) {
        const d = new Date(project.lastScannedAt);
        detailStatLastTime.textContent = d.toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        });
      } else {
        detailStatLastTime.textContent = 'Belum pernah';
      }
    }
    if (detailStatMobilePct) detailStatMobilePct.textContent = `${mobPct}%`;

    // Top Browser
    const logs = project.scanLogs || [];
    if (detailStatTopBrowser) {
      if (logs.length > 0) {
        const browserCounts = {};
        logs.forEach(l => {
          const b = l.browser || 'Browser';
          browserCounts[b] = (browserCounts[b] || 0) + 1;
        });
        const topB = Object.keys(browserCounts).reduce((a, b) => browserCounts[a] > browserCounts[b] ? a : b);
        detailStatTopBrowser.textContent = topB;
      } else {
        detailStatTopBrowser.textContent = '-';
      }
    }

    // Bars
    if (barMobile) barMobile.style.width = `${mobPct}%`;
    if (barDesktop) barDesktop.style.width = `${dskPct}%`;
    if (barTablet) barTablet.style.width = `${tabPct}%`;

    if (labelMobileCount) labelMobileCount.textContent = `${mobCount} scan (${mobPct}%)`;
    if (labelDesktopCount) labelDesktopCount.textContent = `${dskCount} scan (${dskPct}%)`;
    if (labelTabletCount) labelTabletCount.textContent = `${tabCount} scan (${tabPct}%)`;

    // Scan Logs Feed
    if (scanLogsList) {
      if (logs.length === 0) {
        scanLogsList.innerHTML = `
          <div style="padding: 1.5rem 0; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
            Belum ada riwayat pemindaian. Uji dengan mengklik tombol "Simulasikan Scan (+1)" di atas!
          </div>
        `;
      } else {
        scanLogsList.innerHTML = '';
        logs.slice(0, 10).forEach(log => {
          const row = document.createElement('div');
          row.className = 'scan-log-row';
          const timeFormatted = new Date(log.timestamp).toLocaleString('id-ID', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          const devIcon = log.device === 'Desktop' ? '💻' : log.device === 'Tablet' ? '📟' : '📱';

          row.innerHTML = `
            <div>
              <div style="font-weight: 600; color: var(--text-primary);">${timeFormatted}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${log.referrer || 'Direct'}</div>
            </div>
            <div>
              <span class="badge-scan-device">${devIcon} ${log.device}</span>
            </div>
            <div style="color: var(--text-secondary); font-size: 0.78rem;">
              ${log.os || '-'} • ${log.browser || '-'}
            </div>
            <div>
              <span class="badge-scan-success">✓ Berhasil</span>
            </div>
          `;
          scanLogsList.appendChild(row);
        });
      }
    }
  }

  // Copy Tracking URL
  btnCopyTrackingUrl?.addEventListener('click', async () => {
    const text = detailTrackingUrl?.textContent;
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        window.showToast('Tautan pelacak scan disalin ke clipboard!', 'success');
      } catch (e) {
        window.showToast('Gagal menyalin tautan.', 'error');
      }
    }
  });

  // Simulate Scan (+1)
  btnSimulateScanAction?.addEventListener('click', async () => {
    if (!activeAnalyticsProjectId) return;
    btnSimulateScanAction.disabled = true;
    btnSimulateScanAction.textContent = '⚡ Merekam...';

    const updated = await window.qrStorage.simulateScan(activeAnalyticsProjectId);
    if (updated) {
      renderAnalyticsDetailValues(updated);
      await updateProjectsBadge();
      // Also update background list if visible
      const idx = cachedProjectsList.findIndex(p => p.id === updated.id);
      if (idx !== -1) cachedProjectsList[idx] = updated;
      window.showToast('✓ +1 Scan pengujian berhasil dicatat!', 'success');
    }

    btnSimulateScanAction.disabled = false;
    btnSimulateScanAction.textContent = '⚡ Simulasikan Scan (+1)';
  });

  // Reset Scans
  btnResetScansConfirm?.addEventListener('click', async () => {
    if (!activeAnalyticsProjectId) return;
    if (confirm('Yakin ingin mereset seluruh data analitik untuk proyek ini kembali ke 0?')) {
      const reset = await window.qrStorage.resetProjectAnalytics(activeAnalyticsProjectId);
      if (reset) {
        renderAnalyticsDetailValues(reset);
        await updateProjectsBadge();
        const idx = cachedProjectsList.findIndex(p => p.id === reset.id);
        if (idx !== -1) cachedProjectsList[idx] = reset;
        window.showToast('Data analitik berhasil direset ke 0.', 'info');
      }
    }
  });

  [btnCloseAnalyticsDetail, btnCloseAnalyticsBottom].forEach((btn) => {
    btn?.addEventListener('click', () => {
      modalAnalyticsDetail?.classList.remove('active');
      activeAnalyticsProjectId = null;
    });
  });

  function loadProjectIntoEditor(proj) {
    currentProjectId = proj.id;
    currentProjectTitle = proj.title;

    document.getElementById('current-project-id-badge').textContent = proj.id;

    setActiveType(proj.type);

    if (proj.data) {
      if (proj.data.rawUrl && document.getElementById('input-url')) document.getElementById('input-url').value = proj.data.rawUrl;
      if (proj.data.waPhone && document.getElementById('input-wa-phone')) document.getElementById('input-wa-phone').value = proj.data.waPhone;
      if (proj.data.waMsg && document.getElementById('input-wa-msg')) document.getElementById('input-wa-msg').value = proj.data.waMsg;
      if (proj.data.wifiSsid && document.getElementById('input-wifi-ssid')) document.getElementById('input-wifi-ssid').value = proj.data.wifiSsid;
      if (proj.data.wifiPass && document.getElementById('input-wifi-pass')) document.getElementById('input-wifi-pass').value = proj.data.wifiPass;
      if (proj.data.fileData && photoImg && photoPreview) {
        photoImg.src = proj.data.fileData;
        photoPreview.style.display = 'block';
        if (photoDropZone) photoDropZone.style.display = 'none';
      }
      if (document.getElementById('check-dynamic-url') && proj.isDynamic !== undefined) {
        document.getElementById('check-dynamic-url').checked = Boolean(proj.isDynamic);
      }
    }

    if (proj.qrConfig) {
      qrEngine.update(proj.qrConfig);

      if (pickerColor1) pickerColor1.value = proj.qrConfig.color1;
      if (pickerColor2) pickerColor2.value = proj.qrConfig.color2;
      if (pickerBg) pickerBg.value = proj.qrConfig.bgColor;
      if (selectColorType) selectColorType.value = proj.qrConfig.colorType;
      if (selectFrameStyle) selectFrameStyle.value = proj.qrConfig.frameStyle || 'none';
      if (inputFrameText) inputFrameText.value = proj.qrConfig.frameText || 'SCAN ME';

      const isSolid = proj.qrConfig.colorType === 'solid' || proj.qrConfig.color1 === proj.qrConfig.color2;
      if (color2Container) color2Container.style.display = isSolid ? 'none' : 'flex';
      if (gradientRow) gradientRow.style.display = isSolid ? 'none' : 'block';

      setActiveStyleBtn('dotsType', proj.qrConfig.dotsType);
      setActiveStyleBtn('cornersSquareType', proj.qrConfig.cornersSquareType);
      setActiveStyleBtn('cornersDotType', proj.qrConfig.cornersDotType);
    }

    window.showToast(`Proyek "${proj.title}" dimuat ke editor!`, 'success');
  }

  btnCloseProjects?.addEventListener('click', () => {
    modalProjects.classList.remove('active');
  });

  // -------------------------------------------------------------
  // 12. QR Code Scanner Modal
  // -------------------------------------------------------------
  const btnOpenScanner = document.getElementById('btn-open-scanner');
  const modalScanner = document.getElementById('scanner-modal');
  const btnCloseScanner = document.getElementById('btn-close-scanner');
  const btnStartCamera = document.getElementById('btn-start-camera');
  const inputScanFile = document.getElementById('input-scan-file');
  const btnScanFile = document.getElementById('btn-scan-file');

  btnOpenScanner?.addEventListener('click', () => {
    modalScanner.classList.add('active');
  });

  btnCloseScanner?.addEventListener('click', () => {
    qrScanner.close();
  });

  btnStartCamera?.addEventListener('click', () => {
    qrScanner.startCamera();
  });

  btnScanFile?.addEventListener('click', () => {
    inputScanFile.click();
  });

  inputScanFile?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      qrScanner.scanImageFile(file);
    }
  });

  // Backdrop click dismissal
  [modalProjects, modalScanner, modalFirebaseSetup, authPromptModal, modalAnalyticsDetail, modalQrLightbox, modalDownloadResolution].forEach((modal) => {
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
        if (modal === modalScanner) qrScanner.stopCamera();
      }
    });
  });

  // Listen to auth state changes to refresh badge and modals
  window.addEventListener('auth-changed', () => {
    updateProjectsBadge();
    if (modalProjects?.classList.contains('active')) {
      if (window.authManager?.currentUser) {
        renderProjectsList();
      } else {
        modalProjects.classList.remove('active');
      }
    }
  });

  updateProjectsBadge();
  triggerLiveUpdate();
});

