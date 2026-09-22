# Intent: Dark Mode in the Wall

**Author:** Manel e Edu · **Date:** 2026-09-22 · **Status:** draft

## Problem

The wall is functional but its hard to read it at night beacuse of the white background and we want to implement a darkmode color schema so that the experience is more confortable for the users. 

## Proposed outcome

The outcome is a a togle that switch between dark mode and white mode. In the white mode as it stands the background is white and the colorschema uses light colors 
in the darkmode the background is a grayish color and the colorschema needs to change to a lighter color so the black text is still readable. The change is instantaneous and the default mode is whitemode.

## Affected users and systems

Each attendee in their browser. The systems that need to be changed is only the frontend, we need a new togle and all the shapes and text fields need to have a new argument of darkmode on or off 
and a defined color that links to that color mode.

## Constraints


- The darkmode togle variable lives on the user side, on the browser, and does not need the backend.
- The togle lives in the top right corner and has an animation to when togled.
- The change is live and do not need a page refresh.
- The color mode lives through page refreshs.
- Tests ships with the code: color change correctly, change live, lives through pages refresh.
- The togle respects the color schema and design of the rest of the project.

## Open questions

- The spec asks for a change a color change in the darkmode but the schema its not fully defined, needs proper defining.
- Where the variable of the color shema (dark or white) is stored, browser, cookies?
