<div class="arwai-archive-attachment-image">
    <a href="http://bunkyo.local/?attachment_id=354">
        <img 
            width="630" 
            height="472" 
            src="http://bunkyo.local/wp-content/uploads/2025/07/silver-ascension-transcendence.jpg" 
            class="attachment-large size-large" 
            alt="" 
            decoding="async" 
            srcset="http://bunkyo.local/wp-content/uploads/2025/07/silver-ascension-transcendence.jpg 630w, http://bunkyo.local/wp-content/uploads/2025/07/silver-ascension-transcendence-300x225.jpg 300w" 
            sizes="(max-width: 630px) 100vw, 630px">
    </a>
</div>


<figure style="
            padding-top:0;
            padding-bottom:0;
            padding-left:0;
            padding-right:0;
            margin-top:0;
            margin-bottom:0;
            margin-left:0;
            margin-right:0;" 
        class="arwai-archive-featured-image wp-block-post-featured-image">
    <a href="http://bunkyo.local/?p=347" target="_self">
        <img 
            width="1024"
            height="607" 
            src="http://bunkyo.local/wp-content/uploads/2025/07/Flowers-FourSeasons-1024x607.jpg" 
            class="attachment-large size-large wp-post-image" 
            alt="halim" 
            style="object-fit:cover;" 
            decoding="async" 
            srcset="http://bunkyo.local/wp-content/uploads/2025/07/Flowers-FourSeasons-1024x607.jpg 1024w, http://bunkyo.local/wp-content/uploads/2025/07/Flowers-FourSeasons-300x178.jpg 300w, http://bunkyo.local/wp-content/uploads/2025/07/Flowers-FourSeasons-768x456.jpg 768w, http://bunkyo.local/wp-content/uploads/2025/07/Flowers-FourSeasons-1536x911.jpg 1536w, http://bunkyo.local/wp-content/uploads/2025/07/Flowers-FourSeasons-2048x1215.jpg 2048w" 
            sizes="(max-width: 1024px) 100vw, 1024px">
    </a>
</figure>                   

<?php

