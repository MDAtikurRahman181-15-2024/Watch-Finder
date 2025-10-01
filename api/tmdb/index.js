const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');

// Main handler for the Azure Function.
module.exports = async function (context, req) {
    const TMDB_API_KEY = process.env.TMDB_API_KEY;

    if (!TMDB_API_KEY) {
        context.res = {
            status: 500,
            body: "Server configuration error: TMDB_API_KEY is not set."
        };
        return;
    }

    const endpoint = req.query.endpoint;
    const urlToScrape = req.query.url;

    try {
        if (endpoint) {
            const queryString = new URLSearchParams(req.query).toString().replace(`endpoint=${endpoint}&`, '');
            const apiUrl = `https://api.themoviedb.org/3/${endpoint}?${queryString}`;

            const apiResponse = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${TMDB_API_KEY}`,
                    'Accept': 'application/json'
                }
            });

            if (!apiResponse.ok) {
                throw new Error(`TMDB API request failed with status: ${apiResponse.status}`);
            }

            const data = await apiResponse.json();
            context.res = {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: data
            };

        } else if (urlToScrape) {
            const scrapedData = await scrapeTmdbWatchPage(urlToScrape, context);
            context.res = {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: scrapedData
            };
        } else {
            context.res = {
                status: 400,
                body: "Bad Request: Please provide either an 'endpoint' or a 'url' query parameter."
            };
        }
    } catch (error) {
        context.log.error(error);
        context.res = {
            status: 500,
            body: `An error occurred: ${error.message}`
        };
    }
};

/**
 * Scrapes a TMDB watch page using a CORS proxy.
 * @param {string} url - The TMDB URL to scrape.
 * @param {object} context - The Azure Function context for logging.
 * @returns {Promise<object>} An object containing the JustWatch URL and provider quality info.
 */
async function scrapeTmdbWatchPage(url, context) {
    // --- Uses CORS proxy to fetch the URL ---
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;

    try {
        const response = await fetch(proxyUrl);
        if (!response.ok) {
            throw new Error(`Fetch failed with status: ${response.status}`);
        }
        
        const htmlContent = await response.text();
        const dom = new JSDOM(htmlContent);
        const doc = dom.window.document;

        const justWatchLinkElement = doc.querySelector('.ott_title + p a[href*="justwatch.com"]');
        const justWatchUrl = justWatchLinkElement ? justWatchLinkElement.href : null;

        const providersInfo = {};
        const providerSections = doc.querySelectorAll('.ott_provider');

        providerSections.forEach(section => {
            const typeElement = section.querySelector('h3');
            if (!typeElement) return;
            const type = typeElement.textContent.trim().toLowerCase();

            if (type !== 'stream') return;

            const offerElements = section.querySelectorAll('ul.providers > li');
            offerElements.forEach(li => {
                const link = li.querySelector('a');
                if (!link || !link.title) return;

                const match = link.title.match(/on (.*)$/);
                if (!match || !match[1]) return;
                const providerName = match[1];

                if (!providersInfo[providerName]) {
                    providersInfo[providerName] = { stream: new Set() };
                }
                
                if (li.classList.contains('ott_filter_4k')) providersInfo[providerName].stream.add('4K');
                if (li.classList.contains('ott_filter_hd')) providersInfo[providerName].stream.add('HD');
                if (li.classList.contains('ott_filter_sd')) providersInfo[providerName].stream.add('SD');
            });
        });

        for (const provider in providersInfo) {
            providersInfo[provider].stream = Array.from(providersInfo[provider].stream);
        }

        return { justWatchUrl, providersInfo };

    } catch (error) {
        context.log.error(`Scraping failed for URL ${url}: ${error.message}`);
        return { justWatchUrl: null, providersInfo: {} }; 
    }
}

