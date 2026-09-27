/**
 * Antigravity QR Code Scanner
 * Supports camera scanning and image file upload using Html5Qrcode.
 */

class QRScannerManager {
  constructor() {
    this.html5QrCode = null;
    this.isScanning = false;
    this.modal = document.getElementById('scanner-modal');
    this.resultContainer = document.getElementById('scanner-result-box');
    this.resultText = document.getElementById('scanner-result-text');
  }

  open() {
    if (this.modal) {
      this.modal.classList.add('active');
    }
  }

  close() {
    this.stopCamera();
    if (this.modal) {
      this.modal.classList.remove('active');
    }
    if (this.resultContainer) {
      this.resultContainer.style.display = 'none';
    }
  }

  async startCamera() {
    const readerElement = document.getElementById('qr-reader-camera');
    if (!readerElement) return;

    try {
      if (!this.html5QrCode) {
        this.html5QrCode = new Html5Qrcode('qr-reader-camera');
      }

      const qrCodeSuccessCallback = (decodedText) => {
        this.handleScanSuccess(decodedText);
        this.stopCamera();
      };

      const config = { fps: 10, qrbox: { width: 250, height: 250 } };

      await this.html5QrCode.start(
        { facingMode: 'environment' },
        config,
        qrCodeSuccessCallback
      );
      this.isScanning = true;
    } catch (err) {
      console.error('Failed to start camera:', err);
      window.showToast?.('Tidak dapat mengakses kamera. Pastikan izin kamera aktif.', 'error');
    }
  }

  async stopCamera() {
    if (this.html5QrCode && this.isScanning) {
      try {
        await this.html5QrCode.stop();
        this.isScanning = false;
      } catch (err) {
        console.warn('Stop camera warning:', err);
      }
    }
  }

  async scanImageFile(file) {
    if (!file) return;

    try {
      if (!this.html5QrCode) {
        this.html5QrCode = new Html5Qrcode('qr-reader-camera');
      }

      const decodedText = await this.html5QrCode.scanFile(file, true);
      this.handleScanSuccess(decodedText);
    } catch (err) {
      console.error('Scan file error:', err);
      window.showToast?.('Tidak ditemukan QR code yang valid pada gambar ini.', 'error');
    }
  }

  handleScanSuccess(decodedText) {
    if (this.resultContainer && this.resultText) {
      this.resultText.textContent = decodedText;
      this.resultContainer.style.display = 'block';

      const openLinkBtn = document.getElementById('btn-open-scanned-url');
      if (openLinkBtn) {
        if (decodedText.startsWith('http://') || decodedText.startsWith('https://')) {
          openLinkBtn.style.display = 'inline-flex';
          openLinkBtn.href = decodedText;
        } else {
          openLinkBtn.style.display = 'none';
        }
      }

      window.showToast?.('QR Code berhasil terbaca!', 'success');
    }
  }
}

window.QRScannerManager = QRScannerManager;
