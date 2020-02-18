var currentSlideNum = 0;
var slideCount = 0;

// make presenter notes window modifiable globally
var presenterNotesWindow;

// "window." makes this variable available to the presenter notes window
window.presenterNotesTimerStart = null;

var slideChangeHook = (oldSlide, newSlide) => {};
var modeChangeHook = (newMode) => {};

// make options available globally
var options;

// process options, break rendered markdeep into slides on <hr> tags (unless the
// class "ignore" is set), kick off some other init tasks as well
function initSlides() {

    // override default options with any differing user-specified options
    processMarkdeepSlidesOptions();

    // handle aspect ratio
    document.documentElement.style.setProperty('--aspect-ratio', options.aspectRatio);
    var sheet = document.createElement('style');
    sheet.innerHTML = "@page { size: 640px " + (640 / options.aspectRatio) + "px; }" +
        "@media print { .slide, .slide { --slide-width: 640px !important; --slide-height: " + (640 / options.aspectRatio) + "px; }";
    document.body.appendChild(sheet);

    // handle theme
    var link = document.createElement('link');
    link.setAttribute("rel", "stylesheet");
    if (/[/.]+/.test(options.theme)) {
        link.setAttribute("href", options.theme);
    } else {
        link.setAttribute("href", "markdeep-slides/themes/" + options.theme + ".css");
    }
    document.body.appendChild(link);

    // handle other options
    document.documentElement.style.setProperty('--font-size', options.fontSize);
    if (options.totalSlideNumber) {
        document.documentElement.style.setProperty('--total-slide-number-display', 'inline');
    }
    if (!options.progressBar) {
        document.documentElement.style.setProperty('--slide-progress-display', 'none');
    }

    // done with options processing – note that the diagramZoom,
    // breakOnHeadings, slideChangeHook and modeChangeHook options are
    // referenced later on and need no further processing at this stage

    // break document into slides
    var md = document.querySelector("body > .md");
    var es = Array.from(md.childNodes);

    function isHeadingSlideBreak(e) {
        return options.breakOnHeadings && (e.tagName == "H1" || e.tagName == "H2");
    }

    function isSlideBreak(e) {
        return (e.tagName == "HR" && e.className != 'ignore') || isHeadingSlideBreak(e);
    }

    // slide count used for progress bar
    var totalSlideCount = 1 + es.map(isSlideBreak).reduce((acc, curr) => curr ? acc + 1 : acc, 0);

    var slides = [];
    var currentSlide = [];
    var currentPresenterNotes = [];
    for (var i = 0; i < es.length; i++) {
        var e = es[i];

        // create new slide when enountering <hr> or end of input
        if (isSlideBreak(e) || i == es.length - 1) {
            var slide = document.createElement('div');
            slide.className = "slide";
            slide.id = "slide" + slideCount;

            // slide number (skip title slide)
            if (slideCount != 0) {
                var sn = document.createElement('div');
                sn.className = "slide-number";
                sn.innerHTML = `${slideCount}<span class="slide-number-total">/${totalSlideCount}</span>`;
                slide.appendChild(sn);
            }

            // slide progress bar
            if (slideCount != 0) {
                var sp = document.createElement('div');
                sp.className = "slide-progress";
                //sp.setAttribute("data-progress", slideCount / totalSlideCount);  // see commend in markdeep-slides.css
                sp.setAttribute("style", "width: calc(" + slideCount / (totalSlideCount - 1) + " * var(--slide-width));");
                slide.appendChild(sp);
            }

            // slide content
            var sc = document.createElement('div');
            sc.className = "slide-content";
            for (var j = 0; j < currentSlide.length; j++) {
                var se = currentSlide[j];

                if (se.tagName == "P" && se.innerHTML.trim().length == 0) {
                    // skip empty paragraphs
                } else {
                    sc.appendChild(se);
                }
            }
            slide.appendChild(sc);

            // presenter notes (if any)
            if (currentPresenterNotes.length > 0) {
                var spn = document.createElement('div');
                spn.className = "slide-presenter-notes";
                for (var j = 0; j < currentPresenterNotes.length; j++) {
                    spn.innerHTML += "<p>" + currentPresenterNotes[j] + "</p>";
                    // TOOD is <p> really correct here?
                }
                slide.appendChild(spn);
            }

            slides.push(slide);
            slideCount++;
            currentSlide = [];
            currentPresenterNotes = [];

            // if breaking before a heading, add the heading to the upcoming slide
            if (isHeadingSlideBreak(e)) {
                currentSlide.push(e);
            }
        } else {
            if (e.tagName == "BLOCKQUOTE"
                && e.children[0] && e.children[0].tagName == "BLOCKQUOTE"
                && e.children[0].children[0] && e.children[0].children[0].tagName == "BLOCKQUOTE") {

                // extract presenter notes from three nested blockquotes (in source: ">>>")
                currentPresenterNotes.push(e.children[0].children[0].innerHTML);

            } else {
                currentSlide.push(e);
            }
        }
    }

    // replace .md content with slides
    md.innerHTML = '';
    md.innerHTML = '<div id="black" style="display: none;"></div>';  // insert black element
    for (var j = 0; j < slides.length; j++) {
        var s = slides[j];
        md.appendChild(s);
    }

    // initialize mathjax
    initMathJax();

    // fill in the current date for any elements with the .current-date class
    document.querySelectorAll(".current-date").forEach(e => {
        e.innerText = new Date().toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric'});
    });

    // further initialization steps
    processLocationHash();
    addLetterboxing();
    relativizeDiagrams(options.diagramZoom);
    pauseVideos();

    fullscreenActions();
};

