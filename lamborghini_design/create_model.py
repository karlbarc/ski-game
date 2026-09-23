import bpy, math, os
from mathutils import Vector
from math import sin,cos,pi
OUT=os.path.dirname(os.path.abspath(__file__))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
 if c.name!='Collection' and c.users==0: bpy.data.collections.remove(c)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
def mat(n,c,metal=0,rough=.3):
 m=bpy.data.materials.new(n); m.diffuse_color=(*c,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*c,1); p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
yellow=mat('Giallo • pintura perlada',(.95,.57,.012),.48,.24)
p=yellow.node_tree.nodes.get('Principled BSDF');p.inputs['Coat Weight'].default_value=.45;p.inputs['Coat Roughness'].default_value=.19
black=mat('Carbono satinado',(.013,.016,.019),.65,.29)
rubber=mat('Goma',(.013,.014,.016),0,.76)
glass=mat('Cristal ahumado',(.021,.042,.054),.58,.115)
chrome=mat('Aluminio oscuro',(.13,.16,.18),.85,.23)
disc=mat('Disco cerámico',(.20,.21,.23),.75,.45)
red=mat('Acento rojo SV',(.65,.018,.027),.35,.3)
gold=mat('Emblema dorado',(.7,.43,.08),.75,.25)
led=mat('LED blanco',(.8,.92,1),.3,.18);led.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(.7,.88,1,1);led.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=4
rearled=mat('LED rojo',(.7,.008,.015),.3,.2);rearled.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(1,.005,.008,1);rearled.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=2

def mesh(n,v,f,m,bevel=0):
 me=bpy.data.meshes.new(n);me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(n,me);bpy.context.collection.objects.link(o);o.data.materials.append(m)
 if bevel:
  mod=o.modifiers.new('Bordes de panel','BEVEL');mod.width=bevel;mod.segments=3
  mod=o.modifiers.new('Normales','WEIGHTED_NORMAL')
 return o
def panel(n,v,m,thick=.012,bevel=.006):
 o=mesh(n,v,[tuple(range(len(v)))],m)
 if thick:
  mod=o.modifiers.new('Espesor','SOLIDIFY');mod.thickness=thick
 if bevel:
  mod=o.modifiers.new('Bordes','BEVEL');mod.width=bevel;mod.segments=3
 return o
def box(n,loc,size,m,bev=.01):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=n;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if bev:
  mod=o.modifiers.new('Bordes','BEVEL');mod.width=bev;mod.segments=3; o.modifiers.new('Normales','WEIGHTED_NORMAL')
 return o
def cyl(n,loc,r,d,m,axis='Y',verts=64):
 rot=(pi/2,0,0) if axis=='Y' else (0,pi/2,0) if axis=='X' else (0,0,0)
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=d,location=loc,rotation=rot);o=bpy.context.object;o.name=n;o.data.materials.append(m)
 mod=o.modifiers.new('Borde mecanizado','BEVEL');mod.width=.003;mod.segments=2
 for p in o.data.polygons:p.use_smooth=True
 return o
def line(n,pts,r,m):
 cu=bpy.data.curves.new(n,'CURVE');cu.dimensions='3D';cu.resolution_u=1;cu.bevel_depth=r;cu.bevel_resolution=2;s=cu.splines.new('POLY');s.points.add(len(pts)-1)
 for p,co in zip(s.points,pts):p.co=(*co,1)
 o=bpy.data.objects.new(n,cu);bpy.context.collection.objects.link(o);o.data.materials.append(m);return o
def torus(n,loc,major,minor,m):
 bpy.ops.mesh.primitive_torus_add(major_segments=80,minor_segments=12,location=loc,rotation=(pi/2,0,0),major_radius=major,minor_radius=minor);o=bpy.context.object;o.name=n;o.data.materials.append(m)
 for p in o.data.polygons:p.use_smooth=True
 return o
# Body: perimeter sections define wedge shoulders and a flat underside.
sections=[(-2.30,.84,.70),(-2.05,.98,.83),(-1.48,1.015,.91),(-.95,.96,.87),(-.35,.91,.78),(.55,.95,.79),(1.36,1.00,.90),(1.86,.94,.72),(2.32,.83,.48)]
v=[]
for x,w,z in sections:
 v.extend([(x,-w*.90,.23),(x,-w,.40),(x,-w,z-.10),(x,-w*.76,z),(x,0,z+.025),(x,w*.76,z),(x,w,z-.10),(x,w,.40),(x,w*.90,.23)])