function launchOsdViewer() {
    // 1. Force the global visibility state to TRUE at the start.
    annotationsVisible = true;

    // Show the modal and destroy the old simple viewer instance.
    osdModal.show();
    if (simpleAnno) {
        simpleAnno.destroy();
        simpleAnno = null;
    }

    if (typeof feather !== 'undefined') {
        feather.replace();
    }

    // Use a timeout to ensure the modal container is ready.
    setTimeout(function() {
        const osdTileSources = images.map(img => ({
            type: 'image',
            url: img.fullUrl
        }));

        osdViewer = OpenSeadragon({
            id: 'arwai-osd-viewer',
            showNavigator: false,
            gestureSettingsMouse: { clickToZoom: false },
            tileSources: osdTileSources,
            initialPage: currentIndex,
            sequenceMode: true,
            showRotationControl: true,
            toolbar: 'arwai-openseadragon-toolbar',
            zoomInButton:   'arwaiZoomIn',
            zoomOutButton:  'arwaiZoomOut',
            homeButton:     'arwaiHome',
            nextButton:     'arwaiNext',
            previousButton: 'arwaiPrevious',
            rotateLeftButton:  'arwaiRotateLeft',
            rotateRightButton: 'arwaiRotateRight',
            fullPageButton: 'arwaiFullpage',
            gestureSettingsTouch: {
                pinchRotate: true
            }
        });

        // Fired once the OSD viewer is open and ready.
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

            // 2. Explicitly set the new OSD instance to be visible.
            osdAnno.setVisible(true);
            
            // 3. Update the UI buttons and annotation list to match the "visible" state.
            updateToggleUI(true);
            if (listContainerWrapper.length) listContainerWrapper.show();

            // 4. Load the annotations for the starting image.
            const currentAttachmentId = images[currentIndex].post_id;
            if (currentAttachmentId) {
                loadAnnotations(currentAttachmentId, osdAnno);
            }
        });

        // Add other event handlers for page changes and rotation.
        osdViewer.addHandler('page', function(event) {
            currentIndex = event.page;
            const attachmentId = images[currentIndex].post_id;

            if (osdAnno) {
                osdAnno.clearAnnotations();
                updateAnnotationList(osdAnno); 
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

    function launchOsdViewer() {
            // --- START DEBUGGING ---
     console.log('--- Launching OSD Viewer ---');
     console.log('1. State of "annotationsVisible" at launch:', annotationsVisible);
        // --- END DEBUGGING ---
        // Show the modal container first
        osdModal.show();
        
        // Destroy the simple viewer instance to avoid conflicts
        if (simpleAnno) {
            simpleAnno.destroy();
            simpleAnno = null;
        }

        if (typeof feather !== 'undefined') {
            feather.replace();
        }

        // Use a setTimeout to ensure the container is visible before initializing
        setTimeout(function() {
            const osdTileSources = images.map(img => ({
                type: 'image',
                url: img.fullUrl
            }));

            osdViewer = OpenSeadragon({
                id: 'arwai-osd-viewer',
                showNavigator: false,
                gestureSettingsMouse: { clickToZoom: false },
                tileSources: osdTileSources,
                initialPage: currentIndex,
                sequenceMode: true,
                showRotationControl: true,
                // toolbar: 'arwai-openseadragon-toolbar',
                zoomInButton:   'arwaiZoomIn',
                zoomOutButton:  'arwaiZoomOut',
                homeButton:     'arwaiHome',
                nextButton:     'arwaiNext',
                previousButton: 'arwaiPrevious',
                rotateLeftButton:  'arwaiRotateLeft',
                rotateRightButton: 'arwaiRotateRight',
                // fullPageButton: 'arwaiFullpage',
                gestureSettingsTouch: {
                    pinchRotate: true
                }
            });

            osdViewer.addHandler('open', function() {
                            console.log('2. OSD "open" event fired.');

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
            console.log('3. Setting OSD annotation visibility to:', annotationsVisible);

                // Sync the OSD instance's visibility and its toggle button.
                osdAnno.setVisible(annotationsVisible);
                updateToggleUI(annotationsVisible);
            });

            // 'page' EVENT HANDLER
            osdViewer.addHandler('page', function(event) {
                currentIndex = event.page;
                const attachmentId = images[currentIndex].post_id;


                // 1. Always clear existing annotations and the list first.
                if (osdAnno) {
                    osdAnno.clearAnnotations();
                    updateAnnotationList(osdAnno); // This will show "No annotations..."
                }

                // 2. If annotations are toggled on, fetch the new ones.
                if (annotationsVisible && osdAnno) {
                    $.ajax({
                        url: ajax_url,
                        data: { action: 'arwai_anno_get', attachment_id: attachmentId },
                        dataType: 'json',
                        success: function(annotations) {
                            if (Array.isArray(annotations)) {
                                osdAnno.setAnnotations(annotations);
                                updateAnnotationList(osdAnno);
                            }
                        }
                    });
                }
            console.log('4. Immediately loading annotations for attachment ID:', attachmentId);

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





    <script> 
const arwaiIdFormatter = function(annotation) { 
const idBody = annotation.body.find(b => b.purpose === 'arwai-AnnotationID'); 
    if (idBody) { 
// 1. Create the SVG <foreignObject> wrapper 
const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');

// 2. Create the HTML <label> element using the correct XHTML namespace 
const label = document.createElementNS('http://www.w3.org/1999/xhtml', 'label');

// 3. Set its text content (safer than innerHTML) 
label.textContent = idBody.value;

// 4. Apply browser/platform-specific styles 
function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; }

function isMacSafari() { return /Macintosh/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && /Apple Computer/.test(navigator.vendor) && !/Chrome/.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent); }

if (isIOS() || isMacSafari()) { 
foreignObject.setAttribute('width', '24'); 
foreignObject.setAttribute('height', '24'); 
foreignObject.setAttribute('style', 'transform: translate(-12px, -12px);'); 
foreignObject.style.transformOrigin = 'center center'; 
} 
else { 
foreignObject.setAttribute('width', '24'); 
foreignObject.setAttribute('height', '24');
label.setAttribute('width', '1'); 
label.setAttribute('height', '1'); 
label.setAttribute('style', 'transform: translate(-12px, -12px);'); 
}

// 5. Append the HTML label inside the SVG wrapper 
foreignObject.appendChild(label);

// 6. Return the element for Annotorious to render 
return { element: foreignObject }; }

return null; }
    
    
    
    </script>






                    
                  