const form = document.getElementById('search-form');
const input = document.getElementById('search-input');
const resultsContainer = document.getElementById('results');
const loader = document.getElementById('loader');
const searchButton = document.getElementById('search-button');
const autocompleteContainer = document.getElementById('autocomplete');

// A list of countries that have a dedicated JustWatch page, used to determine if we can show links.
const JUSTWATCH_SUPPORTED_COUNTRIES = [
    'AR', 'AU', 'AT', 'BE', 'BR', 'CA', 'CL', 'CO', 'CZ', 'DK', 'EC', 'EE', 'FI', 'FR', 'DE', 'GR', 'GT', 'HK', 'HU', 'IS', 'IN', 'ID', 'IE', 'IL', 'IT', 'JP', 'LV', 'LT', 'MY', 'MX', 'NL', 'NZ', 'NO', 'PA', 'PE', 'PH', 'PL', 'PT', 'RO', 'RU', 'SA', 'SG', 'SK', 'ZA', 'KR', 'ES', 'SE', 'CH', 'TW', 'TH', 'TR', 'UA', 'AE', 'GB', 'US'
];

let debounceTimer;
let selectedContent = null;

/**
 * Calls our secure Azure Function to scrape the TMDB watch page.
 * This function gets the JustWatch link and the streaming quality info.
 * @param {string} tmdbWatchUrl - The URL of the TMDB page to scrape.
 * @returns {Promise<object>} An object with the justWatchUrl and providersInfo.
 */
async function scrapeTmdbWatchPage(tmdbWatchUrl) {
    // The endpoint name 'tmdb' matches the folder name in /api/tmdb/
    const functionUrl = `/api/tmdb?url=${encodeURIComponent(tmdbWatchUrl)}`;
    try {
        const response = await fetch(functionUrl);
        if (!response.ok) return { justWatchUrl: null, providersInfo: {} };
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error scraping TMDB watch page:', error);
        return { justWatchUrl: null, providersInfo: {} };
    }
}

/**
 * A helper function to call our secure Azure Function for TMDB API requests.
 * @param {string} endpoint - The TMDB API endpoint path (e.g., 'search/multi').
 * @param {object} params - An object of query parameters.
 * @returns {Promise<object>} The JSON response from the API.
 */
async function callApi(endpoint, params) {
    const queryString = new URLSearchParams(params).toString();
    // The endpoint name 'tmdb' matches the folder name in /api/tmdb/
    const response = await fetch(`/api/tmdb?endpoint=${endpoint}&${queryString}`);
    if (!response.ok) {
        throw new Error(`API call failed for endpoint: ${endpoint}`);
    }
    return response.json();
}

// --- Event Listeners ---

// Listen for input in the search bar to show autocomplete suggestions.
input.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(debounceTimer);
    if (query.length < 2) {
        autocompleteContainer.style.display = 'none';
        return;
    }
    // Debounce to avoid sending too many requests while typing.
    debounceTimer = setTimeout(() => fetchAutocomplete(query), 300);
});

// Close autocomplete when clicking outside the search form.
document.addEventListener('click', (e) => {
    if (!form.contains(e.target)) {
        autocompleteContainer.style.display = 'none';
    }
    // Also close any open country dropdowns.
    const openDropdown = document.querySelector('.country-dropdown.show');
    if (openDropdown && !openDropdown.parentElement.contains(e.target)) {
        openDropdown.classList.remove('show');
        openDropdown.parentElement.classList.remove('z-boost');
    }
});

// Handle the main form submission.
form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;

    autocompleteContainer.style.display = 'none';
    resultsContainer.innerHTML = '';
    loader.style.display = 'block';
    searchButton.disabled = true;

    try {
        if (selectedContent) {
            // If a user clicked an autocomplete suggestion, use that specific content.
            await fetchContentDetails(selectedContent);
            selectedContent = null; // Reset for the next search.
        } else {
            // Otherwise, perform a general search.
            await searchContent(query);
        }
    } catch (error) {
        resultsContainer.innerHTML = `<p class="error-message">${error.message}</p>`;
    } finally {
        loader.style.display = 'none';
        searchButton.disabled = false;
    }
});


// --- Core Functions ---

/**
 * Fetches autocomplete suggestions from the TMDB API.
 * @param {string} query - The search term.
 */
async function fetchAutocomplete(query) {
    try {
        const data = await callApi('search/multi', { query, include_adult: false, language: 'en-US', page: 1 });
        displayAutocomplete(data.results.slice(0, 8)); // Show top 8 results.
    } catch (error) {
        console.error('Autocomplete error:', error);
    }
}

/**
 * Displays the autocomplete suggestions in a dropdown.
 * @param {Array} results - An array of movie/TV show objects.
 */
