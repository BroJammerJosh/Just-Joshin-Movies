// Google Apps Script for Movie Tracker Integration
// Deploy this as a Web App in Google Apps Script

const SHEET_ID = '11G0R-hSglako-mA-piAYWWGnY9Ql_K-R7SxbnNtMvIc';
const TMDB_API_KEY = 'b4ba32fa646c73c4d65e7655af34b8be';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/w342';
const SITE_URL = 'https://brojammerjosh.github.io/Just-Joshin-Movies/';

// ─────────────────────────────────────────────
// doPost — handles movie adds AND subscriber signups
// ─────────────────────────────────────────────
function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        const spreadsheet = SpreadsheetApp.openById(SHEET_ID);

        // Route by action
        if (data.action === 'subscribe') {
            return handleSubscribe(spreadsheet, data);
        }

        // Default: add a movie (legacy behavior)
        const movieDate = new Date(data.date);
        const year = data.year || movieDate.getFullYear();

        let yearSheet = spreadsheet.getSheetByName(year.toString());
        if (!yearSheet) {
            yearSheet = spreadsheet.insertSheet(year.toString());
            yearSheet.appendRow(['Title', 'Score', 'Notes', 'DateAdded']);
        }

        yearSheet.appendRow([
            data.title,
            data.score,
            data.notes || '',
            new Date().toISOString()
        ]);

        return jsonResponse({ success: true });

    } catch (error) {
        return jsonResponse({ success: false, error: error.toString() });
    }
}

// ─────────────────────────────────────────────
// handleSubscribe — saves to Subscribers tab
// ─────────────────────────────────────────────
function handleSubscribe(spreadsheet, data) {
    const firstName = (data.firstName || '').toString().trim();
    const email = (data.email || '').toString().trim();

    if (!firstName || !email) {
        return jsonResponse({ success: false, error: 'Missing fields' });
    }

    // Get or create Subscribers sheet
    let subSheet = spreadsheet.getSheetByName('Subscribers');
    if (!subSheet) {
        subSheet = spreadsheet.insertSheet('Subscribers');
        subSheet.appendRow(['First Name', 'Email', 'Date Subscribed']);
    }

    // Check for duplicate email
    const existing = subSheet.getDataRange().getValues();
    const alreadySubscribed = existing.slice(1).some(row =>
        row[1] && row[1].toString().toLowerCase() === email.toLowerCase()
    );

    if (alreadySubscribed) {
        return jsonResponse({ success: false, alreadySubscribed: true });
    }

    subSheet.appendRow([firstName, email, new Date().toISOString()]);
    return jsonResponse({ success: true });
}

// ─────────────────────────────────────────────
// doGet — returns movies and awards data
// ─────────────────────────────────────────────
function doGet(e) {
    try {
        const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
        const sheets = spreadsheet.getSheets();
        const allMovies = [];
        const allAwards = [];

        sheets.forEach(sheet => {
            const sheetName = sheet.getName();

            // Year tabs (4-digit names)
            const yearMatch = sheetName.match(/^\d{4}$/);
            if (yearMatch) {
                const year = parseInt(yearMatch[0]);
                const data = sheet.getDataRange().getValues();

                const yearMovies = data.slice(1).map((row, index) => {
                    if (!row[0] || row[0].toString().trim() === '') return null;
                    return {
                        id: (year * 10000) + (index + 1),
                        title: row[0].toString().trim(),
                        score: parseInt(row[1]) || 0,
                        notes: row[2] ? row[2].toString().trim() : '',
                        year: year,
                        date: `${year}-01-01`,
                        dateAdded: row[3] ? row[3].toString() : ''
                    };
                }).filter(movie => movie && movie.title);

                allMovies.push(...yearMovies);
            }

            // Awards tab
            if (sheetName === 'Awards') {
                const data = sheet.getDataRange().getValues();
                data.slice(1).forEach(row => {
                    const year = row[0] ? parseInt(row[0].toString().trim()) : null;
                    const awardName = row[1] ? row[1].toString().trim() : '';
                    const movieTitle = row[2] ? row[2].toString().trim() : '';
                    if (!year || !awardName || !movieTitle) return;
                    allAwards.push({ year, awardName, movieTitle });
                });
            }
        });

        return jsonResponse({ success: true, movies: allMovies, awards: allAwards });

    } catch (error) {
        return jsonResponse({ success: false, error: error.toString(), movies: [], awards: [] });
    }
}

