import bpy
import math
from mathutils import Vector

# Lamborghini Aventador SV-inspired printable display model, 1:24 scale.
# Dimensions: approximately 201 x 85 x 48 mm.

OUT_BLEND = "/Users/carlosbarcelo/projects/ski-game/lamborghini_aventador_sv_1-24.blend"
OUT_STL = "/Users/carlosbarcelo/projects/ski-game/lamborghini_aventador_sv_1-24.stl"
OUT_PNG = "/Users/carlosbarcelo/projects/ski-game/lamborghini_aventador_sv_1-24_preview.png"

# Preserve the currently open, unsaved scene before building in this Blender session.
try:
    bpy.ops.wm.save_as_mainfile(
        filepath="/Users/carlosbarcelo/projects/ski-game/barquito_mejorado_autosave_before_lamborghini.blend",
        copy=True,
    )
except Exception:
    pass

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    pass

scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.length_unit = 'MILLIMETERS'
scene.unit_settings.scale_length = 0.001
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1200
scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = OUT_PNG
scene.world.color = (0.035, 0.035, 0.045)

def mat(name, color, metallic=0.0, rough=0.35):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1.0)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    return m

YELLOW = mat('Giallo Orion', (1.0, 0.48, 0.015), 0.25, 0.22)
BLACK = mat('Carbon Black', (0.012, 0.016, 0.022), 0.6, 0.22)
TIRE = mat('Tire Rubber', (0.008, 0.009, 0.011), 0.0, 0.72)
GLASS = mat('Smoked Glass', (0.025, 0.06, 0.075), 0.25, 0.14)
LIGHT = mat('Headlamp', (0.58, 0.72, 0.88), 0.45, 0.12)
RED = mat('SV Accent', (0.55, 0.008, 0.012), 0.35, 0.28)
GOLD = mat('Wheel Center', (0.52, 0.24, 0.035), 0.82, 0.18)
BRAKE = mat('Brake Disc', (0.18, 0.19, 0.2), 0.9, 0.25)

def finish(obj, material, bevel=0.8, smooth=True):
    if material:
        obj.data.materials.append(material)
    if bevel:
        mod = obj.modifiers.new('Print-safe edge softening', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
    if smooth and hasattr(obj.data, 'polygons'):
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj

def box(name, loc, scale, material, bevel=0.8, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = (scale[0]/2, scale[1]/2, scale[2]/2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, material, bevel, False)

def cyl(name, loc, radius, depth, material, rot=(math.pi/2,0,0), vertices=48, bevel=0.45):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return finish(o, material, bevel, True)

def loft(name, sections, material, points=12, bevel=0.5):
    verts=[]
    for x,w,zc,h in sections:
        for i in range(points):
            a=2*math.pi*i/points
            y=w*math.cos(a)
            z=zc+h*math.sin(a)
            # flatter printable floor
            if z < zc-h*0.78:
                z=zc-h*0.78
            verts.append((x,y,z))
    faces=[]
    ns=len(sections)
    faces.append(tuple(range(points-1,-1,-1)))
    for s in range(ns-1):
        for i in range(points):
            j=(i+1)%points
            faces.append((s*points+i,s*points+j,(s+1)*points+j,(s+1)*points+i))
    faces.append(tuple((ns-1)*points+i for i in range(points)))
    me=bpy.data.meshes.new(name+'Mesh')
    me.from_pydata(verts,[],faces); me.update()
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o)
    return finish(o, material, bevel, True)

def prism(name, poly, z0, z1, material, bevel=0.3):
    n=len(poly)
    verts=[(x,y,z0) for x,y in poly]+[(x,y,z1) for x,y in poly]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    for i in range(n):
        j=(i+1)%n
        faces.append((i,j,n+j,n+i))
    me=bpy.data.meshes.new(name+'Mesh'); me.from_pydata(verts,[],faces); me.update()
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o)
    return finish(o,material,bevel,False)

def beam(name, a, b, radius, material):
    a,b=Vector(a),Vector(b); d=b-a
    mid=(a+b)/2
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=d.length, location=mid)
    o=bpy.context.object; o.name=name
    o.rotation_mode='QUATERNION'; o.rotation_quaternion=d.to_track_quat('Z','Y')
    return finish(o,material,0.15,True)

