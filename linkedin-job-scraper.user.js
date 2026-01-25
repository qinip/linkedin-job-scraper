// ==UserScript==
// @name         LinkedIn Job Scraper
// @namespace    https://linkedin.com/
// @version      0.1
// @description  Scrape LinkedIn jobs with accumulation, deduplication, and multi-language support
// @author       Eddy Ji
// @match        *://www.linkedin.com/jobs/*
// @match        *://www.linkedin.com/jobs/collections/*
// @match        *://www.linkedin.com/jobs/search/*
// @run-at       document-end
// @grant        none
// @license      MIT
// @homepageURL  https://github.com/eddyji/linkedin-job-scraper
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
    
    console.log('[LinkedIn Scraper v0.1] Script loaded!');
    
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
    // This handles LinkedIn's multiple job IDs for same position
    function getDedupeKey(job) {
        const company = (job.company || '').toLowerCase().trim();
        const title = (job.title || '').toLowerCase().trim();
        // Remove work mode suffix like "(Hybrid)", "(On-site)", "(Remote)"
        const baseLocation = (job.location || '').replace(/\s*\(.*?\)\s*$/, '').toLowerCase().trim();
        return `${company}|||${title}|||${baseLocation}`;
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
        
        return { currentPage, totalPages, estimatedTotal, visibleJobs };
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
            background: '#0a66c2',
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
        title.textContent = '🔍 ' + t('title') + ' v0.1';
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
        
        // Scrape All button
        const scrapeAllBtn = createButton('ljs-scrape-all', 
            t('scrapeAll') + ' (~' + pageInfo.estimatedTotal + ' ' + t('jobs') + ', ' + pageInfo.totalPages + ' ' + t('pages') + ')',
            {width: '100%', padding: '12px', margin: '5px 0', background: 'white', color: '#0a66c2', fontWeight: 'bold', fontSize: '14px', display: 'block'}
        );
        panel.appendChild(scrapeAllBtn);
        
        // Scrape minimum row
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
        
        // Quick scrape button
        const quickBtn = createButton('ljs-quick', '', {width: '100%', padding: '10px', margin: '5px 0', background: 'rgba(255,255,255,0.2)', fontSize: '13px', textAlign: 'left', display: 'block'});
        const quickLine1 = document.createElement('div');
        quickLine1.textContent = t('quickScrape') + ' (' + t('currentlyVisible') + ' ~' + pageInfo.visibleJobs + ')';
        const quickLine2 = document.createElement('div');
        quickLine2.textContent = '💡 ' + t('zoomTip');
        quickLine2.style.fontSize = '10px';
        quickLine2.style.opacity = '0.8';
        quickLine2.style.marginTop = '2px';
        quickBtn.appendChild(quickLine1);
        quickBtn.appendChild(quickLine2);
        panel.appendChild(quickBtn);
        
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
        console.log('[LinkedIn Scraper] Panel created!');
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
            createUI(); // Rebuild UI with new language
        };
        document.getElementById('ljs-scrape-all').onclick = () => scrapeAllPages();
        document.getElementById('ljs-scrape-min').onclick = () => {
            const minCount = parseInt(document.getElementById('ljs-min-count').value) || 50;
            scrapeMinimumJobs(minCount);
        };
        document.getElementById('ljs-quick').onclick = () => quickScrape();
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
            const info = getPageInfo();
            const quickBtn = document.getElementById('ljs-quick');
            if (quickBtn) {
                // Clear and rebuild inner content
                quickBtn.innerHTML = '';
                const line1 = document.createElement('div');
                line1.textContent = t('quickScrape') + ' (' + t('currentlyVisible') + ' ~' + info.visibleJobs + ')';
                const line2 = document.createElement('div');
                line2.textContent = '💡 ' + t('zoomTip');
                line2.style.fontSize = '10px';
                line2.style.opacity = '0.8';
                line2.style.marginTop = '2px';
                quickBtn.appendChild(line1);
                quickBtn.appendChild(line2);
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
        
        if (unit.startsWith('hour')) return 0; // Same day
        if (unit.startsWith('day')) return num;
        if (unit.startsWith('week')) return num * 7;
        if (unit.startsWith('month')) return num * 30;
        if (unit.startsWith('year')) return num * 365;
        
        return -1;
    }
    
    // ========================================
    // Scrolling & Extraction
    // ========================================
    function findScrollContainer() {
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
        const scrollAmount = 500;
        const maxScrolls = 20;
        
        // Show scroll status
        const jobsBefore = document.querySelectorAll('li[data-occludable-job-id] .job-card-container').length;
        updateStatus('Scrolling to load jobs... (' + jobsBefore + ' visible)');
        
        for (let i = 0; i < maxScrolls; i++) {
            if (scrollContainer) {
                const prev = scrollContainer.scrollTop;
                scrollContainer.scrollTop += scrollAmount;
                if (scrollContainer.scrollTop === prev) {
                    console.log('[LinkedIn Scraper] Reached end of scroll');
                    break;
                }
            } else {
                window.scrollBy(0, scrollAmount);
            }
            
            // Update status with current count
            const currentCount = document.querySelectorAll('li[data-occludable-job-id] .job-card-container').length;
            updateStatus('Scrolling... ' + currentCount + ' jobs loaded');
            
            await sleep(300);
        }
        
        // Scroll back to top
        if (scrollContainer) scrollContainer.scrollTop = 0;
        else window.scrollTo(0, 0);
        
        const jobsAfter = document.querySelectorAll('li[data-occludable-job-id] .job-card-container').length;
        updateStatus('Loaded ' + jobsAfter + ' jobs, extracting...');
        await sleep(200);
    }
    
    function extractJobsFromPage() {
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
                
                // Extract posted time from footer or time element
                const timeEl = item.querySelector('time');
                let postedAgo = '';
                if (timeEl) {
                    postedAgo = timeEl.innerText.trim() || timeEl.getAttribute('datetime') || '';
                }
                // Also check footer for time info (e.g., "2 weeks ago", "1 month ago")
                if (!postedAgo) {
                    const timeMatch = footer.match(/(\d+\s*(hour|day|week|month|year)s?\s*ago|just\s*now|yesterday)/i);
                    if (timeMatch) postedAgo = timeMatch[0];
                }
                
                // Parse relative time to days
                const daysAgo = parseRelativeTime(postedAgo);
                
                // Calculate approximate posted date
                const postedDate = daysAgo >= 0 ? 
                    new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : '';
                
                if (title !== 'Unknown') {
                    const job = {
                        id: jobId, title: title.substring(0, 150), company: company.substring(0, 100),
                        location: location.substring(0, 100), salary: salary.substring(0, 100),
                        isTopApplicant, hasEasyApply, hasConnections,
                        postedAgo, daysAgo, postedDate,
                        insight, footer, link,
                        extractedAt: new Date().toISOString()
                    };
                    // Add dedupe key for debugging (company + title + base location)
                    job.dedupeKey = getDedupeKey(job);
                    jobs.push(job);
                }
            } catch(e) {
                console.error('[LinkedIn Scraper] Error:', e);
            }
        });
        
        return jobs;
    }
    
    // ========================================
    // Scraping Functions
    // ========================================
    async function quickScrape() {
        updateStatus(`${t('scraping')}...`);
        const jobs = extractJobsFromPage();
        await outputJobs(jobs);
    }
    
    async function scrapeAllPages() {
        const pageInfo = getPageInfo();
        await scrapeMultiplePages(pageInfo.totalPages, Infinity);
    }
    
    async function scrapeMinimumJobs(minCount) {
        updateStatus(`${t('scrapeAtLeast')} ${minCount}...`);
        const pageInfo = getPageInfo();
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
        
        // Get already accumulated job dedupe keys to skip
        const accumulatedJobs = getAccumulatedJobs();
        const accumulatedKeys = new Set(accumulatedJobs.map(j => getDedupeKey(j)));
        
        console.log(`[LinkedIn Scraper] Starting: maxPages=${maxPages}, target=${minNewJobs} NEW jobs, accumulated=${accumulatedKeys.size}`);
        updateStatus(`Starting: max ${maxPages} pages, target ${minNewJobs} new jobs`);
        
        // Count truly new jobs (not in accumulated)
        let trulyNewCount = 0;
        
        while (page <= maxPages && trulyNewCount < minNewJobs) {
            updateStatus('Page ' + page + ': scrolling...');
            
            await scrollToRenderAll(scrollContainer);
            const pageJobs = extractJobsFromPage();
            
            // Dedupe against: 1) already collected this session, 2) already accumulated
            // Using dedupe keys (company + title + base location) instead of job IDs
            const collectedKeys = new Set(allJobs.map(j => getDedupeKey(j)));
            const newOnThisPage = pageJobs.filter(j => !collectedKeys.has(getDedupeKey(j)));
            const trulyNewOnThisPage = newOnThisPage.filter(j => !accumulatedKeys.has(getDedupeKey(j)));
            
            allJobs = allJobs.concat(newOnThisPage);
            trulyNewCount += trulyNewOnThisPage.length;
            
            updateStatus('Page ' + page + ': +' + trulyNewOnThisPage.length + ' new → ' + trulyNewCount + '/' + minNewJobs);
            console.log('[LinkedIn Scraper] Page ' + page + ': found ' + pageJobs.length + ', truly new: ' + trulyNewOnThisPage.length + ', total new: ' + trulyNewCount);
            
            // Check if we have enough NEW jobs
            if (trulyNewCount >= minNewJobs) {
                updateStatus('Target reached: ' + trulyNewCount + ' new jobs');
                break;
            }
            
            // Try next page
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
        
        // Log why loop ended
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
        const existingJobs = getAccumulatedJobs();
        const { merged, newCount, duplicateCount } = mergeJobs(existingJobs, newJobs);
        
        // Sort by: Top Applicant > Connections > Recency (newer first) > Easy Apply
        merged.sort((a, b) => {
            // Priority 1: Top Applicant
            if (a.isTopApplicant !== b.isTopApplicant) return b.isTopApplicant - a.isTopApplicant;
            // Priority 2: Has Connections
            if (a.hasConnections !== b.hasConnections) return b.hasConnections - a.hasConnections;
            // Priority 3: Recency (fewer days ago = newer = higher priority)
            const aDays = a.daysAgo >= 0 ? a.daysAgo : 999;
            const bDays = b.daysAgo >= 0 ? b.daysAgo : 999;
            if (aDays !== bDays) return aDays - bDays;
            // Priority 4: Easy Apply
            if (a.hasEasyApply !== b.hasEasyApply) return b.hasEasyApply - a.hasEasyApply;
            return 0;
        });
        
        saveAccumulatedJobs(merged);
        updateAccumulatedDisplay();
        
        const topApplicantCount = merged.filter(j => j.isTopApplicant).length;
        const connectionsCount = merged.filter(j => j.hasConnections).length;
        const recentCount = merged.filter(j => j.daysAgo >= 0 && j.daysAgo <= 7).length; // Last 7 days
        
        const json = JSON.stringify(merged, null, 2);
        let clipboardSuccess = false;
        try {
            await navigator.clipboard.writeText(json);
            clipboardSuccess = true;
        } catch(e) {}
        
        updateStatus('✓ +' + newCount + ' new, ' + merged.length + ' total');
        
        // Summary with legend
        const summaryLine = merged.length + ' jobs: ⭐' + topApplicantCount + ' 🔗' + connectionsCount + ' 🕐' + recentCount;
        const legend = '⭐=Top Applicant  🔗=Connections  🕐=Last 7 days';
        const clipboardStatus = clipboardSuccess ? '✓ Copied to clipboard' : '⚠ Clipboard failed';
        
        // Simple confirm dialog with legend
        const shouldDownload = confirm(
            '📊 ' + summaryLine + '\n' +
            legend + '\n\n' +
            clipboardStatus + '\n\n' +
            'Download JSON file?'
        );
        
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
