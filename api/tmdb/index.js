const fetch = require('node-fetch');
const { JSDOM } = require('jsdom');

// Main handler for the Azure Function. This function runs on the server, not in the browser.
module.exports = async function (context, req) {
    // Retrieve the secret TMDB API key from the Azure application settings (environment variables).
    const TMDB_API_KEY = process.env.TMDB_API_KEY;

    // Security check: If the API key is not configured on the server, return an error.
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
            // --- This block handles a direct TMDB API request from our client-side script. ---
            const queryString = new URLSearchParams(req.query).toString().replace(`endpoint=${endpoint}&`, '');
            const apiUrl = `https://api.themoviedb.org/3/${endpoint}?${queryString}`;

            const apiResponse = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${TMDB_API_KEY}`, // Securely add the API key here.
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
                body: data // Send the data back to the browser.
            };

        } else if (urlToScrape) {
            // --- This block handles a request to scrape a TMDB watch page. ---
            const scrapedData = await scrapeTmdbWatchPage(urlToScrape, context);
            context.res = {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: scrapedData // Send the scraped data back to the browser.
            };
        } else {
            // If the request is invalid, send a Bad Request error.
            context.res = {
                status: 400,
                body: "Bad Request: Please provide either an 'endpoint' or a 'url' query parameter."
            };
        }
    } catch (error) {
        context.log.error(error); // Log the error in Azure for debugging.
        context.res = {
            status: 500,
            body: `An error occurred: ${error.message}`
        };
    }
};

/**
 * Scrapes a TMDB watch page to find the JustWatch link and streaming quality info.
 * This function uses JSDOM to parse the HTML string into a DOM we can query.
 * @param {string} url - The TMDB URL to scrape.
 * @param {object} context - The Azure Function context for logging.
 * @returns {Promise<object>} An object containing the JustWatch URL and provider quality info.
 */
async function scrapeTmdbWatchPage(url, context) {
    try {
        // --- CORRECTED: Fetching the URL directly, without the proxy ---
        const response = await fetch(url);
        if (!response.ok) {
             throw new Error(`Fetch failed with status: ${response.status}`);
        }
        
        const htmlContent = await response.text();
        const dom = new JSDOM(htmlContent);
        const doc = dom.window.document;

        // 1. Get the main JustWatch URL from the page's summary paragraph.
        const justWatchLinkElement = doc.querySelector('.ott_title + p a[href*="justwatch.com"]');
        const justWatchUrl = justWatchLinkElement ? justWatchLinkElement.href : null;

        // 2. Get Streaming Providers Quality Info
        const providersInfo = {};
        const providerSections = doc.querySelectorAll('.ott_provider');

        providerSections.forEach(section => {
            const typeElement = section.querySelector('h3');
            if (!typeElement) return;
            const type = typeElement.textContent.trim().toLowerCase();

            // We only care about the "Stream" section, ignoring "Rent" and "Buy".
            if (type !== 'stream') return;

            const offerElements = section.querySelectorAll('ul.providers > li');
            offerElements.forEach(li => {
                const link = li.querySelector('a');
                if (!link || !link.title) return;

                // Extract the provider name from the link's title attribute (e.g., "Watch Movie on Netflix").
                const match = link.title.match(/on (.*)$/);
                if (!match || !match[1]) return;
                const providerName = match[1];

                if (!providersInfo[providerName]) {
                    providersInfo[providerName] = { stream: new Set() };
                }
                
                // Check the list item's classes to determine the available quality.
                if (li.classList.contains('ott_filter_4k')) providersInfo[providerName].stream.add('4K');
                if (li.classList.contains('ott_filter_hd')) providersInfo[providerName].stream.add('HD');
                if (li.classList.contains('ott_filter_sd')) providersInfo[providerName].stream.add('SD');
            });
        });

        // Convert the Sets of qualities into Arrays so they can be sent as JSON.
        for (const provider in providersInfo) {
            providersInfo[provider].stream = Array.from(providersInfo[provider].stream);
        }

        return { justWatchUrl, providersInfo };
    } catch (error) {
        context.log.error(`Scraping failed for URL ${url}: ${error.message}`);
        return { justWatchUrl: null, providersInfo: {} }; // Return empty data on failure.
    }
}