// ─────────────────────────────────────────────
// sendMonthlyNewsletter — run on 1st of each month via trigger
// ─────────────────────────────────────────────
function sendMonthlyNewsletter() {
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);

    // Get subscribers
    const subSheet = spreadsheet.getSheetByName('Subscribers');
    if (!subSheet) return;
    const subscribers = subSheet.getDataRange().getValues().slice(1)
        .filter(row => row[1] && row[1].toString().trim() !== '');

    if (subscribers.length === 0) return;

    // Figure out the previous month
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthName = prevMonth.toLocaleString('en-US', { month: 'long' });
    const prevMonthYear = prevMonth.getFullYear();

    // Gather movies added last month from the year tab
    // We use dateAdded column (col D) if available, otherwise include all from that year
    const yearSheet = spreadsheet.getSheetByName(prevMonthYear.toString());
    const monthMovies = [];

    if (yearSheet) {
        const rows = yearSheet.getDataRange().getValues().slice(1);
        rows.forEach(row => {
            if (!row[0]) return;
            const dateAdded = row[3] ? new Date(row[3]) : null;
            const inPrevMonth = dateAdded &&
                dateAdded.getMonth() === prevMonth.getMonth() &&
                dateAdded.getFullYear() === prevMonthYear;

            // Include if dateAdded matches last month, or if no dateAdded tracked yet
            if (!dateAdded || inPrevMonth) {
                monthMovies.push({
                    title: row[0].toString().trim(),
                    score: parseInt(row[1]) || 0,
                    notes: row[2] ? row[2].toString().trim() : ''
                });
            }
        });
    }

    // Categorize
    const hotMovies   = monthMovies.filter(m => m.score === 2);
    const goodMovies  = monthMovies.filter(m => m.score === 1);
    const mehMovies   = monthMovies.filter(m => m.score === 0);
    const badMovies   = monthMovies.filter(m => m.score === -1);
    const netScore    = monthMovies.reduce((sum, m) => sum + m.score, 0);

    // Fetch posters from TMDB for hot and bad movies
    const posterCache = {};
    [...hotMovies, ...badMovies].forEach(m => {
        if (!posterCache[m.title]) {
            posterCache[m.title] = fetchTmdbPoster(m.title);
        }
    });

    // Build and send email to each subscriber
    subscribers.forEach(row => {
        const firstName = row[0].toString().trim();
        const email = row[1].toString().trim();

        try {
            const html = buildEmailHtml({
                firstName,
                prevMonthName,
                prevMonthYear,
                monthMovies,
                hotMovies,
                goodMovies,
                mehMovies,
                badMovies,
                netScore,
                posterCache
            });

            GmailApp.sendEmail(email, `Just Joshin' at the Movies — ${prevMonthName} ${prevMonthYear} Update`, '', {
                htmlBody: html,
                name: "Just Joshin' at the Movies"
            });

        } catch (err) {
            console.error(`Failed to send to ${email}: ${err}`);
        }
    });
}

