# 🎨 Font Installation Guide for MTM Application

## 📋 Overview

This guide covers how to install and manage custom fonts in your Electron application. The MTM app uses a modular font system that supports both system fonts and custom web fonts.

## 🗂️ Directory Structure

```
MTM/
├── assets/
│   └── fonts/                    # Custom font files
│       ├── primary/              # Main application fonts
│       ├── display/              # Headers and titles
│       ├── monospace/            # Code and data display
│       └── fallback/             # System font fallbacks
├── src/renderer/
│   ├── styles/
│   │   └── fonts.css            # Font definitions and utilities
│   └── utils/
│       └── fontLoader.js        # Font loading and management
└── src/renderer/components/
    └── header/
        └── header.css           # Header component with font integration
```

## 🚀 Quick Start

### 1. Download Fonts
- Download your desired font files (`.woff2`, `.woff`, `.ttf`, `.otf`)
- Place them in the appropriate `assets/fonts/` subdirectory

### 2. Add Font Definitions
Edit `src/renderer/styles/fonts.css` and add your font:

```css
@font-face {
    font-family: 'Your Custom Font';
    src: url('../../assets/fonts/YourFont-Regular.woff2') format('woff2'),
         url('../../assets/fonts/YourFont-Regular.woff') format('woff'),
         url('../../assets/fonts/YourFont-Regular.ttf') format('truetype');
    font-weight: normal;
    font-style: normal;
    font-display: swap;
}
```

### 3. Update Font Variables
Add your font to the CSS variables in `fonts.css`:

```css
:root {
    --font-custom: 'Your Custom Font', Arial, sans-serif;
}
```

### 4. Use in Components
Apply the font in your CSS:

```css
.my-component {
    font-family: var(--font-custom);
}
```

## 📁 Recommended Font Organization

### Primary Fonts (`assets/fonts/primary/`)
- Main application interface
- Body text and general UI
- Examples: Inter, Roboto, Open Sans

### Display Fonts (`assets/fonts/display/`)
- Headers and titles
- Large text elements
- Examples: Montserrat, Poppins, Playfair Display

### Monospace Fonts (`assets/fonts/monospace/`)
- Code and data display
- Tables and numerical data
- Examples: Fira Code, JetBrains Mono, Source Code Pro

### Icon Fonts (`assets/fonts/icons/`)
- UI icons and symbols
- Examples: Font Awesome, Material Icons

## 🎯 Current Font Usage

### Existing Fonts
- **Press Start 2P** - Retro gaming aesthetic (heroes, active windows)
- **System UI** - Clean, modern interface (most components)
- **Arial/Helvetica** - Fallback fonts

### Recommended Additions
1. **Display Font** - For headers and titles
2. **Monospace Font** - For data tables and code
3. **Icon Font** - For UI icons and symbols

## ⚡ Performance Optimization

### Font Loading Strategies

1. **Preload Critical Fonts**
```html
<link rel="preload" href="assets/fonts/CriticalFont.woff2" as="font" type="font/woff2" crossorigin>
```

2. **Use font-display: swap**
```css
@font-face {
    font-display: swap; /* Show fallback immediately */
}
```

3. **Font Subsetting**
- Only include characters you need
- Reduces file size significantly

### Font Loading States
The `FontLoader` utility provides loading states:

```javascript
// Preload fonts
await fontLoader.preloadCriticalFonts();

// Apply loading states
await fontLoader.applyFontLoadingStates('.header-title', 'Custom Display');
```

## 🔧 Integration Examples

### Header Component
The header component automatically uses the new font system:

```css
.header-title {
    font-family: var(--font-display, 'Arial Black', Arial, sans-serif);
}
```

### Heroes Window
Already updated to use the font system with Press Start 2P.

### Adding to New Components
1. Include the fonts CSS:
```html
<link rel="stylesheet" href="../styles/fonts.css" />
```

2. Use font variables:
```css
.my-component {
    font-family: var(--font-primary);
    font-size: var(--font-size-base);
}
```

## 🛠️ Development Workflow

### 1. Font Testing
```javascript
// Check if font is available
if (fontLoader.isFontAvailable('Your Font')) {
    console.log('Font is ready!');
}

// Get loading status
console.log(fontLoader.getStatus());
```

### 2. Font Fallbacks
Always provide fallbacks:
```css
font-family: 'Custom Font', 'Arial', sans-serif;
```

### 3. Responsive Fonts
Use CSS custom properties for responsive sizing:
```css
:root {
    --font-size-base: 14px;
}

@media (max-width: 768px) {
    :root {
        --font-size-base: 12px;
    }
}
```

## 📦 Font File Formats

### Recommended Formats (in order of preference)
1. **WOFF2** - Best compression, modern browsers
2. **WOFF** - Good compression, wide support  
3. **TTF** - TrueType, universal support
4. **OTF** - OpenType, advanced features

### File Size Guidelines
- **Display fonts**: < 50KB per weight
- **Body fonts**: < 30KB per weight
- **Icon fonts**: < 20KB total

## 🔍 Troubleshooting

### Common Issues

1. **Font not loading**
   - Check file paths are correct
   - Verify font files exist
   - Check browser console for errors

2. **Font not displaying**
   - Ensure font-family name matches @font-face
   - Check for typos in CSS
   - Verify fallback fonts work

3. **Performance issues**
   - Use font-display: swap
   - Preload critical fonts
   - Consider font subsetting

### Debug Tools
```javascript
// Check loaded fonts
console.log(document.fonts);

// Test font availability
document.fonts.check('16px "Your Font"');
```

## 📚 Resources

- [MDN Font Loading](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face)
- [Google Fonts](https://fonts.google.com/)
- [Font Squirrel](https://www.fontsquirrel.com/)
- [Font Display](https://developer.mozilla.org/en-US/docs/Web/CSS/font-display)

## 🎨 Font Recommendations

### For Trading Applications
- **Data Display**: Fira Code, JetBrains Mono
- **Headers**: Montserrat, Poppins
- **Body Text**: Inter, Roboto
- **Icons**: Material Icons, Font Awesome

### For Gaming Aesthetics
- **Retro**: Press Start 2P, Pixelated
- **Modern**: Orbitron, Exo 2
- **Fantasy**: Cinzel, Uncial Antiqua