// override default options with any differing user-specified options
function processMarkdeepSlidesOptions() {
    options = {
        aspectRatio: 16 / 9,
        theme: 'simple',
        fontSize: 28,
        diagramZoom: 1.0,
        totalSlideNumber: false,
        progressBar: true,
        breakOnHeadings: false,
        slideChangeHook: (oldSlide, newSlide) => {},
        modeChangeHook: (newMode) => {}
    };

    if (typeof markdeepSlidesOptions !== 'undefined') {
        options = Object.assign({}, options, markdeepSlidesOptions);
    }
}

// initialize mathjax
function initMathJax() {
    var script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "markdeep-slides/lib/mathjax/2.7.5/MathJax.js?config=TeX-MML-AM_SVG";
    document.getElementsByTagName("head")[0].appendChild(script);
}

// check if a slide is set via the location hash – if so, load it, else
// write the first slide to it. either way, go to that slide
function processLocationHash() {
    var slideNum;
    if (window.location.hash) {
        var slide = window.location.hash.substring(1);
        var slideNum = parseInt(slide.substring(5), 10);

        // clamp slide number to maximum existing slide number (can be an issue
        // when deleting slides while at the very bottom of the page in draft
        // mode and then refreshing)
        if (slideNum > slideCount - 1) {
            slideNum = slideCount - 1;
            history.replaceState({}, '', '#' + "slide" + slideNum);
        }
    } else {
        var slideNum = 0;
    }
    showSlide(slideNum);
}

// depending on whether your viewport is wider or taller than the aspect ratio
// of your slides, add a corresponding class to the root <html> element. based
// on this, in presentation mode, letterboxing is added to keep your slides
// centered on a non-matching screen. until max() (or min(), or clamp()) is
// available in css, this bit of javascript is required. :(
function addLetterboxing() {
    var aspectRatio = eval(getComputedStyle(document.documentElement).getPropertyValue('--aspect-ratio'));

    var w = window.innerWidth;
    var h = window.innerHeight;

    var viewportAspectRatio = w / h;

    var root = document.documentElement;
    if (viewportAspectRatio > aspectRatio) {
        root.classList.remove('taller');
        root.classList.remove('wider'); // no frickin idea why this is necessary to keep font sizes updated... browser bug?
        root.classList.add('wider');
    } else {
        root.classList.remove('wider');
        root.classList.remove('taller');
        root.classList.add('taller');
    }
}
window.addEventListener('resize', addLetterboxing);

// make diagrams resize properly: markdeep diagrams have their width and
// height attributes set to absoulute pixel values, which don't scale. so we
// need to move this width and height information into a new viewbox
// attribute, then we can set a relative width and height in css based on
// baseRem defined below, which would be the rem if the document was 640px
// wide (just to have a baseline value independent of window size on load;
// this also matches width in print mode, which doesn't bring any advantages
// but whatever)
function relativizeDiagrams(diagramZoom) {
    var baseRem = 17.92;
    //var baseRem = parseFloat(getComputedStyle(document.documentElement).fontSize) * (640 / window.innerWidth);  // doesn't work in some browsers because the font size hasn't yet been set correctly when this function is executed

    // this factor works well as a baseline
    var zoom = 0.9 * diagramZoom;

    document.querySelectorAll("svg.diagram").forEach(function(diag) {
        function toRem(px) {
            return (parseFloat(px) / baseRem) + "rem";
        }

        var w = diag.getAttribute("width"),
            h = diag.getAttribute("height");

        diag.removeAttribute("width");
        diag.removeAttribute("height");
        diag.setAttribute("viewBox", "0 0 " + w + " " + h);
        diag.style.width  = toRem(w * zoom);
        diag.style.height = toRem(h * zoom);

        if (diag.style.marginTop) {
            diag.style.marginTop = toRem(diag.style.marginTop);
        }
        if (diag.style.marginRight) {
            diag.style.marginRight = toRem(diag.style.marginRight);
        }
        if (diag.style.marginBottom) {
            diag.style.marginBottom = toRem(diag.style.marginBottom);
        }
        if (diag.style.marginLeft) {
            diag.style.marginLeft = toRem(diag.style.marginLeft);
        }
    });
}