# Main monocoque/body: long, low and sharply tapered.
body = loft('Main watertight body', [
    (-99,18,16,7.5), (-91,34,17,10.0), (-67,41.5,18,13.0),
    (-25,42.5,19,14.0), (28,41.5,18.5,13.5), (63,38,16.5,11.5),
    (88,31,14.5,8.5), (100,12,13.0,4.8)
], YELLOW, 14, 0.75)

# Upper shoulder and hood creases.
loft('Upper shoulder', [(-75,29,26,5),(-35,35,27,7),(20,35,26,6),(55,31,23,4),(79,24,20,3)], YELLOW, 12, 0.45)
prism('Front hood center', [(27,-19),(27,19),(91,11),(96,0),(91,-11)], 23.5, 27.5, YELLOW, 0.45)
for sy in (-1,1):
    prism('Hood blade', [(30,sy*20),(51,sy*30),(87,sy*19),(91,sy*12)], 23.3, 25.0, YELLOW, 0.25)

# Cabin with sloped windshield and roof.
loft('Cabin shell', [(-51,25,31,4),(-34,29,35,8),(0,30,37,10),(28,27,34,8),(43,23,29,4)], YELLOW, 12, 0.55)
prism('Windshield', [(9,-26),(9,26),(39,21),(40,-21)], 31.5, 34.0, GLASS, 0.28)
prism('Roof glass', [(-33,-23),(-33,23),(8,26),(8,-26)], 39.5, 42.3, GLASS, 0.35)
for sy in (-1,1):
    side=sy
    prism('Side window', [(-37,side*25),(-31,side*29),(4,side*31),(9,side*27)], 31.5, 36.8, GLASS, 0.25)
    beam('A pillar', (37,side*22,31),(10,side*27,41),1.2,BLACK)
    beam('B pillar', (-32,side*24,31),(-31,side*22,40),1.4,BLACK)

# Front lighting and intakes.
for sy in (-1,1):
    prism('Angular headlamp', [(49,sy*25),(59,sy*34),(82,sy*25),(69,sy*18)], 24.0, 26.1, LIGHT, 0.22)
    prism('Front intake', [(67,sy*27),(78,sy*35),(96,sy*24),(86,sy*12)], 10.0, 15.0, BLACK, 0.35)
    box('Front canard', (87,sy*35,8.2),(25,4,2.2),BLACK,0.35,rot=(0,0,sy*math.radians(9)))

box('Front splitter',(91,0,6.0),(20,76,3.2),BLACK,0.55)
box('Front red accent',(94,0,7.7),(2.0,72,1.7),RED,0.25)

# Side sills, iconic large side intakes, mirrors.
for sy in (-1,1):
    box('Side sill',(-2,sy*40.2,7.5),(117,5.5,4.2),BLACK,0.5)
    box('Sill red stripe',(5,sy*43.0,9.0),(105,1.3,1.2),RED,0.18)
    prism('Side intake', [(-55,sy*39),(-40,sy*43),(-16,sy*43),(-24,sy*37)], 14,29,BLACK,0.5)
    # intake rim in body color
    beam('Intake leading edge',(-55,sy*39,15),(-40,sy*43,29),1.2,RED)
    # mirror arm and shell
    beam('Mirror arm',(25,sy*29,31),(29,sy*39,31),1.3,BLACK)
    box('Mirror',(30,sy*41,32),(12,6,4.2),BLACK,1.1,rot=(0,0,sy*math.radians(7)))

# Rear diffuser and SV wing.
box('Rear diffuser',(-91,0,7.2),(17,78,4.0),BLACK,0.55)
for sy in (-1,1):
    box('Wing upright',(-72,sy*25,36),(5,4,17),BLACK,0.45,rot=(0,sy*math.radians(12),0))
box('Rear wing',(-80,0,45),(25,77,4.2),BLACK,0.65,rot=(0,math.radians(-4),0))
box('Wing yellow edge',(-77.8,0,46.3),(2.0,74,1.4),YELLOW,0.2)