function displayAutocomplete(results) {
    if (!results || results.length === 0) {
        autocompleteContainer.style.display = 'none';
        return;
    }
    autocompleteContainer.innerHTML = '';
    results.forEach(item => {
        if (item.media_type !== 'movie' && item.media_type !== 'tv') return;

        const title = item.title || item.name;
        const year = item.release_date || item.first_air_date;
        const yearStr = year ? new Date(year).getFullYear() : 'N/A';
        const mediaType = item.media_type === 'movie' ? 'Movie' : 'TV Show';
        const posterPath = item.poster_path
            ? `https://image.tmdb.org/t/p/w92${item.poster_path}`
            : 'https://placehold.co/40x60/333/FFF?text=?'; // Placeholder image

        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        div.innerHTML = `
            <img src="${posterPath}" alt="${title}" class="autocomplete-poster">
            <div class="autocomplete-info">
                <div class="autocomplete-title">${title}</div>
                <div class="autocomplete-meta">${yearStr} • ${mediaType}</div>
            </div>
        `;
        // When an item is clicked, fill the input and trigger a form submit.
        div.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectedContent = item;
            input.value = title;
            autocompleteContainer.style.display = 'none';
            searchButton.click(); // Programmatically click the search button.
        });
        autocompleteContainer.appendChild(div);
    });
    autocompleteContainer.style.display = 'block';
}

/**
 * Performs a general search and gets details for the top result.
 * @param {string} query - The search term.
 */
async function searchContent(query) {
    const searchData = await callApi('search/multi', { query, include_adult: false, language: 'en-US', page: 1 });
    if (!searchData.results || searchData.results.length === 0) {
        resultsContainer.innerHTML = `<p class="error-message">Could not find any results for "${query}".</p>`;
        return;
    }
    await fetchContentDetails(searchData.results[0]);
}

/**
 * Fetches the detailed streaming provider information for a specific movie or show.
 * @param {object} content - The content object from the TMDB API.
 */
async function fetchContentDetails(content) {
    const mediaType = content.media_type === 'movie' ? 'movie' : 'tv';
    const contentId = content.id;
    const titleName = content.title || content.name;
    const releaseDate = content.release_date || content.first_air_date;
    const year = releaseDate ? new Date(releaseDate).getFullYear() : 'N/A';

    const providersData = await callApi(`${mediaType}/${contentId}/watch/providers`, {});
    displayResults(titleName, year, mediaType, providersData.results, contentId);
}

/**
 * Displays the final results on the page, grouping providers and their countries.
 */
function displayResults(titleName, year, mediaType, allProviders, tmdbId) {
    // Display title info
    resultsContainer.innerHTML = `
        <div class="title-info">
            <div class="title-name">${titleName} (${year})</div>
            <div class="title-meta">${mediaType === 'movie' ? 'Movie' : 'TV Show'}</div>
        </div>
    `;

    if (!allProviders || Object.keys(allProviders).length === 0) {
        resultsContainer.innerHTML += `<p class="error-message">This title is not available on streaming services in any country.</p>`;
        return;
    }
    
    // Group countries by provider
    const providerMap = {};
    Object.keys(allProviders).forEach(countryCode => {
        // We only care about 'flatrate' which means subscription streaming
        if (allProviders[countryCode].flatrate) {
            allProviders[countryCode].flatrate.forEach(provider => {
                if (!providerMap[provider.provider_id]) {
                    providerMap[provider.provider_id] = { name: provider.provider_name, logo: provider.logo_path, countries: new Set() };
                }
                providerMap[provider.provider_id].countries.add(countryCode);
            });
        }
    });

    if (Object.keys(providerMap).length === 0) {
        resultsContainer.innerHTML += `<p class="error-message">This title is not available on any subscription streaming service.</p>`;
        return;
    }

    // Sort providers by who has it in the most countries
    const sortedProviders = Object.values(providerMap).sort((a, b) => b.countries.size - a.countries.size);

    sortedProviders.forEach(provider => {
        const providerElement = document.createElement('div');
        providerElement.className = 'provider-item';
        const countriesListContainer = document.createElement('div');
        countriesListContainer.className = 'countries-list';

        const sortedCountries = Array.from(provider.countries).sort((a, b) => getCountryName(a).localeCompare(getCountryName(b)));

        sortedCountries.forEach(code => {
            const countryName = getCountryName(code);
            const isSupported = JUSTWATCH_SUPPORTED_COUNTRIES.includes(code);
            
            const tag = document.createElement('div');
            tag.className = `country-tag ${isSupported ? 'clickable' : 'non-clickable'}`;
            tag.textContent = countryName;
            tag.title = isSupported ? `Click for links in ${countryName}` : `No watch links available for ${countryName}`;

            if (isSupported) {
                const dropdown = createDropdown(mediaType, tmdbId, code);
                tag.appendChild(dropdown);
                addDropdownListener(tag, dropdown, mediaType, tmdbId, code);
            }
            countriesListContainer.appendChild(tag);
        });

        providerElement.innerHTML = `
            <div class="provider-header">
                <img src="https://image.tmdb.org/t/p/original${provider.logo}" alt="${provider.name} logo" class="provider-logo" onerror="this.style.display='none'">
                <div class="provider-name">${provider.name}</div>
            </div>
            <div class="countries-label">Available in ${provider.countries.size} ${provider.countries.size === 1 ? 'country' : 'countries'} (highlighted countries have watch links):</div>
        `;
        providerElement.appendChild(countriesListContainer);
        resultsContainer.appendChild(providerElement);
    });
}

