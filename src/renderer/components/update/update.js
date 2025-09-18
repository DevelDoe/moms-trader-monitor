/**
 * Update Notification Component
 * Handles auto-updater notifications and user interactions
 */
class UpdateComponent {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            position: 'top-right', // top-right, top-left, bottom-right, bottom-left
            autoHide: true,
            autoHideDelay: 5000,
            ...options
        };
        
        this.isVisible = false;
        this.currentUpdate = null;
        this.downloadProgress = 0;
        
        this.init();
    }
    
    init() {
        this.render();
        this.setupEventListeners();
    }
    
    render() {
        const updateHTML = `
            <div id="update-notification" class="update-notification ${this.options.position}" style="display: none;">
                <div class="update-content">
                    <div class="update-header">
                        <span class="update-icon">🔄</span>
                        <span class="update-title">Update Available</span>
                        <button class="update-close no-drag" onclick="this.parentElement.parentElement.parentElement.style.display='none'">×</button>
                    </div>
                    <div class="update-body">
                        <div class="update-info">
                            <div class="update-version"></div>
                            <div class="update-notes"></div>
                        </div>
                        <div class="update-progress" style="display: none;">
                            <div class="progress-bar">
                                <div class="progress-fill"></div>
                            </div>
                            <div class="progress-text">Downloading...</div>
                        </div>
                        <div class="update-actions">
                            <button class="update-btn update-download no-drag" style="display: none;">Download Update</button>
                            <button class="update-btn update-install no-drag" style="display: none;">Install & Restart</button>
                            <button class="update-btn update-later no-drag" style="display: none;">Later</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        this.container.innerHTML = updateHTML;
    }
    
    setupEventListeners() {
        // Listen for update events from main process
        if (typeof window !== 'undefined' && window.require) {
            const { ipcRenderer } = window.require('electron');
            
            // Update checking
            ipcRenderer.on('update-checking', () => {
                this.showChecking();
            });
            
            // Update available
            ipcRenderer.on('update-available', (event, info) => {
                this.showUpdateAvailable(info);
            });
            
            // Update not available
            ipcRenderer.on('update-not-available', () => {
                this.hide();
            });
            
            // Download progress
            ipcRenderer.on('update-download-progress', (event, progress) => {
                this.showDownloadProgress(progress);
            });
            
            // Update downloaded
            ipcRenderer.on('update-downloaded', (event, info) => {
                this.showUpdateReady(info);
            });
            
            // Update error
            ipcRenderer.on('update-error', (event, error) => {
                this.showError(error);
            });
        }
        
        // Setup button event listeners
        this.setupButtonListeners();
    }
    
    setupButtonListeners() {
        const downloadBtn = this.container.querySelector('.update-download');
        const installBtn = this.container.querySelector('.update-install');
        const laterBtn = this.container.querySelector('.update-later');
        
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.downloadUpdate());
        }
        
        if (installBtn) {
            installBtn.addEventListener('click', () => this.installUpdate());
        }
        
        if (laterBtn) {
            laterBtn.addEventListener('click', () => this.hide());
        }
    }
    
    showChecking() {
        this.updateContent('update-icon', '🔍');
        this.updateContent('update-title', 'Checking for Updates...');
        this.hideActions();
        this.hideProgress();
        this.show();
    }
    
    showUpdateAvailable(info) {
        this.currentUpdate = info;
        this.updateContent('update-icon', '🔔');
        this.updateContent('update-title', 'Update Available');
        this.updateContent('update-version', `Version ${info.version}`);
        this.updateContent('update-notes', info.releaseNotes || 'Bug fixes and improvements');
        
        this.showAction('update-download');
        this.showAction('update-later');
        this.hideProgress();
        this.show();
    }
    
    showDownloadProgress(progress) {
        this.updateContent('update-icon', '📥');
        this.updateContent('update-title', 'Downloading Update...');
        
        const progressFill = this.container.querySelector('.progress-fill');
        const progressText = this.container.querySelector('.progress-text');
        
        if (progressFill) {
            progressFill.style.width = `${progress.percent}%`;
        }
        
        if (progressText) {
            const speedKB = Math.round(progress.bytesPerSecond / 1024);
            progressText.textContent = `${progress.percent}% (${speedKB} KB/s)`;
        }
        
        this.showProgress();
        this.hideActions();
        this.show();
    }
    
    showUpdateReady(info) {
        this.updateContent('update-icon', '✅');
        this.updateContent('update-title', 'Update Ready');
        this.updateContent('update-version', `Version ${info.version} downloaded`);
        this.updateContent('update-notes', 'The update is ready to install. The app will restart after installation.');
        
        this.showAction('update-install');
        this.showAction('update-later');
        this.hideProgress();
        this.show();
    }
    
    showError(error) {
        this.updateContent('update-icon', '❌');
        this.updateContent('update-title', 'Update Error');
        this.updateContent('update-version', '');
        this.updateContent('update-notes', error.message || 'An error occurred while checking for updates.');
        
        this.hideActions();
        this.hideProgress();
        this.show();
        
        // Auto-hide error after delay
        if (this.options.autoHide) {
            setTimeout(() => this.hide(), this.options.autoHideDelay);
        }
    }
    
    async downloadUpdate() {
        if (typeof window !== 'undefined' && window.require) {
            const { ipcRenderer } = window.require('electron');
            try {
                const result = await ipcRenderer.invoke('download-update');
                if (!result.success) {
                    this.showError({ message: result.error || 'Failed to download update' });
                }
            } catch (error) {
                this.showError({ message: error.message });
            }
        }
    }
    
    async installUpdate() {
        if (typeof window !== 'undefined' && window.require) {
            const { ipcRenderer } = window.require('electron');
            try {
                const result = await ipcRenderer.invoke('install-update');
                if (!result.success) {
                    this.showError({ message: result.error || 'Failed to install update' });
                }
            } catch (error) {
                this.showError({ message: error.message });
            }
        }
    }
    
    show() {
        const notification = this.container.querySelector('#update-notification');
        if (notification) {
            notification.style.display = 'block';
            this.isVisible = true;
        }
    }
    
    hide() {
        const notification = this.container.querySelector('#update-notification');
        if (notification) {
            notification.style.display = 'none';
            this.isVisible = false;
        }
    }
    
    showAction(className) {
        const action = this.container.querySelector(`.${className}`);
        if (action) {
            action.style.display = 'inline-block';
        }
    }
    
    hideActions() {
        const actions = this.container.querySelectorAll('.update-btn');
        actions.forEach(action => {
            action.style.display = 'none';
        });
    }
    
    showProgress() {
        const progress = this.container.querySelector('.update-progress');
        if (progress) {
            progress.style.display = 'block';
        }
    }
    
    hideProgress() {
        const progress = this.container.querySelector('.update-progress');
        if (progress) {
            progress.style.display = 'none';
        }
    }
    
    updateContent(selector, content) {
        const element = this.container.querySelector(`.${selector}`);
        if (element) {
            element.textContent = content;
        }
    }
    
    // Public method to manually check for updates
    async checkForUpdates() {
        if (typeof window !== 'undefined' && window.require) {
            const { ipcRenderer } = window.require('electron');
            try {
                const result = await ipcRenderer.invoke('check-for-updates');
                if (!result.success) {
                    this.showError({ message: result.error || 'Failed to check for updates' });
                }
            } catch (error) {
                this.showError({ message: error.message });
            }
        }
    }
    
    // Public method to get update status
    async getUpdateStatus() {
        if (typeof window !== 'undefined' && window.require) {
            const { ipcRenderer } = window.require('electron');
            try {
                return await ipcRenderer.invoke('get-update-status');
            } catch (error) {
                console.error('Failed to get update status:', error);
                return null;
            }
        }
        return null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UpdateComponent;
} else if (typeof window !== 'undefined') {
    window.UpdateComponent = UpdateComponent;
}

