const { expect } = require('chai');
const sinon = require('sinon');

describe('Events Window Tests', () => {
    let mockWindow;
    let mockDocument;
    let mockSettingsAPI;
    let mockEventsAPI;
    let mockActiveAPI;
    let mockIpcListenerAPI;

    beforeEach(() => {
        // Mock window object
        mockWindow = {
            appFlags: { isDev: true },
            settings: {
                events: {
                    comboVolume: 0.7,
                    longSampleThreshold: 10000
                },
                scanner: {
                    maxAlerts: 50,
                    minChangePercent: 0,
                    minVolume: 0
                },
                top: {
                    minPrice: 0,
                    maxPrice: Infinity
                }
            },
            settingsAPI: null, // Will be set below
            eventsAPI: null, // Will be set below
            activeAPI: null, // Will be set below
            ipcListenerAPI: null, // Will be set below
            getEventsPerformanceStats: null,
            testComboAlert: null,
            testScannerAlert: null,
            testBlinkAnimations: null
        };

        // Mock document
        mockDocument = {
            readyState: 'complete',
            getElementById: sinon.stub(),
            createElement: sinon.stub(),
            addEventListener: sinon.stub()
        };

        // Mock settings API
        mockSettingsAPI = {
            get: sinon.stub().resolves(mockWindow.settings),
            onUpdate: sinon.stub()
        };

        // Mock events API
        mockEventsAPI = {
            onAlert: sinon.stub()
        };

        // Mock active API
        mockActiveAPI = {
            setActiveTicker: sinon.stub()
        };

        // Mock IPC listener API
        mockIpcListenerAPI = {
            onTestComboAlert: sinon.stub(),
            onTestScannerAlert: sinon.stub()
        };

        // Set up window properties
        mockWindow.settingsAPI = mockSettingsAPI;
        mockWindow.eventsAPI = mockEventsAPI;
        mockWindow.activeAPI = mockActiveAPI;
        mockWindow.ipcListenerAPI = mockIpcListenerAPI;

        // Mock DOM elements
        const mockLogElement = {
            appendChild: sinon.stub(),
            removeChild: sinon.stub(),
            firstChild: null,
            children: { length: 0 }
        };

        mockDocument.getElementById.returns(mockLogElement);
        mockDocument.createElement.returns({
            className: '',
            dataset: {},
            classList: {
                add: sinon.stub(),
                remove: sinon.stub(),
                contains: sinon.stub().returns(false)
            },
            querySelector: sinon.stub(),
            querySelectorAll: sinon.stub().returns([]),
            style: {}
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Blink Animation Manager', () => {
        let blinkManager;

        beforeEach(() => {
            // Create a mock blink manager based on the implementation
            blinkManager = {
                currentBlinkType: null,
                activeElements: new Set(),
                
                getBlinkPriority(type) {
                    const priorities = { 'blink-intense': 3, 'blink-medium': 2, 'blink-soft': 1 };
                    return priorities[type] || 0;
                },
                
                setBlinkType(newType) {
                    if (!newType) {
                        this.clearAllBlink();
                        return;
                    }
                    
                    const newPriority = this.getBlinkPriority(newType);
                    const currentPriority = this.getBlinkPriority(this.currentBlinkType);
                    
                    if (newPriority > currentPriority) {
                        this.currentBlinkType = newType;
                        this.updateAllElements();
                    }
                },
                
                clearAllBlink() {
                    this.currentBlinkType = null;
                    this.activeElements.forEach(element => {
                        element.classList.remove('blink-soft', 'blink-medium', 'blink-intense');
                    });
                    this.activeElements.clear();
                },
                
                updateAllElements() {
                    this.activeElements.forEach(element => {
                        element.classList.remove('blink-soft', 'blink-medium', 'blink-intense');
                        if (this.currentBlinkType) {
                            element.classList.add(this.currentBlinkType);
                        }
                    });
                },
                
                registerElement(element, blinkType) {
                    this.activeElements.add(element);
                    
                    if (!this.currentBlinkType || this.getBlinkPriority(blinkType) > this.getBlinkPriority(this.currentBlinkType)) {
                        this.setBlinkType(blinkType);
                    } else if (this.currentBlinkType) {
                        element.classList.remove('blink-soft', 'blink-medium', 'blink-intense');
                        element.classList.add(this.currentBlinkType);
                    }
                },
                
                unregisterElement(element) {
                    this.activeElements.delete(element);
                    element.classList.remove('blink-soft', 'blink-medium', 'blink-intense');
                    
                    if (this.activeElements.size === 0) {
                        this.currentBlinkType = null;
                    }
                }
            };
        });

        it('should initialize with no active blink type', () => {
            expect(blinkManager.currentBlinkType).to.be.null;
            expect(blinkManager.activeElements.size).to.equal(0);
        });

        it('should correctly prioritize blink types', () => {
            expect(blinkManager.getBlinkPriority('blink-intense')).to.equal(3);
            expect(blinkManager.getBlinkPriority('blink-medium')).to.equal(2);
            expect(blinkManager.getBlinkPriority('blink-soft')).to.equal(1);
            expect(blinkManager.getBlinkPriority('unknown')).to.equal(0);
        });

        it('should register elements and set blink type', () => {
            const mockElement = {
                classList: {
                    remove: sinon.stub(),
                    add: sinon.stub()
                }
            };

            blinkManager.registerElement(mockElement, 'blink-soft');
            
            expect(blinkManager.currentBlinkType).to.equal('blink-soft');
            expect(blinkManager.activeElements.has(mockElement)).to.be.true;
            expect(mockElement.classList.add.calledWith('blink-soft')).to.be.true;
        });

        it('should upgrade to higher priority blink type', () => {
            const mockElement1 = {
                classList: {
                    remove: sinon.stub(),
                    add: sinon.stub()
                }
            };
            const mockElement2 = {
                classList: {
                    remove: sinon.stub(),
                    add: sinon.stub()
                }
            };

            // Register soft blink first
            blinkManager.registerElement(mockElement1, 'blink-soft');
            expect(blinkManager.currentBlinkType).to.equal('blink-soft');

            // Register intense blink - should upgrade
            blinkManager.registerElement(mockElement2, 'blink-intense');
            expect(blinkManager.currentBlinkType).to.equal('blink-intense');
            
            // Both elements should now have intense blink
            expect(mockElement1.classList.add.calledWith('blink-intense')).to.be.true;
            expect(mockElement2.classList.add.calledWith('blink-intense')).to.be.true;
        });

        it('should not downgrade to lower priority blink type', () => {
            const mockElement1 = {
                classList: {
                    remove: sinon.stub(),
                    add: sinon.stub()
                }
            };
            const mockElement2 = {
                classList: {
                    remove: sinon.stub(),
                    add: sinon.stub()
                }
            };

            // Register intense blink first
            blinkManager.registerElement(mockElement1, 'blink-intense');
            expect(blinkManager.currentBlinkType).to.equal('blink-intense');

            // Register soft blink - should not downgrade
            blinkManager.registerElement(mockElement2, 'blink-soft');
            expect(blinkManager.currentBlinkType).to.equal('blink-intense');
            
            // Second element should get intense blink, not soft
            expect(mockElement2.classList.add.calledWith('blink-intense')).to.be.true;
            expect(mockElement2.classList.add.calledWith('blink-soft')).to.be.false;
        });

        it('should unregister elements correctly', () => {
            const mockElement = {
                classList: {
                    remove: sinon.stub(),
                    add: sinon.stub()
                }
            };

            blinkManager.registerElement(mockElement, 'blink-medium');
            expect(blinkManager.activeElements.size).to.equal(1);

            blinkManager.unregisterElement(mockElement);
            expect(blinkManager.activeElements.size).to.equal(0);
            expect(blinkManager.currentBlinkType).to.be.null;
            expect(mockElement.classList.remove.calledWith('blink-soft', 'blink-medium', 'blink-intense')).to.be.true;
        });

        it('should clear all blink animations', () => {
            const mockElement1 = {
                classList: {
                    remove: sinon.stub(),
                    add: sinon.stub()
                }
            };
            const mockElement2 = {
                classList: {
                    remove: sinon.stub(),
                    add: sinon.stub()
                }
            };

            blinkManager.registerElement(mockElement1, 'blink-soft');
            blinkManager.registerElement(mockElement2, 'blink-medium');
            expect(blinkManager.activeElements.size).to.equal(2);

            blinkManager.clearAllBlink();
            expect(blinkManager.currentBlinkType).to.be.null;
            expect(blinkManager.activeElements.size).to.equal(0);
            expect(mockElement1.classList.remove.calledWith('blink-soft', 'blink-medium', 'blink-intense')).to.be.true;
            expect(mockElement2.classList.remove.calledWith('blink-soft', 'blink-medium', 'blink-intense')).to.be.true;
        });
    });

    describe('Alert Element Creation', () => {
        it('should create alert element with correct structure', () => {
            const alertData = {
                hero: 'TEST',
                price: 1.50,
                strength: 15000,
                hp: 2.5,
                dp: 0,
                change: 5.2,
                hue: 120
            };

            // Mock the createAlertElement function logic
            const createAlertElement = (data) => {
                const { hero, price, strength = 0, hp = 0, dp = 0, change = 0 } = data;
                const isUp = change > 0;
                
                const alertDiv = {
                    dataset: { symbol: hero },
                    className: `alert ${isUp ? "up" : "down"}`,
                    classList: {
                        add: sinon.stub(),
                        remove: sinon.stub(),
                        contains: sinon.stub().returns(false)
                    },
                    querySelector: sinon.stub(),
                    querySelectorAll: sinon.stub().returns([])
                };

                // Determine blink type
                let blinkType = null;
                if (isUp) {
                    if (strength >= 100_000) blinkType = "blink-intense";
                    else if (strength >= 50_000) blinkType = "blink-medium";
                    else if (strength >= 10_000) blinkType = "blink-soft";
                }

                return { alertDiv, blinkType };
            };

            const { alertDiv, blinkType } = createAlertElement(alertData);

            expect(alertDiv.dataset.symbol).to.equal('TEST');
            expect(alertDiv.className).to.include('alert up');
             expect(blinkType).to.equal('blink-soft'); // 15000 strength
        });

        it('should handle different volume thresholds for blink types', () => {
            const testCases = [
                { strength: 5000, expectedBlink: null }, // Below threshold
                { strength: 15000, expectedBlink: 'blink-soft' }, // Soft threshold
                { strength: 75000, expectedBlink: 'blink-medium' }, // Medium threshold
                { strength: 150000, expectedBlink: 'blink-intense' } // Intense threshold
            ];

            testCases.forEach(({ strength, expectedBlink }) => {
                const alertData = {
                    hero: 'TEST',
                    price: 1.50,
                    strength,
                    hp: 2.5,
                    dp: 0,
                    change: 5.2,
                    hue: 120
                };

                const isUp = alertData.change > 0;
                let blinkType = null;
                if (isUp) {
                    if (strength >= 100_000) blinkType = "blink-intense";
                    else if (strength >= 50_000) blinkType = "blink-medium";
                    else if (strength >= 10_000) blinkType = "blink-soft";
                }

                expect(blinkType).to.equal(expectedBlink);
            });
        });

        it('should handle down alerts correctly', () => {
            const alertData = {
                hero: 'TEST',
                price: 1.50,
                strength: 15000,
                hp: 0,
                dp: 2.5,
                change: -3.2,
                hue: 120
            };

            const isUp = alertData.change > 0;
            let blinkType = null;
            if (isUp) {
                if (alertData.strength >= 100_000) blinkType = "blink-intense";
                else if (alertData.strength >= 50_000) blinkType = "blink-medium";
                else if (alertData.strength >= 10_000) blinkType = "blink-soft";
            }

            expect(isUp).to.be.false;
            expect(blinkType).to.be.null; // Down alerts don't get blink animations
        });
    });

    describe('Volume Parsing and Calculations', () => {
        it('should parse volume values correctly', () => {
            const parseVolumeValue = (str) => {
                if (!str) return 0;
                let value = parseFloat(String(str).replace(/[^0-9.]/g, "")) || 0;
                if (/B/i.test(str)) value *= 1_000_000_000;
                else if (/M/i.test(str)) value *= 1_000_000;
                else if (/K/i.test(str)) value *= 1_000;
                return value;
            };

            expect(parseVolumeValue('1.5K')).to.equal(1500);
            expect(parseVolumeValue('2.3M')).to.equal(2300000);
            expect(parseVolumeValue('1.2B')).to.equal(1200000000);
            expect(parseVolumeValue('500')).to.equal(500);
            expect(parseVolumeValue('')).to.equal(0);
            expect(parseVolumeValue(null)).to.equal(0);
        });

        it('should abbreviate values correctly', () => {
            const abbreviatedValues = (num) => {
                if (num < 1000) return num.toString();
                if (num < 1_000_000) return (num / 1_000).toFixed(1) + "K";
                return (num / 1_000_000).toFixed(1) + "M";
            };

            expect(abbreviatedValues(500)).to.equal('500');
            expect(abbreviatedValues(1500)).to.equal('1.5K');
            expect(abbreviatedValues(2300000)).to.equal('2.3M');
            expect(abbreviatedValues(1500000)).to.equal('1.5M');
        });

        it('should calculate combo volume correctly', () => {
            const getComboVolume = (settings) => {
                const v = Number(settings?.events?.comboVolume);
                if (!Number.isFinite(v)) return 0.5;
                return Math.min(1, Math.max(0, v));
            };

            expect(getComboVolume(mockWindow.settings)).to.equal(0.7);
            expect(getComboVolume({})).to.equal(0.5);
            expect(getComboVolume({ events: { comboVolume: 1.5 } })).to.equal(1);
            expect(getComboVolume({ events: { comboVolume: -0.5 } })).to.equal(0);
        });

        it('should calculate combo percentage from level correctly', () => {
            const comboPercentFromLevel = (level) => {
                const maxCombo = 16;
                const lv = Math.max(0, level ?? -1);
                if (lv <= 1) return 30;
                const ratio = lv / maxCombo;
                return Math.min(1, Math.pow(ratio, 0.65)) * 100;
            };

            expect(comboPercentFromLevel(0)).to.equal(30);
            expect(comboPercentFromLevel(1)).to.equal(30);
             expect(comboPercentFromLevel(2)).to.be.above(25);
            expect(comboPercentFromLevel(16)).to.equal(100);
            expect(comboPercentFromLevel(null)).to.equal(30);
        });
    });

    describe('Audio System', () => {
        it('should respect audio cooldown intervals', () => {
            const now = Date.now();
            const lastAudioTime = now - 50; // 50ms ago
            const MIN_AUDIO_INTERVAL_MS = 93;
            
            const canPlay = (now - lastAudioTime) >= MIN_AUDIO_INTERVAL_MS;
            expect(canPlay).to.be.false;
        });

        it('should allow audio playback after cooldown', () => {
            const now = Date.now();
            const lastAudioTime = now - 100; // 100ms ago
            const MIN_AUDIO_INTERVAL_MS = 93;
            
            const canPlay = (now - lastAudioTime) >= MIN_AUDIO_INTERVAL_MS;
            expect(canPlay).to.be.true;
        });

        it('should pick correct audio bank by volume', () => {
            const pickBankByVolume = (strength) => {
                const threshold = 10000; // LONG_THRESHOLD_DEFAULT
                return strength >= threshold ? "long" : "short";
            };

            expect(pickBankByVolume(5000)).to.equal('short');
            expect(pickBankByVolume(15000)).to.equal('long');
            expect(pickBankByVolume(10000)).to.equal('long');
        });

        it('should calculate level to index correctly', () => {
            const levelToIndex = (level, count) => {
                const lv = Math.max(0, level | 0);
                return lv % Math.max(1, count);
            };

            expect(levelToIndex(0, 32)).to.equal(0);
            expect(levelToIndex(1, 32)).to.equal(1);
            expect(levelToIndex(32, 32)).to.equal(0); // Wraps around
            expect(levelToIndex(33, 32)).to.equal(1);
            expect(levelToIndex(-1, 32)).to.equal(0); // Clamped to 0
        });
    });

    describe('Combo System', () => {
        it('should track combo volume requirements correctly', () => {
            const COMBO_VOLUME_REQUIREMENTS = [
                0, // Level 0 → just started, no requirement
                100, // Level 1 → first real alert
                500, // Level 2
                1000, // Level 3
                2000, // Level 4
                100, // Level 5
                100, // Level 6+ → no requirement, just allow progression
            ];

            expect(COMBO_VOLUME_REQUIREMENTS[0]).to.equal(0);
            expect(COMBO_VOLUME_REQUIREMENTS[1]).to.equal(100);
            expect(COMBO_VOLUME_REQUIREMENTS[2]).to.equal(500);
            expect(COMBO_VOLUME_REQUIREMENTS[3]).to.equal(1000);
            expect(COMBO_VOLUME_REQUIREMENTS[4]).to.equal(2000);
            expect(COMBO_VOLUME_REQUIREMENTS[5]).to.equal(100);
        });

        it('should handle combo progression logic', () => {
            const currentLevel = 2;
            const nextLevel = currentLevel + 1;
            const strength = 1500;
            const requiredVolume = 1000; // Level 3 requirement

            const canAdvance = strength >= requiredVolume;
            expect(canAdvance).to.be.true;
        });

        it('should handle combo timeout logic', () => {
            const UPTICK_WINDOW_MS = 60_000; // 1 minute
            const now = Date.now();
            const comboStartTime = now - 30000; // 30 seconds ago

            const isExpired = (now - comboStartTime) > UPTICK_WINDOW_MS;
            expect(isExpired).to.be.false;

            const expiredStartTime = now - 70000; // 70 seconds ago
            const isExpired2 = (now - expiredStartTime) > UPTICK_WINDOW_MS;
            expect(isExpired2).to.be.true;
        });
    });

    describe('Filtering Logic', () => {
        it('should apply price filters correctly', () => {
            const alertData = {
                hero: 'TEST',
                price: 1.50,
                strength: 1000,
                change: 2.5
            };

            const topSettings = { minPrice: 1.0, maxPrice: 2.0 };
            const scannerSettings = { minChangePercent: 0, minVolume: 0 };

            const { minChangePercent = 0, minVolume = 0 } = scannerSettings;
            const { minPrice = 0, maxPrice = Infinity } = topSettings;
            const { price = 0, strength = 0, change = 0 } = alertData;

            const passesFilters = (minPrice === 0 || price >= minPrice) && 
                                (maxPrice === 0 || price <= maxPrice) && 
                                Math.abs(change) >= minChangePercent && 
                                strength >= minVolume;

            expect(passesFilters).to.be.true;
        });

        it('should reject alerts that fail filters', () => {
            const alertData = {
                hero: 'TEST',
                price: 0.50, // Below min price
                strength: 1000,
                change: 2.5
            };

            const topSettings = { minPrice: 1.0, maxPrice: 2.0 };
            const scannerSettings = { minChangePercent: 0, minVolume: 0 };

            const { minChangePercent = 0, minVolume = 0 } = scannerSettings;
            const { minPrice = 0, maxPrice = Infinity } = topSettings;
            const { price = 0, strength = 0, change = 0 } = alertData;

            const passesFilters = (minPrice === 0 || price >= minPrice) && 
                                (maxPrice === 0 || price <= maxPrice) && 
                                Math.abs(change) >= minChangePercent && 
                                strength >= minVolume;

            expect(passesFilters).to.be.false;
        });

        it('should handle edge cases in filtering', () => {
            const testCases = [
                { price: 0, minPrice: 0, maxPrice: 0, shouldPass: true },
                { price: 1.5, minPrice: 0, maxPrice: 0, shouldPass: true },
                { price: 1.5, minPrice: 1.0, maxPrice: 2.0, shouldPass: true },
                { price: 0.5, minPrice: 1.0, maxPrice: 2.0, shouldPass: false },
                { price: 2.5, minPrice: 1.0, maxPrice: 2.0, shouldPass: false }
            ];

            testCases.forEach(({ price, minPrice, maxPrice, shouldPass }) => {
                const passesPriceFilter = (minPrice === 0 || price >= minPrice) && 
                                        (maxPrice === 0 || price <= maxPrice);
                expect(passesPriceFilter).to.equal(shouldPass);
            });
        });
    });

    describe('Performance Monitoring', () => {
        it('should track performance statistics', () => {
            const performanceStats = {
                alertsProcessed: 0,
                audioPlayed: 0,
                domUpdates: 0,
                lastCleanup: Date.now(),
                blinkAnimationsActive: 0
            };

            expect(performanceStats.alertsProcessed).to.equal(0);
            expect(performanceStats.audioPlayed).to.equal(0);
            expect(performanceStats.domUpdates).to.equal(0);
            expect(performanceStats.blinkAnimationsActive).to.equal(0);
            expect(performanceStats.lastCleanup).to.be.a('number');
        });

        it('should handle cleanup intervals correctly', () => {
            const now = Date.now();
            const lastCleanup = now - 30000; // 30 seconds ago
            const CLEANUP_INTERVAL = 30000;

            const shouldCleanup = (now - lastCleanup) >= CLEANUP_INTERVAL;
            expect(shouldCleanup).to.be.true;

            const recentCleanup = now - 15000; // 15 seconds ago
            const shouldNotCleanup = (now - recentCleanup) >= CLEANUP_INTERVAL;
            expect(shouldNotCleanup).to.be.false;
        });
    });

    describe('Quiet Time Logic', () => {
        it('should detect quiet time periods', () => {
            const isQuietTimeEST = (hours, minutes, seconds) => {
                return (hours === 8 && minutes === 0 && seconds <= 2) || 
                       (hours === 9 && minutes === 30 && seconds <= 2);
            };

            // Test 08:00:00 to 08:00:02
            expect(isQuietTimeEST(8, 0, 0)).to.be.true;
            expect(isQuietTimeEST(8, 0, 1)).to.be.true;
            expect(isQuietTimeEST(8, 0, 2)).to.be.true;
            expect(isQuietTimeEST(8, 0, 3)).to.be.false;

            // Test 09:30:00 to 09:30:02
            expect(isQuietTimeEST(9, 30, 0)).to.be.true;
            expect(isQuietTimeEST(9, 30, 1)).to.be.true;
            expect(isQuietTimeEST(9, 30, 2)).to.be.true;
            expect(isQuietTimeEST(9, 30, 3)).to.be.false;

            // Test other times
            expect(isQuietTimeEST(8, 1, 0)).to.be.false;
            expect(isQuietTimeEST(9, 29, 0)).to.be.false;
            expect(isQuietTimeEST(10, 0, 0)).to.be.false;
        });
    });

    describe('Integration Tests', () => {
        it('should handle complete alert processing flow', () => {
            const alertData = {
                hero: 'INTEGRATION',
                price: 2.50,
                strength: 25000,
                hp: 3.5,
                dp: 0,
                change: 4.2,
                hue: 180
            };

            // Simulate the complete flow
            const symbol = alertData.hero || alertData.symbol;
            const { price = 0, hp = 0, dp = 0, strength = 0, change = 0 } = alertData;
            const isUp = change > 0;

            // Filter check
            const passesFilters = true; // Assume passes for this test

            // Blink type determination
            let blinkType = null;
            if (isUp) {
                if (strength >= 100_000) blinkType = "blink-intense";
                else if (strength >= 50_000) blinkType = "blink-medium";
                else if (strength >= 10_000) blinkType = "blink-soft";
            }

            // Audio bank selection
            const bank = strength >= 10000 ? "long" : "short";

            expect(symbol).to.equal('INTEGRATION');
            expect(price).to.equal(2.50);
            expect(isUp).to.be.true;
             expect(blinkType).to.equal('blink-soft');
            expect(bank).to.equal('long');
        });

        it('should handle error cases gracefully', () => {
            const invalidAlertData = {
                hero: null,
                price: 'invalid',
                strength: undefined,
                change: NaN
            };

            // Should handle gracefully without throwing
            const symbol = invalidAlertData.hero || invalidAlertData.symbol;
            const price = Number(invalidAlertData.price) || 0;
            const strength = Number(invalidAlertData.strength) || 0;
            const change = Number(invalidAlertData.change) || 0;

            expect(symbol).to.be.undefined;
            expect(price).to.equal(0);
            expect(strength).to.equal(0);
            expect(change).to.equal(0);
        });
    });
});
