*(Really just a note to self.)*

When upgrading any of these dependencies, keep the following in mind:


## Markdeep

* Add support (and maybe an example in the demo) for any newly added constructs.
* Get the new `relativize.css` from [here](https://github.com/doersino/markdeep-relative-sizes).
* Update the include paths at the bottom of the demo to match the new version.


## MathJax

* [Strip it down](https://github.com/mathjax/MathJax-docs/wiki/Guide:-reducing-size-of-a-mathjax-installation/1814429ed1e97bfb7675c0fd400804baa9287249) to match the currently included version in terms of feature set and size.
* Update the include path at the bottom of the demo to match the new version.


## Webfonts

* Download new versions of ... from ...:
    * IBM Plex Mono from https://github.com/IBM/plex
    * Iosevka from https://github.com/be5invis/Iosevka
    * Libre Franklin from https://github.com/impallari/Libre-Franklin
    * Source Sans Pro from https://github.com/adobe-fonts/source-sans-pro
    * Source Serif Pro from https://github.com/adobe-fonts/source-serif-pro
    * Vollkorn from http://www.vollkorn-typeface.com
* Update their import paths in the themes that use them.