/**
 * Creates the initial HTML for a country dropdown.
 */
function createDropdown(mediaType, tmdbId, code) {
    const dropdown = document.createElement('div');
    dropdown.className = 'country-dropdown';
    const tmdbLinkUrl = `https://www.themoviedb.org/${mediaType}/${tmdbId}/watch?locale=${code}`;

    dropdown.innerHTML = `
        <a href="${tmdbLinkUrl}" target="_blank" rel="noopener noreferrer" class="dropdown-link">
            <img src="https://www.themoviedb.org/favicon.ico" class="dropdown-icon" alt="TMDB">
            <span>View on TMDB</span>
        </a>
        <a href="#" class="dropdown-link justwatch-link" data-status="loading">
            <img src="https://www.justwatch.com/favicon.ico" class="dropdown-icon" alt="JustWatch">
            <span>Loading JustWatch...</span>
        </a>
        <div class="quality-info-container" data-status="loading">
            <div class="dropdown-separator"></div>
            <p class="quality-loading">Loading quality info...</p>
        </div>
    `;
    return dropdown;
}

/**
 * Adds the click listener to a country tag to handle dropdown logic.
 */
function addDropdownListener(tag, dropdown, mediaType, tmdbId, code) {
    tag.addEventListener('click', async (e) => {
        e.stopPropagation();
        const wasOpen = dropdown.classList.contains('show');

        document.querySelectorAll('.country-dropdown.show').forEach(d => {
            d.classList.remove('show');
            d.parentElement.classList.remove('z-boost');
        });

        if (!wasOpen) {
            dropdown.classList.add('show');
            tag.classList.add('z-boost');

            const jwLinkElement = dropdown.querySelector('.justwatch-link');
            if (jwLinkElement.dataset.status === 'loading') {
                const tmdbLinkUrl = `https://www.themoviedb.org/${mediaType}/${tmdbId}/watch?locale=${code}`;
                const { justWatchUrl, providersInfo } = await scrapeTmdbWatchPage(tmdbLinkUrl);

                updateDropdownContent(dropdown, justWatchUrl, providersInfo);
            }
        }
    });
}

/**
 * Updates the dropdown with the scraped JustWatch link and quality info.
 */
function updateDropdownContent(dropdown, justWatchUrl, providersInfo) {
    const jwLinkElement = dropdown.querySelector('.justwatch-link');
    const qualityContainer = dropdown.querySelector('.quality-info-container');

    // Update JustWatch link
    if (justWatchUrl) {
        jwLinkElement.href = justWatchUrl;
        jwLinkElement.target = '_blank';
        jwLinkElement.rel = 'noopener noreferrer';
        jwLinkElement.querySelector('span').textContent = 'View on JustWatch';
    } else {
        jwLinkElement.href = '#';
        jwLinkElement.style.pointerEvents = 'none';
        jwLinkElement.querySelector('span').textContent = 'JustWatch link not found';
    }
    jwLinkElement.dataset.status = 'loaded';

    // Update Quality Info
    qualityContainer.innerHTML = '';
    const hasQualityInfo = providersInfo && Object.keys(providersInfo).length > 0;
    
    if (hasQualityInfo) {
        qualityContainer.innerHTML += '<div class="dropdown-separator"></div>';
        const sortedProviderNames = Object.keys(providersInfo).sort();
        
        for (const providerName of sortedProviderNames) {
            const info = providersInfo[providerName];
            
            if (info.stream && info.stream.length > 0) {
                const qualityTags = info.stream.map(q => `<span class="quality-tag q-${q.toLowerCase()}">${q}</span>`).join('');
                const qualityHtml = `
                    <div class="quality-item">
                        <span class="quality-provider">${providerName}</span>
                        <span class="quality-tags">${qualityTags}</span>
                    </div>
                `;
                qualityContainer.innerHTML += qualityHtml;
            }
        }
    } else {
        qualityContainer.innerHTML = '<div class="dropdown-separator"></div><p class="quality-none">No streaming quality info.</p>';
    }
    qualityContainer.dataset.status = 'loaded';
}

/**
 * Helper function to get the full country name from a country code.
 * @param {string} code - The two-letter country code (e.g., 'US').
 * @returns {string} The full country name (e.g., 'United States').
 */
function getCountryName(code) {
    try {
        const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
        return regionNames.of(code.toUpperCase());
    } catch (e) {
        // Fallback for uncommon codes
        return code.toUpperCase();
    }
}

