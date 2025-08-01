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
    const { containerId, images, ajax_url, anno_options } = Arwai_Annotator_Data;
    const dialogContainer = $('#arwai-annotation-dialog');
    const infoButton = $('#arwai-information');
    const infoDialog = $('#arwai-info-dialog');

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


    // --- SELECTORS FOR THE SINGLE ANNOTATION DISPLAY ---
    const singleAnnotationContainer = $('#arwai-single-annotation-container');
    const singleAnnotationList = $('#arwai-single-annotation');


    // --- 2. STATE MANAGEMENT ---
    let currentIndex = 0;
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


    //  ADD DIALOG INITIALIZATION 
    dialogContainer.dialog({
        autoOpen: false,
        modal: false,
        width: 'auto',
        maxWidth: 500, // Set max-width to 500px
        maxHeight: 600,
        create: function() {
        // Find the default close button and replace its icon
            const closeButton = $(this).parent().find('.ui-dialog-titlebar-close');
            closeButton.html('<span data-feather="x-circle"></span>');
            
            // Tell Feather Icons to process the new icon
            if (typeof feather !== 'undefined') {
                feather.replace();
            }
        },
        close: function() {
            // When dialog closes, deselect the annotation in Annotorious
            const activeAnno = osdViewer ? osdAnno : simpleAnno;
            if (activeAnno && typeof activeAnno.cancelSelected === 'function') {
                activeAnno.cancelSelected();
            }
        }
    });

        //  ADD INITIALIZATION FOR THE INFO DIALOG
    infoDialog.dialog({
        autoOpen: false,
        modal: false,
        width: 400,
        maxWidth: 400, // Set max-width to 400px

        create: function() {
        // Find the default close button and replace its icon
            const closeButton = $(this).parent().find('.ui-dialog-titlebar-close');
            closeButton.html('<span data-feather="x-circle"></span>');
            
            // Tell Feather Icons to process the new icon
            if (typeof feather !== 'undefined') {
                feather.replace();
            }
        },
    });

    infoButton.on('click', function() {
        infoDialog.dialog('open');
    });

    // Generic function to load annotations from the server into ANY Annotorious instance
    function loadAnnotations(attachmentId, annoInstance) {
        if (!annoInstance || !attachmentId) return;
        annoInstance.clearAnnotations();

        $.ajax({
            url: ajax_url,
            data: { action: 'arwai_anno_get', attachment_id: attachmentId },
            dataType: 'json',
            success: function(annotations) {
                if (Array.isArray(annotations)) {
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
        // Clear previous content
        singleAnnotationList.empty();

        if (!annotation) {
            dialogContainer.dialog('close'); // Close if no annotation
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
                ? `<span class="arwai-anno-single-tag arwai-tag"><a href="${tagLinks[tagName]}" class="arwai-anno-single-tag-link">${tagName}</a></span>`
                : `<span class="arwai-anno-single-tag arwai-tag">${tagName}</span>`;
        }).join(' ');

        const commentBodies = annotation.body.filter(b => b.purpose === 'commenting' || b.purpose === 'replying');
        let commentsHtml = '<p class="arwai-empty-comment"><em>Empty comment</em></p>';
        if (commentBodies.length > 0) {
            commentsHtml = '<ul class="arwai-anno-single-comments">';
            commentBodies.forEach(body => {
                const creator = body.creator || annotation.creator;
                const creatorName = creator ? (creator.name || creator.displayName) : 'Unknown';
                const dateValue = body.created || annotation.created;
                let createdDate = '';
                if (dateValue) {
                    const timeAgoString = formatTimeAgo(dateValue);
                    const isoDate = new Date(dateValue).toISOString();
                    createdDate = `<time class="timeago" datetime="${isoDate}">${timeAgoString}</time>`;
                }
                const commentText = body.value || '<em>Empty comment</em>';
                commentsHtml += `<li class="arwai-anno-single-comment-item"><p>${commentText}</p><div class="arwai-anno-single-comment-meta">${creatorName}: ${createdDate}</div></li>`;
            });
            commentsHtml += '</ul>';
        }

        // Build the new HTML for the list inside the dialog
        const newHtml = `
            <li data-id="${annotationId}">
                <div class="arwai-anno-single-item">
                    <div>
                        <div class="arwai-anno-single-body">${commentsHtml}</div>
                        <div class="arwai-anno-single-footer" ${footerStyle}>${tagsHtml}</div>
                    </div>
                </div>
            </li>`;

        singleAnnotationList.html(newHtml);

        // Set the dialog title dynamically and open it
        dialogContainer.dialog('option', 'title', 'Annotation: ' + annotationId);
        dialogContainer.dialog('open');
    }



    function attachEventHandlers(annoInstance) {


    // Helper to get the current attachment ID
    const getCurrentAttachmentId = () => {
        return (images && images[currentIndex]) ? images[currentIndex].post_id : 0;
    };

    annoInstance.on('createAnnotation', function(annotation) {
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
                $.post(ajax_url, { 
                    action: 'arwai_anno_add', 
                    annotation: JSON.stringify(annotation),
                    attachment_id: getCurrentAttachmentId() // Send the ID
                }).done(response => {
                    if (response.success && response.data.annotation) {
                        annoInstance.removeAnnotation(annotation);
                        annoInstance.addAnnotation(response.data.annotation);
                    }
                });
            };
            imageEl.src = imageUrl;
        } else {
            // For simple viewer, just save without snippet
            $.post(ajax_url, { 
                action: 'arwai_anno_add', 
                annotation: JSON.stringify(annotation),
                attachment_id: getCurrentAttachmentId() // Send the ID
            }).done(response => {
                if (response.success && response.data.annotation) {
                    annoInstance.removeAnnotation(annotation);
                    annoInstance.addAnnotation(response.data.annotation);
                }
            });
        }
    });

    annoInstance.on('updateAnnotation', function(annotation) {
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
                $.post(ajax_url, { 
                    action: 'arwai_anno_update', 
                    annotation: JSON.stringify(annotation), 
                    annotationid: annotation.id,
                    attachment_id: getCurrentAttachmentId() // Send the ID
                });
            };
            imageEl.src = imageUrl;
        } else {
            $.post(ajax_url, { 
                action: 'arwai_anno_update', 
                annotation: JSON.stringify(annotation), 
                annotationid: annotation.id,
                attachment_id: getCurrentAttachmentId() // Send the ID
            });
        }
    });

    annoInstance.on('deleteAnnotation', function(annotation) {
        $.post(ajax_url, { 
            action: 'arwai_anno_delete', 
            annotationid: annotation.id, 
            attachment_id: getCurrentAttachmentId() // Send the ID
        });
    });



        
        annoInstance.on('cancelSelected', function() {
            if (highlightedAnnotation) {
                highlightedAnnotation.classList.remove('is-highlighted');
                highlightedAnnotation = null;
            }
            updateSingleAnnotationDisplay(null);
        });
    }




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
        if (simpleAnno) {
            simpleAnno.destroy();
            simpleAnno = null;
            highlightedAnnotation = null;
        }

        if (slickSlider.hasClass('slick-initialized')) {
            mainImage = slickSlider.find('.slick-current img');
        } else {
            mainImage = slickSlider.find('img').first();
        }
        
        if (!mainImage.length) return;

        mainImage.one('load', function() {
            const annoConfig = {
                image: this,
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

// This function runs whenever a DOM change is detected
const handleMutation = (mutationsList) => {
    for (const mutation of mutationsList) {
        // We only care about changes to the 'class' attribute
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            const targetElement = $(mutation.target);

            // Check if the element IS an annotation shape and NOW has the 'selected' class
            if (targetElement.hasClass('a9s-annotation') && targetElement.hasClass('selected')) {
                const annotationId = targetElement.data('id');
                if (annotationId) {
                    const annotation = simpleAnno.getAnnotationById(annotationId);
                    if (annotation) {
                        // Open your dialog with the correct data
                        updateSingleAnnotationDisplay(annotation);
                    }
                }
                return; // Exit after handling the selection
            }
        }
    }
};

// Create an observer instance linked to the callback function
const observer = new MutationObserver(handleMutation);

// Start observing the viewer container for attribute changes in its descendants
observer.observe(container[0], {
    attributes: true,
    subtree: true,
    attributeFilter: ['class']
});





            if (anno_options.currentUser) {
                simpleAnno.setAuthInfo({ id: anno_options.currentUser.id, displayName: anno_options.currentUser.displayName });
            }

             attachEventHandlers(simpleAnno, this);
            
            if (annotationsVisible) {
                const currentAttachmentId = $(this).data('attachment-id');
                if (currentAttachmentId) {
                    loadAnnotations(currentAttachmentId, simpleAnno);
                }
            }
            simpleAnno.setVisible(annotationsVisible);
        }).each(function() {
            if (this.complete) {
                $(this).trigger('load');
            }
        });
    }


    // --- 5. OPENSEADRAGON (DEEP ZOOM) LOGIC ---
    function launchOsdViewer() {
        dialogContainer.dialog('close'); // Close the details dialog first
        infoDialog.dialog('close'); // Close the info dialog if it's open

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
                fullPageButton: 'arwai-launch-osd',
                
            });

            osdViewer.addHandler('open', function() {
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
                const currentAttachmentId = images[currentIndex].post_id;
                if (currentAttachmentId) {
                    loadAnnotations(currentAttachmentId, osdAnno);
                }
            });

            osdViewer.addHandler('page', function(event) {
                currentIndex = event.page;
                const attachmentId = images[currentIndex].post_id;
                if (osdAnno) {
                    osdAnno.clearAnnotations();
                }
                if (annotationsVisible && osdAnno) {
                    loadAnnotations(attachmentId, osdAnno);
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
            osdViewer.destroy();
            osdViewer = null;
            osdAnno = null;
        }
        osdModal.hide();
        updateView(currentIndex); // This is safe, does nothing for single image mode
        setTimeout(() => {
            initSimpleAnnotorious();

            // This block now reliably loads annotations in both single and multi-image modes.
            if (annotationsVisible && simpleAnno) {
                // Get the attachment ID from the master 'images' array, which always works.
                const currentAttachmentId = images[currentIndex] ? images[currentIndex].post_id : 0;
                if (currentAttachmentId) {
                    loadAnnotations(currentAttachmentId, simpleAnno);
                }
            }

        // Trigger a custom event to notify other plugins that the viewer has been refreshed.
        $(slickSlider).trigger('arwai:viewerRefreshed');

        }, 50);
    }

    // --- 6. EVENT BINDING & INITIALIZATION ---
    function updateView(index) {
        if (singleAnnotationContainer.length) singleAnnotationContainer.hide();
        if (index < 0 || index >= images.length) return;

        // Only try to control the slider if it has been initialized.
        if (slickSlider.hasClass('slick-initialized')) {
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
        if (annotationsVisible && activeAnno.getAnnotations().length === 0) {
            let currentAttachmentId;
            if (osdViewer) {
                currentAttachmentId = images[currentIndex].post_id;
            } else if (mainImage && mainImage.length) {
                currentAttachmentId = mainImage.data('attachment-id');
            }
            if (currentAttachmentId) {
                loadAnnotations(currentAttachmentId, activeAnno);
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




    // --- Snippet Regeneration Logic ---
    const regenButton = $('#arwai-regenerate-snippets-btn');
    const statusContainer = $('#arwai-regeneration-status');
    const nonceField = $('#arwai_regenerate_snippets_nonce_field');

    regenButton.on('click', function() {
        if (!confirm('Are you sure you want to regenerate all annotation snippets? This action cannot be undone. Please ensure you have a database backup.')) {
            return;
        }

        // Provide immediate feedback to the user
        regenButton.prop('disabled', true);
        statusContainer.css('border-left-color', '#0073aa').html('Processing... Please do not close this page. This may take several minutes.').show();

        // Make the AJAX call
        $.ajax({
            url: ajaxurl, // ajaxurl is a global variable defined by WordPress
            type: 'POST',
            data: {
                action: 'arwai_regenerate_snippets',
                nonce: nonceField.val()
            },
            success: function(response) {
                if (response.success) {
                    statusContainer.css('border-left-color', '#46b450').html('<strong>Success!</strong><br>' + response.data.message);
                } else {
                    statusContainer.css('border-left-color', '#dc3232').html('<strong>Error:</strong><br>' + response.data.message);
                }
            },
            error: function(xhr) {
                const errorMsg = xhr.responseText ? xhr.responseText : 'An unknown AJAX error occurred.';
                statusContainer.css('border-left-color', '#dc3232').html('<strong>Critical Error:</strong><br>Could not complete the request. ' + errorMsg);
            },
            complete: function() {
                // Re-enable the button once the process is finished
                regenButton.prop('disabled', false);
            }
        });
    });
});
