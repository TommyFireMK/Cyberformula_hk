"""Check native CAD geometry and explicitly record the drawing interpretation."""
from pathlib import Path
import importlib.util
import json
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('super_asurada_model',root/'models/super-asurada/src/super-asurada-01.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
model=module.super_asurada_01();solids=model.solids();size=model.bounding_box().size
assert solids and all(s.is_valid and s.volume>0 for s in solids),'Invalid native geometry'
assert abs(size.Y-4500)<.1 and abs(size.X-2200)<.1,(size.X,size.Y,size.Z)
assert 1100<size.Z<1300
labels=[s.label for s in model.children]
for prefix,count in [('Tyre axle',6),('Blue rocket booster',2),('Red rocket nozzle ring',2),
                     ('Blue horizontal rear wing',2),('Roof satellite pod retracted',1),('Wishbone axle',16)]:
    assert sum(s.startswith(prefix) for s in labels)==count,prefix
tyres=[c for c in model.children if c.label.startswith('Tyre axle')]
for tyre in tyres:
    axle=int(tyre.label.split()[2])-1
    box=tyre.bounding_box()
    actual_y=(box.min.Y+box.max.Y)/2
    assert abs(actual_y-module.AXLES[axle])<.001,(tyre.label,actual_y)
assert abs(module.AXLES[1]-module.AXLES[0]-450)<.001
report={'status':'PASS','tool':'cadgen 0.7.26 / build123d','units':'mm',
        'bounds':[size.X,size.Y,size.Z],'validPositiveSolids':len(solids),
        'wheelAxles':module.AXLES,'frontAxlePitch':450,'tyres':6,'wishboneArms':16,
        'boosters':2,'rearHorizontalWinglets':2,'roofPod':'fixed retracted',
        'referencePriority':'First supplied technical drawing controls layout, six-wheel spacing, separate rear wings, tapered boosters and roof pod; second poster supplies colours and number 30.',
        'dimensionInterpretation':'Top-view 4500 mm length, 2200 mm rear width, side-view 450 mm front-axle pitch retained. Conflicting 19000/13600 lengths, 3200 front width and other inconsistent labels are not simultaneously enforceable. Height is inferred, not a verified drawing dimension.',
        'configuration':'Technical circuit form, fixed chassis and winglets; no rally/aero transformations or native cockpit view.',
        'source':'models/super-asurada/src/super-asurada-01.py','mesh':'dist/assets/super-asurada-01.glb'}
(root/'qa/super-asurada-native.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
