# Symbol Component

A reusable symbol display component with configurable size and styling.

## Usage

```javascript
// Basic usage
const symbolHtml = window.components.Symbol({ 
    symbol: "AAPL" 
});

// With size configuration
const smallSymbol = window.components.Symbol({ 
    symbol: "TSLA", 
    size: "small" 
});

const largeSymbol = window.components.Symbol({ 
    symbol: "NVDA", 
    size: "large" 
});

// With trophy display
const trophySymbol = window.components.Symbol({ 
    symbol: "MSFT", 
    size: "medium",
    showTrophy: true,
    rank: 1  // Shows gold trophy
});

// With custom styling
const customSymbol = window.components.Symbol({ 
    symbol: "GOOGL", 
    size: "medium",
    customStyle: {
        "border": "2px solid #00ff00",
        "margin": "5px"
    }
});

// With click handler
const clickableSymbol = window.components.Symbol({ 
    symbol: "AMZN", 
    size: "medium",
    onClick: true  // Enables click to copy + set active
});
```

## Parameters

- `symbol` (string, required): The symbol to display
- `size` (string, optional): Size variant - "small", "medium", "large", "xlarge" (default: "medium")
- `onClick` (boolean, optional): Enable click functionality to copy symbol and set as active (default: false)
- `showTrophy` (boolean, optional): Show trophy icon for top 3 ranks (default: false)
- `rank` (number, optional): Rank number for trophy display (1=gold, 2=silver, 3=bronze)
- `customStyle` (object, optional): Additional CSS styles to apply

## Size Variants

- **small**: 50px width, 12px font
- **medium**: 75px width, 16px font (default)
- **large**: 100px width, 20px font
- **xlarge**: 120px width, 24px font

## Features

- Automatic color generation based on symbol name
- Trophy support for top 3 rankings
- Click to copy symbol to clipboard
- Click to set as active ticker
- Configurable sizes
- Custom styling support
- Hover effects and animations
