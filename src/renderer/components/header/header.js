/**
 * Header Component
 * Reusable header component for all windows
 */
class HeaderComponent {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            icon: '',
            text: '',
            className: '',
            showUpdateNotification: true,
            showControlButtons: false, // Only show on progress view for now
            ...options
        };
        
        this.updateComponent = null;
        this.init();
    }
    
    init() {
        this.render();
        this.initUpdateComponent();
    }
    
    render() {
        const headerHTML = `
            <header class="window-header draggable ${this.options.className}">
                <h2 class="header-title">
                    <span class="header-icon">${this.options.icon}</span>
                    <span class="header-text">${this.options.text}</span>
                </h2>
                ${this.options.showControlButtons ? `
                    <div class="header-controls no-drag">
                        <button class="header-btn settings-btn" id="header-settings-btn" title="Settings">
                            <span class="btn-icon">⚙️</span>
                        </button>
                        <button class="header-btn exit-btn" id="header-exit-btn" title="Exit App">
                            <span class="btn-dot"></span>
                        </button>
                    </div>
                ` : ''}
            </header>
            ${this.options.showUpdateNotification ? '<div id="update-container"></div>' : ''}
        `;
        
        this.container.innerHTML = headerHTML;
        this.setupControlButtons();
    }
    
    initUpdateComponent() {
        if (this.options.showUpdateNotification) {
            const updateContainer = this.container.querySelector('#update-container');
            if (updateContainer && typeof window !== 'undefined' && window.UpdateComponent) {
                this.updateComponent = new window.UpdateComponent(updateContainer, {
                    position: 'top-right',
                    autoHide: true,
                    autoHideDelay: 5000
                });
            }
        }
    }
    
    setupControlButtons() {
        if (!this.options.showControlButtons) return;
        
        const settingsBtn = this.container.querySelector('#header-settings-btn');
        const exitBtn = this.container.querySelector('#header-exit-btn');
        
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openSettings());
        }
        
        if (exitBtn) {
            exitBtn.addEventListener('click', () => this.exitApp());
        }
    }
    
    openSettings() {
        // Use the exposed API from preload.js - toggle-settings creates/destroys as needed
        if (window.settingsAPI?.toggle) {
            window.settingsAPI.toggle();
        } else if (window.electronAPI?.ipc?.send) {
            window.electronAPI.ipc.send('toggle-settings');
        } else {
            console.error('Settings API not available');
        }
    }
    
    // restartApp method removed - no restart button needed
    
    exitApp() {
        // Use the exposed API from preload.js
        if (window.electronAPI?.exitApp) {
            window.electronAPI.exitApp();
        } else if (window.electronAPI?.ipc?.send) {
            window.electronAPI.ipc.send('exit-app');
        } else {
            console.error('Electron API not available');
        }
    }
    
    update(options) {
        this.options = { ...this.options, ...options };
        this.render();
    }
    
    setIcon(icon) {
        this.options.icon = icon;
        const iconElement = this.container.querySelector('.header-icon');
        if (iconElement) {
            iconElement.textContent = icon;
        }
    }
    
    setText(text) {
        this.options.text = text;
        const textElement = this.container.querySelector('.header-text');
        if (textElement) {
            textElement.textContent = text;
        }
    }
    
    addClass(className) {
        const headerElement = this.container.querySelector('.window-header');
        if (headerElement) {
            headerElement.classList.add(className);
        }
    }
    
    removeClass(className) {
        const headerElement = this.container.querySelector('.window-header');
        if (headerElement) {
            headerElement.classList.remove(className);
        }
    }
    
    // Update component methods removed - no manual updates needed
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HeaderComponent;
} else if (typeof window !== 'undefined') {
    window.HeaderComponent = HeaderComponent;
}
