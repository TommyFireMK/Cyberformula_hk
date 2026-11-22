"""SUPER ASURADA 01, blueprint-led technical-circuit configuration.

Priority: first supplied orthographic sheet for layout and silhouette; second
poster only supplies colours, number 30 and small finish details. The sheet has
contradictory dimensions (4500 / 19000 / 13600 lengths and inconsistent widths).
Use its legible top-view 4500 mm length, 2200 mm rear span and 450 mm front-axle
spacing. Height is a visual assumption, approximately 1200 mm. Not manufacturing
CAD, not a dimensionally faithful interpretation of every annotation.
Native X across, -Y forward, Z up, mm. GLB: Y up, +Z forward, metres.
"""
from __future__ import annotations
from math import cos, sin, pi, degrees
from cadgen import build123d as bd
from cadgen import glb, srgb

LENGTH=4500.0
WIDTH=2200.0
AXLES=(-1370.0,-920.0,1450.0)
RADII=(210.0,210.0,340.0)
COLORS=dict(white='#eff2f3',blue='#174fba',red='#d82e38',dark='#17212c',
            rubber='#13171c',steel='#a8b1bc',glass='#174d69',gold='#d59b37',
            lamp='#ffd35a',seat='#a32531',black='#080e15')

def face(points):return bd.Face(bd.Wire.make_polygon(points,close=True))
def prism(points,direction):return bd.Solid.extrude(face(points),direction)
def box(x,y,z,dx,dy,dz):return bd.Box(dx,dy,dz).moved(bd.Location((x,y,z)))
def cyl(x,y,z,r,d,axis='x'):
    return bd.Cylinder(r,d,rotation=(0,90,0) if axis=='x' else (90,0,0)).moved(bd.Location((x,y,z)))
def shell(sections,x=0):
    wires=[]
    for y,w,b,t in sections:
        bevel=min(60,(t-b)*.23)
        ring=[(x-w,y,b),(x-w,y,t-bevel),(x-w*.65,y,t),(x+w*.65,y,t),
              (x+w,y,t-bevel),(x+w,y,b),(x+w*.65,y,b-8),(x-w*.65,y,b-8)]
        wires.append(bd.Wire.make_polygon(ring,close=True))
    return bd.Solid.make_loft(wires,ruled=True)
def beam(a,b,r):
    direction=bd.Vector(b)-bd.Vector(a)
    return bd.Solid.make_cylinder(r,direction.length,bd.Plane(origin=a,z_dir=direction))
def digit(points,x,y,z,scale=1,side=0):
    if not side:return prism([(x+u*scale,y+v*scale,z) for u,v in points],(0,0,3))
    return prism([(x,y+u*scale,z+v*scale) for u,v in points],(side*3,0,0))
THREE=[(0,0),(190,0),(240,45),(240,110),(200,145),(240,180),(240,245),
       (190,290),(0,290),(0,235),(170,235),(180,225),(180,180),(160,172),
       (55,172),(55,118),(160,118),(180,110),(180,65),(170,55),(0,55)]

