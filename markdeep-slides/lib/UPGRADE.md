When upgrading any of these dependencies, keep the following in mind:

* Update the paths at the bottom of the demo presentation to match the new version of the upgraded dependency.


## Markdeep

* Check if any of the non-relatively defined sizes in the built-in stylesheet have changed or new ones have been added.
    * If so, modify `../reset.css` accordingly.
* Add support (and maybe a slide in the demo presentation) for any newly added constructs.


## MathJax

* [Strip it down](https://github.com/mathjax/MathJax-docs/wiki/Guide:-reducing-size-of-a-mathjax-installation/1814429ed1e97bfb7675c0fd400804baa9287249) to match the currently included version in terms of feature set and size.
