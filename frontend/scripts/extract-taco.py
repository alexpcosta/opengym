#!/usr/bin/env python3
"""Extract TACO 4th edition, Table 1 (per 100 g of edible portion) from the official PDF.

  Tabela Brasileira de Composição de Alimentos – TACO, 4ª edição revisada e ampliada.
  NEPA – UNICAMP, Campinas, 2011. "É permitida a reprodução total ou parcial do material,
  desde que seja citada a fonte."

This is the one-off step that produced scripts/taco/taco-4ed.json; the app never runs it.
Re-run it only if the source table changes:

  pip install pdfplumber
  python3 scripts/extract-taco.py Taco_4a_edicao_2011.pdf scripts/taco/taco-4ed.json
  node scripts/build-taco.mjs

Values kept: energy (kcal), protein, total fat (lipídeos), carbohydrate and dietary fibre.
"Tr" (trace) reads as 0; "NA" and "*" (not analysed) as null. Foods whose energy was not
analysed at all are left out — a diary entry without calories is worse than none.
"""
import json
import re
import sys

import pdfplumber

GROUPS = {
    'Cereais e derivados', 'Verduras, hortaliças e derivados', 'Frutas e derivados', 'Gorduras e óleos',
    'Pescados e frutos do mar', 'Carnes e derivados', 'Leite e derivados', 'Bebidas (alcoólicas e não alcoólicas)',
    'Ovos e derivados', 'Produtos açucarados', 'Miscelâneas', 'Outros alimentos industrializados',
    'Alimentos preparados', 'Leguminosas e derivados', 'Nozes e sementes',
}
# Rows whose blank cells collapse in the PDF's text layer, so the 11 columns no longer line
# up. Read off the printed table by hand; each checked against 4·P + 9·F + 4·C ≈ kcal.
# n: (description, kcal, protein, fat, carbohydrate, fibre)
FIX = {
    259: ('Azeite, de dendê', 884, 0, 100, 0, None), 260: ('Azeite, de oliva, extra virgem', 884, 0, 100, 0, None),
    267: ('Óleo, de babaçu', 884, 0, 100, 0, None), 268: ('Óleo, de canola', 884, 0, 100, 0, None),
    269: ('Óleo, de girassol', 884, 0, 100, 0, None), 270: ('Óleo, de milho', 884, 0, 100, 0, None),
    271: ('Óleo, de pequi', 884, 0, 100, 0, None), 272: ('Óleo, de soja', 884, 0, 100, 0, None),
    387: ('Croquete, de carne, cru', 246, 12.0, 15.6, 13.9, None), 388: ('Croquete, de carne, frito', 347, 16.9, 22.7, 18.1, None),
    442: ('Quibe, frito', 254, 14.9, 15.8, 12.3, None), 472: ('Cana, aguardente', 216, 0, 0, 0, None),
    513: ('Fermento em pó, químico', 90, 0.5, 0.1, 43.9, None), 516: ('Sal, dietético', 0, 0, 0, 0, None),
    517: ('Sal, grosso', 0, 0, 0, 0, None), 519: ('Tempero a base de sal', 21, 2.7, 0.3, 2.1, 0.6),
    537: ('Estrogonofe de carne', 173, 15.0, 10.8, 3.0, None), 538: ('Estrogonofe de frango', 157, 17.6, 8.0, 2.6, None),
    548: ('Sarapatel', 123, 18.5, 4.4, 1.1, None),
}
# Group headers the text layer does not return on a line of their own.
GROUP_RANGES = [(259, 272, 'Gorduras e óleos'), (525, 556, 'Alimentos preparados')]

VAL = r'(?:\d+(?:,\d+)?|NA|Tr|\*)'
ROW = re.compile(r'^(\d{1,3}) (.+?) ((?:' + VAL + r' ){10}' + VAL + r')$')


def num(s):
    return None if s in ('NA', '*') else 0.0 if s == 'Tr' else float(s.replace(',', '.'))


def clean(desc):
    desc = re.sub(r',(?=\S)', ', ', desc)            # "congelado,cozido"
    desc = re.sub(r'(\D) \d$', r'\1', desc)           # footnote digit: "Cerveja, pilsen 2"
    return re.sub(r'(\d)%de', r'\1% de', desc)


def main(src, dst):
    pdf = pdfplumber.open(src)
    out, group = {}, None
    for page in pdf.pages:
        text = page.extract_text() or ''
        # Table 1 spans two page layouts; only the centesimal one has the macronutrients.
        if 'Tabela 1. Composição de alimentos por 100 gramas de parte comestível: Centesimal' not in text or 'Umidade' not in text:
            continue
        for line in (l.strip() for l in text.split('\n')):
            if line in GROUPS:
                group = line
                continue
            m = ROW.match(line)
            if not m:
                continue
            n, v = int(m.group(1)), m.group(3).split(' ')
            out.setdefault(n, {'n': n, 'pt': m.group(2), 'group': group, 'kcal': num(v[1]),
                               'p': num(v[3]), 'f': num(v[4]), 'c': num(v[6]), 'fib': num(v[7])})
    for n, (pt, kcal, p, f, c, fib) in FIX.items():
        # A hand-read row belongs to the group of the parsed row just before it.
        prev = max((k for k in out if k < n and k not in FIX), default=None)
        group = out[prev]['group'] if prev else None
        out[n] = {'n': n, 'pt': pt, 'group': group, 'kcal': kcal, 'p': p, 'f': f, 'c': c, 'fib': fib}
    for lo, hi, g in GROUP_RANGES:
        for n in range(lo, hi + 1):
            if n in out:
                out[n]['group'] = g
    rows = []
    for n in sorted(out):
        r = out[n]
        if r['kcal'] is None:
            continue
        r['pt'] = clean(r['pt'])
        rows.append(r)
    with open(dst, 'w') as fh:
        fh.write('[\n' + ',\n'.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in rows) + '\n]\n')
    print(f'{len(rows)} foods → {dst}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
