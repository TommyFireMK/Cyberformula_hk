"""Native geometry validation, run with cadgen 0.7.26 Python."""
from pathlib import Path
import importlib.util
import json
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('randoll_model',root/'models/randoll/src/randoll-01.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
model=module.randoll_01();solids=model.solids();bounds=model.bounding_box().size
assert solids and all(s.is_valid and s.volume>0 for s in solids),'Invalid native solid'
assert 2250<bounds.X<2700 and 5450<bounds.Y<5700 and 1950<bounds.Z<2250
labels=[c.label for c in model.children]
assert sum(s.startswith('Tyre axle') for s in labels)==4
assert sum(s.startswith('White swan fin') for s in labels)==2
assert sum(s.startswith('Hex exhaust dark opening') for s in labels)==2
assert sum(s.startswith('Number one fin') for s in labels)==2
report={'status':'PASS','tool':'cadgen 0.7.26 / build123d','units':'mm','bounds':[bounds.X,bounds.Y,bounds.Z],
        'validPositiveSolids':len(solids),'tyres':4,'swanFins':2,'hexagonalExhausts':2,
        'source':'models/randoll/src/randoll-01.py','mesh':'dist/assets/randoll-01.glb',
        'assumptions':'Sheet is an approximate 220 mm model with inconsistent 60/80 mm heights. Reconstructed at about 5.5 m game scale; static fins and opaque performance glazing, not manufacturing geometry or a measured replica.'}
(root/'qa/randoll-native.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
