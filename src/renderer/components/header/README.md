# Header Component

A reusable header component for all windows in the MTM application.

## Usage

### 1. Include the component files in your HTML

```html
<head>
    <!-- Include the header CSS -->
    <link rel="stylesheet" href="../components/header/header.css" />
</head>
<body>
    <!-- Add a container for the header -->
    <div id="header-container"></div>
    
    <!-- Your window content -->
    <div id="your-window-content">
        <!-- ... -->
    </div>
    
    <!-- Include the header JavaScript -->
    <script src="../components/header/header.js"></script>
    <script src="./your-window.js"></script>
</body>
```

### 2. Initialize the header in your JavaScript

```javascript
// In your window's boot/init function
const headerContainer = document.getElementById("header-container");
if (headerContainer && window.HeaderComponent) {
    new window.HeaderComponent(headerContainer, {
        icon: "🛡️",
        text: "Your Window Title",
        className: "your-window-header"
    });
}
```

## Configuration Options

- `icon`: The emoji or icon to display (string)
- `text`: The header text (string)
- `className`: Additional CSS class for styling (string)

## Examples

### Heroes Window
```javascript
new window.HeaderComponent(headerContainer, {
    icon: "🛡️",
    text: "Heroes of Myth and Momentum (sustained)",
    className: "heroes-header"
});
```

### HOD Window
```javascript
new window.HeaderComponent(headerContainer, {
    icon: "🗻",
    text: "Ledger of Summits (HOD)",
    className: "hod-header"
});
```

### Halts Window
```javascript
new window.HeaderComponent(headerContainer, {
    icon: "⚖️",
    text: "Edict of stasis (halts)",
    className: "halts-header"
});
```

### News Window
```javascript
new window.HeaderComponent(headerContainer, {
    icon: "📜",
    text: "Spells of Enchantments (news)",
    className: "news-header"
});
```

## Methods

The HeaderComponent class provides these methods:

- `update(options)`: Update the header with new options
- `setIcon(icon)`: Change just the icon
- `setText(text)`: Change just the text
- `addClass(className)`: Add a CSS class
- `removeClass(className)`: Remove a CSS class

## Styling

The component includes built-in styling that works with both light and dark themes. You can override styles by targeting the `.window-header` or `.header-title` classes, or add custom classes via the `className` option.

