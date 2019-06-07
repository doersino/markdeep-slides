var currentSlideNum;
var slideCount = 0;

var presenterNotesWindow;

// break rendered markdeep into slides on <hr> tags (unless the class
// "ignore" is set). insert slide numbers too. kick off some other init
// stuff as well. supply mode = "draft" to disable slide letterboxing.
function initSlides() {
    if (markdeepSlidesOptions) {
        if (markdeepSlidesOptions.mode) {
            var root = document.documentElement;
            root.classList.add(markdeepSlidesOptions.mode);
        }
        if (markdeepSlidesOptions.aspectRatio) {
            var sheet = document.createElement('style');
            sheet.innerHTML = "@page { size: 1000px " + 1000 / markdeepSlidesOptions.aspectRatio + "px; } :root {--aspect-ratio: " + markdeepSlidesOptions.aspectRatio + "}";
            document.body.appendChild(sheet);
        }
    }

    var md = document.querySelector("body > .md");
    var es = Array.from(md.childNodes);

    //var slideCount = 0;  // it's global
    var slides = [];
    var currentSlide = [];
    var currentPresenterNotes = [];
    for (var i = 0; i < es.length; i++) {
        var e = es[i];
        //console.log(e);

        // create new slide on hr or end of input
        if (e.tagName == "HR" && e.className != 'ignore' || i == es.length - 1) {
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

            // presenter notes (if any)
            if (currentPresenterNotes.length > 0) {
                var pn = document.createElement('div');
                pn.className = "presenter-notes";
                for (var j = 0; j < currentPresenterNotes.length; j++) {
                    pn.innerHTML += "<p>" + currentPresenterNotes[j] + "</p>";
                }
                slide.appendChild(pn);
            }

            // insert elements
            for (var j = 0; j < currentSlide.length; j++) {
                var se = currentSlide[j];

                if (se.tagName == "P" && se.innerHTML.trim().length == 0) {
                    // skip it
                } else {
                    slide.appendChild(se);
                }
            }

            slides.push(slide);
            slideCount++;
            currentSlide = [];
            currentPresenterNotes = [];
        } else {
            if (e.tagName == "BLOCKQUOTE"
                && e.children[0].tagName == "BLOCKQUOTE"
                && e.children[0].children[0].tagName == "BLOCKQUOTE") {

                // extract presenter notes from three nested blockquotes, in source ">>>"
                currentPresenterNotes.push(e.children[0].children[0].innerHTML);

            } else {
                currentSlide.push(e);
            }
        }
    }

    // replace content with slides
    md.innerHTML = '';
    md.innerHTML = '<div id="black"></div>';  // insert black element
    for (var j = 0; j < slides.length; j++) {
        var s = slides[j];
        md.appendChild(s);
    }

    // further initialization steps
    addLetterboxing();
    processHash();
};

// depending on whether your viewport is wider or taller than the aspect
// ratio of your slides, add a corresponding class to the root <html>
// element. based on this, letterboxing is added to keep your slides
// centered on a non-matching screen. until max() or min() or clamp() are
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

// check if a slide is set via the location hash – if so, load it, else
// write the first slide to it. either way, go to that slide
function processHash() {
    var slideNum;
    if (window.location.hash) {
        var slide = window.location.hash.substring(1);
        var slideNum = parseInt(slide.substring(5), 10);
    } else {
        var slideNum = 0;
    }
    scrollTo(slideNum);
}

// scroll to slide n
function scrollTo(slideNum) {
    document.getElementById("slide" + slideNum).scrollIntoView(true);
    history.replaceState({}, '', '#' + "slide" + slideNum);
    currentSlideNum = slideNum;

    updatePresenterNotes(slideNum);
}

// load presenter notes for slide n into presenter notes window
function updatePresenterNotes(slideNum) {
    var presenterNotesElement = document.getElementById("slide" + slideNum).querySelector(".presenter-notes");
    var presenterNotes = "";
    if (presenterNotesElement) {
        presenterNotes = presenterNotesElement.innerHTML;
    }
    if (presenterNotesWindow) {
        with (presenterNotesWindow.document) {
            open("text/html", "replace");
            write("<html><head><title>Presenter Notes</title></head><body>" + presenterNotes + "</body></html>");
            close();
        }
    }
}

function nextSlide() {
    if (currentSlideNum < slideCount - 1) {
        scrollTo(currentSlideNum + 1);
    }
}

function prevSlide() {
    if (currentSlideNum > 0) {
        scrollTo(currentSlideNum - 1);
    }
}

function toggleFullscreen() {
    var root = document.documentElement;
    var isFullscreen = window.fullScreen || (window.innerHeight == screen.height && window.innerWidth == screen.width);

    if (!isFullscreen) {
        if (root.requestFullscreen) {
            root.requestFullscreen();
        } else if (root.mozRequestFullScreen) {
            root.mozRequestFullScreen();
        } else if (root.webkitRequestFullscreen) {
            root.webkitRequestFullscreen();
        } else if (root.msRequestFullscreen) {
            root.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }

    // fix for some browsers losing their place
    setTimeout(function() {
        scrollTo(currentSlideNum);
    }, 500);
}

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
document.body.onkeydown = function(event) {
    switch (event.keyCode) {
      case 39:  // left
      case 40:  // down
      case 32:  // space
      case 34:  // pgdown
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
        openPresenterNotes();
        return false;
      default:
        break;
    }
};

// make cursor disappear after two seconds
// TODO only in fullscreen mode
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
        document.body.style.cursor = "none";
    }, 2000);
};

// TODO open a second view with the presenter notes (collect them in makeSlides()?)
function openPresenterNotes() {
    presenterNotesWindow = window.open("", "presenternotes", "");
    updatePresenterNotes(currentSlideNum);
}

// TODO when scrolling, update slide id slug? https://stackoverflow.com/questions/11760898/find-element-thats-on-the-middle-of-the-visible-screen-viewport-on-scroll

// TODO use local mathjax (might not have an internet connection where presentations are given)
