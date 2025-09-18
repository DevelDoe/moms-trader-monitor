# Font Assets Directory

This directory contains custom fonts for the MTM application.

## Font Installation Guide

### 1. Download Fonts
- Place font files (`.ttf`, `.otf`, `.woff`, `.woff2`) in this directory
- Recommended formats: `.woff2` (best compression) and `.woff` (fallback)

### 2. Font File Organization
```
assets/fonts/
├── primary/           # Main application fonts
├── display/           # Headers and titles
├── monospace/         # Code and data display
└── fallback/          # System font fallbacks
```

### 3. Supported Font Formats
- **WOFF2** - Best compression, modern browsers
- **WOFF** - Good compression, wide support
- **TTF** - TrueType, universal support
- **OTF** - OpenType, advanced features

## Current Font Usage

### Primary Fonts
- **Press Start 2P** - Retro gaming aesthetic (heroes, active windows)
- **System UI** - Clean, modern interface

### Recommended Additions
- **Display Font** - For headers and titles
- **Monospace Font** - For data tables and code
- **Icon Font** - For UI icons and symbols

## CSS Integration

Fonts are loaded via CSS `@font-face` declarations in:
- `src/renderer/styles/fonts.css` - Main font definitions
- Individual component CSS files for specific needs

## Performance Considerations

- Use `font-display: swap` for better loading performance
- Preload critical fonts in HTML head
- Consider font subsetting for smaller file sizes
- Use font fallbacks for better compatibility

