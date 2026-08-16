const TMDB_API_KEY = 'b4ba32fa646c73c4d65e7655af34b8be';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w92';
const POSTER_CACHE_KEY = 'tmdb_poster_cache';
const POSTER_CACHE_VERSION = 2; // bump this to bust stale cache

class MovieTracker {
    constructor() {
        this.movies = JSON.parse(localStorage.getItem('movies')) || [];
        // Bust old cache if version doesn't match
        const cacheVersion = parseInt(localStorage.getItem('tmdb_poster_cache_version') || '1');
        if (cacheVersion < POSTER_CACHE_VERSION) {
            localStorage.removeItem(POSTER_CACHE_KEY);
            localStorage.setItem('tmdb_poster_cache_version', String(POSTER_CACHE_VERSION));
        }
        this.posterCache = JSON.parse(localStorage.getItem(POSTER_CACHE_KEY)) || {};
        this.currentScore = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        // Render immediately from whatever is cached locally
        if (this.movies.length > 0) {
            this.displayMovies();
        }
        // Then fetch fresh data from Google Sheets in the background
        this.loadFromGoogleSheets();
    }

    setupEventListeners() {
        // Sort and filter functionality
        document.getElementById('sortBy').addEventListener('change', () => {
            this.applyFiltersAndSort();
        });

        document.getElementById('scoreFilter').addEventListener('change', () => {
            this.applyFiltersAndSort();
        });

        document.getElementById('yearFilter').addEventListener('change', () => {
            this.applyFiltersAndSort();
        });

        // Search functionality
        const searchInput = document.getElementById('movieSearch');
        const searchSuggestions = document.getElementById('searchSuggestions');

        searchInput.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        searchInput.addEventListener('focus', () => {
            if (searchInput.value) {
                this.showSuggestions(searchInput.value);
            }
        });

        searchInput.addEventListener('blur', () => {
            // Delay hiding suggestions to allow clicking on them
            setTimeout(() => {
                searchSuggestions.style.display = 'none';
            }, 200);
        });

        // Handle clicking on suggestions
        searchSuggestions.addEventListener('click', (e) => {
            if (e.target.classList.contains('suggestion-item')) {
                searchInput.value = e.target.textContent;
                this.handleSearch(e.target.textContent);
                searchSuggestions.style.display = 'none';
            }
        });

        // Poster hover preview and click modal
        this.setupPosterInteractions();
    }

