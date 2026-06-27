// DEBUG: This log should appear as soon as the file is loaded by the browser.
console.log('File loaded: script.js');

window.arwaiAnnotationCache = window.arwaiAnnotationCache || {};

/**
 * A formatter to display the annotation ID label.
 * This version is more robust for Safari compatibility.
 */
const arwaiIdFormatter = function(annotation) {
  const idBody = annotation.body.find(b => b.purpose === 'arwai-AnnotationID');

  if (idBody) {
    // 1. Create the SVG <foreignObject> wrapper
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');

    // 2. Create the HTML <label> element using the correct XHTML namespace
    const label = document.createElementNS('http://www.w3.org/1999/xhtml', 'label');
    label.textContent = idBody.value;

    // 3. Platform detection helpers
    function isIOS() {
      return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    }

    function isMacSafari() {
      return /Macintosh/.test(navigator.userAgent) &&
             /Safari/.test(navigator.userAgent) &&
             /Apple Computer/.test(navigator.vendor) &&
             !/Chrome/.test(navigator.userAgent) &&
             !/Firefox/.test(navigator.userAgent);
    }

    function isFirefoxMobile() {
      return /Android/.test(navigator.userAgent) && /Firefox/.test(navigator.userAgent);
    }

    // 4. Apply conditional styling for limited platforms
    if (isIOS() || isMacSafari() || isFirefoxMobile()) {
      foreignObject.setAttribute('width', '24');
      foreignObject.setAttribute('height', '24');
      foreignObject.setAttribute('style', 'transform: translate(-12px, -12px);');
      foreignObject.style.transformOrigin = 'center center';
      // Firefox requires explicit display and dimensions on the inner label element
      label.setAttribute('style', 'display: block; width: 24px; height: 24px;');
    } else {
      foreignObject.setAttribute('width', '24');
      foreignObject.setAttribute('height', '24');
      label.setAttribute('width', '1');
      label.setAttribute('height', '1');
      // Firefox requires explicit display and dimensions on the inner label element
      label.setAttribute('style', 'display: block; width: 24px; height: 24px; transform: translate(-12px, -12px);');
    }

    // 5. Append the HTML label inside the SVG wrapper
    foreignObject.appendChild(label);

    // 6. Return the element for Annotorious to render
    return { element: foreignObject };
  }

  return null;
};


/**
 * A single, combined formatter to handle annotation styling.
 */
const arwaiStyleFormatter = function(annotation) {
    const isImportant = annotation.body.find(b =>
        b.purpose === 'tagging' && (b.value.toLowerCase() === 'important' || b.value.toLowerCase() === 'importante')
    );
    if (isImportant) return { className: 'important' };

    const hasTags = annotation.body.find(b => b.purpose === 'tagging');
    if (hasTags) return { className: 'tagged' };

    return null;
};

/**
 * A helper function to convert a date into a simple, relative time string.
 * It displays only the largest single time unit.
 */
function formatTimeAgo(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 5) {
    return "just now";
  }

  let interval = seconds / 31536000; // Years
  if (interval > 1) {
    const value = Math.floor(interval);
    return value === 1 ? "1 year ago" : `${value} years ago`;
  }
  
  interval = seconds / 2592000; // Months
  if (interval > 1) {
    const value = Math.floor(interval);
    return value === 1 ? "1 month ago" : `${value} months ago`;
  }
  
  interval = seconds / 86400; // Days
  if (interval > 1) {
    const value = Math.floor(interval);
    return value === 1 ? "1 day ago" : `${value} days ago`;
  }
  
  interval = seconds / 3600; // Hours
  if (interval > 1) {
    const value = Math.floor(interval);
    return value === 1 ? "1 hour ago" : `${value} hours ago`;
  }
  
  interval = seconds / 60; // Minutes
  if (interval > 1) {
    const value = Math.floor(interval);
    return value === 1 ? "1 minute ago" : `${value} minutes ago`;
  }
  
  // Default to seconds if less than a minute
  const value = Math.floor(seconds);
  return value === 1 ? "1 second ago" : `${value} seconds ago`;
}


