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
                        id: Date.now() + allMovies.length + index, // Generate unique ID
                        title: row[0].toString().trim(), // Title from column A
                        score: parseInt(row[1]) || 0, // Score from column B
                        notes: row[2] ? row[2].toString().trim() : '', // Notes from column C only
                        year: year, // Store the actual year from tab name
                        date: `${year}-01-01`, // Use January 1st of the year as default date
                        dateAdded: new Date().toISOString()
                    };
                }).filter(movie => movie && movie.title); // Filter out null and empty rows

                allMovies.push(...yearMovies);
            }
        });

        return ContentService
            .createTextOutput(JSON.stringify({ success: true, movies: allMovies }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService
            .createTextOutput(JSON.stringify({ success: false, error: error.toString(), movies: [] }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}