f=[tuple(range(8,-1,-1))]
for i in range(len(sections)-1):
 for j in range(9):f.append((i*9+j,i*9+(j+1)%9,(i+1)*9+(j+1)%9,(i+1)*9+j))
f.append(tuple(range((len(sections)-1)*9,len(sections)*9)))
body=mesh('Carrocería • pasos de rueda reales',v,f,yellow)
# Apply wheel arch subtraction before small bevel.
for x in [-1.46,1.36]:
 cutter=cyl('Cortador temporal',(x,0,.395),.446,2.6,black)
 bpy.context.view_layer.objects.active=body
 mod=body.modifiers.new('Paso de rueda','BOOLEAN');mod.operation='DIFFERENCE';mod.object=cutter
 bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
mod=body.modifiers.new('Aristas carrocería','BEVEL');mod.width=.015;mod.segments=3;body.modifiers.new('Normales','WEIGHTED_NORMAL')
# Cabin canopy, true sloping glazing and body pillars.
roof=[(-.95,-.65,1.14),(-.88,.65,1.14),(-.05,.65,1.16),(-.05,-.65,1.16)]
panel('Techo amarillo',roof,yellow,.035,.025)
wind=[(-.025,-.63,1.145),(-.025,.63,1.145),(.79,.78,.816),(.79,-.78,.816)]
panel('Parabrisas',wind,glass,.012,.01)
for s in [-1,1]:
 side=lambda ps:[(x,s*y,z) for x,y,z in ps]
 panel('Ventana lateral',side([(-.92,.675,1.12),(-.065,.675,1.135),(.66,.807,.825),(-.99,.862,.832)]),glass)
 line('Pilar A',side([(-.065,.666,1.16),(.77,.81,.805)]),.028,yellow)
 line('Marco superior',side([(-.94,.66,1.15),(-.065,.66,1.16)]),.022,yellow)
 panel('Pilar C',side([(-1.45,.90,.87),(-.93,.65,1.15),(-.83,.68,1.12),(-.98,.86,.81)]),yellow)
 line('Pilar B',side([(-.63,.68,1.115),(-.68,.852,.83)]),.022,black)
 line('Borde ventana',side([(-.98,.866,.83),(.67,.811,.819)]),.017,black)
 # tapered door crease / outline
 line('Junta puerta',side([(.64,.944,.76),(.49,.948,.36),(-.63,.93,.29),(-.83,.957,.44),(-.86,.96,.73)]),.0035,black)
 line('Pliegue puerta',side([(.63,.95,.73),(-.78,.966,.57)]),.005,yellow)
 box('Manilla',(-.61,s*.966,.76),(.16,.015,.025),black,.006)
 # angular side intake: visible deep black polygon and yellow leading blade
 pts=side([(-1.02,.992,.81),(-.77,.983,.76),(-.58,.954,.35),(-.91,1.00,.39),(-1.11,1.012,.68)])
 panel('Toma lateral negra',pts,black,.018,.008)
 line('Rojo borde toma',pts[:4],.007,red)
 for i in range(8):
  z=.43+i*.043;line('Rejilla lateral',[(-.93,s*1.016,z),(-.73-i*.017,s*.99,z)],.005,chrome)
 panel('Faldón carbono',side([(-1.02,1.025,.255),(.94,1.025,.255),(.92,.94,.18),(-1.03,.97,.18)]),black,.03)
 line('Perfil rojo faldón',side([(-1.04,1.026,.219),(.96,1.026,.219)]),.005,red)
 line('Brazo espejo',side([(.47,.84,.86),(.41,1.07,.91)]),.026,black)
 mir=box('Espejo',(.40,s*1.11,.938),(.27,.16,.092),black,.037)
 box('Cristal espejo',(.272,s*1.115,.94),(.01,.12,.051),glass,.012)
# Engine rear glass and louvered cover.
panel('Cristal motor',[(-1.75,-.61,.907),(-1.75,.61,.907),(-.96,.61,1.127),(-.96,-.61,1.127)],black)
for i in range(7):
 x=-1.70+i*.102;z=.929+i*.028
 box('Lama motor',(x,0,z),(.058,1.12,.022),black,.008)
