// DEBUG: This log should appear as soon as the file is loaded by the browser.
console.log('File loaded: script.js');

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

      // Explicitly set dimensions on the label for Firefox consistency
      label.style.display = 'block';
      label.style.width = '24px';
      label.style.height = '24px';
      label.style.boxSizing = 'border-box';
      label.setAttribute('style', 'transform: translate(-12px, -12px); display: block; width: 24px; height: 24px;');
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
    const { containerId, images, ajax_url, anno_options } = Arwai_Annotator_Data;
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
    
    // Shared / OSD elements
    const toggleButton = $('#arwai-toggle-annotations');
    const launchOsdButton = $('#arwai-launch-osd');
    const osdModal = $('#arwai-osd-modal');
    const osdCloseButton = $('#arwai-osd-close');
    const osdToggleButton = $('#arwai-toggle-annotations-osd'); 


    // --- SELECTORS FOR THE SINGLE ANNOTATION DISPLAY ---
    const singleAnnotationContainer = $('#arwai-single-annotation-container');
    const singleAnnotationList = $('#arwai-single-annotation');


    // --- 2. STATE MANAGEMENT ---
    window.arwaiAnnotationCache = {}; // Global cache for annotations keyed by attachmentId
    let currentIndex = 0;
    let lastInitToken = 0; // Token to track the latest initialization request
    let simpleAnno = null; // Annotorious instance for the simple viewer
    let osdViewer = null;  // OpenSeadragon viewer instance
    let osdAnno = null;    // Annotorious instance for OSD
    let annotationsVisible = false;
    let highlightedAnnotation = null; 


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

    // Debounce function to limit the rate at which a function can fire.
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Debounced resize handler to force Annotorious to recalculate percentages
    const handleResize = debounce(function() {
        if (!simpleAnno || !annotationsVisible) return;

        const $activeSlide = slickSlider.find('.slick-current:not(.slick-cloned)');
        const $img = $activeSlide.find('img');
        const attachmentId = $img.data('attachment-id');

        if (attachmentId && window.arwaiAnnotationCache[attachmentId]) {
            waitForDimensions($img[0], () => {
                simpleAnno.clearAnnotations();
                simpleAnno.setAnnotations(window.arwaiAnnotationCache[attachmentId]);
            });
        }
    }, 200);

    $(window).on('resize', handleResize);

    // Generic function to load annotations from the server into ANY Annotorious instance
    function loadAnnotations(attachmentId, annoInstance) {
        if (!annoInstance || !attachmentId) return;
        annoInstance.clearAnnotations();

        // Check if we already have it in cache for immediate display
        if (window.arwaiAnnotationCache[attachmentId]) {
            annoInstance.setAnnotations(window.arwaiAnnotationCache[attachmentId]);
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



    function attachEventHandlers(annoInstance) {
        function getActiveAttachmentId() {
            if (annoInstance === osdAnno && osdViewer) {
                return images[osdViewer.currentPage()].post_id;
            } else {
                return slickSlider.find('.slick-current img').data('attachment-id');
            }
        }

        function updateCache(attachmentId, annotation, action) {
            if (!attachmentId) return;
            if (!window.arwaiAnnotationCache[attachmentId]) {
                window.arwaiAnnotationCache[attachmentId] = [];
            }

            const cache = window.arwaiAnnotationCache[attachmentId];
            const index = cache.findIndex(a => a.id === annotation.id);

            if (action === 'add' || action === 'update') {
                if (index > -1) {
                    cache[index] = annotation;
                } else {
                    cache.push(annotation);
                }
            } else if (action === 'delete') {
                if (index > -1) {
                    cache.splice(index, 1);
                }
            }
        }

        annoInstance.on('createAnnotation', function(annotation) {
            const attachmentId = getActiveAttachmentId();
            // Snippet saving logic is now conditional
            if (annoInstance === osdAnno) {
                const imageUrl = images[osdViewer.currentPage()].fullUrl;
                const imageEl = new Image();
                imageEl.crossOrigin = "Anonymous";
                imageEl.onload = function() {
                    const canvas = createSnippet(annotation, imageEl);
                    if (canvas) {
                        annotation.body.push({ type: 'TextualBody', purpose: 'arwai-snippet', value: canvas.toDataURL('image/png') });
                    }
                    $.post(ajax_url, { action: 'arwai_anno_add', annotation: JSON.stringify(annotation), nonce: anno_options.annoNonce }).done(response => {
                        if (response.success && response.data.annotation) {
                            annoInstance.removeAnnotation(annotation);
                            annoInstance.addAnnotation(response.data.annotation);
                            updateCache(attachmentId, response.data.annotation, 'add');
                        }
                    });
                };
                imageEl.src = imageUrl;
            } else {
                // For simple viewer, just save without snippet
                $.post(ajax_url, { action: 'arwai_anno_add', annotation: JSON.stringify(annotation), nonce: anno_options.annoNonce }).done(response => {
                    if (response.success && response.data.annotation) {
                        annoInstance.removeAnnotation(annotation);
                        annoInstance.addAnnotation(response.data.annotation);
                        updateCache(attachmentId, response.data.annotation, 'add');
                    }
                });
            }
        });

        annoInstance.on('updateAnnotation', function(annotation) {
            const attachmentId = getActiveAttachmentId();
            updateCache(attachmentId, annotation, 'update');

            if (annoInstance === osdAnno) {
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
                    $.post(ajax_url, { action: 'arwai_anno_update', annotation: JSON.stringify(annotation), annotationid: annotation.id, nonce: anno_options.annoNonce }).done(response => {
                         if (response.success && response.data.annotation) {
                             updateCache(attachmentId, response.data.annotation, 'update');
                         }
                    });
                };
                imageEl.src = imageUrl;
            } else {
                $.post(ajax_url, { action: 'arwai_anno_update', annotation: JSON.stringify(annotation), annotationid: annotation.id, nonce: anno_options.annoNonce });
            }
        });

        annoInstance.on('deleteAnnotation', function(annotation) {
            const attachmentId = getActiveAttachmentId();
            updateCache(attachmentId, annotation, 'delete');
            $.post(ajax_url, { action: 'arwai_anno_delete', annotation: JSON.stringify(annotation), annotationid: annotation.id, nonce: anno_options.annoNonce });
        });
        
        annoInstance.on('selectAnnotation', function(annotation, element) {
            if (highlightedAnnotation) {
                highlightedAnnotation.classList.remove('is-highlighted');
            }
            element.classList.add('is-highlighted');
            highlightedAnnotation = element;
            updateSingleAnnotationDisplay(annotation);
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
    
    
    /**
     * A utility to poll for image readiness and physical dimensions.
     * Fires the callback only when the image is fully loaded and painted with >0px dimensions.
     */
    function waitForDimensions(imgEl, callback) {
        if (!imgEl) return;

        let attempts = 0;
        const maxAttempts = 30; // ~500ms at 60fps

        function check() {
            const hasDimensions = imgEl.complete && imgEl.naturalWidth > 0 && imgEl.clientWidth > 0 && imgEl.clientHeight > 0;

            if (hasDimensions) {
                // Nested RAF for Firefox safety to ensure layout engine has fully caught up
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        callback();
                    });
                });
            } else if (attempts < maxAttempts) {
                attempts++;
                requestAnimationFrame(check);
            } else {
                console.warn('Image dimensions could not be resolved for attachment:', imgEl.dataset.attachmentId);
            }
        }

        check();
    }

    // --- 4. SIMPLE VIEWER LOGIC ---
    function initSimpleAnnotorious() {
        const currentToken = ++lastInitToken;

        // Destroy existing instance properly
        if (simpleAnno) {
            simpleAnno.destroy();
            simpleAnno = null;
            highlightedAnnotation = null;
        }

        // Target ONLY visible, non-cloned slide
        const $activeSlide = slickSlider.hasClass('slick-initialized')
            ? slickSlider.find('.slick-current:not(.slick-cloned)')
            : slickSlider.find('.arwai-slick-slide').first();
        
        const $img = $activeSlide.find('img');
        if (!$img.length) return;

        const imgEl = $img[0];

        waitForDimensions(imgEl, function() {
            // Bail if a newer initialization request has been made
            if (currentToken !== lastInitToken) return;

            // Double check that we are still on the same image
            const $checkSlide = slickSlider.find('.slick-current:not(.slick-cloned)');
            if ($checkSlide.find('img')[0] !== imgEl) return;

            if (simpleAnno) return; // Prevent double init

            const annoConfig = {
                image: imgEl,
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
                const currentAttachmentId = $img.data('attachment-id');
                if (currentAttachmentId) {
                    loadAnnotations(currentAttachmentId, simpleAnno);
                }
            }
            simpleAnno.setVisible(annotationsVisible);
        });
    }


    // --- 5. OPENSEADRAGON (DEEP ZOOM) LOGIC ---
    function launchOsdViewer() {
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
            const osdTileSources = images.map(img => ({ type: 'image', url: img.fullUrl }));
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
                widgets: ['COMMENT', { widget: 'TAG', vocabulary: anno_options.tagVocabulary || [] }]
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

        // Removed arbitrary setTimeout. Using the new strict initSimpleAnnotorious
        // which handles RAF and image loading.
        initSimpleAnnotorious();
    }

    // --- 6. EVENT BINDING & INITIALIZATION ---
    function updateView(index) {
        if (singleAnnotationContainer.length) singleAnnotationContainer.hide();
        if (index < 0 || index >= images.length) return;
        slickSlider.slick('slickGoTo', index); 
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
            } else {
                const $activeSlide = slickSlider.find('.slick-current:not(.slick-cloned)');
                const $img = $activeSlide.find('img');
                currentAttachmentId = $img.data('attachment-id');
            }

            if (currentAttachmentId) {
                // If it's the simple viewer, force a recalculation using RAF
                if (!osdViewer && activeAnno === simpleAnno) {
                    const $activeSlide = slickSlider.find('.slick-current:not(.slick-cloned)');
                    const $img = $activeSlide.find('img');
                    waitForDimensions($img[0], () => {
                        activeAnno.clearAnnotations();
                        // This will pull from cache or AJAX
                        loadAnnotations(currentAttachmentId, activeAnno);
                    });
                } else {
                    if (activeAnno.getAnnotations().length === 0) {
                        loadAnnotations(currentAttachmentId, activeAnno);
                    }
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

    if (typeof feather !== 'undefined') {
        feather.replace();
    }
});