// pause all videos and store their "autoplay" attribute for later
function pauseVideos() {
    Array.from(document.getElementsByTagName("video")).forEach(function (video) {
        if (!video.hasAttribute("data-autoplay")) {
            video.setAttribute("data-autoplay", video.autoplay);
        }
        video.preload = "auto";  // preload video, if possible
        video.autoplay = false;  // set autoplay to false
        video.load();            // reload it to reset position to zero
    });
}

// play videos of the current slides which have been designated as "autoplay"
function playAutoplayingVideos(slideNum) {
    var slide = document.getElementById("slide" + slideNum);
    Array.from(slide.getElementsByTagName("video")).forEach(function (video) {
        video.autoplay = video.getAttribute("data-autoplay");
        if (video.autoplay) {
            video.play();
        }
    });
}

// some browsers (lookin' at you, safari) may fire scroll events as they're
// leaving fullscreen. this makes it impossible to switch to the current slide
// when coming out of presentation mode before updateOnScroll() resets the
// location hash to the value it was before entering fullscreen. so we need to
// ignore scroll events for a short amount of time after leaving fullscreen mode
var enableScroll = true;

// when scrolling, update location hash (and presenter notes etc.) based on
// which slide is visible right now. only makes sense in draft mode
function updateOnScroll() {
    if (!enableScroll || document.documentElement.classList.contains("presentation")) {
        return;
    }

    var slides = document.getElementsByClassName("slide");
    var minSlideNum = 0;  // number of slide completely visible and closest to the top of the viewport
    var minTop = -1;      // that slide's offset relative to the viewport
    for (var i = 0; i < slides.length; i++) {
        var slide = slides[i];
        var bcr = slide.getBoundingClientRect();

        if (bcr.top >= 0 && (bcr.top < minTop || minTop == -1)) {
            minSlideNum = parseInt(slide.id.substring(5), 10);
            minTop = bcr.top;
        }
    }

    // update things only when the slide changes to improve performance
    if (minSlideNum != currentSlideNum) {
        history.replaceState({}, '', '#' + "slide" + minSlideNum);
        options.slideChangeHook(currentSlideNum, minSlideNum);
        currentSlideNum = minSlideNum;
        updatePresenterNotes(minSlideNum);
    }
}
window.addEventListener('scroll', updateOnScroll);

// switch to slide n
function showSlide(slideNum) {
    if (document.documentElement.classList.contains("draft")) {

        // set all slides to visible (in case presentation mode was previously active)
        Array.from(document.getElementsByClassName("slide")).map(e => e.style.display = "inline-block");

        // fix for chrome sometimes mistiming scroll events (or at least that's what I think is going on)
        enableScroll = false;
        document.getElementById("slide" + slideNum).scrollIntoView();
        setTimeout(function () {
            enableScroll = true;
        }, 10);
    } else if (document.documentElement.classList.contains("presentation")) {

        // hide all slides except for the one to be shown
        Array.from(document.getElementsByClassName("slide")).map(e => e.style.display = "none");
        document.getElementById("slide" + slideNum).style.display = "inline-block";

        // pause vidoes on other slides and start playing autoplay videos on the current slide
        pauseVideos();
        playAutoplayingVideos(slideNum);
    }

    history.replaceState({}, '', '#' + "slide" + slideNum);
    options.slideChangeHook(currentSlideNum, slideNum);
    currentSlideNum = slideNum;
    updatePresenterNotes(slideNum);
}

// load presenter notes for slide n into presenter notes window
function updatePresenterNotes(slideNum) {
    if (presenterNotesWindow) {
        var presenterNotesElement = document.getElementById("slide" + slideNum).querySelector(".slide-presenter-notes");
        var presenterNotes = "";
        if (presenterNotesElement) {
            presenterNotes = presenterNotesElement.innerHTML;
        }

        presenterNotesWindow.document.getElementById("slide-number").innerHTML = `<span class="current">${slideNum}</span><span class="total">/${slideCount - 1}</span>`;
        presenterNotesWindow.document.getElementById("presenter-notes").innerHTML = presenterNotes;
    }
}

