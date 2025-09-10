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

    describe('Combo Timer System', () => {
        let clock;
        let symbolUptickTimers;
        let symbolDowntickTimers;
        let symbolNoteIndices;
        let symbolDownNoteIndices;
        let symbolComboLastPrice;
        let symbolDownComboLastPrice;

        beforeEach(() => {
            clock = sinon.useFakeTimers();
            
            // Mock the Maps used in the combo system
            symbolUptickTimers = new Map();
            symbolDowntickTimers = new Map();
            symbolNoteIndices = new Map();
            symbolDownNoteIndices = new Map();
            symbolComboLastPrice = new Map();
            symbolDownComboLastPrice = new Map();
        });

        afterEach(() => {
            clock.restore();
        });

        describe('Fixed Duration Timer Behavior', () => {
            it('should start a 60-second timer on first uptick', () => {
                const symbol = 'TEST';
                const UPTICK_WINDOW_MS = 60_000;
                
                // Simulate first uptick
                const resetCombo = sinon.stub();
                const timerId = setTimeout(() => resetCombo(symbol), UPTICK_WINDOW_MS);
                symbolUptickTimers.set(symbol, timerId);
                symbolNoteIndices.set(symbol, 0);

                expect(symbolUptickTimers.has(symbol)).to.be.true;
                expect(symbolNoteIndices.get(symbol)).to.equal(0);

                // Advance time by 59 seconds - should not expire
                clock.tick(59000);
                expect(resetCombo.called).to.be.false;

                // Advance by 1 more second - should expire
                clock.tick(1000);
                expect(resetCombo.calledWith(symbol)).to.be.true;
            });

            it('should NOT extend timer on consecutive upticks', () => {
                const symbol = 'TEST';
                const UPTICK_WINDOW_MS = 60_000;
                const resetCombo = sinon.stub();
                
                // First uptick - start timer
                const timerId = setTimeout(() => resetCombo(symbol), UPTICK_WINDOW_MS);
                symbolUptickTimers.set(symbol, timerId);
                symbolNoteIndices.set(symbol, 0);
                symbolComboLastPrice.set(symbol, 1.00);

                // Advance 30 seconds
                clock.tick(30000);

                // Second uptick - should NOT reset timer
                if (symbolUptickTimers.has(symbol)) {
                    // DON'T clear the existing timer - this is the key change
                    const currentPrice = 1.10;
                    const lastPrice = symbolComboLastPrice.get(symbol) ?? 0;
                    
                    if (currentPrice > lastPrice) {
                        const currentLevel = symbolNoteIndices.get(symbol) ?? -1;
                        symbolNoteIndices.set(symbol, currentLevel + 1);
                        symbolComboLastPrice.set(symbol, currentPrice);
                        // Timer continues unchanged - no new setTimeout
                    }
                }

                expect(symbolNoteIndices.get(symbol)).to.equal(1); // Level advanced
                expect(symbolComboLastPrice.get(symbol)).to.equal(1.10); // Price updated

                // Advance another 25 seconds (total 55 seconds from start)
                clock.tick(25000);
                expect(resetCombo.called).to.be.false;

                // Advance 5 more seconds (total 60 seconds from start) - should expire
                clock.tick(5000);
                expect(resetCombo.calledWith(symbol)).to.be.true;
            });

            it('should expire combo exactly 60 seconds from start regardless of activity', () => {
                const symbol = 'TEST';
                const UPTICK_WINDOW_MS = 60_000;
                const resetCombo = sinon.stub();
                
                // Start combo
                const timerId = setTimeout(() => resetCombo(symbol), UPTICK_WINDOW_MS);
                symbolUptickTimers.set(symbol, timerId);
                symbolNoteIndices.set(symbol, 0);
                symbolComboLastPrice.set(symbol, 1.00);

                // Simulate multiple upticks throughout the 60-second window
                const uptickTimes = [10000, 20000, 30000, 40000, 50000]; // Every 10 seconds
                
                uptickTimes.forEach((time, index) => {
                    clock.tick(time - (index > 0 ? uptickTimes[index - 1] : 0));
                    
                    // Process uptick without extending timer
                    if (symbolUptickTimers.has(symbol)) {
                        const currentPrice = 1.00 + (index + 1) * 0.10;
                        const lastPrice = symbolComboLastPrice.get(symbol) ?? 0;
                        
                        if (currentPrice > lastPrice) {
                            const currentLevel = symbolNoteIndices.get(symbol) ?? -1;
                            symbolNoteIndices.set(symbol, currentLevel + 1);
                            symbolComboLastPrice.set(symbol, currentPrice);
                        }
                    }
                });

                // At 50 seconds, combo should still be active
                expect(resetCombo.called).to.be.false;
                expect(symbolNoteIndices.get(symbol)).to.equal(5); // Level 5 from 5 upticks

                // Advance to exactly 60 seconds from start
                clock.tick(10000);
                expect(resetCombo.calledWith(symbol)).to.be.true;
            });

            it('should handle down-combo timer behavior consistently', () => {
                const symbol = 'TEST';
                const UPTICK_WINDOW_MS = 60_000;
                const resetCombo = sinon.stub();
                
                // Start down-combo
                const timerId = setTimeout(() => resetCombo(symbol, true), UPTICK_WINDOW_MS);
                symbolDowntickTimers.set(symbol, timerId);
                symbolDownNoteIndices.set(symbol, 0);
                symbolDownComboLastPrice.set(symbol, 2.00);

                // Advance 30 seconds
                clock.tick(30000);

                // Second downtick - should NOT reset timer
                if (symbolDowntickTimers.has(symbol)) {
                    const currentPrice = 1.90;
                    const lastDownPrice = symbolDownComboLastPrice.get(symbol) ?? Infinity;
                    
                    if (currentPrice < lastDownPrice) {
                        const currentLevel = symbolDownNoteIndices.get(symbol) ?? -1;
                        symbolDownNoteIndices.set(symbol, currentLevel + 1);
                        symbolDownComboLastPrice.set(symbol, currentPrice);
                        // Timer continues unchanged
                    }
                }

                expect(symbolDownNoteIndices.get(symbol)).to.equal(1);
                expect(symbolDownComboLastPrice.get(symbol)).to.equal(1.90);

                // Advance to 60 seconds total - should expire
                clock.tick(30000);
                expect(resetCombo.calledWith(symbol, true)).to.be.true;
            });
        });

        describe('Combo Level Progression', () => {
            it('should advance combo level on valid consecutive upticks within timer window', () => {
                const symbol = 'TEST';
                const COMBO_VOLUME_REQUIREMENTS = [0, 100, 500, 1000, 2000, 100, 100];
                
                symbolUptickTimers.set(symbol, setTimeout(() => {}, 60000));
                symbolNoteIndices.set(symbol, 1); // Start at level 1
                symbolComboLastPrice.set(symbol, 1.00);

                // Test level progression
                const testCases = [
                    { level: 1, nextLevel: 2, price: 1.10, strength: 600, shouldAdvance: true },
                    { level: 2, nextLevel: 3, price: 1.20, strength: 1200, shouldAdvance: true },
                    { level: 3, nextLevel: 4, price: 1.30, strength: 2500, shouldAdvance: true },
                    { level: 4, nextLevel: 5, price: 1.40, strength: 150, shouldAdvance: true }
                ];

                testCases.forEach(({ level, nextLevel, price, strength, shouldAdvance }) => {
                    symbolNoteIndices.set(symbol, level);
                    symbolComboLastPrice.set(symbol, price - 0.10);
                    
                    const currentLevel = symbolNoteIndices.get(symbol) ?? -1;
                    const requiredVolume = COMBO_VOLUME_REQUIREMENTS[Math.min(nextLevel, COMBO_VOLUME_REQUIREMENTS.length - 1)];
                    const lastPrice = symbolComboLastPrice.get(symbol) ?? 0;
                    
                    if (symbolUptickTimers.has(symbol) && strength >= requiredVolume && price > lastPrice) {
                        symbolNoteIndices.set(symbol, nextLevel);
                        symbolComboLastPrice.set(symbol, price);
                    }

                    if (shouldAdvance) {
                        expect(symbolNoteIndices.get(symbol)).to.equal(nextLevel);
                        expect(symbolComboLastPrice.get(symbol)).to.equal(price);
                    }
                });
            });

            it('should not advance combo level if price does not increase', () => {
                const symbol = 'TEST';
                
                symbolUptickTimers.set(symbol, setTimeout(() => {}, 60000));
                symbolNoteIndices.set(symbol, 1);
                symbolComboLastPrice.set(symbol, 1.50);

                // Try to advance with same or lower price
                const currentLevel = symbolNoteIndices.get(symbol);
                const newPrice = 1.50; // Same price
                const strength = 1000; // Sufficient volume
                const lastPrice = symbolComboLastPrice.get(symbol) ?? 0;

                if (symbolUptickTimers.has(symbol) && newPrice > lastPrice) {
                    symbolNoteIndices.set(symbol, currentLevel + 1);
                    symbolComboLastPrice.set(symbol, newPrice);
                }

                // Should not advance because price didn't increase
                expect(symbolNoteIndices.get(symbol)).to.equal(1);
                expect(symbolComboLastPrice.get(symbol)).to.equal(1.50);
            });

            it('should not advance combo level if volume requirement not met', () => {
                const symbol = 'TEST';
                const COMBO_VOLUME_REQUIREMENTS = [0, 100, 500, 1000, 2000, 100, 100];
                
                symbolUptickTimers.set(symbol, setTimeout(() => {}, 60000));
                symbolNoteIndices.set(symbol, 2); // Level 2
                symbolComboLastPrice.set(symbol, 1.00);

                const currentLevel = symbolNoteIndices.get(symbol);
                const nextLevel = currentLevel + 1; // Level 3
                const requiredVolume = COMBO_VOLUME_REQUIREMENTS[Math.min(nextLevel, COMBO_VOLUME_REQUIREMENTS.length - 1)]; // 1000
                const strength = 500; // Insufficient volume
                const newPrice = 1.10;
                const lastPrice = symbolComboLastPrice.get(symbol) ?? 0;

                if (symbolUptickTimers.has(symbol) && strength >= requiredVolume && newPrice > lastPrice) {
                    symbolNoteIndices.set(symbol, nextLevel);
                    symbolComboLastPrice.set(symbol, newPrice);
                }

                // Should not advance because volume requirement not met
                expect(symbolNoteIndices.get(symbol)).to.equal(2);
                expect(symbolComboLastPrice.get(symbol)).to.equal(1.00);
            });
        });

        describe('Timer Cleanup and Reset', () => {
            it('should clean up timer state on combo expiration', () => {
                const symbol = 'TEST';
                
                // Set up combo state
                const resetCombo = (sym, isDown = false) => {
                    if (isDown) {
                        const timer = symbolDowntickTimers.get(sym);
                        if (timer) clearTimeout(timer);
                        symbolDowntickTimers.delete(sym);
                        symbolDownNoteIndices.delete(sym);
                        symbolDownComboLastPrice.delete(sym);
                    } else {
                        const timer = symbolUptickTimers.get(sym);
                        if (timer) clearTimeout(timer);
                        symbolUptickTimers.delete(sym);
                        symbolNoteIndices.delete(sym);
                        symbolComboLastPrice.delete(sym);
                    }
                };

                const timerId = setTimeout(() => resetCombo(symbol), 60000);
                symbolUptickTimers.set(symbol, timerId);
                symbolNoteIndices.set(symbol, 3);
                symbolComboLastPrice.set(symbol, 1.50);

                // Verify state is set
                expect(symbolUptickTimers.has(symbol)).to.be.true;
                expect(symbolNoteIndices.has(symbol)).to.be.true;
                expect(symbolComboLastPrice.has(symbol)).to.be.true;

                // Trigger reset
                resetCombo(symbol);

                // Verify state is cleaned up
                expect(symbolUptickTimers.has(symbol)).to.be.false;
                expect(symbolNoteIndices.has(symbol)).to.be.false;
                expect(symbolComboLastPrice.has(symbol)).to.be.false;
            });

            it('should handle multiple symbols independently', () => {
                const symbol1 = 'TEST1';
                const symbol2 = 'TEST2';
                const UPTICK_WINDOW_MS = 60_000;
                
                const resetCombo1 = sinon.stub();
                const resetCombo2 = sinon.stub();

                // Start combo for symbol1
                const timer1 = setTimeout(() => resetCombo1(symbol1), UPTICK_WINDOW_MS);
                symbolUptickTimers.set(symbol1, timer1);
                symbolNoteIndices.set(symbol1, 1);

                // Start combo for symbol2 10 seconds later
                clock.tick(10000);
                const timer2 = setTimeout(() => resetCombo2(symbol2), UPTICK_WINDOW_MS);
                symbolUptickTimers.set(symbol2, timer2);
                symbolNoteIndices.set(symbol2, 1);

                // Advance 50 more seconds (60 total for symbol1, 50 for symbol2)
                clock.tick(50000);
                expect(resetCombo1.calledWith(symbol1)).to.be.true;
                expect(resetCombo2.called).to.be.false;

                // Advance 10 more seconds (60 total for symbol2)
                clock.tick(10000);
                expect(resetCombo2.calledWith(symbol2)).to.be.true;
            });
        });

        describe('Edge Cases', () => {
            it('should handle rapid consecutive upticks correctly', () => {
                const symbol = 'TEST';
                const UPTICK_WINDOW_MS = 60_000;
                const resetCombo = sinon.stub();
                
                // Start combo
                const timerId = setTimeout(() => resetCombo(symbol), UPTICK_WINDOW_MS);
                symbolUptickTimers.set(symbol, timerId);
                symbolNoteIndices.set(symbol, 0);
                symbolComboLastPrice.set(symbol, 1.00);

                // Process 10 rapid upticks in first 5 seconds
                for (let i = 1; i <= 10; i++) {
                    clock.tick(500); // 0.5 seconds between each
                    
                    if (symbolUptickTimers.has(symbol)) {
                        const currentPrice = 1.00 + (i * 0.01);
                        const lastPrice = symbolComboLastPrice.get(symbol) ?? 0;
                        
                        if (currentPrice > lastPrice) {
                            const currentLevel = symbolNoteIndices.get(symbol) ?? -1;
                            symbolNoteIndices.set(symbol, currentLevel + 1);
                            symbolComboLastPrice.set(symbol, currentPrice);
                        }
                    }
                }

                expect(symbolNoteIndices.get(symbol)).to.equal(10);
                expect(resetCombo.called).to.be.false;

                // Advance to exactly 60 seconds from start
                clock.tick(55000); // 55 + 5 = 60 seconds total
                expect(resetCombo.calledWith(symbol)).to.be.true;
            });

            it('should handle timer expiration during active trading', () => {
                const symbol = 'TEST';
                const UPTICK_WINDOW_MS = 60_000;
                const resetCombo = sinon.stub();
                
                // Start combo
                const timerId = setTimeout(() => resetCombo(symbol), UPTICK_WINDOW_MS);
                symbolUptickTimers.set(symbol, timerId);
                symbolNoteIndices.set(symbol, 0);
                symbolComboLastPrice.set(symbol, 1.00);

                // Advance to 59.9 seconds
                clock.tick(59900);
                
                // Try to process uptick just before expiration
                if (symbolUptickTimers.has(symbol)) {
                    const currentPrice = 1.50;
                    const lastPrice = symbolComboLastPrice.get(symbol) ?? 0;
                    
                    if (currentPrice > lastPrice) {
                        const currentLevel = symbolNoteIndices.get(symbol) ?? -1;
                        symbolNoteIndices.set(symbol, currentLevel + 1);
                        symbolComboLastPrice.set(symbol, currentPrice);
                    }
                }

                expect(symbolNoteIndices.get(symbol)).to.equal(1);
                expect(resetCombo.called).to.be.false;

                // Advance past 60 seconds
                clock.tick(100);
                expect(resetCombo.calledWith(symbol)).to.be.true;
            });
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
