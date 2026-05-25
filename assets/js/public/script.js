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
    } else {
      foreignObject.setAttribute('width', '24');
      foreignObject.setAttribute('height', '24');
      label.setAttribute('width', '1');
      label.setAttribute('height', '1');
      label.setAttribute('style', 'transform: translate(-12px, -12px);');
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


jQuery(document).ready(function($) {
    console.log('Document ready. Starting viewer initialization.');

    if (typeof Arwai_Annotator_Data === 'undefined') {
        console.error('Arwai_Annotator_Data is not defined.');
        return;
    }

    // --- 1. GLOBAL VARIABLES & SELECTORS ---
    const { containerId, images, post_id, ajax_url, anno_options } = Arwai_Annotator_Data;
    const container = $('#' + containerId);
    if (!container.length || images.length === 0) return;

    // Simple Viewer elements
    const prevButton = container.find('.arwai-simple-prev');
    const nextButton = container.find('.arwai-simple-next');
    const thumbnails = container.find('.arwai-simple-thumb');
    const currentIndexSpan = container.find('.arwai-simple-current-index');
    const strip = container.find('#arwai-simple-viewer-reference-strip');
    const scrollLeftButton = container.find('.arwai-simple-strip-scroll-left');
    const scrollRightButton = container.find('.arwai-simple-strip-scroll-right');
    const slideNav = container.find('.arwai-simple-viewer-nav');

    const slickSlider = container.find('.arwai-slick-slider'); // selector for Slick
    let mainImage; // This will be redefined on slide change
    
    // Shared / OSD elements
    const toggleButton = $('#arwai-toggle-annotations');
    const launchOsdButton = $('#arwai-launch-osd');
    const osdModal = $('#arwai-osd-modal');
    const osdCloseButton = $('#arwai-osd-close');
    const osdToggleButton = $('#arwai-toggle-annotations-osd'); 

    // History elements
    const historyButton = $('#arwai-history');
    const historySidebar = $('#arwai-history-sidebar');
    const historyCloseBtn = $('#arwai-close-history');
    const historyFeedContent = $('#arwai-history-feed-content');

    // Move sidebar to body to avoid flex/overflow clipping
    if (historySidebar.length) {
        historySidebar.appendTo('body');
        // Override absolute positioning to fixed since it's now on body
        historySidebar.css({
            'position': 'fixed',
            'right': '0',
            'z-index': '999999'
        });
    }

    function updateSidebarPosition() {
        if (!historyVisible || !historySidebar.length || !container.length) return;
        const viewerRect = container[0].getBoundingClientRect();
        historySidebar.css({
            'top': viewerRect.top + 'px',
            'height': viewerRect.height + 'px'
        });
    }

    $(window).on('scroll resize', updateSidebarPosition);


    // --- SELECTORS FOR THE SINGLE ANNOTATION DISPLAY ---
    const singleAnnotationContainer = $('#arwai-single-annotation-container');
    const singleAnnotationList = $('#arwai-single-annotation');


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

            $.ajax({
                url: ajax_url,
                method: 'GET',
                data: {
                    action: 'arwai_get_annotorious_history',
                    annotation_id: annotationId
                },
                success: function(response) {
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
                },
                error: function() {
                    historyContainer.innerHTML = '<div style="color:red;">Error loading history.</div>';
                }
            });
        });

        container.appendChild(button);
        container.appendChild(historyContainer);

        // Render feather icon in widget
        setTimeout(() => { if (typeof feather !== 'undefined') feather.replace(); }, 10);

        return container;
    }


    // --- 3. SHARED & HELPER FUNCTIONS ---

    // --- RESPONSIVE IMAGE LOADER FOR SLICK ---
    function handleResponsiveSliderImages() {
        if (window.innerWidth > 767) {
            slickSlider.find('img[data-large-src]').each(function() {
                const $image = $(this);
                const largeSrc = $image.data('large-src');
                const currentSrc = $image.attr('src');
                if (largeSrc && largeSrc !== currentSrc) {
                    $image.attr('src', largeSrc);
                }
            });
        }
    }

    // Run the function on initial page load
    handleResponsiveSliderImages();

    // Re-run the function when the window is resized to handle orientation changes or browser resizing.
    $(window).on('resize', handleResponsiveSliderImages);

    /**
     * Requirement 5: Responsive Window Resizing
     * Triggers forced recalculation of annotations on window resize.
     */
    let resizeTimeout;
    $(window).on('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function() {
            // Check if Simple Viewer is active and notes are visible
            if (osdModal.css('display') === 'none' && annotationsVisible && simpleAnno && mainImage) {
                const img = mainImage[0];
                if (img && img.clientWidth > 0) {
                    const attachmentId = mainImage.data('attachment-id');
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

        $.ajax({
            url: ajax_url,
            data: { action: 'arwai_anno_get', attachment_id: attachmentId },
            dataType: 'json',
            success: function(annotations) {
                if (Array.isArray(annotations)) {
                    window.arwaiAnnotationCache[attachmentId] = annotations;
                    annoInstance.setAnnotations(annotations);
                }
            }
        });
    }

    /**
     * Manually generates a canvas snippet from a full-resolution image.
     * @param {object} annotation - The annotation object.
     * @param {HTMLElement} imageEl - The source image element (must be fully loaded).
     * @returns {HTMLCanvasElement|null}
     */
    function createSnippet(annotation, imageEl) {
        if (!annotation.target?.selector?.value.startsWith('xywh=percent:') || !imageEl) {
            return null;
        }

        const coords = annotation.target.selector.value.substring(13).split(',');
        const percent = {
            x: parseFloat(coords[0]), y: parseFloat(coords[1]),
            w: parseFloat(coords[2]), h: parseFloat(coords[3])
        };

        const naturalW = imageEl.naturalWidth;
        const naturalH = imageEl.naturalHeight;

        const sx = (percent.x / 100) * naturalW;
        const sy = (percent.y / 100) * naturalH;
        const sWidth = (percent.w / 100) * naturalW;
        const sHeight = (percent.h / 100) * naturalH;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = sWidth;
        canvas.height = sHeight;

        ctx.drawImage(imageEl, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
        return canvas;
    }


    // ### SINGLE ANNOTATION DISPLAY ###
    function updateSingleAnnotationDisplay(annotation) {
        if (!singleAnnotationContainer.length) return;

        if (!annotation) {
            singleAnnotationContainer.hide();
            singleAnnotationList.empty();
            return;
        }

        const idBody = annotation.body.find(b => b.purpose === 'arwai-AnnotationID');
        const annotationId = idBody ? idBody.value : 'N/A';
        const tagBodies = annotation.body.filter(b => b.purpose === 'tagging');

        const footerStyle = tagBodies.length === 0 ? 'style="display: none;"' : '';
        
        const tagLinks = anno_options.tagLinks || {};
        const tagsHtml = tagBodies.map(body => {
            const tagName = body.value;
            return tagLinks[tagName] 
                ? `<button class="arwai-anno-single-tag arwai-tag"><a href="${tagLinks[tagName]}" class="arwai-anno-single-tag-link">${tagName}</a></button>` 
                : `<span class="arwai-anno-single-tag arwai-tag">${tagName}</span>`;
        }).join(' ');

        const commentBodies = annotation.body.filter(b => b.purpose === 'commenting' || b.purpose === 'replying');
        let commentsHtml = '<p class="arwai-empty-comment"><em>Empty comment</em></p>'; // Default message
        if (commentBodies.length > 0) {
            commentsHtml = '<ul class="arwai-anno-single-comments">'; // Add target class
            commentBodies.forEach(body => {
                const creator = body.creator || annotation.creator;
                const creatorName = creator ? (creator.name || creator.displayName) : 'Unknown';
                const dateValue = body.created || annotation.created;

              let createdDate = ''; // Default to empty

                if (dateValue) {
                    const timeAgoString = formatTimeAgo(dateValue);
                    const isoDate = new Date(dateValue).toISOString();
                    createdDate = `<time class="timeago" datetime="${isoDate}">${timeAgoString}</time>`;
                }

                const commentText = body.value || '<em>Empty comment</em>';
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
            <li data-id="${annotationId}">
                <div class="arwai-anno-single-item">
                    <div class="arwai-anno-single-header">
                        <span> ${annotationId}</span>
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
        
        singleAnnotationList.html(newHtml);

        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        const style = arwaiStyleFormatter(annotation);
        singleAnnotationContainer.removeClass(function(index, className) {
            return (className.match(/\bis-[^\s]+/g) || []).join(' ');
        });

        if (style && style.className) {
            const idBody = annotation.body.find(b => b.purpose === 'arwai-AnnotationID');
            if (idBody) {
                // Corrected line:
                const specificListItem = singleAnnotationList.find(`li[data-id="${idBody.value}"]`);
                singleAnnotationContainer.addClass('is-' + style.className);
                if (specificListItem.length) { // Check if the item was found before adding a class
                    specificListItem.addClass('is-' + style.className);
                }
            }
        }
        
        singleAnnotationContainer.show();
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
            attachmentId = mainImage.data('attachment-id');
            const currentImageData = images.find(img => img.post_id === attachmentId);
            iiifSourceUrl = currentImageData ? currentImageData.iiif_source_url : '';
        }

        if (!attachmentId) return;

        const syncCache = () => {
            window.arwaiAnnotationCache[attachmentId] = annoInstance.getAnnotations();
        };

        if (action === 'create' || action === 'update') {
            const isOsd = (annoInstance === osdAnno);
            const ajaxAction = (action === 'create') ? 'arwai_anno_add' : 'arwai_anno_update';

            const sendRequest = (annot) => {
                const postData = {
                    action: ajaxAction,
                    annotation: JSON.stringify(annot),
                    attachment_id: attachmentId,
                    nonce: anno_options.annoNonce,
                    iiif_source_url: iiifSourceUrl,
                    post_id: post_id
                };
                if (action === 'update') postData.annotationid = annot.id;

                $.post(ajax_url, postData).done(response => {
                    if (action === 'create' && response.success && response.data.annotation) {
                        annoInstance.removeAnnotation(annot);
                        annoInstance.addAnnotation(response.data.annotation);
                    }
                    syncCache();
                });
            };

            if (isOsd) {
                const imageUrl = images[osdViewer.currentPage()].fullUrl;
                const imageEl = new Image();
                imageEl.crossOrigin = "Anonymous";
                imageEl.onload = function() {
                    const snippetIndex = annotation.body.findIndex(b => b.purpose === 'arwai-snippet');
                    if (snippetIndex > -1) annotation.body.splice(snippetIndex, 1);
                    const canvas = createSnippet(annotation, imageEl);
                    if (canvas) {
                        annotation.body.push({ type: 'TextualBody', purpose: 'arwai-snippet', value: canvas.toDataURL('image/png') });
                    }
                    sendRequest(annotation);
                };
                imageEl.src = imageUrl;
            } else {
                sendRequest(annotation);
            }
        } else if (action === 'delete') {
            $.post(ajax_url, {
                action: 'arwai_anno_delete',
                annotation: JSON.stringify(annotation),
                annotationid: annotation.id,
                nonce: anno_options.annoNonce
            }).done(() => {
                syncCache();
            });
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
            if (singleAnnotationContainer.length) singleAnnotationContainer.hide();

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

    $(document).off('click', '#arwai-close-single-annotation').on('click', '#arwai-close-single-annotation', function() {
        const activeAnno = osdViewer ? osdAnno : simpleAnno;

        if (activeAnno?.cancelSelected) {
            activeAnno.cancelSelected();
        }
        // Optional: hide the container manually
        singleAnnotationContainer.hide();
        singleAnnotationList.empty();
    });

        // ---  Nav button Popup LOGIC ---

        // Select the elements using jQuery selectors
    const infoButton = $('#arwai-information');
    const infoPopup = $('#info-popup');
    const closeButton = $('#close-info-popup');

    // Show the popup when the info button is clicked
    infoButton.on('click', function() {
        infoPopup.css('display', 'flex'); // Use .css() to set display to flex
    });

    // Hide the popup when the close button is clicked
    closeButton.on('click', function() {
        infoPopup.hide();
    });

    // Optional: Hide the popup when clicking on the background
    infoPopup.on('click', function(event) {
        // If the click target is the popup container itself (the background)
        if (event.target === this) {
            $(this).hide();
        }
    });

    //popup 2
           // Select the elements using jQuery selectors
    const infoButton2 = $('#arwai-history');
    const infoPopup2 = $('#info-popup-2');
    const closeButton2 = $('#close-info-popup-2');

    // Show the popup when the info button is clicked
    infoButton2.on('click', function() {
        infoPopup2.css('display', 'flex'); // Use .css() to set display to flex
    });

    // Hide the popup when the close button is clicked
    closeButton2.on('click', function() {
        infoPopup2.hide();
    });

    // Optional: Hide the popup when clicking on the background
    infoPopup2.on('click', function(event) {
        // If the click target is the popup container itself (the background)
        if (event.target === this) {
            $(this).hide();
        }
    });
    
    
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
            if (slickSlider.hasClass('slick-initialized')) {
                mainImage = slickSlider.find('.slick-current:not(.slick-cloned) img');
            } else {
                mainImage = slickSlider.find('img').first();
            }

            const img = mainImage[0];

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
                    const currentAttachmentId = mainImage.data('attachment-id');
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
            historySidebar.removeClass('active');
        }
        annotationsVisible = true;
        osdModal.show();
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
        osdModal.hide();
        updateView(currentIndex);
        initSimpleAnnotorious();
    }

    // --- 6. EVENT BINDING & INITIALIZATION ---
    function updateView(index) {
        if (singleAnnotationContainer.length) singleAnnotationContainer.hide();
        if (index < 0 || index >= images.length) return;
        if (images.length > 1) {
            slickSlider.slick('slickGoTo', index);
        }
    }

    function updateArrowVisibility() {
        if (!strip.length || !scrollLeftButton.length || !scrollRightButton.length) return;
        const canScroll = strip[0].scrollWidth > strip[0].clientWidth;
        scrollLeftButton.toggle(canScroll);
        scrollRightButton.toggle(canScroll);
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
        slickSlider.slick({
            dots: false,
            arrows: false,
            infinite: true,
            speed: 150,
            cssEase: 'linear',
            slidesToShow: 1,
            adaptiveHeight: true,
            swipeToSlide: true,
            touchThreshold: 10,
            initialSlide: initialSlideIndex
        });
        slickSlider.on('afterChange', function(event, slick, newIndex) {
            currentIndex = newIndex;
            currentIndexSpan.text(currentIndex + 1);
            thumbnails.removeClass('active').eq(currentIndex).addClass('active');
            if (singleAnnotationContainer.length) singleAnnotationContainer.hide();
            initSimpleAnnotorious();
        });
        prevButton.on('click', () => slickSlider.slick('slickPrev'));
        nextButton.on('click', () => slickSlider.slick('slickNext'));
        strip.on('click', '.arwai-simple-thumb', function() {
            const newIndex = $(this).data('index');
            slickSlider.slick('slickGoTo', newIndex);
        });
        scrollLeftButton.on('click', function() {
            strip.animate({ scrollLeft: '-=200' }, 300);
        });
        scrollRightButton.on('click', function() {
            strip.animate({ scrollLeft: '+=200' }, 300);
        });
        updateArrowVisibility();
        $(window).on('resize', updateArrowVisibility);
        currentIndex = initialSlideIndex;
        currentIndexSpan.text(currentIndex + 1);
        thumbnails.removeClass('active').eq(currentIndex).addClass('active');
        initSimpleAnnotorious();
    } else {
        prevButton.hide();
        nextButton.hide();
        strip.hide();
        scrollLeftButton.hide();
        scrollRightButton.hide();
        currentIndexSpan.parent().hide();
        slideNav.hide();
        initSimpleAnnotorious();
    }

    singleAnnotationContainer.on('click', '#arwai-close-single-annotation', function() {
        const activeAnno = osdViewer ? osdAnno : simpleAnno;
        if (activeAnno && typeof activeAnno.cancelSelected === 'function') {
            activeAnno.cancelSelected();
        }
    });

    function handleAnnotationToggle() {
        annotationsVisible = !annotationsVisible;
        const activeAnno = osdViewer ? osdAnno : simpleAnno;
        if (!activeAnno) return;

        if (annotationsVisible) {
            let currentAttachmentId;
            if (osdViewer) {
                currentAttachmentId = images[currentIndex].post_id;
            } else if (mainImage && mainImage.length) {
                currentAttachmentId = mainImage.data('attachment-id');
            }

            if (currentAttachmentId) {
                // Requirement 4: Forced Recalculation on Toggle
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

        activeAnno.setVisible(annotationsVisible);
        updateToggleUI(annotationsVisible);
    }

    function updateToggleUI(isVisible) {
        const buttons = $('#arwai-toggle-annotations, #arwai-toggle-annotations-osd');
        buttons.each(function() {
            const button = $(this);
            const wrapper1 = button.closest('.arwai-simple-viewer-button-wrapper') 
            const wrapper2 = button.closest('.arwai-osd-toolbar-button-wrapper');
            wrapper1.find('.feather-eye').toggle(!isVisible);
            wrapper1.find('.feather-eye-off').toggle(isVisible);

            wrapper2.find('.feather-eye').toggle(!isVisible);
            wrapper2.find('.feather-eye-off').toggle(isVisible);
        });
        buttons.attr('title', isVisible ? 'Hide Annotations' : 'Show Annotations');
    }
    
    toggleButton.on('click', handleAnnotationToggle);
    osdToggleButton.on('click', handleAnnotationToggle);

    launchOsdButton.on('click', launchOsdViewer);
    osdCloseButton.on('click', closeOsdViewer);

    // --- History Sidebar Logic ---
    let activeHistoryAnnotationId = null;

    historyButton.on('click', function() {
        historyVisible = !historyVisible;
        if (historyVisible) {
            // Force annotations on if they are currently off
            if (!annotationsVisible) {
                handleAnnotationToggle();
            }

            updateSidebarPosition();
            historySidebar.addClass('active');

            // Check if an annotation is already highlighted
            if (highlightedAnnotation) {
                fetchAndRenderHistory(highlightedAnnotation);
            } else {
                clearHistorySidebar();
            }
        } else {
            historySidebar.removeClass('active');
        }
    });

    historyCloseBtn.on('click', function() {
        historyVisible = false;
        historySidebar.removeClass('active');
    });

    function clearHistorySidebar() {
        historyFeedContent.html('<div style="text-align:center; color:#888; padding: 40px 20px;">Click on an annotation to view its history.</div>');
        historySidebar.find('h4').text('Activity Timeline');
        activeHistoryAnnotationId = null;
    }

    function fetchAndRenderHistory(annotation) {
        if (!annotation || !annotation.id) return;
        const annotationId = annotation.id;
        activeHistoryAnnotationId = annotationId;

        historyFeedContent.html('<div style="text-align:center; padding: 20px;"><span data-feather="loader" style="animation: spin 1s infinite linear;"></span></div>');
        if (typeof feather !== 'undefined') feather.replace();

        // Extract arwai-AnnotationID if available
        let displayId = annotationId.substring(1);
        if (annotation.body && Array.isArray(annotation.body)) {
            const idBody = annotation.body.find(b => b.purpose === 'arwai-AnnotationID');
            if (idBody && idBody.value) {
                displayId = idBody.value;
            }
        }
        historySidebar.find('h4').text('History: ' + displayId);

        $.ajax({
            url: ajax_url,
            method: 'GET',
            data: {
                action: 'arwai_get_annotorious_history',
                annotation_id: annotationId
            },
            success: function(response) {
                // Ensure we are still displaying the history for the requested annotation
                if (activeHistoryAnnotationId !== annotationId) return;

                if (response.success && response.data.history) {
                    renderHistoryFeed(response.data.history);
                } else {
                    historyFeedContent.html('<div style="text-align:center; color:#888; padding: 20px;">Failed to load history.</div>');
                }
            },
            error: function() {
                if (activeHistoryAnnotationId === annotationId) {
                    historyFeedContent.html('<div style="text-align:center; color:#888; padding: 20px;">Error connecting to server.</div>');
                }
            }
        });
    }

    function renderHistoryFeed(historyData) {
        if (!historyData || historyData.length === 0) {
            historyFeedContent.html('<div style="text-align:center; color:#888; padding: 20px;">No activity found.</div>');
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

        historyFeedContent.html(html);

        // Bind click event to select annotation
        historyFeedContent.find('.arwai-history-feed-item').on('click', function() {
            const annoId = $(this).data('annotation-id');
            const activeAnno = osdViewer ? osdAnno : simpleAnno;
            if (activeAnno && annoId) {
                if (!annotationsVisible) {
                    handleAnnotationToggle();
                }
                activeAnno.selectAnnotation(annoId);
            }
        });
    }

    // Refresh history if sidebar is open and slide changes
    slickSlider.on('afterChange', function(event, slick, newIndex) {
        if (historyVisible) {
            clearHistorySidebar();
        }
    });

    if (typeof feather !== 'undefined') {
        feather.replace();
    }
});
