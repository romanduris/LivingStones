"use strict";
// Fictional journeys near Bratislava. Demo addresses and coordinates illustrate
// the experience; they do not claim to locate real stones.
const DEMO_STONES = [
  {
    id: "A1",
    demo: true,
    name: "Sunny Side",
    color: "#c5a34d",
    theme: "sun",
    image: "stone-1.svg",
    code: "8451",
    started: "2025-04-12",
    finds: [
      {
        date: "2025-04-12",
        city: "Bratislava",
        country: "Slovakia",
        lat: 48.1346,
        lon: 17.1129,
        address: "Sad Janka Kráľa, Petržalka, Bratislava",
        nickname: "Nina",
        message:
          "Painted this on a rainy morning. Left it by the park path for its first adventure.",
      },
      {
        date: "2025-06-03",
        city: "Bratislava",
        country: "Slovakia",
        lat: 48.1432,
        lon: 17.1083,
        address: "Hviezdoslavovo námestie, Old Town, Bratislava",
        nickname: "Tomáš",
        message:
          "Spotted a tiny sun after work. It made the walk home a bit brighter.",
      },
      {
        date: "2025-09-18",
        city: "Pezinok",
        country: "Slovakia",
        lat: 48.2884,
        lon: 17.267,
        address: "Zámocký park, Mladoboleslavská, Pezinok",
        nickname: "Maja",
        message:
          "Found it in the castle park. Taking it on our weekend picnic.",
      },
      {
        date: "2026-03-21",
        city: "Senec",
        country: "Slovakia",
        lat: 48.2194,
        lon: 17.4204,
        address: "Slnečné jazerá, lakeside path, Senec",
        nickname: "Adam",
        message:
          "A sunny surprise by the lake. My little sister said we should pass it on.",
      },
      {
        date: "2026-09-26",
        city: "Trnava",
        country: "Slovakia",
        lat: 48.3774,
        lon: 17.587,
        address: "Bernolákov sad, Trnava",
        nickname: "Lucia",
        message:
          "Resting on a bench in Bernolákov sad. Hope it makes someone else smile.",
      },
    ],
  },
  {
    id: "B2",
    demo: true,
    name: "Little Luna",
    color: "#9290be",
    theme: "moon",
    image: "stone-2.svg",
    code: "8452",
    started: "2025-07-20",
    finds: [
      {
        date: "2025-07-20",
        city: "Bratislava",
        country: "Slovakia",
        lat: 48.2112,
        lon: 17.1535,
        address: "Námestie Andreja Hlinku, Rača, Bratislava",
        nickname: "Tereza",
        message:
          "A little moon for a new beginning. Leaving it near my favourite walking route.",
      },
      {
        date: "2025-10-04",
        city: "Bratislava",
        country: "Slovakia",
        lat: 48.1917,
        lon: 17.0735,
        address: "Železná studnička, Bratislava Forest Park",
        nickname: "Jakub",
        message:
          "Found after a forest walk. It joined us for tea from a thermos.",
      },
      {
        date: "2026-01-15",
        city: "Devín",
        country: "Slovakia",
        lat: 48.1733,
        lon: 16.9807,
        address: "Slovanské nábrežie, Devín, Bratislava",
        nickname: "Eva",
        message:
          "A tiny moon with a view of the river. Taking it across the border next weekend.",
      },
      {
        date: "2026-05-30",
        city: "Hainburg",
        country: "Austria",
        lat: 48.1463,
        lon: 16.944,
        address: "Donaulände, riverside promenade, Hainburg an der Donau",
        nickname: "Lukas",
        message:
          "Waiting by the Danube. A lovely little visitor from Slovakia.",
      },
      {
        date: "2026-09-22",
        city: "Vienna",
        country: "Austria",
        lat: 48.2035,
        lon: 16.38,
        address: "Stadtpark, Parkring, Vienna",
        nickname: "Anna",
        message:
          "Found in Stadtpark after class. Leaving it for another daydreamer.",
      },
    ],
  },
  {
    id: "C3",
    demo: true,
    name: "Slow Bloom",
    color: "#739279",
    theme: "leaf",
    image: "stone-3.svg",
    code: "8453",
    started: "2026-02-14",
    finds: [
      {
        date: "2026-02-14",
        city: "Bratislava",
        country: "Slovakia",
        lat: 48.1483,
        lon: 17.0709,
        address: "Botanická ulica, Karlova Ves, Bratislava",
        nickname: "Ana",
        message:
          "A little green Valentine for the world. The first chapter starts here.",
      },
      {
        date: "2026-04-09",
        city: "Bratislava",
        country: "Slovakia",
        lat: 48.1917,
        lon: 17.0735,
        address: "Železná studnička, Bratislava Forest Park",
        nickname: "Peter",
        message: "Spotted beside the trail. A good excuse to stop rushing.",
      },
      {
        date: "2026-06-17",
        city: "Malacky",
        country: "Slovakia",
        lat: 48.4389,
        lon: 17.0219,
        address: "Zámocký park, Zámocká ulica, Malacky",
        nickname: "Sofia",
        message:
          "My son found it in the castle park. We called it our travelling plant.",
      },
      {
        date: "2026-08-10",
        city: "Pezinok",
        country: "Slovakia",
        lat: 48.2884,
        lon: 17.267,
        address: "Zámocký park, Mladoboleslavská, Pezinok",
        nickname: "Matej",
        message:
          "A leaf-shaped hello on a picnic bench. Taking the scenic route with it.",
      },
      {
        date: "2026-09-29",
        city: "Modra",
        country: "Slovakia",
        lat: 48.3345,
        lon: 17.3074,
        address: "Štúrova ulica, Modra town centre",
        nickname: "Zuzka",
        message:
          "Found on a slow Sunday walk. Left it near the centre for the next explorer.",
      },
    ],
  },
  {
    id: "D4",
    demo: true,
    name: "Wildheart",
    color: "#cc816b",
    theme: "heart",
    image: "stone-4.svg",
    code: "8454",
    started: "2025-05-01",
    finds: [
      {
        date: "2025-05-01",
        city: "Devín",
        country: "Slovakia",
        lat: 48.1733,
        lon: 16.9807,
        address: "Slovanské nábrežie, Devín, Bratislava",
        nickname: "Ema",
        message:
          "Painted a little heart for someone I’ll never meet. Its journey starts by the river.",
      },
      {
        date: "2025-08-12",
        city: "Bratislava",
        country: "Slovakia",
        lat: 48.1432,
        lon: 17.1083,
        address: "Hviezdoslavovo námestie, Old Town, Bratislava",
        nickname: "Martin",
        message:
          "Found on the way to meet a friend. A small thing that made a good day better.",
      },
      {
        date: "2025-12-06",
        city: "Petronell-Carnuntum",
        country: "Austria",
        lat: 48.1115,
        lon: 16.8679,
        address: "Hauptplatz, Petronell-Carnuntum",
        nickname: "Clara",
        message:
          "A cheerful surprise after our museum visit. Bringing it on a winter walk.",
      },
      {
        date: "2026-04-25",
        city: "Vienna",
        country: "Austria",
        lat: 48.2035,
        lon: 16.38,
        address: "Stadtpark, Parkring, Vienna",
        nickname: "Felix",
        message:
          "A little heart in a big park. I like that it already has so many stories.",
      },
      {
        date: "2026-09-24",
        city: "Hainburg",
        country: "Austria",
        lat: 48.1463,
        lon: 16.944,
        address: "Donaulände, riverside promenade, Hainburg an der Donau",
        nickname: "Lea",
        message:
          "Back beside the Danube. Leaving it on the promenade for another kind stranger.",
      },
    ],
  },
  {
    id: "E5",
    demo: true,
    name: "Ocean Echo",
    color: "#6e98b1",
    theme: "wave",
    image: "stone-5.svg",
    code: "8455",
    started: "2025-09-06",
    finds: [
      {
        date: "2025-09-06",
        city: "Čunovo",
        country: "Slovakia",
        lat: 48.032,
        lon: 17.2307,
        address: "Danube riverside path, Čunovo, Bratislava",
        nickname: "Hana",
        message:
          "A wave for a fellow cyclist. Leaving it beside the riverside path.",
      },
      {
        date: "2025-11-21",
        city: "Šamorín",
        country: "Slovakia",
        lat: 48.0286,
        lon: 17.3095,
        address: "Gazdovský rad, Šamorín town centre",
        nickname: "Michal",
        message:
          "A tiny blue surprise on our family walk. It came home in my jacket pocket.",
      },
      {
        date: "2026-02-08",
        city: "Mosonmagyaróvár",
        country: "Hungary",
        lat: 47.876,
        lon: 17.2698,
        address: "Várkert, castle garden, Mosonmagyaróvár",
        nickname: "Eszter",
        message:
          "Found in the castle garden. A little piece of the river visiting Hungary.",
      },
      {
        date: "2026-06-14",
        city: "Gabčíkovo",
        country: "Slovakia",
        lat: 47.8917,
        lon: 17.5783,
        address: "Danube cycle path near the Gabčíkovo lock",
        nickname: "Dávid",
        message:
          "Spotted on a cycling break. This wave has almost as many kilometres as me.",
      },
      {
        date: "2026-09-28",
        city: "Dunajská Streda",
        country: "Slovakia",
        lat: 47.9933,
        lon: 17.6172,
        address: "Museum garden, Múzejná ulica, Dunajská Streda",
        nickname: "Réka",
        message:
          "Waiting quietly in the museum garden. The next little adventure starts here.",
      },
    ],
  },
  {
    "id": "F6",
    "demo": true,
    "name": "Hello Pebble",
    "color": "#ac9fba",
    "theme": "hello",
    "image": "stone-6.svg",
    "code": "8456",
    "started": "2025-05-18",
    "finds": [
      {
        "date": "2025-05-18",
        "city": "Bratislava",
        "country": "Slovakia",
        "lat": 48.1346,
        "lon": 17.1129,
        "address": "Sad Janka Kráľa, Petržalka, Bratislava",
        "nickname": "Nina",
        "message": "A little hello painted for whoever needs a smile."
      },
      {
        "date": "2025-09-07",
        "city": "Hainburg",
        "country": "Austria",
        "lat": 48.1463,
        "lon": 16.944,
        "address": "Donaulände, riverside promenade, Hainburg an der Donau",
        "nickname": "Oliver",
        "message": "Found our chatty pebble beside the river."
      },
      {
        "date": "2026-02-15",
        "city": "Vienna",
        "country": "Austria",
        "lat": 48.2035,
        "lon": 16.38,
        "address": "Stadtpark, Parkring, Vienna",
        "nickname": "Hana",
        "message": "Taking a tiny greeting on a day trip."
      },
      {
        "date": "2026-07-20",
        "city": "Senec",
        "country": "Slovakia",
        "lat": 48.2194,
        "lon": 17.4204,
        "address": "Slnečné jazerá, lakeside path, Senec",
        "nickname": "Marek",
        "message": "A lovely surprise in the park. Passing it on."
      },
      {
        "date": "2026-10-03",
        "city": "Čunovo",
        "country": "Slovakia",
        "lat": 48.032,
        "lon": 17.2307,
        "address": "Danube riverside path, Čunovo, Bratislava",
        "nickname": "Eva",
        "message": "Hello from the Danube! Left it by the walking path."
      }
    ]
  },
  {
    "id": "G7",
    "demo": true,
    "name": "Lucky Clover",
    "color": "#7caa81",
    "theme": "clover",
    "image": "stone-7.svg",
    "code": "8457",
    "started": "2025-08-10",
    "finds": [
      {
        "date": "2025-08-10",
        "city": "Hainburg",
        "country": "Austria",
        "lat": 48.1463,
        "lon": 16.944,
        "address": "Donaulände, riverside promenade, Hainburg an der Donau",
        "nickname": "Zuzana",
        "message": "Four leaves and a little wish for a happy journey."
      },
      {
        "date": "2025-11-16",
        "city": "Čunovo",
        "country": "Slovakia",
        "lat": 48.032,
        "lon": 17.2307,
        "address": "Danube riverside path, Čunovo, Bratislava",
        "nickname": "Leo",
        "message": "A lucky find on our Sunday walk."
      },
      {
        "date": "2026-03-29",
        "city": "Bratislava",
        "country": "Slovakia",
        "lat": 48.1346,
        "lon": 17.1129,
        "address": "Sad Janka Kráľa, Petržalka, Bratislava",
        "nickname": "Kata",
        "message": "This clover came along for a family picnic."
      },
      {
        "date": "2026-08-01",
        "city": "Vienna",
        "country": "Austria",
        "lat": 48.2035,
        "lon": 16.38,
        "address": "Stadtpark, Parkring, Vienna",
        "nickname": "Anna",
        "message": "Sending a little luck to the next friend."
      },
      {
        "date": "2026-10-02",
        "city": "Pezinok",
        "country": "Slovakia",
        "lat": 48.2884,
        "lon": 17.267,
        "address": "Zámocký park, Mladoboleslavská, Pezinok",
        "nickname": "Filip",
        "message": "Found a green friend in the castle park today."
      }
    ]
  },
  {
    "id": "H8",
    "demo": true,
    "name": "Little Ember",
    "color": "#d69564",
    "theme": "flame",
    "image": "stone-8.svg",
    "code": "8458",
    "started": "2025-10-04",
    "finds": [
      {
        "date": "2025-10-04",
        "city": "Bratislava",
        "country": "Slovakia",
        "lat": 48.1346,
        "lon": 17.1129,
        "address": "Sad Janka Kráľa, Petržalka, Bratislava",
        "nickname": "Peter",
        "message": "Painted a small flame to warm someone’s day."
      },
      {
        "date": "2025-12-21",
        "city": "Pezinok",
        "country": "Slovakia",
        "lat": 48.2884,
        "lon": 17.267,
        "address": "Zámocký park, Mladoboleslavská, Pezinok",
        "nickname": "Sofia",
        "message": "A warm little companion for a winter walk."
      },
      {
        "date": "2026-04-11",
        "city": "Vienna",
        "country": "Austria",
        "lat": 48.2035,
        "lon": 16.38,
        "address": "Stadtpark, Parkring, Vienna",
        "nickname": "Ben",
        "message": "Taking Ember to see another town."
      },
      {
        "date": "2026-08-23",
        "city": "Čunovo",
        "country": "Slovakia",
        "lat": 48.032,
        "lon": 17.2307,
        "address": "Danube riverside path, Čunovo, Bratislava",
        "nickname": "Jana",
        "message": "A tiny campfire without the smoke."
      },
      {
        "date": "2026-10-01",
        "city": "Senec",
        "country": "Slovakia",
        "lat": 48.2194,
        "lon": 17.4204,
        "address": "Slnečné jazerá, lakeside path, Senec",
        "nickname": "Max",
        "message": "Left this little flame by the lakeside path."
      }
    ]
  },
  {
    "id": "I9",
    "demo": true,
    "name": "Cloud Nine",
    "color": "#8eb4cb",
    "theme": "cloud",
    "image": "stone-9.svg",
    "code": "8459",
    "started": "2025-06-22",
    "finds": [
      {
        "date": "2025-06-22",
        "city": "Senec",
        "country": "Slovakia",
        "lat": 48.2194,
        "lon": 17.4204,
        "address": "Slnečné jazerá, lakeside path, Senec",
        "nickname": "Lenka",
        "message": "A fluffy cloud for a bright new adventure."
      },
      {
        "date": "2025-10-19",
        "city": "Bratislava",
        "country": "Slovakia",
        "lat": 48.1346,
        "lon": 17.1129,
        "address": "Sad Janka Kráľa, Petržalka, Bratislava",
        "nickname": "Sam",
        "message": "This cloud travelled in my pocket all afternoon."
      },
      {
        "date": "2026-03-08",
        "city": "Pezinok",
        "country": "Slovakia",
        "lat": 48.2884,
        "lon": 17.267,
        "address": "Zámocký park, Mladoboleslavská, Pezinok",
        "nickname": "Mia",
        "message": "A calm little find after a busy week."
      },
      {
        "date": "2026-06-28",
        "city": "Hainburg",
        "country": "Austria",
        "lat": 48.1463,
        "lon": 16.944,
        "address": "Donaulände, riverside promenade, Hainburg an der Donau",
        "nickname": "David",
        "message": "Showing our cloud the riverside."
      },
      {
        "date": "2026-09-30",
        "city": "Vienna",
        "country": "Austria",
        "lat": 48.2035,
        "lon": 16.38,
        "address": "Stadtpark, Parkring, Vienna",
        "nickname": "Elena",
        "message": "Left a piece of sky for the next passer-by."
      }
    ]
  },
];
const DEMO_PLACES = [
  {
    city: "Bratislava",
    country: "Slovakia",
    lat: 48.1346,
    lon: 17.1129,
    address: "Sad Janka Kráľa, Petržalka, Bratislava",
  },
  {
    city: "Devín",
    country: "Slovakia",
    lat: 48.1733,
    lon: 16.9807,
    address: "Slovanské nábrežie, Devín, Bratislava",
  },
  {
    city: "Pezinok",
    country: "Slovakia",
    lat: 48.2884,
    lon: 17.267,
    address: "Zámocký park, Mladoboleslavská, Pezinok",
  },
  {
    city: "Trnava",
    country: "Slovakia",
    lat: 48.3774,
    lon: 17.587,
    address: "Bernolákov sad, Trnava",
  },
  {
    city: "Vienna",
    country: "Austria",
    lat: 48.2035,
    lon: 16.38,
    address: "Stadtpark, Parkring, Vienna",
  },
  {
    city: "Hainburg",
    country: "Austria",
    lat: 48.1463,
    lon: 16.944,
    address: "Donaulände, riverside promenade, Hainburg an der Donau",
  },
  {
    city: "Čunovo",
    country: "Slovakia",
    lat: 48.032,
    lon: 17.2307,
    address: "Danube riverside path, Čunovo, Bratislava",
  },
  {
    city: "Dunajská Streda",
    country: "Slovakia",
    lat: 47.9933,
    lon: 17.6172,
    address: "Museum garden, Múzejná ulica, Dunajská Streda",
  },
];
