"""Reference-led Fire Superion G.T.R visual asset, not a manufacturing design.

Native CAD uses mm, X across, -Y forward, +Z up. cadgen GLB converts to
metres, +Y up and +Z forward, matching the racing engine without rescaling.
Six wheels follow the consistent side silhouette; the generated main view's
extra axle is not treated as a dimensional instruction.
"""
from __future__ import annotations
from math import cos, sin, pi
from cadgen import build123d as bd
from cadgen import glb, srgb

LENGTH = 5600.0
WIDTH = 2500.0
AXLES = (-1500.0, -660.0, 1680.0)
RADII = (380.0, 380.0, 460.0)
COLORS = dict(red="#d82f25", orange="#f39820", white="#f2f4ef",
              black="#10151e", glass="#182638", rubber="#171b20",
              rim="#bd3028", steel="#8e959c", lamp="#f4c351",
              tail="#ef372c", blue="#16508b", gold="#d4b470")


def polygon(points):
    return bd.Face(bd.Wire.make_polygon(points, close=True))


def prism(points, vector):
    return bd.Solid.extrude(polygon(points), vector)


def block(x, y, z, dx, dy, dz):
    return bd.Box(dx, dy, dz).moved(bd.Location((x, y, z)))


def loft(sections, x=0):
    """Ruled octagonal shell: y, half width, lower and upper z."""
    wires = []
    for y, w, bottom, top in sections:
        bevel = min(65, (top-bottom)*.22)
        ring = [(x-w, y, bottom), (x-w, y, top-bevel),
                (x-w*.76, y, top), (x+w*.76, y, top),
                (x+w, y, top-bevel), (x+w, y, bottom),
                (x+w*.7, y, bottom-12), (x-w*.7, y, bottom-12)]
        wires.append(bd.Wire.make_polygon(ring, close=True))
    return bd.Solid.make_loft(wires, ruled=True)


def tire(x, y, z, radius, depth):
    return bd.Cylinder(radius, depth, rotation=(0, 90, 0)).moved(bd.Location((x, y, z)))


def number5(origin, width, height, side=0):
    outline=[(.08,1),(.94,1),(.94,.81),(.29,.81),(.29,.59),(.76,.59),
             (.96,.45),(.96,.15),(.78,0),(.08,0),(.08,.2),(.72,.2),
             (.72,.39),(.08,.39)]
    x,y,z=origin
    if not side:
        pts=[(x+(u-.5)*width,y+(.5-v)*height,z) for u,v in outline]
        return prism(pts,(0,0,3))
    pts=[(x,y+(u-.5)*width,z+v*height) for u,v in outline]
    return prism(pts,(side*3,0,0))


