# LinkedIn Job Scraper

**English** | [中文](README_zh.md)

A Tampermonkey userscript that scrapes job listings from LinkedIn job pages with automatic deduplication, accumulation, and job ID enrichment.

![Screenshot](screenshot.png)

## Supported Pages

- Recommended jobs (`/jobs/collections/recommended/`)
- Saved jobs (`/jobs/collections/saved/`)
- Search results (`/jobs/search/`)
- Jobs home (`/jobs/`)

## Features

- Scrape jobs from any LinkedIn Jobs page
- **Click-based job ID enrichment** - automatically clicks each job card to capture the LinkedIn job ID, achieving ~97% link rate (v0.3.2)
- Auto-deduplication using company + title + location
- Accumulation mode - multiple scrapes combine automatically
- Priority sorting: Top Applicant > Connections > Recent > Easy Apply
- SPA navigation support - panel persists across page transitions
- Bilingual UI (English / Chinese)

## Installation

### Step 1: Install Tampermonkey

Install the Tampermonkey browser extension:

| Browser | Link |
|---------|------|
| Chrome | [Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) |
| Firefox | [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/) |
| Edge | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd) |
| Safari | [Mac App Store](https://apps.apple.com/app/tampermonkey/id1482490089) |

> **Safari users:** After installing Tampermonkey, you need to enable **Allow User Scripts** in Safari settings. Go to Safari > Settings > Extensions > Tampermonkey, and toggle on "Allow User Scripts". See [Tampermonkey Safari FAQ](https://www.tampermonkey.net/faq.php#Q209) for details.

### Step 2: Install the Script

**Option A: From URL**

Click: [Install Script](https://raw.githubusercontent.com/qinip/linkedin-job-scraper/main/linkedin-job-scraper.user.js)

**Option B: From local file**

1. Download `linkedin-job-scraper.user.js`
2. Open Tampermonkey Dashboard > Utilities > Import from file
3. Select the downloaded file

## Usage

1. Go to any LinkedIn Jobs page (Recommended, Search, Saved, etc.)

2. A blue panel will appear on the right side

3. Click a scrape button:
   - **Quick Scrape** - Scrape currently loaded jobs (no scrolling/pagination)
   - **Scrape at least N** - Scroll/paginate until N new jobs found

4. Results are copied to clipboard and can be downloaded as JSON

## Output Format

```json
{
  "id": "4363843832",
  "title": "Machine Learning Engineer - AI Decision Intelligence Platform",
  "company": "Andiamo",
  "location": "Washington, DC (Hybrid)",
  "salary": "",
  "isTopApplicant": true,
  "hasEasyApply": true,
  "hasConnections": false,
  "postedAgo": "",
  "daysAgo": -1,
  "postedDate": "",
  "insight": "You'd be a top applicant",
  "footer": "Viewed, Promoted, Easy Apply",
  "link": "https://www.linkedin.com/jobs/view/4363843832/",
  "extractedAt": "2026-03-18T22:36:53.439Z",
  "_source": "linkedin-classic-ui",
  "dedupeKey": "andiamo|||machine learning engineer...|||washington, dc"
}
```

## Changelog

### v0.3.2 (2026-03-18)
- Click-based job ID enrichment (link rate 43% to 97%)
- SPA navigation fix - panel persists across LinkedIn page transitions
- Improved stability for LinkedIn's new UI

### v0.1.5 (2026-03-18)
- Improved new UI deduplication and pagination scraping

### v0.1.1
- Improved new UI parsing and simplified button layout

### v0.1 (2026-01-25)
- Initial release

## Notes

- Accumulated data is stored in browser session (clears when tab closes)
- Download location is controlled by your browser settings
- Promoted jobs may not have posting dates
- The script clicks job cards to extract IDs; this is visually subtle but may briefly highlight cards

## License

MIT License
