"use strict";
// The UI consumes this model through the repository in app.js. Replace that
// repository with an API later; the cards, maps and detail need no redesign.
const DEMO_STONES = [
  {
    id: "A1",
    name: "Sunny Side",
    tagline: "A little sunshine, wherever you go.",
    color: "#c5a34d",
    theme: "sun",
    image: "stone-1.svg",
    code: "SUN24",
    started: "2025-04-12",
    story:
      "Painted on a rainy afternoon in Bratislava, Sunny Side was made to bring a little warmth to an ordinary day. Its only mission? Find the sunny side of every place and every person it meets.",
    finds: [
      {
        date: "2025-04-12",
        city: "Bratislava",
        country: "Slovakia",
        lat: 48.1486,
        lon: 17.1077,
        nickname: "Nina",
        message:
          "Left this little sunshine by the Danube. Here’s to the first of many adventures!",
      },
      {
        date: "2025-06-03",
        city: "Vienna",
        country: "Austria",
        lat: 48.2082,
        lon: 16.3738,
        nickname: "Felix",
        message:
          "Found it on my morning walk. Took it along for a picnic in the Prater.",
      },
      {
        date: "2025-09-18",
        city: "Ljubljana",
        country: "Slovenia",
        lat: 46.0569,
        lon: 14.5058,
        nickname: "Maja",
        message:
          "A tiny sun on a bench in Tivoli Park. Exactly what I needed after a long week.",
      },
      {
        date: "2026-03-21",
        city: "Barcelona",
        country: "Spain",
        lat: 41.3874,
        lon: 2.1686,
        nickname: "Leo",
        message:
          "My daughter spotted it near the beach. She calls it her pocket sunshine.",
      },
      {
        date: "2026-09-26",
        city: "Lisbon",
        country: "Portugal",
        lat: 38.7223,
        lon: -9.1393,
        nickname: "Inês",
        message:
          "Found beside a lovely viewpoint in Graça. Leaving it here with the best sunset in town.",
      },
    ],
  },
  {
    id: "B2",
    name: "Little Luna",
    tagline: "For the dreamers and the night owls.",
    color: "#9290be",
    theme: "moon",
    image: "stone-2.svg",
    code: "MOON7",
    started: "2025-07-20",
    story:
      "Little Luna began as a quiet reminder: even the darkest nights have a little light. Painted with a crescent moon and a handful of stars, it has been collecting dreams from strangers ever since.",
    finds: [
      {
        date: "2025-07-20",
        city: "Prague",
        country: "Czechia",
        lat: 50.0755,
        lon: 14.4378,
        nickname: "Tereza",
        message:
          "A moon for someone who needs a fresh start. The journey begins in Letná Park.",
      },
      {
        date: "2025-10-04",
        city: "Berlin",
        country: "Germany",
        lat: 52.52,
        lon: 13.405,
        nickname: "Jonas",
        message: "Found after a gig. It travelled home in my jacket pocket.",
      },
      {
        date: "2026-01-15",
        city: "Amsterdam",
        country: "Netherlands",
        lat: 52.3676,
        lon: 4.9041,
        nickname: "Noor",
        message:
          "Waiting on a canal-side bench. A small reminder to slow down.",
      },
      {
        date: "2026-05-30",
        city: "Stockholm",
        country: "Sweden",
        lat: 59.3293,
        lon: 18.0686,
        nickname: "Ella",
        message:
          "A little moon under the midnight sun. Took it on the ferry with me.",
      },
      {
        date: "2026-09-22",
        city: "Copenhagen",
        country: "Denmark",
        lat: 55.6761,
        lon: 12.5683,
        nickname: "Frederik",
        message:
          "Spotted in the botanical garden. Hope it finds another dreamer soon.",
      },
    ],
  },
  {
    id: "C3",
    name: "Slow Bloom",
    tagline: "Good things grow at their own pace.",
    color: "#739279",
    theme: "leaf",
    image: "stone-3.svg",
    code: "GROW3",
    started: "2026-02-14",
    story:
      "A tiny green sprout painted on a river stone. Slow Bloom is an invitation to breathe, take the scenic route, and remember that you do not need to have everything figured out to keep growing.",
    finds: [
      {
        date: "2026-02-14",
        city: "Budapest",
        country: "Hungary",
        lat: 47.4979,
        lon: 19.0402,
        nickname: "Eszter",
        message:
          "Made a little Valentine for the world. Left it on Margaret Island.",
      },
      {
        date: "2026-04-09",
        city: "Zagreb",
        country: "Croatia",
        lat: 45.815,
        lon: 15.9819,
        nickname: "Luka",
        message:
          "A lucky find during my lunch break. This little leaf made me smile.",
      },
      {
        date: "2026-06-17",
        city: "Lake Bled",
        country: "Slovenia",
        lat: 46.3683,
        lon: 14.1146,
        nickname: "Ana",
        message:
          "Found by the lake. Packed it for a weekend hike and left it by the path.",
      },
      {
        date: "2026-08-10",
        city: "Vienna",
        country: "Austria",
        lat: 48.2082,
        lon: 16.3738,
        nickname: "Sam",
        message:
          "A travelling plant! Sharing it with the next person in Stadtpark.",
      },
      {
        date: "2026-09-29",
        city: "Bratislava",
        country: "Slovakia",
        lat: 48.1486,
        lon: 17.1077,
        nickname: "Zuzka",
        message:
          "Resting in the shade at Sad Janka Kráľa. A lovely pause in a busy day.",
      },
    ],
  },
  {
    id: "D4",
    name: "Wildheart",
    tagline: "A small reminder that you belong.",
    color: "#cc816b",
    theme: "heart",
    image: "stone-4.svg",
    code: "LOVE4",
    started: "2025-05-01",
    story:
      "Wildheart has a big red heart and absolutely no itinerary. Its maker left it out as a little act of kindness. Now it hops between cities, reminding strangers that the world can still be a friendly place.",
    finds: [
      {
        date: "2025-05-01",
        city: "London",
        country: "United Kingdom",
        lat: 51.5074,
        lon: -0.1278,
        nickname: "Jules",
        message:
          "Painted this with my flatmate. Left it in a quiet corner of Hampstead Heath.",
      },
      {
        date: "2025-08-12",
        city: "Paris",
        country: "France",
        lat: 48.8566,
        lon: 2.3522,
        nickname: "Camille",
        message: "A little heart beside the Seine. It came on holiday with us.",
      },
      {
        date: "2025-12-06",
        city: "New York",
        country: "United States",
        lat: 40.7128,
        lon: -74.006,
        nickname: "Alex",
        message:
          "Found in Central Park. Someone’s kindness made it across an ocean.",
      },
      {
        date: "2026-04-25",
        city: "Vancouver",
        country: "Canada",
        lat: 49.2827,
        lon: -123.1207,
        nickname: "Riley",
        message:
          "A surprise on the seawall. Carrying it a little farther down the coast.",
      },
      {
        date: "2026-09-24",
        city: "San Francisco",
        country: "United States",
        lat: 37.7749,
        lon: -122.4194,
        nickname: "Morgan",
        message:
          "Found near Golden Gate Park. A tiny heart for a very big city.",
      },
    ],
  },
  {
    id: "E5",
    name: "Ocean Echo",
    tagline: "Always chasing the next horizon.",
    color: "#6e98b1",
    theme: "wave",
    image: "stone-5.svg",
    code: "WAVE5",
    started: "2025-09-06",
    story:
      "Ocean Echo carries a painted wave and the spirit of a seaside morning. It started near the Adriatic, but its curiosity keeps taking it farther. Every finder adds another ripple to its story.",
    finds: [
      {
        date: "2025-09-06",
        city: "Split",
        country: "Croatia",
        lat: 43.5081,
        lon: 16.4402,
        nickname: "Petra",
        message:
          "A wave that fits in your hand. Left it by the harbour for a fellow traveller.",
      },
      {
        date: "2025-11-21",
        city: "Athens",
        country: "Greece",
        lat: 37.9838,
        lon: 23.7275,
        nickname: "Nikos",
        message:
          "Found after a stroll. It’s coming on a much longer adventure with me.",
      },
      {
        date: "2026-02-08",
        city: "Bangkok",
        country: "Thailand",
        lat: 13.7563,
        lon: 100.5018,
        nickname: "May",
        message:
          "A tiny piece of the sea in the middle of the city. Such a lovely surprise.",
      },
      {
        date: "2026-06-14",
        city: "Seoul",
        country: "South Korea",
        lat: 37.5665,
        lon: 126.978,
        nickname: "Jiwoo",
        message:
          "Spotted beside the Han River. Leaving it for another explorer.",
      },
      {
        date: "2026-09-28",
        city: "Tokyo",
        country: "Japan",
        lat: 35.6762,
        lon: 139.6503,
        nickname: "Haru",
        message:
          "Found in Yoyogi Park on a sunny afternoon. The next horizon is waiting.",
      },
    ],
  },
];
const DEMO_PLACES = [
  { city: "Bratislava", country: "Slovakia", lat: 48.1486, lon: 17.1077 },
  { city: "Vienna", country: "Austria", lat: 48.2082, lon: 16.3738 },
  { city: "Prague", country: "Czechia", lat: 50.0755, lon: 14.4378 },
  { city: "London", country: "United Kingdom", lat: 51.5074, lon: -0.1278 },
  { city: "Lisbon", country: "Portugal", lat: 38.7223, lon: -9.1393 },
  { city: "New York", country: "United States", lat: 40.7128, lon: -74.006 },
  { city: "Tokyo", country: "Japan", lat: 35.6762, lon: 139.6503 },
  { city: "Sydney", country: "Australia", lat: -33.8688, lon: 151.2093 },
];