# Hood pentagon and panel outlines.
hood=[(.86,-.52,.815),(.86,.52,.815),(1.94,.47,.636),(2.19,0,.549),(1.94,-.47,.636)]
panel('Capó central',hood,yellow,.009,.005)
line('Junta capó',hood+[hood[0]],.003,black)
for s in [-1,1]:
 # Headlamps follow sloping fender plane.
 h=[(1.34,s*.79,.873),(1.95,s*.81,.698),(2.10,s*.60,.643),(1.88,s*.55,.718)]
 panel('Faro • carcasa',h,black,.015,.009)
 center=Vector((1.82,s*.70,.742));inner=[tuple(center+(Vector(p)-center)*.88+Vector((0,0,.01))) for p in h]
 panel('Faro • lente',inner,glass,.007,.005)
 line('Luz diurna Y',[(1.47,s*.771,.848),(1.84,s*.712,.755),(2.00,s*.625,.686)],.011,led)
 line('Luz diurna bifurcación',[(1.84,s*.712,.755),(1.91,s*.786,.722)],.009,led)
 for i in range(3):
  cyl('Proyector LED',(1.84+i*.065,s*(.64+i*.018),.758-i*.019),.022,.011,chrome,'Z',24)
 # Intakes form a front-facing black angular mouth under the nose.
 intake=[(2.335,s*.10,.27),(2.337,s*.72,.24),(2.28,s*.88,.34),(2.29,s*.76,.47),(2.344,s*.25,.43)]
 panel('Toma frontal',intake,black,.025,.008)
 for row in range(4):
  for col in range(10):
   yy=s*(.24+col*.049+(row%2)*.024);zz=.285+row*.037
   if abs(yy)>.74:continue
   pts=[(2.357,yy+.026*cos(a*pi/3),zz+.020*sin(a*pi/3)) for a in range(7)]
   line('Panal frontal',pts,.0025,chrome)
 panel('Aleta frontal',[(2.39,s*.89,.19),(2.40,s*.69,.20),(2.30,s*.84,.34),(2.25,s*.96,.35)],black,.025)
 line('Acento rojo delantero',[(2.40,s*.70,.208),(2.34,s*.54,.30),(2.32,s*.72,.441)],.005,red)
# Splitter outline.
panel('Splitter delantero',[(2.45,-.90,.18),(2.50,-.48,.17),(2.5,.48,.17),(2.45,.9,.18),(2.12,.97,.18),(2.12,-.97,.18)],black,.038)
# Tiny shield bonnet emblem.
panel('Escudo',[(2.09,-.035,.59),(2.09,.035,.59),(2.155,.024,.567),(2.17,0,.56),(2.155,-.024,.567)],gold,.006,.002)
# Rear fascia and diffusers.
box('Parrilla trasera',(-2.309,0,.49),(.025,1.57,.22),black,.01)
for s in [-1,1]:
 line('Piloto trasero', [(-2.329,s*.21,.667),(-2.334,s*.73,.667)],.018,rearled)
 for j in range(3):line('Firma Y trasera',[(-2.339,s*(.25+j*.16),.68),(-2.339,s*(.30+j*.16),.63),(-2.339,s*(.35+j*.16),.68)],.008,rearled)
 cyl('Escape',(-2.39,s*.13,.355),.068,.17,chrome,'X');cyl('Escape interior',(-2.48,s*.13,.355),.052,.01,black,'X')
 box('Soporte alerón',(-1.91,s*.60,1.04),(.10,.045,.38),black,.008)
 panel('Extremo alerón',[(-2.30,s*.99,1.18),(-1.90,s*.99,1.21),(-1.90,s*.99,1.30),(-2.32,s*.99,1.28)],black,.022)
