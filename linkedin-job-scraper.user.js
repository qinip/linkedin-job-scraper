// ==UserScript==
// @name         LinkedIn Job Scraper
// @namespace    https://linkedin.com/
// @version      0.1.1
// @description  Scrape LinkedIn jobs with accumulation, deduplication, and multi-language support. Supports both classic and new (Voyager) UI.
// @author       Eddy Ji
// @match        *://www.linkedin.com/jobs/*
// @match        *://www.linkedin.com/jobs/collections/*
// @match        *://www.linkedin.com/jobs/search/*
// @match        *://www.linkedin.com/jobs/search-results/*
// @run-at       document-end
// @grant        none
// @license      MIT
// @homepageURL  https://github.com/qinip/linkedin-job-scraper
// ==/UserScript==

(function() {
    'use strict';
    
    // ========================================
    // Internationalization (i18n)
    // ========================================
    const LANG = {
        en: {
            title: 'LinkedIn Scraper',
            accumulated: 'Accumulated',
            jobs: 'jobs',
            clear: 'Clear',
            clearConfirm: 'Clear all accumulated jobs?',
            cleared: 'Accumulated jobs cleared',
            scrapeAll: 'Scrape All',
            pages: 'pages',
            scrapeAtLeast: 'Scrape at least',
            newJobs: 'new jobs',
            quickScrape: 'Quick Scrape',
            currentlyVisible: 'currently visible',
            zoomTip: 'Zoom out to see more',
            ready: 'Ready',
            totalPages: 'pages total',
            approx: 'approx',
            multiScrapeTip: 'Multiple scrapes auto-dedupe & accumulate',
            scraping: 'Scraping',
            page: 'page',
            collected: 'collected',
            complete: 'Scrape Complete',
            thisSession: 'This scrape',
            newAdded: 'New added',
            skippedDupe: 'Skipped (duplicate)',
            totalAccumulated: 'Total Accumulated',
            topApplicant: 'Top Applicant',
            directContact: 'Direct Contact',
            easyApply: 'Easy Apply',
            copiedToClipboard: 'Copied to clipboard (all accumulated)',
            clipboardFailed: 'Clipboard unavailable',
            downloadPrompt: 'Download JSON file?',
            downloaded: 'Downloaded',
            sessionNote: 'Note: Accumulated data clears when tab closes',
            langSwitch: '中文'
        },
        zh: {
            title: 'LinkedIn 抓取器',
            accumulated: '已累积',
            jobs: '个职位',
            clear: '清空',
            clearConfirm: '确定要清空已累积的职位吗？',
            cleared: '已清空累积记录',
            scrapeAll: '抓取全部',
            pages: '页',
            scrapeAtLeast: '抓取至少',
            newJobs: '个新职位',
            quickScrape: '快速抓取',
            currentlyVisible: '当前可见',
            zoomTip: '缩小网页可增加数量',
            ready: '就绪',
            totalPages: '页',
            approx: '约',
            multiScrapeTip: '多次抓取会自动去重并累积',
            scraping: '抓取中',
            page: '页',
            collected: '已收集',
            complete: '抓取完成',
            thisSession: '本次抓取',
            newAdded: '新增',
            skippedDupe: '已存在 (跳过)',
            totalAccumulated: '累积总数',
            topApplicant: 'Top Applicant',
            directContact: '有直接联系人',
            easyApply: 'Easy Apply',
            copiedToClipboard: '已复制到剪贴板 (全部累积数据)',
            clipboardFailed: '剪贴板不可用',
            downloadPrompt: '是否下载 JSON 文件到本地？',
            downloaded: '已下载',
            sessionNote: '提示：累积数据在关闭标签页后清空',
            langSwitch: 'EN'
        }
    };
    
    // Get/set language preference
    function getLang() {
        return localStorage.getItem('ljs_lang') || 'en';
    }
    
    function setLang(lang) {
        localStorage.setItem('ljs_lang', lang);
    }
    
    function t(key) {
        const lang = getLang();
        return LANG[lang][key] || LANG.en[key] || key;
    }
    
    console.log('[LinkedIn Scraper v0.1.1] Script loaded!');
    
    // ========================================
    // UI Version Detection
    // ========================================
    function detectUIVersion() {
        // New UI (Voyager): uses div[role="button"] for job cards, hashed class names
        // Classic UI: uses li[data-occludable-job-id] with .job-card-container
        
        const classicJobCards = document.querySelectorAll('li[data-occludable-job-id] .job-card-container');
        const newUIJobCards = document.querySelectorAll('div[role="button"]');
        
        // Check for new UI indicators
        const hasNewUICards = Array.from(newUIJobCards).some(card => {
            const text = card.textContent;
            return (text.includes('Verified job') || text.includes('/yr') || text.includes('/hr')) && 
                   text.length > 30 && text.length < 800;
        });
        
        // Check URL pattern
        const isSearchResults = window.location.pathname.includes('/jobs/search-results');
        
        if (classicJobCards.length > 0) {
            return 'classic';
        } else if (hasNewUICards || isSearchResults) {
            return 'new';
        }
        
        return 'unknown';
    }
    
    // ========================================
    // Storage (sessionStorage - clears on tab close)
    // ========================================
    const STORAGE_KEY = 'linkedin_scraper_jobs';
    
    function getAccumulatedJobs() {
        try {
            const data = sessionStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch(e) {
            return [];
        }
    }
    
    function saveAccumulatedJobs(jobs) {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
        } catch(e) {
            console.error('[LinkedIn Scraper] Storage error:', e);
        }
    }
    
    function clearAccumulatedJobs() {
        sessionStorage.removeItem(STORAGE_KEY);
    }
    
    // Generate dedupe key from company + title + base location
    function getDedupeKey(job) {
        const company = (job.company || '').toLowerCase().trim();
        const title = (job.title || '').toLowerCase().trim();
        const baseLocation = (job.location || '').replace(/\s*\(.*?\)\s*$/, '').toLowerCase().trim();
        return `${company}|||${title}|||${baseLocation}`;
    }
    
    // Parse "X hours ago", "X days ago" etc. to number of days
    function parsePostedAgo(postedAgo) {
        if (!postedAgo) return -1;
        const str = postedAgo.toLowerCase();
        const numMatch = str.match(/(\d+)/);
        if (!numMatch) return -1;
        const num = parseInt(numMatch[1], 10);
        
        if (str.includes('minute')) return 0;
        if (str.includes('hour')) return 0;
        if (str.includes('day')) return num;
        if (str.includes('week')) return num * 7;
        if (str.includes('month')) return num * 30;
        return -1;
    }

    function mergeJobs(existingJobs, newJobs) {
        const existingKeys = new Set(existingJobs.map(j => getDedupeKey(j)));
        const uniqueNewJobs = newJobs.filter(j => !existingKeys.has(getDedupeKey(j)));
        return {
            merged: [...existingJobs, ...uniqueNewJobs],
            newCount: uniqueNewJobs.length,
            duplicateCount: newJobs.length - uniqueNewJobs.length
        };
    }
    
    // Wait for page to fully load
    setTimeout(function() {
        console.log('[LinkedIn Scraper] Creating UI...');
        createUI();
    }, 3000);
    
    // ========================================
    // Page Info Detection
    // ========================================
    function getPageInfo() {
        const uiVersion = detectUIVersion();
        
        if (uiVersion === 'new') {
            // New UI: count visible job cards
            const jobCards = getNewUIJobCards();
            return {
                currentPage: 1,
                totalPages: 1,
                estimatedTotal: jobCards.length,
                visibleJobs: jobCards.length,
                uiVersion: 'new'
            };
        }
        
        // Classic UI
        const pageStateEl = document.querySelector('.jobs-search-pagination__page-state');
        let totalPages = 1;
        let currentPage = 1;
        
        if (pageStateEl) {
            const match = pageStateEl.textContent.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
            if (match) {
                currentPage = parseInt(match[1]);
                totalPages = parseInt(match[2]);
            }
        }
        
        const jobsPerPage = 25;
        const estimatedTotal = totalPages * jobsPerPage;
        const visibleJobs = document.querySelectorAll('li[data-occludable-job-id] .job-card-container').length;
        
        return { currentPage, totalPages, estimatedTotal, visibleJobs, uiVersion: 'classic' };
    }
    
    // ========================================
    // New UI Job Card Detection
    // ========================================
    function getNewUIJobCards() {
        // Primary: Use the semantic data-view-name attribute
        const jobCardContainers = document.querySelectorAll('[data-view-name="job-search-job-card"]');
        if (jobCardContainers.length > 0) {
            return Array.from(jobCardContainers);
        }
        
        // Fallback: Filter div[role="button"] by content
        const allButtons = document.querySelectorAll('div[role="button"]');
        const jobCards = [];

        allButtons.forEach(card => {
            const text = card.textContent || '';
            // Job cards contain title + company + location, usually with salary or "Verified job"
            if ((text.includes('Verified job') || text.includes('/yr') || text.includes('/hr') ||
                 text.includes('Easy Apply') || text.includes('applicant')) &&
                text.length > 30 && text.length < 800) {
                jobCards.push(card);
            }
        });

        return jobCards;
    }
    
    // ========================================
    // UI Creation (using DOM API for reliability)
    // ========================================
    function createUI() {
        const existing = document.getElementById('ljs-panel');
        if (existing) existing.remove();
        
        const pageInfo = getPageInfo();
        const accumulated = getAccumulatedJobs();
        
        // Create panel
        const panel = document.createElement('div');
        panel.id = 'ljs-panel';
        setStyles(panel, {
            position: 'fixed',
            top: '100px',
            right: '20px',
            zIndex: '99999',
            background: '#0a66c2', // LinkedIn blue for all UI versions
            borderRadius: '8px',
            padding: '15px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            width: '280px',
            color: 'white'
        });
        
        // Header row
        const header = createDiv({display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'});
        const title = document.createElement('strong');
        title.textContent = '🔍 ' + t('title') + ' v0.1.1';
        title.style.fontSize = '14px';
        
        const headerBtns = createDiv({display: 'flex', gap: '8px', alignItems: 'center'});
        const langBtn = createButton('ljs-lang', t('langSwitch'), {background: 'rgba(255,255,255,0.2)', padding: '2px 6px', fontSize: '11px'});
        const closeBtn = createButton('ljs-close', '×', {background: 'none', fontSize: '18px', padding: '0'});
        headerBtns.appendChild(langBtn);
        headerBtns.appendChild(closeBtn);
        header.appendChild(title);
        header.appendChild(headerBtns);
        panel.appendChild(header);
        
        // Accumulated row
        const accRow = createDiv({background: 'rgba(255,255,255,0.15)', padding: '8px 10px', borderRadius: '4px', marginBottom: '10px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'});
        const accText = document.createElement('span');
        accText.innerHTML = '📦 ' + t('accumulated') + ': <strong id="ljs-acc-count">' + accumulated.length + '</strong> ' + t('jobs');
        const clearBtn = createButton('ljs-clear', t('clear'), {background: 'rgba(255,255,255,0.2)', padding: '4px 8px', fontSize: '11px'});
        if (accumulated.length === 0) clearBtn.disabled = true;
        accRow.appendChild(accText);
        accRow.appendChild(clearBtn);
        panel.appendChild(accRow);
        
        // Quick Scrape button (primary - scrapes what's loaded, no scrolling)
        const quickBtn = createButton('ljs-quick', '', {width: '100%', padding: '12px', margin: '5px 0', background: 'white', color: '#0a66c2', fontWeight: 'bold', fontSize: '14px', textAlign: 'left', display: 'block'});
        const quickLine1 = document.createElement('div');
        quickLine1.textContent = t('quickScrape') + ' (~' + pageInfo.visibleJobs + ' ' + t('jobs') + ')';
        const quickLine2 = document.createElement('div');
        quickLine2.textContent = '💡 ' + t('currentlyVisible') + ' - ' + t('zoomTip');
        quickLine2.style.fontSize = '10px';
        quickLine2.style.opacity = '0.7';
        quickLine2.style.marginTop = '2px';
        quickBtn.appendChild(quickLine1);
        quickBtn.appendChild(quickLine2);
        panel.appendChild(quickBtn);
        
        // Scrape At Least row (secondary - scrolls/paginates to reach target)
        const minRow = createDiv({display: 'flex', alignItems: 'center', margin: '5px 0', gap: '5px'});
        const minBtn = createButton('ljs-scrape-min', t('scrapeAtLeast'), {flex: '1', padding: '10px', background: 'rgba(255,255,255,0.3)', fontSize: '13px'});
        const minInput = document.createElement('input');
        minInput.type = 'number';
        minInput.id = 'ljs-min-count';
        minInput.value = '50';
        minInput.min = '10';
        minInput.max = '500';
        setStyles(minInput, {width: '60px', padding: '8px', border: 'none', borderRadius: '4px', textAlign: 'center', fontSize: '13px'});
        const minLabel = document.createElement('span');
        minLabel.textContent = t('newJobs');
        minLabel.style.fontSize = '12px';
        minRow.appendChild(minBtn);
        minRow.appendChild(minInput);
        minRow.appendChild(minLabel);
        panel.appendChild(minRow);
        
        // Status
        const status = createDiv({marginTop: '10px', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', fontSize: '12px'});
        status.id = 'ljs-status';
        status.textContent = t('ready') + '. ' + pageInfo.totalPages + ' ' + t('totalPages') + ', ' + t('approx') + ' ' + pageInfo.estimatedTotal + ' ' + t('jobs') + '.';
        panel.appendChild(status);
        
        // Tip
        const tip = createDiv({fontSize: '10px', opacity: '0.7', marginTop: '8px', textAlign: 'center'});
        tip.textContent = t('multiScrapeTip');
        panel.appendChild(tip);
        
        document.body.appendChild(panel);
        attachEventListeners();
        startPeriodicUpdate();
        console.log('[LinkedIn Scraper] Panel created! UI version:', pageInfo.uiVersion);
    }
    
    // Helper: create div with styles
    function createDiv(styles) {
        const div = document.createElement('div');
        setStyles(div, styles);
        return div;
    }
    
    // Helper: create button with styles
    function createButton(id, text, styles) {
        const btn = document.createElement('button');
        btn.id = id;
        btn.textContent = text;
        setStyles(btn, Object.assign({border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer'}, styles));
        return btn;
    }
    
    // Helper: set multiple styles
    function setStyles(el, styles) {
        for (const key in styles) {
            el.style[key] = styles[key];
        }
    }
    
    function attachEventListeners() {
        document.getElementById('ljs-close').onclick = () => document.getElementById('ljs-panel').remove();
        document.getElementById('ljs-lang').onclick = () => {
            const newLang = getLang() === 'en' ? 'zh' : 'en';
            setLang(newLang);
            createUI();
        };
        
        const quickBtn = document.getElementById('ljs-quick');
        if (quickBtn) quickBtn.onclick = () => quickScrape();

        const scrapeMinBtn = document.getElementById('ljs-scrape-min');
        if (scrapeMinBtn) {
            scrapeMinBtn.onclick = () => {
                const minCount = parseInt(document.getElementById('ljs-min-count').value) || 50;
                scrapeMinimumJobs(minCount);
            };
        }
        
        document.getElementById('ljs-clear').onclick = () => {
            if (confirm(t('clearConfirm'))) {
                clearAccumulatedJobs();
                updateAccumulatedDisplay();
                updateStatus(t('cleared'));
            }
        };
    }
    
    function startPeriodicUpdate() {
        setInterval(() => {
            const pageInfo = getPageInfo();

            // Update Quick Scrape button with current visible count
            const quickBtn = document.getElementById('ljs-quick');
            if (quickBtn) {
                const line1 = quickBtn.querySelector('div');
                if (line1) {
                    line1.textContent = t('quickScrape') + ' (~' + pageInfo.visibleJobs + ' ' + t('jobs') + ')';
                }
            }
        }, 3000);
    }
    
    function updateStatus(msg) {
        const el = document.getElementById('ljs-status');
        if (el) el.textContent = msg;
        console.log('[LinkedIn Scraper]', msg);
    }
    
    function updateAccumulatedDisplay() {
        const accumulated = getAccumulatedJobs();
        const countEl = document.getElementById('ljs-acc-count');
        const clearBtn = document.getElementById('ljs-clear');
        if (countEl) countEl.textContent = accumulated.length;
        if (clearBtn) clearBtn.disabled = accumulated.length === 0;
    }
    
    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
    
    // Parse relative time string to days ago
    function parseRelativeTime(str) {
        if (!str) return -1;
        const s = str.toLowerCase().trim();
        
        if (s.includes('just now') || s.includes('moment')) return 0;
        if (s.includes('yesterday')) return 1;
        
        const match = s.match(/(\d+)\s*(hour|day|week|month|year)/i);
        if (!match) return -1;
        
        const num = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        
        if (unit.startsWith('hour')) return 0;
        if (unit.startsWith('day')) return num;
        if (unit.startsWith('week')) return num * 7;
        if (unit.startsWith('month')) return num * 30;
        if (unit.startsWith('year')) return num * 365;
        
        return -1;
    }
    
    // ========================================
    // New UI Extraction
    // ========================================
    
    // Extract Job ID from data-view-tracking-scope attribute
    function extractJobIdFromTracking(element) {
        const trackingAttr = element.getAttribute('data-view-tracking-scope');
        if (!trackingAttr) return null;
        
        try {
            const trackingData = JSON.parse(trackingAttr);
            if (Array.isArray(trackingData) && trackingData[0]?.breadcrumb?.content?.data) {
                // Decode the Buffer array to string
                const bufferData = trackingData[0].breadcrumb.content.data;
                const jsonStr = String.fromCharCode.apply(null, bufferData);
                const parsed = JSON.parse(jsonStr);
                
                // Extract job ID from objectUrn like "urn:li:fs_normalized_jobPosting:4279939297"
                const urn = parsed?.jobPosting?.objectUrn;
                if (urn) {
                    const match = urn.match(/:(\d+)$/);
                    if (match) return match[1];
                }
            }
        } catch (e) {
            console.log('[LinkedIn Scraper] Failed to parse tracking data:', e.message);
        }
        return null;
    }
    
    function extractJobsFromNewUI() {
        const jobs = [];
        const seen = new Set();

        // Find job cards using the parent container with data-view-name
        const jobCardContainers = document.querySelectorAll('[data-view-name="job-search-job-card"]');
        console.log(`[LinkedIn Scraper] New UI: Found ${jobCardContainers.length} job card containers`);

        // Fallback to old method if no containers found
        const jobCards = jobCardContainers.length > 0 ? jobCardContainers : getNewUIJobCards();

        jobCards.forEach((card, index) => {
            try {
                // Try to extract Job ID from tracking data
                let jobId = extractJobIdFromTracking(card);

                // Also check child elements for tracking data
                if (!jobId) {
                    const trackingEl = card.querySelector('[data-view-tracking-scope]');
                    if (trackingEl) {
                        jobId = extractJobIdFromTracking(trackingEl);
                    }
                }

                const text = card.textContent || '';

                // ========================================
                // CLASS-BASED DOM EXTRACTION for New UI
                // Based on LinkedIn's class naming patterns:
                // - Title <p>: has class _91c4cb4c (heading style)
                // - Company <p>: has class _903d2b03 (company text style)
                // - Location <p>: has BOTH _06170c11 AND _2005bf80 directly
                // - Salary <p>: has class _73af0c6b with $ prefix
                // - Posted time: span._9141e2dc contains "Posted on..."
                // ========================================

                let title = '';
                let company = '';
                let location = '';
                let salary = '';
                let postedAgo = '';

                // Method 1: Extract Title from <p> with _91c4cb4c class
                const titleP = card.querySelector('p._91c4cb4c, p[class*="_91c4cb4c"]');
                if (titleP) {
                    // Prefer accessible text from span._9141e2dc
                    const accessibleSpan = titleP.querySelector('span._9141e2dc, span[class*="_9141e2dc"]');
                    if (accessibleSpan) {
                        title = accessibleSpan.textContent.trim()
                            .replace(/\s*\(Verified job\)\s*$/i, '')
                            .trim();
                    } else {
                        // Fallback to visible text
                        const visibleSpan = titleP.querySelector('span[aria-hidden="true"]');
                        if (visibleSpan) {
                            // Get text before the verified icon
                            const textNodes = [];
                            visibleSpan.childNodes.forEach(node => {
                                if (node.nodeType === Node.TEXT_NODE) {
                                    textNodes.push(node.textContent);
                                }
                            });
                            title = textNodes.join('').trim();
                        } else {
                            title = titleP.textContent.trim()
                                .replace(/\s*\(Verified job\)\s*$/i, '')
                                .replace(/\s*Verified.*$/, '')
                                .trim();
                        }
                    }
                }

                // Method 2: Extract Company from <p> with _903d2b03 class
                // Company <p> is typically inside a <div> with _2005bf80 class
                const companyP = card.querySelector('p._903d2b03, p[class*="_903d2b03"]');
                if (companyP) {
                    company = companyP.textContent.trim();
                }

                // Method 3: Extract Location from <p> that has BOTH _06170c11 AND _2005bf80 as classes
                // Location <p> has _2005bf80 directly on it (unlike company which has it on parent)
                const allPs = card.querySelectorAll('p');
                for (const p of allPs) {
                    const classes = p.className || '';
                    // Location has _06170c11, _2005bf80, and _69a4e1af
                    if (classes.includes('_06170c11') && classes.includes('_2005bf80') && classes.includes('_69a4e1af')) {
                        const locText = p.textContent.trim();
                        // Verify it looks like a location
                        if (/\b(Remote|Hybrid|On-site|United States|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i.test(locText)) {
                            location = locText;
                            break;
                        }
                    }
                }

                // Method 4: Extract Salary from <p> with _73af0c6b class and $ prefix
                const salaryPs = card.querySelectorAll('p._73af0c6b, p[class*="_73af0c6b"]');
                for (const p of salaryPs) {
                    const txt = p.textContent.trim();
                    if (/^\$[\d,]+/.test(txt)) {
                        salary = txt.match(/\$[\d,.]+[K]?(?:\/yr|\/hr|\/month)?(?:\s*[-–]\s*\$[\d,.]+[K]?(?:\/yr|\/hr|\/month)?)?/)?.[0] || txt;
                        break;
                    }
                }

                // Method 5: Extract Posted Time
                // Human-readable time like "1 day ago" is in span[aria-hidden="true"] inside a <p>
                const postedPs = card.querySelectorAll('p._4df28249, p[class*="_4df28249"]');
                for (const p of postedPs) {
                    const hiddenSpan = p.querySelector('span[aria-hidden="true"]');
                    if (hiddenSpan) {
                        const txt = hiddenSpan.textContent.trim();
                        if (/\d+\s*(minutes?|hours?|days?|weeks?|months?)\s*ago/i.test(txt)) {
                            postedAgo = txt;
                            break;
                        }
                    }
                }

                // ========================================
                // FALLBACK: Text-based extraction if class-based failed
                // ========================================
                
                if (!title) {
                    // Fallback: Look for "(Verified job)" pattern
                    const verifiedMatch = text.match(/^([^(]+?)\s*\(Verified job\)/);
                    if (verifiedMatch) {
                        title = verifiedMatch[1].trim();
                    }
                }

                if (!company) {
                    // Fallback: Company is often the text right after title in the DOM
                    // Try to find it from all <p> elements
                    for (const p of allPs) {
                        const txt = p.textContent.trim();
                        const classes = p.className || '';
                        // Company has _06170c11 but NOT _2005bf80 directly
                        if (classes.includes('_06170c11') && !classes.includes('_2005bf80') && 
                            txt.length > 1 && txt.length < 60 &&
                            txt !== title && txt !== location &&
                            !/\$|^\d+|Remote|Hybrid|On-site|United States|ago|benefit|alumni|connection|applicant|Viewed|Easy Apply/i.test(txt)) {
                            company = txt;
                            break;
                        }
                    }
                }

                if (!location) {
                    // Fallback: Pattern matching in full text
                    const locationPatterns = [
                        /(United States\s*\([^)]+\))/,
                        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2}\s*\([^)]+\))/,
                        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2})/,
                        /(Texas,\s*United States[^)]*\)?)/i
                    ];
                    for (const pattern of locationPatterns) {
                        const match = text.match(pattern);
                        if (match) {
                            location = match[1].trim();
                            break;
                        }
                    }
                }

                if (!salary) {
                    const salaryMatch = text.match(/\$[\d,]+[K]?(?:\/yr|\/hr)?(?:\s*[-–]\s*\$[\d,]+[K]?(?:\/yr|\/hr)?)?/);
                    if (salaryMatch) salary = salaryMatch[0];
                }

                // Check for special indicators
                const isTopApplicant = text.toLowerCase().includes('top applicant');
                const hasEasyApply = text.includes('Easy Apply');
                const hasConnections = text.toLowerCase().includes('connection') || text.includes('school alumni');

                // Use extracted Job ID or generate pseudo-ID
                const finalId = jobId || ('newui-' + Math.abs((company + title).split('').reduce((a, b) => {
                    a = ((a << 5) - a) + b.charCodeAt(0);
                    return a & a;
                }, 0)).toString(36));

                // Dedupe check
                const dedupeKey = getDedupeKey({company, title, location});
                if (seen.has(dedupeKey)) return;
                seen.add(dedupeKey);

                if (title && title.length > 3) {
                    // Generate link using the real job ID if available
                    const link = jobId
                        ? `https://www.linkedin.com/jobs/view/${jobId}/`
                        : '';

                    jobs.push({
                        id: finalId,
                        title: title.slice(0, 150),
                        company: (company || 'Unknown').slice(0, 100),
                        location: (location || 'Unknown').slice(0, 100),
                        salary: salary,
                        isTopApplicant,
                        hasEasyApply,
                        hasConnections,
                        postedAgo: postedAgo,
                        daysAgo: parsePostedAgo(postedAgo),
                        postedDate: '',
                        insight: '',
                        footer: '',
                        link: link,
                        extractedAt: new Date().toISOString(),
                        _source: jobId ? 'linkedin-new-ui' : 'linkedin-new-ui-fallback',
                        dedupeKey: dedupeKey
                    });

                    if (jobId) {
                        console.log(`[LinkedIn Scraper] ✓ ${title.slice(0, 40)}... @ ${company} (ID: ${jobId})`);
                    }
                }
            } catch(e) {
                console.error('[LinkedIn Scraper] New UI extraction error:', e);
            }
        });
        
        const withRealId = jobs.filter(j => !j.id.startsWith('newui-')).length;
        console.log(`[LinkedIn Scraper] New UI: Extracted ${jobs.length} jobs (${withRealId} with real IDs)`);
        return jobs;
    }
    
    // ========================================
    // Scrolling Container Detection
    // ========================================
    function findScrollContainer() {
        const uiVersion = detectUIVersion();
        
        // New UI: Find scroll container by tracing up from a job card
        if (uiVersion === 'new') {
            const jobCards = document.querySelectorAll('div[role="button"]');
            const jobCard = Array.from(jobCards).find(c => 
                c.textContent.includes('Verified job') || 
                c.textContent.includes('/yr') || 
                c.textContent.includes('Easy Apply')
            );
            
            if (jobCard) {
                // Trace up to find the scrollable container (usually 3-4 levels up)
                let parent = jobCard;
                for (let i = 0; i < 10; i++) {
                    parent = parent.parentElement;
                    if (!parent || parent === document.body) break;
                    
                    const style = window.getComputedStyle(parent);
                    const children = parent.querySelectorAll('div[role="button"]').length;
                    
                    // Look for container with overflow:auto, multiple job cards, and scrollable
                    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && 
                        children > 5 && 
                        parent.scrollHeight > parent.clientHeight + 50) {
                        console.log(`[LinkedIn Scraper] Found new UI scroll container at level ${i}`);
                        return parent;
                    }
                }
            }
            
            // Fallback: find any scrollable element with significant scroll height
            const allElements = document.querySelectorAll('div');
            for (const el of allElements) {
                const style = window.getComputedStyle(el);
                if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && 
                    el.scrollHeight > el.clientHeight + 500) {
                    const jobCards = el.querySelectorAll('div[role="button"]').length;
                    if (jobCards > 5) {
                        console.log('[LinkedIn Scraper] Found new UI scroll container via fallback');
                        return el;
                    }
                }
            }
        }
        
        // Classic UI: Use traditional selectors
        const jobList = document.querySelector('ul.scaffold-layout__list-container') ||
                       document.querySelector('ul[class*="scaffold-layout__list"]') ||
                       document.querySelector('.jobs-search-results-list ul');
        
        if (jobList) {
            let parent = jobList.parentElement;
            while (parent && parent !== document.body) {
                const style = window.getComputedStyle(parent);
                if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && 
                    parent.scrollHeight > parent.clientHeight) {
                    return parent;
                }
                parent = parent.parentElement;
            }
        }
        
        const selectors = ['.jobs-search-results-list', '.scaffold-layout__list', '.jobs-search-two-pane__results'];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.scrollHeight > el.clientHeight + 50) return el;
        }
        
        return null;
    }
    
    async function scrollToRenderAll(scrollContainer) {
        const uiVersion = detectUIVersion();
        const scrollAmount = 600;
        const maxScrolls = uiVersion === 'new' ? 30 : 20; // More scrolls for new UI
        const scrollDelay = uiVersion === 'new' ? 400 : 300; // Slower for new UI to let it load
        
        const countSelector = uiVersion === 'new' ? 
            () => getNewUIJobCards().length : 
            () => document.querySelectorAll('li[data-occludable-job-id] .job-card-container').length;
        
        const jobsBefore = countSelector();
        updateStatus('Scrolling to load jobs... (' + jobsBefore + ' visible)');
        console.log(`[LinkedIn Scraper] Starting scroll: container=${!!scrollContainer}, uiVersion=${uiVersion}`);
        
        let lastCount = jobsBefore;
        let noChangeCount = 0;
        
        for (let i = 0; i < maxScrolls; i++) {
            if (scrollContainer) {
                const prev = scrollContainer.scrollTop;
                scrollContainer.scrollTop += scrollAmount;
                
                // Check if scroll actually happened
                if (scrollContainer.scrollTop === prev) {
                    console.log(`[LinkedIn Scraper] Scroll ${i}: reached end (scrollTop stuck at ${prev})`);
                    noChangeCount++;
                    if (noChangeCount >= 3) break;
                } else {
                    noChangeCount = 0;
                }
            } else {
                window.scrollBy(0, scrollAmount);
            }
            
            await sleep(scrollDelay);
            
            const currentCount = countSelector();
            updateStatus(`Scrolling... ${currentCount} jobs loaded (scroll ${i+1}/${maxScrolls})`);
            
            // Check if we're still loading new jobs
            if (currentCount === lastCount) {
                noChangeCount++;
                if (noChangeCount >= 5) {
                    console.log(`[LinkedIn Scraper] No new jobs after ${noChangeCount} scrolls, stopping`);
                    break;
                }
            } else {
                noChangeCount = 0;
            }
            lastCount = currentCount;
        }
        
        // Scroll back to top
        if (scrollContainer) {
            scrollContainer.scrollTop = 0;
        } else {
            window.scrollTo(0, 0);
        }
        
        await sleep(300);
        
        const jobsAfter = countSelector();
        updateStatus('Loaded ' + jobsAfter + ' jobs, extracting...');
        console.log(`[LinkedIn Scraper] Scroll complete: ${jobsBefore} → ${jobsAfter} jobs`);
        await sleep(200);
    }
    
    function extractJobsFromClassicUI() {
        const jobs = [];
        const seen = new Set();
        const jobItems = document.querySelectorAll('li[data-occludable-job-id]');
        
        jobItems.forEach((item) => {
            try {
                const jobId = item.getAttribute('data-occludable-job-id');
                if (!jobId || seen.has(jobId)) return;
                
                const jobCard = item.querySelector('.job-card-container') || item.querySelector('[data-job-id]');
                if (!jobCard) return;
                
                seen.add(jobId);
                
                const titleEl = item.querySelector('.job-card-container__link') ||
                               item.querySelector('.job-card-list__title--link') ||
                               item.querySelector('a[href*="/jobs/view/"]');
                const title = titleEl ? titleEl.innerText.trim().split('\n')[0] : 'Unknown';
                
                const companyEl = item.querySelector('.artdeco-entity-lockup__subtitle span') ||
                                 item.querySelector('.job-card-container__primary-description');
                const company = companyEl ? companyEl.innerText.trim() : 'Unknown';
                
                const locationEl = item.querySelector('.artdeco-entity-lockup__caption li span') ||
                                  item.querySelector('.job-card-container__metadata-item');
                const location = locationEl ? locationEl.innerText.trim() : 'Unknown';
                
                const metadataEl = item.querySelector('.artdeco-entity-lockup__metadata li span');
                const salary = metadataEl ? metadataEl.innerText.trim() : '';
                
                const linkEl = item.querySelector('a[href*="/jobs/view/"]');
                let link = linkEl ? linkEl.href : `https://www.linkedin.com/jobs/view/${jobId}/`;
                if (link.includes('?')) link = link.split('?')[0];
                
                const topApplicantIcon = item.querySelector('li-icon[aria-label*="top applicant"]') ||
                                        item.querySelector('[aria-label*="top applicant"]');
                const insightEl = item.querySelector('.job-card-container__job-insight-text');
                const insight = insightEl ? insightEl.innerText.trim() : '';
                
                const isTopApplicant = !!(topApplicantIcon || insight.toLowerCase().includes('top applicant'));
                const hasEasyApply = !!item.querySelector('[data-test-icon="linkedin-bug-color-small"]') ||
                                    item.innerText.includes('Easy Apply');
                const hasConnections = insight.toLowerCase().includes('connection');
                
                const footerItems = item.querySelectorAll('.job-card-container__footer-item');
                const footer = Array.from(footerItems).map(f => f.innerText.trim()).join(', ');
                
                const timeEl = item.querySelector('time');
                let postedAgo = '';
                if (timeEl) {
                    postedAgo = timeEl.innerText.trim() || timeEl.getAttribute('datetime') || '';
                }
                if (!postedAgo) {
                    const timeMatch = footer.match(/(\d+\s*(hour|day|week|month|year)s?\s*ago|just\s*now|yesterday)/i);
                    if (timeMatch) postedAgo = timeMatch[0];
                }
                
                const daysAgo = parseRelativeTime(postedAgo);
                const postedDate = daysAgo >= 0 ? 
                    new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : '';
                
                if (title !== 'Unknown') {
                    const job = {
                        id: jobId, title: title.substring(0, 150), company: company.substring(0, 100),
                        location: location.substring(0, 100), salary: salary.substring(0, 100),
                        isTopApplicant, hasEasyApply, hasConnections,
                        postedAgo, daysAgo, postedDate,
                        insight, footer, link,
                        extractedAt: new Date().toISOString(),
                        _source: 'linkedin-classic-ui'
                    };
                    job.dedupeKey = getDedupeKey(job);
                    jobs.push(job);
                }
            } catch(e) {
                console.error('[LinkedIn Scraper] Classic UI extraction error:', e);
            }
        });
        
        return jobs;
    }
    
    // Unified extraction function
    function extractJobsFromPage() {
        const uiVersion = detectUIVersion();
        console.log(`[LinkedIn Scraper] Extracting from ${uiVersion} UI`);
        
        if (uiVersion === 'new') {
            return extractJobsFromNewUI();
        } else {
            return extractJobsFromClassicUI();
        }
    }
    
    // ========================================
    // Scraping Functions
    // ========================================
    async function quickScrape() {
        updateStatus(`${t('scraping')}...`);

        try {
            // Quick Scrape: Extract what's currently loaded in DOM
            // For classic UI, this gets the current page's visible jobs
            // For new UI, this gets what's currently rendered
            const jobs = extractJobsFromPage();
            console.log('[LinkedIn Scraper] Quick scrape: extracted', jobs.length, 'jobs');
            await outputJobs(jobs);
        } catch(e) {
            console.error('[LinkedIn Scraper] quickScrape error:', e);
            updateStatus('Error: ' + e.message);
        }
    }
    
    async function scrapeMinimumJobs(minCount) {
        updateStatus(`${t('scrapeAtLeast')} ${minCount}...`);
        const pageInfo = getPageInfo();

        if (pageInfo.uiVersion === 'new') {
            // New UI: scroll to load more jobs until reaching target
            const scrollContainer = findScrollContainer();
            if (scrollContainer) {
                await scrollToRenderAll(scrollContainer);
            }
            const jobs = extractJobsFromPage();
            console.log('[LinkedIn Scraper] Scrape At Least (new UI): extracted', jobs.length, 'jobs after scrolling');
            await outputJobs(jobs);
            return;
        }

        // Classic UI: paginate through pages
        const calculatedMax = Math.ceil(minCount / 20) + 2;
        const maxPages = Math.min(pageInfo.totalPages, calculatedMax);
        console.log(`[LinkedIn Scraper] minCount=${minCount}, totalPages=${pageInfo.totalPages}, calculatedMax=${calculatedMax}, maxPages=${maxPages}`);
        updateStatus(`Target: ${minCount} jobs, max ${maxPages} pages`);
        await sleep(500);
        await scrapeMultiplePages(maxPages, minCount);
    }
    
    async function scrapeMultiplePages(maxPages, minNewJobs = Infinity) {
        let allJobs = [];
        const scrollContainer = findScrollContainer();
        let page = 1;
        
        const accumulatedJobs = getAccumulatedJobs();
        const accumulatedKeys = new Set(accumulatedJobs.map(j => getDedupeKey(j)));
        
        console.log(`[LinkedIn Scraper] Starting: maxPages=${maxPages}, target=${minNewJobs} NEW jobs, accumulated=${accumulatedKeys.size}`);
        updateStatus(`Starting: max ${maxPages} pages, target ${minNewJobs} new jobs`);
        
        let trulyNewCount = 0;
        
        while (page <= maxPages && trulyNewCount < minNewJobs) {
            updateStatus('Page ' + page + ': scrolling...');
            
            await scrollToRenderAll(scrollContainer);
            const pageJobs = extractJobsFromPage();
            
            const collectedKeys = new Set(allJobs.map(j => getDedupeKey(j)));
            const newOnThisPage = pageJobs.filter(j => !collectedKeys.has(getDedupeKey(j)));
            const trulyNewOnThisPage = newOnThisPage.filter(j => !accumulatedKeys.has(getDedupeKey(j)));
            
            allJobs = allJobs.concat(newOnThisPage);
            trulyNewCount += trulyNewOnThisPage.length;
            
            updateStatus('Page ' + page + ': +' + trulyNewOnThisPage.length + ' new → ' + trulyNewCount + '/' + minNewJobs);
            console.log('[LinkedIn Scraper] Page ' + page + ': found ' + pageJobs.length + ', truly new: ' + trulyNewOnThisPage.length + ', total new: ' + trulyNewCount);
            
            if (trulyNewCount >= minNewJobs) {
                updateStatus('Target reached: ' + trulyNewCount + ' new jobs');
                break;
            }
            
            const nextBtn = document.querySelector('.jobs-search-pagination__button--next') ||
                           document.querySelector('button[aria-label="View next page"]');
            
            if (nextBtn && !nextBtn.disabled) {
                updateStatus('Going to page ' + (page + 1) + '...');
                nextBtn.click();
                await sleep(2500);
                if (scrollContainer) scrollContainer.scrollTop = 0;
                window.scrollTo(0, 0);
                await sleep(800);
                page++;
            } else {
                updateStatus('No more pages (found ' + trulyNewCount + ' new)');
                console.log('[LinkedIn Scraper] No more pages available');
                break;
            }
        }
        
        if (trulyNewCount >= minNewJobs) {
            console.log(`[LinkedIn Scraper] Stopped: reached target (${trulyNewCount} >= ${minNewJobs})`);
        } else if (page > maxPages) {
            console.log(`[LinkedIn Scraper] Stopped: reached maxPages limit (page ${page} > ${maxPages})`);
            updateStatus(`Max pages reached (${maxPages}), got ${trulyNewCount}/${minNewJobs}`);
        }
        
        await outputJobs(allJobs);
    }
    
    // ========================================
    // Output
    // ========================================
    async function outputJobs(newJobs) {
        console.log('[LinkedIn Scraper] outputJobs called with', newJobs.length, 'jobs');
        
        const existingJobs = getAccumulatedJobs();
        const { merged, newCount, duplicateCount } = mergeJobs(existingJobs, newJobs);

        merged.sort((a, b) => {
            if (a.isTopApplicant !== b.isTopApplicant) return b.isTopApplicant - a.isTopApplicant;
            if (a.hasConnections !== b.hasConnections) return b.hasConnections - a.hasConnections;
            const aDays = a.daysAgo >= 0 ? a.daysAgo : 999;
            const bDays = b.daysAgo >= 0 ? b.daysAgo : 999;
            if (aDays !== bDays) return aDays - bDays;
            if (a.hasEasyApply !== b.hasEasyApply) return b.hasEasyApply - a.hasEasyApply;
            return 0;
        });

        saveAccumulatedJobs(merged);
        updateAccumulatedDisplay();

        const topApplicantCount = merged.filter(j => j.isTopApplicant).length;
        const connectionsCount = merged.filter(j => j.hasConnections).length;
        const recentCount = merged.filter(j => j.daysAgo >= 0 && j.daysAgo <= 7).length;

        const json = JSON.stringify(merged, null, 2);
        let clipboardSuccess = false;
        try {
            await navigator.clipboard.writeText(json);
            clipboardSuccess = true;
            console.log('[LinkedIn Scraper] Clipboard: success');
        } catch(e) {
            console.log('[LinkedIn Scraper] Clipboard: failed', e.message);
        }

        updateStatus('✓ +' + newCount + ' new, ' + merged.length + ' total');

        const summaryLine = merged.length + ' jobs: ⭐' + topApplicantCount + ' 🔗' + connectionsCount + ' 🕐' + recentCount;
        const legend = '⭐=Top Applicant  🔗=Connections  🕐=Last 7 days';
        const clipboardStatus = clipboardSuccess ? '✓ Copied to clipboard' : '⚠ Clipboard failed';

        console.log('[LinkedIn Scraper] About to show confirm dialog...');
        
        let shouldDownload = false;
        try {
            shouldDownload = confirm(
                '📊 ' + summaryLine + '\n' +
                legend + '\n\n' +
                clipboardStatus + '\n\n' +
                'Download JSON file?'
            );
            console.log('[LinkedIn Scraper] User chose:', shouldDownload ? 'download' : 'cancel');
        } catch(e) {
            console.error('[LinkedIn Scraper] Confirm dialog error:', e);
        }

        if (shouldDownload) {
            downloadJSON(merged);
        }

        return merged;
    }
    
    function downloadJSON(jobs) {
        const json = JSON.stringify(jobs, null, 2);
        const blob = new Blob([json], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0];
        const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
        const filename = `linkedin-jobs-${dateStr}-${timeStr}.json`;
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        updateStatus(`✓ ${t('downloaded')}: ${filename}`);
    }
    
})();
