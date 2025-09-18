/**
 * Font Loader Utility
 * Handles font loading, preloading, and fallback management
 */
class FontLoader {
    constructor() {
        this.loadedFonts = new Set();
        this.loadingFonts = new Set();
        this.fontPromises = new Map();
    }

    /**
     * Preload a font for better performance
     * @param {string} fontFamily - The font family name
     * @param {string} fontUrl - The font file URL
     * @param {string} format - The font format (woff2, woff, ttf)
     * @returns {Promise<boolean>} - Whether the font loaded successfully
     */
    async preloadFont(fontFamily, fontUrl, format = 'woff2') {
        if (this.loadedFonts.has(fontFamily)) {
            return true;
        }

        if (this.loadingFonts.has(fontFamily)) {
            return this.fontPromises.get(fontFamily);
        }

        this.loadingFonts.add(fontFamily);

        const promise = new Promise((resolve) => {
            const fontFace = new FontFace(fontFamily, `url(${fontUrl}) format('${format}')`);
            
            fontFace.load().then((loadedFont) => {
                document.fonts.add(loadedFont);
                this.loadedFonts.add(fontFamily);
                this.loadingFonts.delete(fontFamily);
                console.log(`✅ Font loaded: ${fontFamily}`);
                resolve(true);
            }).catch((error) => {
                console.warn(`⚠️ Font failed to load: ${fontFamily}`, error);
                this.loadingFonts.delete(fontFamily);
                resolve(false);
            });
        });

        this.fontPromises.set(fontFamily, promise);
        return promise;
    }

    /**
     * Check if a font is available
     * @param {string} fontFamily - The font family name
     * @returns {boolean} - Whether the font is available
     */
    isFontAvailable(fontFamily) {
        return this.loadedFonts.has(fontFamily) || 
               document.fonts.check(`16px "${fontFamily}"`);
    }

    /**
     * Wait for a font to be available
     * @param {string} fontFamily - The font family name
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<boolean>} - Whether the font became available
     */
    async waitForFont(fontFamily, timeout = 3000) {
        if (this.isFontAvailable(fontFamily)) {
            return true;
        }

        return new Promise((resolve) => {
            const startTime = Date.now();
            
            const checkFont = () => {
                if (this.isFontAvailable(fontFamily)) {
                    resolve(true);
                    return;
                }

                if (Date.now() - startTime > timeout) {
                    console.warn(`⏰ Font timeout: ${fontFamily}`);
                    resolve(false);
                    return;
                }

                requestAnimationFrame(checkFont);
            };

            checkFont();
        });
    }

    /**
     * Apply font loading states to elements
     * @param {string} selector - CSS selector for elements
     * @param {string} fontFamily - The font family to wait for
     */
    async applyFontLoadingStates(selector, fontFamily) {
        const elements = document.querySelectorAll(selector);
        
        // Add loading state
        elements.forEach(el => {
            el.classList.add('font-loading');
        });

        // Wait for font to load
        const fontLoaded = await this.waitForFont(fontFamily);

        // Update state
        elements.forEach(el => {
            el.classList.remove('font-loading');
            if (fontLoaded) {
                el.classList.add('font-loaded');
            }
        });
    }

    /**
     * Preload critical fonts for the application
     */
    async preloadCriticalFonts() {
        const criticalFonts = [
            {
                family: 'Press Start 2P',
                url: '../../../assets/fonts/Press_Start_2P/PressStart2P-Regular.ttf',
                format: 'truetype'
            },
            {
                family: 'Montserrat',
                url: '../../../assets/fonts/Montserrat/Montserrat-VariableFont_wght.ttf',
                format: 'truetype-variations'
            }
        ];

        const loadPromises = criticalFonts.map(font => 
            this.preloadFont(font.family, font.url, font.format)
        );

        await Promise.allSettled(loadPromises);
        console.log('🎨 Critical fonts preloaded');
    }

    /**
     * Get font loading status
     * @returns {Object} - Status of all fonts
     */
    getStatus() {
        return {
            loaded: Array.from(this.loadedFonts),
            loading: Array.from(this.loadingFonts),
            total: this.loadedFonts.size + this.loadingFonts.size
        };
    }
}

// Create global instance
const fontLoader = new FontLoader();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FontLoader;
} else if (typeof window !== 'undefined') {
    window.FontLoader = FontLoader;
    window.fontLoader = fontLoader;
}