    setupPosterInteractions() {
        const preview = document.getElementById('posterPreview');
        const previewImg = document.getElementById('posterPreviewImg');
        const modal = document.getElementById('posterModal');
        const modalImg = document.getElementById('posterModalImg');
        const modalClose = document.getElementById('posterModalClose');

        let hideTimeout;

        // Use event delegation on the movies list for hover + click
        const moviesList = document.getElementById('moviesList');

        moviesList.addEventListener('mouseover', (e) => {
            const img = e.target.closest('img.movie-poster:not(.movie-poster--placeholder)');
            if (!img) return;
            clearTimeout(hideTimeout);
            const fullSrc = img.src.replace('/w92/', '/w342/');
            previewImg.src = fullSrc;
            const rect = img.getBoundingClientRect();
            preview.style.top = `${window.scrollY + rect.top}px`;
            preview.style.left = `${window.scrollX + rect.right + 12}px`;
            preview.classList.add('poster-preview--visible');
        });

        moviesList.addEventListener('mouseout', (e) => {
            const img = e.target.closest('img.movie-poster:not(.movie-poster--placeholder)');
            if (!img) return;
            hideTimeout = setTimeout(() => {
                preview.classList.remove('poster-preview--visible');
            }, 120);
        });

        moviesList.addEventListener('click', (e) => {
            const img = e.target.closest('img.movie-poster:not(.movie-poster--placeholder)');
            if (!img) return;
            preview.classList.remove('poster-preview--visible');
            modalImg.src = img.src.replace('/w92/', '/w500/');
            modalImg.alt = img.closest('.table-row')?.querySelector('.movie-title')?.textContent || '';
            modal.hidden = false;
            document.body.classList.add('modal-open');
            modalClose.focus();
        });

        // Close modal
        const closeModal = () => {
            modal.hidden = true;
            document.body.classList.remove('modal-open');
        };

        modalClose.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.hidden) closeModal();
        });
    }

    handleSearch(searchTerm) {
        if (searchTerm.length > 0) {
            this.showSuggestions(searchTerm);
            this.filterBySearch(searchTerm);
        } else {
            this.hideSuggestions();
            this.applyFiltersAndSort();
        }
    }

    showSuggestions(searchTerm) {
        const suggestions = this.movies
            .filter(movie => movie.title.toLowerCase().includes(searchTerm.toLowerCase()))
            .map(movie => movie.title)
            .filter((title, index, arr) => arr.indexOf(title) === index) // Remove duplicates
            .slice(0, 5); // Limit to 5 suggestions

        const suggestionsContainer = document.getElementById('searchSuggestions');
        
        if (suggestions.length > 0) {
            suggestionsContainer.innerHTML = suggestions
                .map(title => `<div class="suggestion-item">${this.escapeHtml(title)}</div>`)
                .join('');
            suggestionsContainer.style.display = 'block';
        } else {
            suggestionsContainer.style.display = 'none';
        }
    }

    hideSuggestions() {
        document.getElementById('searchSuggestions').style.display = 'none';
    }

    async filterBySearch(searchTerm) {
        const filteredMovies = this.movies.filter(movie => 
            movie.title.toLowerCase().includes(searchTerm.toLowerCase())
        );
        await this.displayMoviesList(filteredMovies);
    }



    async applyFiltersAndSort() {
        let filteredMovies = [...this.movies];

        // Apply search filter
        const searchTerm = document.getElementById('movieSearch').value;
        if (searchTerm) {
            filteredMovies = filteredMovies.filter(movie => 
                movie.title.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Apply score filter
        const scoreFilter = document.getElementById('scoreFilter').value;
        if (scoreFilter !== 'all') {
            filteredMovies = filteredMovies.filter(movie => movie.score === parseInt(scoreFilter));
        }

        // Apply year filter
        const yearFilter = document.getElementById('yearFilter').value;
        if (yearFilter !== 'all') {
            filteredMovies = filteredMovies.filter(movie => (movie.year || new Date(movie.date).getFullYear()) === parseInt(yearFilter));
        }

        // Apply sorting
        const sortBy = document.getElementById('sortBy').value;
        switch (sortBy) {
            case 'date-desc':
                filteredMovies.sort((a, b) => new Date(b.date) - new Date(a.date));
                break;
            case 'date-asc':
                filteredMovies.sort((a, b) => new Date(a.date) - new Date(b.date));
                break;
            case 'score-desc':
                filteredMovies.sort((a, b) => b.score - a.score);
                break;
            case 'score-asc':
                filteredMovies.sort((a, b) => a.score - b.score);
                break;
            case 'title':
                filteredMovies.sort((a, b) => a.title.localeCompare(b.title));
                break;
        }

        await this.displayMoviesList(filteredMovies);
    }

    displayMovies() {
        this.updateYearFilter();
        this.applyFiltersAndSort();
    }

    updateYearFilter() {
        const years = [...new Set(this.movies.map(movie => movie.year || new Date(movie.date).getFullYear()))].sort((a, b) => b - a);
        const yearFilter = document.getElementById('yearFilter');

        // Keep current selection
        const currentValue = yearFilter.value;

        yearFilter.innerHTML = '<option value="all">All Years</option>';
        years.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearFilter.appendChild(option);
        });

        // Restore selection if it still exists
        if (years.includes(parseInt(currentValue))) {
            yearFilter.value = currentValue;
        }
    }

    async displayMoviesList(moviesToShow) {
        const moviesList = document.getElementById('moviesList');

        if (moviesToShow.length === 0) {
            moviesList.innerHTML = `
                <div class="empty-state">
                    <h3>No movies yet!</h3>
                    <p>Add your first movie above to get started.</p>
                </div>
            `;
            return;
        }

        // Group movies by year
        const moviesByYear = {};
        moviesToShow.forEach(movie => {
            const year = movie.year || new Date(movie.date).getFullYear();
            if (!moviesByYear[year]) {
                moviesByYear[year] = [];
            }
            moviesByYear[year].push(movie);
        });

        // Sort years in descending order
        const sortedYears = Object.keys(moviesByYear).sort((a, b) => b - a);

        let html = '';

        sortedYears.forEach(year => {
            const yearMovies = moviesByYear[year];
            yearMovies.sort((a, b) => b.id - a.id);
            const netScore = yearMovies.reduce((sum, movie) => sum + movie.score, 0);

            html += `
                <div class="year-section">
                    <div class="year-header">
                        <h3>${year}</h3>
                        <div class="net-score">Net Score: <span class="score-value ${netScore >= 0 ? 'positive' : 'negative'}">${netScore}</span></div>
                    </div>
                    <div class="movies-table">
                        <div class="table-header">
                            <div class="col-title">Title</div>
                            <div class="col-score">Score</div>
                        </div>
                        ${yearMovies.map(movie => {
                            const posterUrl = this.posterCache[movie.title];
                            const posterHtml = posterUrl
                                ? `<img class="movie-poster" src="${posterUrl}" alt="" loading="lazy" width="46" height="69">`
                                : `<img class="movie-poster movie-poster--placeholder" src="poster-placeholder.png" alt="No poster available" data-title="${this.escapeHtml(movie.title)}" loading="lazy" width="46" height="69">`;
                            return `
                            <div class="table-row">
                                <div class="col-title">
                                    ${posterHtml}
                                    <div class="movie-title-group">
                                        <div class="movie-title">${this.escapeHtml(movie.title)}</div>
                                        ${movie.notes ? `<div class="movie-notes">${this.escapeHtml(movie.notes)}</div>` : ''}
                                    </div>
                                </div>
                                <div class="col-score">
                                    <span class="score-badge score-${movie.score}">${movie.score}</span>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            `;
        });

        // Render immediately — no waiting for posters
        moviesList.innerHTML = html;

        // Fetch missing posters in the background and swap placeholders as they arrive
        this.fetchAndInjectPosters(moviesToShow);
    }

    fetchAndInjectPosters(movies) {
        const uncached = movies.filter(m =>
            !Object.prototype.hasOwnProperty.call(this.posterCache, m.title)
        );
        if (uncached.length === 0) return;

        uncached.forEach(movie => {
            this.fetchPoster(movie.title).then(posterUrl => {
                if (!posterUrl) return;
                // Swap placeholder img for real poster img
                document.querySelectorAll(`img.movie-poster--placeholder[data-title="${CSS.escape(movie.title)}"]`).forEach(placeholder => {
                    placeholder.src = posterUrl;
                    placeholder.alt = '';
                    placeholder.classList.remove('movie-poster--placeholder');
                });
            });
        });
    }

    formatDateShort(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    saveMovies() {
        localStorage.setItem('movies', JSON.stringify(this.movies));
    }

    savePosterCache() {
        localStorage.setItem(POSTER_CACHE_KEY, JSON.stringify(this.posterCache));
    }

    async fetchPoster(title) {
        const cacheKey = title;

        // Return cached result (including null for known misses)
        if (Object.prototype.hasOwnProperty.call(this.posterCache, cacheKey)) {
            return this.posterCache[cacheKey];
        }

        try {
            const query = encodeURIComponent(title);
            const url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${query}&include_adult=false`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('TMDB request failed');
            const data = await response.json();
            const posterPath = data.results?.[0]?.poster_path || null;
            const posterUrl = posterPath ? `${TMDB_IMG_BASE}${posterPath}` : null;
            this.posterCache[cacheKey] = posterUrl;
            this.savePosterCache();
            return posterUrl;
        } catch {
            this.posterCache[cacheKey] = null;
            this.savePosterCache();
            return null;
        }
    }

    async loadFromGoogleSheets() {
        const GOOGLE_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzR_o8AXukODSdmk7t4XNdKcaujboBWlspoqcuYBi7I8KgozKE37wVmfcpVJR-t2FuNNA/exec';

        try {
            const response = await fetch(GOOGLE_SHEETS_URL, {
                method: 'GET'
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success && result.movies) {
                    // Replace local data with Google Sheets data to avoid duplicates
                    const sheetMovies = result.movies;
                    
                    // Create a map to remove duplicates from sheet data itself
                    const movieMap = new Map();
                    sheetMovies.forEach(movie => {
                        const key = `${movie.title}-${movie.year}`;
                        if (!movieMap.has(key)) {
                            movieMap.set(key, movie);
                        }
                    });
                    
                    // Convert map back to array
                    this.movies = Array.from(movieMap.values());
                    this.saveMovies();
                    this.displayMovies();
                    console.log('Successfully loaded movies from Google Sheets');
                } else {
                    // Fallback to local storage
                    this.displayMovies();
                }
            } else {
                console.warn('Failed to load from Google Sheets, using local data');
                this.displayMovies();
            }
        } catch (error) {
            console.warn('Error loading from Google Sheets:', error);
            this.displayMovies();
        }
    }


}

// Initialize the app
const movieTracker = new MovieTracker();
