"""White Randoll 01, a reference-led game reconstruction from the supplied sheet.
The sheet's 220 x 86 x 60/80 mm describes a model, with inconsistent heights.
Use approximately 5.5 m length and 2.1 m maximum fin height for the game.
Native mm, X across, -Y forward, Z up; exported GLB m, Y up, Z forward.
"""
from __future__ import annotations
from math import cos, sin, pi
from cadgen import build123d as bd
from cadgen import glb, srgb

LENGTH=5500.0
AXLES=(-1610.0,1570.0)
RADII=(365.0,440.0)
COLORS=dict(white='#eef1f0',red='#d72f34',green='#007266',purple='#a59cce',
            silver='#c5c5e2',dark='#18212b',rubber='#171b20',glass='#084756',
            gold='#c88b3b',lamp='#ffcc52',black='#090e15')

def face(points):return bd.Face(bd.Wire.make_polygon(points,close=True))
def prism(points,vector):return bd.Solid.extrude(face(points),vector)
def box(x,y,z,dx,dy,dz):return bd.Box(dx,dy,dz).moved(bd.Location((x,y,z)))
def cylinder(x,y,z,r,d,axis='x',n=0):
    return bd.Cylinder(r,d,rotation=(0,90,0) if axis=='x' else (90,0,0)).moved(bd.Location((x,y,z)))
def shell(sections,x=0):
    wires=[]
    for y,w,b,t in sections:
        bevel=min(90,(t-b)*.22)
        pts=[(x-w,y,b),(x-w,y,t-bevel),(x-w*.65,y,t),(x+w*.65,y,t),
             (x+w,y,t-bevel),(x+w,y,b),(x+w*.7,y,b-10),(x-w*.7,y,b-10)]
        wires.append(bd.Wire.make_polygon(pts,close=True))
    return bd.Solid.make_loft(wires,ruled=True)

def wing_points(side,yz,offset=0):
    # All wing points share x - side * .50*z = constant: a planar, outward-canted fin.
    return [(side*(500+.50*(z-800)+offset),y,z) for y,z in yz]

def one(x,y,z,w,h,side=0):
    outline=[(.1,.74),(.43,1),(.67,1),(.67,.16),(.94,.16),(.94,0),(.09,0),(.09,.16),(.39,.16),(.39,.75),(.22,.61)]
    if not side:return prism([(x+(u-.5)*w,y+(.5-v)*h,z+(.5-v)*h*.30) for u,v in outline],(0,0,4))
    # Badge is drawn on the same canted plane as the wing surface.
    return prism([(x+side*.5*v*h,y+(u-.5)*w,z+v*h) for u,v in outline],(side*5,0,0))

