"use strict";
// Keep the same real portraits on public and management pages, even after renaming.
const STONE_PHOTOS = {
  SF70489F2C749F909: "stone-photos/kvetko.png",
  S2A563A3C160F96BA: "stone-photos/obrazko.png",
};
const stoneImagePath = stone => STONE_PHOTOS[stone.id] || stone.image;