document.addEventListener('DOMContentLoaded', function() {
    console.log('Document ready. Starting viewer initialization.');

    if (typeof Arwai_Annotator_Data === 'undefined') {
        console.error('Arwai_Annotator_Data is not defined.');
        return;
    }

    // --- 1. GLOBAL VARIABLES & SELECTORS ---
    const { containerId, images, post_id, ajax_url, rest_url, restNonce, anno_options } = Arwai_Annotator_Data;
    const container = document.getElementById(containerId);
    if (!container || images.length === 0) return;

    // Simple Viewer elements
    const currentIndexSpan = container.querySelector('.arwai-simple-current-index');
    const slideNav = container.querySelector('.arwai-simple-viewer-nav');

    const mainSwiperEl = container.querySelector('.arwai-main-swiper');
    const thumbSwiperEl = container.querySelector('.arwai-thumb-swiper');

    let mainSwiperInstance = null;
    let thumbSwiperInstance = null;
    let mainImage; // This will be redefined on slide change
    
    // Shared / OSD elements
    const toggleButtons = document.querySelectorAll('#arwai-toggle-annotations, #arwai-toggle-annotations-osd');
    const launchOsdButton = document.getElementById('arwai-launch-osd');
    const osdModal = document.getElementById('arwai-osd-modal');
    const osdCloseButton = document.getElementById('arwai-osd-close');

    // History elements
    const historyButton = document.getElementById('arwai-history');
    const historySidebar = document.getElementById('arwai-history-sidebar');
    const historyCloseBtn = document.getElementById('arwai-close-history');
    const historyFeedContent = document.getElementById('arwai-history-feed-content');

    // Move sidebar to body to avoid flex/overflow clipping
    if (historySidebar) {
        document.body.appendChild(historySidebar);
        // Override absolute positioning to fixed since it's now on body
        historySidebar.style.position = 'fixed';
        historySidebar.style.right = '0';
        historySidebar.style.zIndex = '999999';
    }

    function updateSidebarPosition() {
        if (!historyVisible || !historySidebar || !container) return;
        const viewerRect = container.getBoundingClientRect();
        historySidebar.style.top = viewerRect.top + 'px';
        historySidebar.style.height = viewerRect.height + 'px';
    }

    window.addEventListener('scroll', updateSidebarPosition);
    window.addEventListener('resize', updateSidebarPosition);


    // --- SELECTORS FOR THE SINGLE ANNOTATION DISPLAY ---
    const singleAnnotationContainer = document.getElementById('arwai-single-annotation-container');
    const singleAnnotationList = document.getElementById('arwai-single-annotation');


    // --- 2. STATE MANAGEMENT ---
    let currentIndex = 0;
    let simpleAnno = null; // Annotorious instance for the simple viewer
    let osdViewer = null;  // OpenSeadragon viewer instance
    let osdAnno = null;    // Annotorious instance for OSD
    let annotationsVisible = false;
    let historyVisible = false;
    let highlightedAnnotation = null; 
    let initRafId = null;


    // --- CUSTOM HISTORY WIDGET FOR ANNOTORIOUS ---
    const HistoryWidget = function(args) {
        const annotationId = args.annotation ? args.annotation.id : null;
        const container = document.createElement('div');
        container.className = 'r6o-widget arwai-history-widget';

        if (!annotationId) {
            return container; // Do not show widget on new, unsaved annotations
        }

        const button = document.createElement('button');
        button.className = 'r6o-btn';
        button.innerHTML = '<span data-feather="clock" style="width:14px;height:14px;margin-right:5px;vertical-align:middle;"></span>View History';
        button.style.width = '100%';
        button.style.textAlign = 'left';
        button.style.background = '#f9f9f9';
        button.style.color = '#333';
        button.style.borderTop = '1px solid #e5e5e5';
        button.style.borderBottom = 'none';
        button.style.borderLeft = 'none';
        button.style.borderRight = 'none';
        button.style.padding = '8px 12px';
        button.style.cursor = 'pointer';
        button.style.outline = 'none';

        const historyContainer = document.createElement('div');
        historyContainer.style.display = 'none';
        historyContainer.style.padding = '10px';
        historyContainer.style.background = '#fafafa';
        historyContainer.style.borderTop = '1px solid #e5e5e5';
        historyContainer.style.maxHeight = '150px';
        historyContainer.style.overflowY = 'auto';
        historyContainer.style.fontSize = '12px';

        button.addEventListener('click', function(e) {
            e.preventDefault();
            if (historyContainer.style.display === 'block') {
                historyContainer.style.display = 'none';
                button.innerHTML = '<span data-feather="clock" style="width:14px;height:14px;margin-right:5px;vertical-align:middle;"></span>View History';
                if (typeof feather !== 'undefined') feather.replace();
                return;
            }

            historyContainer.style.display = 'block';
            button.innerHTML = '<span data-feather="chevron-up" style="width:14px;height:14px;margin-right:5px;vertical-align:middle;"></span>Hide History';
            if (typeof feather !== 'undefined') feather.replace();

            historyContainer.innerHTML = '<div style="text-align:center;">Loading...</div>';

            const url = new URL(ajax_url);
            url.searchParams.append('action', 'arwai_get_annotorious_history');
            url.searchParams.append('annotation_id', annotationId);

            fetch(url)
                .then(res => res.json())
                .then(response => {
                    if (response.success && response.data.history && response.data.history.length > 0) {
                        let html = '';

                        for (let i = 0; i < response.data.history.length; i++) {
                            const item = response.data.history[i];
                            const dateStr = new Date(item.timestamp).toLocaleString();
                            const diffText = item.diffText || '';

                            html += `
                                <div style="margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 5px;">
                                    <strong style="color:#0073aa;">${item.userName}</strong>
                                    <div style="color:#888; font-size:10px;">${dateStr}</div>
                                    <div style="margin-top:2px;">${diffText}</div>
                                </div>
                            `;
                        }
                        historyContainer.innerHTML = html;
                    } else {
                        historyContainer.innerHTML = '<div style="color:#888;">No history found.</div>';
                    }
                })
                .catch(() => {
                    historyContainer.innerHTML = '<div style="color:red;">Error loading history.</div>';
                });
        });

        container.appendChild(button);
        container.appendChild(historyContainer);

        // Render feather icon in widget
        setTimeout(() => { if (typeof feather !== 'undefined') feather.replace(); }, 10);

        return container;
    }


    // --- 3. SHARED & HELPER FUNCTIONS ---

    // --- RESPONSIVE IMAGE LOADER FOR SWIPER ---
    function handleResponsiveSliderImages() {
        if (window.innerWidth > 767 && mainSwiperEl) {
            const images = mainSwiperEl.querySelectorAll('img[data-large-src]');
            images.forEach(img => {
                const largeSrc = img.getAttribute('data-large-src');
                const currentSrc = img.getAttribute('src');
                if (largeSrc && largeSrc !== currentSrc) {
                    img.setAttribute('src', largeSrc);
                }
            });
        }
    }

    // Run the function on initial page load
    handleResponsiveSliderImages();

    // Re-run the function when the window is resized to handle orientation changes or browser resizing.
    window.addEventListener('resize', handleResponsiveSliderImages);

    /**
     * Requirement 5: Responsive Window Resizing
     * Triggers forced recalculation of annotations on window resize.
     */
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function() {
            // Check if Simple Viewer is active and notes are visible
            if (osdModal && osdModal.style.display === 'none' && annotationsVisible && simpleAnno && mainImage) {
                const img = mainImage;
                if (img && img.clientWidth > 0) {
                    const attachmentId = mainImage.getAttribute('data-attachment-id');
                    const cachedData = window.arwaiAnnotationCache[attachmentId];
                    if (cachedData) {
                        simpleAnno.clearAnnotations();
                        simpleAnno.setAnnotations(cachedData);
                    }
                }
            }
        }, 200);
    });

    // Generic function to load annotations from the server into ANY Annotorious instance
    function loadAnnotations(attachmentId, annoInstance) {
        if (!annoInstance || !attachmentId) return;
        annoInstance.clearAnnotations();

        if (window.arwaiAnnotationCache[attachmentId]) {
            annoInstance.setAnnotations(window.arwaiAnnotationCache[attachmentId]);
            return;
        }

        const restUrl = (Arwai_Annotator_Data && Arwai_Annotator_Data.rest_url) ? Arwai_Annotator_Data.rest_url : '/wp-json/';
        fetch(`${restUrl}arwai/v1/annotations/${attachmentId}`)
            .then(response => response.json())
            .then(annotations => {
                if (Array.isArray(annotations)) {
                    window.arwaiAnnotationCache[attachmentId] = annotations;
                    annoInstance.setAnnotations(annotations);
                }
            })
            .catch(error => console.error('Error loading annotations:', error));
    }

    const escapeHTML = (str) => {
        if (!str) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    };

    // ### SINGLE ANNOTATION DISPLAY ###
    function updateSingleAnnotationDisplay(annotation) {
        if (!singleAnnotationContainer) return;

        if (!annotation) {
            singleAnnotationContainer.style.display = 'none';
            singleAnnotationList.innerHTML = '';
            return;
        }

        const idBody = annotation.body.find(b => b.purpose === 'arwai-AnnotationID');
        const annotationId = idBody ? idBody.value : 'N/A';
        const tagBodies = annotation.body.filter(b => b.purpose === 'tagging');

        const footerStyle = tagBodies.length === 0 ? 'style="display: none;"' : '';
        
        const tagLinks = anno_options.tagLinks || {};
        const tagsHtml = tagBodies.map(body => {
            const rawTagName = body.value;
            const tagName = escapeHTML(rawTagName);
            return tagLinks[rawTagName]
                ? `<button class="arwai-anno-single-tag arwai-tag"><a href="${escapeHTML(tagLinks[rawTagName])}" class="arwai-anno-single-tag-link">${tagName}</a></button>`
                : `<span class="arwai-anno-single-tag arwai-tag">${tagName}</span>`;
        }).join(' ');

        const commentBodies = annotation.body.filter(b => b.purpose === 'commenting' || b.purpose === 'replying');
        let commentsHtml = '<p class="arwai-empty-comment"><em>Empty comment</em></p>'; // Default message
        if (commentBodies.length > 0) {
            commentsHtml = '<ul class="arwai-anno-single-comments">'; // Add target class
            commentBodies.forEach(body => {
                const creator = body.creator || annotation.creator;
                const creatorName = escapeHTML(creator ? (creator.name || creator.displayName) : 'Unknown');
                const dateValue = body.created || annotation.created;

              let createdDate = ''; // Default to empty

                if (dateValue) {
                    const timeAgoString = escapeHTML(formatTimeAgo(dateValue));
                    const isoDate = escapeHTML(new Date(dateValue).toISOString());
                    createdDate = `<time class="timeago" datetime="${isoDate}">${timeAgoString}</time>`;
                }

                const commentText = escapeHTML(body.value || 'Empty comment');
                commentsHtml += `
                <li class="arwai-anno-single-comment-item">
                    <p>${commentText}</p>
                    <div class="arwai-anno-single-comment-meta">
                    ${creatorName}: 
                    ${createdDate}
                    </div>
                </li>`;
            });
            commentsHtml += '</ul>';
        }

        const newHtml = `
            <li data-id="${escapeHTML(annotationId)}">
                <div class="arwai-anno-single-item">
                    <div class="arwai-anno-single-header">
                        <span> ${escapeHTML(annotationId)}</span>
                    </div>
                    <div>
                        <div class="arwai-anno-single-body">${commentsHtml}</div>
                        <div class="arwai-anno-single-footer" ${footerStyle}>
                            ${tagsHtml}
                        </div>
                    </div>
                </div>
            </li>

                <div>
                    <button id="arwai-close-single-annotation" class="arwai-btn" title="Close">
                        <i data-feather="x-circle"></i>    
                    </button>
                    
                </div>  
        `;
        
        singleAnnotationList.innerHTML = newHtml;

        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        const style = arwaiStyleFormatter(annotation);
        Array.from(singleAnnotationContainer.classList).forEach(className => {
            if (className.startsWith('is-')) {
                singleAnnotationContainer.classList.remove(className);
            }
        });

        if (style && style.className) {
            const idBody = annotation.body.find(b => b.purpose === 'arwai-AnnotationID');
            if (idBody) {
                const specificListItem = singleAnnotationList.querySelector(`li[data-id="${idBody.value}"]`);
                singleAnnotationContainer.classList.add('is-' + style.className);
                if (specificListItem) {
                    specificListItem.classList.add('is-' + style.className);
                }
            }
        }
        
        singleAnnotationContainer.style.display = 'block';
    }



    /**
     * Shared helper function to handle CRUD events (create, update, delete)
     * and keep the window.arwaiAnnotationCache in sync.
     */
    function handleAnnotationCRUD(action, annotation, annoInstance) {
        let attachmentId;
        let iiifSourceUrl;
        if (annoInstance === osdAnno) {
            const currentImage = images[osdViewer.currentPage()];
            attachmentId = currentImage.post_id;
            iiifSourceUrl = currentImage.iiif_source_url;
        } else {
            attachmentId = mainImage.getAttribute('data-attachment-id');
            const currentImageData = images.find(img => img.post_id === attachmentId);
            iiifSourceUrl = currentImageData ? currentImageData.iiif_source_url : '';
        }

        if (!attachmentId) return;

        const syncCache = () => {
            window.arwaiAnnotationCache[attachmentId] = annoInstance.getAnnotations();
        };

        const restUrl = (Arwai_Annotator_Data && Arwai_Annotator_Data.rest_url) ? Arwai_Annotator_Data.rest_url : '/wp-json/';

        if (action === 'create' || action === 'update') {
            const sendRequest = (annot) => {
                const payload = {
                    annotation: JSON.stringify(annot),
                    iiif_source_url: iiifSourceUrl,
                    post_id: post_id
                };

                let endpoint = `${restUrl}arwai/v1/annotations/${attachmentId}`;
                let method = 'POST';

                if (action === 'update') {
                    endpoint += `/${encodeURIComponent(annot.id)}`;
                    method = 'PUT';
                }

                fetch(endpoint, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-WP-Nonce': anno_options.annoNonce
                    },
                    body: JSON.stringify(payload)
                })
                .then(response => {
                    if (!response.ok) throw new Error('Network response was not ok');
                    return response.json();
                })
                .then(data => {
                    if (action === 'create' && data.annotation) {
                        annoInstance.removeAnnotation(annot);
                        annoInstance.addAnnotation(data.annotation);
                    }
                    syncCache();
                })
                .catch(error => console.error(`Error saving annotation (${action}):`, error));
            };

            sendRequest(annotation);
        } else if (action === 'delete') {
            const endpoint = `${restUrl}arwai/v1/annotations/${attachmentId}/${encodeURIComponent(annotation.id)}`;
            const payload = {
                annotation: JSON.stringify(annotation),
                post_id: post_id
            };

            fetch(endpoint, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'X-WP-Nonce': anno_options.annoNonce
                },
                body: JSON.stringify(payload)
            })
            .then(response => {
                if (!response.ok) throw new Error('Network response was not ok');
                syncCache();
            })
            .catch(error => console.error('Error deleting annotation:', error));
        }
    }

    function attachEventHandlers(annoInstance) {
        annoInstance.on('createAnnotation', function(annotation) {
            handleAnnotationCRUD('create', annotation, annoInstance);
        });

        annoInstance.on('updateAnnotation', function(annotation) {
            handleAnnotationCRUD('update', annotation, annoInstance);
        });

        annoInstance.on('deleteAnnotation', function(annotation) {
            handleAnnotationCRUD('delete', annotation, annoInstance);
        });
        
        annoInstance.on('selectAnnotation', function(annotation, element) {
            if (annoInstance === simpleAnno) {
                updateSingleAnnotationDisplay(annotation);
            }
            highlightedAnnotation = annotation;

            if (historyVisible) {
                fetchAndRenderHistory(annotation);
            }
        });

        annoInstance.on('cancelSelected', function() {
            highlightedAnnotation = null;
            if (singleAnnotationContainer) singleAnnotationContainer.style.display = 'none';

            if (historyVisible) {
                clearHistorySidebar();
            }
        });




        annoInstance.on('cancelSelected', function() {
            if (highlightedAnnotation) {
                highlightedAnnotation.classList.remove('is-highlighted');
                highlightedAnnotation = null;
            }
            updateSingleAnnotationDisplay(null);
        });
    }

    document.addEventListener('click', function(e) {
        if (e.target.closest('#arwai-close-single-annotation')) {
            const activeAnno = osdViewer ? osdAnno : simpleAnno;

            if (activeAnno?.cancelSelected) {
                activeAnno.cancelSelected();
            }
            // Optional: hide the container manually
            if (singleAnnotationContainer) singleAnnotationContainer.style.display = 'none';
            if (singleAnnotationList) singleAnnotationList.innerHTML = '';
        }
    });

        // ---  Nav button Popup LOGIC ---

    const infoButton = document.getElementById('arwai-information');
    const infoPopup = document.getElementById('info-popup');
    const closeButton = document.getElementById('close-info-popup');

    if (infoButton && infoPopup) {
        infoButton.addEventListener('click', function() {
            infoPopup.style.display = 'flex';
        });
    }

    if (closeButton && infoPopup) {
        closeButton.addEventListener('click', function() {
            infoPopup.style.display = 'none';
        });
    }

    if (infoPopup) {
        infoPopup.addEventListener('click', function(event) {
            if (event.target === this) {
                this.style.display = 'none';
            }
        });
    }

    //popup 2
    const infoButton2 = document.getElementById('arwai-history-info'); // Use different id if arwai-history is already used
    const infoPopup2 = document.getElementById('info-popup-2');
    const closeButton2 = document.getElementById('close-info-popup-2');

    if (infoButton2 && infoPopup2) {
        infoButton2.addEventListener('click', function() {
            infoPopup2.style.display = 'flex';
        });
    }

    if (closeButton2 && infoPopup2) {
        closeButton2.addEventListener('click', function() {
            infoPopup2.style.display = 'none';
        });
    }

    if (infoPopup2) {
        infoPopup2.addEventListener('click', function(event) {
            if (event.target === this) {
                this.style.display = 'none';
            }
        });
    }
    
    
    // --- 4. SIMPLE VIEWER LOGIC ---
    function initSimpleAnnotorious() {
        if (initRafId) {
            cancelAnimationFrame(initRafId);
        }

        if (simpleAnno) {
            simpleAnno.destroy();
            simpleAnno = null;
            highlightedAnnotation = null;
        }

        function poll() {
            let img = null;
            if (mainSwiperInstance && !mainSwiperInstance.destroyed) {
                const activeSlide = mainSwiperInstance.slides[mainSwiperInstance.activeIndex];
                if (activeSlide) {
                    img = activeSlide.querySelector('img');
                }
            } else if (mainSwiperEl) {
                img = mainSwiperEl.querySelector('img');
            }

            mainImage = img;

            if (img && img.complete && img.naturalWidth > 0 && img.clientWidth > 0 && img.clientHeight > 0) {
                const annoConfig = {
                    image: img,
                    formatters: [arwaiIdFormatter, arwaiStyleFormatter],
                    fragmentUnit: 'percent',
                    adapter: Annotorious.W3CImageAdapter,
                    readOnly: true,
                    disableEditor: true,
                    allowEmpty: anno_options.allowEmpty,
                    drawOnSingleClick: anno_options.drawOnSingleClick,
                    widgets: [ 'COMMENT', { widget: 'TAG', vocabulary: anno_options.tagVocabulary || [] } ],
                    messages: { "Add a comment...": "Add a comment...", "Add a reply...": "Add a reply...", "Add tag...": "Add tag or name...", "Cancel": "Cancel", "Close": "Close", "Edit": "Edit", "Delete": "Delete", "Ok": "Ok" }
                };

                simpleAnno = Annotorious.init(annoConfig);

                if (anno_options.currentUser) {
                    simpleAnno.setAuthInfo({ id: anno_options.currentUser.id, displayName: anno_options.currentUser.displayName });
                }

                attachEventHandlers(simpleAnno);

                if (annotationsVisible) {
                    const currentAttachmentId = mainImage.getAttribute('data-attachment-id');
                    if (currentAttachmentId) {
                        loadAnnotations(currentAttachmentId, simpleAnno);
                    }
                }
                simpleAnno.setVisible(annotationsVisible);
                initRafId = null;
            } else {
                initRafId = requestAnimationFrame(poll);
            }
        }

        poll();
    }


    // --- 5. OPENSEADRAGON (DEEP ZOOM) LOGIC ---
    function launchOsdViewer() {
        if (historyVisible) {
            historyVisible = false;
            if (historySidebar) historySidebar.classList.remove('active');
        }
        annotationsVisible = true;
        if (osdModal) osdModal.style.display = 'block';
        if (simpleAnno) {
            simpleAnno.destroy();
            simpleAnno = null;
        }

        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        setTimeout(function() {
            const osdTileSources = images.map(img => {
                const url = img.iiif_image_url || img.iiif_source_url;
                if (url.includes('info.json')) {
                    return url;
                } else {
                    return { type: 'image', url: url };
                }
            });
            osdViewer = OpenSeadragon({
                id: 'arwai-osd-viewer',
                showNavigator: false,
                gestureSettingsMouse: { clickToZoom: false },
                tileSources: osdTileSources,
                initialPage: currentIndex,
                sequenceMode: true,
                showRotationControl: true,
                minZoomLevel:   .3,
                maxZoomLevel:   10,
                drawer: "canvas",
                zoomInButton:   'arwaiZoomIn',
                zoomOutButton:  'arwaiZoomOut',
                homeButton:     'arwaiHome',
                nextButton:     'arwaiNext',
                previousButton: 'arwaiPrevious',
                rotateLeftButton:  'arwaiRotateLeft',
                rotateRightButton: 'arwaiRotateRight',
            });

            osdAnno = OpenSeadragon.Annotorious(osdViewer, {
                adapter: Annotorious.W3CImageAdapter,
                fragmentUnit: 'percent',
                formatters: [arwaiIdFormatter, arwaiStyleFormatter],
                readOnly: anno_options.readOnly || !anno_options.currentUser,
                allowEmpty: anno_options.allowEmpty,
                widgets: [
                    'COMMENT',
                    { widget: 'TAG', vocabulary: anno_options.tagVocabulary || [] },
                    HistoryWidget
                ]
            });

            if (anno_options.currentUser) {
                osdAnno.setAuthInfo({ id: anno_options.currentUser.id, displayName: anno_options.currentUser.displayName });
            }
            attachEventHandlers(osdAnno);
            osdAnno.setVisible(true);
            updateToggleUI(true);

            osdViewer.addHandler('open', function() {
                const currentAttachmentId = images[currentIndex].post_id;
                if (currentAttachmentId && annotationsVisible && osdAnno) {
                    loadAnnotations(currentAttachmentId, osdAnno);
                }
            });

            osdViewer.addHandler('page', function(event) {
                currentIndex = event.page;
                if (osdAnno) {
                    osdAnno.clearAnnotations();
                }
            });

            osdViewer.addHandler('rotate', function(event) {
                const { degrees } = event;
                const labels = document.querySelectorAll('#arwai-osd-viewer .a9s-annotation foreignObject');
                labels.forEach(label => {
                    const existingTransform = label.style.transform.replace(/rotate\([^)]+\)/, '').trim();
                    label.style.transform = `${existingTransform} rotate(${-degrees}deg)`;
                });
            });

        }, 30);
    }

    function closeOsdViewer() {
        if (osdViewer) {
            const lastOsdPage = osdViewer.currentPage();
            currentIndex = lastOsdPage;

            if (osdAnno) {
                osdAnno.destroy();
                osdAnno = null;
            }

            osdViewer.destroy();
            osdViewer = null;
        }
        if (osdModal) osdModal.style.display = 'none';
        updateView(currentIndex);
        initSimpleAnnotorious();
    }

    // --- 6. EVENT BINDING & INITIALIZATION ---
    function updateView(index) {
        if (singleAnnotationContainer) singleAnnotationContainer.style.display = 'none';
        if (index < 0 || index >= images.length) return;
        if (images.length > 1 && mainSwiperInstance) {
            mainSwiperInstance.slideTo(index);
        }
    }

    // --- Main Initialization Logic ---
    // Check the number of images to decide which mode to use.
    if (images.length > 1) {
        const urlParams = new URLSearchParams(window.location.search);
        const targetImageId = urlParams.get('arwai_image_id');
        let initialSlideIndex = 0;
        if (targetImageId && Array.isArray(images)) {
            const foundIndex = images.findIndex(image => image.post_id === parseInt(targetImageId, 10));
            if (foundIndex !== -1) {
                initialSlideIndex = foundIndex;
            }
        }

        thumbSwiperInstance = new Swiper(thumbSwiperEl, {
            spaceBetween: 10,
            slidesPerView: 'auto',
            freeMode: true,
            watchSlidesProgress: true,
            navigation: {
                nextEl: thumbSwiperEl.querySelector('.swiper-button-next'),
                prevEl: thumbSwiperEl.querySelector('.swiper-button-prev'),
            },
        });

        mainSwiperInstance = new Swiper(mainSwiperEl, {
            loop: false,
            initialSlide: initialSlideIndex,
            navigation: {
                nextEl: slideNav.querySelector('.swiper-button-next'),
                prevEl: slideNav.querySelector('.swiper-button-prev'),
            },
            thumbs: {
                swiper: thumbSwiperInstance,
            },
            on: {
                slideChange: function () {
                    currentIndex = this.activeIndex;
                    if (currentIndexSpan) currentIndexSpan.textContent = currentIndex + 1;
                    if (singleAnnotationContainer) singleAnnotationContainer.style.display = 'none';
                    initSimpleAnnotorious();
                    if (historyVisible) {
                        clearHistorySidebar();
                    }
                }
            }
        });

        currentIndex = initialSlideIndex;
        if (currentIndexSpan) currentIndexSpan.textContent = currentIndex + 1;
        initSimpleAnnotorious();
    } else {
        if (slideNav) slideNav.style.display = 'none';
        if (thumbSwiperEl) thumbSwiperEl.style.display = 'none';

        initSimpleAnnotorious();
    }

    if (singleAnnotationContainer) {
        singleAnnotationContainer.addEventListener('click', function(e) {
            if (e.target.closest('#arwai-close-single-annotation')) {
                const activeAnno = osdViewer ? osdAnno : simpleAnno;
                if (activeAnno && typeof activeAnno.cancelSelected === 'function') {
                    activeAnno.cancelSelected();
                }
            }
        });
    }

    function handleAnnotationToggle() {
        annotationsVisible = !annotationsVisible;
        const activeAnno = osdViewer ? osdAnno : simpleAnno;
        if (!activeAnno) return;

        activeAnno.setVisible(annotationsVisible);

        if (annotationsVisible) {
            let currentAttachmentId;
            if (osdViewer) {
                currentAttachmentId = images[currentIndex].post_id;
            } else if (mainImage) {
                currentAttachmentId = mainImage.getAttribute('data-attachment-id');
            }

            if (currentAttachmentId) {
                // Requirement 4: Forced Recalculation on Toggle
                // It is CRITICAL this happens AFTER setVisible(true) so that SVG dimensions are computable
                if (!osdViewer && simpleAnno) {
                    const cachedData = window.arwaiAnnotationCache[currentAttachmentId];
                    if (cachedData) {
                        simpleAnno.clearAnnotations();
                        simpleAnno.setAnnotations(cachedData);
                    } else {
                        loadAnnotations(currentAttachmentId, simpleAnno);
                    }
                } else if (osdViewer && osdAnno) {
                    loadAnnotations(currentAttachmentId, osdAnno);
                }
            }
        }

        updateToggleUI(annotationsVisible);
    }

    function updateToggleUI(isVisible) {
        toggleButtons.forEach(button => {
            const wrapper1 = button.closest('.arwai-simple-viewer-button-wrapper');
            if (wrapper1) {
                const eye = wrapper1.querySelector('.feather-eye');
                const eyeOff = wrapper1.querySelector('.feather-eye-off');
                if (eye) eye.style.display = !isVisible ? '' : 'none';
                if (eyeOff) eyeOff.style.display = isVisible ? '' : 'none';
            }

            const wrapper2 = button.closest('.arwai-osd-toolbar-button-wrapper');
            if (wrapper2) {
                const eye = wrapper2.querySelector('.feather-eye');
                const eyeOff = wrapper2.querySelector('.feather-eye-off');
                if (eye) eye.style.display = !isVisible ? '' : 'none';
                if (eyeOff) eyeOff.style.display = isVisible ? '' : 'none';
            }
            button.setAttribute('title', isVisible ? 'Hide Annotations' : 'Show Annotations');
        });
    }
    
    toggleButtons.forEach(btn => btn.addEventListener('click', handleAnnotationToggle));

    if (launchOsdButton) launchOsdButton.addEventListener('click', launchOsdViewer);
    if (osdCloseButton) osdCloseButton.addEventListener('click', closeOsdViewer);

    // --- History Sidebar Logic ---
    let activeHistoryAnnotationId = null;

    if (historyButton) {
        historyButton.addEventListener('click', function() {
            historyVisible = !historyVisible;
            if (historyVisible) {
                // Force annotations on if they are currently off
                if (!annotationsVisible) {
                    handleAnnotationToggle();
                }

                updateSidebarPosition();
                if (historySidebar) historySidebar.classList.add('active');

                // Check if an annotation is already highlighted
                if (highlightedAnnotation) {
                    fetchAndRenderHistory(highlightedAnnotation);
                } else {
                    clearHistorySidebar();
                }
            } else {
                if (historySidebar) historySidebar.classList.remove('active');
            }
        });
    }

    if (historyCloseBtn) {
        historyCloseBtn.addEventListener('click', function() {
            historyVisible = false;
            if (historySidebar) historySidebar.classList.remove('active');
        });
    }

    function clearHistorySidebar() {
        if (!historyFeedContent || !historySidebar) return;
        historyFeedContent.innerHTML = '<div style="text-align:center; color:#888; padding: 40px 20px;">Click on an annotation to view its history.</div>';
        const h4 = historySidebar.querySelector('h4');
        if (h4) h4.textContent = 'Activity Timeline';
        activeHistoryAnnotationId = null;
    }

    function fetchAndRenderHistory(annotation) {
        if (!annotation || !annotation.id || !historyFeedContent) return;
        const annotationId = annotation.id;
        activeHistoryAnnotationId = annotationId;

        historyFeedContent.innerHTML = '<div style="text-align:center; padding: 20px;"><span data-feather="loader" style="animation: spin 1s infinite linear;"></span></div>';
        if (typeof feather !== 'undefined') feather.replace();

        // Extract arwai-AnnotationID if available
        let displayId = annotationId.substring(1);
        if (annotation.body && Array.isArray(annotation.body)) {
            const idBody = annotation.body.find(b => b.purpose === 'arwai-AnnotationID');
            if (idBody && idBody.value) {
                displayId = idBody.value;
            }
        }

        if (historySidebar) {
            const h4 = historySidebar.querySelector('h4');
            if (h4) h4.textContent = 'History: ' + displayId;
        }

        const url = new URL(ajax_url);
        url.searchParams.append('action', 'arwai_get_annotorious_history');
        url.searchParams.append('annotation_id', annotationId);

        fetch(url)
            .then(res => res.json())
            .then(response => {
                // Ensure we are still displaying the history for the requested annotation
                if (activeHistoryAnnotationId !== annotationId) return;

                if (response.success && response.data.history) {
                    renderHistoryFeed(response.data.history);
                } else {
                    historyFeedContent.innerHTML = '<div style="text-align:center; color:#888; padding: 20px;">Failed to load history.</div>';
                }
            })
            .catch(() => {
                if (activeHistoryAnnotationId === annotationId) {
                    historyFeedContent.innerHTML = '<div style="text-align:center; color:#888; padding: 20px;">Error connecting to server.</div>';
                }
            });
    }

    function renderHistoryFeed(historyData) {
        if (!historyData || historyData.length === 0) {
            if (historyFeedContent) historyFeedContent.innerHTML = '<div style="text-align:center; color:#888; padding: 20px;">No activity found.</div>';
            return;
        }

        let html = '';
        historyData.forEach(item => {
            const avatarLetter = item.userName ? item.userName.charAt(0).toUpperCase() : '?';
            const actionClass = 'arwai-action-' + item.actionType;

            const dateStr = new Date(item.timestamp).toLocaleString();
            const diffText = item.diffText || '';

            html += `
                <div class="arwai-history-feed-item ${actionClass}" data-annotation-id="${item.annotationId}">
                    <div style="display:flex;">
                        <div class="arwai-history-avatar">${avatarLetter}</div>
                        <div style="width: 100%;">
                            <strong>${item.userName}</strong><br>
                            <div style="margin-top:2px;">${diffText}</div>
                            <div class="arwai-history-meta">${dateStr}</div>
                        </div>
                    </div>
                </div>
            `;
        });

        if (historyFeedContent) {
            historyFeedContent.innerHTML = html;

            // Bind click event to select annotation
            historyFeedContent.querySelectorAll('.arwai-history-feed-item').forEach(item => {
                item.addEventListener('click', function() {
                    const annoId = this.getAttribute('data-annotation-id');
                    const activeAnno = osdViewer ? osdAnno : simpleAnno;
                    if (activeAnno && annoId) {
                        if (!annotationsVisible) {
                            handleAnnotationToggle();
                        }
                        activeAnno.selectAnnotation(annoId);
                    }
                });
            });
        }
    }

    if (typeof feather !== 'undefined') {
        feather.replace();
    }
});