// ->
function nextSlide() {
    if (currentSlideNum < slideCount - 1) {
        showSlide(currentSlideNum + 1);
    }
}

// <-
function prevSlide() {
    if (currentSlideNum > 0) {
        showSlide(currentSlideNum - 1);
    }
}

// goto
function gotoSlide(slideNum) {
    if (0 <= slideNum && slideNum <= slideCount - 1) {
        showSlide(slideNum);
    }
}

// my best shot at a works-everywhere "fullscreen?" predicate, which will
// invariably break in the future. web development is great!
function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement ||
              window.fullScreen /*||
              (window.innerHeight == screen.height && window.innerWidth == screen.width)*/);
}

// toggles fullscreen mode, upon which the fullscreenchange event is fired
// (which is *also* fired when a user leaves fullscreen via the Esc key, so we
// can't just ignore it), so there's no need to call fullscreenActions()
// directly in here
function toggleFullscreen() {
    var fullscreen = isFullscreen();

    if (fullscreen) {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    } else {
        var root = document.documentElement;
        if (root.requestFullscreen) {
            root.requestFullscreen();
        } else if (root.mozRequestFullScreen) {
            root.mozRequestFullScreen();
        } else if (root.webkitRequestFullscreen) {
            root.webkitRequestFullscreen();
        } else if (root.msRequestFullscreen) {
            root.msRequestFullscreen();
        }
    }
}

function fullscreenActions() {
    enableScroll = false;

    var fullscreen = isFullscreen();
    options.modeChangeHook(fullscreen? "presentation" : "draft");

    var root = document.documentElement;
    if (fullscreen) {
        root.classList.remove("draft");
        root.classList.add("presentation");
    } else {
        root.classList.remove("presentation");
        root.classList.add("draft");
    }

    // allow some time for getting into or out of fullscreen
    setTimeout(function () {
        showSlide(currentSlideNum);
        enableScroll = true;
    }, 100);
}
document.addEventListener("fullscreenchange", fullscreenActions);
document.addEventListener("mozfullscreenchange", fullscreenActions);
document.addEventListener("webkitfullscreenchange", fullscreenActions);
document.addEventListener("msfullscreenchange", fullscreenActions);

// turn the screen black or back again
function toggleBlack() {
    var black = document.getElementById("black");
    if (black.style.display == "none") {
        black.style.display = "block";
    } else {
        black.style.display = "none";
    }
}

// open or close presenter notes window
function togglePresenterNotes() {
    if (presenterNotesWindow && !presenterNotesWindow.closed) {
        presenterNotesWindow.close();
        presenterNotesWindow = null;
        return;
    }

    presenterNotesStyles = '<link rel="stylesheet" href="markdeep-slides/markdeep-slides.css">';
    if (/[/.]+/.test(options.theme)) {
        presenterNotesStyles += '<link rel="stylesheet" href="' + options.theme + '">';
    } else {
        presenterNotesStyles += '<link rel="stylesheet" href="markdeep-slides/themes/' + options.theme + '.css">';
    }

    presenterNotesWindow = window.open("", "presenternotes", "");
    if (presenterNotesWindow) {
        with (presenterNotesWindow.document) {
            open("text/html", "replace");
            write(`
<html class="presenter-notes">
<head>
    <title>Presenter Notes</title>
    ${presenterNotesStyles}
</head>
<body>
    <div class="presenter-notes-meta">
        <div id="timer"></div>
        <div id="clock"></div>
        <div id="slide-number"><span class="current">${currentSlideNum}</span><span class="total">/${slideCount - 1}</span></div>
        &nbsp;
    </div>
    <div class="presenter-notes-notes" id="presenter-notes"></div>
    <script>

        // forward key presses to parent window
        document.body.onkeydown = function(event) {
            opener.keyPress(event);
        };

        // update clock once a second
        function updateClock() {
            var time = new Date();
            time = ('0' + time.getHours()).slice(-2)   + ':' +
                   ('0' + time.getMinutes()).slice(-2) + '<span class="seconds">:' +
                   ('0' + time.getSeconds()).slice(-2) + '</span>';
            document.getElementById('clock').innerHTML = time;
        }
        updateClock();
        setInterval(updateClock, 1000);

        // update timer once a second if it's running, hide it if it's not
        // running anymore
        function updateTimer() {
            if (opener.presenterNotesTimerStart) {
                var time = Math.abs(new Date() - opener.presenterNotesTimerStart);

                var minutes = Math.floor(time / 60000);
                var seconds = ((time % 60000) / 1000).toFixed(0);

                time = ('0' + minutes).slice(-2) + '<span class="seconds">:' +
                       ('0' + seconds).slice(-2) + '</span>';

                document.getElementById('timer').innerHTML = time;
            } else {
                document.getElementById('timer').innerHTML = "";
            }
        }
        updateTimer();
        setInterval(updateTimer, 1000);
    </script>
</body>
</html>`);
            close();
        }
    }

    // load presenter notes for the current slide
    updatePresenterNotes(currentSlideNum);
}