wing=box('Alerón SV',(-2.08,0,1.245),(.43,2.0,.044),black,.023);wing.rotation_euler.y=-.055
for y in [-.7,-.45,-.2,.2,.45,.7]:box('Difusor trasero',(-2.19,y,.22),(.51,.022,.17),black,.005)
# Four wheels: profiled tires, split spokes, drilled brakes, center locks.
for x in [-1.46,1.36]:
 for s in [-1,1]:
  yc=s*.949; z=.395
  # Tire lathe around Y with detailed rounded rectangular cross section.
  profile=[(-.145,.296),(-.153,.33),(-.139,.375),(-.108,.397),(-.068,.405),(.068,.405),(.108,.397),(.139,.375),(.153,.33),(.145,.296)]
  vv=[];ff=[]
  for dy,r in profile:
   for j in range(96):a=j*2*pi/96;vv.append((x+r*cos(a),yc+dy,z+r*sin(a)))
  for k in range(len(profile)):
   for j in range(96):ff.append((k*96+j,k*96+(j+1)%96,((k+1)%len(profile))*96+(j+1)%96,((k+1)%len(profile))*96+j))
  tire=mesh('Neumático deportivo',vv,ff,rubber)
  for p in tire.data.polygons:p.use_smooth=True
  for dy in [-.065,-.022,.022,.065]:torus('Canal neumático',(x,yc+dy,z),.404,.0028,black)
  outer=yc+s*.151
  torus('Labio llanta',(x,outer,z),.306,.012,chrome);torus('Aro interior',(x,outer-s*.012,z),.284,.008,black)
  cyl('Disco freno',(x,outer-s*.046,z),.249,.021,disc)
  for k in range(36):
   a=k*2*pi/36
   for r in [.195,.224]:cyl('Perforación disco',(x+r*cos(a),outer-s*.032,z+r*sin(a)),.005,.002,black,verts=8)
  box('Pinza amarilla',(x-.20,outer-s*.012,z+.03),(.075,.07,.18),yellow,.018)
  for k in range(12):
   a=k*2*pi/12
   start=(x+.065*cos(a),outer+.004*s,z+.065*sin(a))
   mid=(x+.16*cos(a+.12),outer+s*.012,z+.16*sin(a+.12))
   line('Radio forjado', [start,mid,(x+.299*cos(a+.18),outer,z+.299*sin(a+.18))],.010,black)
   line('Radio bifurcado',[mid,(x+.299*cos(a-.07),outer,z+.299*sin(a-.07))],.007,chrome)
  cyl('Buje',(x,outer+s*.013,z),.068,.036,black);cyl('Cierre central dorado',(x,outer+s*.035,z),.037,.012,gold,verts=12)
  for k in range(5):
   a=k*2*pi/5;cyl('Tornillo',(x+.051*cos(a),outer+s*.035,z+.051*sin(a)),.006,.009,chrome,verts=12)
# Studio and presentation.
floor=mat('Estudio gris',(.105,.125,.15),.18,.42)
box('Suelo',(0,0,-.055),(200,200,.1),floor,.01)
world=scene.world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs[0].default_value=(.25,.30,.4,1);world.node_tree.nodes.get('Background').inputs[1].default_value=.4

def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for n,loc,power,size,color in [('Softbox principal',(1,-4,6),1800,5,(1,.92,.80)),('Luz lateral',(-1,4,4),1500,4,(.78,.87,1)),('Contraluz',(-4,-1,4),1900,3,(1,1,1)),('Frontal',(5,1,3),900,3,(1,.95,.85))]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=n;o.data.energy=power;o.data.shape='RECTANGLE';o.data.size=size;o.data.size_y=size*.55;o.data.color=color;aim(o,(0,0,.4))
bpy.ops.object.camera_add(location=(6.6,-8.4,3.8));cam=bpy.context.object;cam.name='Cámara • tres cuartos';aim(cam,(0,0,.60));cam.data.type='PERSP';cam.data.lens=56;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(OUT,'lamborghini_preview.png')
# Store reference inside the editable file.
ref='/var/folders/7r/v3l7l6v926x5c6c4t3sn509m0000gn/T/codex-clipboard-984d0ebf-4d88-479d-a498-b86d986850bb.png'
if os.path.exists(ref):bpy.data.images.load(ref).pack()
scene['Descripción']='Modelo de interpretación visual inspirado en la fotografía del Lamborghini amarillo. Paneles, ruedas, cristales y materiales editables.'
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
for screen in bpy.data.screens:
 for area in screen.areas:
  if area.type=='VIEW_3D':
   area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'lamborghini.blend'))
bpy.ops.render.render(write_still=True)
print('MODEL_AND_RENDER_COMPLETE')
