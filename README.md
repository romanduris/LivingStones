# LivingStones
Living Stones – QR-coded stones that travel and build a shared real-world story.

## Prehľad zariadenia

Statická stránka v `docs/` zobrazuje návštevníkovi údaje dostupné jeho prehliadaču.
Bez balíčkov a bez databázy. IP a približná poloha sa zisťujú automaticky cez [ipwho.is](https://ipwhois.io/documentation), pri zlyhaní cez ipapi.co (každá požiadavka má limit 8 sekúnd); geolokácia vyžaduje povolenie prehliadača.

Súhrnná tabuľka zobrazuje lokálne ID prehliadača, typ zariadenia, polohu, časové pásmo prehliadača a odhad OS. Mapa používa [vloženú mapu OpenStreetMap](https://wiki.openstreetmap.org/wiki/Export); poskytovateľ mapy dostáva zobrazované súradnice. Tlačidlo „Urči presnú polohu“ vyžiada súhlas a aktualizuje tabuľku aj mapu vrátane hlásenej presnosti. Získaná poloha zariadenia má do obnovenia stránky prednosť pred IP odhadom.

Lokálne spustenie: `python3 -m http.server 8000 --directory docs`.
Publikovanie: GitHub Pages, vetva `main`, priečinok `/` (koreň).
Koreňový `index.html` používa štýly a skript z `docs/`; pri úprave HTML udržujte oba vstupné súbory zhodné okrem ciest k týmto súborom.
Hosting funguje nezávisle od Codespace. Nie všetky prehliadače poskytujú všetky údaje.

Po získaní polohy zariadenia sa názov ulice alebo oblasti dohľadá cez [Photon](https://github.com/komoot/photon) z údajov OpenStreetMap. Súradnice sa odošlú službe iba po použití tlačidla na polohu. Výsledky sa uchovávajú v pamäti počas návštevy; požiadavka má limit 8 sekúnd. Pri chybe zostáva zobrazenie súradníc. Názov je mapový odhad; pri hlásenej presnosti horšej než 150 m sa ulica vynechá. Verejná služba Photon je vhodná na mierne používanie a nemá zaručenú dostupnosť.

Určenie polohy zariadenia je dostupné iba pre rozpoznané mobily a tablety. Na desktope a neznámych zariadeniach je tlačidlo skryté a jeho obsluha polohu nevyžiada; IP odhad zostáva dostupný. Rozpoznanie vychádza z údajov prehliadača.