function resetPresenterNotesTimer() {
    if (window.presenterNotesTimerStart) {
        window.presenterNotesTimerStart = null;
    } else {
        window.presenterNotesTimerStart = new Date();
    }

    // apply reset immediately if presenter notes window is open
    if (presenterNotesWindow && !presenterNotesWindow.closed) {
        presenterNotesWindow.updateTimer();
    }
}


// keyboard/presenter controls (these map well to my logitech r400
// presenter, others may vary)
var gotoSlideNum = [];
function keyPress(event) {

    // ignore if the user is editing text (nothing of the sort is available in
    // stock markdeep-slides, but the user might include interactive elements,
    // which markdeep-slides should work with seamlessly)
    if (document.activeElement.isContentEditable || document.activeElement.tagName == "INPUT" || document.activeElement.tagName == "TEXTAREA") {
        return
    }

    // ignore if any meta keys have been pressed as well
    if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
    }

    switch (event.keyCode) {
      case 39:  // left
      case 40:  // down
      case 32:  // space
      case 34:  // pgdn
        nextSlide();
        return false;
      case 37:  // right
      case 38:  // up
      case 33:  // pgup
        prevSlide();
        return false;
      case 27:  // escape
      case 116: // f5
      case 70:  // f
        toggleFullscreen();
        return false;
      case 190: // .
        toggleBlack();
        return false;
      case 78:  // n
        togglePresenterNotes();
        return false;
      case 84:  // t
        resetPresenterNotesTimer();
        return false;
      case 48:  // 0
      case 49:  // 1
      case 50:  // 2
      case 51:  // 3
      case 52:  // 4
      case 53:  // 5
      case 54:  // 6
      case 55:  // 7
      case 56:  // 8
      case 57:  // 9
        gotoSlideNum.push(event.keyCode - 48);
        return false;
      case 8:  // backspace
        gotoSlideNum.pop();
        return false;
      case 13:  // enter
        if (gotoSlideNum.length == 0) {
            return false;
        }

        // convert list of digits "gotoSlideNum" into number "slide"
        var slide = 0;
        var i = 0;
        for (let n of gotoSlideNum.reverse()) {
            slide += n * (10 ** i++);
        }
        gotoSlideNum = [];

        gotoSlide(slide);
        return false;
      default:
        return;
    }
};
document.body.onkeydown = keyPress;

// set --vw and --vw css variables to viewport size, EXCLUDING the scroll bars
// (the css units vw and vh include them, which is less than ideal), in order to
// fix #23. ideally, this would run whenever the following events are fired:
// * load
// * resize
// * fullscreenchange
// but that doesn't seem to suffice in all cases and all browsers, so we sadly
// need to run it a couple times a second (this works perceptually instantly
// without slowing everything down too much)
function setCssViewport() {
    var cw = document.body.clientWidth;
    document.documentElement.style.setProperty('--vw', cw / 100 + 'px');
    var ch = document.body.clientHeight;
    document.documentElement.style.setProperty('--vh', ch / 100 + 'px');
}
document.addEventListener("load", setCssViewport);
document.addEventListener("resize", setCssViewport);
document.addEventListener("fullscreenchange", setCssViewport);
document.addEventListener("mozfullscreenchange", setCssViewport);
document.addEventListener("webkitfullscreenchange", setCssViewport);
document.addEventListener("msfullscreenchange", setCssViewport);
setInterval(setCssViewport, 200);

// make cursor disappear after two seconds in presentation mode
var cursorTimeout;
document.body.onmousemove = function() {
    if (document.body.style.cursor != "none") {
        if (cursorTimeout) {
            clearTimeout(cursorTimeout);
        }
    } else {
        document.body.style.cursor = "auto";
    }

    cursorTimeout = setTimeout(function() {
        if (document.documentElement.classList.contains("draft")) {
            return;
        }

        document.body.style.cursor = "none";
    }, 2000);
};