@glb(out='../../../dist/assets/randoll-01.glb',mesh_tolerance=.0035)
def randoll_01():
    parts=[]
    def add(shape,label,color):
        shape.label=label;shape.color=srgb(COLORS[color]);parts.append(shape);return shape
    add(box(0,0,150,1860,5060,120),'Carbon chassis','dark')
    add(shell([(-2770,45,140,220),(-2360,220,180,370),(-1530,370,220,620),
               (-400,410,240,810),(600,400,260,890),(1580,440,230,850),(2690,550,230,760)]),'White central painted body','white')
    # Four partially enclosed wheels and purple mechanical side fairings.
    for side in (-1,1):
        fender=shell([(-2740,160,160,270),(-2430,370,180,485),(-2080,430,190,660),
                      (-1610,440,210,800),(-1110,385,220,720),(-550,300,225,550)],side*735)
        fender=fender-cylinder(side*920,AXLES[0],RADII[0],RADII[0]+28,620)
        fender=fender-box(side*750,-2600,270,690,390,140)
        add(fender,f'White front fender {side}','white')
        rear=shell([(340,290,230,600),(1000,390,230,840),(1570,425,250,980),
                    (2110,400,250,910),(2580,310,250,730)],side*735)
        rear=rear-cylinder(side*930,AXLES[1],RADII[1],RADII[1]+25,680)
        add(rear,f'White rear painted body {side}','white')
        add(shell([(-2700,180,100,170),(-2400,440,100,180),(-1900,410,115,195)],side*735),f'Purple front lip {side}','purple')
        add(shell([(-1460,180,185,365),(-850,245,175,420),(150,260,175,450),
                   (1050,210,195,550),(1660,140,220,580)],side*820),f'Purple side armour {side}','purple')
        add(shell([(-1450,100,200,270),(-750,155,200,300),(380,145,220,330),
                   (1300,105,240,400)],side*1030),f'Silver side mechanism {side}','silver')
        # Headlights occupy real cut-outs, rather than disappearing inside opaque bodywork.
        add(box(side*750,-2698,270,625,30,122),f'Headlamp dark pocket {side}','black')
        add(box(side*750,-2718,270,500,15,70),f'Amber headlamp {side}','lamp')
        for j in range(4):add(box(side*(540+j*120),-2730,270,8,5,58),f'Headlamp separator {side} {j}','gold')
        add(box(side*660,-750,790,440,110,35),f'Red shoulder trim {side}','red')
        # Red/green stripes follow the white rear shell, using narrow layered lofts.
        add(shell([(500,220,655,680),(1060,265,855,883),(1580,270,985,1000),
                   (2110,240,917,937)],side*735),f'Red rear shoulder band {side}','red')
        add(shell([(300,150,593,610),(870,210,795,814),(1320,200,920,938)],side*735),f'Green rear shoulder accent {side}','green')
        add(prism([(side*1050,650,650),(side*1110,1120,810),
                   (side*1060,1230,700)],(side*8,0,0)),f'Side green accent {side}','green')
        for axle,(y,r) in enumerate(zip(AXLES,RADII)):
            x=side*920
            add(cylinder(x,y,r,r,250),f'Tyre axle {axle+1} side {side}','rubber')
            add(cylinder(x+side*135,y,r,r*.96,35),f'Purple enclosed wheel {axle} {side}','purple')
            add(cylinder(x+side*159,y,r,r*.78,16),f'Silver wheel dome {axle} {side}','silver')
            add(cylinder(x+side*172,y,r,r*.42,12),f'Purple wheel hub {axle} {side}','purple')
            for j in range(5):
                a=j*2*pi/5
                add(cylinder(x+side*182,y+cos(a)*r*.62,r+sin(a)*r*.62,16,6),f'Wheel service recess {axle} {side} {j}','dark')
            add(box(x+side*187,y,r,12,r*1.6,36),f'Wheel centre brace {axle} {side}','silver')
        # The two tall swan fins are outward canted surfaces, not a horizontal rear spoiler.
        yz=[(450,1100),(2480,2070),(2690,2090),(2410,1150),(1320,960),(570,1015)]
        add(prism(wing_points(side,yz),(side*50,0,0)),f'White swan fin {side}','white')
        bands=[[(510,1065),(1320,1005),(2400,1190),(2650,2000),(2675,2070),(2440,1155),(1320,967),(570,1025)],
               [(2515,2010),(2670,2060),(2690,2090),(2540,2040)]]
        for surface in (-4,54):
            for k,poly in enumerate(bands):add(prism(wing_points(side,poly,surface),(side*3,0,0)),f'Red fin border {side} {surface} {k}','red')
            add(prism(wing_points(side,[(1320,975),(1650,1035),(1645,1080),(1320,1018)],surface+4),(side*3,0,0)),f'Green fin border {side} {surface}','green')
        # Circular white/red number medallions lie parallel to each fin.
        z=1510;y=2190;x=side*(500+.5*(z-800)+73)
        angle=116.565 if side>0 else -116.565
        add(bd.Cylinder(156,12,rotation=(0,angle,0)).moved(bd.Location((x,y,z))),f'Red number medallion {side}','red')
        add(bd.Cylinder(134,16,rotation=(0,angle,0)).moved(bd.Location((x+side*12,y,z-6))),f'White number medallion {side}','white')
        add(one(x+side*22-side*55,y,z-110,140,220,side),f'Number one fin {side}','red')
    # Long teal canopy, with an actual aperture through the white collar.
    collar=shell([(-1730,270,430,565),(-1150,345,550,930),(-400,370,620,1240),
                  (200,325,680,1360),(680,280,680,1230),(920,230,650,930)])
    glass=shell([(-1680,225,500,600),(-1120,295,610,960),(-390,315,690,1270),
                 (190,275,740,1390),(610,230,740,1260),(815,185,720,970)])
    add(collar-glass,'White canopy aperture collar','white');add(glass,'Teal cockpit glazing','glass')
    add(shell([(-1780,18,500,512),(-1250,19,800,820),(-750,20,1090,1110)],0),'Green canopy nose seam','green')
    add(box(0,450,1395,55,190,28),'White canopy roof seam','white')
    add(one(0,-2100,465,185,340),'Red number one hood','red')
    # Narrow green nose highlights and mesh-covered triangular vents.
    for side in (-1,1):
        pts=[(side*65,-2610,270),(side*255,-1780,615),(side*310,-1620,650),(side*100,-2590,285)]
        for j,tri in enumerate(([pts[0],pts[1],pts[2]],[pts[0],pts[2],pts[3]])):
            add(prism(tri,(0,0,12)),f'Green nose pinstripe {side} {j}','green')
        add(prism([(side*380,-1550,666),(side*630,-1640,710),(side*450,-1840,580)],(0,0,7)),f'Black nose grille {side}','black')
    # Cylindrical central engine, visible gold turbine and two stacked hexagonal exhausts.
    add(cylinder(0,1690,1010,325,1160,'y'),'White central turbine casing','white')
    add(cylinder(0,1080,1010,285,80,'y'),'Gold turbine ring','gold')
    add(cylinder(0,1027,1010,230,35,'y'),'Turbine throat','dark')
    for i in range(16):
        a=i*2*pi/16
        add(box(cos(a)*252,1020,1010+sin(a)*252,30,60,30),f'Gold turbine vane {i}','gold')
    for z in (580,1070):
        def hexagon(radius,y):return[(cos(i*pi/3)*radius,y,z+sin(i*pi/3)*radius)for i in range(6)]
        add(prism(hexagon(246,2640),(0,110,0)),f'Hex exhaust red surround {z}','red')
        add(prism(hexagon(214,2752),(0,12,0)),f'Hex exhaust metal {z}','purple')
        add(prism(hexagon(178,2766),(0,8,0)),f'Hex exhaust dark opening {z}','black')
    for side in (-1,1):add(box(side*700,2610,600,500,35,60),f'Gold rear lamp {side}','lamp')
    return bd.Compound(children=parts,label='Randoll 01 - white swan racer')

if __name__=='__main__':randoll_01()
