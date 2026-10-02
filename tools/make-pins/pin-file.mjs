/**
 * One place that decides a pin's descriptive filename.
 *
 * Pins used to be named after the page slug alone (pins/emma.jpg), which says
 * nothing about what the image shows and does not help image search. Every pin
 * is now <slug>-chinese-calligraphy-<kind>.jpg, e.g.
 * pins/emma-chinese-calligraphy-name.jpg.
 *
 * The three kinds keep names, single words and guide pages apart so no two
 * files collide. make-pins.mjs, make-og-pins.mjs and set-og-images.mjs all read
 * this map, so the renderer and the pages can never disagree about a filename.
 */
const KIND = {
  // Name pages and name pins: a person's name in brush letters.
  emma: "name",
  michael: "name",
  sophia: "name",
  james: "name",
  grace: "name",
  lily: "name",
  ethan: "name",
  olivia: "name",
  liam: "name",
  noah: "name",
  ava: "name",
  oliver: "name",
  mia: "name",
  lucas: "name",
  luna: "name",
  // Single-word landing pages.
  love: "word",
  peace: "word",
  hope: "word",
  dream: "word",
  // Guide pages.
  "name-in-chinese-calligraphy": "guide",
  "chinese-calligraphy-tattoo-ideas": "guide",
  "meaning-of-chinese-characters": "guide",
  "custom-chinese-name-gift": "guide",
};

export function pinKind(slug) {
  return KIND[slug.toLowerCase()] || "name";
}

export function pinFile(slug) {
  const s = slug.toLowerCase();
  return `${s}-chinese-calligraphy-${pinKind(s)}.jpg`;
}