@glb(out='../../../dist/assets/super-asurada-01.glb',mesh_tolerance=.0035)
def super_asurada_01():
    parts=[]
    def add(shape,label,color):
        shape.label=label;shape.color=srgb(COLORS[color],.76 if color=='glass' else 1)
        parts.append(shape);return shape
    add(box(0,100,115,1130,3910,100),'Carbon monocoque chassis','dark')
    add(shell([(-2250,28,75,135),(-1890,170,115,290),(-1260,295,145,435),
               (-500,350,165,580),(270,315,170,610),(870,290,150,530),
               (1610,480,165,480),(2250,460,180,460)]),'Central white painted body','white')
    add(shell([(-2240,24,90,130),(-1830,100,215,240),(-1300,135,410,430)],0),'Blue pointed nose','blue')
    # Slender hood runners, nose canards and four exposed front wheels.
    for side in (-1,1):
        add(shell([(-2180,22,100,150),(-1620,150,225,360),(-740,140,270,440),
                   (-430,65,300,485)],side*390),f'White headlight runner {side}','white')
        add(shell([(-2160,18,150,162),(-1620,146,361,373),(-740,136,441,453),
                   (-440,60,486,498)],side*390),f'Blue hood runner accent {side}','blue')
        add(shell([(-2250,65,55,90),(-1940,155,65,135),(-1490,105,75,180)],side*700),f'Blue front canard {side}','blue')
        add(prism([(side*840,-2040,70),(side*840,-1560,70),(side*840,-1550,210),
                   (side*840,-1870,145)],(side*18,0,0)),f'Canard fence {side}','blue')
        # Lens sits on the sloping runner surface, offset along its own normal.
        for material,w,d,h,offset in [('black',225,270,24,0),('lamp',190,228,18,22)]:
            light=box(0,0,0,w,d,h).rotate(bd.Axis.X,17).moved(bd.Location((side*390,-1740-offset*.292,338+offset*.956)))
            add(light,f'{material} front lamp {side}',material)
        add(box(side*430,-490,495,190,85,28),f'Red shoulder tab {side}','red')
        # Blueprint's large rear sidepods and enclosed rear arches.
        pod=shell([(-90,185,105,390),(240,235,110,535),(810,270,120,595),
                   (1220,270,150,650),(1830,280,155,665),(2250,240,175,540)],side*800)
        pod=pod-cyl(side*900,1450,340,365,650)
        add(pod,f'White rear fender painted body {side}','white')
        add(shell([(-80,180,80,145),(270,230,85,180),(880,240,95,210)],side*790),f'Blue sidepod sill {side}','blue')
        add(box(side*795,-105,320,320,18,210),f'Front sidepod intake void {side}','black')
        for j in range(5):add(box(side*795,-119,245+j*36,300,9,8),f'Intake grille bar {side} {j}','steel')
        add(prism([(side*1068,230,190),(side*1068,660,225),(side*1068,760,490),
                   (side*1068,240,430)],(side*8,0,0)),f'Side air intake {side}','black')
        for j in range(4):add(box(side*1080,300+j*90,335,8,12,155),f'Side intake louvre {side} {j}','dark')
        # Small number plaque is on the sidepod, leaving the blueprint's open front axles unobstructed.
        add(box(side*1080,590,305,12,420,310),f'Blue thirty plaque {side}','blue')
        add(digit(THREE,side*1090,410,180,.68,side),f'Number three {side}','white')
        outer=prism([(side*1090,620,180),(side*1090,745,180),(side*1090,745,377),
                     (side*1090,620,377)],(side*3,0,0))
        inner=prism([(side*1087,652,216),(side*1087,713,216),(side*1087,713,341),
                     (side*1087,652,341)],(side*10,0,0))
        add(outer-inner,f'Number zero {side}','white')
        for axle,(y,r) in enumerate(zip(AXLES,RADII)):
            x=side*(745 if axle<2 else 889);depth=210 if axle<2 else 340
            add(cyl(x,y,r,r,depth),f'Tyre axle {axle+1} side {side}','rubber')
            outer_x=x+side*(depth/2+8)
            rim=cyl(outer_x,y,r,r*.73,18)-cyl(outer_x,y,r,r*.58,28)
            add(rim,f'Alloy rim {axle} {side}','steel')
            add(cyl(outer_x-side*12,y,r,r*.57,12),f'Wheel brake disc {axle} {side}','dark')
            for j in range(6):
                a=j*pi/3
                spoke=box(0,0,0,24,r*.62,22).rotate(bd.Axis.X,degrees(a)).moved(bd.Location((outer_x+side*9,y+cos(a)*r*.30,r+sin(a)*r*.30)))
                add(spoke,f'Wheel spoke {axle} {side} {j}','steel')
            add(cyl(outer_x+side*20,y,r,r*.15,26),f'Wheel hub {axle} {side}','steel')
            # Two wishbones per exposed wheel; no floating suspension arms.
            if axle<2:
                for height in (155,290):
                    for dy in (-125,125):
                        add(beam((side*285,y+dy,height),(side*650,y,r),12),f'Wishbone axle {axle+1} {side} {height} {dy}','steel')
                add(beam((side*350,y-70,350),(side*660,y+35,195),22),f'Front damper axle {axle+1} {side}','dark')
                for j in range(5):add(cyl(side*(480+j*28),y-20+j*10,285-j*13,26,8),f'Damper spring collar {axle} {side} {j}','gold')
    # Teardrop canopy with a real opening in the surrounding white collar.
    collar=shell([(-1570,120,300,405),(-1060,265,405,645),(-420,325,475,815),
                  (180,280,480,795),(540,185,450,590)])
    glass=shell([(-1540,86,345,430),(-1030,225,450,675),(-410,280,520,850),
                 (150,240,530,830),(465,145,500,640)])
    add(collar-glass,'White canopy aperture frame','white');add(glass,'Blue transparent cockpit glazing','glass')
    add(box(0,-180,535,265,390,90),'Cockpit seat cushion','seat')
    add(box(0,25,630,270,80,270).rotate(bd.Axis.X,0),'Cockpit seat back','seat')
    add(box(0,-620,500,330,85,95),'Cockpit dashboard','dark')
    add(cyl(0,-575,610,95,20,'y')-cyl(0,-575,610,70,30,'y'),'Steering wheel','dark')
    # Retracted roof satellite/AI pod from the technical drawing.
    add(shell([(345,105,680,725),(480,130,700,855),(740,110,650,810),(920,24,540,590)]),'Roof satellite pod retracted','blue')
    add(box(0,345,750,115,12,70),'Roof pod sensor lens','glass')
    add(box(0,570,690,160,300,40),'Roof pod mounting cradle','steel')
    # Twin longitudinal rocket boosters with independent horizontal winglets.
    for side in (-1,1):
        x=side*760
        add(cyl(x,1717.5,825,220,885,'y'),f'Blue rocket booster {side}','blue')
        add(bd.Cone(20,220,350,rotation=(-90,0,0)).moved(bd.Location((x,1100,825))),f'Tapered rocket nose fairing {side}','blue')
        ring=cyl(x,2180,825,238,100,'y')-cyl(x,2180,825,190,125,'y')
        add(ring,f'Red rocket nozzle ring {side}','red')
        add(cyl(x,2215,825,184,38,'y'),f'Rocket nozzle dark throat {side}','black')
        add(cyl(x,2240,825,42,18,'y'),f'Rocket turbine hub {side}','steel')
        for j in range(9):
            a=j*2*pi/9
            blade=box(0,0,0,32,22,150).rotate(bd.Axis.Y,degrees(a)).moved(bd.Location((x+sin(a)*92,2239,825+cos(a)*92)))
            add(blade,f'Rocket turbine blade {side} {j}','dark')
        add(box(side*760,1940,1150,660,330,45),f'Blue horizontal rear wing {side}','blue')
        add(box(side*760,1778,1172,620,22,12),f'Red rear wing leading stripe {side}','red')
        for xx in (side*460,side*1060):
            add(box(xx,1940,1170,22,350,130),f'Rear wing endplate {side} {xx}','blue')
        add(beam((side*760,1880,940),(side*760,1940,1130),24),f'White wing pylon {side}','white')
        add(prism([(side*270,1300,480),(side*270,2070,490),(side*270,2000,880),
                   (side*270,1600,760)],(side*22,0,0)),f'Rear centre stabiliser {side}','blue')
        add(box(side*700,2235,440,430,18,35),f'Rear signal lamp {side}','red')
    add(box(0,2140,560,1500,100,65),'Rear white crossmember','white')
    for x in (-520,-260,0,260,520):add(box(x,2110,120,25,280,145),f'Rear diffuser fin {x}','dark')
    for side in (-1,1):add(beam((side*130,1880,180),(side*760,2080,350),18),f'Rear suspension brace {side}','steel')
    return bd.Compound(children=parts,label='Super Asurada 01 - blueprint technical circuit mode')

if __name__=='__main__':super_asurada_01()