@glb(out="../../../dist/assets/fire-superion-gtr.glb", mesh_tolerance=0.003)
def fire_superion_gtr():
    parts=[]
    def add(shape, name, color):
        shape.label=name;shape.color=srgb(COLORS[color]);parts.append(shape)
        return shape
    add(block(0,0,160,2080,5150,140),'Carbon chassis','black')
    add(loft([(-2780,320,145,250),(-2170,540,190,420),(-1050,590,240,580),
              (180,650,260,650),(950,750,230,800),(2430,880,240,970),
              (2700,950,260,850)]),'Central painted body','red')
    # Independent wedge fenders; cut true circular arches around each wheel.
    for side in (-1,1):
        front=loft([(-2800,210,125,230),(-2380,330,165,490),(-1680,365,210,850),
                    (-560,350,210,850),(130,310,200,635),(590,300,210,660)],side*825)
        for y,r in zip(AXLES[:2],RADII[:2]):front=front-tire(side*940,y,r,r+42,680)
        add(front,f'Front fender painted body {side}','red')
        rear=loft([(430,285,210,660),(1150,365,230,1000),(1910,370,230,1125),
                   (2640,365,250,940)],side*825)
        rear=rear-tire(side*960,AXLES[2],RADII[2],RADII[2]+45,720)
        add(rear,f'Rear fender painted body {side}','red')
        add(loft([(-2770,220,100,150),(-2400,380,110,180),(-1850,360,115,175)],side*825),f'Front splitter {side}','red')
        add(block(side*1050,300,215,140,1800,110),f'Sill painted body {side}','red')
        add(block(side*825,-1240,858,645,140,38),f'White shoulder band {side}','white')
        # Yellow lamps sit in sloping red nose faces, inside dark surrounds.
        for material,surface,w,d,h in [('black',0,515,270,42),('lamp',30,460,208,27)]:
            # Offset the lens along the face normal so the opaque surround
            # cannot hide it. Rotation is about the lamp's own datum.
            shape=block(0,0,0,w,d,h).rotate(bd.Axis.X,28).moved(bd.Location((side*820,-2490-surface*.4695,460+surface*.8829)))
            add(shape,f'{material} front lamp {side}',material)
        # Orange stepped airboxes, with recessed black openings on both sides.
        intake=loft([(430,280,600,1070),(700,350,540,1240),(1450,355,510,1200)],side*815)
        add(intake,f'Orange intake housing {side}','orange')
        add(prism([(side*1172,620,1040),(side*1172,1220,1000),
                   (side*1172,1280,840),(side*1172,660,870)],(side*9,0,0)),f'Upper intake void {side}','black')
        add(prism([(side*1172,690,790),(side*1172,1270,755),
                   (side*1172,1270,610),(side*1172,730,640)],(side*9,0,0)),f'Lower intake void {side}','black')
        add(block(side*815,432,960,440,12,150),f'Forward intake mouth {side}','black')
        # Door Aoi plate; readable white word is added in the runtime livery layer.
        add(block(side*1105,70,510,12,650,200),f'Aoi blue door badge {side}','blue')
        add(prism([(side*1195,1900,1080),(side*1195,2520,920),
                   (side*1195,2530,575),(side*1195,1920,650)],(side*7,0,0)),f'Number panel {side}','black')
        add(number5((side*1205,2190,690),365,310,side),f'Number five rear {side}','white')
    # Dark faceted teardrop canopy, surrounded by a red aperture frame.
    frame=loft([(-1540,490,470,550),(-1040,540,560,940),(-180,510,640,1250),
                (480,430,650,1260),(780,350,650,890)])
    glazing=loft([(-1500,438,540,600),(-1000,485,620,980),(-165,455,700,1290),
                  (435,375,710,1300),(715,300,700,935)])
    add(frame-glazing,'Canopy red aperture frame','red')
    add(glazing,'Dark canopy glazing','glass')
    for side in (-1,1):
        pts=[(side*539,-920,820),(side*510,-180,1170),
             (side*439,400,1190),(side*425,530,900)]
        for j,tri in enumerate(([pts[0],pts[1],pts[2]],[pts[0],pts[2],pts[3]])):
            add(prism(tri,(side*8,0,0)),f'Side glazing {side} {j}','glass')
    add(block(0,370,1308,88,320,24),'Canopy central seam','red')
    add(block(0,-2120,433,650,690,17),'Hood number plaque','black')
    add(number5((0,-2120,444),375,450),'Number five hood','white')
    # Six wheels: two front axles, one rear axle; deep red disc hubs.
    for axle,(y,r) in enumerate(zip(AXLES,RADII)):
        for side in (-1,1):
            x=side*(995 if axle<2 else 990)
            add(tire(x,y,r,r,300),f'Tyre axle {axle+1} side {side}','rubber')
            for rr,depth,material,offset in [(r*.73,18,'black',157),(r*.64,22,'rim',170),(r*.5,7,'red',184),(r*.13,18,'steel',195)]:
                add(tire(x+side*offset,y,r,rr,depth),f'Wheel disc {axle} {side} {rr}',''+material)
            for i in range(6):
                a=i*pi/3;add(tire(x+side*196,y+cos(a)*r*.38,r+sin(a)*r*.38,12,8),f'Wheel fastener {axle} {side} {i}','black')
    # White inverted U aero bridge, black inner supports, louvred engine deck.
    add(block(0,2210,1495,2490,480,92),'White rear wing bridge','white')
    for side in (-1,1):
        add(prism([(side*1115,1930,1480),(side*1115,2440,1480),
                   (side*1115,2560,1050),(side*1115,2320,1040)],(side*100,0,0)),f'White wing upright {side}','white')
        add(block(side*600,2120,1140,70,170,640),f'Wing inner support {side}','black')
        add(block(side*815,2670,705,590,95,250),f'Tail exhaust carrier {side}','red')
        for j in range(3):
            x=side*815+(j-1)*170
            add(block(x,2725,705,145,25,190),f'Exhaust metal surround {side} {j}','steel')
            add(block(x,2740,705,112,13,150),f'Exhaust rectangular void {side} {j}','black')
        add(block(side*815,2732,900,510,18,45),f'Rear tail lamp {side}','tail')
    for i in range(9):add(block(0,900+i*108,930+i*10,530,40,26),f'Engine louvre {i}','black')
    add(bd.Cylinder(290,130,rotation=(90,0,0)).moved(bd.Location((0,2670,430))),'Central turbine outer ring','steel')
    add(bd.Cylinder(232,145,rotation=(90,0,0)).moved(bd.Location((0,2690,430))),'Central turbine dark throat','black')
    add(bd.Cylinder(92,158,rotation=(90,0,0)).moved(bd.Location((0,2700,430))),'Central turbine core','steel')
    for x in (-550,-280,280,550):add(block(x,2500,190,35,500,205),'Rear diffuser fin '+str(x),'black')
    return bd.Compound(children=parts,label='Fire Superion G.T.R - AOI 5')


if __name__ == '__main__':
    fire_superion_gtr()
