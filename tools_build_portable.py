# SPDX-License-Identifier: MIT
"""Rebuild the dependency-free HTML for local offline inspection."""
from pathlib import Path
ROOT=Path(__file__).parent
html=(ROOT/'index.html').read_text(encoding='utf-8')
html=html.replace('<link rel="icon" href="/favicon.svg">','').replace('<link rel="icon" href="favicon.svg">','')
html=html.replace('<link rel="stylesheet" href="src/style.css">',
                  '<style>\n'+(ROOT/'src/style.css').read_text(encoding='utf-8')+'\n</style>')
html=html.replace('<script src="src/vision-core.js" defer></script>','')
html=html.replace('<script src="src/app.js" defer></script>','')
html=html.replace('<script src="src/strip-core.js" defer></script>','')
html=html.replace('<script src="src/strip-ui.js" defer></script>','')
html=html.replace('<script src="src/virtual-calibration.js" defer></script>','')
html=html.replace('<link rel="stylesheet" href="src/strip.css">','')
html=html.replace('</style>', '\n'+(ROOT/'src/strip.css').read_text(encoding='utf-8')+'</style>',1)
js='\n'.join((ROOT/'src'/name).read_text(encoding='utf-8') for name in ('vision-core.js','strip-core.js','virtual-calibration.js','app.js','strip-ui.js'))
html=html.replace('</body>','<script>\n'+js+'\n</script></body>')
html=html.replace('AB-Vision Inspector — MS ROBOTIKA</title>','AB-Vision Inspector — MS ROBOTIKA · Sin instalación</title>')
assert '<script src=' not in html and 'stylesheet' not in html and 'href="favicon.svg"' not in html
path=ROOT/'AB-Vision-Inspector-PORTABLE.html'
path.write_text(html,encoding='utf-8')
print(f'{path.name}: {path.stat().st_size} bytes')
