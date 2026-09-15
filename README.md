# LivingStones
Living Stones – QR-coded stones that travel and build a shared real-world story.

## Prehľad zariadenia

Statická stránka v `docs/` zobrazuje návštevníkovi údaje dostupné jeho prehliadaču.
Bez balíčkov a bez databázy. IP a približná poloha sa zisťujú automaticky cez [ipwho.is](https://ipwhois.io/documentation), pri zlyhaní cez ipapi.co (každá požiadavka má limit 8 sekúnd); geolokácia vyžaduje povolenie prehliadača.

Lokálne spustenie: `python3 -m http.server 8000 --directory docs`.
Publikovanie: GitHub Pages, vetva `main`, priečinok `/` (koreň).
Koreňový `index.html` používa štýly a skript z `docs/`; pri úprave HTML udržujte oba vstupné súbory zhodné okrem ciest k týmto súborom.
Hosting funguje nezávisle od Codespace. Nie všetky prehliadače poskytujú všetky údaje.
