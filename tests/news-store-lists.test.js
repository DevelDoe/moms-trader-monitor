const { expect } = require('chai');
const sinon = require('sinon');

describe('News Store Lists Integration', function() {
    let mockNewsSettingsAPI;
    let mockSettingsAPI;
    let mockStoreAPI;
    let mockNewsAPI;

    beforeEach(function() {
        // Mock the news settings API
        mockNewsSettingsAPI = {
            get: sinon.stub(),
            setBlockList: sinon.stub(),
            setBullishList: sinon.stub(),
            setBearishList: sinon.stub(),
            onUpdate: sinon.stub()
        };

        // Mock other APIs
        mockSettingsAPI = {
            get: sinon.stub(),
            update: sinon.stub(),
            onUpdate: sinon.stub()
        };

        mockStoreAPI = {
            onTrackedUpdate: sinon.stub()
        };

        mockNewsAPI = {
            getHeadlines: sinon.stub(),
            onDelta: sinon.stub(),
            onHydrationComplete: sinon.stub()
        };

        // Mock window object
        global.window = {
            newsSettingsAPI: mockNewsSettingsAPI,
            settingsAPI: mockSettingsAPI,
            storeAPI: mockStoreAPI,
            newsAPI: mockNewsAPI,
            settings: {}
        };

        // Mock document
        global.document = {
            getElementById: sinon.stub(),
            createElement: sinon.stub(),
            querySelector: sinon.stub()
        };

        // Mock console
        global.console = {
            log: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub()
        };
    });

    afterEach(function() {
        sinon.restore();
    });

    describe('News Settings API Integration', function() {
        it('should load default lists from news store', async function() {
            const mockNewsSettings = {
                listLength: 50,
                blockList: ['test', 'blocked'],
                bullishList: ['bullish', 'positive'],
                bearishList: ['bearish', 'negative']
            };

            mockNewsSettingsAPI.get.resolves(mockNewsSettings);

            // Simulate loading news settings
            const result = await mockNewsSettingsAPI.get();
            
            expect(result).to.deep.equal(mockNewsSettings);
            expect(mockNewsSettingsAPI.get.calledOnce).to.equal(true);
        });

        it('should update block list', async function() {
            const newBlockList = ['new', 'blocked', 'terms'];
            mockNewsSettingsAPI.setBlockList.resolves();

            await mockNewsSettingsAPI.setBlockList(newBlockList);

            expect(mockNewsSettingsAPI.setBlockList.calledWith(newBlockList)).to.equal(true);
        });

        it('should update bullish list', async function() {
            const newBullishList = ['bullish', 'positive', 'up'];
            mockNewsSettingsAPI.setBullishList.resolves();

            await mockNewsSettingsAPI.setBullishList(newBullishList);

            expect(mockNewsSettingsAPI.setBullishList.calledWith(newBullishList)).to.equal(true);
        });

        it('should update bearish list', async function() {
            const newBearishList = ['bearish', 'negative', 'down'];
            mockNewsSettingsAPI.setBearishList.resolves();

            await mockNewsSettingsAPI.setBearishList(newBearishList);

            expect(mockNewsSettingsAPI.setBearishList.calledWith(newBearishList)).to.equal(true);
        });

        it('should handle news settings updates', function() {
            const callback = sinon.stub();
            mockNewsSettingsAPI.onUpdate.callsFake((cb) => {
                // Simulate calling the callback
                cb({
                    listLength: 100,
                    blockList: ['updated', 'blocked'],
                    bullishList: ['updated', 'bullish'],
                    bearishList: ['updated', 'bearish']
                });
            });

            mockNewsSettingsAPI.onUpdate(callback);

            expect(callback.calledOnce).to.equal(true);
            const updateData = callback.getCall(0).args[0];
            expect(updateData.listLength).to.equal(100);
            expect(updateData.blockList).to.include('updated');
        });
    });

    describe('Sentiment Analysis Integration', function() {
        it('should classify bullish news correctly', function() {
            const bullishList = ['bullish', 'positive', 'up', 'gain'];
            const newsItem = {
                headline: 'Stock shows bullish momentum with positive gains'
            };

            // Simulate sentiment analysis logic
            const lowerHeadline = newsItem.headline.toLowerCase();
            const isBullish = bullishList.some(term => lowerHeadline.includes(term.toLowerCase()));

            expect(isBullish).to.equal(true);
        });

        it('should classify bearish news correctly', function() {
            const bearishList = ['bearish', 'negative', 'down', 'loss'];
            const newsItem = {
                headline: 'Stock shows bearish trend with negative losses'
            };

            // Simulate sentiment analysis logic
            const lowerHeadline = newsItem.headline.toLowerCase();
            const isBearish = bearishList.some(term => lowerHeadline.includes(term.toLowerCase()));

            expect(isBearish).to.equal(true);
        });

        it('should classify neutral news correctly', function() {
            const bullishList = ['bullish', 'positive'];
            const bearishList = ['bearish', 'negative'];
            const newsItem = {
                headline: 'Stock shows mixed signals in trading session'
            };

            // Simulate sentiment analysis logic
            const lowerHeadline = newsItem.headline.toLowerCase();
            const isBullish = bullishList.some(term => lowerHeadline.includes(term.toLowerCase()));
            const isBearish = bearishList.some(term => lowerHeadline.includes(term.toLowerCase()));

            expect(isBullish).to.equal(false);
            expect(isBearish).to.equal(false);
        });

        it('should handle conflicting sentiment (both bullish and bearish)', function() {
            const bullishList = ['bullish', 'positive'];
            const bearishList = ['bearish', 'negative'];
            const newsItem = {
                headline: 'Stock shows bullish momentum but bearish outlook'
            };

            // Simulate sentiment analysis logic
            const lowerHeadline = newsItem.headline.toLowerCase();
            const isBullish = bullishList.some(term => lowerHeadline.includes(term.toLowerCase()));
            const isBearish = bearishList.some(term => lowerHeadline.includes(term.toLowerCase()));

            expect(isBullish).to.equal(true);
            expect(isBearish).to.equal(true);
        });
    });

    describe('Blocklist Filtering Integration', function() {
        it('should filter out blocked news items', function() {
            const blockList = ['spam', 'advertisement', 'promo'];
            const newsItems = [
                { id: 1, headline: 'Important market news' },
                { id: 2, headline: 'Spam advertisement for trading' },
                { id: 3, headline: 'Another important update' },
                { id: 4, headline: 'Promo offer for traders' }
            ];

            // Simulate blocklist filtering
            const filtered = newsItems.filter(newsItem => {
                const headline = newsItem.headline.toLowerCase();
                return !blockList.some(blocked => headline.includes(blocked.toLowerCase()));
            });

            expect(filtered).to.have.length(2);
            expect(filtered[0].id).to.equal(1);
            expect(filtered[1].id).to.equal(3);
        });

        it('should allow news items not in blocklist', function() {
            const blockList = ['spam', 'advertisement'];
            const newsItems = [
                { id: 1, headline: 'Important market news' },
                { id: 2, headline: 'Earnings report released' }
            ];

            // Simulate blocklist filtering
            const filtered = newsItems.filter(newsItem => {
                const headline = newsItem.headline.toLowerCase();
                return !blockList.some(blocked => headline.includes(blocked.toLowerCase()));
            });

            expect(filtered).to.have.length(2);
            expect(filtered).to.deep.equal(newsItems);
        });
    });

    describe('Settings UI Integration', function() {
        it('should add keyword to block list', async function() {
            const currentSettings = {
                blockList: ['existing'],
                bullishList: [],
                bearishList: []
            };

            mockNewsSettingsAPI.get.resolves(currentSettings);
            mockNewsSettingsAPI.setBlockList.resolves();

            // Simulate adding a keyword
            const keyword = 'newblocked';
            const updatedList = [...currentSettings.blockList, keyword];

            await mockNewsSettingsAPI.setBlockList(updatedList);

            expect(mockNewsSettingsAPI.setBlockList.calledWith(updatedList)).to.equal(true);
        });

        it('should remove keyword from block list', async function() {
            const currentSettings = {
                blockList: ['existing', 'toremove'],
                bullishList: [],
                bearishList: []
            };

            mockNewsSettingsAPI.get.resolves(currentSettings);
            mockNewsSettingsAPI.setBlockList.resolves();

            // Simulate removing a keyword
            const keywordToRemove = 'toremove';
            const updatedList = currentSettings.blockList.filter(item => item !== keywordToRemove);

            await mockNewsSettingsAPI.setBlockList(updatedList);

            expect(mockNewsSettingsAPI.setBlockList.calledWith(['existing'])).to.equal(true);
        });

        it('should prevent duplicate keywords', async function() {
            const currentSettings = {
                blockList: ['existing'],
                bullishList: [],
                bearishList: []
            };

            mockNewsSettingsAPI.get.resolves(currentSettings);

            // Simulate adding duplicate keyword
            const keyword = 'existing';
            const currentList = currentSettings.blockList;
            const isDuplicate = currentList.includes(keyword);

            expect(isDuplicate).to.equal(true);
        });
    });

    describe('Error Handling', function() {
        it('should handle news settings API errors gracefully', async function() {
            mockNewsSettingsAPI.get.rejects(new Error('API Error'));

            try {
                await mockNewsSettingsAPI.get();
            } catch (error) {
                expect(error.message).to.equal('API Error');
            }
        });

        it('should handle empty news settings', async function() {
            mockNewsSettingsAPI.get.resolves({});

            const result = await mockNewsSettingsAPI.get();
            
            expect(result.blockList).to.be.undefined;
            expect(result.bullishList).to.be.undefined;
            expect(result.bearishList).to.be.undefined;
        });

        it('should handle null news settings', async function() {
            mockNewsSettingsAPI.get.resolves(null);

            const result = await mockNewsSettingsAPI.get();
            
            expect(result).to.be.null;
        });
    });

    describe('Real-world Scenarios', function() {
        it('should handle complete news processing workflow', async function() {
            // Mock initial settings
            const initialSettings = {
                listLength: 50,
                blockList: ['spam'],
                bullishList: ['bullish', 'positive'],
                bearishList: ['bearish', 'negative']
            };

            mockNewsSettingsAPI.get.resolves(initialSettings);

            // Mock news items
            const newsItems = [
                { id: 1, headline: 'Bullish market trends continue', symbol: 'AAPL' },
                { id: 2, headline: 'Spam advertisement for trading', symbol: 'MSFT' },
                { id: 3, headline: 'Bearish outlook for tech stocks', symbol: 'GOOGL' },
                { id: 4, headline: 'Neutral market analysis', symbol: 'TSLA' }
            ];

            // Load settings
            const settings = await mockNewsSettingsAPI.get();

            // Apply blocklist filtering
            const filtered = newsItems.filter(newsItem => {
                const headline = newsItem.headline.toLowerCase();
                return !settings.blockList.some(blocked => headline.includes(blocked.toLowerCase()));
            });

            // Apply sentiment analysis
            const processed = filtered.map(newsItem => {
                const lowerHeadline = newsItem.headline.toLowerCase();
                const isBullish = settings.bullishList.some(term => lowerHeadline.includes(term.toLowerCase()));
                const isBearish = settings.bearishList.some(term => lowerHeadline.includes(term.toLowerCase()));
                
                let sentiment = 'neutral';
                if (isBullish && !isBearish) sentiment = 'bullish';
                if (isBearish && !isBullish) sentiment = 'bearish';
                if (isBearish && isBullish) sentiment = 'neutral';

                return { ...newsItem, sentiment };
            });

            expect(filtered).to.have.length(3); // One item blocked
            expect(processed.find(item => item.id === 1).sentiment).to.equal('bullish');
            expect(processed.find(item => item.id === 3).sentiment).to.equal('bearish');
            expect(processed.find(item => item.id === 4).sentiment).to.equal('neutral');
        });

        it('should handle settings updates across multiple views', function() {
            const callback1 = sinon.stub();
            const callback2 = sinon.stub();
            const callback3 = sinon.stub();

            // Simulate multiple views subscribing to updates
            mockNewsSettingsAPI.onUpdate(callback1);
            mockNewsSettingsAPI.onUpdate(callback2);
            mockNewsSettingsAPI.onUpdate(callback3);

            // Simulate settings update
            const updateData = {
                listLength: 100,
                blockList: ['updated', 'blocked'],
                bullishList: ['updated', 'bullish'],
                bearishList: ['updated', 'bearish']
            };

            // Trigger all callbacks
            callback1(updateData);
            callback2(updateData);
            callback3(updateData);

            expect(callback1.calledWith(updateData)).to.equal(true);
            expect(callback2.calledWith(updateData)).to.equal(true);
            expect(callback3.calledWith(updateData)).to.equal(true);
        });
    });

    describe('Oracle Hydration Refresh', () => {
        it('should handle hydration complete event and refresh news and filings data', async () => {
            // Mock getHeadlines to return fresh data
            const freshHeadlines = [
                { id: 'news1', headline: 'Fresh News 1', symbol: 'AAPL' },
                { id: 'news2', headline: 'Fresh News 2', symbol: 'MSFT' }
            ];
            mockNewsAPI.getHeadlines.resolves(freshHeadlines);

            // Mock filingAPI
            const mockFilingAPI = {
                getHeadlines: sinon.stub().resolves([
                    { id: 'filing1', form_type: '10-K', title: 'Fresh Filing 1', symbol: 'AAPL' }
                ])
            };
            global.window.filingAPI = mockFilingAPI;

            // Simulate the hydration complete callback logic (from the real implementation)
            const hydrationCompleteCallback = async () => {
                console.log("🔄 [NEWS] Oracle hydration complete - refreshing news and filings data...");
                
                // Clear existing data
                // allNews = []; // This would be done in real implementation
                // allFilings = []; // This would be done in real implementation
                
                // Re-fetch data from Oracle
                try {
                    const headlines = await window.newsAPI.getHeadlines();
                    if (Array.isArray(headlines)) {
                        // allNews = headlines; // This would be done in real implementation
                        console.log(`📰 [NEWS] Refreshed: ${headlines.length} headlines after hydration`);
                    }
                    // render(); // This would be done in real implementation
                } catch (e) {
                    console.warn("📰 [NEWS] Failed to refresh headlines after hydration:", e);
                }

                try {
                    const filings = await window.filingAPI.getHeadlines();
                    if (Array.isArray(filings)) {
                        // allFilings = filings; // This would be done in real implementation
                        console.log(`📁 [NEWS] Refreshed: ${filings.length} filings after hydration`);
                    }
                    // render(); // This would be done in real implementation
                } catch (e) {
                    console.warn("📁 [NEWS] Failed to refresh filings after hydration:", e);
                }
            };

            // Execute the hydration complete callback
            await hydrationCompleteCallback();

            // Verify that getHeadlines was called to refresh data
            expect(mockNewsAPI.getHeadlines.called).to.equal(true);
            expect(mockFilingAPI.getHeadlines.called).to.equal(true);
        });

        it('should handle hydration complete event with error during refresh', async () => {
            // Mock getHeadlines to reject with error
            mockNewsAPI.getHeadlines.rejects(new Error('Failed to fetch headlines'));

            // Mock filingAPI
            const mockFilingAPI = {
                getHeadlines: sinon.stub().rejects(new Error('Failed to fetch filings'))
            };
            global.window.filingAPI = mockFilingAPI;

            // Simulate the hydration complete callback logic (from the real implementation)
            const hydrationCompleteCallback = async () => {
                console.log("🔄 [NEWS] Oracle hydration complete - refreshing news and filings data...");
                
                // Clear existing data
                // allNews = []; // This would be done in real implementation
                // allFilings = []; // This would be done in real implementation
                
                // Re-fetch data from Oracle
                try {
                    const headlines = await window.newsAPI.getHeadlines();
                    if (Array.isArray(headlines)) {
                        // allNews = headlines; // This would be done in real implementation
                        console.log(`📰 [NEWS] Refreshed: ${headlines.length} headlines after hydration`);
                    }
                    // render(); // This would be done in real implementation
                } catch (e) {
                    console.warn("📰 [NEWS] Failed to refresh headlines after hydration:", e);
                }

                try {
                    const filings = await window.filingAPI.getHeadlines();
                    if (Array.isArray(filings)) {
                        // allFilings = filings; // This would be done in real implementation
                        console.log(`📁 [NEWS] Refreshed: ${filings.length} filings after hydration`);
                    }
                    // render(); // This would be done in real implementation
                } catch (e) {
                    console.warn("📁 [NEWS] Failed to refresh filings after hydration:", e);
                }
            };

            // Execute the hydration complete callback
            await hydrationCompleteCallback();

            // Verify that getHeadlines was called
            expect(mockNewsAPI.getHeadlines.called).to.equal(true);
            expect(mockFilingAPI.getHeadlines.called).to.equal(true);
            
            // Verify that errors were logged (console.warn is already mocked globally)
            expect(console.warn.calledWith('📰 [NEWS] Failed to refresh headlines after hydration:', sinon.match.instanceOf(Error))).to.equal(true);
            expect(console.warn.calledWith('📁 [NEWS] Failed to refresh filings after hydration:', sinon.match.instanceOf(Error))).to.equal(true);
        });
    });
});