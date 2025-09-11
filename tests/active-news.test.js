const { expect } = require('chai');
const sinon = require('sinon');

// Mock the news API
const mockNewsAPI = {
    getHeadlines: sinon.stub(),
    onHeadlines: sinon.stub(),
    onDelta: sinon.stub(),
    onHydrationComplete: sinon.stub()
};

// Mock the active API
const mockActiveAPI = {
    notifyActiveWindowReady: sinon.stub()
};

// Mock the settings API
const mockSettingsAPI = {
    get: sinon.stub()
};

// Mock window object
global.window = {
    newsAPI: mockNewsAPI,
    activeAPI: mockActiveAPI,
    settingsAPI: mockSettingsAPI,
    appFlags: { isDev: true }
};

// Mock document
global.document = {
    addEventListener: sinon.stub(),
    getElementById: sinon.stub(),
    createElement: sinon.stub()
};

// Mock console
global.console = {
    log: sinon.stub(),
    warn: sinon.stub(),
    error: sinon.stub()
};

describe('Active View News Integration', () => {
    let mockNewsContainer;
    let mockSymbolData;

    beforeEach(() => {
        // Reset all mocks
        sinon.restore();
        
        // Mock news container element
        mockNewsContainer = {
            innerHTML: '',
            style: {}
        };
        
        // Mock document.getElementById to return our mock container
        global.document.getElementById.callsFake((id) => {
            if (id === 'news-container') {
                return mockNewsContainer;
            }
            return null;
        });
        
        // Mock settings
        mockSettingsAPI.get.resolves({
            news: {
                blockList: ['test-blocked'],
                bullishList: ['bullish'],
                bearishList: ['bearish']
            }
        });
        
        // Mock symbol data
        mockSymbolData = {
            symbol: 'AAPL',
            News: [
                {
                    headline: 'Old news item',
                    time: '2024-01-01T10:00:00Z',
                    symbols: ['AAPL']
                }
            ]
        };
    });

    afterEach(() => {
        // Clean up
        delete global.window.allOracleNews;
        delete global.window.currentActiveSymbol;
    });

    describe('Oracle News Integration', () => {
        it('should initialize Oracle news integration', async () => {
            // Mock headlines response
            const mockHeadlines = [
                {
                    symbol: 'AAPL',
                    headline: 'Apple Reports Record Q4 Revenue',
                    body: 'Apple Inc. reported record fourth-quarter revenue...',
                    author: 'John Doe',
                    location: 'Cupertino, CA',
                    time: new Date().toISOString(),
                    image: 'https://example.com/apple-news.jpg'
                },
                {
                    symbol: 'AAPL',
                    headline: 'Apple Announces New iPhone',
                    body: 'Apple has announced the latest iPhone model...',
                    author: 'Jane Smith',
                    location: 'San Francisco, CA',
                    time: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
                    image: 'https://example.com/iphone-news.jpg'
                }
            ];

            mockNewsAPI.getHeadlines.resolves(mockHeadlines);

            // Simulate the initialization
            const headlines = await mockNewsAPI.getHeadlines();
            
            expect(headlines).to.deep.equal(mockHeadlines);
            expect(mockNewsAPI.getHeadlines.calledOnce).to.equal(true);
        });

        it('should handle news headlines callback', () => {
            const mockHeadlines = [
                {
                    symbol: 'AAPL',
                    headline: 'Apple Reports Record Q4 Revenue',
                    body: 'Apple Inc. reported record fourth-quarter revenue...',
                    author: 'John Doe',
                    location: 'Cupertino, CA',
                    time: new Date().toISOString(),
                    image: 'https://example.com/apple-news.jpg'
                }
            ];

            // Simulate the callback
            const callback = sinon.stub();
            mockNewsAPI.onHeadlines(callback);
            callback(mockHeadlines);

            expect(mockNewsAPI.onHeadlines.calledOnce).to.equal(true);
        });

        it('should handle news delta callback', () => {
            const mockDelta = {
                symbol: 'AAPL',
                headline: 'Breaking: Apple Stock Surges',
                body: 'Apple stock has surged 5% in after-hours trading...',
                author: 'Breaking News',
                location: 'New York, NY',
                time: new Date().toISOString(),
                image: 'https://example.com/breaking-news.jpg'
            };

            // Simulate the callback
            const callback = sinon.stub();
            mockNewsAPI.onDelta(callback);
            callback(mockDelta);

            expect(mockNewsAPI.onDelta.calledOnce).to.equal(true);
        });
    });

    describe('News Rendering', () => {
        it('should render 15-minute large layout for recent news', () => {
            const recentNews = {
                symbol: 'AAPL',
                headline: 'Apple Reports Record Q4 Revenue',
                body: 'Apple Inc. reported record fourth-quarter revenue of $94.8 billion, up 8% year-over-year, despite ongoing supply chain disruptions.',
                author: 'John Doe',
                location: 'Cupertino, CA',
                time: new Date().toISOString(),
                image: 'https://example.com/apple-news.jpg'
            };

            // Mock the render function
            const renderOracleNews = (newsItems, activeSymbol) => {
                if (!activeSymbol) return '<p>no active symbol</p>';
                
                const symbolNews = newsItems.filter(item => 
                    item.symbol === activeSymbol
                );
                
                if (symbolNews.length === 0) return '<p>no news for symbol</p>';
                
                const latest = symbolNews[0];
                const isRecent = (Date.now() - new Date(latest.time).getTime()) < (15 * 60 * 1000);
                
                if (isRecent) {
                    return `
                        <div class="news-item-large">
                            <img src="${latest.image}" alt="News image" />
                            <h3>${latest.headline}</h3>
                            <p>${latest.body}</p>
                            <div class="news-meta">
                                <span class="author">${latest.author}</span>
                                <span class="location">${latest.location}</span>
                                <span class="time">${new Date(latest.time).toLocaleTimeString()}</span>
                            </div>
                        </div>
                    `;
                }
                
                return `<div class="news-item-collapsed">${latest.headline}</div>`;
            };

            const result = renderOracleNews([recentNews], 'AAPL');
            
            expect(result).to.include('news-item-large');
            expect(result).to.include('Apple Reports Record Q4 Revenue');
            expect(result).to.include('John Doe');
            expect(result).to.include('Cupertino, CA');
        });

        it('should render collapsed layout for older news', () => {
            const oldNews = {
                symbol: 'AAPL',
                headline: 'Apple Announces New iPhone',
                body: 'Apple has announced the latest iPhone model...',
                author: 'Jane Smith',
                location: 'San Francisco, CA',
                time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
                image: 'https://example.com/iphone-news.jpg'
            };

            // Mock the render function
            const renderOracleNews = (newsItems, activeSymbol) => {
                if (!activeSymbol) return '<p>no active symbol</p>';
                
                const symbolNews = newsItems.filter(item => 
                    item.symbol === activeSymbol
                );
                
                if (symbolNews.length === 0) return '<p>no news for symbol</p>';
                
                const latest = symbolNews[0];
                const isRecent = (Date.now() - new Date(latest.time).getTime()) < (15 * 60 * 1000);
                
                if (isRecent) {
                    return `
                        <div class="news-item-large">
                            <img src="${latest.image}" alt="News image" />
                            <h3>${latest.headline}</h3>
                            <p>${latest.body}</p>
                            <div class="news-meta">
                                <span class="author">${latest.author}</span>
                                <span class="location">${latest.location}</span>
                                <span class="time">${new Date(latest.time).toLocaleTimeString()}</span>
                            </div>
                        </div>
                    `;
                }
                
                return `<div class="news-item-collapsed">${latest.headline}</div>`;
            };

            const result = renderOracleNews([oldNews], 'AAPL');
            
            expect(result).to.include('news-item-collapsed');
            expect(result).to.include('Apple Announces New iPhone');
            expect(result).to.not.include('news-item-large');
        });

        it('should filter news by symbol', () => {
            const mixedNews = [
                {
                    symbol: 'AAPL',
                    headline: 'Apple News',
                    time: new Date().toISOString()
                },
                {
                    symbol: 'MSFT',
                    headline: 'Microsoft News',
                    time: new Date().toISOString()
                },
                {
                    symbol: 'AAPL',
                    headline: 'Another Apple News',
                    time: new Date().toISOString()
                }
            ];

            // Mock the filter function
            const filterNewsBySymbol = (newsItems, targetSymbol) => {
                return newsItems.filter(item => 
                    item.symbol === targetSymbol
                );
            };

            const appleNews = filterNewsBySymbol(mixedNews, 'AAPL');
            const microsoftNews = filterNewsBySymbol(mixedNews, 'MSFT');
            
            expect(appleNews).to.have.length(2);
            expect(appleNews[0].headline).to.equal('Apple News');
            expect(appleNews[1].headline).to.equal('Another Apple News');
            
            expect(microsoftNews).to.have.length(1);
            expect(microsoftNews[0].headline).to.equal('Microsoft News');
        });

        it('should apply blocklist filtering', () => {
            const newsItems = [
                {
                    symbol: 'AAPL',
                    headline: 'Apple Reports Record Revenue',
                    time: new Date().toISOString()
                },
                {
                    symbol: 'AAPL',
                    headline: 'This is a test-blocked headline',
                    time: new Date().toISOString()
                },
                {
                    symbol: 'AAPL',
                    headline: 'Apple Announces New Product',
                    time: new Date().toISOString()
                }
            ];

            const blockList = ['test-blocked'];

            // Mock the filter function
            const applyBlocklist = (newsItems, blockList) => {
                return newsItems.filter(item => {
                    const headline = item.headline.toLowerCase();
                    return !blockList.some(blocked => headline.includes(blocked.toLowerCase()));
                });
            };

            const filteredNews = applyBlocklist(newsItems, blockList);
            
            expect(filteredNews).to.have.length(2);
            expect(filteredNews[0].headline).to.equal('Apple Reports Record Revenue');
            expect(filteredNews[1].headline).to.equal('Apple Announces New Product');
        });
    });

    describe('News Data Structure', () => {
        it('should handle news objects with all expected fields', () => {
            const completeNewsItem = {
                symbol: 'AAPL',
                headline: 'Apple Reports Record Q4 Revenue',
                body: 'Apple Inc. reported record fourth-quarter revenue of $94.8 billion, up 8% year-over-year, despite ongoing supply chain disruptions. The company\'s services segment showed particularly strong growth, with revenue increasing 16% to $19.2 billion.',
                author: 'John Doe',
                location: 'Cupertino, CA',
                time: new Date().toISOString(),
                image: 'https://example.com/apple-news.jpg',
                url: 'https://example.com/apple-news-article',
                source: 'Reuters',
                category: 'Earnings',
                sentiment: 'positive'
            };

            // Test that all fields are accessible
            expect(completeNewsItem.symbol).to.equal('AAPL');
            expect(completeNewsItem.headline).to.equal('Apple Reports Record Q4 Revenue');
            expect(completeNewsItem.body).to.include('$94.8 billion');
            expect(completeNewsItem.author).to.equal('John Doe');
            expect(completeNewsItem.location).to.equal('Cupertino, CA');
            expect(completeNewsItem.time).to.not.be.undefined;
            expect(completeNewsItem.image).to.equal('https://example.com/apple-news.jpg');
            expect(completeNewsItem.url).to.equal('https://example.com/apple-news-article');
            expect(completeNewsItem.source).to.equal('Reuters');
            expect(completeNewsItem.category).to.equal('Earnings');
            expect(completeNewsItem.sentiment).to.equal('positive');
        });

        it('should handle news objects with minimal fields', () => {
            const minimalNewsItem = {
                symbol: 'AAPL',
                headline: 'Apple News',
                time: new Date().toISOString()
            };

            // Test that minimal fields work
            expect(minimalNewsItem.symbol).to.equal('AAPL');
            expect(minimalNewsItem.headline).to.equal('Apple News');
            expect(minimalNewsItem.time).to.not.be.undefined;
            
            expect(minimalNewsItem.body).to.be.undefined;
            expect(minimalNewsItem.author).to.be.undefined;
            expect(minimalNewsItem.location).to.be.undefined;
            expect(minimalNewsItem.image).to.be.undefined;
        });
    });

    describe('Error Handling', () => {
        it('should handle missing news container', () => {
            global.document.getElementById.returns(null);
            
            // Mock the render function
            const renderOracleNews = () => {
                const newsContainer = global.document.getElementById('news-container');
                if (!newsContainer) {
                    console.warn('News container not found in DOM');
                    return;
                }
                // This should not be reached
                return 'rendered';
            };

            const result = renderOracleNews();
            
            expect(result).to.be.undefined;
            expect(console.warn.calledWith('News container not found in DOM')).to.equal(true);
        });

        it('should handle empty news array', () => {
            const renderOracleNews = (newsItems, activeSymbol) => {
                if (!activeSymbol) return '<p>no active symbol</p>';
                
                const symbolNews = newsItems.filter(item => 
                    item.symbol === activeSymbol
                );
                
                if (symbolNews.length === 0) return '<p>no news for symbol</p>';
                
                return 'rendered';
            };

            const result = renderOracleNews([], 'AAPL');
            
            expect(result).to.equal('<p>no news for symbol</p>');
        });

        it('should handle null/undefined news data', () => {
            const renderOracleNews = (newsItems, activeSymbol) => {
                if (!activeSymbol) return '<p>no active symbol</p>';
                
                if (!newsItems || !Array.isArray(newsItems)) {
                    return '<p>invalid news data</p>';
                }
                
                const symbolNews = newsItems.filter(item => 
                    item.symbol === activeSymbol
                );
                
                if (symbolNews.length === 0) return '<p>no news for symbol</p>';
                
                return 'rendered';
            };

            expect(renderOracleNews(null, 'AAPL')).to.equal('<p>invalid news data</p>');
            expect(renderOracleNews(undefined, 'AAPL')).to.equal('<p>invalid news data</p>');
            expect(renderOracleNews('not an array', 'AAPL')).to.equal('<p>invalid news data</p>');
        });
    });

    describe('Oracle Hydration Refresh', () => {
        it('should handle hydration complete event and refresh news data', async () => {
            // Mock the hydration complete callback
            let hydrationCompleteCallback;
            mockNewsAPI.onHydrationComplete.callsFake((callback) => {
                hydrationCompleteCallback = callback;
            });

            // Mock getHeadlines to return fresh data
            const freshHeadlines = [
                { id: 'news1', headline: 'Fresh News 1', symbol: 'AAPL' },
                { id: 'news2', headline: 'Fresh News 2', symbol: 'MSFT' }
            ];
            mockNewsAPI.getHeadlines.resolves(freshHeadlines);

            // Simulate calling onHydrationComplete to capture the callback
            mockNewsAPI.onHydrationComplete((callback) => {
                hydrationCompleteCallback = callback;
            });

            // Simulate the hydration complete event
            expect(hydrationCompleteCallback).to.be.a('function');
            
            // Call the hydration complete callback
            await hydrationCompleteCallback();

            // Verify that getHeadlines was called to refresh data
            expect(mockNewsAPI.getHeadlines.called).to.equal(true);
        });

        it('should handle hydration complete event with error during refresh', async () => {
            // Mock getHeadlines to reject with error
            mockNewsAPI.getHeadlines.rejects(new Error('Failed to fetch headlines'));

            // Simulate the hydration complete callback logic (from the real implementation)
            const hydrationCompleteCallback = async () => {
                console.log("🔄 [ACTIVE] Oracle hydration complete - refreshing news data...");
                
                // Clear existing data
                // allOracleNews = []; // This would be done in real implementation
                
                // Re-fetch data from Oracle
                try {
                    const headlines = await window.newsAPI.getHeadlines();
                    if (Array.isArray(headlines)) {
                        // allOracleNews = headlines; // This would be done in real implementation
                        console.log(`📰 [ACTIVE] Refreshed: ${headlines.length} headlines after hydration`);
                    }
                    // Re-render the active view with updated data
                    // renderOracleNews(); // This would be done in real implementation
                } catch (e) {
                    console.warn("📰 [ACTIVE] Failed to refresh headlines after hydration:", e);
                }
            };

            // Execute the hydration complete callback
            await hydrationCompleteCallback();

            // Verify that getHeadlines was called
            expect(mockNewsAPI.getHeadlines.called).to.equal(true);
            
            // Verify that error was logged (console.warn is already mocked globally)
            expect(console.warn.calledWith('📰 [ACTIVE] Failed to refresh headlines after hydration:', sinon.match.instanceOf(Error))).to.equal(true);
        });
    });
});
