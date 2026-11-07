# Changelog

## 1.0.1

### Toegevoegd

- FFmpeg wordt meegeleverd met de Windows-app en gebruikt om aparte video- en audiostreams samen te voegen.
- De modus "Video + audio" kan daardoor ook bronnen downloaden waarbij beeld en geluid apart worden aangeboden.
- De licentie- en buildinformatie van FFmpeg wordt met de app meegeleverd.

### Verbeterd

- Foutmeldingen bij mislukte downloads geven meer informatie van yt-dlp, waaronder de reden waarom een download niet lukt.
- De interface licht nu toe dat FFmpeg wordt gebruikt om aparte streams samen te voegen.
- Het buildcommando voor het maken van een Windows-installer heet nu `npm run dist` (was `npm run package:win`).

## 1.0.0

- Eerste versie van VeltoDL met URL-controle, audio- en videokeuzes, kwaliteitsinstellingen, voortgangsweergave en annuleren van downloads.
- De gecombineerde modus was afhankelijk van een bron die al een gecombineerde video- en audiostream aanbood; losse streams werden niet samengevoegd.
