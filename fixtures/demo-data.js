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
  {
    "id": "J10",
    "demo": true,
    "name": "Mountain Whisper",
    "color": "#8d9da8",
    "theme": "mountain",
    "image": "stone-10.svg",
    "code": "8460",
    "started": "2025-03-15",
    "finds": [
      {
        "date": "2025-03-15",
        "city": "Bratislava",
        "country": "Slovakia",
        "lat": 48.1346,
        "lon": 17.1129,
        "address": "Sad Janka Kráľa, Petržalka, Bratislava",
        "nickname": "Daniel",
        "message": "A tiny mountain for anyone dreaming of the next walk."
      },
      {
        "date": "2025-08-17",
        "city": "Pezinok",
        "country": "Slovakia",
        "lat": 48.2884,
        "lon": 17.267,
        "address": "Zámocký park, Mladoboleslavská, Pezinok",
        "nickname": "Eva",
        "message": "Found our mountain beside the castle park path."
      },
      {
        "date": "2026-02-22",
        "city": "Modra",
        "country": "Slovakia",
        "lat": 48.3344,
        "lon": 17.3075,
        "address": "Town garden, Modra",
        "nickname": "Milan",
        "message": "Taking a quiet friend to the foot of the Little Carpathians."
      },
      {
        "date": "2026-07-12",
        "city": "Devín",
        "country": "Slovakia",
        "lat": 48.1735,
        "lon": 16.9783,
        "address": "Castle riverside path, Devín, Bratislava",
        "nickname": "Sára",
        "message": "A little peak with a lovely view of the Danube."
      },
      {
        "date": "2026-10-04",
        "city": "Hainburg",
        "country": "Austria",
        "lat": 48.1463,
        "lon": 16.944,
        "address": "Donaulände, riverside promenade, Hainburg an der Donau",
        "nickname": "Ben",
        "message": "Left it by the riverside, ready for another adventure."
      }
    ]
  },
  {
    "id": "K11",
    "demo": true,
    "name": "Star Scout",
    "color": "#c3ad78",
    "theme": "star",
    "image": "stone-11.svg",
    "code": "8461",
    "started": "2025-11-09",
    "finds": [
      {
        "date": "2025-11-09",
        "city": "Devín",
        "country": "Slovakia",
        "lat": 48.1735,
        "lon": 16.9783,
        "address": "Castle riverside path, Devín, Bratislava",
        "nickname": "Nora",
        "message": "Painted a small star to guide the next traveller home."
      },
      {
        "date": "2026-01-18",
        "city": "Bratislava",
        "country": "Slovakia",
        "lat": 48.1346,
        "lon": 17.1129,
        "address": "Sad Janka Kráľa, Petržalka, Bratislava",
        "nickname": "Tom",
        "message": "This star made our winter walk a bit brighter."
      },
      {
        "date": "2026-04-19",
        "city": "Hainburg",
        "country": "Austria",
        "lat": 48.1463,
        "lon": 16.944,
        "address": "Donaulände, riverside promenade, Hainburg an der Donau",
        "nickname": "Lili",
        "message": "A pocket-sized explorer on the way to Austria."
      },
      {
        "date": "2026-08-16",
        "city": "Vienna",
        "country": "Austria",
        "lat": 48.2035,
        "lon": 16.38,
        "address": "Stadtpark, Parkring, Vienna",
        "nickname": "David",
        "message": "Our little star came along for a day in the city."
      },
      {
        "date": "2026-10-02",
        "city": "Pezinok",
        "country": "Slovakia",
        "lat": 48.2884,
        "lon": 17.267,
        "address": "Zámocký park, Mladoboleslavská, Pezinok",
        "nickname": "Maja",
        "message": "Left it in the park for a new friend to discover."
      }
    ]
  },
  {
    "id": "L12",
    "demo": true,
    "name": "Tiny Turtle",
    "color": "#97b09a",
    "theme": "turtle",
    "image": "stone-12.svg",
    "code": "8462",
    "started": "2025-09-14",
    "finds": [
      {
        "date": "2025-09-14",
        "city": "Bratislava",
        "country": "Slovakia",
        "lat": 48.1346,
        "lon": 17.1129,
        "address": "Sad Janka Kráľa, Petržalka, Bratislava",
        "nickname": "Kata",
        "message": "A slow little turtle: there is always time to enjoy the journey."
      },
      {
        "date": "2025-12-07",
        "city": "Rajka",
        "country": "Hungary",
        "lat": 47.9985,
        "lon": 17.1981,
        "address": "Village park, Rajka",
        "nickname": "Áron",
        "message": "Taking our turtle on a visit across the border."
      },
      {
        "date": "2026-03-15",
        "city": "Hainburg",
        "country": "Austria",
        "lat": 48.1463,
        "lon": 16.944,
        "address": "Donaulände, riverside promenade, Hainburg an der Donau",
        "nickname": "Anna",
        "message": "A gentle companion for a riverside picnic."
      },
      {
        "date": "2026-07-26",
        "city": "Devín",
        "country": "Slovakia",
        "lat": 48.1735,
        "lon": 16.9783,
        "address": "Castle riverside path, Devín, Bratislava",
        "nickname": "Leo",
        "message": "Found it enjoying the view beneath the castle."
      },
      {
        "date": "2026-10-01",
        "city": "Trnava",
        "country": "Slovakia",
        "lat": 48.3774,
        "lon": 17.587,
        "address": "Bernolákov sad, Trnava",
        "nickname": "Nina",
        "message": "Left it beside a garden bench for its next slow adventure."
      }
    ]
  },
  {
    "id": "M13",
    "demo": true,
    "name": "Honey Trail",
    "color": "#c4a365",
    "theme": "bee",
    "image": "stone-13.svg",
    "code": "8463",
    "started": "2025-12-06",
    "finds": [
      {
        "date": "2025-12-06",
        "city": "Pezinok",
        "country": "Slovakia",
        "lat": 48.2884,
        "lon": 17.267,
        "address": "Zámocký park, Mladoboleslavská, Pezinok",
        "nickname": "Lucia",
        "message": "A tiny bee for sharing a little sweetness along the way."
      },
      {
        "date": "2026-02-08",
        "city": "Bratislava",
        "country": "Slovakia",
        "lat": 48.1346,
        "lon": 17.1129,
        "address": "Sad Janka Kráľa, Petržalka, Bratislava",
        "nickname": "Oliver",
        "message": "This bee escaped the winter and travelled in my coat pocket."
      },
      {
        "date": "2026-05-10",
        "city": "Trnava",
        "country": "Slovakia",
        "lat": 48.3774,
        "lon": 17.587,
        "address": "Bernolákov sad, Trnava",
        "nickname": "Filip",
        "message": "A cheerful find on the walk through the garden."
      },
      {
        "date": "2026-08-30",
        "city": "Modra",
        "country": "Slovakia",
        "lat": 48.3344,
        "lon": 17.3075,
        "address": "Town garden, Modra",
        "nickname": "Jana",
        "message": "Showing our little bee another lovely town."
      },
      {
        "date": "2026-09-30",
        "city": "Vienna",
        "country": "Austria",
        "lat": 48.2035,
        "lon": 16.38,
        "address": "Stadtpark, Parkring, Vienna",
        "nickname": "Sofia",
        "message": "Left it near the flowers in Stadtpark for the next passer-by."
      }
    ]
  },
  {
    "id": "N14",
    "demo": true,
    "name": "Forest Friend",
    "color": "#87a58a",
    "theme": "forest",
    "image": "stone-14.svg",
    "code": "8464",
    "started": "2025-04-27",
    "finds": [
      {
        "date": "2025-04-27",
        "city": "Devín",
        "country": "Slovakia",
        "lat": 48.1735,
        "lon": 16.9783,
        "address": "Castle riverside path, Devín, Bratislava",
        "nickname": "Peter",
        "message": "A small painted forest to remind us to slow down and look around."
      },
      {
        "date": "2025-10-12",
        "city": "Bratislava",
        "country": "Slovakia",
        "lat": 48.1346,
        "lon": 17.1129,
        "address": "Sad Janka Kráľa, Petržalka, Bratislava",
        "nickname": "Hana",
        "message": "A quiet friend on our autumn walk by the river."
      },
      {
        "date": "2026-03-29",
        "city": "Pezinok",
        "country": "Slovakia",
        "lat": 48.2884,
        "lon": 17.267,
        "address": "Zámocký park, Mladoboleslavská, Pezinok",
        "nickname": "Max",
        "message": "Taking our little forest to see the castle garden."
      },
      {
        "date": "2026-07-05",
        "city": "Hainburg",
        "country": "Austria",
        "lat": 48.1463,
        "lon": 16.944,
        "address": "Donaulände, riverside promenade, Hainburg an der Donau",
        "nickname": "Lenka",
        "message": "Found a green surprise during our weekend trip."
      },
      {
        "date": "2026-09-29",
        "city": "Modra",
        "country": "Slovakia",
        "lat": 48.3344,
        "lon": 17.3075,
        "address": "Town garden, Modra",
        "nickname": "Adam",
        "message": "Left it along the garden path for the next nature lover."
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
