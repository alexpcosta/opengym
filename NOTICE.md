# Third-party notices

openGym — Copyright (C) 2026 Duarte Santos.
openGym's own code is licensed under the **GNU AGPL v3.0** (see [LICENSE](LICENSE)).

## App store exception

As an additional permission under section 7 of the AGPL v3.0, the copyright holder permits
distribution of the openGym mobile application through app store platforms (such as the
Apple App Store and Google Play) whose terms of service would otherwise be incompatible
with the AGPL, provided the corresponding source code remains available under the AGPL at
the project repository. This permission applies to the distribution channel only and does
not otherwise limit the license.

## Bundled AI provider CLI

The api image installs the [**Claude Code CLI**](https://github.com/anthropics/claude-code)
(`@anthropic-ai/claude-code`, pinned in `api/Dockerfile`) so the optional AI Coach works
without the instance owner installing anything. openGym invokes it as a separate process at
runtime and does not link against it or include its source; this is mere aggregation, and
openGym's own AGPL v3.0 licensing is unchanged.

The CLI is distributed under its own terms, and using it requires an account with the
provider. Both are matters between the instance owner and Anthropic — openGym ships no
credentials and asks its users for none. Instances that would rather not carry it can leave
the Coach disabled (the default) or set `COACH_DISABLED=1`.

## Body diagram geometry

The muscle outlines the body maps are drawn from (`frontend/src/lib/body-paths.js`) are derived
from [**MuscleMap**](https://github.com/melihcolpan/MuscleMap) by Melih Colpan, used under the
**MIT License** and reproduced below. MuscleMap ships its path data as Swift source rather than
`.svg` files; the paths were converted to a JSON module, its sub-group shapes were dropped, and
nothing else about the artwork was changed.

```
MIT License

Copyright (c) 2026 Melih Colpan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Food composition data

The food diary's offline table (`frontend/src/food/taco.json`, generated from
`frontend/scripts/taco/taco-4ed.json`) reproduces energy, protein, fat, carbohydrate and fibre
per 100 g from:

> **Tabela Brasileira de Composição de Alimentos – TACO**, 4ª edição revisada e ampliada.
> Núcleo de Estudos e Pesquisas em Alimentação (NEPA), Universidade Estadual de Campinas
> (UNICAMP). Campinas: NEPA-UNICAMP, 2011.
> "É permitida a reprodução total ou parcial do material, desde que seja citada a fonte."

The Spanish food names are this project's translation, not part of TACO. Their use here does not
imply endorsement by NEPA or UNICAMP.

Packaged products and barcodes are looked up at runtime in [**Open Food Facts**](https://world.openfoodfacts.org),
whose database is available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/)
and its contents under the [Database Contents License](https://opendatacommons.org/licenses/dbcl/1-0/).
openGym caches answers on the instance and credits the source wherever results are shown.

## Barcode scanning

On browsers without a native `BarcodeDetector`, the scanner uses
[**barcode-detector**](https://github.com/Sec-ant/barcode-detector) and
[**zxing-wasm**](https://github.com/Sec-ant/zxing-wasm) by Ze-Zheng Wu (MIT License), which
bundle [zxing-cpp](https://github.com/zxing-cpp/zxing-cpp) (Apache License 2.0) compiled to
WebAssembly.

## Exercise data & media

The exercise names, instructions (English in `frontend/src/lib/exercises-data.js`, other
languages in `frontend/src/instr/`, regenerated via `scripts/build-instructions.mjs`), images
and animations (fetched into `media/` at build time) come from
[**hasaneyldrm/exercises-dataset**](https://github.com/hasaneyldrm/exercises-dataset)
and are **not** covered by openGym's AGPL license — they remain under that dataset's own terms.
The media files are not distributed in this repository; they are downloaded from the upstream
source on first run. If you redistribute openGym with the media included, review the upstream
license first.
