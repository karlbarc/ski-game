import bpy, bmesh, math, json
from mathutils import Vector, Quaternion

OUT='/Users/carlosbarcelo/projects/ski-game/'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
def material(name,color):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Roughness'].default_value=.34
    return m
blue=material('Casco azul petróleo',(.018,.23,.32))
cream=material('Cabina marfil',(.86,.75,.52))
red=material('Chimenea coral',(.7,.105,.055))
dark=material('Interior ventanas',(.025,.06,.075))
def fix(o):
    bm=bmesh.new(); bm.from_mesh(o.data); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(o.data); bm.free()
def mesh(name,vs,fs,mat):
    me=bpy.data.meshes.new(name); me.from_pydata(vs,[],fs); me.update()
    o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); o.data.materials.append(mat); fix(o); return o
def bevel(o,w):
    bpy.context.view_layer.objects.active=o; o.select_set(True)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    m=o.modifiers.new('Redondeado','BEVEL'); m.width=w; m.segments=3
    bpy.ops.object.modifier_apply(modifier=m.name); o.select_set(False); return o
def box(name,loc,dim,w,mat):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.dimensions=dim; o.data.materials.append(mat); return bevel(o,w)
def cyl(name,loc,r,d,mat,rot=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=r,depth=d,location=loc,rotation=rot or (0,0,0)); o=bpy.context.object; o.name=name; o.data.materials.append(mat); return bevel(o,.35)
def boolean(o,p,operation='UNION'):
    bpy.context.view_layer.objects.active=o
    m=o.modifiers.new(operation,'BOOLEAN'); m.operation=operation; m.solver='EXACT'; m.object=p; m.material_mode='TRANSFER'
    bpy.ops.object.modifier_apply(modifier=m.name); bpy.data.objects.remove(p,do_unlink=True)
# Contorno de proa redondeada y popa ancha, interpolado con curvas cúbicas.
curves=[((55,0),(48,10),(27,22),(10,22)),((10,22),(-10,23),(-39,23),(-47,17)),((-47,17),(-52,12),(-52,-12),(-47,-17)),((-47,-17),(-39,-23),(-10,-23),(10,-22)),((10,-22),(27,-22),(48,-10),(55,0))]
outline=[]
for a,b,c,d in curves:
    for i in range(16):
        t=i/16; u=1-t
        outline.append(tuple(u**3*a[k]+3*u*u*t*b[k]+3*u*t*t*c[k]+t**3*d[k] for k in (0,1)))
n=len(outline); vs=[]
for z,s in [(0,.76),(2,.8),(15,1),(18,1)]:
    vs.extend((x*s,y*s,z) for x,y in outline)
fs=[tuple(reversed(range(n)))]
for j in range(3):
    for i in range(n): fs.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
fs.append(tuple(range(3*n,4*n)))
boat=mesh('Barquito · Remolcador',vs,fs,blue); bevel(boat,.65)
# Borda continua de 2 mm de espesor, unida a la cubierta.
vs=[]
for z,s in [(17.3,1),(20.4,1),(20.4,.90),(17.3,.90)]: vs.extend((x*s,y*s,z) for x,y in outline)
fs=[]
for j in range(4):
    for i in range(n): fs.append((j*n+i,j*n+(i+1)%n,((j+1)%4)*n+(i+1)%n,((j+1)%4)*n+i))
rim=mesh('Borda',vs,fs,blue); bevel(rim,.35); boolean(boat,rim)
cab=box('Cabina',(-9,0,28.4),(37,28,22),2,cream)
# Ventanas hundidas: sin puentes largos ni piezas sueltas.
for side in [-1,1]:
    for x in [-19,-7,5]:
        cutter=box('Ventana lateral',(x,side*14.0,31),(7,2.2,8),1.25,dark)
        boolean(cab,cutter,'DIFFERENCE')
for y in [-6.5,6.5]:
    cutter=box('Parabrisas',(9.4,y,31),(2.4,9,8),1.25,dark); boolean(cab,cutter,'DIFFERENCE')
boolean(boat,cab)
boolean(boat,box('Techo',(-9,0,40),(40,31,3.6),1.5,cream))
boolean(boat,cyl('Chimenea',(-18,0,46),4.5,12,red))
boolean(boat,cyl('Aro chimenea',(-18,0,51),5.1,2.4,dark))
boolean(boat,cyl('Boca chimenea',(-18,0,52),2.5,4,dark),'DIFFERENCE')
# Escotilla trasera y bitas robustas.
boolean(boat,box('Escotilla',(-36,0,19.1),(11,15,3.5),1.2,cream))
for x,y in [(31,-6),(31,6),(-40,-12),(-40,12)]:
    boolean(boat,cyl('Bita',(x,y,20),1.8,5,blue))
fix(boat)
bpy.ops.object.select_all(action='DESELECT'); boat.select_set(True); bpy.context.view_layer.objects.active=boat
for p in boat.data.polygons: p.use_smooth=False
scene=bpy.context.scene; scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=.001; scene.unit_settings.length_unit='MILLIMETERS'
bm=bmesh.new(); bm.from_mesh(boat.data)
bad=sum(not e.is_manifold for e in bm.edges)
seen=set(); comps=0
for v in bm.verts:
    if v in seen: continue
    comps+=1; stack=[v]; seen.add(v)
    while stack:
        a=stack.pop()
        for e in a.link_edges:
            b=e.other_vert(a)
            if b not in seen: seen.add(b); stack.append(b)
volume=bm.calc_volume(); bm.free()
assert bad==0 and comps==1 and volume>0,(bad,comps,volume)
print('VERIFICACION',json.dumps({'bordes_no_manifold':bad,'componentes':comps,'volumen_mm3':volume,'dimensiones_mm':list(boat.dimensions)}))
boat['Impresion']='STL en mm; base Z=0. Una pieza cerrada. Revisar voladizos en laminador.'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=165
            area.spaces.active.region_3d.view_location=(0,0,22)
            area.spaces.active.region_3d.view_rotation=Quaternion((.82,.36,.18,.40)).normalized()
            area.spaces.active.clip_end=2000
            area.spaces.active.shading.color_type='MATERIAL'
bpy.ops.wm.stl_export(filepath=OUT+'barquito_mejorado.stl',export_selected_objects=True,apply_modifiers=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT+'barquito_mejorado.blend')
# Vista previa del mismo modelo, materiales orientativos para pintura.
bpy.ops.object.camera_add(location=(125,-160,118)); cam=bpy.context.object; cam.data.type='ORTHO'; cam.data.ortho_scale=145; cam.data.clip_end=2000
cam.rotation_euler=(Vector((0,0,22))-cam.location).to_track_quat('-Z','Y').to_euler(); scene.camera=cam
floor=box('Suelo',(0,0,-2),(2000,2000,3),.1,material('Fondo',(.12,.16,.2)))
for loc,power,size in [((40,-80,150),190000,100),((-90,-20,100),100000,100),((30,100,100),180000,85)]:
    bpy.ops.object.light_add(type='AREA',location=loc); l=bpy.context.object; l.data.energy=power; l.data.shape='DISK'; l.data.size=size; l.rotation_euler=(Vector((0,0,20))-l.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='BLENDER_EEVEE'; scene.render.resolution_x=1100; scene.render.resolution_y=850; scene.render.resolution_percentage=100
scene.world.color=(.18,.18,.18); scene.render.image_settings.file_format='PNG'; scene.render.filepath=OUT+'barquito_mejorado.png'
bpy.ops.render.render(write_still=True)