# Wheels, hubs, brake discs, and robust stylized spokes.
for x in (-59,59):
    for sy in (-1,1):
        y=sy*39.2
        cyl('Tire', (x,y,15.2), 15.3, 8.0, TIRE, vertices=56, bevel=0.75)
        cyl('Rim', (x,y+sy*4.2,15.2), 10.5, 1.6, BLACK, vertices=48, bevel=0.3)
        cyl('Brake disc', (x,y+sy*5.0,15.2), 7.2, 1.0, BRAKE, vertices=40, bevel=0.2)
        cyl('Center lock', (x,y+sy*5.8,15.2), 2.2, 1.5, GOLD, vertices=32, bevel=0.2)
        # spokes lie on outer wheel face in the XZ plane
        for i in range(10):
            a=2*math.pi*i/10
            p0=(x+2.2*math.cos(a), y+sy*6.0, 15.2+2.2*math.sin(a))
            p1=(x+9.2*math.cos(a+0.13), y+sy*6.0, 15.2+9.2*math.sin(a+0.13))
            beam('Wheel spoke',p0,p1,0.55,GOLD)

# Axles ensure every wheel intersects the body for a single printable assembly.
for x in (-59,59):
    cyl('Hidden axle',(x,0,15.2),3.0,79,BLACK,vertices=32,bevel=0.35)

# Rear lamps and exhaust.
for sy in (-1,1):
    prism('Rear lamp',[(-98,sy*10),(-91,sy*28),(-84,sy*25),(-91,sy*8)],18,21,RED,0.25)
cyl('Exhaust outer',(-100,0,13),5.0,3.0,BLACK,rot=(0,math.pi/2,0),vertices=40,bevel=0.25)
cyl('Exhaust inner',(-101.7,0,13),2.8,1.2,BRAKE,rot=(0,math.pi/2,0),vertices=32,bevel=0.15)

# Subtle door cut lines and engine cover ribs.
for sy in (-1,1):
    beam('Door crease',(17,sy*36,18),(-40,sy*39,18),0.55,BLACK)
for y in (-18,-9,0,9,18):
    box('Engine cover rib',(-56,y,34),(24,2.0,2.2),BLACK,0.25,rot=(0,math.radians(-7),0))

# Add a printable display plinth as a separate optional object, disabled from STL export.
box('DISPLAY_PLINTH',(0,0,-3.0),(216,98,4.0),BLACK,2.0)
plinth=bpy.context.object
plinth.hide_render=False
plinth['exclude_from_stl']=True

# Ground plane for preview only.
box('PREVIEW_GROUND',(0,0,-6),(300,220,2),mat('Ground',(0.06,0.065,0.075),0.0,0.55),1.0)
ground=bpy.context.object
ground['exclude_from_stl']=True

# Camera and studio lights.
bpy.ops.object.camera_add(location=(255,-245,150))
camera=bpy.context.object; camera.name='Presentation Camera'
scene.camera=camera
def point_camera(obj, target=(0,0,19)):
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
point_camera(camera)
camera.data.lens=58

for name,loc,energy,size,color in [
    ('Key',(80,-120,185),1500,80,(1.0,0.78,0.58)),
    ('Fill',(30,150,100),1100,70,(0.55,0.72,1.0)),
    ('Rim',(-150,-40,120),1300,55,(1.0,0.35,0.12)),
]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    l=bpy.context.object; l.name=name; l.data.energy=energy; l.data.shape='DISK'; l.data.size=size; l.data.color=color
    point_camera(l)

# Save model, export all printable mesh components (excluding plinth/preview ground), render preview.
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)

for o in bpy.context.scene.objects:
    o.select_set(False)
for o in bpy.context.scene.objects:
    if o.type=='MESH' and not o.get('exclude_from_stl',False):
        o.select_set(True)
try:
    bpy.ops.wm.stl_export(filepath=OUT_STL, export_selected_objects=True, ascii_format=False)
except Exception as exc:
    print('STL export warning:',exc)

for o in bpy.context.scene.objects:
    o.select_set(False)
body.select_set(True); bpy.context.view_layer.objects.active=body

scene.render.film_transparent=False
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print('LAMBORGHINI_MODEL_COMPLETE', OUT_BLEND, OUT_STL, OUT_PNG)
