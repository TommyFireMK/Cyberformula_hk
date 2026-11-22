"""Run with the pinned cadgen Python environment from the game root."""
from pathlib import Path
import importlib.util
import json

root=Path(__file__).resolve().parents[1]
source=root/'models/fire-superion/src/fire-superion-gtr.py'
spec=importlib.util.spec_from_file_location('fire_superion_model',source)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
model=module.fire_superion_gtr()
solids=model.solids()
assert solids and all(s.is_valid and s.volume>0 for s in solids),'Invalid or empty native solid'
bounds=model.bounding_box();size=bounds.size
assert 2450<size.X<2600 and 5500<size.Y<5700 and 1450<size.Z<1700,(size.X,size.Y,size.Z)
labels=[c.label for c in model.children]
tyres=[s for s in labels if s.startswith('Tyre axle')]
assert len(tyres)==6,tyres
assert all(any('Number five '+place in s for s in labels) for place in ['hood','rear -1','rear 1'])
result={'status':'PASS','tool':'cadgen 0.7.26 / build123d native geometry','units':'mm',
        'bounds':[size.X,size.Y,size.Z],'solids':len(solids),'tyres':len(tyres),
        'positiveValidSolids':True,'wheelAxles':module.AXLES,
        'assumptions':'Visual dimensions inferred from unscaled pictures; six wheels, two front axles and one rear axle. No manufacturing accuracy claimed.',
        'axes':'Native X across, -Y forward, Z up; GLB metres, Y up, Z forward',
        'source':'models/fire-superion/src/fire-superion-gtr.py','mesh':'dist/assets/fire-superion-gtr.glb'}
(root/'qa/fire-superion-native.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
