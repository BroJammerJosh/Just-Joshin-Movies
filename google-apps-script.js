// Google Apps Script for Movie Tracker Integration
// Deploy this as a Web App in Google Apps Script

function doPost(e) {
    try {
        // Parse the incoming data
        const data = JSON.parse(e.postData.contents);

        // Open your Google Sheet by ID
        const SHEET_ID = '11G0R-hSglako-mA-piAYWWGnY9Ql_K-R7SxbnNtMvIc';
        const spreadsheet = SpreadsheetApp.openById(SHEET_ID);

        // Automatically extract year from date if not provided
        const movieDate = new Date(data.date);
        const year = data.year || movieDate.getFullYear();

        // Try to get the sheet for this year, create if it doesn't exist
        let yearSheet;
        try {
            yearSheet = spreadsheet.getSheetByName(year.toString());
        } catch (error) {
            // Sheet doesn't exist, create it
            yearSheet = spreadsheet.insertSheet(year.toString());
            // Add header row
            yearSheet.appendRow(['Title', 'Score', 'Notes']);
        }

        // Add the movie data to the year-specific sheet
        yearSheet.appendRow([
            data.title,
            data.score,
            data.notes || ''
        ]);

        return ContentService
            .createTextOutput(JSON.stringify({ success: true }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

function doGet(e) {
    try {
        // Open your Google Sheet by ID
        const SHEET_ID = '11G0R-hSglako-mA-piAYWWGnY9Ql_K-R7SxbnNtMvIc';
        const spreadsheet = SpreadsheetApp.openById(SHEET_ID);

        // Get all sheets (tabs) in the spreadsheet
        const sheets = spreadsheet.getSheets();
        const allMovies = [];
        const allAwards = [];

        sheets.forEach(sheet => {
            const sheetName = sheet.getName();

            // Check if sheet name is a year (4 digits)
            const yearMatch = sheetName.match(/^\d{4}$/);
            if (yearMatch) {
                const year = parseInt(yearMatch[0]);

                // Get all data from this year's sheet
                const data = sheet.getDataRange().getValues();

                // Skip header row if it exists, convert to movie objects
                const yearMovies = data.slice(1).map((row, index) => {
                    // Only process rows that have a title in column A
                    if (!row[0] || row[0].toString().trim() === '') return null;

                    return {
                        id: (year * 10000) + (index + 1),
                        title: row[0].toString().trim(),
                        score: parseInt(row[1]) || 0,
                        notes: row[2] ? row[2].toString().trim() : '',
                        year: year,
                        date: `${year}-01-01`,
                        dateAdded: new Date().toISOString()
                    };
                }).filter(movie => movie && movie.title);

                allMovies.push(...yearMovies);
            }

            // Read the Awards tab
            if (sheetName === 'Awards') {
                const data = sheet.getDataRange().getValues();

                // Expected columns: Year | Award Name | Movie Title
                // Skip header row
                data.slice(1).forEach(row => {
                    const year = row[0] ? parseInt(row[0].toString().trim()) : null;
                    const awardName = row[1] ? row[1].toString().trim() : '';
                    const movieTitle = row[2] ? row[2].toString().trim() : '';

                    if (!year || !awardName || !movieTitle) return;

                    allAwards.push({ year, awardName, movieTitle });
                });
            }
        });

        return ContentService
            .createTextOutput(JSON.stringify({ success: true, movies: allMovies, awards: allAwards }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({ success: false, error: error.toString(), movies: [], awards: [] }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}