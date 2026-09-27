/**
 * Antigravity QR Code Exporter
 * Handles multi-resolution PNG, Vector SVG, PDF, and Clipboard copy.
 */

class QRExporter {
  /**
   * Download as High-Resolution PNG
   */
  static async downloadPNG(qrEngine, resolution = 1024, filename = 'qr-code') {
    try {
      const canvas = await qrEngine.getFramedCanvas(resolution);
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      
      const link = document.createElement('a');
      link.download = `${filename}-${resolution}px.png`;
      link.href = dataUrl;
      link.click();
      return true;
    } catch (err) {
      console.error('Download PNG failed:', err);
      throw err;
    }
  }

  /**
   * Download as SVG Vector
   */
  static async downloadSVG(qrEngine, filename = 'qr-code') {
    try {
      // Re-create SVG instance for clean vector download
      const svgOptions = qrEngine.buildQRCodeOptions(1000);
      svgOptions.type = 'svg';
      const svgQR = new QRCodeStyling(svgOptions);
      const rawBlob = await svgQR.getRawData('svg');

      const link = document.createElement('a');
      link.download = `${filename}.svg`;
      link.href = URL.createObjectURL(rawBlob);
      link.click();
      return true;
    } catch (err) {
      console.error('Download SVG failed:', err);
      throw err;
    }
  }

  /**
   * Download as WebP
   */
  static async downloadWebP(qrEngine, resolution = 1024, filename = 'qr-code') {
    try {
      const canvas = await qrEngine.getFramedCanvas(resolution);
      const dataUrl = canvas.toDataURL('image/webp', 0.95);

      const link = document.createElement('a');
      link.download = `${filename}.webp`;
      link.href = dataUrl;
      link.click();
      return true;
    } catch (err) {
      console.error('Download WebP failed:', err);
      throw err;
    }
  }

  /**
   * Copy to Clipboard
   */
  static async copyToClipboard(qrEngine) {
    try {
      const canvas = await qrEngine.getFramedCanvas(800);
      return new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error('Canvas blob conversion failed'));
            return;
          }
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            resolve(true);
          } catch (err) {
            reject(err);
          }
        }, 'image/png');
      });
    } catch (err) {
      console.error('Copy to clipboard failed:', err);
      throw err;
    }
  }
}

window.QRExporter = QRExporter;
