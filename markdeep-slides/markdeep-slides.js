var currentSlideNum = 0;
var slideCount = 0;

var theme;
var presenterNotesWindow;

// process options, break rendered markdeep into slides on <hr> tags (unless the
// class "ignore" is set), kick off some other init tasks as well
function initSlides() {

    // process options
    var diagramZoom = 1.0;
    if (markdeepSlidesOptions) {
        if (markdeepSlidesOptions.aspectRatio) {
            document.documentElement.style.setProperty('--aspect-ratio', markdeepSlidesOptions.aspectRatio);
            var sheet = document.createElement('style');
            sheet.innerHTML = "@page { size: 640px " + (1 + 640 / markdeepSlidesOptions.aspectRatio) + "px; };";
            document.body.appendChild(sheet);
        }
        if (markdeepSlidesOptions.theme) {
            theme = markdeepSlidesOptions.theme;
            var link = document.createElement('link');
            link.setAttribute("rel", "stylesheet");
            link.setAttribute("href", "markdeep-slides/themes/" + theme + ".css");
            document.body.appendChild(link);
        }
        if (markdeepSlidesOptions.fontSize) {
            document.documentElement.style.setProperty('--font-size', markdeepSlidesOptions.fontSize);
        }
        if (markdeepSlidesOptions.diagramZoom) {
            diagramZoom = markdeepSlidesOptions.diagramZoom;
        }
    }

    // break document into slides
    var md = document.querySelector("body > .md");
    var es = Array.from(md.childNodes);

    function isSlideBreak(e) {
        return e.tagName == "HR" && e.className != 'ignore';
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
                sn.innerHTML = slideCount;
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
    md.innerHTML = '<div id="black"></div>';  // insert black element
    for (var j = 0; j < slides.length; j++) {
        var s = slides[j];
        md.appendChild(s);
    }

    // further initialization steps
    processLocationHash();
    addLetterboxing();
    relativizeDiagrams(diagramZoom);
    pauseVideos();

    fullscreenActions();
};

// check if a slide is set via the location hash – if so, load it, else
// write the first slide to it. either way, go to that slide
function processLocationHash() {
    var slideNum;
    if (window.location.hash) {
        var slide = window.location.hash.substring(1);
        var slideNum = parseInt(slide.substring(5), 10);
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

    document.querySelectorAll("svg").forEach(function(diag) {
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
// location hash to the value it was before entering fullscreen
var enableScroll = true;

// when scrolling, update location hash (and presenter notes etc.) based on
// which slide is visible right now. only makes sense in draft mode
function updateOnScroll() {
    if (!enableScroll || document.documentElement.classList.contains("presentation")) {
        return;
    }

    var slides = document.getElementsByClassName("slide");
    var minTop = -1;
    var minSlideNum = 0;
    for (var i = 0; i < slides.length; i++) {
        var slide = slides[i];
        var bcr = slide.getBoundingClientRect();

        if (bcr.top >= 0 && (bcr.top < minTop || minTop == -1)) {
            minTop = bcr.top;
            minSlideNum = parseInt(slide.id.substring(5), 10);
        }
    }

    if (minSlideNum != currentSlideNum) {
        history.replaceState({}, '', '#' + "slide" + minSlideNum);
        currentSlideNum = minSlideNum;
        updatePresenterNotes(minSlideNum);
    }
}
window.addEventListener('scroll', updateOnScroll);

// switch to slide n
function showSlide(slideNum) {
    if (document.documentElement.classList.contains("draft")) {
        Array.from(document.getElementsByClassName("slide")).map(e => e.style.display = "inline-block");

        // fix for chrome sometimes mistiming scroll events (or at least that's what I think is going on)
        enableScroll = false;
        document.getElementById("slide" + slideNum).scrollIntoView();
        setTimeout(function () {
            enableScroll = true;
        }, 10);
    } else if (document.documentElement.classList.contains("presentation")) {
        Array.from(document.getElementsByClassName("slide")).map(e => e.style.display = "none");
        document.getElementById("slide" + slideNum).style.display = "inline-block";

        pauseVideos();
        playAutoplayingVideos(slideNum);
    }
    history.replaceState({}, '', '#' + "slide" + slideNum);
    currentSlideNum = slideNum;

    updatePresenterNotes(slideNum);
}

// load presenter notes for slide n into presenter notes window
function updatePresenterNotes(slideNum) {
    var presenterNotes = "";

    var presenterNotesElement = document.getElementById("slide" + slideNum).querySelector(".slide-presenter-notes");
    if (presenterNotesElement) {
        presenterNotes = presenterNotesElement.innerHTML;
    }

    if (presenterNotesWindow) {
        presenterNotesWindow.document.getElementById("slide-number").innerHTML = slideNum + "/" + (slideCount - 1);
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

// my best shot at a works-everywhere "fullscreen?" predicate, which will
// invariably break in the future. web development is great!
function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement ||
              window.fullScreen ||
              (window.innerHeight == screen.height && window.innerWidth == screen.width));
}

// toggles fullscreen mode, upon which the fullscreenchange event is fired
// (which is *also* fired when a user leaves fullscreen via the Esc key, so we
// *do* need to rely on it), so there's no need to call fullscreenActions()
// directly in here
function toggleFullscreen() {
    var root = document.documentElement;
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
    if (black.style.display === "none") {
        black.style.display = "block";
    } else {
        black.style.display = "none";
    }
}

// keyboard/presenter controls (these map well to my logitech r400
// presenter, others may vary)
document.body.onkeydown = keyPress
function keyPress(event) {
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
      default:
        break;
    }
};

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

// open or close presenter notes window
function togglePresenterNotes() {
    if (presenterNotesWindow) {
        presenterNotesWindow.close();
        presenterNotesWindow = null;
        return;
    }

    if (theme) {
        presenterNotesLink = '<link rel="stylesheet" href="markdeep-slides/themes/' + theme + '.css">';
    }
    presenterNotesWindow = window.open("", "presenternotes", "");

    if (presenterNotesWindow) {
        with (presenterNotesWindow.document) {
            open("text/html", "replace");
            write(`
<html>
<head>
    <title>Presenter Notes</title>
    <style>
        body {
            font-family: sans-serif;
        }
    </style>
    ${presenterNotesLink}
    <style>
        html {
            font-size: 3vw;
        }
        body {
            margin: 0;
            background-image: linear-gradient(#222, #111);
            color: white;
        }
        body .presenter-notes > div.meta {
            font-family: sans-serif;
            font-size: 1.75rem;
            background-color: #000;
            padding: 0.2em 1rem 0.2em;
            line-height: 1em;
        }
        body .presenter-notes > div.meta #time {
            float: left;
        }
        body .presenter-notes > div.meta #time .seconds {
            opacity: 0.5;
        }
        body .presenter-notes > div.meta #slide-number {
            float: right;
        }
        body .presenter-notes > div#presenter-notes {
            margin: 1rem;
        }
    </style>
</head>
<body>
    <div class="presenter-notes">
        <div class="meta">
            <div id="time"></div>
            <div id="slide-number">${currentSlideNum + "/" + (slideCount - 1)}</div>
            &nbsp;
        </div>
        <div id="presenter-notes"></div>
    </div>
    <script>
        document.body.onkeydown = function(event) {
            opener.keyPress(event);
        };
        function updateTime() {
            var time = new Date();
            time = ('0' + time.getHours()).slice(-2)   + ':' +
                   ('0' + time.getMinutes()).slice(-2) + '<span class="seconds">:' +
                   ('0' + time.getSeconds()).slice(-2) + '</span>';
            document.getElementById('time').innerHTML = time;
        }
        updateTime();
        setInterval(updateTime, 1000);
    </script>
</body>
</html>`);
            close();
        }
    }

    updatePresenterNotes(currentSlideNum);
}