// ─────────────────────────────────────────────
// fetchTmdbPoster — looks up poster URL from TMDB
// ─────────────────────────────────────────────
function fetchTmdbPoster(title) {
    try {
        const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&include_adult=false`;
        const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
        const data = JSON.parse(response.getContentText());
        const posterPath = data.results && data.results[0] && data.results[0].poster_path;
        return posterPath ? `${TMDB_IMG_BASE}${posterPath}` : null;
    } catch (e) {
        return null;
    }
}

// ─────────────────────────────────────────────
// buildEmailHtml — assembles the HTML email
// ─────────────────────────────────────────────
function buildEmailHtml({ firstName, prevMonthName, prevMonthYear, monthMovies, hotMovies, goodMovies, mehMovies, badMovies, netScore, posterCache }) {

    const scoreColor = netScore >= 0 ? '#27ae60' : '#e74c3c';

    // Helper: render a poster card for hot/bad sections
    function posterCard(movie) {
        const poster = posterCache[movie.title];
        const imgHtml = poster
            ? `<img src="${poster}" alt="${escapeHtml(movie.title)}" width="120" style="border-radius:6px;display:block;margin:0 auto 8px;">`
            : '';
        return `
        <td style="text-align:center;vertical-align:top;padding:0 16px 24px;">
            ${imgHtml}
            <div style="font-size:13px;font-weight:600;color:#2c3e50;max-width:130px;margin:0 auto;">${escapeHtml(movie.title)}</div>
            ${movie.notes ? `<div style="font-size:11px;color:#888;margin-top:4px;max-width:130px;margin:4px auto 0;font-style:italic;">${escapeHtml(movie.notes)}</div>` : ''}
        </td>`;
    }

    // Helper: render a simple list row for score 1 and 0
    function listRow(movie) {
        return `<tr><td style="padding:6px 0;font-size:14px;color:#444;border-bottom:1px solid #f1f3f4;">${escapeHtml(movie.title)}${movie.notes ? ` <span style="color:#999;font-size:12px;font-style:italic;">— ${escapeHtml(movie.notes)}</span>` : ''}</td></tr>`;
    }

    function escapeHtml(str) {
        return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // Hot section (score 2) — poster grid
    const hotSection = hotMovies.length === 0 ? '' : `
    <tr><td style="padding:24px 0 8px;">
        <h2 style="margin:0 0 16px;font-size:18px;color:#2c3e50;border-bottom:2px solid #667eea;padding-bottom:8px;">🔥 What's Hot</h2>
        <table style="width:100%;border-collapse:collapse;"><tr>
            ${hotMovies.map(posterCard).join('')}
        </tr></table>
    </td></tr>`;

    // Good section (score 1) — simple list
    const goodSection = goodMovies.length === 0 ? '' : `
    <tr><td style="padding:16px 0 8px;">
        <h2 style="margin:0 0 12px;font-size:18px;color:#2c3e50;border-bottom:2px solid #27ae60;padding-bottom:8px;">👍 Worth Watching</h2>
        <table style="width:100%;border-collapse:collapse;">${goodMovies.map(listRow).join('')}</table>
    </td></tr>`;

    // Meh section (score 0)
    const mehSection = mehMovies.length === 0 ? '' : `
    <tr><td style="padding:16px 0 8px;">
        <h2 style="margin:0 0 12px;font-size:18px;color:#2c3e50;border-bottom:2px solid #f39c12;padding-bottom:8px;">😐 Take It or Leave It</h2>
        <table style="width:100%;border-collapse:collapse;">${mehMovies.map(listRow).join('')}</table>
    </td></tr>`;

    // Bad section (score -1) — poster grid
    const badSection = badMovies.length === 0 ? '' : `
    <tr><td style="padding:16px 0 8px;">
        <h2 style="margin:0 0 16px;font-size:18px;color:#2c3e50;border-bottom:2px solid #e74c3c;padding-bottom:8px;">💀 What's Not</h2>
        <table style="width:100%;border-collapse:collapse;"><tr>
            ${badMovies.map(posterCard).join('')}
        </tr></table>
    </td></tr>`;

    const unsubscribeNote = `<tr><td style="padding:24px 0 0;text-align:center;font-size:12px;color:#aaa;">
        You're receiving this because you signed up at <a href="${SITE_URL}" style="color:#667eea;">${SITE_URL}</a>.
        To unsubscribe, reply to this email with "unsubscribe" in the subject line.
    </td></tr>`;

    return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <tr><td style="background:linear-gradient(135deg,#2c3e50,#34495e);padding:32px 40px;text-align:center;">
        <h1 style="margin:0 0 6px;color:white;font-size:24px;">Just Joshin' at the Movies</h1>
        <p style="margin:0;color:rgba(255,255,255,0.85);font-size:14px;">${prevMonthName} ${prevMonthYear} Update</p>
    </td></tr>

    <!-- Greeting + summary -->
    <tr><td style="padding:32px 40px 0;">
        <p style="margin:0 0 20px;font-size:15px;color:#444;">Hey ${escapeHtml(firstName)},</p>
        <p style="margin:0 0 20px;font-size:15px;color:#444;line-height:1.6;">Here's your monthly update from The Joshening — your source for keeping up to date with what movies Josh has been watching.</p>
        <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">${monthMovies.length === 0 ? 'A quiet month — nothing new to report.' : `Josh watched ${monthMovies.length} movie${monthMovies.length !== 1 ? 's' : ''} last month with a net score of <strong style="color:${scoreColor};">${netScore >= 0 ? '+' : ''}${netScore}</strong>.`}</p>
        <table style="width:100%;border-collapse:collapse;">
            ${hotSection}
            ${goodSection}
            ${mehSection}
            ${badSection}
            ${unsubscribeNote}
        </table>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:24px 40px;text-align:center;background:#f8f9fa;border-top:1px solid #e9ecef;">
        <a href="${SITE_URL}" style="color:#667eea;font-size:13px;text-decoration:none;">Visit the full site →</a>
    </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─────────────────────────────────────────────
// setupMonthlyTrigger — run this ONCE manually to install the trigger
// ─────────────────────────────────────────────
function setupMonthlyTrigger() {
    // Delete any existing triggers for sendMonthlyNewsletter to avoid duplicates
    ScriptApp.getProjectTriggers().forEach(trigger => {
        if (trigger.getHandlerFunction() === 'sendMonthlyNewsletter') {
            ScriptApp.deleteTrigger(trigger);
        }
    });

    // Fire on the 1st of every month between 8-9am
    ScriptApp.newTrigger('sendMonthlyNewsletter')
        .timeBased()
        .onMonthDay(1)
        .atHour(8)
        .create();
}

// ─────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────
function jsonResponse(obj) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}
