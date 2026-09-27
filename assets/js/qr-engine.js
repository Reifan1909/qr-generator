/**
 * Antigravity QR Engine
 * High-performance abstraction over QRCodeStyling with live updates,
 * custom dots/corner shapes, logos, gradients, and frame compositions.
 */

class QREngine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.qrInstance = null;

    // Default Configuration State
    this.state = {
      data: 'https://google.com',
      width: 320,
      height: 320,
      margin: 10,
      dotsType: 'rounded',
      cornersSquareType: 'extra-rounded',
      cornersDotType: 'dot',
      colorType: 'solid',
      color1: '#0f172a',
      color2: '#0f172a',
      gradientType: 'linear',
      gradientAngle: 45,
      bgColor: '#ffffff',
      logo: '',
      logoSize: 0.35,
      logoMargin: 8,
      hideDotsBehindLogo: true,
      errorCorrectionLevel: 'Q',
      frameStyle: 'none',
      frameText: 'SCAN ME',
      frameBgColor: '#0f172a',
      frameTextColor: '#ffffff'
    };

    this.init();
  }

  init() {
    if (typeof QRCodeStyling === 'undefined') {
      setTimeout(() => this.init(), 200);
      return;
    }

    const options = this.buildQRCodeOptions();
    this.qrInstance = new QRCodeStyling(options);
    this.container.innerHTML = '';
    this.qrInstance.append(this.container);
  }

  buildQRCodeOptions(customSize = null) {
    const size = customSize || this.state.width;
    const baseSize = (this.state.width && this.state.width > 0) ? this.state.width : 300;
    const scale = size / baseSize;

    let dotsOptions = {
      type: this.state.dotsType
    };

    let cornersSquareOptions = {
      type: this.state.cornersSquareType
    };

    let cornersDotOptions = {
      type: this.state.cornersDotType
    };

    if (this.state.colorType === 'gradient' && this.state.color1 !== this.state.color2) {
      const rad = (this.state.gradientAngle * Math.PI) / 180;
      dotsOptions.color = this.state.color1;
      dotsOptions.gradient = {
        type: this.state.gradientType || 'linear',
        rotation: rad,
        colorStops: [
          { offset: 0, color: this.state.color1 },
          { offset: 1, color: this.state.color2 }
        ]
      };
      cornersSquareOptions.color = this.state.color1;
      cornersDotOptions.color = this.state.color2;
    } else {
      dotsOptions.color = this.state.color1;
      dotsOptions.gradient = undefined;
      cornersSquareOptions.color = this.state.color1;
      cornersDotOptions.color = this.state.color1;
    }

    const hasLogo = Boolean(this.state.logo && this.state.logo.trim());
    const isHttpLogo = hasLogo && (this.state.logo.startsWith('http://') || this.state.logo.startsWith('https://'));

    const rawLogoMargin = typeof this.state.logoMargin !== 'undefined' ? parseInt(this.state.logoMargin, 10) : 8;
    const validLogoMargin = isNaN(rawLogoMargin) ? 8 : rawLogoMargin;
    const scaledLogoMargin = Math.round(validLogoMargin * scale);

    const rawOuterMargin = typeof this.state.margin !== 'undefined' ? parseInt(this.state.margin, 10) : 10;
    const validOuterMargin = isNaN(rawOuterMargin) ? 10 : rawOuterMargin;
    const scaledOuterMargin = Math.round(validOuterMargin * scale);

    return {
      width: size,
      height: size,
      type: 'canvas',
      data: this.state.data || 'https://google.com',
      image: hasLogo ? this.state.logo : '',
      margin: scaledOuterMargin,
      dotsOptions: dotsOptions,
      cornersSquareOptions: cornersSquareOptions,
      cornersDotOptions: cornersDotOptions,
      backgroundOptions: {
        color: this.state.bgColor || '#ffffff'
      },
      imageOptions: {
        crossOrigin: isHttpLogo ? 'anonymous' : undefined,
        margin: scaledLogoMargin,
        imageSize: parseFloat(this.state.logoSize) || 0.35,
        hideBackgroundDots: this.state.hideDotsBehindLogo !== false
      },
      qrOptions: {
        // Automatically enforce high error correction if logo is present
        errorCorrectionLevel: hasLogo && this.state.errorCorrectionLevel === 'L' ? 'Q' : (this.state.errorCorrectionLevel || 'Q')
      }
    };
  }

  /**
   * Update QR parameters and re-render preview
   * @param {Object} partialState
   */
  update(partialState = {}) {
    Object.assign(this.state, partialState);

    if (this.qrInstance) {
      // Clear internal gradient cache when in solid mode
      if (this.state.colorType !== 'gradient' || this.state.color1 === this.state.color2) {
        if (this.qrInstance._options && this.qrInstance._options.dotsOptions) {
          delete this.qrInstance._options.dotsOptions.gradient;
        }
      }

      // Explicitly clear image when empty
      if (!this.state.logo) {
        if (this.qrInstance._options) {
          this.qrInstance._options.image = '';
        }
      }

      const options = this.buildQRCodeOptions();
      this.qrInstance.update(options);
    }

    this.updateFramePreview();
  }

  /**
   * Update the live preview container frame badge/labels
   */
  updateFramePreview() {
    const frameOuter = document.getElementById('qr-frame-wrapper');
    const bannerTop = document.getElementById('frame-banner-top');
    const bannerBottom = document.getElementById('frame-banner-bottom');

    if (!frameOuter) return;

    frameOuter.className = 'qr-frame-outer';

    if (this.state.frameStyle && this.state.frameStyle !== 'none') {
      frameOuter.classList.add('frame-' + this.state.frameStyle);
    }

    const text = this.state.frameText || 'SCAN ME';
    if (bannerTop) bannerTop.textContent = text;
    if (bannerBottom) bannerBottom.textContent = text;

    if (this.state.frameStyle === 'badge') {
      frameOuter.style.backgroundColor = this.state.frameBgColor || '#0f172a';
      if (bannerBottom) {
        bannerBottom.style.color = this.state.frameTextColor || '#ffffff';
      }
    } else {
      frameOuter.style.backgroundColor = this.state.bgColor || '#ffffff';
      if (bannerTop) bannerTop.style.color = this.state.color1;
      if (bannerBottom) bannerBottom.style.color = this.state.color1;
    }
  }

  /**
   * Get raw Canvas element of current QR for thumbnail saving or export
   */
  async getCanvasElement(resolution = 1000) {
    const exportQR = new QRCodeStyling(this.buildQRCodeOptions(resolution));
    const rawBlob = await exportQR.getRawData('png');
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = resolution;
        canvas.height = resolution;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.src = URL.createObjectURL(rawBlob);
    });
  }

  /**
   * Export final rendered image with Frame if applied
   */
  async getFramedCanvas(resolution = 1000) {
    const qrCanvas = await this.getCanvasElement(resolution);

    if (this.state.frameStyle === 'none') {
      return qrCanvas;
    }

    const padding = Math.round(resolution * 0.08);
    const bannerHeight = Math.round(resolution * 0.16);

    let canvasWidth = resolution + (padding * 2);
    let canvasHeight = resolution + (padding * 2);

    let qrX = padding;
    let qrY = padding;
    let textX = canvasWidth / 2;
    let textY = padding / 2;

    if (this.state.frameStyle === 'bottom' || this.state.frameStyle === 'badge') {
      canvasHeight += bannerHeight;
      textY = resolution + padding + (bannerHeight * 0.62);
    } else if (this.state.frameStyle === 'top') {
      canvasHeight += bannerHeight;
      qrY += bannerHeight;
      textY = padding + (bannerHeight * 0.62);
    }

    const framedCanvas = document.createElement('canvas');
    framedCanvas.width = canvasWidth;
    framedCanvas.height = canvasHeight;
    const ctx = framedCanvas.getContext('2d');

    ctx.fillStyle = this.state.frameStyle === 'badge' ? this.state.frameBgColor : (this.state.bgColor || '#ffffff');
    ctx.roundRect ? ctx.roundRect(0, 0, canvasWidth, canvasHeight, 28) : ctx.rect(0, 0, canvasWidth, canvasHeight);
    ctx.fill();

    ctx.drawImage(qrCanvas, qrX, qrY);

    if (this.state.frameText) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${Math.round(resolution * 0.065)}px 'Outfit', sans-serif`;
      ctx.fillStyle = this.state.frameStyle === 'badge' ? this.state.frameTextColor : this.state.color1;
      ctx.fillText(this.state.frameText, textX, textY);
    }

    return framedCanvas;
  }
}

window.QREngine = QREngine;
