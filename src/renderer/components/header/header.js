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
            ...options
        };
        
        this.init();
    }
    
    init() {
        this.render();
    }
    
    render() {
        const headerHTML = `
            <header class="window-header draggable ${this.options.className}">
                <h2 class="header-title">
                    <span class="header-icon">${this.options.icon}</span>
                    <span class="header-text">${this.options.text}</span>
                </h2>
            </header>
        `;
        
        this.container.innerHTML = headerHTML;
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
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HeaderComponent;
} else if (typeof window !== 'undefined') {
    window.HeaderComponent = HeaderComponent;
}
